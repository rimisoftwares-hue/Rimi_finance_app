export const NOTICE_LETTER_PRINT_STYLES = `
  /* ============================================================================
     SEIZING LETTER & DEFAULTER NOTICE STYLES - Scoped to .seizing-letter
     ============================================================================ */
  .seizing-letter {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    font-size: 11px;
    line-height: 1.5;
  }

  .seizing-letter .letter-header {
    display: block;
    text-align: center;
    border: 2px solid #000;
    padding: 10px;
    margin-bottom: 12px;
    background: #f8f8f8;
    position: relative;
    z-index: 2;
  }

  .seizing-letter .company-title {
    font-size: 18px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .seizing-letter .company-details {
    font-size: 9px;
    color: #333;
    margin-bottom: 6px;
  }

  .seizing-letter .letter-type {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    background: #e0e0e0;
    padding: 4px 12px;
    border: 1px solid #000;
    display: inline-block;
  }

  .seizing-letter .ref-section {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 10px;
    padding: 4px 0;
    border-bottom: 1px solid #ccc;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .recipient-section {
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .to-label {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .seizing-letter .recipient-details {
    background: #f9f9f9;
    border-left: 3px solid #000;
    padding: 8px 12px;
    font-size: 10.5px;
    line-height: 1.4;
  }

  .seizing-letter .subject-section {
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .subject-line {
    background: #f0f0f0;
    border: 1px solid #000;
    padding: 8px 10px;
    font-size: 10.5px;
    line-height: 1.4;
  }

  .seizing-letter .loan-summary-box {
    border: 2px solid #000;
    margin-bottom: 12px;
    background: #fff;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .box-header {
    background: #d8d8d8;
    border-bottom: 1px solid #000;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }

  .seizing-letter .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    padding: 8px 12px;
    font-size: 9.5px;
  }

  .seizing-letter .summary-item {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    border-bottom: 1px dotted #ccc;
  }

  .seizing-letter .sum-label {
    font-weight: 600;
    color: #333;
  }

  .seizing-letter .sum-value {
    font-weight: 700;
    color: #000;
  }

  .seizing-letter .sum-value.highlight-red {
    background: #f0f0f0;
    padding: 1px 4px;
    border: 1px solid #000;
  }

  .seizing-letter .letter-body {
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .salutation {
    margin-bottom: 8px;
    font-size: 11px;
  }

  .seizing-letter .body-para {
    margin-bottom: 10px;
    text-align: justify;
    font-size: 10.5px;
    line-height: 1.6;
  }

  .seizing-letter .warning-para {
    background: #f5f5f5;
    border: 1px solid #000;
    padding: 8px 10px;
    font-weight: 500;
  }

  .seizing-letter .closing-note {
    font-size: 9.5px;
    color: #333;
    border-top: 1px dashed #666;
    padding-top: 6px;
    margin-top: 12px;
  }

  .seizing-letter .copy-section {
    background: #f8f8f8;
    border: 1px solid #666;
    padding: 6px 10px;
    margin-bottom: 15px;
    font-size: 9.5px;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .copy-header {
    margin-bottom: 2px;
  }

  .seizing-letter .guarantor-info {
    color: #333;
  }

  .seizing-letter .letter-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 20px;
    position: relative;
    z-index: 1;
  }

  .seizing-letter .urgent-stamp {
    text-align: center;
  }

  .seizing-letter .stamp-box {
    border: 2px solid #000;
    padding: 8px 12px;
    font-size: 9px;
    font-weight: 700;
    background: #f0f0f0;
    transform: rotate(-5deg);
    display: inline-block;
  }

  .seizing-letter .company-signature {
    text-align: right;
    font-size: 10px;
  }

  .seizing-letter .sig-space {
    height: 35px;
    border-bottom: 1px solid #000;
    width: 150px;
    margin: 8px 0 4px auto;
  }

  .seizing-letter .sig-designation {
    font-size: 9px;
  }
`;

