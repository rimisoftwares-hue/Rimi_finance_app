import type { PrintThemeId } from '../types';

export const getThemePrintStyles = (theme: PrintThemeId = 'classic'): string => {
  if (theme === 'classic') {
    return '';
  }
  return '';
};
