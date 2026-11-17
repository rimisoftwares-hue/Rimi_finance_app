'use strict';

/**
 * Pre-TTS Speech Sanitizer (`ttsSanitizer.js`) for Sarvam `bulbul:v4-flash`.
 *
 * Leaves visible UI chat text untouched while preparing spoken clauses (AUDIO ONLY):
 *   - Speaks Indian RTO & BH-series vehicle plates clearly (`TN39AB1234` -> `T N 39 A B 1234`,
 *     `TN-09-A-0005` -> `T N 0 9 A 0 0 0 5`, `22 BH 1234 AA` -> `22 B H 1234 A A`).
 *   - Localizes `₹` / `Rs.` / `INR` currency words per language (`rupees`, `ரூபாய்`, `रुपये`,
 *     `రూపాయలు`, `രൂപ`, `ರೂಪಾಯಿ`, `টাকা`, `રૂપિયા`, `ਰੁਪਏ`, `ଟଙ୍କା`) — NEVER forces Tamil onto other languages!
 *   - Expands `HPL102` / `HPL #3` -> `H P L 102` / `H P L 3` (plain spoken numbers).
 *   - Converts `YYYY-MM-DD` ISO dates into spoken month + day.
 *   - Strips Markdown (`**`, `*`, `` ` ``, `#`, table pipes `|`), inline JSON blobs,
 *     and internal tool identifiers so TTS never reads symbols aloud.
 */

const TAMIL_MONTHS = Object.freeze({
  1: 'ஜனவரி',
  2: 'பிப்ரவரி',
  3: 'மார்ச்',
  4: 'ஏப்ரல்',
  5: 'மே',
  6: 'ஜூன்',
  7: 'ஜூலை',
  8: 'ஆகஸ்ட்',
  9: 'செப்டம்பர்',
  10: 'அக்டோபர்',
  11: 'நவம்பர்',
  12: 'டிசம்பர்',
});

const HINDI_MONTHS = Object.freeze({
  1: 'जनवरी',
  2: 'फ़रवरी',
  3: 'मार्च',
  4: 'अप्रैल',
  5: 'मई',
  6: 'जून',
  7: 'जुलाई',
  8: 'अगस्त',
  9: 'सितंबर',
  10: 'अक्टूबर',
  11: 'नवंबर',
  12: 'दिसंबर',
});

const ENGLISH_MONTHS = Object.freeze({
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
});

const SPOKEN_CURRENCY_BY_LANG = Object.freeze({
  en: (amt) => `${amt} rupees`,
  ta: (amt) => `ரூபாய் ${amt}`,
  hi: (amt) => `${amt} रुपये`,
  mr: (amt) => `${amt} रुपये`,
  te: (amt) => `${amt} రూపాయలు`,
  ml: (amt) => `${amt} രൂപ`,
  kn: (amt) => `${amt} ರೂಪಾಯಿ`,
  bn: (amt) => `${amt} টাকা`,
  gu: (amt) => `${amt} રૂપિયા`,
  pa: (amt) => `${amt} ਰੁਪਏ`,
  od: (amt) => `${amt} ଟଙ୍କା`,
});

const INDIAN_STATE_CODES_PATTERN =
  'TN|PY|KL|KA|AP|TS|TG|MH|DL|GJ|RJ|UP|WB|HR|PB|MP|OD|OR|CG|JH|BR|AS|GA|UK|UA|HP|JK|LA|CH|AN|DN|DD|LD|ML|MN|MZ|NL|SK|TR|AR';

const RTO_VEHICLE_PLATE_RE = new RegExp(
  `\\b(${INDIAN_STATE_CODES_PATTERN})[-\\s]?(\\d{1,2})[-\\s]?([A-Za-z]{1,3})[-\\s]?(\\d{1,4})\\b`,
  'gi'
);
const BH_VEHICLE_PLATE_RE = /\b(\d{2})[-\s]?BH[-\s]?(\d{4})[-\s]?([A-Za-z]{1,2})\b/gi;

const INTERNAL_TOOL_NAMES_RE =
  /\b(?:get_today_collection|get_collection_by_period|get_finance_overview|get_pending_and_overdue_summary|get_agent_collection_summary|get_payment_mode_breakdown|get_loan_disbursement_summary|get_expense_summary|search_customer_loan_status|run_readonly_select_query)\b/gi;

const INLINE_JSON_RE = /\{[^{}\n]*:[^{}\n]*\}/g;
const CURRENCY_RE = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)(?:\s*\/-)?/gi;
const HPL_RE = /\bHPL(?:\s*(?:no\.?|number))?[-_\s#]*(\d+)\b/gi;
const HP_NO_RE = /\bHP(?:\s*(?:no\.?|number|#))[-_\s#]*(\d+)\b/gi;
const ISO_DATE_RE = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const TABLE_DIVIDER_RE = /^\s*\|?[\s:-]+\|[\s|:-]*$/gm;

function normalizeShortLang(langCode) {
  const raw = String(langCode || 'en').trim().toLowerCase();
  if (raw.startsWith('ta')) return 'ta';
  if (raw.startsWith('hi')) return 'hi';
  if (raw.startsWith('mr')) return 'mr';
  if (raw.startsWith('te')) return 'te';
  if (raw.startsWith('ml')) return 'ml';
  if (raw.startsWith('kn')) return 'kn';
  if (raw.startsWith('bn')) return 'bn';
  if (raw.startsWith('gu')) return 'gu';
  if (raw.startsWith('pa')) return 'pa';
  if (raw.startsWith('od') || raw.startsWith('or')) return 'od';
  return 'en';
}

function formatSpokenCurrency(amountRaw, shortLang) {
  let cleanAmt = String(amountRaw || '').trim();
  if (cleanAmt.endsWith('.00')) {
    cleanAmt = cleanAmt.slice(0, -3);
  }
  const formatter = SPOKEN_CURRENCY_BY_LANG[shortLang] || SPOKEN_CURRENCY_BY_LANG.en;
  return formatter(cleanAmt);
}

function formatPlateLetters(letters) {
  return String(letters || '')
    .toUpperCase()
    .split('')
    .join(' ');
}

function formatPlateDigits(digits) {
  const clean = String(digits || '');
  if (clean.length > 1 && clean.startsWith('0')) {
    return clean.split('').join(' ');
  }
  return clean;
}

function formatSpokenRtoPlate(_match, state, district, series, serial) {
  return `${formatPlateLetters(state)} ${formatPlateDigits(district)} ${formatPlateLetters(series)} ${formatPlateDigits(serial)}`;
}

function formatSpokenBhPlate(_match, yearDigits, serial, suffixLetters) {
  return `${formatPlateDigits(yearDigits)} B H ${formatPlateDigits(serial)} ${formatPlateLetters(suffixLetters)}`;
}

function formatSpokenIsoDate(_match, yStr, mStr, dStr, shortLang) {
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  const day = Number.parseInt(dStr, 10);
  if (shortLang === 'ta') {
    return `${TAMIL_MONTHS[month] || month} ${day}`;
  }
  if (shortLang === 'hi' || shortLang === 'mr') {
    return `${day} ${HINDI_MONTHS[month] || month} ${year}`;
  }
  return `${day} ${ENGLISH_MONTHS[month] || month} ${year}`;
}

function sanitizeForTts(rawText, languageCode = 'en-IN') {
  if (!rawText || typeof rawText !== 'string') return '';

  const shortLang = normalizeShortLang(languageCode);
  let s = rawText;

  // 1. Strip internal tool names, inline JSON snippets, and fenced code blocks
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(INLINE_JSON_RE, ' ');
  s = s.replace(INTERNAL_TOOL_NAMES_RE, ' ');

  // 2. Clean Markdown links, table dividers, pipes, headings, bullets, bold/italic, emojis
  s = s.replace(MARKDOWN_LINK_RE, '$1');
  s = s.replace(TABLE_DIVIDER_RE, ' ');
  s = s.replace(/\|/g, ', ');
  s = s.replace(EMOJI_RE, '');
  s = s.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '');
  s = s.replace(/^\s*#{1,6}\s*/gm, '');
  s = s.replace(/^\s*[-*•]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  s = s.replace(/\*/g, '');

  // 3. Spoken vehicle plates FIRST (before HP/HPL regex so `HP 12 AB 3456` is spoken as a plate)
  s = s.replace(RTO_VEHICLE_PLATE_RE, formatSpokenRtoPlate);
  s = s.replace(BH_VEHICLE_PLATE_RE, formatSpokenBhPlate);

  // 4. Spoken currency, HPL loan codes (plain numbers), and ISO dates
  s = s.replace(CURRENCY_RE, (_m, amt) => formatSpokenCurrency(amt, shortLang));
  s = s.replace(HPL_RE, 'H P L $1');
  s = s.replace(HP_NO_RE, 'H P $1');
  s = s.replace(ISO_DATE_RE, (m, y, mo, d) => formatSpokenIsoDate(m, y, mo, d, shortLang));

  // 5. Clean empty parens and collapse whitespace
  s = s.replace(/\(\s*\)/g, '');
  s = s.replace(/\(\s*([^()]+?)\s*\)/g, ', $1');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+([,.;!?।])/g, '$1');

  return s;
}

module.exports = {
  sanitizeForTts,
  formatSpokenCurrency,
  normalizeShortLang,
};
