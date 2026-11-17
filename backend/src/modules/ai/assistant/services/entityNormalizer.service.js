'use strict';

/**
 * Deterministic Multilingual Entity Normalizer (`entityNormalizer.service.js`).
 *
 * Converts spoken STT transcripts (words, Indic scripts, spaced letters, colloquial Tamil/Hindi/English)
 * into structured lookup entities (`hplno`, `vehiclePlate`, `phone`, `listPosition`, `isCorrectionOrSwitch`).
 *
 * Coverage (explicitly table-driven, zero regex guesswork):
 *   1. Unicode digits -> ASCII across ALL 10 Indic scripts + Arabic-Indic + Fullwidth digits.
 *   2. Spoken numbers & ordinals:
 *      - Full coverage (`0..999,999`, cardinals + ordinals + colloquial forms): Tamil (script + Tanglish),
 *        English, and Hindi (Devanagari + Hinglish `0..99`, `100`, `1000`).
 *      - Best-effort basic `0..10` cardinals/ordinals + full Unicode digits: Malayalam, Telugu,
 *        Kannada, Bengali, Gujarati, Punjabi (Gurmukhi), and Odia.
 *   3. Strict HPL cue rule: extracts `hplno` ONLY with an explicit HP/HPL/loan/customer-number cue
 *      (never bare amounts, dates, or durations); distinguishes list-position ordinals ("the third one")
 *      and flags genuine ambiguity (`ambiguous: true`).
 *   4. Indian RTO (`SS NN L{1,3} NNNN`) & Bharat (`NN BH NNNN LL`) vehicle plates: supports all
 *      Indian State/UT codes, spaced English/Tamil/Hindi letter names, spoken numbers, leading-zero
 *      variants (`TN09A0005` <-> `TN9A5`), and cue-gated last-4 digits (`{ last4: '1234' }`).
 *   5. Cue-gated phone numbers (full 10-digit or last-4) and mid-conversation correction/switch detection.
 */

const INDIAN_STATE_CODES = Object.freeze(
  new Set([
    'TN', 'PY', 'KL', 'KA', 'AP', 'TS', 'TG', 'MH', 'DL', 'GJ',
    'RJ', 'UP', 'WB', 'HR', 'PB', 'MP', 'OD', 'OR', 'CG', 'JH',
    'BR', 'AS', 'GA', 'UK', 'UA', 'HP', 'JK', 'LA', 'CH', 'AN',
    'DN', 'DD', 'LD', 'ML', 'MN', 'MZ', 'NL', 'SK', 'TR', 'AR',
  ])
);

// Zero-codepoint offsets for decimal `0..9` blocks across Indic, Arabic-Indic, and Fullwidth scripts
const UNICODE_ZERO_OFFSETS = Object.freeze([
  0x0660, // Arabic-Indic ٠..٩
  0x06f0, // Extended Arabic-Indic ۰..۹
  0x0966, // Devanagari ०..९
  0x09e6, // Bengali ০..৯
  0x0a66, // Gurmukhi ੦..੯
  0x0ae6, // Gujarati ૦..૯
  0x0b66, // Odia ୦..୯
  0x0be6, // Tamil ௦..௯
  0x0c66, // Telugu ౦..౯
  0x0ce6, // Kannada ೦..೯
  0x0d66, // Malayalam ൦..൯
  0xff10, // Fullwidth ０..９
]);

/**
 * Converts all Indic, Arabic-Indic, and Fullwidth decimal digits (plus Tamil 10/100/1000 signs)
 * to standard ASCII digits `0-9`.
 */
function normalizeUnicodeDigits(input) {
  const str = String(input ?? '');
  if (!str) return '';

  let out = '';
  for (let i = 0; i < str.length; i += 1) {
    const cp = str.charCodeAt(i);
    if (cp === 0x0bf0) {
      out += ' 10 ';
      continue;
    }
    if (cp === 0x0bf1) {
      out += ' 100 ';
      continue;
    }
    if (cp === 0x0bf2) {
      out += ' 1000 ';
      continue;
    }
    let mapped = null;
    for (let b = 0; b < UNICODE_ZERO_OFFSETS.length; b += 1) {
      const zeroCp = UNICODE_ZERO_OFFSETS[b];
      if (cp >= zeroCp && cp <= zeroCp + 9) {
        mapped = String(cp - zeroCp);
        break;
      }
    }
    out += mapped !== null ? mapped : str[i];
  }
  return out;
}

// ─── Table-Driven Number Lexicon ──────────────────────────────────────────────
// Entry kinds:
//   - `{ kind: 'val', value: N, ordinal?: boolean }` (additive value `0..900`)
//   - `{ kind: 'mul', value: 100 | 1000 }`           (place multiplier, e.g. "hundred", "ஆயிரம்", "सौ")
const NUMBER_WORD_TABLE = (() => {
  const map = new Map();
  const addVal = (words, value, ordinal = false) => {
    for (const w of words) {
      map.set(w.toLowerCase(), { kind: 'val', value, ordinal });
    }
  };
  const addMul = (words, value) => {
    for (const w of words) {
      map.set(w.toLowerCase(), { kind: 'mul', value });
    }
  };

  // 1. English (0..90 + ordinals + multipliers)
  addVal(['zero', 'oh', 'nil'], 0);
  addVal(['one'], 1);
  addVal(['first', '1st'], 1, true);
  addVal(['two'], 2);
  addVal(['second', '2nd'], 2, true);
  addVal(['three'], 3);
  addVal(['third', '3rd'], 3, true);
  addVal(['four'], 4);
  addVal(['fourth', '4th'], 4, true);
  addVal(['five'], 5);
  addVal(['fifth', '5th'], 5, true);
  addVal(['six'], 6);
  addVal(['sixth', '6th'], 6, true);
  addVal(['seven'], 7);
  addVal(['seventh', '7th'], 7, true);
  addVal(['eight'], 8);
  addVal(['eighth', '8th'], 8, true);
  addVal(['nine'], 9);
  addVal(['ninth', '9th'], 9, true);
  addVal(['ten'], 10);
  addVal(['tenth', '10th'], 10, true);
  addVal(['eleven'], 11);
  addVal(['eleventh', '11th'], 11, true);
  addVal(['twelve'], 12);
  addVal(['twelfth', '12th'], 12, true);
  addVal(['thirteen'], 13);
  addVal(['thirteenth', '13th'], 13, true);
  addVal(['fourteen'], 14);
  addVal(['fourteenth', '14th'], 14, true);
  addVal(['fifteen'], 15);
  addVal(['fifteenth', '15th'], 15, true);
  addVal(['sixteen'], 16);
  addVal(['sixteenth', '16th'], 16, true);
  addVal(['seventeen'], 17);
  addVal(['seventeenth', '17th'], 17, true);
  addVal(['eighteen'], 18);
  addVal(['eighteenth', '18th'], 18, true);
  addVal(['nineteen'], 19);
  addVal(['nineteenth', '19th'], 19, true);
  addVal(['twenty'], 20);
  addVal(['twentieth', '20th'], 20, true);
  addVal(['thirty'], 30);
  addVal(['thirtieth', '30th'], 30, true);
  addVal(['forty', 'fourty'], 40);
  addVal(['fortieth', '40th'], 40, true);
  addVal(['fifty'], 50);
  addVal(['fiftieth', '50th'], 50, true);
  addVal(['sixty'], 60);
  addVal(['sixtieth', '60th'], 60, true);
  addVal(['seventy'], 70);
  addVal(['seventieth', '70th'], 70, true);
  addVal(['eighty'], 80);
  addVal(['eightieth', '80th'], 80, true);
  addVal(['ninety'], 90);
  addVal(['ninetieth', '90th'], 90, true);
  addMul(['hundred', 'hundreds'], 100);
  addMul(['thousand', 'thousands'], 1000);

  // 2. Tamil (formal + colloquial + Tanglish + combining stems + fused compounds + hundreds/thousands)
  addVal(['பூஜ்ஜியம்', 'பூஜ்யம்', 'சைபர்', 'சுழியம்', 'poojiyam', 'cyber'], 0);
  addVal(['ஒன்று', 'ஒண்ணு', 'ஒன்னு', 'ஒரு', 'onru', 'ondru', 'onnu', 'oru'], 1);
  addVal(
    ['முதல்', 'முதலாவது', 'முதலாம்', 'ஒன்றாவது', 'ஒண்ணாவது', 'ஒன்னாவது', 'muthal', 'muthalavathu', 'onnavathu', 'ondravathu'],
    1,
    true
  );
  addVal(['இரண்டு', 'ரெண்டு', 'இரு', 'irandu', 'rendu'], 2);
  addVal(['இரண்டாவது', 'ரெண்டாவது', 'இரண்டாம்', 'irandavathu', 'rendavathu'], 2, true);
  addVal(['மூன்று', 'மூணு', 'மூனு', 'moondru', 'moonu', 'munu'], 3);
  addVal(['மூன்றாவது', 'மூணாவது', 'மூனாவது', 'மூன்றாம்', 'moondravathu', 'moonavathu', 'munavathu'], 3, true);
  addVal(['நான்கு', 'நாலு', 'nangu', 'naangu', 'naalu', 'nalu'], 4);
  addVal(['நான்காவது', 'நாலாவது', 'நான்காம்', 'nangavathu', 'naalavathu', 'nalavathu'], 4, true);
  addVal(['ஐந்து', 'அஞ்சு', 'ainthu', 'aindhu', 'anju', 'anchu'], 5);
  addVal(['ஐந்தாவது', 'அஞ்சாவது', 'ஐந்தாம்', 'ainthavathu', 'anjavathu'], 5, true);
  addVal(['ஆறு', 'aaru', 'aru'], 6);
  addVal(['ஆறாவது', 'ஆறாம்', 'aaravathu', 'aravathu'], 6, true);
  addVal(['ஏழு', 'ezhu', 'elu', 'yezhu'], 7);
  addVal(['ஏழாவது', 'ஏழாம்', 'ezhavathu', 'elavathu'], 7, true);
  addVal(['எட்டு', 'ettu'], 8);
  addVal(['எட்டாவது', 'எட்டாம்', 'ettavathu'], 8, true);
  addVal(['ஒன்பது', 'onpathu', 'onbadhu', 'ombathu'], 9);
  addVal(['ஒன்பதாவது', 'ஒன்பதாம்', 'onpathavathu', 'onbadhavathu'], 9, true);
  addVal(['பத்து', 'pathu', 'paththu'], 10);
  addVal(['பத்தாவது', 'பத்தாம்', 'pathavathu'], 10, true);
  addVal(['பதினொன்று', 'பதினொண்ணு', 'பதினொன்னு', 'pathinondru', 'pathinonnu'], 11);
  addVal(['பன்னிரண்டு', 'பன்னிரெண்டு', 'பனிரெண்டு', 'pannirandu', 'pannirendu', 'panirendu'], 12);
  addVal(['பதின்மூன்று', 'பதின்மூணு', 'பதிமூன்று', 'பதிமூணு', 'pathinmoondru', 'pathinmoonu', 'pathimoonu'], 13);
  addVal(['பதினான்கு', 'பதினாலு', 'pathinangu', 'pathinaalu', 'pathinalu'], 14);
  addVal(['பதினைந்து', 'பதினஞ்சு', 'pathinainthu', 'pathinanju'], 15);
  addVal(['பதினாறு', 'pathinaaru', 'pathinaru'], 16);
  addVal(['பதினேழு', 'pathinezhu', 'pathinelu'], 17);
  addVal(['பதினெட்டு', 'pathinettu'], 18);
  addVal(['பத்தொன்பது', 'pathonpathu', 'pathonbadhu'], 19);

  // Tamil tens & combining prefixes (`இருபத்தி ஒன்பது` -> 20 + 9 = 29)
  addVal(['இருபது', 'இருபத்தி', 'இருபத்து', 'irupathu', 'irupathi', 'irubaththi'], 20);
  addVal(['முப்பது', 'முப்பத்தி', 'முப்பத்து', 'muppathu', 'muppathi', 'muppaththi'], 30);
  addVal(['நாற்பது', 'நாற்பத்தி', 'நாற்பத்து', 'நாப்பது', 'நாப்பத்தி', 'narpathu', 'nappathu', 'nappathi'], 40);
  addVal(['ஐம்பது', 'ஐம்பத்தி', 'ஐம்பத்து', 'அம்பது', 'அம்பத்தி', 'aimbathu', 'ambathu', 'ambathi'], 50);
  addVal(['அறுபது', 'அறுபத்தி', 'அறுபத்து', 'arupathu', 'arupathi'], 60);
  addVal(['எழுபது', 'எழுபத்தி', 'எழுபத்து', 'ezhupathu', 'ezhupathi'], 70);
  addVal(['எண்பது', 'எண்பத்தி', 'எண்பத்து', 'enbathu', 'enbathi'], 80);
  addVal(['தொண்ணூறு', 'தொண்ணூற்றி', 'தொண்ணூத்தி', 'thonnooru', 'thonnoothi'], 90);

  // Fused single-word Tamil compounds 21..99 (e.g. `முப்பத்தொன்பது` = 39)
  const tamilTensRoots = [
    [20, ['இருபத்', 'இருபத்து']],
    [30, ['முப்பத்', 'முப்பத்து']],
    [40, ['நாற்பத்', 'நாப்பத்']],
    [50, ['ஐம்பத்', 'அம்பத்']],
    [60, ['அறுபத்']],
    [70, ['எழுபத்']],
    [80, ['எண்பத்']],
  ];
  const tamilUnitSandhi = [
    [1, ['தொன்று', 'தொண்ணு', 'தொன்னு']],
    [2, ['திரண்டு', 'திரெண்டு']],
    [3, ['துமூன்று', 'துமூணு', 'திமூன்று', 'திமூணு']],
    [4, ['துநான்கு', 'துநாலு', 'திநாலு']],
    [5, ['தைந்து', 'தஞ்சு']],
    [6, ['தாறு']],
    [7, ['தேழு']],
    [8, ['தெட்டு']],
    [9, ['தொன்பது']],
  ];
  for (const [tenVal, roots] of tamilTensRoots) {
    for (const [unitVal, suffixes] of tamilUnitSandhi) {
      for (const r of roots) {
        for (const suf of suffixes) {
          addVal([`${r}${suf}`], tenVal + unitVal);
        }
      }
    }
  }
  const tamil90Suffixes = [
    [1, ['றொன்று', 'றொண்ணு']],
    [2, ['றிரண்டு', 'றிரெண்டு']],
    [3, ['றுமூன்று', 'றுமூணு']],
    [4, ['றுநான்கு', 'றுநாலு']],
    [5, ['றைந்து', 'றஞ்சு']],
    [6, ['றாறு']],
    [7, ['றேழு']],
    [8, ['றெட்டு']],
    [9, ['றொன்பது']],
  ];
  for (const [unitVal, suffixes] of tamil90Suffixes) {
    for (const suf of suffixes) {
      addVal([`தொண்ணூற்${suf}`], 90 + unitVal);
    }
  }

  // Tamil hundreds & thousands
  addVal(['நூறு', 'நூற்றி', 'நூத்தி', 'nooru', 'noothi', 'nootri'], 100);
  addVal(['இருநூறு', 'இருநூற்றி', 'இருநூத்தி', 'irunooru', 'irunoothi'], 200);
  addVal(['முந்நூறு', 'முன்னூறு', 'முந்நூற்றி', 'முன்னூத்தி', 'munnooru', 'munnoothi'], 300);
  addVal(['நானூறு', 'நானூற்றி', 'நானூத்தி', 'naanooru', 'naanoothi'], 400);
  addVal(['ஐநூறு', 'ஐந்நூறு', 'ஐநூற்றி', 'அஞ்ஞூறு', 'ainooru'], 500);
  addVal(['அறுநூறு', 'அறுநூற்றி', 'அறுநூத்தி', 'arunooru'], 600);
  addVal(['எழுநூறு', 'எழுநூற்றி', 'எழுநூத்தி', 'ezhunooru'], 700);
  addVal(['எண்ணூறு', 'எண்ணூற்றி', 'எண்ணூத்தி', 'ennooru'], 800);
  addVal(['தொள்ளாயிரம்', 'தொள்ளாயிரத்தி', 'தொள்ளாயிரத்து', 'thollayiram'], 900);
  addMul(['ஆயிரம்', 'ஆயிரத்தி', 'ஆயிரத்து', 'aayiram', 'ayiram'], 1000);
  addVal(['இரண்டாயிரம்', 'ரெண்டாயிரம்', 'இரண்டாயிரத்தி', 'ரெண்டாயிரத்தி'], 2000);
  addVal(['மூவாயிரம்', 'மூணாயிரம்', 'மூவாயிரத்தி'], 3000);
  addVal(['நாலாயிரம்', 'நான்காயிரம்'], 4000);
  addVal(['ஐயாயிரம்', 'அஞ்சாயிரம்'], 5000);

  // 3. Hindi (0..99 exact Devanagari table + ordinals + Hinglish + 100/1000 multipliers)
  const hindiCardinals = [
    [0, ['शून्य', 'जीरो', 'ज़ीरो', 'shunya']],
    [1, ['एक', 'ek']],
    [2, ['दो', 'do']],
    [3, ['तीन', 'teen']],
    [4, ['चार', 'chaar', 'char']],
    [5, ['पांच', 'पाँच', 'paanch', 'panch']],
    [6, ['छह', 'छः', 'छे', 'chhah', 'chhe']],
    [7, ['सात', 'saat']],
    [8, ['आठ', 'aath']],
    [9, ['नौ', 'nau']],
    [10, ['दस', 'das']],
    [11, ['ग्यारह', 'gyarah']],
    [12, ['बारह', 'barah']],
    [13, ['तेरह', 'terah']],
    [14, ['चौदह', 'chaudah']],
    [15, ['पंद्रह', 'पन्द्रह', 'pandrah']],
    [16, ['सोलह', 'solah']],
    [17, ['सत्रह', 'satrah']],
    [18, ['अठारह', 'atharah']],
    [19, ['उन्नीस', 'unnis']],
    [20, ['बीस', 'bees']],
    [21, ['इक्कीस']], [22, ['बाईस']], [23, ['तेईस']], [24, ['चौबीस']], [25, ['पच्चीस']],
    [26, ['छब्बीस']], [27, ['सत्ताईस']], [28, ['अट्ठाईस']], [29, ['उनतीस']], [30, ['तीस', 'tees']],
    [31, ['इकतीस']], [32, ['बत्तीस']], [33, ['तैंतीस']], [34, ['चौंतीस']], [35, ['पैंतीस']],
    [36, ['छत्तीस']], [37, ['सैंतीस']], [38, ['अड़तीस']], [39, ['उनतालीस', 'untalis']], [40, ['चालीस', 'chalis']],
    [41, ['इकतालीस']], [42, ['बयालीस']], [43, ['तैंतालीस']], [44, ['चवालीस']], [45, ['पैंतालीस']],
    [46, ['छियालीस']], [47, ['सैंतालीस']], [48, ['अड़तालीस']], [49, ['उनचास']], [50, ['पचास', 'pachas']],
    [51, ['इक्यावन']], [52, ['बावन']], [53, ['तिरेपन']], [54, ['चौवन']], [55, ['पचपन']],
    [56, ['छप्पन']], [57, ['सत्तावन']], [58, ['अट्ठावन']], [59, ['उनसठ']], [60, ['साठ', 'saath']],
    [61, ['इकसठ']], [62, ['बासठ']], [63, ['तिरेसठ']], [64, ['चौंसठ']], [65, ['पैंसठ']],
    [66, ['छियासठ']], [67, ['सड़सठ']], [68, ['अड़सठ']], [69, ['उनहत्तर']], [70, ['सत्तर', 'sattar']],
    [71, ['इकहत्तर']], [72, ['बहत्तर']], [73, ['तिहत्तर']], [74, ['चौहत्तर']], [75, ['पचहत्तर']],
    [76, ['छिहत्तर']], [77, ['सतहत्तर']], [78, ['अठहत्तर']], [79, ['उनासी']], [80, ['अस्सी', 'assi']],
    [81, ['इक्यासी']], [82, ['बयासी']], [83, ['तिरासी']], [84, ['चौरासी']], [85, ['पचासी']],
    [86, ['छियासी']], [87, ['सत्तासी']], [88, ['अट्ठासी']], [89, ['नवासी']], [90, ['नब्बे', 'nabbe']],
    [91, ['इक्यानवे']], [92, ['बानवे']], [93, ['तिरानवे']], [94, ['चौरानवे']], [95, ['पचानवे']],
    [96, ['छियानवे']], [97, ['सत्तानवे']], [98, ['अट्ठानवे']], [99, ['निन्यानवे']],
  ];
  for (const [val, words] of hindiCardinals) {
    addVal(words, val);
  }
  addVal(['पहला', 'पहली', 'पहले', 'pehla', 'pehli'], 1, true);
  addVal(['दूसरा', 'दूसरी', 'दूसरे', 'doosra', 'dusra'], 2, true);
  addVal(['तीसरा', 'तीसरी', 'तीसरे', 'teesra', 'tisra'], 3, true);
  addVal(['चौथा', 'चौथी', 'चौथे', 'chautha'], 4, true);
  addVal(['पांचवां', 'पाँचवाँ', 'पांचवा', 'panchva'], 5, true);
  addVal(['छठा', 'छठी', 'छठवां', 'chhatha'], 6, true);
  addVal(['सातवां', 'सातवाँ', 'saatva'], 7, true);
  addVal(['आठवां', 'आठवाँ', 'aathva'], 8, true);
  addVal(['नौवां', 'नौवाँ', 'nauva'], 9, true);
  addVal(['दसवां', 'दसवाँ', 'dasva'], 10, true);
  addMul(['सौ', 'sau'], 100);
  addMul(['हज़ार', 'हजार', 'hazaar', 'hazar'], 1000);

  // 4. Best-effort basic 1..10 cardinals & ordinals for Malayalam, Telugu, Kannada, Bengali, Gujarati, Punjabi, Odia
  const regionalBasic1To10 = [
    // Malayalam
    [1, ['ഒന്ന്', 'ഒരു'], ['ഒന്നാമത്തെ', 'ആദ്യ']],
    [2, ['രണ്ട്'], ['രണ്ടാമത്തെ']],
    [3, ['മൂന്ന്'], ['മൂന്നാമത്തെ']],
    [4, ['നാല്'], ['നാലാമത്തെ']],
    [5, ['അഞ്ച്'], ['അഞ്ചാമത്തെ']],
    [6, ['ആറ്'], ['ആറാമത്തെ']],
    [7, ['ഏഴ്'], ['ഏഴാമത്തെ']],
    [8, ['എട്ട്'], ['എട്ടാമത്തെ']],
    [9, ['ഒമ്പത്', 'ഒൻപത്'], ['ഒമ്പതാമത്തെ']],
    [10, ['പത്ത്'], ['പത്താമത്തെ']],
    // Telugu
    [1, ['ఒకటి', 'ఒక'], ['మొదటి', 'ఒకటవ']],
    [2, ['రెండు'], ['రెండవ']],
    [3, ['మూడు'], ['మూడవ']],
    [4, ['నాలుగు'], ['నాలుగవ']],
    [5, ['ఐదు'], ['ఐదవ']],
    [6, ['ఆరు'], ['ఆరవ']],
    [7, ['ఏడు'], ['ఏడవ']],
    [8, ['ఎనిమిది'], ['ఎనిమిదవ']],
    [9, ['తొమ్మిది'], ['తొమ్మిదవ']],
    [10, ['పది'], ['పదవ']],
    // Kannada
    [1, ['ಒಂದು'], ['ಮೊದಲ', 'ಒಂದನೇ']],
    [2, ['ಎರಡು'], ['ಎರಡನೇ']],
    [3, ['ಮೂರು'], ['ಮೂರನೇ']],
    [4, ['ನಾಲ್ಕು'], ['ನಾಲ್ಕನೇ']],
    [5, ['ಐದು'], ['ಐದನೇ']],
    [6, ['ಆರು'], ['ಆರನೇ']],
    [7, ['ಏಳು'], ['ಏಳನೇ']],
    [8, ['ಎಂಟು'], ['ಎಂಟನೇ']],
    [9, ['ಒಂಬತ್ತು'], ['ಒಂಬತ್ತನೇ']],
    [10, ['ಹತ್ತು'], ['ಹತ್ತನೇ']],
    // Bengali
    [1, ['এক'], ['প্রথম']],
    [2, ['দুই'], ['দ্বিতীয়']],
    [3, ['তিন'], ['তৃতীয়']],
    [4, ['চার'], ['চতুর্থ']],
    [5, ['পাঁচ'], ['পঞ্চম']],
    [6, ['ছয়'], ['ষষ্ঠ']],
    [7, ['সাত'], ['সপ্তম']],
    [8, ['আট'], ['অষ্টম']],
    [9, ['নয়'], ['নবম']],
    [10, ['দশ'], ['দশম']],
    // Gujarati
    [1, ['એક'], ['પહેલું', 'પહેલો']],
    [2, ['બે'], ['બીજું', 'બીજો']],
    [3, ['ત્રણ'], ['ત્રીજું', 'ત્રીજો']],
    [4, ['ચાર'], ['ચોથું', 'ચોથો']],
    [5, ['પાંચ'], ['પાંચમું']],
    [6, ['છ'], ['છઠ્ઠું']],
    [7, ['સાત'], ['સાતમું']],
    [8, ['આઠ'], ['આઠમું']],
    [9, ['નવ'], ['નવમું']],
    [10, ['દસ'], ['દસમું']],
    // Punjabi (Gurmukhi)
    [1, ['ਇੱਕ', 'ਇਕ'], ['ਪਹਿਲਾ']],
    [2, ['ਦੋ'], ['ਦੂਜਾ']],
    [3, ['ਤਿੰਨ'], ['ਤੀਜਾ']],
    [4, ['ਚਾਰ'], ['ਚੌਥਾ']],
    [5, ['ਪੰਜ'], ['ਪੰਜਵਾਂ']],
    [6, ['ਛੇ'], ['ਛੇਵਾਂ']],
    [7, ['ਸੱਤ'], ['ਸੱਤਵਾਂ']],
    [8, ['ਅੱਠ'], ['ਅੱਠਵਾਂ']],
    [9, ['ਨੌਂ'], ['ਨੌਵਾਂ']],
    [10, ['ਦਸ'], ['ਦਸਵਾਂ']],
    // Odia
    [1, ['ଏକ', 'ଗୋଟିଏ'], ['ପ୍ରଥମ']],
    [2, ['ଦୁଇ'], ['ଦ୍ୱିତୀୟ']],
    [3, ['ତିନି'], ['ତୃତୀୟ']],
    [4, ['ଚାରି'], ['ଚତୁର୍ଥ']],
    [5, ['ପାଞ୍ଚ'], ['ପଞ୍ଚମ']],
    [6, ['ଛଅ'], ['ଷଷ୍ଠ']],
    [7, ['ସାତ'], ['ସପ୍ତମ']],
    [8, ['ଆଠ'], ['ଅଷ୍ଟମ']],
    [9, ['ନଅ'], ['ନବମ']],
    [10, ['ଦଶ'], ['ଦଶମ']],
  ];
  for (const [val, cardinals, ordinals] of regionalBasic1To10) {
    addVal(cardinals, val, false);
    addVal(ordinals, val, true);
  }

  return map;
})();

// ─── Spoken Alphabet Table (Latin + Tamil + Hindi Phonetic Letter Names) ──────
const SPOKEN_LETTER_TABLE = Object.freeze({
  // Single Latin letters A..Z
  a: ['A'], b: ['B'], c: ['C'], d: ['D'], e: ['E'], f: ['F'], g: ['G'],
  h: ['H'], i: ['I'], j: ['J'], k: ['K'], l: ['L'], m: ['M'], n: ['N'],
  o: ['O'], p: ['P'], q: ['Q'], r: ['R'], s: ['S'], t: ['T'], u: ['U'],
  v: ['V'], w: ['W'], x: ['X'], y: ['Y'], z: ['Z'],
  // Tamil phonetic letter names (note: `பி`/`பீ` can represent B or P; `டி`/`டீ` can represent T or D)
  'ஏ': ['A'],
  'பி': ['B', 'P'],
  'பீ': ['B', 'P'],
  'சி': ['C'],
  'சீ': ['C'],
  'டி': ['T', 'D'],
  'டீ': ['T', 'D'],
  'ஈ': ['E'],
  'இ': ['E'],
  'எஃப்': ['F'],
  'எப்': ['F'],
  'ஜி': ['G'],
  'ஜீ': ['G'],
  'ஹெச்': ['H'],
  'எச்': ['H'],
  'ஐ': ['I'],
  'ஜே': ['J'],
  'கே': ['K'],
  'எல்': ['L'],
  'எம்': ['M'],
  'என்': ['N'],
  'ஓ': ['O'],
  'க்யூ': ['Q'],
  'கியூ': ['Q'],
  'ஆர்': ['R'],
  'எஸ்': ['S'],
  'யூ': ['U'],
  'யு': ['U'],
  'வி': ['V'],
  'வீ': ['V'],
  'டபிள்யூ': ['W'],
  'டபுள்யூ': ['W'],
  'எக்ஸ்': ['X'],
  'ஒய்': ['Y'],
  'இசட்': ['Z'],
  'ஜெட்': ['Z'],
  'ஸெட்': ['Z'],
  // Devanagari phonetic letter names
  'ए': ['A'],
  'बी': ['B'],
  'सी': ['C'],
  'डी': ['D'],
  'ई': ['E'],
  'एफ': ['F'],
  'जी': ['G'],
  'एच': ['H'],
  'आई': ['I'],
  'जे': ['J'],
  'के': ['K'],
  'एल': ['L'],
  'एम': ['M'],
  'एन': ['N'],
  'ओ': ['O'],
  'पी': ['P'],
  'क्यू': ['Q'],
  'आर': ['R'],
  'एस': ['S'],
  'टी': ['T'],
  'यू': ['U'],
  'वी': ['V'],
  'डब्ल्यू': ['W'],
  'एक्स': ['X'],
  'वाई': ['Y'],
  'ज़ेड': ['Z'],
  'जेड': ['Z'],
});

function lookupNumberToken(rawToken) {
  const tok = String(rawToken || '').trim().toLowerCase();
  if (!tok) return null;

  // Direct ASCII integer or English ordinal (`3`, `3rd`, `102nd`)
  const ordDigitMatch = tok.match(/^(\d+)(?:st|nd|rd|th)?$/i);
  if (ordDigitMatch) {
    const val = Number.parseInt(ordDigitMatch[1], 10);
    const isOrd = /(?:st|nd|rd|th)$/i.test(tok);
    return { kind: 'val', value: val, ordinal: isOrd, rawDigits: ordDigitMatch[1] };
  }

  // Tamil suffix on ASCII digits (`3வது`, `3ஆவது`, `3-வது`, `3ஆம்`)
  const taOrdDigitMatch = tok.match(/^(\d+)[-\s]*(?:ஆவது|வது|ஆம்)$/);
  if (taOrdDigitMatch) {
    return { kind: 'val', value: Number.parseInt(taOrdDigitMatch[1], 10), ordinal: true, rawDigits: taOrdDigitMatch[1] };
  }

  const direct = NUMBER_WORD_TABLE.get(tok);
  if (direct) return direct;

  // Strip Tamil ordinal / case suffixes on compound Tamil number words (`முப்பத்தொன்பதாவது` -> `முப்பத்தொன்பது`)
  if (tok.endsWith('ஆவது') || tok.endsWith('ாவது')) {
    const stem = tok
      .replace(/ஆவது$/, '')
      .replace(/ாவது$/, 'ு');
    const stemHit = NUMBER_WORD_TABLE.get(stem);
    if (stemHit && stemHit.kind === 'val') {
      return { kind: 'val', value: stemHit.value, ordinal: true };
    }
  }

  return null;
}

function tokenizeWords(input) {
  const norm = normalizeUnicodeDigits(input)
    .replace(/[,.;:!?()[\]{}"'`/\\|—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return norm ? norm.split(' ') : [];
}

/**
 * Evaluates a contiguous sequence of recognized number tokens into BOTH:
 *   - `numericValue`: place-value evaluated integer (e.g. `[30, 9]` -> `39`, `[100, 2]` -> `102`)
 *   - `digitSequence`: concatenated digit string when spoken digit-by-digit (e.g. `[1, 2, 3, 4]` -> `'1234'`, `[0, 9]` -> `'09'`)
 */
function evaluateNumberTokens(numTokens) {
  if (!Array.isArray(numTokens) || numTokens.length === 0) return null;

  const allSingleDigits = numTokens.every(
    (t) => t.kind === 'val' && t.value >= 0 && t.value <= 9 && (!t.rawDigits || t.rawDigits.length === 1)
  );
  if (allSingleDigits && numTokens.length >= 2) {
    const digitSequence = numTokens.map((t) => String(t.value)).join('');
    return {
      value: Number.parseInt(digitSequence, 10),
      digitString: digitSequence,
      isOrdinal: Boolean(numTokens[numTokens.length - 1].ordinal),
      isDigitByDigit: true,
    };
  }

  let total = 0;
  let current = 0;
  let isOrdinal = false;

  for (let i = 0; i < numTokens.length; i += 1) {
    const item = numTokens[i];
    if (item.ordinal) isOrdinal = true;

    if (item.kind === 'mul') {
      const mult = item.value;
      if (mult === 1000) {
        total += (current || 1) * 1000;
        current = 0;
      } else if (mult === 100) {
        current = (current || 1) * 100;
      }
    } else {
      current += item.value;
    }
  }

  const finalVal = total + current;
  const singleRaw = numTokens.length === 1 && numTokens[0].rawDigits ? numTokens[0].rawDigits : String(finalVal);

  return {
    value: finalVal,
    digitString: singleRaw,
    isOrdinal,
    isDigitByDigit: false,
  };
}

/**
 * Parses a standalone number or spoken number phrase (e.g. `"மூணாவது"` -> `3`, `"முப்பத்தி ஒன்பது"` -> `39`,
 * `"एक सौ दो"` -> `102`, `"one hundred and two"` -> `102`). Returns `null` if no valid number is present.
 */
function parseSpokenNumberValue(rawInput) {
  const tokens = tokenizeWords(rawInput);
  if (tokens.length === 0) return null;

  const numTokens = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const low = tokens[i].toLowerCase();
    if (low === 'and') continue;
    if ((low === 'a' || low === 'an') && i + 1 < tokens.length) {
      const nextNum = lookupNumberToken(tokens[i + 1]);
      if (nextNum && nextNum.kind === 'mul') {
        numTokens.push({ kind: 'val', value: 1, ordinal: false });
        continue;
      }
    }
    const hit = lookupNumberToken(tokens[i]);
    if (hit) {
      numTokens.push(hit);
      if (hit.ordinal) break;
    } else if (numTokens.length > 0) {
      break;
    }
  }

  const evaluated = evaluateNumberTokens(numTokens);
  return evaluated ? evaluated.value : null;
}

// ─── Vehicle Plate Normalization & Lookup Variants ────────────────────────────

function buildRtoPlateResult(state, districtDigits, seriesCandidates, serialDigits, confidence = 'high') {
  const st = state.toUpperCase();
  const distClean = String(districtDigits).replace(/\D+/g, '');
  const serPrimary = seriesCandidates[0].toUpperCase();
  const serialClean = String(serialDigits).replace(/\D+/g, '');

  const distNum = String(Number.parseInt(distClean, 10));
  const distPad = distNum.padStart(2, '0');
  const serialNum = String(Number.parseInt(serialClean, 10));
  const serialPad = serialNum.padStart(4, '0');

  // Preserve exact user padding for display/normalized when already 2+4 or standard RTO;
  // also include both padded (`TN09A0005`) and unpadded (`TN9A5`) in `variants`!
  const canonicalDist = distClean.length >= 2 ? distClean : distPad.length === 2 && distClean.startsWith('0') ? distPad : distClean;
  const canonicalSerial = serialClean.length === 4 ? serialClean : serialClean;
  const normalized = `${st}${canonicalDist}${serPrimary}${canonicalSerial}`;
  const display = `${st} ${canonicalDist} ${serPrimary} ${canonicalSerial}`;

  const variantSet = new Set();
  const distOptions = Array.from(new Set([distClean, distNum, distPad]));
  const serialOptions = Array.from(new Set([serialClean, serialNum, serialPad]));

  for (const ser of seriesCandidates) {
    const serUp = ser.toUpperCase();
    for (const dOpt of distOptions) {
      for (const sOpt of serialOptions) {
        variantSet.add(`${st}${dOpt}${serUp}${sOpt}`);
      }
    }
  }

  return {
    normalized,
    display,
    variants: Array.from(variantSet),
    last4: null,
    confidence,
  };
}

function buildBhPlateResult(yearDigits, serialDigits, suffixLetters, confidence = 'high') {
  const yr = String(yearDigits).padStart(2, '0');
  const ser = String(serialDigits).padStart(4, '0');
  const suf = String(suffixLetters).toUpperCase();
  const normalized = `${yr}BH${ser}${suf}`;
  return {
    normalized,
    display: `${yr} BH ${ser} ${suf}`,
    variants: [normalized],
    last4: null,
    confidence,
  };
}

function getLetterOptions(token) {
  const key = String(token || '').trim().toLowerCase();
  const hit = SPOKEN_LETTER_TABLE[key] || SPOKEN_LETTER_TABLE[String(token || '').trim()];
  return hit || null;
}

/**
 * Consumes a spoken/digit number span starting at `startIdx` in `tokens` (for district `1..99`
 * or serial `1..9999`).
 */
function consumePlateNumberSpan(tokens, startIdx, maxDigits = 4) {
  const collected = [];
  let i = startIdx;

  while (i < tokens.length) {
    const hit = lookupNumberToken(tokens[i]);
    if (!hit) break;
    collected.push(hit);
    i += 1;
    if (hit.ordinal) break;
    if (collected.length >= maxDigits && collected.every((t) => t.kind === 'val' && t.value <= 9)) {
      break;
    }
  }

  if (collected.length === 0) return null;

  // Case 1: Two 2-digit spoken numbers for a 4-digit serial (e.g. `பன்னிரெண்டு முப்பத்தி நாலு` -> `1234`)
  if (
    maxDigits === 4 &&
    collected.length === 2 &&
    collected[0].kind === 'val' &&
    collected[1].kind === 'val' &&
    collected[0].value >= 10 &&
    collected[0].value <= 99 &&
    collected[1].value >= 10 &&
    collected[1].value <= 99
  ) {
    const ds = `${collected[0].value}${collected[1].value}`;
    return { digitString: ds, nextIndex: i };
  }

  const evalRes = evaluateNumberTokens(collected);
  if (!evalRes) return null;
  if (evalRes.digitString.length > maxDigits) return null;

  return {
    digitString: evalRes.digitString,
    nextIndex: i,
  };
}

const VEHICLE_CUE_RE =
  /(?:வண்டி|வாகனம்|வாகன|நம்பர்\s*பிளேட்|பிளேட்|ரிஜிஸ்ட்ரேஷன்|vandi|vaaganam|vaganam|\bvehicle\b|\bnumber\s*plate\b|\bplate\b|\breg(?:istration)?\s*(?:no|number)?\b|\bbike\b|\bcar\b|\bauto\b|\bscooter\b|\blorry\b|गाड़ी|वाहन|नंबर\s*प्लेट|വണ്ടി|വാഹനം|బండి|వాహనం|ಗಾಡಿ|ವಾಹನ|গাড়ি)/i;

/**
 * Parses a full Indian RTO (`SS NN L{1,3} NNNN`), Bharat (`NN BH NNNN LL`), spoken Tamil/English
 * letter-by-letter plate, or cue-gated last-4 digits (`{ last4: '1234' }`).
 */
function parseVehiclePlate(rawInput, options = {}) {
  const normDigitsText = normalizeUnicodeDigits(rawInput);
  if (!normDigitsText.trim()) return null;

  // 1. Direct Latin / compact / hyphenated / spaced Bharat-series match (`22 BH 1234 AA`)
  const bhDirectRe = /\b(\d{2})[-\s]*B\s*H[-\s]*(\d{4})[-\s]*([A-Za-z](?:\s*[A-Za-z])?)\b/i;
  const bhMatch = normDigitsText.match(bhDirectRe);
  if (bhMatch) {
    const suffix = bhMatch[3].replace(/\s+/g, '').toUpperCase();
    return buildBhPlateResult(bhMatch[1], bhMatch[2], suffix, 'high');
  }

  // 2. Direct Latin / compact / hyphenated / spaced RTO match (`TN 39 AB 1234`, `T N 39 A B 1234`, `TN09A0005`)
  const rtoDirectRe =
    /\b([A-Za-z])\s*([A-Za-z])[-\s]*(\d{1,2})[-\s]*([A-Za-z](?:\s*[A-Za-z]){0,2})[-\s]*(\d{1,4})\b/g;
  let m;
  while ((m = rtoDirectRe.exec(normDigitsText)) !== null) {
    const state = `${m[1]}${m[2]}`.toUpperCase();
    if (!INDIAN_STATE_CODES.has(state)) continue;
    const district = m[3];
    const series = m[4].replace(/\s+/g, '').toUpperCase();
    const serial = m[5];
    if (series.length >= 1 && series.length <= 3) {
      return buildRtoPlateResult(state, district, [series], serial, 'high');
    }
  }

  // 3. Token-by-token scanner for spoken Tamil/Hindi/English letters + spoken numbers
  //    e.g. `"டி என் முப்பத்தி ஒன்பது ஏ பி ஒண்ணு ரெண்டு மூணு நாலு"` -> `TN39AB1234`
  const tokens = tokenizeWords(normDigitsText);
  for (let i = 0; i < tokens.length; i += 1) {
    // Check 2-letter state token (`TN`) or two 1-letter spoken tokens (`டி` + `என்`)
    let stateCode = null;
    let afterStateIdx = -1;

    const upperTok = tokens[i].toUpperCase();
    if (/^[A-Z]{2}$/.test(upperTok) && INDIAN_STATE_CODES.has(upperTok)) {
      stateCode = upperTok;
      afterStateIdx = i + 1;
    } else if (i + 1 < tokens.length) {
      const l1 = getLetterOptions(tokens[i]);
      const l2 = getLetterOptions(tokens[i + 1]);
      if (l1 && l2) {
        for (const c1 of l1) {
          for (const c2 of l2) {
            const cand = `${c1}${c2}`;
            if (INDIAN_STATE_CODES.has(cand)) {
              stateCode = cand;
              break;
            }
          }
          if (stateCode) break;
        }
        if (stateCode) afterStateIdx = i + 2;
      }
    }

    if (!stateCode || afterStateIdx >= tokens.length) continue;

    // Parse district (`1..2` digits or spoken `1..99`)
    const distSpan = consumePlateNumberSpan(tokens, afterStateIdx, 2);
    if (!distSpan) continue;
    const distVal = Number.parseInt(distSpan.digitString, 10);
    if (!Number.isFinite(distVal) || distVal < 0 || distVal > 99) continue;

    // Parse series (`1..3` letters: either a compact Latin token `AB` or 1..3 spoken letter tokens `ஏ பி`)
    let seriesCandidates = null;
    let afterSeriesIdx = distSpan.nextIndex;
    if (afterSeriesIdx >= tokens.length) continue;

    const maybeLatinSeries = tokens[afterSeriesIdx].toUpperCase();
    if (/^[A-Z]{1,3}$/.test(maybeLatinSeries) && !lookupNumberToken(tokens[afterSeriesIdx])) {
      // Check if followed by more single Latin letters (e.g. `A` `B`)
      if (maybeLatinSeries.length === 1) {
        let letters = [ [maybeLatinSeries] ];
        let k = afterSeriesIdx + 1;
        while (k < tokens.length && letters.length < 3) {
          if (lookupNumberToken(tokens[k])) break;
          const nextOpts = getLetterOptions(tokens[k]);
          if (!nextOpts) break;
          letters.push(nextOpts);
          k += 1;
        }
        seriesCandidates = expandLetterCombinations(letters);
        afterSeriesIdx = k;
      } else {
        seriesCandidates = [maybeLatinSeries];
        afterSeriesIdx += 1;
      }
    } else {
      const letterGroups = [];
      let k = afterSeriesIdx;
      while (k < tokens.length && letterGroups.length < 3) {
        if (lookupNumberToken(tokens[k])) break;
        const opts = getLetterOptions(tokens[k]);
        if (!opts) break;
        letterGroups.push(opts);
        k += 1;
      }
      if (letterGroups.length >= 1) {
        seriesCandidates = expandLetterCombinations(letterGroups);
        afterSeriesIdx = k;
      }
    }

    if (!seriesCandidates || seriesCandidates.length === 0 || afterSeriesIdx >= tokens.length) {
      continue;
    }

    // Parse serial (`1..4` digits or spoken digits/number)
    const serialSpan = consumePlateNumberSpan(tokens, afterSeriesIdx, 4);
    if (!serialSpan) continue;
    const serialVal = Number.parseInt(serialSpan.digitString, 10);
    if (!Number.isFinite(serialVal) || serialVal < 0 || serialVal > 9999) continue;

    return buildRtoPlateResult(stateCode, distSpan.digitString, seriesCandidates, serialSpan.digitString, 'high');
  }

  // 4. Last-4 digits ONLY when an explicit vehicle cue is present (or `options.allowBareLast4 === true` on tool arg)
  const hasVehicleCue = Boolean(options.allowBareLast4 || VEHICLE_CUE_RE.test(normDigitsText));
  if (hasVehicleCue) {
    // Strip ISO dates first so `2026` in `2026-03-15` is never misread as last-4
    const withoutDates = normDigitsText.replace(/\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, ' ');
    const fourDigitMatch = withoutDates.match(/(?:^|\D)(\d{4})(?!\d)/);
    if (fourDigitMatch) {
      return {
        normalized: null,
        display: fourDigitMatch[1],
        variants: [],
        last4: fourDigitMatch[1],
        confidence: 'high',
      };
    }

    // Spoken 4 digits after vehicle cue (`வண்டி நம்பர் ஒண்ணு ரெண்டு மூணு நாலு`)
    for (let i = 0; i < tokens.length; i += 1) {
      const span = consumePlateNumberSpan(tokens, i, 4);
      if (span && span.digitString.length === 4) {
        return {
          normalized: null,
          display: span.digitString,
          variants: [],
          last4: span.digitString,
          confidence: 'high',
        };
      }
    }
  }

  return null;
}

function expandLetterCombinations(letterGroups) {
  let acc = [''];
  for (const group of letterGroups) {
    const next = [];
    for (const prefix of acc) {
      for (const ch of group) {
        next.push(prefix + ch);
      }
    }
    acc = next;
  }
  return acc;
}

// ─── Phone Entity Parser (Cue-Gated) ──────────────────────────────────────────

const PHONE_CUE_RE =
  /(?:போன்|ஃபோன்|மொபைல்|கைபேசி|செல்\s*நம்பர்|\bphone\b|\bmobile\b|\bcontact\s*(?:no|number)\b|\bcell\b|फोन|मोबाइल|ഫോൺ|മൊബൈൽ|ఫోన్|మొబైల్|ಫೋನ್|ಮೊಬೈಲ್)/i;

function parsePhoneEntity(rawInput, options = {}) {
  const norm = normalizeUnicodeDigits(rawInput);
  if (!norm.trim()) return null;

  const hasCue = Boolean(options.allowBarePhone || PHONE_CUE_RE.test(norm));
  if (!hasCue) return null;

  // Match 10-digit Indian phone (with optional +91 / 91 / 0 prefix and optional spaces/hyphens)
  const fullMatch = norm.match(/(?:\+?91[-\s]*|0)?([6-9]\d{4}[-\s]*\d{5})\b/);
  if (fullMatch) {
    const tenDigits = fullMatch[1].replace(/\D+/g, '');
    if (tenDigits.length === 10) {
      return {
        full: tenDigits,
        last4: tenDigits.slice(-4),
        confidence: 'high',
      };
    }
  }

  // Fallback for synthetic 10-digit numbers in tests (e.g. `9000012345`) or 4-digit suffix
  const anyTenMatch = norm.match(/(?:^|\D)(\d{10})(?!\d)/);
  if (anyTenMatch) {
    const ten = anyTenMatch[1];
    return {
      full: ten,
      last4: ten.slice(-4),
      confidence: 'high',
    };
  }

  const last4Match = norm.match(/(?:^|\D)(\d{4})(?!\d)/);
  if (last4Match) {
    return {
      full: null,
      last4: last4Match[1],
      confidence: 'high',
    };
  }

  // Spoken 4 digits with phone cue
  const tokens = tokenizeWords(norm);
  for (let i = 0; i < tokens.length; i += 1) {
    const span = consumePlateNumberSpan(tokens, i, 4);
    if (span && span.digitString.length === 4) {
      return {
        full: null,
        last4: span.digitString,
        confidence: 'high',
      };
    }
  }

  return null;
}

// ─── HPL vs List-Position Ordinal Parser ──────────────────────────────────────

const EXPLICIT_HPL_KEYWORD_RE =
  /(?:\bhpl\b|\bh\.?\s*p\.?\b|ஹெச்பிஎல்|எச்பிஎல்|ஹெச்\s*பி|எச்\s*பி|ஹெச்பி|எச்பி|\bhire\s*purchase\b|\bloan\s*(?:no|number|#)\b|லோன்\s*நம்பர்|கடன்\s*எண்|लोन\s*नंबर|खाता\s*नंबर)/i;

const NUMBER_WORD_CUE_RE = /(?:நம்பர்|எண்|\bno\.?\b|\bnumber\b|#|नंबर|क्रमांक|നമ്പർ|నంబర్|ನಂಬರ್)/i;
const CUSTOMER_WORD_CUE_RE =
  /(?:கஸ்டமர்|வாடிக்கையாளர்|பார்ட்டி|\bcustomer\b|\bclient\b|\bparty\b|\baccount\b|ग्राहक|कस्टमर|കസ്റ്റമർ|కస్టమర్|ಗ್ರಾಹಕ)/i;

const LIST_REF_CUE_RE =
  /(?:லிஸ்ட்|லிஸ்ட்ல|பட்டியல்|பட்டியலில்|அதில்|அதுல|இதில்|இவர்களில்|ஆள்|\bin\s+the\s+list\b|\bfrom\s+the\s+list\b|\bon\s+the\s+list\b|\b(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(?:one|person|row|item|entry)\b|लिस्ट\s*में|उनमें\s*से|(?:पहला|दूसरा|तीसरा|चौथा|पांचवां)\s+वाला)/i;

const NON_HPL_UNIT_FOLLOW_RE =
  /^(?:rupees?|rs\.?|inr|ரூபாய்|ரூபா|ரூ|रुपये|रुपया|நாள்|நாட்கள்|days?|மாசம்|மாதம்|மாதங்கள்|months?|வருஷம்|ஆண்டு|years?|மணி|hours?|நிமிஷம்|minutes?|%|percent|சதவீதம்)$/i;

/**
 * Server-side backstop for `search_customer_loan_status({ hplno })` when Gemini passes
 * digits, Unicode digits (`"௩"`), `"HPL-102"`, or spoken words (`"மூன்று"` / `"மூணாவது"`).
 */
function parseHplArgument(rawArg) {
  if (rawArg === undefined || rawArg === null) return null;
  if (typeof rawArg === 'number') {
    return Number.isInteger(rawArg) && rawArg > 0 && rawArg <= 99999999 ? rawArg : null;
  }
  const str = normalizeUnicodeDigits(String(rawArg)).trim();
  if (!str) return null;

  const cleaned = str
    .replace(/^(?:hpl|hp|loan|no\.?|number|#|\s|-|_)+/gi, '')
    .trim();
  if (/^\d+$/.test(cleaned)) {
    const n = Number.parseInt(cleaned, 10);
    return Number.isFinite(n) && n > 0 && n <= 99999999 ? n : null;
  }

  const spoken = parseSpokenNumberValue(cleaned || str);
  if (Number.isInteger(spoken) && spoken > 0 && spoken <= 99999999) {
    return spoken;
  }
  return null;
}

function extractFirstNonUnitNumber(textWithoutPlatesAndDates) {
  const tokens = tokenizeWords(textWithoutPlatesAndDates);
  for (let i = 0; i < tokens.length; i += 1) {
    // Skip currency symbols attached to digits (`₹1234`)
    if (/^[₹$€£]/.test(tokens[i])) continue;

    const collected = [];
    let k = i;
    while (k < tokens.length) {
      if (tokens[k].toLowerCase() === 'and' && collected.length > 0) {
        k += 1;
        continue;
      }
      const hit = lookupNumberToken(tokens[k]);
      if (!hit) break;
      collected.push(hit);
      k += 1;
      if (hit.ordinal) break;
    }

    if (collected.length === 0) continue;

    const nextWord = k < tokens.length ? tokens[k] : '';
    const prevWord = i > 0 ? tokens[i - 1] : '';
    if (
      NON_HPL_UNIT_FOLLOW_RE.test(nextWord) ||
      /^(?:₹|rs\.?|inr|ரூபாய்|ரூபா|रुपये)$/i.test(prevWord)
    ) {
      i = k - 1;
      continue;
    }

    const evalRes = evaluateNumberTokens(collected);
    if (evalRes && Number.isInteger(evalRes.value) && evalRes.value > 0 && evalRes.value <= 99999999) {
      return {
        value: evalRes.value,
        isOrdinal: evalRes.isOrdinal,
      };
    }
    i = k - 1;
  }
  return null;
}

// ─── Self-Correction & Switch Detection ───────────────────────────────────────

const EXPLICIT_CORRECTION_RE =
  /(?:மாத்தி\s*சொல்றேன்|மாற்றி\s*சொல்கிறேன்|மாத்தி|மாற்றி|அது\s*இல்ல|அவர்\s*இல்ல|இல்ல\b|இல்லை|வேற\b|வேறு|தப்பு|தவறு|மன்னிக்கவும்|சாரி|\bmaathi\b|\bmathi\b|\billa\b|\billai\b|\bvera\b|\bathu\s*illa\b|\bthappu\b|\bsorry\b|\bno\b|\bnot\s+that\b|\binstead\b|\bactually\b|\bwait\b|\bwrong\s+one\b|\bmy\s+mistake\b|\bi\s+meant\b|\bother\s+customer\b|\bdifferent\s+customer\b|नहीं|गलत|माफ़|माफ|सॉरी|वो\s*नहीं|\bnahi\b|\bgalat\b)/i;

/**
 * Inspects `recentTurns` (`[{ role: 'user'|'assistant', text }]`) to detect:
 *   - `previousEntity`: the most recent customer lookup entity (`hplno`, `vehicle`, `phone`)
 *   - `previousTurnHadList` + `previousListItems`: whether the last assistant message listed
 *     multiple ranked accounts (e.g. overdue list) so ordinals like `"the third one"` can resolve safely.
 */
function extractPreviousConversationContext(recentTurns = []) {
  if (!Array.isArray(recentTurns) || recentTurns.length === 0) {
    return {
      previousEntity: null,
      previousTurnHadList: false,
      previousListItems: [],
    };
  }

  let previousEntity = null;
  for (let i = recentTurns.length - 1; i >= 0; i -= 1) {
    const turn = recentTurns[i];
    if (!turn || typeof turn.text !== 'string') continue;
    const txt = turn.text;

    const plate = parseVehiclePlate(txt);
    if (plate && (plate.normalized || plate.last4)) {
      previousEntity = plate.normalized
        ? { type: 'vehicle', value: plate.normalized }
        : { type: 'vehicle_last4', value: plate.last4 };
      break;
    }

    const hplMatch = normalizeUnicodeDigits(txt).match(/\bHPL[-_\s#]*(\d+)\b/i);
    if (hplMatch) {
      previousEntity = { type: 'hplno', value: Number.parseInt(hplMatch[1], 10) };
      break;
    }

    if (turn.role === 'user') {
      const userEnt = extractTurnEntities(txt, {});
      if (userEnt.hplno !== null) {
        previousEntity = { type: 'hplno', value: userEnt.hplno };
        break;
      }
      if (userEnt.phone) {
        previousEntity = { type: 'phone', value: userEnt.phone.full || userEnt.phone.last4 };
        break;
      }
    }
  }

  // Check if the most recent assistant message presented a multi-item customer list
  let lastAssistantText = '';
  for (let i = recentTurns.length - 1; i >= 0; i -= 1) {
    if (recentTurns[i]?.role === 'assistant' && recentTurns[i]?.text) {
      lastAssistantText = String(recentTurns[i].text);
      break;
    }
  }

  const previousListItems = [];
  if (lastAssistantText) {
    const hplMentions = Array.from(
      normalizeUnicodeDigits(lastAssistantText).matchAll(/\bHPL[-_\s#]*(\d+)\b/gi)
    );
    const seenHpl = new Set();
    for (const m of hplMentions) {
      const num = Number.parseInt(m[1], 10);
      if (Number.isFinite(num) && !seenHpl.has(num)) {
        seenHpl.add(num);
        previousListItems.push({ hplno: num });
      }
    }
  }

  const numberedLines = lastAssistantText.match(/(?:^|\n)\s*[1-9]\s*[.)]\s+/g) || [];
  const previousTurnHadList = previousListItems.length >= 2 || numberedLines.length >= 2;

  return {
    previousEntity,
    previousTurnHadList,
    previousListItems,
  };
}

function buildPrimaryNewEntity({ hplno, vehiclePlate, phone }) {
  if (hplno !== null) {
    return { type: 'hplno', value: hplno, display: `HPL ${hplno}` };
  }
  if (vehiclePlate?.normalized) {
    return {
      type: 'vehicle',
      value: vehiclePlate.normalized,
      display: vehiclePlate.display,
      variants: vehiclePlate.variants,
    };
  }
  if (vehiclePlate?.last4) {
    return {
      type: 'vehicle_last4',
      value: vehiclePlate.last4,
      display: vehiclePlate.last4,
    };
  }
  if (phone) {
    return {
      type: 'phone',
      value: phone.full || phone.last4,
      display: `****${phone.last4}`,
    };
  }
  return null;
}

function isSameEntity(a, b) {
  if (!a || !b) return false;
  return a.type === b.type && String(a.value) === String(b.value);
}

/**
 * Full per-turn grounding extractor for `aiOrchestrator.service.js`.
 */
function extractTurnEntities(rawUserText, context = {}) {
  const normalizedText = normalizeUnicodeDigits(rawUserText).trim();
  const previousEntity = context.previousEntity || null;
  const previousTurnHadList = Boolean(context.previousTurnHadList);
  const previousListItems = Array.isArray(context.previousListItems) ? context.previousListItems : [];

  if (!normalizedText) {
    return {
      normalizedText: '',
      hplno: null,
      hplConfidence: null,
      listPosition: null,
      resolvedListItem: null,
      ambiguous: false,
      candidateNumber: null,
      ambiguityReason: null,
      vehiclePlate: null,
      phone: null,
      isCorrectionOrSwitch: false,
      hasExplicitCorrectionCue: false,
      recheckOnly: false,
      newEntity: null,
      hasHighConfidenceLookupEntity: false,
    };
  }

  // 1. Parse phone first (when explicit phone cue exists) and vehicle plate
  const phone = parsePhoneEntity(normalizedText);
  const vehiclePlate = phone ? null : parseVehiclePlate(normalizedText);

  // 2. Scrub ISO dates, matched full plates, and phone digits before scanning for HPL / ordinal numbers
  let scrubbedForHpl = normalizedText
    .replace(/\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, ' ')
    .replace(/\b(?:0?[1-9]|[12]\d|3[01])[/-](?:0?[1-9]|1[0-2])[/-]20\d{2}\b/g, ' ');

  if (vehiclePlate?.normalized) {
    // Scrub full RTO / BH plate tokens so `"HP 12 AB 3456"` never triggers `"HP"` HPL cue!
    scrubbedForHpl = scrubbedForHpl
      .replace(/\b[A-Za-z]{2}[-\s]*\d{1,2}[-\s]*[A-Za-z]{1,3}[-\s]*\d{1,4}\b/g, ' ')
      .replace(/\b\d{2}[-\s]*BH[-\s]*\d{4}[-\s]*[A-Za-z]{1,2}\b/gi, ' ');
  }

  let hplno = null;
  let hplConfidence = null;
  let listPosition = null;
  let resolvedListItem = null;
  let ambiguous = false;
  let candidateNumber = null;
  let ambiguityReason = null;

  if (!phone && !vehiclePlate?.last4) {
    const hasExplicitHplWord = EXPLICIT_HPL_KEYWORD_RE.test(scrubbedForHpl);
    const hasNumberAndCustomerCue =
      NUMBER_WORD_CUE_RE.test(scrubbedForHpl) && CUSTOMER_WORD_CUE_RE.test(scrubbedForHpl);
    const hasExplicitHplCue = hasExplicitHplWord || hasNumberAndCustomerCue;
    const hasListCue = LIST_REF_CUE_RE.test(scrubbedForHpl);
    const hasCustomerOnlyWord = CUSTOMER_WORD_CUE_RE.test(scrubbedForHpl);

    const parsedNum = extractFirstNonUnitNumber(scrubbedForHpl);

    if (parsedNum) {
      if (hasExplicitHplCue) {
        hplno = parsedNum.value;
        hplConfidence = 'high';
      } else if (hasListCue && (previousTurnHadList || parsedNum.isOrdinal)) {
        listPosition = parsedNum.value;
        resolvedListItem = previousListItems[parsedNum.value - 1] || null;
      } else if (previousTurnHadList && parsedNum.isOrdinal && hasCustomerOnlyWord) {
        // e.g. `"மூணாவது கஸ்டமர்"` / `"third customer"` right after a list without `"HP"`/`"நம்பர்"` or `"அதில்"`/`"one"`
        ambiguous = true;
        candidateNumber = parsedNum.value;
        ambiguityReason = 'hpl_or_list_position';
      }
    }
  }

  const newEntity = buildPrimaryNewEntity({ hplno, vehiclePlate, phone });
  const hasExplicitCorrectionCue = EXPLICIT_CORRECTION_RE.test(normalizedText);
  const switchedFromPrevious = Boolean(newEntity && previousEntity && !isSameEntity(newEntity, previousEntity));
  const isCorrectionOrSwitch = Boolean(hasExplicitCorrectionCue || switchedFromPrevious);
  const recheckOnly = Boolean(hasExplicitCorrectionCue && !newEntity && !ambiguous && listPosition === null);

  const hasHighConfidenceLookupEntity = Boolean(
    !ambiguous &&
      (hplConfidence === 'high' ||
        vehiclePlate?.confidence === 'high' ||
        phone?.confidence === 'high' ||
        (listPosition !== null && resolvedListItem?.hplno))
  );

  return {
    normalizedText,
    hplno,
    hplConfidence,
    listPosition,
    resolvedListItem,
    ambiguous,
    candidateNumber,
    ambiguityReason,
    vehiclePlate,
    phone,
    isCorrectionOrSwitch,
    hasExplicitCorrectionCue,
    recheckOnly,
    newEntity,
    hasHighConfidenceLookupEntity,
  };
}

module.exports = {
  INDIAN_STATE_CODES,
  normalizeUnicodeDigits,
  parseSpokenNumberValue,
  parseHplArgument,
  parseVehiclePlate,
  parsePhoneEntity,
  extractPreviousConversationContext,
  extractTurnEntities,
};
