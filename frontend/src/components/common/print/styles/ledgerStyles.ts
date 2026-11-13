export const LEDGER_PRINT_STYLES = `
  /* ============================================================================
     LEDGER STYLES - Scoped to .ledger-container (single A4 page)
     ============================================================================ */
  .ledger-container {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
  }

  .ledger-container .header {
    display: block;
    text-align: center;
    margin-bottom: 5px;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    position: relative;
    z-index: 2;
  }

  .ledger-container .company-name {
    font-size: 18px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
    margin-bottom: 1px;
  }

  .ledger-container .company-subtitle {
    font-size: 10px;
    color: #333;
    margin-bottom: 4px;
  }

  .ledger-container .document-title {
    font-size: 13px;
    font-weight: 600;
    color: #000;
    background: #f0f0f0;
    padding: 4px 12px;
    border: 1px solid #000;
    display: inline-block;
  }

  .ledger-container .status-bar {
    display: flex;
    justify-content: space-between;
    background: #f8f8f8;
    border: 1px solid #000;
    padding: 6px 12px;
    margin-bottom: 10px;
    font-size: 10px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ledger-container .status-label {
    font-weight: 600;
    color: #333;
  }

  .ledger-container .status-value {
    font-weight: 700;
    color: #000;
  }

  .ledger-container .status-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    font-size: 9px;
  }

  .ledger-container .status-active {
    background: #e8f5e8;
    color: #000;
    border: 1px solid #000;
  }

  .ledger-container .status-closed {
    background: #f0f0f0;
    color: #333;
    border: 1px solid #666;
  }

  .ledger-container .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .secondary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .info-card {
    border: 1px solid #000;
    background: #fff;
  }

  .ledger-container .card-header {
    background: #e8e8e8;
    border-bottom: 1px solid #000;
    padding: 4px 8px;
  }

  .ledger-container .card-header h3 {
    font-size: 10px;
    font-weight: 700;
    color: #000;
    letter-spacing: 0.5px;
  }

  .ledger-container .card-content {
    padding: 8px;
  }

  .ledger-container .details-and-photo {
    display: flex;
    gap: 8px;
  }

  .ledger-container .details-column {
    flex: 1;
  }

  .ledger-container .photo-column {
    width: 60px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .ledger-container .profile-photo {
    width: 55px;
    height: 65px;
    object-fit: cover;
    border: 1px solid #000;
  }

  .ledger-container .photo-placeholder {
    width: 55px;
    height: 65px;
    border: 1px dashed #666;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    text-align: center;
    color: #666;
    background: #f9f9f9;
  }

  .ledger-container .detail-row {
    display: flex;
    margin-bottom: 3px;
    font-size: 9.5px;
  }

  .ledger-container .detail-label {
    width: 75px;
    font-weight: 600;
    color: #333;
    flex-shrink: 0;
  }

  .ledger-container .detail-value {
    color: #000;
    word-break: break-word;
  }

  .ledger-container .detail-value.highlight {
    font-weight: 700;
  }

  .ledger-container .detail-value.currency {
    font-weight: 600;
    font-family: monospace;
  }

  .ledger-container .address-text {
    font-size: 9px;
    line-height: 1.2;
  }

  .ledger-container .compact-grid .detail-row {
    margin-bottom: 2px;
  }

  .ledger-container .summary-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 10px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .summary-card {
    border: 1px solid #000;
    padding: 6px 8px;
    text-align: center;
    background: #f8f8f8;
  }

  .ledger-container .summary-label {
    font-size: 9px;
    font-weight: 600;
    color: #333;
    margin-bottom: 2px;
  }

  .ledger-container .summary-value {
    font-size: 11px;
    font-weight: 700;
    color: #000;
    font-family: monospace;
  }

  .ledger-container .table-section {
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .section-header {
    background: #e8e8e8;
    border: 1px solid #000;
    border-bottom: none;
    padding: 4px 8px;
  }

  .ledger-container .section-header h3 {
    font-size: 10px;
    font-weight: 700;
    color: #000;
  }

  .ledger-container .payment-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    font-size: 9px;
  }

  .ledger-container .payment-table th {
    background: #d8d8d8;
    border: 1px solid #000;
    padding: 4px 6px;
    font-weight: 700;
    text-align: center;
    color: #000;
  }

  .ledger-container .payment-table td {
    border: 1px solid #666;
    padding: 3px 6px;
    color: #000;
  }

  .ledger-container .even-row {
    background: #ffffff;
  }

  .ledger-container .odd-row {
    background: #f9f9f9;
  }

  .ledger-container .total-row {
    background: #e8e8e8 !important;
    font-weight: 700;
  }

  .ledger-container .total-row td {
    border-top: 2px solid #000;
    padding: 4px 6px;
  }

  .ledger-container .no-data {
    text-align: center;
    font-style: italic;
    color: #666;
    padding: 12px;
  }

  .ledger-container .footer-section {
    margin-top: 10px;
    position: relative;
    z-index: 1;
  }

  .ledger-container .terms-section {
    margin-bottom: 10px;
  }

  .ledger-container .terms-section h4 {
    font-size: 9px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .ledger-container .terms-list {
    font-size: 8px;
    padding-left: 12px;
    color: #333;
  }

  .ledger-container .terms-list li {
    margin-bottom: 1px;
  }

  .ledger-container .signature-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin-top: 15px;
  }

  .ledger-container .signature-box {
    text-align: center;
  }

  .ledger-container .signature-line {
    border-bottom: 1px solid #000;
    height: 25px;
    margin-bottom: 4px;
  }

  .ledger-container .signature-label {
    font-size: 9px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .ledger-container .signature-date {
    font-size: 8px;
    color: #666;
  }
`;

