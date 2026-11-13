import type {
  BuiltPrintDocument,
  PrintCustomerData,
  PrintDocTypeId,
  PrintFinanceData,
  PrintTemplateOptions,
} from './types';
import { escapeHtml } from './printHelpers';
import { getPrintStylesheet } from './styles';
import {
  generateLedgerHtml,
  generateDueCardHtml,
  generateSeizingLetterHtml,
  generateDefaulterCustomerHtml,
  generateDefaulterCoApplicantHtml,
} from './templates';

/**
 * Generates the body HTML for a single customer item and document type.
 */
export const generateSingleCustomerPrintHtml = (
  item: PrintCustomerData,
  finance: PrintFinanceData | null | undefined,
  docType: PrintDocTypeId,
  options: PrintTemplateOptions = { footer: true }
): string => {
  switch (docType) {
    case 'ledger':
      return generateLedgerHtml(item, finance, options);
    case 'due_card':
      return generateDueCardHtml(item, finance, options);
    case 'seizing_letter':
      return generateSeizingLetterHtml(item, finance, options);
    case 'defaulter_customer':
      return generateDefaulterCustomerHtml(item, finance, options);
    case 'defaulter_coapplicant':
      return generateDefaulterCoApplicantHtml(item, finance, options);
    default:
      return generateLedgerHtml(item, finance, options);
  }
};

/**
 * Builds the complete multi-customer A4 print HTML document.
 * Joins each customer's pages with `<div class="page-break"></div>`, wraps in the A4
 * `@page` stylesheet, and calculates the exact total page count (`due_card` produces
 * 2 pages per customer; all other document types produce 1 page per customer).
 */
export const buildCompletePrintHtml = (
  items: PrintCustomerData[],
  finance: PrintFinanceData | null | undefined,
  docType: PrintDocTypeId,
  options: PrintTemplateOptions = { footer: true },
  title = 'Print Document'
): BuiltPrintDocument => {
  const safeItems = Array.isArray(items) ? items : [];
  const pagesHtml: string[] = [];

  for (const item of safeItems) {
    const itemHtml = generateSingleCustomerPrintHtml(item, finance, docType, options);
    if (docType === 'due_card') {
      const splitPages = itemHtml.split('<div class="page-break"></div>');
      for (const p of splitPages) {
        if (p.trim()) pagesHtml.push(p.trim());
      }
    } else {
      pagesHtml.push(itemHtml);
    }
  }

  const bodyHtml = pagesHtml.join('\n<div class="page-break"></div>\n');
  const pageCount = pagesHtml.length;
  const stylesheet = getPrintStylesheet(options?.theme || 'classic');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${stylesheet}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  return {
    html,
    bodyHtml,
    pageCount,
    pagesHtml,
  };
};
