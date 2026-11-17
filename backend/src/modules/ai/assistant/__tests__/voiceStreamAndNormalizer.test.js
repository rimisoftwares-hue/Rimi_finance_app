'use strict';

/**
 * Phase 1 & Phase 2 Unit Test Suite (`voiceStreamAndNormalizer.test.js`).
 *
 * Strictly synthetic fixtures — ZERO customer PII, ZERO live credentials.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_PACE,
  validateAndResolveTtsConfig,
  buildAssistantConfig,
} = require('../config/assistant.config');
const {
  resolveTtsTargetLanguage,
  createPcm16StreamAssembler,
  createStreamingTtsTurn,
  synthesizeSpeechBuffer,
  setConvertStreamImplForTest,
} = require('../providers/sarvamTts.provider');
const { sanitizeForTts } = require('../services/ttsSanitizer');

/**
 * Helper: builds a 44-byte streaming WAV header matching Sarvam `convertStream` (`0xFFFFFFFF` sizes)
 * followed by optional PCM payload bytes.
 */
function makeStreamingWavHeader(sampleRate = 24000) {
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0, 'ascii');
  hdr.writeUInt32LE(0xffffffff, 4);
  hdr.write('WAVE', 8, 'ascii');
  hdr.write('fmt ', 12, 'ascii');
  hdr.writeUInt32LE(16, 16); // fmt chunk size
  hdr.writeUInt16LE(1, 20); // PCM = 1
  hdr.writeUInt16LE(1, 22); // mono = 1
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * 2, 28); // byteRate
  hdr.writeUInt16LE(2, 32); // blockAlign
  hdr.writeUInt16LE(16, 34); // bitsPerSample
  hdr.write('data', 36, 'ascii');
  hdr.writeUInt32LE(0xffffffff, 40);
  return hdr;
}

function makeSyntheticPcm16Samples(sampleValues) {
  const buf = Buffer.alloc(sampleValues.length * 2);
  for (let i = 0; i < sampleValues.length; i += 1) {
    buf.writeInt16LE(sampleValues[i], i * 2);
  }
  return buf;
}

function makeBinaryResponseFromChunks(chunks, { delayMs = 0, signal } = {}) {
  return {
    stream() {
      return (async function* () {
        for (const c of chunks) {
          if (signal?.aborted) {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
          if (signal?.aborted) {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          yield c;
        }
      })();
    },
  };
}

test('Phase 1.1: assistant.config.js sets single voice to bulbul:v4-flash + aarti_hi_customer (pace=1, 24kHz) and ignores legacy env vars', () => {
  assert.equal(DEFAULT_TTS_MODEL, 'bulbul:v4-flash');
  assert.equal(DEFAULT_TTS_VOICE, 'aarti_hi_customer');
  assert.equal(DEFAULT_TTS_PACE, 1);

  const warnings = [];
  const logger = { warn: (m) => warnings.push(m) };

  const cfgDefault = buildAssistantConfig(
    {
      SARVAM_TTS_MODEL: 'bulbul:v2',
      SARVAM_TTS_VOICE_TA: 'meera',
      SARVAM_TTS_VOICE_DEFAULT: 'arvind',
      SARVAM_STT_MODEL: 'saaras:v1',
      SARVAM_API_KEY: 'sk_synthetic_key_for_unit_test_only',
      GEMINI_API_KEY: 'AIzaSyntheticUnitTestKey00000000000000',
    },
    { logger }
  );

  assert.equal(cfgDefault.ttsModel, 'bulbul:v4-flash');
  assert.equal(cfgDefault.ttsVoice, 'aarti_hi_customer');
  assert.equal(cfgDefault.ttsPace, 1);
  assert.equal(cfgDefault.ttsSampleRate, 24000);
  assert.equal(warnings.length, 0);

  // Invalid speaker on bulbul:v4-flash warns and falls back to aarti_hi_customer
  const badV4 = validateAndResolveTtsConfig('bulbul:v4-flash', 'priya', logger);
  assert.deepEqual(badV4, {
    ttsModel: 'bulbul:v4-flash',
    ttsVoice: 'aarti_hi_customer',
    fellBack: true,
  });
  assert.ok(warnings.length >= 1);

  // Valid v4 speaker override works
  const customV4 = validateAndResolveTtsConfig('bulbul:v4-flash', 'simran_en_conversation', logger);
  assert.deepEqual(customV4, {
    ttsModel: 'bulbul:v4-flash',
    ttsVoice: 'simran_en_conversation',
    fellBack: false,
  });
});

test('Phase 1.2a: createPcm16StreamAssembler strips split/44-byte RIFF header once and enforces even PCM16 chunks across odd TCP reads', () => {
  assert.equal(typeof createPcm16StreamAssembler, 'function');
  const assembler = createPcm16StreamAssembler({ defaultSampleRate: 24000 });

  const header = makeStreamingWavHeader(24000);
  // Total PCM = 4000 samples = 8000 bytes, split across odd TCP chunks:
  // chunk0: first 20 bytes of RIFF header (split header!)
  // chunk1: remaining 24 bytes of RIFF header + 751 bytes PCM (odd!)
  // chunk2: 7231 bytes PCM (751 + 7231 = 7982, even!)
  // chunk3: 18 bytes tail PCM (total = 8000 bytes)
  const expectedSamples = Array.from({ length: 4000 }, (_, idx) => ((idx * 37) % 20000) - 10000);
  const fullPcm = makeSyntheticPcm16Samples(expectedSamples);

  const rawChunks = [
    header.subarray(0, 20),
    Buffer.concat([header.subarray(20, 44), fullPcm.subarray(0, 751)]),
    fullPcm.subarray(751, 751 + 7231),
    fullPcm.subarray(751 + 7231),
  ];

  const emitted = [];
  for (const rc of rawChunks) {
    const out = assembler.push(rc);
    if (out) {
      assert.ok(out.pcmBuffer.length > 0, 'Emitted PCM chunk must be non-empty');
      assert.equal(out.pcmBuffer.length % 2, 0, 'Emitted PCM chunk must have even byte length');
      assert.equal(out.sampleRate, 24000);
      emitted.push(out.pcmBuffer);
    }
  }
  const tail = assembler.flush();
  if (tail) {
    assert.equal(tail.pcmBuffer.length % 2, 0);
    emitted.push(tail.pcmBuffer);
  }

  const reconstructed = Buffer.concat(emitted);
  assert.equal(reconstructed.length, fullPcm.length);
  assert.deepEqual(reconstructed, fullPcm);
});

test('Phase 1.2b: createStreamingTtsTurn prefetches max 2 clauses in flight via convertStream and emits strictly in seq order', async (t) => {
  t.after(() => setConvertStreamImplForTest(null));

  let activeInFlight = 0;
  let maxObservedInFlight = 0;
  const callOrder = [];

  // Clause 0 takes 50ms per chunk (slow), Clause 1 takes 5ms (fast, finishes first!), Clause 2 takes 5ms
  const hdr = makeStreamingWavHeader(24000);
  const pcmClause0A = makeSyntheticPcm16Samples([101, 102, 103]);
  const pcmClause0B = makeSyntheticPcm16Samples([104, 105, 106]);
  const pcmClause1 = makeSyntheticPcm16Samples([201, 202, 203]);
  const pcmClause2 = makeSyntheticPcm16Samples([301, 302, 303]);

  setConvertStreamImplForTest(async (req, opts) => {
    assert.equal(req.model, 'bulbul:v4-flash');
    assert.equal(req.speaker, 'aarti_hi_customer');
    assert.equal(req.pace, 1);
    assert.equal(req.speech_sample_rate, 24000);
    assert.equal(req.target_language_code, 'ta-IN');

    const idx = callOrder.length;
    callOrder.push(req.text);
    activeInFlight += 1;
    maxObservedInFlight = Math.max(maxObservedInFlight, activeInFlight);

    if (idx === 0) {
      return {
        stream() {
          return (async function* () {
            try {
              // Header-only first chunk, then odd split PCM chunks!
              yield hdr;
              await new Promise((r) => setTimeout(r, 40));
              yield Buffer.concat([pcmClause0A, pcmClause0B.subarray(0, 1)]); // 7 bytes (odd)
              await new Promise((r) => setTimeout(r, 40));
              yield pcmClause0B.subarray(1); // 5 bytes (odd, completes 12 bytes)
            } finally {
              activeInFlight -= 1;
            }
          })();
        },
      };
    }

    const payload = idx === 1 ? pcmClause1 : pcmClause2;
    return {
      stream() {
        return (async function* () {
          try {
            await new Promise((r) => setTimeout(r, 5));
            yield Buffer.concat([hdr, payload]);
          } finally {
            activeInFlight -= 1;
          }
        })();
      },
    };
  });

  const receivedChunks = [];
  const turn = createStreamingTtsTurn({
    languageCode: 'ta-IN',
    onAudioChunk: (chunk) => {
      receivedChunks.push(chunk);
    },
  });

  turn.pushClause('வணக்கம் சார்.');
  turn.pushClause('உங்கள் வண்டி விவரம் இதோ.');
  turn.pushClause('நன்றி.');
  await turn.finish();

  assert.ok(maxObservedInFlight <= 2, `Expected max 2 in-flight streams, got ${maxObservedInFlight}`);
  assert.equal(callOrder.length, 3);

  // Verify strict seq 0, 1, 2, 3 and exact sample ordering: Clause 0 samples MUST precede Clause 1 & Clause 2!
  assert.deepEqual(
    receivedChunks.map((c) => c.seq),
    receivedChunks.map((_, i) => i)
  );
  for (const c of receivedChunks) {
    assert.equal(c.mimeType, 'audio/pcm');
    assert.equal(c.sampleRate, 24000);
    const raw = Buffer.from(c.audioBase64, 'base64');
    assert.ok(raw.length > 0 && raw.length % 2 === 0);
  }

  const allPcm = Buffer.concat(receivedChunks.map((c) => Buffer.from(c.audioBase64, 'base64')));
  const allSamples = [];
  for (let i = 0; i < allPcm.length; i += 2) {
    allSamples.push(allPcm.readInt16LE(i));
  }
  assert.deepEqual(allSamples, [101, 102, 103, 104, 105, 106, 201, 202, 203, 301, 302, 303]);
});

test('Phase 1.2c: AbortSignal barge-in cancels in-flight convertStream immediately and emits zero chunks afterwards', async (t) => {
  t.after(() => setConvertStreamImplForTest(null));

  const hdr = makeStreamingWavHeader(24000);
  const pcm1 = makeSyntheticPcm16Samples([11, 22, 33, 44]);
  const pcm2 = makeSyntheticPcm16Samples([55, 66, 77, 88]);

  let streamAbortedObserved = false;
  const ctrl = new AbortController();
  const emittedAfterAbort = [];
  let emittedBeforeAbort = 0;

  setConvertStreamImplForTest(async (_req, opts) => ({
    stream() {
      return (async function* () {
        opts?.abortSignal?.addEventListener('abort', () => {
          streamAbortedObserved = true;
        });
        yield Buffer.concat([hdr, pcm1]);
        await new Promise((r) => setTimeout(r, 80));
        if (opts?.abortSignal?.aborted) return;
        yield pcm2;
      })();
    },
  }));

  const turn = createStreamingTtsTurn({
    languageCode: 'en-IN',
    signal: ctrl.signal,
    onAudioChunk: (chunk) => {
      if (ctrl.signal.aborted) {
        emittedAfterAbort.push(chunk);
      } else {
        emittedBeforeAbort += 1;
        // Barge-in right after first chunk!
        ctrl.abort();
      }
    },
  });

  turn.pushClause('First sentence before barge in.');
  turn.pushClause('Second sentence that must never play.');
  await turn.finish();

  assert.equal(emittedBeforeAbort, 1);
  assert.equal(emittedAfterAbort.length, 0);
  assert.equal(streamAbortedObserved, true);
});

test('Phase 1.2d: Transient failure retries once and succeeds; persistent failure emits redacted error and never hangs', async (t) => {
  t.after(() => setConvertStreamImplForTest(null));

  const hdr = makeStreamingWavHeader(24000);
  const pcmOk = makeSyntheticPcm16Samples([500, 600]);

  let attempts = 0;
  setConvertStreamImplForTest(async () => {
    attempts += 1;
    if (attempts === 1) {
      const netErr = new Error('ECONNRESET socket hang up');
      netErr.statusCode = 503;
      throw netErr;
    }
    return makeBinaryResponseFromChunks([Buffer.concat([hdr, pcmOk])]);
  });

  const chunks = [];
  const turnOk = createStreamingTtsTurn({
    languageCode: 'hi-IN',
    onAudioChunk: (c) => chunks.push(c),
  });
  turnOk.pushClause('नमस्ते जी।');
  await turnOk.finish();

  assert.equal(attempts, 2, 'Should retry once after transient failure');
  assert.equal(chunks.length, 1);

  // Persistent 502 network failure containing Bearer token -> retries once (2 attempts), redacts secret, emits SARVAM_TTS_NETWORK
  const fakeSecret = 'sk_live_SUPER_SECRET_SARVAM_KEY_999999';
  let capturedError = null;
  let netFailAttempts = 0;
  setConvertStreamImplForTest(async () => {
    netFailAttempts += 1;
    const err = new Error(`Upstream gateway timeout Bearer ${fakeSecret} raw ${fakeSecret}`);
    err.statusCode = 502;
    throw err;
  });

  const turnFail = createStreamingTtsTurn({
    languageCode: 'en-IN',
    onError: (err) => {
      capturedError = err;
    },
  });
  turnFail.pushClause('Hello there.');
  await turnFail.finish();

  assert.equal(netFailAttempts, 2);
  assert.ok(capturedError, 'Expected onError to receive classified TTS error');
  assert.equal(capturedError.code, 'SARVAM_TTS_NETWORK');
  assert.ok(!capturedError.message.includes(fakeSecret), 'API key must be redacted from message');
  assert.ok(!String(capturedError.detail || '').includes(fakeSecret), 'API key must be redacted from detail');

  // Non-retryable 401 auth failure -> fails fast in 1 attempt, redacts api_subscription_key, emits SARVAM_TTS_AUTH
  let authAttempts = 0;
  let authError = null;
  setConvertStreamImplForTest(async () => {
    authAttempts += 1;
    const err = new Error(`Unauthorized api_subscription_key=${fakeSecret}`);
    err.statusCode = 401;
    throw err;
  });

  const turnAuthFail = createStreamingTtsTurn({
    languageCode: 'en-IN',
    onError: (err) => {
      authError = err;
    },
  });
  turnAuthFail.pushClause('Auth test.');
  await turnAuthFail.finish();

  assert.equal(authAttempts, 1);
  assert.equal(authError?.code, 'SARVAM_TTS_AUTH');
  assert.ok(!String(authError?.detail || '').includes(fakeSecret));
});

test('Phase 1.2e: synthesizeSpeechBuffer uses convertStream and builds valid 44-byte WAV header with exact PCM sizes', async (t) => {
  t.after(() => setConvertStreamImplForTest(null));

  const hdr = makeStreamingWavHeader(24000);
  const samples = Array.from({ length: 500 }, (_, i) => i * 10);
  const pcm = makeSyntheticPcm16Samples(samples); // 1000 bytes

  // Yield split odd chunks: 44B hdr + 333B, then 667B
  setConvertStreamImplForTest(async () =>
    makeBinaryResponseFromChunks([
      Buffer.concat([hdr, pcm.subarray(0, 333)]),
      pcm.subarray(333),
    ])
  );

  const out = await synthesizeSpeechBuffer({
    text: 'Customer HPL 3 vehicle TN 39 AB 1234.',
    languageCode: 'en-IN',
  });

  assert.ok(out && Buffer.isBuffer(out.audioBuffer));
  assert.equal(out.mimeType, 'audio/wav');
  assert.equal(out.sampleRate, 24000);
  assert.equal(out.audioBuffer.length, 44 + pcm.length);
  assert.equal(out.audioBuffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(out.audioBuffer.readUInt32LE(4), 36 + pcm.length);
  assert.equal(out.audioBuffer.toString('ascii', 8, 12), 'WAVE');
  assert.equal(out.audioBuffer.readUInt32LE(40), pcm.length);
  assert.deepEqual(out.audioBuffer.subarray(44), pcm);

  // Unsupported language fallback checks
  const logLines = [];
  const fallbackLang = resolveTtsTargetLanguage('fr-FR', 'Bonjour monsieur', {
    logger: { info: (m) => logLines.push(m) },
  });
  assert.equal(fallbackLang, 'en-IN');
  assert.ok(logLines.length >= 1);

  const skippedLang = resolveTtsTargetLanguage('ja-JP', 'こんにちは', {
    logger: { info: (m) => logLines.push(m) },
  });
  assert.equal(skippedLang, null);
});

test('Phase 1.3: ttsSanitizer formats Indian vehicle plates letter-by-letter, HPL as plain numbers, and keeps display text untouched', () => {
  const displayUiText = 'Customer HPL #3 — Vehicle TN 39 AB 1234, balance ₹12,500.';
  const spokenEn = sanitizeForTts(displayUiText, 'en-IN');

  // Original UI string is unchanged
  assert.equal(displayUiText, 'Customer HPL #3 — Vehicle TN 39 AB 1234, balance ₹12,500.');

  assert.match(spokenEn, /H P L 3\b/);
  assert.match(spokenEn, /T N 39 A B 1234/);
  assert.match(spokenEn, /12,500 rupees/);

  // Compact plate without spaces
  assert.match(sanitizeForTts('வண்டி TN39AB1234 பாக்கி ₹4,500', 'ta-IN'), /T N 39 A B 1234/);
  assert.match(sanitizeForTts('வண்டி TN39AB1234 பாக்கி ₹4,500', 'ta-IN'), /ரூபாய் 4,500/);

  // Leading-zero district & serial plate
  assert.match(sanitizeForTts('Plate TN-09-A-0005 active', 'en-IN'), /T N 0 9 A 0 0 0 5/);

  // Bharat (BH) series plate
  assert.match(sanitizeForTts('Reg 22 BH 1234 AA verified', 'en-IN'), /22 B H 1234 A A/);

  // Himachal Pradesh plate `HP 12 AB 3456` must format as plate, NOT HPL!
  assert.match(sanitizeForTts('Vehicle HP 12 AB 3456 active', 'en-IN'), /H P 12 A B 3456/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: Entity Normalizer Unit Tests (Synthetic Fixtures ONLY — Zero Real PII)
// ═══════════════════════════════════════════════════════════════════════════════

test('Phase 2.1: Unicode digits across all Indic scripts & spoken numbers (Tamil, English, Hindi, basic Indic)', () => {
  const {
    normalizeUnicodeDigits,
    parseSpokenNumberValue,
  } = require('../services/entityNormalizer.service');

  // All Indic scripts + Arabic-Indic digits -> ASCII
  assert.equal(normalizeUnicodeDigits('தமிழ் ௩௨, देवनागरी ३९, മലയാളം ൧൨, తెలుగు ౪౫, ಕನ್ನಡ ೬೭, বাংলা ৮৯, ગુજરાતી ૧૦, ਗੁਰਮੁਖੀ ੫, ଓଡ଼ିଆ ୭, Arabic ٣'),
    'தமிழ் 32, देवनागरी 39, മലയാളം 12, తెలుగు 45, ಕನ್ನಡ 67, বাংলা 89, ગુજરાતી 10, ਗੁਰਮੁਖੀ 5, ଓଡ଼ିଆ 7, Arabic 3'
  );

  // Tamil colloquial + formal cardinals, ordinals, compounds, hundreds, thousands
  assert.equal(parseSpokenNumberValue('ஒண்ணு'), 1);
  assert.equal(parseSpokenNumberValue('முதலாவது'), 1);
  assert.equal(parseSpokenNumberValue('ரெண்டு'), 2);
  assert.equal(parseSpokenNumberValue('மூணு'), 3);
  assert.equal(parseSpokenNumberValue('மூன்று'), 3);
  assert.equal(parseSpokenNumberValue('மூணாவது'), 3);
  assert.equal(parseSpokenNumberValue('மூன்றாவது'), 3);
  assert.equal(parseSpokenNumberValue('moonavathu'), 3);
  assert.equal(parseSpokenNumberValue('moonu'), 3);
  assert.equal(parseSpokenNumberValue('முப்பத்தி ஒன்பது'), 39);
  assert.equal(parseSpokenNumberValue('முப்பத்தொன்பது'), 39);
  assert.equal(parseSpokenNumberValue('நூத்தி ரெண்டு'), 102);
  assert.equal(parseSpokenNumberValue('நூற்றி இரண்டு'), 102);
  assert.equal(parseSpokenNumberValue('ஆயிரத்தி இருநூத்தி முப்பத்தி நாலு'), 1234);

  // English cardinals, ordinals, compounds
  assert.equal(parseSpokenNumberValue('third'), 3);
  assert.equal(parseSpokenNumberValue('thirty nine'), 39);
  assert.equal(parseSpokenNumberValue('one hundred and two'), 102);
  assert.equal(parseSpokenNumberValue('four hundred twenty'), 420);

  // Hindi cardinals & ordinals
  assert.equal(parseSpokenNumberValue('पहला'), 1);
  assert.equal(parseSpokenNumberValue('तीन'), 3);
  assert.equal(parseSpokenNumberValue('तीसरा'), 3);
  assert.equal(parseSpokenNumberValue('उनतालीस'), 39);
  assert.equal(parseSpokenNumberValue('एक सौ दो'), 102);

  // Basic 1-10 best-effort for Malayalam, Telugu, Kannada, Bengali, Gujarati, Punjabi, Odia
  assert.equal(parseSpokenNumberValue('മൂന്ന്'), 3);
  assert.equal(parseSpokenNumberValue('మూడు'), 3);
  assert.equal(parseSpokenNumberValue('ಮೂರು'), 3);
  assert.equal(parseSpokenNumberValue('তিন'), 3);
  assert.equal(parseSpokenNumberValue('ત્રણ'), 3);
  assert.equal(parseSpokenNumberValue('ਤਿੰਨ'), 3);
  assert.equal(parseSpokenNumberValue('ତିନି'), 3);
});

test('Phase 2.2: HPL cue rule vs list-position ordinals vs ambiguous ordinals + strict negative cases', () => {
  const { extractTurnEntities } = require('../services/entityNormalizer.service');

  // Exact owner bug cases -> hplno = 3 (high confidence)
  const c1 = extractTurnEntities('HP நம்பர் மூணாவது நம்பர் கஸ்டமர் யாரு?');
  assert.equal(c1.hplno, 3);
  assert.equal(c1.hplConfidence, 'high');
  assert.equal(c1.ambiguous, false);

  const c2 = extractTurnEntities('HP number moonavathu number customer');
  assert.equal(c2.hplno, 3);
  assert.equal(c2.hplConfidence, 'high');

  const c3 = extractTurnEntities('ஹெச்பி நம்பர் மூணு கஸ்டமர் பாக்கி எவ்வளவு?');
  assert.equal(c3.hplno, 3);
  assert.equal(c3.hplConfidence, 'high');

  const c4 = extractTurnEntities('மூணாவது நம்பர் கஸ்டமர் விவரம் சொல்லு');
  assert.equal(c4.hplno, 3);
  assert.equal(c4.hplConfidence, 'high');

  const c5 = extractTurnEntities('customer number 3 pending amount');
  assert.equal(c5.hplno, 3);
  assert.equal(c5.hplConfidence, 'high');

  const c6 = extractTurnEntities('HPL एक सौ दो का बैलेंस बताओ');
  assert.equal(c6.hplno, 102);
  assert.equal(c6.hplConfidence, 'high');

  // List-position reference when assistant just showed a list
  const listContext = {
    previousTurnHadList: true,
    previousListItems: [
      { hplno: 11, customerName: 'Synthetic One' },
      { hplno: 25, customerName: 'Synthetic Two' },
      { hplno: 48, customerName: 'Synthetic Three' },
    ],
  };

  const listRefEn = extractTurnEntities('Tell me about the third one', listContext);
  assert.equal(listRefEn.hplno, null);
  assert.equal(listRefEn.listPosition, 3);
  assert.deepEqual(listRefEn.resolvedListItem, { hplno: 48, customerName: 'Synthetic Three' });

  const listRefTa = extractTurnEntities('அதில் மூணாவது ஆள் யாரு?', listContext);
  assert.equal(listRefTa.hplno, null);
  assert.equal(listRefTa.listPosition, 3);

  // Genuinely ambiguous ordinal after a list ("மூணாவது கஸ்டமர்" / "third customer" without "HP"/"நம்பர்" or "அதில்"/"one")
  const amb = extractTurnEntities('மூணாவது கஸ்டமர் பத்தி சொல்லு', listContext);
  assert.equal(amb.hplno, null);
  assert.equal(amb.ambiguous, true);
  assert.equal(amb.candidateNumber, 3);

  // Even when a list was just shown, explicit "HP நம்பர் மூணு" is UNAMBIGUOUSLY hplno = 3!
  const explicitAfterList = extractTurnEntities('HP நம்பர் மூணாவது நம்பர் கஸ்டமர்', listContext);
  assert.equal(explicitAfterList.hplno, 3);
  assert.equal(explicitAfterList.ambiguous, false);

  // NEGATIVE CASES: amounts, durations, dates MUST NOT extract hplno, plate, or phone!
  for (const neg of [
    '1234 rupees',
    '₹1234 வந்திருக்கு',
    'ரெண்டு நாள் லேட்',
    'மூணு மாசம் பெண்டிங்',
    '2026-03-15 அன்னைக்கு கலெக்ஷன் எவ்வளவு',
    '1234',
  ]) {
    const res = extractTurnEntities(neg);
    assert.equal(res.hplno, null, `Expected hplno=null for "${neg}"`);
    assert.equal(res.vehiclePlate, null, `Expected vehiclePlate=null for "${neg}"`);
    assert.equal(res.phone, null, `Expected phone=null for "${neg}"`);
  }
});

test('Phase 2.3 & 2.4: Indian RTO & BH-series vehicle plates (Latin, Tamil letters, spoken numbers, leading zeros, last-4) + Phone cues', () => {
  const { extractTurnEntities, parseVehiclePlate } = require('../services/entityNormalizer.service');

  // Standard RTO formats with spaces, hyphens, lowercase, single/multi series letters
  const p1 = parseVehiclePlate('tn 39 ab 1234');
  assert.equal(p1.normalized, 'TN39AB1234');
  assert.equal(p1.display, 'TN 39 AB 1234');
  assert.equal(p1.confidence, 'high');
  assert.ok(p1.variants.includes('TN39AB1234'));

  const p2 = parseVehiclePlate('TN-39-A-1234');
  assert.equal(p2.normalized, 'TN39A1234');
  assert.equal(p2.display, 'TN 39 A 1234');

  // Leading-zero RTO variants (`TN09A0005` <-> `TN9A5`)
  const pZero = parseVehiclePlate('TN 9 A 5');
  assert.ok(pZero.variants.includes('TN09A0005'));
  assert.ok(pZero.variants.includes('TN9A5'));

  const pZeroPadded = parseVehiclePlate('TN09A0005');
  assert.ok(pZeroPadded.variants.includes('TN09A0005'));
  assert.ok(pZeroPadded.variants.includes('TN9A5'));

  // Bharat series (`NN BH NNNN LL`)
  const pBh = parseVehiclePlate('22 bh 1234 aa');
  assert.equal(pBh.normalized, '22BH1234AA');
  assert.equal(pBh.display, '22 BH 1234 AA');
  assert.equal(pBh.confidence, 'high');

  // Spoken Tamil letters + spoken Tamil numbers: "டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு"
  const spokenTa = extractTurnEntities('டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு வண்டி யாருது?');
  assert.ok(spokenTa.vehiclePlate, 'Should parse spoken Tamil vehicle plate');
  assert.equal(spokenTa.vehiclePlate.normalized, 'TN39AB1234');
  assert.equal(spokenTa.vehiclePlate.display, 'TN 39 AB 1234');
  assert.equal(spokenTa.vehiclePlate.confidence, 'high');

  // Spaced English letters from STT: "T N 39 A B 1234"
  const spacedEn = extractTurnEntities('Check vehicle T N 39 A B 1234 status');
  assert.equal(spacedEn.vehiclePlate?.normalized, 'TN39AB1234');

  // Last-4 digits WITH vehicle cue -> `{ last4: '1234' }`
  const last4Ta = extractTurnEntities('வண்டி நம்பர் 1234 யாருடையது?');
  assert.equal(last4Ta.vehiclePlate?.last4, '1234');
  assert.equal(last4Ta.vehiclePlate?.normalized, null);
  assert.equal(last4Ta.vehiclePlate?.confidence, 'high');

  const last4SpokenTa = extractTurnEntities('வண்டி நம்பர் ஒண்ணு ரெண்டு மூணு நாலு');
  assert.equal(last4SpokenTa.vehiclePlate?.last4, '1234');

  // Bare 4 digits WITHOUT vehicle cue -> MUST NOT be treated as a plate!
  const noCue = extractTurnEntities('1234 எவ்வளவு');
  assert.equal(noCue.vehiclePlate, null);

  // Phone number WITH explicit phone/mobile cue (synthetic numbers only)
  const phoneFull = extractTurnEntities('கஸ்டமர் போன் நம்பர் 9000012345 யாரு?');
  assert.equal(phoneFull.phone?.full, '9000012345');
  assert.equal(phoneFull.phone?.last4, '2345');

  const phoneLast4 = extractTurnEntities('mobile number ending 4321 customer');
  assert.equal(phoneLast4.phone?.full, null);
  assert.equal(phoneLast4.phone?.last4, '4321');
});

test('Phase 2.5: Self-correction & entity switch detector (Tamil, English, Hindi + recheck-only word)', () => {
  const { extractTurnEntities } = require('../services/entityNormalizer.service');

  const prevContext = {
    previousEntity: { type: 'hplno', value: 3 },
  };

  // Mid-conversation self-correction in Tamil: "மாத்தி சொல்றேன், TN 39 AB 1234"
  const corr1 = extractTurnEntities('மாத்தி சொல்றேன், TN 39 AB 1234', prevContext);
  assert.equal(corr1.isCorrectionOrSwitch, true);
  assert.equal(corr1.recheckOnly, false);
  assert.equal(corr1.newEntity?.type, 'vehicle');
  assert.equal(corr1.newEntity?.value, 'TN39AB1234');

  // Tanglish correction: "maathi solren HP number 7"
  const corr2 = extractTurnEntities('maathi solren HP number 7', prevContext);
  assert.equal(corr2.isCorrectionOrSwitch, true);
  assert.equal(corr2.newEntity?.type, 'hplno');
  assert.equal(corr2.newEntity?.value, 7);

  // Implicit entity switch without correction word (Turn 1 was HPL 3, Turn 2 asks HPL 9)
  const sw = extractTurnEntities('HP நம்பர் ஒன்பது கஸ்டமர் பாக்கி என்ன?', prevContext);
  assert.equal(sw.isCorrectionOrSwitch, true);
  assert.equal(sw.newEntity?.type, 'hplno');
  assert.equal(sw.newEntity?.value, 9);

  // Same entity follow-up ("அவருடைய பாக்கி எவ்வளவு?" -> no new entity, no correction word)
  const followUp = extractTurnEntities('அவருடைய பாக்கி எவ்வளவு?', prevContext);
  assert.equal(followUp.isCorrectionOrSwitch, false);
  assert.equal(followUp.newEntity, null);

  // Correction word ALONE without new entity -> recheckOnly = true, newEntity = null
  const recheckOnly = extractTurnEntities('இல்ல அது தப்பு', prevContext);
  assert.equal(recheckOnly.isCorrectionOrSwitch, true);
  assert.equal(recheckOnly.recheckOnly, true);
  assert.equal(recheckOnly.newEntity, null);

  const recheckHi = extractTurnEntities('नहीं वो गलत है', prevContext);
  assert.equal(recheckHi.isCorrectionOrSwitch, true);
  assert.equal(recheckHi.recheckOnly, true);
  assert.equal(recheckHi.newEntity, null);
});

