import type { PrintThemeId } from '../types';
import { BASE_PRINT_STYLES } from './basePrintStyles';
import { LEDGER_PRINT_STYLES } from './ledgerStyles';
import { DUE_CARD_PRINT_STYLES } from './dueCardStyles';
import { NOTICE_LETTER_PRINT_STYLES } from './noticeLetterStyles';
import { getThemePrintStyles } from './themeStyles';

export const getPrintStylesheet = (theme: PrintThemeId = 'classic'): string => {
  return [
    BASE_PRINT_STYLES,
    LEDGER_PRINT_STYLES,
    DUE_CARD_PRINT_STYLES,
    NOTICE_LETTER_PRINT_STYLES,
    getThemePrintStyles(theme),
  ]
    .filter(Boolean)
    .join('\n');
};

export const PRINT_A4_STYLESHEET = getPrintStylesheet('classic');

export {
  BASE_PRINT_STYLES,
  LEDGER_PRINT_STYLES,
  DUE_CARD_PRINT_STYLES,
  NOTICE_LETTER_PRINT_STYLES,
  getThemePrintStyles,
};
