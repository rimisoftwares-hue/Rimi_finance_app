export const BASE_PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap');

  @page {
    size: A4;
    margin: 12mm;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', 'Noto Sans Tamil', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #000000;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-break {
    page-break-before: always;
    break-before: page;
  }

  .print-watermark {
    position: absolute;
    top: 48%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-size: 64px;
    font-weight: 800;
    color: rgba(0, 0, 0, 0.06);
    letter-spacing: 8px;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    white-space: nowrap;
  }

  .text-center {
    text-align: center;
  }

  .text-right {
    text-align: right;
  }

  @media print {
    body {
      margin: 0 !important;
      padding: 0 !important;
    }

    .page-break {
      page-break-before: always !important;
      break-before: page !important;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

