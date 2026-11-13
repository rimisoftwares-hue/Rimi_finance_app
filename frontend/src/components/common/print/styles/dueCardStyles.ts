export const DUE_CARD_PRINT_STYLES = `
  /* ============================================================================
     DUE CARD STYLES - Scoped to .due-card-page (2-Page Layout)
     ============================================================================ */
  .due-card-page {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    min-height: 260mm;
    display: flex;
    flex-direction: column;
  }

  .due-card-page .header {
    display: block;
    text-align: center;
    border: 2px solid #000;
    padding: 8px;
    margin-bottom: 8px;
    background: #f8f8f8;
    position: relative;
    z-index: 2;
  }

  .due-card-page .company-info .company-name,
  .due-card-page .company-name {
    font-size: 16px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
  }

  .due-card-page .company-info .company-address,
  .due-card-page .company-address {
    font-size: 9px;
    color: #333;
    margin: 2px 0;
  }

  .due-card-page .company-info .company-contact,
  .due-card-page .company-contact {
    font-size: 8px;
    color: #333;
  }

  .due-card-page .card-title {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    background: #e0e0e0;
    padding: 3px 8px;
    border: 1px solid #000;
    margin-top: 4px;
    display: inline-block;
  }

  .due-card-page .loan-header {
    border: 1px solid #000;
    background: #f0f0f0;
    padding: 6px 8px;
    margin-bottom: 8px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .loan-basic-info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    font-size: 9.5px;
  }

  .due-card-page .info-item {
    display: flex;
    gap: 4px;
  }

  .due-card-page .info-item .label {
    font-weight: 600;
    color: #333;
  }

  .due-card-page .info-item .value {
    font-weight: 700;
    color: #000;
  }

  .due-card-page .info-item .value.highlight {
    background: #fff;
    padding: 1px 4px;
    border: 1px solid #666;
  }

  .due-card-page .parties-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .party-card {
    border: 1px solid #000;
    background: #fff;
  }

  .due-card-page .party-header {
    background: #e0e0e0;
    border-bottom: 1px solid #000;
    padding: 3px 6px;
    font-size: 9px;
    font-weight: 700;
    text-align: center;
  }

  .due-card-page .party-content {
    padding: 6px;
  }

  .due-card-page .party-row {
    display: flex;
    margin-bottom: 2px;
    font-size: 8.5px;
  }

  .due-card-page .party-label {
    width: 50px;
    font-weight: 600;
    color: #333;
    flex-shrink: 0;
  }

  .due-card-page .party-value {
    color: #000;
    word-break: break-word;
  }

  .due-card-page .party-value.address {
    font-size: 8px;
    line-height: 1.2;
  }

  .due-card-page .dates-bar {
    display: flex;
    justify-content: space-around;
    border: 1px solid #000;
    background: #f8f8f8;
    padding: 4px 8px;
    margin-bottom: 8px;
    font-size: 9px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .date-item {
    display: flex;
    gap: 4px;
  }

  .due-card-page .date-label {
    font-weight: 600;
    color: #333;
  }

  .due-card-page .date-value {
    font-weight: 700;
    color: #000;
  }

  .due-card-page .schedule-section {
    flex: 1;
    margin-bottom: 8px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .schedule-section-page2 {
    flex: 1;
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .schedule-table {
    width: 100%;
    border-collapse: collapse;
    border: 2px solid #000;
    font-size: 9px;
  }

  .due-card-page .schedule-table th {
    background: #d0d0d0;
    border: 1px solid #000;
    padding: 4px 3px;
    font-weight: 700;
    text-align: center;
    color: #000;
    font-size: 8.5px;
  }

  .due-card-page .schedule-table td {
    border: 1px solid #666;
    height: 22px;
    padding: 2px 4px;
    vertical-align: middle;
  }

  .due-card-page .serial-cell {
    text-align: center;
    font-weight: 600;
    background: #f8f8f8;
  }

  .due-card-page .date-cell {
    text-align: center;
    font-size: 8px;
  }

  .due-card-page .empty-cell {
    background: #ffffff;
  }

  .due-card-page .page-footer {
    border-top: 1px solid #000;
    padding-top: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8px;
    position: relative;
    z-index: 1;
  }

  .due-card-page .instructions {
    color: #333;
  }

  .due-card-page .auth-sign {
    font-weight: 600;
    color: #000;
  }

  .due-card-page .page2-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: 4px;
    margin-bottom: 8px;
    font-size: 10px;
    position: relative;
    z-index: 2;
  }

  .due-card-page .settlement-section {
    border: 2px solid #000;
    padding: 8px;
    background: #f8f8f8;
    position: relative;
    z-index: 1;
  }

  .due-card-page .settlement-header {
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    background: #e0e0e0;
    padding: 3px;
    border: 1px solid #000;
    margin-bottom: 8px;
  }

  .due-card-page .settlement-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 9px;
  }

  .due-card-page .settlement-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .due-card-page .settlement-label {
    font-weight: 600;
  }

  .due-card-page .settlement-line {
    font-family: monospace;
  }

  .due-card-page .final-signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .due-card-page .sig-box {
    text-align: center;
  }

  .due-card-page .sig-line {
    border-bottom: 1px solid #000;
    height: 20px;
    margin-bottom: 3px;
  }

  .due-card-page .sig-label {
    font-size: 8px;
    font-weight: 600;
  }
`;

