import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCompletePrintHtml,
  generateDefaulterCoApplicantHtml,
  generateLedgerHtml,
} from '../src/components/common/print/index.ts';
import type {
  PrintDocTypeId,
  PrintTemplateOptions,
} from '../src/components/common/print/types.ts';
import {
  FIXED_ISO_NOW,
  SAMPLE_FINANCE,
  makeSyntheticCustomer,
  withFrozenDate,
} from '../../test_assets/notice-print-baselines/captureBaselines.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_DIR = path.resolve(
  __dirname,
  '../../test_assets/notice-print-baselines/snapshots'
);

const ALL_DOC_TYPES: PrintDocTypeId[] = [
  'ledger',
  'due_card',
  'seizing_letter',
  'defaulter_customer',
  'defaulter_coapplicant',
];

function renderDoc(
  docType: PrintDocTypeId,
  options?: PrintTemplateOptions,
  paymentCount = 5,
  title = `Baseline - ${docType}`
): string {
  const item = makeSyntheticCustomer(paymentCount);
  return withFrozenDate(FIXED_ISO_NOW, () =>
    buildCompletePrintHtml([item], SAMPLE_FINANCE, docType, options, title).html
  );
}

// ============================================================================
// PHASE 1: BRANDING TOGGLES & EXTERNAL CALLER GOLDEN VERIFICATION
// ============================================================================

test('Phase 1 — External caller signature (PrintLettersDropdown.tsx & direct generateLedgerHtml) stays byte-identical to Phase 0 baseline', () => {
  const shortItem = makeSyntheticCustomer(5);
  withFrozenDate(FIXED_ISO_NOW, () => {
    for (const docType of ALL_DOC_TYPES) {
      // Exact call shape used by frontend/src/components/customer/PrintLettersDropdown.tsx
      const built = buildCompletePrintHtml(
        [shortItem],
        SAMPLE_FINANCE,
        docType,
        { watermark: false, footer: true },
        `Baseline - ${docType}`
      );
      const expected = fs.readFileSync(path.join(SNAPSHOT_DIR, `${docType}.short.html`), 'utf8');
      assert.equal(built.html, expected, `External caller mismatch on ${docType}`);
    }

    // Direct template call with omitted options
    const directLedgerDefault = generateLedgerHtml(shortItem, SAMPLE_FINANCE);
    const directLedgerExplicit = generateLedgerHtml(shortItem, SAMPLE_FINANCE, {
      watermark: false,
      footer: true,
      showLogo: true,
    });
    assert.equal(directLedgerDefault, directLedgerExplicit);
  });
});

test('Phase 1 — Branding toggles (showLogo, watermark, footer) work across all 5 templates without touching mandatory identity', () => {
  for (const docType of ALL_DOC_TYPES) {
    const defaultHtml = renderDoc(docType, { watermark: false, footer: true, showLogo: true });
    assert.match(defaultHtml, /class="company-print-logo"/, `${docType}: expected logo by default`);
    assert.doesNotMatch(
      defaultHtml,
      /<div class="print-watermark">CONFIDENTIAL<\/div>/,
      `${docType}: expected no watermark element by default`
    );

    // 1. showLogo: false
    const noLogoHtml = renderDoc(docType, { watermark: false, footer: true, showLogo: false });
    assert.doesNotMatch(noLogoHtml, /class="company-print-logo"/, `${docType}: logo must be hidden`);
    assert.match(noLogoHtml, /SYNTHETIC AUTO FINANCE/, `${docType}: company name is mandatory`);

    // 2. watermark: true
    const watermarkHtml = renderDoc(docType, { watermark: true, footer: true, showLogo: true });
    const wmMatches = watermarkHtml.match(/<div class="print-watermark">CONFIDENTIAL<\/div>/g) || [];
    const expectedWatermarkCount = docType === 'due_card' ? 2 : 1;
    assert.equal(
      wmMatches.length,
      expectedWatermarkCount,
      `${docType}: expected ${expectedWatermarkCount} watermark element(s)`
    );

    // 3. footer: false
    const noFooterHtml = renderDoc(docType, { watermark: false, footer: false, showLogo: true });
    if (docType === 'ledger') {
      assert.doesNotMatch(noFooterHtml, /class="footer-section"/);
      assert.doesNotMatch(noFooterHtml, /Authorized Signatory/);
    } else if (docType === 'due_card') {
      assert.doesNotMatch(noFooterHtml, /class="page-footer"/);
      assert.doesNotMatch(noFooterHtml, /class="settlement-section"/);
    } else {
      assert.doesNotMatch(noFooterHtml, /class="letter-footer"/);
      assert.doesNotMatch(noFooterHtml, /Authorized Signatory/);
    }
    // Mandatory borrower & loan account identifiers remain intact
    assert.match(noFooterHtml, /Test Borrower Kumar/);
    assert.match(noFooterHtml, /HPL-2026-042/);
  }
});

// ============================================================================
// PHASE 2: LEDGER MATRIX TESTS (8 Detail Toggles)
// ============================================================================

test('Phase 2 — Ledger: all detail toggles true produces byte-identical HTML to Phase 0 short & long snapshots', () => {
  const allOnOptions: PrintTemplateOptions = {
    theme: 'classic',
    watermark: false,
    footer: true,
    showLogo: true,
    showInterestRate: true,
    showPenalty: true,
    showBroker: true,
    showGuardian: true,
    showPhotos: true,
    showWorkDetails: true,
    showVehicleChassisEngine: true,
    showTerms: true,
  };

  const shortHtml = renderDoc('ledger', allOnOptions, 5);
  const expectedShort = fs.readFileSync(path.join(SNAPSHOT_DIR, 'ledger.short.html'), 'utf8');
  assert.equal(shortHtml, expectedShort);

  const longItem = makeSyntheticCustomer(42);
  const longHtml = withFrozenDate(FIXED_ISO_NOW, () =>
    buildCompletePrintHtml([longItem], SAMPLE_FINANCE, 'ledger', allOnOptions, 'Baseline Long - ledger').html
  );
  const expectedLong = fs.readFileSync(path.join(SNAPSHOT_DIR, 'ledger.long.html'), 'utf8');
  assert.equal(longHtml, expectedLong);
});

test('Phase 2 — Ledger toggle matrix: each of the 8 detail toggles hides ONLY its target optional elements cleanly', () => {
  const baseline = renderDoc('ledger');

  // Sanity check that baseline has all 8 optional sections before toggling off
  assert.match(baseline, /Interest Rate:/);
  assert.match(baseline, /14\.5%/);
  assert.match(baseline, /Penalty Rate:/);
  assert.match(baseline, /Total Penalty/);
  assert.match(baseline, /Penalty \(₹\)/);
  assert.match(baseline, /Broker : /);
  assert.match(baseline, /Test Broker Selvam/);
  assert.match(baseline, /GUARDIAN \/ CO-APPLICANT DETAILS/);
  assert.match(baseline, /Guarantor Signature/);
  assert.match(baseline, /class="photo-column"/);
  assert.match(baseline, /Work Office :/);
  assert.match(baseline, /Work Phone :/);
  assert.match(baseline, /Chassis No:/);
  assert.match(baseline, /Engine No:/);
  assert.match(baseline, /Terms & Conditions:/);

  // 1. showInterestRate: false
  const noInterest = renderDoc('ledger', { showInterestRate: false });
  assert.doesNotMatch(noInterest, /Interest Rate:/);
  assert.doesNotMatch(noInterest, /14\.5%/);
  assert.match(noInterest, /HP Amount:/);
  assert.match(noInterest, /Monthly EMI:/);
  assert.match(noInterest, /Penalty Rate:/);

  // 2. showPenalty: false (hides Penalty Rate row, Total Penalty card, Penalty table column, adjusts 3-col cards & empty-row colspan)
  const noPenalty = renderDoc('ledger', { showPenalty: false });
  assert.doesNotMatch(noPenalty, /Penalty Rate:/);
  assert.doesNotMatch(noPenalty, /Total Penalty/);
  assert.doesNotMatch(noPenalty, /class="summary-card penalty"/);
  assert.doesNotMatch(noPenalty, /Penalty \(₹\)/);
  assert.match(noPenalty, /class="summary-cards" style="grid-template-columns: repeat\(3, 1fr\);"/);
  // Mandatory amounts stay intact
  assert.match(noPenalty, /Total Paid/);
  assert.match(noPenalty, /Balance Amount/);
  assert.match(noPenalty, /Paid Installments/);
  assert.match(noPenalty, /Amount Paid \(₹\)/);

  // Also check empty payments table colspan is 5 when showPenalty is false
  const emptyCustomer = makeSyntheticCustomer(0);
  const noPenaltyEmpty = withFrozenDate(FIXED_ISO_NOW, () =>
    generateLedgerHtml(emptyCustomer, SAMPLE_FINANCE, { showPenalty: false })
  );
  assert.match(noPenaltyEmpty, /<td colspan="5" class="no-data">No payment records available<\/td>/);

  // 3. showBroker: false
  const noBroker = renderDoc('ledger', { showBroker: false });
  assert.doesNotMatch(noBroker, /Broker : /);
  assert.doesNotMatch(noBroker, /Test Broker Selvam/);
  assert.match(noBroker, /HPL No : /);
  assert.match(noBroker, /Loan Status : /);
  assert.match(noBroker, /Print Date : /);

  // 4. showGuardian: false (hides Guardian info-card AND Guarantor Signature box, adjusts grids)
  const noGuardian = renderDoc('ledger', { showGuardian: false });
  assert.doesNotMatch(noGuardian, /GUARDIAN \/ CO-APPLICANT DETAILS/);
  assert.doesNotMatch(noGuardian, /Test Guarantor Murugan/);
  assert.doesNotMatch(noGuardian, /Guarantor Signature/);
  assert.match(noGuardian, /class="main-grid" style="grid-template-columns: 1fr;"/);
  assert.match(noGuardian, /class="signature-grid" style="grid-template-columns: repeat\(2, 1fr\);"/);
  assert.match(noGuardian, /CUSTOMER DETAILS/);
  assert.match(noGuardian, /Test Borrower Kumar/);
  assert.match(noGuardian, /Customer Signature/);
  assert.match(noGuardian, /Authorized Signatory/);

  // 5. showPhotos: false (hides both customer and guardian photo columns, including placeholders)
  const noPhotos = renderDoc('ledger', { showPhotos: false });
  assert.doesNotMatch(noPhotos, /class="photo-column"/);
  assert.doesNotMatch(noPhotos, /alt="Customer Photo"/);
  assert.doesNotMatch(noPhotos, /alt="Guardian Photo"/);
  assert.match(noPhotos, /Test Borrower Kumar/);
  assert.match(noPhotos, /Test Guarantor Murugan/);

  const noPhotoUrlsCustomer = makeSyntheticCustomer(2);
  noPhotoUrlsCustomer.customer!.cphoto = undefined;
  noPhotoUrlsCustomer.guardian!.gphoto = undefined;
  const noPhotosPlaceholderHtml = generateLedgerHtml(noPhotoUrlsCustomer, SAMPLE_FINANCE, {
    showPhotos: false,
  });
  assert.doesNotMatch(noPhotosPlaceholderHtml, /photo-placeholder/);

  // 6. showWorkDetails: false
  const noWork = renderDoc('ledger', { showWorkDetails: false });
  assert.doesNotMatch(noWork, /Work Office :/);
  assert.doesNotMatch(noWork, /45 Industrial Estate, Madurai/);
  assert.doesNotMatch(noWork, /Work Phone :/);
  assert.doesNotMatch(noWork, /0452-2223334/);
  assert.match(noWork, /12 Sample Street, Demo Village, Madurai - 625001/);
  assert.match(noWork, /9888877777/);

  // 7. showVehicleChassisEngine: false
  const noChassisEngine = renderDoc('ledger', { showVehicleChassisEngine: false });
  assert.doesNotMatch(noChassisEngine, /Chassis No:/);
  assert.doesNotMatch(noChassisEngine, /MBLHA10EE00001234/);
  assert.doesNotMatch(noChassisEngine, /Engine No:/);
  assert.doesNotMatch(noChassisEngine, /HA10EA00005678/);
  assert.match(noChassisEngine, /Vehicle Number:/);
  assert.match(noChassisEngine, /TN-58-AB-1234/);
  assert.match(noChassisEngine, /Model\/Brand:/);
  assert.match(noChassisEngine, /Splendor Plus/);

  // 8. showTerms: false
  const noTerms = renderDoc('ledger', { showTerms: false });
  assert.doesNotMatch(noTerms, /class="terms-section"/);
  assert.doesNotMatch(noTerms, /Terms & Conditions:/);
  assert.match(noTerms, /class="signature-grid"/);
  assert.match(noTerms, /Customer Signature/);
  assert.match(noTerms, /Authorized Signatory/);
});

// ============================================================================
// PHASE 3: DUE CARD MATRIX TESTS (5 Detail Toggles)
// ============================================================================

test('Phase 3 — Due Card: all detail toggles true produces byte-identical HTML to Phase 0 short & long snapshots', () => {
  const allOnOptions: PrintTemplateOptions = {
    theme: 'classic',
    watermark: false,
    footer: true,
    showLogo: true,
    showGuarantor: true,
    showDatesBar: true,
    showVehicleModel: true,
    showInstructions: true,
    showSettlementSection: true,
  };

  const shortHtml = renderDoc('due_card', allOnOptions, 5);
  const expectedShort = fs.readFileSync(path.join(SNAPSHOT_DIR, 'due_card.short.html'), 'utf8');
  assert.equal(shortHtml, expectedShort);

  const longHtml = renderDoc('due_card', allOnOptions, 42, 'Baseline Long - due_card');
  const expectedLong = fs.readFileSync(path.join(SNAPSHOT_DIR, 'due_card.long.html'), 'utf8');
  assert.equal(longHtml, expectedLong);
});

test('Phase 3 — Due Card toggle matrix: each of the 5 detail toggles hides ONLY its target optional elements cleanly and preserves 2-page layout', () => {
  const baseline = renderDoc('due_card');
  assert.match(baseline, /GUARANTOR DETAILS/);
  assert.match(baseline, /Guarantor Signature/);
  assert.match(baseline, /Agreement Date:/);
  assert.match(baseline, /First EMI Date:/);
  assert.match(baseline, /Last EMI Date:/);
  assert.match(baseline, /Vehicle Model:/);
  assert.match(baseline, /Bring this card for every payment/);
  assert.match(baseline, /LOAN CLOSURE & FINAL SETTLEMENT/);
  assert.equal((baseline.match(/<div class="due-card-page">/g) || []).length, 2);

  // 1. showGuarantor: false (hides GUARANTOR DETAILS party-card + Guarantor Signature sig-box, adjusts grids)
  const noGuarantor = renderDoc('due_card', { showGuarantor: false });
  assert.doesNotMatch(noGuarantor, /GUARANTOR DETAILS/);
  assert.doesNotMatch(noGuarantor, /Test Guarantor Murugan/);
  assert.doesNotMatch(noGuarantor, /Guarantor Signature/);
  assert.match(noGuarantor, /class="parties-section" style="grid-template-columns: 1fr;"/);
  assert.match(noGuarantor, /class="final-signatures" style="grid-template-columns: repeat\(2, 1fr\);"/);
  assert.match(noGuarantor, /BORROWER DETAILS/);
  assert.match(noGuarantor, /Test Borrower Kumar/);
  assert.match(noGuarantor, /Borrower Signature/);
  assert.match(noGuarantor, /Manager Signature & Seal/);
  assert.equal((noGuarantor.match(/<div class="due-card-page">/g) || []).length, 2);

  // 2. showDatesBar: false
  const noDatesBar = renderDoc('due_card', { showDatesBar: false });
  assert.doesNotMatch(noDatesBar, /class="dates-bar"/);
  assert.doesNotMatch(noDatesBar, /Agreement Date:/);
  assert.doesNotMatch(noDatesBar, /First EMI Date:/);
  assert.doesNotMatch(noDatesBar, /Last EMI Date:/);
  assert.match(noDatesBar, /EMI No\./);
  assert.equal((noDatesBar.match(/<div class="due-card-page">/g) || []).length, 2);

  // 3. showVehicleModel: false
  const noVehicleModel = renderDoc('due_card', { showVehicleModel: false });
  assert.doesNotMatch(noVehicleModel, /Vehicle Model:/);
  assert.doesNotMatch(noVehicleModel, /Splendor Plus/);
  assert.match(noVehicleModel, /HPL No:/);
  assert.match(noVehicleModel, /Vehicle No:/);
  assert.match(noVehicleModel, /TN-58-AB-1234/);
  assert.match(noVehicleModel, /HP Amount:/);
  assert.match(noVehicleModel, /Monthly EMI:/);

  // 4. showInstructions: false (keeps Authorized Signatory right-aligned)
  const noInstructions = renderDoc('due_card', { showInstructions: false });
  assert.doesNotMatch(noInstructions, /class="instructions"/);
  assert.doesNotMatch(noInstructions, /Bring this card for every payment/);
  assert.match(noInstructions, /class="page-footer" style="justify-content: flex-end;"/);
  assert.match(noInstructions, /Authorized Signatory/);

  // 5. showSettlementSection: false (preserves Page 2 EMI schedule 16-36 & 2-page structure)
  const noSettlement = renderDoc('due_card', { showSettlementSection: false });
  assert.doesNotMatch(noSettlement, /class="settlement-section"/);
  assert.doesNotMatch(noSettlement, /LOAN CLOSURE & FINAL SETTLEMENT/);
  assert.match(noSettlement, /EMI Due Card \(Continued\)/);
  assert.match(noSettlement, /<td class="serial-cell">36<\/td>/);
  assert.equal((noSettlement.match(/<div class="due-card-page">/g) || []).length, 2);
});

// ============================================================================
// PHASE 4: SEIZING LETTER MATRIX TESTS (4 Detail Toggles)
// ============================================================================

test('Phase 4 — Seizing Letter: all detail toggles true produces byte-identical HTML to Phase 0 short & long snapshots', () => {
  const allOnOptions: PrintTemplateOptions = {
    theme: 'classic',
    watermark: false,
    footer: true,
    showLogo: true,
    showRefNo: true,
    showLoanSummaryBox: true,
    showCopyToGuarantor: true,
    showUrgentStamp: true,
  };

  const shortHtml = renderDoc('seizing_letter', allOnOptions, 5);
  const expectedShort = fs.readFileSync(path.join(SNAPSHOT_DIR, 'seizing_letter.short.html'), 'utf8');
  assert.equal(shortHtml, expectedShort);

  const longHtml = renderDoc('seizing_letter', allOnOptions, 42, 'Baseline Long - seizing_letter');
  const expectedLong = fs.readFileSync(path.join(SNAPSHOT_DIR, 'seizing_letter.long.html'), 'utf8');
  assert.equal(longHtml, expectedLong);
});

test('Phase 4 — Seizing Letter toggle matrix: each of the 4 detail toggles hides ONLY its optional block while preserving Tamil demand wording & mandatory amounts', () => {
  const baseline = renderDoc('seizing_letter');
  assert.match(baseline, /SAC\/SEIZE\/HPL-2026-042\/2026/);
  assert.match(baseline, /LOAN ACCOUNT SUMMARY/);
  assert.match(baseline, /நகல் \/ Copy To \(Guarantor\):/);
  assert.match(baseline, /ACTION REQUIRED/);

  // 1. showRefNo: false (hides Ref No, keeps Date right-aligned)
  const noRef = renderDoc('seizing_letter', { showRefNo: false });
  assert.doesNotMatch(noRef, /SAC\/SEIZE\//);
  assert.doesNotMatch(noRef, /class="ref-left"/);
  assert.match(noRef, /class="ref-section" style="justify-content: flex-end;"/);
  assert.match(noRef, /<strong>Date:<\/strong>/);

  // 2. showLoanSummaryBox: false (hides summary box, keeps mandatory Tamil demand text & amounts intact)
  const noBox = renderDoc('seizing_letter', { showLoanSummaryBox: false });
  assert.doesNotMatch(noBox, /class="loan-summary-box"/);
  assert.doesNotMatch(noBox, /LOAN ACCOUNT SUMMARY/);
  // Mandatory notice wording, recipient, HPL no, vehicle no, and demanded balance remain untouched
  assert.match(noBox, /Test Borrower Kumar/);
  assert.match(noBox, /HPL-2026-042/);
  assert.match(noBox, /TN-58-AB-1234/);
  assert.match(noBox, /7 நாட்களுக்குள்/);
  assert.match(noBox, /₹1,08,500/);
  assert.match(noBox, /தாமதக் கட்டணங்களை/);

  // 3. showCopyToGuarantor: false (hides Copy To section, keeps joint-liability Tamil clause in letter body)
  const noCopy = renderDoc('seizing_letter', { showCopyToGuarantor: false });
  assert.doesNotMatch(noCopy, /class="copy-section"/);
  assert.doesNotMatch(noCopy, /நகல் \/ Copy To \(Guarantor\):/);
  assert.match(noCopy, /Test Guarantor Murugan/);

  // 4. showUrgentStamp: false (hides URGENT stamp box, keeps company signature right-aligned)
  const noStamp = renderDoc('seizing_letter', { showUrgentStamp: false });
  assert.doesNotMatch(noStamp, /class="urgent-stamp"/);
  assert.doesNotMatch(noStamp, /ACTION REQUIRED/);
  assert.match(noStamp, /class="letter-footer" style="justify-content: flex-end;"/);
  assert.match(noStamp, /Authorized Signatory & Seal/);
});

// ============================================================================
// PHASE 5: DEFAULTER CUSTOMER MATRIX TESTS (5 Detail Toggles)
// ============================================================================

test('Phase 5 — Defaulter Customer: all detail toggles true produces byte-identical HTML to Phase 0 short & long snapshots', () => {
  const allOnOptions: PrintTemplateOptions = {
    theme: 'classic',
    watermark: false,
    footer: true,
    showLogo: true,
    showRefNo: true,
    showLoanSummaryBox: true,
    showPaidInstallments: true,
    showCopyToGuarantor: true,
    showUrgentStamp: true,
  };

  const shortHtml = renderDoc('defaulter_customer', allOnOptions, 5);
  const expectedShort = fs.readFileSync(
    path.join(SNAPSHOT_DIR, 'defaulter_customer.short.html'),
    'utf8'
  );
  assert.equal(shortHtml, expectedShort);

  const longHtml = renderDoc(
    'defaulter_customer',
    allOnOptions,
    42,
    'Baseline Long - defaulter_customer'
  );
  const expectedLong = fs.readFileSync(
    path.join(SNAPSHOT_DIR, 'defaulter_customer.long.html'),
    'utf8'
  );
  assert.equal(longHtml, expectedLong);
});

test('Phase 5 — Defaulter Customer toggle matrix: each of the 5 detail toggles hides ONLY its optional block while preserving 7-day legal demand amounts & text', () => {
  const baseline = renderDoc('defaulter_customer');
  assert.match(baseline, /DN\/CUST\/HPL-2026-042\/2026/);
  assert.match(baseline, /LOAN &amp; OVERDUE PARTICULARS/);
  assert.match(baseline, /Paid Installments:/);
  assert.match(baseline, /COPY TO \(GUARANTOR \/ CO-APPLICANT\):/);
  assert.match(baseline, /IMMEDIATE ACTION/);

  // 1. showRefNo: false
  const noRef = renderDoc('defaulter_customer', { showRefNo: false });
  assert.doesNotMatch(noRef, /DN\/CUST\//);
  assert.doesNotMatch(noRef, /class="ref-left"/);
  assert.match(noRef, /class="ref-section" style="justify-content: flex-end;"/);
  assert.match(noRef, /<strong>Date:<\/strong>/);

  // 2. showLoanSummaryBox: false (mandatory legal text & demanded amounts remain untouched)
  const noBox = renderDoc('defaulter_customer', { showLoanSummaryBox: false });
  assert.doesNotMatch(noBox, /class="loan-summary-box"/);
  assert.doesNotMatch(noBox, /LOAN &amp; OVERDUE PARTICULARS/);
  assert.match(noBox, /TO \(PRINCIPAL BORROWER\):/);
  assert.match(noBox, /Test Borrower Kumar/);
  assert.match(noBox, /HPL-2026-042/);
  assert.match(noBox, /TN-58-AB-1234/);
  assert.match(noBox, /7-DAY DEMAND FOR PAYMENT:/);
  assert.match(noBox, /Total Amount Demanded: ₹/);
  assert.match(noBox, /Overdue EMI: ₹/);
  assert.match(noBox, /Penalty: ₹/);

  // 3. showPaidInstallments: false (hides Paid Installments row inside summary box, keeps Overdue & Penalty rows)
  const noPaidRow = renderDoc('defaulter_customer', { showPaidInstallments: false });
  assert.doesNotMatch(noPaidRow, /Paid Installments:/);
  assert.match(noPaidRow, /LOAN &amp; OVERDUE PARTICULARS/);
  assert.match(noPaidRow, /Overdue EMIs:/);
  assert.match(noPaidRow, /Overdue EMI Amount:/);
  assert.match(noPaidRow, /Penalty \/ Late Charges:/);

  // 4. showCopyToGuarantor: false
  const noCopy = renderDoc('defaulter_customer', { showCopyToGuarantor: false });
  assert.doesNotMatch(noCopy, /class="copy-section"/);
  assert.doesNotMatch(noCopy, /COPY TO \(GUARANTOR \/ CO-APPLICANT\):/);
  assert.match(noCopy, /Test Borrower Kumar/);

  // 5. showUrgentStamp: false
  const noStamp = renderDoc('defaulter_customer', { showUrgentStamp: false });
  assert.doesNotMatch(noStamp, /class="urgent-stamp"/);
  assert.doesNotMatch(noStamp, /IMMEDIATE ACTION/);
  assert.match(noStamp, /class="letter-footer" style="justify-content: flex-end;"/);
  assert.match(noStamp, /Authorized Signatory &amp; Seal/);
});

// ============================================================================
// PHASE 6: DEFAULTER CO-APPLICANT MATRIX TESTS (5 Detail Toggles)
// ============================================================================

test('Phase 6 — Defaulter Co-Applicant: all detail toggles true produces byte-identical HTML to Phase 0 short & long snapshots', () => {
  const allOnOptions: PrintTemplateOptions = {
    theme: 'classic',
    watermark: false,
    footer: true,
    showLogo: true,
    showRefNo: true,
    showLoanSummaryBox: true,
    showBorrowerPhone: true,
    showCopyToBorrower: true,
    showUrgentStamp: true,
  };

  const shortHtml = renderDoc('defaulter_coapplicant', allOnOptions, 5);
  const expectedShort = fs.readFileSync(
    path.join(SNAPSHOT_DIR, 'defaulter_coapplicant.short.html'),
    'utf8'
  );
  assert.equal(shortHtml, expectedShort);

  const longHtml = renderDoc(
    'defaulter_coapplicant',
    allOnOptions,
    42,
    'Baseline Long - defaulter_coapplicant'
  );
  const expectedLong = fs.readFileSync(
    path.join(SNAPSHOT_DIR, 'defaulter_coapplicant.long.html'),
    'utf8'
  );
  assert.equal(longHtml, expectedLong);
});

test('Phase 6 — Defaulter Co-Applicant toggle matrix: each of the 5 detail toggles hides ONLY its optional block while preserving guarantor demand text & no-guarantor fallback', () => {
  const baseline = renderDoc('defaulter_coapplicant');
  assert.match(baseline, /DN\/GUAR\/HPL-2026-042\/2026/);
  assert.match(baseline, /PRINCIPAL BORROWER &amp; DEFAULT SUMMARY/);
  assert.match(baseline, /Borrower Phone:/);
  assert.match(baseline, /COPY TO \(PRINCIPAL BORROWER\):/);
  assert.match(baseline, /JOINT LIABILITY/);

  // 1. showRefNo: false
  const noRef = renderDoc('defaulter_coapplicant', { showRefNo: false });
  assert.doesNotMatch(noRef, /DN\/GUAR\//);
  assert.doesNotMatch(noRef, /class="ref-left"/);
  assert.match(noRef, /class="ref-section" style="justify-content: flex-end;"/);
  assert.match(noRef, /<strong>Date:<\/strong>/);

  // 2. showLoanSummaryBox: false (mandatory guarantor recipient, borrower in SUBJECT, and 7-day demand amounts stay intact)
  const noBox = renderDoc('defaulter_coapplicant', { showLoanSummaryBox: false });
  assert.doesNotMatch(noBox, /class="loan-summary-box"/);
  assert.doesNotMatch(noBox, /PRINCIPAL BORROWER &amp; DEFAULT SUMMARY/);
  assert.match(noBox, /TO \(GUARANTOR \/ CO-APPLICANT\):/);
  assert.match(noBox, /Test Guarantor Murugan/);
  assert.match(noBox, /Test Borrower Kumar/);
  assert.match(noBox, /HPL-2026-042/);
  assert.match(noBox, /7-DAY SETTLEMENT NOTICE TO GUARANTOR:/);
  assert.match(noBox, /Total Overdue Payable: ₹/);
  assert.match(noBox, /Overdue Installments: ₹/);
  assert.match(noBox, /Late Penalty: ₹/);

  // 3. showBorrowerPhone: false (hides Borrower Phone row inside summary box, keeps Principal Borrower & Guarantor Contact)
  const noPhone = renderDoc('defaulter_coapplicant', { showBorrowerPhone: false });
  assert.doesNotMatch(noPhone, /Borrower Phone:/);
  assert.doesNotMatch(noPhone, /9888877777/);
  assert.match(noPhone, /Principal Borrower:/);
  assert.match(noPhone, /9777755555/); // Guarantor phone in recipient section stays intact

  // 4. showCopyToBorrower: false
  const noCopy = renderDoc('defaulter_coapplicant', { showCopyToBorrower: false });
  assert.doesNotMatch(noCopy, /class="copy-section"/);
  assert.doesNotMatch(noCopy, /COPY TO \(PRINCIPAL BORROWER\):/);
  assert.match(noCopy, /Test Borrower Kumar/); // Still in SUBJECT & summary box

  // 5. showUrgentStamp: false
  const noStamp = renderDoc('defaulter_coapplicant', { showUrgentStamp: false });
  assert.doesNotMatch(noStamp, /class="urgent-stamp"/);
  assert.doesNotMatch(noStamp, /JOINT LIABILITY/);
  assert.match(noStamp, /class="letter-footer" style="justify-content: flex-end;"/);
  assert.match(noStamp, /Authorized Signatory &amp; Seal/);

  // 6. Missing guarantor fallback remains intact regardless of detail toggles
  const noGuarantorItem = makeSyntheticCustomer(5);
  noGuarantorItem.guardian = null;
  const fallbackHtml = generateDefaulterCoApplicantHtml(noGuarantorItem, SAMPLE_FINANCE, {
    showRefNo: false,
    showLoanSummaryBox: false,
    showBorrowerPhone: false,
    showCopyToBorrower: false,
    showUrgentStamp: false,
  });
  assert.match(fallbackHtml, /NO CO-APPLICANT \/ GUARANTOR ON RECORD/);
  assert.match(fallbackHtml, /HPL-2026-042/);
});




