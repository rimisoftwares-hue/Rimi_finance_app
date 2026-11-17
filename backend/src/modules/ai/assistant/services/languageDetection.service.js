'use strict';

/**
 * Universal Multilingual & Code-Mix Detector (`languageDetection.service.js`).
 *
 * Priority order:
 *   1. Explicit Sarvam `saaras:v3` acoustic `sttLanguageCode` + unambiguous Unicode script verification
 *   2. Unicode script ranges across all Indic scripts (`ta`, `hi`/`mr` Devanagari, `te`, `ml`, `kn`, `bn`, `gu`, `pa`, `od`) + international scripts
 *   3. Romanized code-mix heuristics (`tanglish`, `hinglish`, `manglish`, `kanglish`, `tenglish`, `marathi`, `banglish`)
 *   4. Ambiguous Latin / empty fallback -> `'en-IN'` (NEVER biased to Tamil!)
 */

const SCRIPT_RANGES = Object.freeze({
  ta: /[\u0B80-\u0BFF]/g,
  devanagari: /[\u0900-\u097F]/g,
  te: /[\u0C00-\u0C7F]/g,
  ml: /[\u0D00-\u0D7F]/g,
  kn: /[\u0C80-\u0CFF]/g,
  bn: /[\u0980-\u09FF]/g,
  gu: /[\u0A80-\u0AFF]/g,
  pa: /[\u0A00-\u0A7F]/g,
  od: /[\u0B00-\u0B7F]/g,
  arabic: /[\u0600-\u06FF]/g,
  cyrillic: /[\u0400-\u04FF]/g,
  cjk: /[\u4E00-\u9FFF\u3040-\u30FF]/g,
  hangul: /[\uAC00-\uD7AF]/g,
  sinhala: /[\u0D80-\u0DFF]/g,
  latin: /[a-zA-Z]/g,
});

// Marathi Devanagari disambiguators (ळ \u0933 + high-frequency Marathi words)
const MARATHI_DEVANAGARI_RE =
  /\u0933|(?:^|\s)(?:आहे|आहेत|नाही|काय|किती|थकबाकी|पैसा|पैसे|महिना|येणे|दिले|झाले|कोणाचे|सांगा)(?=\s|$|[?.!,।])/u;

// Romanized code-mix markers for Indian languages
const TANGLISH_MARKERS_RE =
  /\b(?:innaiku|iniki|inaiku|nethu|naalaiku|evlo|evalo|evvalavu|vandhurukku|vandhuruku|vanthuruku|vanthurukku|irukku|iruku|sollu|sollunga|kudu|kudunga|panam|katti|kattatha|mudinja|masam|maasam|varusham|athigama|adhigama|kammiya|yaaru|yaar|yaru|epdi|eppadi|enga|ethanai|ethana|kanakku|kanaku|pannu|panna|pannunga|romba|konjam|mattum|ellam)\b/gi;

const HINGLISH_MARKERS_RE =
  /\b(?:aaj|kal|kitna|kitne|kitni|aaya|hai|hain|batao|bataiye|paisa|udhaar|kisne|zyada|kam|mahina|mahine|kya|kaun|abhi|kul|hisaab|vasooli|jama|baki|baaki)\b/gi;

const MANGLISH_MARKERS_RE =
  /\b(?:innu|innathe|ethra|vannittundu|vannu|undu|parayu|parayamo|kittiyathu|masathe|varshathe|aarokke|enthanu|evide|adacha|adakkan|bakiyaaya)\b/gi;

const KANGLISH_MARKERS_RE =
  /\b(?:ivattu|ivattina|eshtu|bandide|ide|heli|kodi|hಣ|hana|tingalu|varsha|yaaru|hege|elli|ulidide|kattidare)\b/gi;

const TENGLISH_MARKERS_RE =
  /\b(?:eroju|eeroju|entha|vachindi|undi|cheppandi|cheppu|dabbulu|nela|evaru|ela|ekkada|kattaru|migilina)\b/gi;

const MARATHI_ROMAN_MARKERS_RE =
  /\b(?:aajche|kiti|aahe|aahet|sang|sanga|thakbaki|jamaa|mahinyache|konache|zale)\b/gi;

const BANGLISH_MARKERS_RE =
  /\b(?:aajke|koto|esheche|ache|bolun|bolo|taka|masher|keu|kothay|baki)\b/gi;

const LANGUAGE_META = Object.freeze({
  'en-IN': {
    code: 'en-IN',
    shortCode: 'en',
    label: 'English',
    englishName: 'English',
    defaultStyle: 'english',
  },
  'ta-IN': {
    code: 'ta-IN',
    shortCode: 'ta',
    label: 'தமிழ்',
    englishName: 'Tamil',
    defaultStyle: 'tamil',
  },
  'hi-IN': {
    code: 'hi-IN',
    shortCode: 'hi',
    label: 'हिंदी',
    englishName: 'Hindi',
    defaultStyle: 'hindi',
  },
  'mr-IN': {
    code: 'mr-IN',
    shortCode: 'mr',
    label: 'मराठी',
    englishName: 'Marathi',
    defaultStyle: 'marathi',
  },
  'te-IN': {
    code: 'te-IN',
    shortCode: 'te',
    label: 'తెలుగు',
    englishName: 'Telugu',
    defaultStyle: 'telugu',
  },
  'ml-IN': {
    code: 'ml-IN',
    shortCode: 'ml',
    label: 'മലയാളം',
    englishName: 'Malayalam',
    defaultStyle: 'malayalam',
  },
  'kn-IN': {
    code: 'kn-IN',
    shortCode: 'kn',
    label: 'ಕನ್ನಡ',
    englishName: 'Kannada',
    defaultStyle: 'kannada',
  },
  'bn-IN': {
    code: 'bn-IN',
    shortCode: 'bn',
    label: 'বাংলা',
    englishName: 'Bengali',
    defaultStyle: 'bengali',
  },
  'gu-IN': {
    code: 'gu-IN',
    shortCode: 'gu',
    label: 'ગુજરાતી',
    englishName: 'Gujarati',
    defaultStyle: 'gujarati',
  },
  'pa-IN': {
    code: 'pa-IN',
    shortCode: 'pa',
    label: 'ਪੰਜਾਬੀ',
    englishName: 'Punjabi',
    defaultStyle: 'punjabi',
  },
  'od-IN': {
    code: 'od-IN',
    shortCode: 'od',
    label: 'ଓଡ଼ିଆ',
    englishName: 'Odia',
    defaultStyle: 'odia',
  },
});

function normalizeProviderLangCode(rawCode) {
  if (!rawCode) return null;
  const norm = String(rawCode).trim().toLowerCase().replace(/_/g, '-');
  if (!norm || norm === 'unknown' || norm === 'auto' || norm === 'und') return null;
  if (norm.startsWith('en')) return 'en-IN';
  if (norm.startsWith('ta')) return 'ta-IN';
  if (norm.startsWith('hi')) return 'hi-IN';
  if (norm.startsWith('mr')) return 'mr-IN';
  if (norm.startsWith('te')) return 'te-IN';
  if (norm.startsWith('ml')) return 'ml-IN';
  if (norm.startsWith('kn')) return 'kn-IN';
  if (norm.startsWith('bn')) return 'bn-IN';
  if (norm.startsWith('gu')) return 'gu-IN';
  if (norm.startsWith('pa')) return 'pa-IN';
  if (norm.startsWith('od') || norm.startsWith('or')) return 'od-IN';
  return null;
}

function countMatches(str, regex) {
  const m = str.match(regex);
  return m ? m.length : 0;
}

function buildLanguageDirective(code, style) {
  if (style === 'international') {
    return 'Respond naturally, warmly, and idiomatically in the EXACT language and script the user used in their latest message. Do NOT switch to Tamil or English unless the user spoke English.';
  }
  if (style === 'tanglish') {
    return 'The user spoke in Tanglish (Tamil + English code-mix). Respond in natural, friendly conversational Tamil Unicode mixed lightly with familiar finance words (collection, EMI, loan, pending) so both reading and spoken voice sound completely natural. Do NOT switch to pure English.';
  }
  if (style === 'hinglish') {
    return 'The user spoke in Hinglish (Hindi + English code-mix). Respond in natural, friendly conversational Hindi (हिंदी Devanagari script) mixed lightly with familiar finance words (collection, EMI, loan, pending).';
  }
  if (style === 'manglish') {
    return 'The user spoke in Manglish (Malayalam + English code-mix). Respond naturally and warmly in Malayalam (മലയാളം script) with natural finance terms.';
  }
  if (style === 'kanglish') {
    return 'The user spoke in Kanglish (Kannada + English code-mix). Respond naturally and warmly in Kannada (ಕನ್ನಡ script) with natural finance terms.';
  }
  if (style === 'tenglish') {
    return 'The user spoke in Tenglish (Telugu + English code-mix). Respond naturally and warmly in Telugu (తెలుగు script) with natural finance terms.';
  }

  const meta = LANGUAGE_META[code] || LANGUAGE_META['en-IN'];
  if (code === 'en-IN') {
    return 'Respond clearly, warmly, and naturally in conversational Indian English. Mirror the user if they switch to another language on a later turn.';
  }
  return `Respond naturally, warmly, and politely in ${meta.englishName} (${meta.label} script). Common finance terms like collection, EMI, loan, UPI, HPL may remain natural, and format Indian rupees with ₹. Do NOT switch to English or Tamil unless ${meta.englishName} IS Tamil.`;
}

/**
 * Detects language and conversational style for a user utterance.
 *
 * @param {string} text User transcript or typed message
 * @param {{ sttLanguageCode?: string|null, preferredLanguage?: string|null }} [hints={}]
 */
function detectTurnLanguage(text, hints = {}) {
  const s = String(text || '').trim();
  const sttCode = normalizeProviderLangCode(hints.sttLanguageCode);
  const prefCode = normalizeProviderLangCode(hints.preferredLanguage);

  const wantsRefresh =
    /\b(?:refresh|reload|latest\s+live|recheck|pudhu\s+data|ippo\s+refresh)\b|புதுப்பி|ரிஃப்ரெஷ்|रिफ्रेश/i.test(
      s
    );

  // Count Indic & international Unicode script characters
  const indicCounts = [
    { key: 'ta-IN', chars: countMatches(s, SCRIPT_RANGES.ta) },
    {
      key: MARATHI_DEVANAGARI_RE.test(s) || sttCode === 'mr-IN' ? 'mr-IN' : 'hi-IN',
      chars: countMatches(s, SCRIPT_RANGES.devanagari),
    },
    { key: 'te-IN', chars: countMatches(s, SCRIPT_RANGES.te) },
    { key: 'ml-IN', chars: countMatches(s, SCRIPT_RANGES.ml) },
    { key: 'kn-IN', chars: countMatches(s, SCRIPT_RANGES.kn) },
    { key: 'bn-IN', chars: countMatches(s, SCRIPT_RANGES.bn) },
    { key: 'gu-IN', chars: countMatches(s, SCRIPT_RANGES.gu) },
    { key: 'pa-IN', chars: countMatches(s, SCRIPT_RANGES.pa) },
    { key: 'od-IN', chars: countMatches(s, SCRIPT_RANGES.od) },
  ].sort((a, b) => b.chars - a.chars);

  const topIndic = indicCounts[0];
  const latinChars = countMatches(s, SCRIPT_RANGES.latin);
  const intlChars =
    countMatches(s, SCRIPT_RANGES.arabic) +
    countMatches(s, SCRIPT_RANGES.cyrillic) +
    countMatches(s, SCRIPT_RANGES.cjk) +
    countMatches(s, SCRIPT_RANGES.hangul) +
    countMatches(s, SCRIPT_RANGES.sinhala);

  // Romanized code-mix marker counts
  const romanScores = [
    { code: 'ta-IN', style: 'tanglish', hits: countMatches(s, TANGLISH_MARKERS_RE), minHits: 1 },
    { code: 'hi-IN', style: 'hinglish', hits: countMatches(s, HINGLISH_MARKERS_RE), minHits: 2 },
    { code: 'ml-IN', style: 'manglish', hits: countMatches(s, MANGLISH_MARKERS_RE), minHits: 1 },
    { code: 'kn-IN', style: 'kanglish', hits: countMatches(s, KANGLISH_MARKERS_RE), minHits: 1 },
    { code: 'te-IN', style: 'tenglish', hits: countMatches(s, TENGLISH_MARKERS_RE), minHits: 1 },
    { code: 'mr-IN', style: 'marathi', hits: countMatches(s, MARATHI_ROMAN_MARKERS_RE), minHits: 2 },
    { code: 'bn-IN', style: 'bengali', hits: countMatches(s, BANGLISH_MARKERS_RE), minHits: 2 },
  ].sort((a, b) => b.hits - a.hits);

  const topRoman = romanScores[0];

  // Default strictly to English ('en-IN') — NEVER default ambiguous text to Tamil!
  let code = 'en-IN';
  let style = 'english';

  if (topIndic.chars > 0) {
    // 1. Unambiguous Indic Unicode script in transcript/input
    code = topIndic.key;
    if (code === 'ta-IN' && latinChars > topIndic.chars * 2) {
      style = 'tanglish';
    } else {
      style = LANGUAGE_META[code].defaultStyle;
    }
  } else if (intlChars > 0) {
    // 2. Non-Indic international Unicode script (Arabic, CJK, Cyrillic, etc.)
    code = 'en-IN'; // Sarvam bulbul:v3 TTS accepts Indian BCP-47 codes; Gemini still replies in exact user language
    style = 'international';
  } else if (sttCode && sttCode !== 'en-IN') {
    // 3. Explicit acoustic language detected by Sarvam saaras:v3
    code = sttCode;
    if (latinChars > 0 && sttCode === 'ta-IN') {
      style = 'tanglish';
    } else if (latinChars > 0 && sttCode === 'hi-IN') {
      style = 'hinglish';
    } else if (latinChars > 0 && sttCode === 'ml-IN') {
      style = 'manglish';
    } else if (latinChars > 0 && sttCode === 'kn-IN') {
      style = 'kanglish';
    } else if (latinChars > 0 && sttCode === 'te-IN') {
      style = 'tenglish';
    } else {
      style = LANGUAGE_META[code]?.defaultStyle || 'english';
    }
  } else if (topRoman.hits >= topRoman.minHits && (!sttCode || topRoman.hits >= 2)) {
    // 4. Romanized Indian code-mix markers in Latin text
    code = topRoman.code;
    style = topRoman.style;
  } else if (sttCode === 'en-IN' || latinChars > 0) {
    // 5. Latin / English input -> strictly 'en-IN'
    code = 'en-IN';
    style = 'english';
  } else if (prefCode) {
    code = prefCode;
    style = LANGUAGE_META[prefCode]?.defaultStyle || 'english';
  }

  const meta = LANGUAGE_META[code] || LANGUAGE_META['en-IN'];
  const label =
    style === 'tanglish'
      ? 'Tanglish / தமிழ்'
      : style === 'hinglish'
        ? 'Hinglish / हिंदी'
        : style === 'international'
          ? 'Multilingual'
          : meta.label;

  return {
    code: meta.code,
    shortCode: meta.shortCode,
    style,
    label,
    directive: buildLanguageDirective(meta.code, style),
    wantsRefresh,
  };
}

module.exports = {
  LANGUAGE_META,
  normalizeProviderLangCode,
  detectTurnLanguage,
};
