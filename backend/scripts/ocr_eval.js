#!/usr/bin/env node
'use strict';

/**
 * OCR Accuracy Evaluation Script (Section 7.2 of OCR_IMPLEMENTATION_PLAN.md).
 *
 * Usage:
 *   node scripts/ocr_eval.js /absolute/path/to/anonymized_cards_dir
 *
 * Directory structure (stored OUTSIDE git):
 *   card_01.jpg          (or .jpeg / .png / .webp, or card_01.raw.json for offline sanitizer eval)
 *   card_01.json         (ground-truth ledger_v1 JSON for card_01)
 *
 * Security rule: Prints ONLY aggregate per-field match counts and accuracy percentages.
 * Never prints customer names, phone numbers, Aadhaar numbers, or addresses to stdout.
 */

const dns = require('dns');
const net = require('net');
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getOcrConfig } = require('../src/modules/ocr/ocr.config');
const { verifyModel, extractLedger } = require('../src/modules/ocr/gemini.service');
const { parseModelOutput, sanitizeExtraction } = require('../src/modules/ocr/ocr.sanitizer');
const { detectImageMime } = require('../src/modules/ocr/ocr.worker');
const { prepareImageDirect } = require('../src/modules/ocr/ocr.routes');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const normStr = (v) => {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
};

const normCompact = (v) => normStr(v).replace(/[\s\-.]/g, '');

const normNum = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : normStr(v);
};

const normPhones = (list) => {
  if (!Array.isArray(list)) return '';
  return list
    .map((c) => normCompact(c && (c.number || c.number_raw)))
    .filter(Boolean)
    .sort()
    .join(',');
};

const EVALUATED_FIELDS = [
  {
    key: 'customer.hplno',
    label: 'HPL Number',
    target: 90,
    get: (d) => normCompact(d?.customer?.hplno),
  },
  {
    key: 'customer.cname',
    label: 'Customer Name',
    target: 85,
    get: (d) => normStr(d?.customer?.cname),
  },
  {
    key: 'customer.cfname',
    label: 'Customer Relation (unit+name)',
    target: 85,
    get: (d) => `${normCompact(d?.customer?.cfname?.unit)}:${normStr(d?.customer?.cfname?.value)}`,
    isEmpty: (d) => !normStr(d?.customer?.cfname?.value),
  },
  {
    key: 'customer.ccontacts',
    label: 'Customer Phone Numbers',
    target: 90,
    get: (d) => normPhones(d?.customer?.ccontacts),
  },
  {
    key: 'customer.caddress.parts',
    label: 'Customer Address Parts',
    target: 80,
    get: (d) => {
      const a = d?.customer?.caddress || {};
      return [a.house_no, a.street_name, a.village, a.city, a.district, a.pincode].map(normStr).join('|');
    },
    isEmpty: (d) => {
      const a = d?.customer?.caddress || {};
      return ![a.house_no, a.street_name, a.village, a.city, a.district, a.pincode].some((x) => normStr(x));
    },
  },
  {
    key: 'vehicle.vehicleNumber',
    label: 'Vehicle Number',
    target: 90,
    get: (d) => normCompact(d?.vehicle?.vehicleNumber),
  },
  {
    key: 'vehicle.brand',
    label: 'Vehicle Brand',
    target: 85,
    get: (d) => normStr(d?.vehicle?.brand),
  },
  {
    key: 'vehicle.model_name',
    label: 'Vehicle Model',
    target: 85,
    get: (d) => normStr(d?.vehicle?.model_name),
  },
  {
    key: 'vehicle.manufacture_year',
    label: 'Vehicle Year',
    target: 85,
    get: (d) => normCompact(d?.vehicle?.manufacture_year),
  },
  {
    key: 'loan.hpAmount',
    label: 'HP Amount',
    target: 85,
    get: (d) => normNum(d?.loan?.hpAmount),
  },
  {
    key: 'loan.dueAmount',
    label: 'Due Amount',
    target: 85,
    get: (d) => normNum(d?.loan?.dueAmount),
  },
  {
    key: 'loan.dueMonth',
    label: 'Due Months',
    target: 85,
    get: (d) => normNum(d?.loan?.dueMonth),
  },
  {
    key: 'loan.hpDate',
    label: 'HP Date',
    target: 85,
    get: (d) => normCompact(d?.loan?.hpDate),
  },
  {
    key: 'loan.due_date',
    label: 'Due Date',
    target: 85,
    get: (d) => normCompact(d?.loan?.due_date),
  },
  {
    key: 'guardian.gname',
    label: 'Guardian Name',
    target: 85,
    get: (d) => normStr(d?.guardian?.gname),
  },
  {
    key: 'guardian.gcontacts',
    label: 'Guardian Phone Numbers',
    target: 90,
    get: (d) => normPhones(d?.guardian?.gcontacts),
  },
];

const findCases = (dir) => {
  const entries = fs.readdirSync(dir);
  const gtFiles = entries.filter((f) => f.endsWith('.json') && !f.endsWith('.raw.json')).sort();
  const cases = [];

  for (const gtFile of gtFiles) {
    const base = gtFile.slice(0, -'.json'.length);
    const gtPath = path.join(dir, gtFile);
    const rawJsonPath = path.join(dir, `${base}.raw.json`);
    let imagePath = null;
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(candidate)) {
        imagePath = candidate;
        break;
      }
    }
    if (imagePath || fs.existsSync(rawJsonPath)) {
      cases.push({
        id: base,
        gtPath,
        imagePath,
        rawJsonPath: fs.existsSync(rawJsonPath) ? rawJsonPath : null,
      });
    }
  }
  return cases;
};

const run = async () => {
  const targetDir = process.argv[2];
  if (!targetDir || !fs.existsSync(targetDir)) {
    console.error('Usage: node scripts/ocr_eval.js /path/to/labelled_cards_folder');
    console.error('Each card requires <name>.json (ground truth) and <name>.(jpg|png|webp) or <name>.raw.json.');
    process.exit(1);
  }

  const cases = findCases(targetDir);
  if (cases.length === 0) {
    console.error(`No matching (<name>.json + image/raw.json) pairs found in ${targetDir}`);
    process.exit(1);
  }

  const cfg = getOcrConfig();
  const needsLiveModel = cases.some((c) => !c.rawJsonPath && c.imagePath);
  if (needsLiveModel) {
    const st = await verifyModel();
    if (st.state === 'missing') {
      console.error(`Gemini model verification failed (state: ${st.state}). Cannot run live image extraction.`);
      process.exit(2);
    }
  }

  const stats = {};
  for (const f of EVALUATED_FIELDS) {
    stats[f.key] = { label: f.label, target: f.target, total: 0, matched: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const item of cases) {
    try {
      const gtRaw = JSON.parse(fs.readFileSync(item.gtPath, 'utf8'));
      const groundTruth = sanitizeExtraction(gtRaw);
      let predicted;

      if (item.rawJsonPath) {
        const rawText = fs.readFileSync(item.rawJsonPath, 'utf8');
        const parsed = parseModelOutput(rawText);
        predicted = sanitizeExtraction(parsed);
      } else {
        const rawBuf = fs.readFileSync(item.imagePath);
        const mime = detectImageMime(rawBuf);
        if (!mime) throw new Error('INVALID_IMAGE');
        const pre = await prepareImageDirect(rawBuf, mime, cfg.imageMaxEdgePx);
        const res = await extractLedger({ imageBase64: pre.data.toString('base64'), mimeType: pre.mimeType });
        const parsed = parseModelOutput(res.text);
        predicted = sanitizeExtraction(parsed);
      }

      for (const f of EVALUATED_FIELDS) {
        const gtEmpty = f.isEmpty ? f.isEmpty(groundTruth) : !f.get(groundTruth);
        if (gtEmpty) continue; // Only score fields present in ground truth
        stats[f.key].total += 1;
        if (f.get(predicted) === f.get(groundTruth)) {
          stats[f.key].matched += 1;
        }
      }
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(`Case ${item.id} failed: ${err.code || err.message}`);
    }
  }

  console.log(`\nOCR Accuracy Evaluation Summary (cards processed: ${processed}/${cases.length}, failed: ${failed})`);
  console.log('--------------------------------------------------------------------------------');
  console.log(`${'Field'.padEnd(32)} | ${'Matched'.padStart(9)} | ${'Accuracy'.padStart(9)} | ${'Target'.padStart(8)} | Status`);
  console.log('--------------------------------------------------------------------------------');

  let belowTarget = 0;
  for (const f of EVALUATED_FIELDS) {
    const s = stats[f.key];
    const pct = s.total > 0 ? (s.matched / s.total) * 100 : null;
    const pctStr = pct !== null ? `${pct.toFixed(1)}%` : 'N/A';
    const pass = pct === null || pct >= s.target;
    if (!pass) belowTarget += 1;
    const statusStr = pct === null ? 'SKIP' : pass ? 'PASS' : 'BELOW TARGET';
    console.log(
      `${s.label.padEnd(32)} | ${`${s.matched}/${s.total}`.padStart(9)} | ${pctStr.padStart(9)} | ${`>=${s.target}%`.padStart(8)} | ${statusStr}`
    );
  }
  console.log('--------------------------------------------------------------------------------');
  if (belowTarget > 0) {
    console.log(`Result: ${belowTarget} field(s) below rollout gate target.`);
    process.exitCode = 1;
  } else {
    console.log('Result: All evaluated fields meet or exceed target accuracy.');
  }
};

if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal evaluation error:', err.message);
    process.exit(1);
  });
}

module.exports = { EVALUATED_FIELDS, findCases };
