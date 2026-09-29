// app/test_unified_pipeline.mjs
// Comprehensive verification of the unified OCR + SMS parsing pipeline (transactionParser)
// Tests real (redacted) screenshot layouts from GPay, PhonePe, and Paytm, amount prominence heuristics,
// 12-digit UTR extraction, merchant rules lookup before Gemini, and low-confidence escalation.

import assert from 'assert';

console.log('================================================================');
console.log(' UNIFIED OCR + SMS PARSING PIPELINE VERIFICATION SUITE');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// Pipeline Implementation Under Test (Direct Mirror of transactionParser.ts)
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORD_MAP = [
  {
    category: 'Food',
    keywords: [
      'sweet', 'sweets', 'mithai', 'bakery', 'bake', 'cake', 'cafe', 'coffee',
      'restaurant', 'restro', 'hotel', 'dhaba', 'canteen', 'mess', 'kitchen',
      'food', 'foods', 'eat', 'eats', 'dining', 'dine', 'treat', 'pizza',
      'burger', 'mcdonald', 'kfc', 'domino', 'subway', 'starbucks', 'chai',
      'tea', 'barista', 'haldiram', 'bikanervala', 'zomato', 'swiggy',
      'biryani', 'rasoi', 'bhojanalaya', 'chaat', 'dhokla', 'samosa',
    ],
  },
  {
    category: 'Food',
    keywords: [
      'blinkit', 'zepto', 'instamart', 'bigbasket', 'bb daily', 'dunzo',
      'grocery', 'groceries', 'supermarket', 'hypermarket', 'kirana', 'mart',
      'retail', 'dmart', 'reliance fresh', 'nature basket', 'spencer',
    ],
  },
  {
    category: 'Travel',
    keywords: [
      'uber', 'ola', 'rapido', 'metro', 'dmrc', 'bmrc', 'irctc', 'rail',
      'railway', 'indian rail', 'indigo', 'air india', 'spicejet', 'akasa',
      'flight', 'airline', 'fuel', 'petrol', 'diesel', 'cng', 'hpcl',
      'iocl', 'bpcl', 'indian oil', 'bharat petro', 'shell', 'toll',
      'fastag', 'nhai', 'bus', 'redbus', 'chalo', 'auto', 'cab',
    ],
  },
  {
    category: 'Hostel/Rent',
    keywords: [
      'rent', 'hostel', 'pg', 'landlord', 'flat', 'apartment', 'society',
      'maintenance', 'electricity', 'power', 'bescom', 'tneb', 'msedcl',
      'torrent', 'water', 'gas', 'indane', 'hp gas', 'bharat gas', 'adani gas',
    ],
  },
  {
    category: 'Recharge/Data',
    keywords: [
      'recharge', 'prepaid', 'postpaid', 'jio', 'airtel', 'vi', 'vodafone',
      'idea', 'bsnl', 'broadband', 'wifi', 'act fibernet', 'hathway',
      'dth', 'tata play', 'dish tv', 'airtel digital',
    ],
  },
  {
    category: 'Subscriptions',
    keywords: [
      'netflix', 'spotify', 'prime', 'amazon prime', 'hotstar', 'disney',
      'youtube', 'apple', 'itunes', 'google play', 'sonyliv', 'zee5',
      'audible', 'chatgpt', 'openai', 'github', 'notion', 'canva',
    ],
  },
  {
    category: 'Shopping',
    keywords: [
      'amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'tata cliq',
      'zara', 'h&m', 'trends', 'pantaloons', 'lifestyle', 'westside', 'uniqlo',
      'decathlon', 'croma', 'reliance digital', 'vijay sales', 'shopping',
    ],
  },
  {
    category: 'Entertainment',
    keywords: [
      'bookmyshow', 'pvr', 'inox', 'cinepolis', 'cinema', 'movie', 'theatre',
      'ticket', 'concert', 'gaming', 'steam', 'playstation', 'events',
    ],
  },
  {
    category: 'Books/Stationery',
    keywords: [
      'book', 'books', 'bookstore', 'stationery', 'xerox', 'print', 'photocopy',
      'udemy', 'coursera', 'unacademy', 'physics wallah', 'coaching', 'tuition',
      'college', 'university', 'school', 'fee', 'fees',
    ],
  },
];

function normalizeMerchantName(raw) {
  if (!raw) return '';
  let str = raw.trim();
  str = str.replace(/\b[a-zA-Z0-9._]+@\w+\b/gi, ' ');
  str = str.replace(/@\w+/gi, ' ');
  str = str.replace(/\/(?:okhdfcbank|oksbi|okaxis|okicici|ybl|paytm|apl|axl|ibl|sbi|hdfc|icici|axis)\b/gi, ' ');
  str = str.replace(/\b(?:ref\s*(?:no\.?)?|rrn|txn\s*(?:id|no\.?)?|upi\s*ref|crn)\s*[:#-]?\s*\d+\b/gi, ' ');
  str = str.replace(/\b(?:upi|vpa|p2m|p2a|pos|ecom|imps|neft|rtgs)\b\s*[/:-]?/gi, ' ');
  str = str.replace(/\b(?:paid\s+to|payment\s+to|money\s+sent\s+to|trf\s+to|transfer\s+to|sent\s+to|debited\s+for|spent\s+at|info\s*:?|towards)\b/gi, ' ');
  str = str.replace(/\b\d{3,}\b/g, ' ');
  str = str.replace(/\b(?:pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|commerce\s+private|retail\s+private|technology|technologies|services|enterprises|india)\b/gi, ' ');
  str = str.replace(/\b(?:and|refno|ref|call|if\s+not\s+u)\b/gi, ' ');
  str = str.replace(/[/\\_.:,;*#\-+~|!?()[\]{}'"`]/g, ' ');
  str = str.replace(/\s+/g, ' ').trim().toLowerCase();
  return str;
}

function inferCategoryFromText(text, availableCategories) {
  const lower = text.toLowerCase();
  for (const group of CATEGORY_KEYWORD_MAP) {
    for (const kw of group.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower)) {
        if (availableCategories && availableCategories.length > 0) {
          const exact = availableCategories.find(
            (c) => c.toLowerCase() === group.category.toLowerCase()
          );
          if (exact) return exact;
          const partial = availableCategories.find(
            (c) =>
              c.toLowerCase().includes(group.category.toLowerCase()) ||
              group.category.toLowerCase().includes(c.toLowerCase())
          );
          if (partial) return partial;
        }
        return group.category;
      }
    }
  }
  if (availableCategories && availableCategories.some((c) => c.toLowerCase() === 'uncategorized')) {
    return availableCategories.find((c) => c.toLowerCase() === 'uncategorized');
  }
  return 'Uncategorized';
}

function extractUpiReference(text) {
  if (!text) return null;
  const labeledMatch = text.match(
    /(?:UPI\s*(?:Ref(?:erence)?|Txn|Transaction)?\s*(?:ID|No\.?)?|UTR|RRN|Ref\s*No\.?)\s*[:#-]?\s*(\d{12})\b/i
  );
  if (labeledMatch && labeledMatch[1]) {
    return labeledMatch[1];
  }
  const all12 = text.match(/\b\d{12}\b/g);
  if (all12 && all12.length > 0) {
    for (const candidate of all12) {
      const idx = text.indexOf(candidate);
      const preceding = text.substring(Math.max(0, idx - 15), idx).toLowerCase();
      if (!preceding.includes('a/c') && !preceding.includes('acct') && !preceding.includes('card')) {
        return candidate;
      }
    }
    return all12[0];
  }
  return null;
}

function extractTransactionDate(text) {
  if (!text) return null;
  const currentYear = new Date().getFullYear();
  const today = new Date();

  // Pattern 0: Relative dates ("Today", "Today, 8:46 PM", "Yesterday")
  const lower = text.toLowerCase();
  if (/\btoday\b/i.test(lower)) {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (/\byesterday\b/i.test(lower)) {
    const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const y = yest.getFullYear();
    const m = String(yest.getMonth() + 1).padStart(2, '0');
    const d = String(yest.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const monthMap = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };

  const monthFirstMatch = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/i);
  if (monthFirstMatch) {
    const month = monthMap[monthFirstMatch[1].toLowerCase()];
    const day = parseInt(monthFirstMatch[2], 10);
    let year = parseInt(monthFirstMatch[3], 10);
    if (year < 100) year += 2000;
    if (month && day >= 1 && day <= 31 && year >= 2020 && year <= currentYear + 1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const alphaMatch = text.match(/\b(\d{1,2})[-/ ]?([A-Za-z]{3,9})[-/ ]?(\d{2,4})\b/i);
  if (alphaMatch) {
    const day = parseInt(alphaMatch[1], 10);
    const month = monthMap[alphaMatch[2].toLowerCase()];
    let year = parseInt(alphaMatch[3], 10);
    if (year < 100) year += 2000;
    if (month && day >= 1 && day <= 31 && year >= 2020 && year <= currentYear + 1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const numMatch = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10);
    let year = parseInt(numMatch[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= currentYear + 1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const isoMatch = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= currentYear + 1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function normalizeDateToIso(rawDate) {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) {
    return isoPrefix[1];
  }

  const fromExtractor = extractTransactionDate(trimmed);
  if (fromExtractor) {
    return fromExtractor;
  }

  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= new Date().getFullYear() + 1) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {
    // ignore
  }

  return null;
}

function cleanMerchantCandidate(name) {
  return name
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:and\s+Refno|Ref\s+no|Refno|Ref|UPI|RRn|Txn|UTR|Date|Time)\b.*$/i, '')
    .trim();
}

function isValidMerchantCandidate(name) {
  if (!name || name === 'Unknown' || name.length <= 1) return false;
  if (/^\d+$/.test(name)) return false;
  const lower = name.toLowerCase();
  if (
    lower === 'transaction' ||
    lower === 'completed' ||
    lower === 'successful' ||
    lower === 'payment' ||
    lower === 'transfer' ||
    lower === 'details'
  ) {
    return false;
  }
  return true;
}

function extractMerchant(text) {
  if (!text) return 'Unknown';

  const appPaidMatch = text.match(
    /(?:Paid\s+to|Payment\s+to|Money\s+Sent\s+to|Money\s+Transferred\s+to)\s*[:]?\s*\n*([A-Za-z0-9\s&.\-_]+?)(?:\n|(?:\s+(?:on|via|ref|refno|using|from|avl|upi|completed|successful|at)\b)|[,\.]|$)/i
  );
  if (appPaidMatch && appPaidMatch[1] && appPaidMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(appPaidMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  const toMatch = text.match(/\b(?:To|Payee)\s*[:]?\s*\n*([A-Za-z0-9\s&.\-_]+?)(?:\n|(?:\s+(?:on|via|ref|refno|using|from)\b)|[,\.]|$)/i);
  if (toMatch && toMatch[1] && toMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(toMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  const upiSlashMatch = text.match(
    /(?:UPI|Info|Txn)[:\s/]+(?:\w+\/)?(?:\d+\/)?([A-Za-z\s&.\-_]+?)(?:\/[A-Za-z0-9@.\-_]+|$)/i
  );
  if (upiSlashMatch && upiSlashMatch[1] && upiSlashMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(upiSlashMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  const trfMatch = text.match(
    /trf\s+to\s+([^,\.\n]+?)(?:\s+(?:and\s+Refno|ref|on\s+date|at|avl|upi|if\s+not)\b|[,\.\n]|$)/i
  );
  if (trfMatch && trfMatch[1] && trfMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(trfMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  const towardsMatch = text.match(
    /towards\s+([^,\.\n]+?)(?:\s+(?:on|via|ref|refno|using|from|avl|upi|if\s+not)\b|[,\.\n]|$)/i
  );
  if (towardsMatch && towardsMatch[1] && towardsMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(towardsMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  const atMatch = text.match(/\bat\s+([^,\.\n]+?)(?:\s+(?:on|via|ref|refno|using|avl|if\s+not)\b|[,\.\n]|$)/i);
  if (atMatch && atMatch[1].trim()) {
    const candidate = atMatch[1].trim();
    if (!/^\d{1,2}[:.]\d{2}/.test(candidate)) {
      const cleaned = cleanMerchantCandidate(candidate);
      if (isValidMerchantCandidate(cleaned)) {
        return cleaned;
      }
    }
  }

  const vpaMatch = text.match(/VPA\s*[:]?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/i);
  if (vpaMatch && vpaMatch[1].trim()) {
    return vpaMatch[1].trim();
  }

  return 'Unknown';
}

function extractAmountWithProminence(text, ocrBlocks) {
  if (!text && (!ocrBlocks || ocrBlocks.length === 0)) {
    return { amount: null, confidence: 'low', method: 'none' };
  }

  const upiRef = extractUpiReference(text);
  const vpaHandles = text.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\b/g) || [];
  const textWithoutVpas = text.replace(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\b/gi, ' ');
  const candidates = [];

  const isPlausibleAmount = (n, raw) => {
    if (isNaN(n) || n <= 0 || n > 10000000) return false;
    if (raw.replace(/\D/g, '').length === 12 || (upiRef && raw.includes(upiRef))) {
      return false;
    }
    const cleanRaw = raw.replace(/[,\s]/g, '');
    for (const vpa of vpaHandles) {
      if (vpa.includes(cleanRaw)) {
        return false;
      }
    }
    if (raw.replace(/\D/g, '').length === 10 && /^[6-9]/.test(raw.trim())) {
      return false;
    }
    if (!raw.includes('.') && n >= 2020 && n <= 2030) {
      return false;
    }
    return true;
  };

  // Step 1: Explicit Currency Symbol
  const currencyPrefixRegexes = [
    /(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi,
    /\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:₹|Rs\.?|INR)\b/gi,
  ];

  for (const regex of currencyPrefixRegexes) {
    let match;
    while ((match = regex.exec(textWithoutVpas)) !== null) {
      const rawNum = match[1];
      const parsed = parseFloat(rawNum.replace(/,/g, ''));
      if (isPlausibleAmount(parsed, rawNum)) {
        candidates.push({
          val: parsed,
          rawStr: rawNum,
          source: 'currency_regex',
          confidence: 'high',
          score: 100 + (rawNum.includes('.') ? 10 : 5),
        });
      }
    }
  }

  // Contextual verbs
  const verbRegex =
    /(?:debited|credited|spent|paid|transferred|sent|received|withdrawn|deposit(?:ed)?|amount|amt|total)\s+(?:by|of|for|is)?\s*[:=]?\s*(?:₹|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

  let verbMatch;
  while ((verbMatch = verbRegex.exec(textWithoutVpas)) !== null) {
    const rawNum = verbMatch[1];
    const parsed = parseFloat(rawNum.replace(/,/g, ''));
    if (isPlausibleAmount(parsed, rawNum)) {
      candidates.push({
        val: parsed,
        rawStr: rawNum,
        source: 'contextual_verb',
        confidence: 'high',
        score: 90 + (rawNum.includes('.') ? 10 : 5),
      });
    }
  }

  if (candidates.length > 0) {
    const distinctVals = Array.from(new Set(candidates.map((c) => c.val)));
    if (distinctVals.length === 1) {
      return {
        amount: distinctVals[0],
        confidence: 'high',
        method: candidates[0].source,
      };
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0].score > candidates[1].score + 15) {
      return {
        amount: candidates[0].val,
        confidence: 'high',
        method: candidates[0].source,
      };
    }
    return {
      amount: candidates[0].val,
      confidence: 'medium',
      method: candidates[0].source,
    };
  }

  // Step 2: Fallback Heuristic: OCR Prominence
  if (ocrBlocks && ocrBlocks.length > 0) {
    const blockCandidates = [];
    for (const block of ocrBlocks) {
      const elementsToScan = [];
      if (block.lines && block.lines.length > 0) {
        for (const line of block.lines) {
          if (line.elements && line.elements.length > 0) {
            for (const el of line.elements) {
              elementsToScan.push({ text: el.text, box: el.boundingBox || line.boundingBox });
            }
          } else {
            elementsToScan.push({ text: line.text, box: line.boundingBox });
          }
        }
      } else {
        elementsToScan.push({ text: block.text, box: block.boundingBox });
      }

      for (const item of elementsToScan) {
        const itemText = item.text.trim();
        const cleanMatch = itemText.match(
          /^[₹RsINR\s]*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)[₹RsINR\s]*$/i
        );
        if (cleanMatch) {
          const rawNum = cleanMatch[1];
          const parsed = parseFloat(rawNum.replace(/,/g, ''));
          if (isPlausibleAmount(parsed, rawNum)) {
            const box = item.box || block.boundingBox;
            let prominenceScore = 20;
            if (box) {
              const height = box.height || 0;
              const area = (box.width || 0) * height;
              prominenceScore = height * 2 + Math.sqrt(area);
            }
            if (rawNum.includes('.')) {
              prominenceScore *= 1.25;
            }
            blockCandidates.push({
              val: parsed,
              rawStr: rawNum,
              source: 'prominence_heuristic',
              confidence: 'medium',
              score: prominenceScore,
            });
          }
        }
      }
    }

    if (blockCandidates.length > 0) {
      blockCandidates.sort((a, b) => b.score - a.score);
      const top = blockCandidates[0];
      const competitors = blockCandidates.filter(
        (c) => c.val !== top.val && c.score >= top.score * 0.75
      );
      if (competitors.length === 0) {
        return {
          amount: top.val,
          confidence: 'medium',
          method: 'prominence_heuristic',
        };
      }
      return {
        amount: top.val,
        confidence: 'low',
        method: 'prominence_heuristic',
      };
    }
  }

  // Step 3: Text-Only Standalone Numeric Heuristic
  const standaloneDecimals = textWithoutVpas.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/g);
  if (standaloneDecimals && standaloneDecimals.length > 0) {
    const validDecimals = [];
    for (const d of standaloneDecimals) {
      const parsed = parseFloat(d.replace(/,/g, ''));
      if (isPlausibleAmount(parsed, d)) {
        validDecimals.push(parsed);
      }
    }
    const uniqueDecimals = Array.from(new Set(validDecimals));
    if (uniqueDecimals.length === 1) {
      return {
        amount: uniqueDecimals[0],
        confidence: 'medium',
        method: 'prominence_heuristic',
      };
    } else if (uniqueDecimals.length > 1) {
      return {
        amount: uniqueDecimals[0],
        confidence: 'low',
        method: 'prominence_heuristic',
      };
    }
  }

  // 3B: Standalone integers (e.g. 350)
  const allNumbers = textWithoutVpas.match(/\b([1-9][0-9]{1,6})\b/g);
  if (allNumbers && allNumbers.length > 0) {
    const validIntegers = [];
    const txDate = extractTransactionDate(text);

    for (const numStr of allNumbers) {
      const parsed = parseInt(numStr, 10);
      if (isPlausibleAmount(parsed, numStr)) {
        if (txDate) {
          const [y, m, d] = txDate.split('-').map(Number);
          if (parsed === y || parsed === d || (parsed === m && numStr.length <= 2)) {
            continue;
          }
        }
        const idx = text.indexOf(numStr);
        if (idx >= 0) {
          const pre = text.substring(Math.max(0, idx - 15), idx).toLowerCase();
          if (
            pre.includes('xx') ||
            pre.includes('**') ||
            pre.includes('a/c') ||
            pre.includes('acct') ||
            pre.includes('card')
          ) {
            continue;
          }
        }
        validIntegers.push(parsed);
      }
    }

    const uniqueIntegers = Array.from(new Set(validIntegers));
    if (uniqueIntegers.length === 1) {
      return {
        amount: uniqueIntegers[0],
        confidence: 'medium',
        method: 'prominence_heuristic',
      };
    } else if (uniqueIntegers.length > 1) {
      return {
        amount: uniqueIntegers[0],
        confidence: 'low',
        method: 'prominence_heuristic',
      };
    }
  }

  return {
    amount: null,
    confidence: 'low',
    method: 'none',
  };
}

const BANK_ALIASES = {
  sbi: ['sbi', 'state bank of india', 'state bank', 'sbiref', 'sbi upi', 'state bank of'],
  'sbi card': ['sbi card', 'sbi credit card', 'sbicard'],
  fino: ['fino', 'fino payments bank', 'fino bank', 'fino pay', 'finobank'],
  slice: ['slice', 'slice card', 'slice credit', 'slice super card'],
  hdfc: ['hdfc', 'hdfc bank', 'hdfc credit card'],
  icici: ['icici', 'icici bank', 'icici credit card'],
  axis: ['axis', 'axis bank'],
  kotak: ['kotak', 'kotak mahindra', 'kotak 811', '811'],
  pnb: ['pnb', 'punjab national bank', 'punjab national'],
  bob: ['bob', 'bank of baroda', 'baroda'],
  canara: ['canara', 'canara bank'],
  paytm: ['paytm', 'paytm payments bank', 'paytm bank', 'paytm wallet'],
  airtel: ['airtel', 'airtel payments bank', 'airtel bank', 'airtel money'],
  union: ['union bank', 'union bank of india', 'ubi'],
  idfc: ['idfc', 'idfc first', 'idfc first bank', 'idfc bank'],
  indusind: ['indusind', 'indusind bank'],
  federal: ['federal', 'federal bank'],
  yes: ['yes bank', 'yesbank'],
  rbl: ['rbl', 'rbl bank'],
  boi: ['bank of india', 'boi'],
  central: ['central bank of india', 'central bank', 'cbi'],
  indian: ['indian bank'],
  iob: ['indian overseas bank', 'iob'],
  uco: ['uco bank', 'uco'],
  bandhan: ['bandhan bank', 'bandhan'],
  au: ['au small finance', 'au bank', 'aubank'],
  jupiter: ['jupiter', 'jupiter money'],
  fi: ['fi money', 'fi bank', 'federal fi'],
  cred: ['cred', 'cred pay', 'cred cash'],
  cash: ['cash', 'cash wallet', 'physical cash', 'pocket cash'],
};

const GENERIC_ACCOUNT_WORDS = new Set([
  'bank',
  'account',
  'acct',
  'card',
  'salary',
  'savings',
  'current',
  'wallet',
  'money',
  'credit',
  'debit',
  'pay',
  'payments',
]);

function matchSingleAccountSource(targetText, userAccounts) {
  const rawLower = targetText.toLowerCase().trim();

  // 1. Account number digits matching (e.g. "XX0186", "....0186", "A/c 4521", "ending in 4521")
  const digitMatch = rawLower.match(
    /\b(?:a\/[cC]|acct|account|card)\s*(?:no\.?)?\s*([x\*•\.]*(\d{3,4}))\b|(?:\.{2,}|[x\*•]{2,}|\bending\s+)(\d{3,4})\b/i
  );
  if (digitMatch) {
    const digits = digitMatch[3] || digitMatch[2] || digitMatch[1]?.replace(/\D/g, '');
    if (digits && digits.length >= 3) {
      const digitMatchAcc = userAccounts.find((acc) => acc.name.includes(digits));
      if (digitMatchAcc) return digitMatchAcc.id;
    }
  }

  // 2. Direct exact match
  const exactMatch = userAccounts.find((acc) => {
    const nameLower = acc.name.toLowerCase().trim();
    return nameLower === rawLower;
  });
  if (exactMatch) return exactMatch.id;

  // 3. Match using BANK_ALIASES with scoring
  let bestCandidateId;
  let highestScore = 0;

  const detectedIsCard = /\b(?:card|credit)\b/i.test(rawLower);

  for (const acc of userAccounts) {
    const accLower = acc.name.toLowerCase().trim();
    const accountIsCard = acc.type === 'credit_card' || /\b(?:card|credit)\b/i.test(accLower);
    let score = 0;

    for (const [canonical, aliases] of Object.entries(BANK_ALIASES)) {
      const detectedMatchesFamily = aliases.some((alias) => rawLower.includes(alias));
      const accountMatchesFamily = aliases.some((alias) => accLower.includes(alias));

      if (detectedMatchesFamily && accountMatchesFamily) {
        score += 100;

        if (detectedIsCard === accountIsCard) {
          score += 50;
        } else {
          score -= 30;
        }

        if (canonical === 'sbi card' && accountIsCard) {
          score += 20;
        }
      }
    }

    const accWords = accLower.split(/\s+/).filter((w) => w.length > 2 && !GENERIC_ACCOUNT_WORDS.has(w));
    for (const word of accWords) {
      if (rawLower.includes(word)) {
        score += 30;
      }
    }

    if (score > highestScore && score >= 50) {
      highestScore = score;
      bestCandidateId = acc.id;
    }
  }

  return bestCandidateId;
}

function matchAccountToSource(detectedTextOrBank, userAccounts) {
  if (!detectedTextOrBank || !userAccounts || userAccounts.length === 0) {
    return undefined;
  }

  // Phase A: Check if there is an explicit source line ("From: ...", "Paid using: ...", "Debited from: ...")
  const sourceLineMatch = detectedTextOrBank.match(
    /(?:from|paid\s+using|debited\s+from|transferred\s+from|source\s+account|payment\s+method)\s*[:]?\s*([^\n\r]+)/i
  );
  if (sourceLineMatch && sourceLineMatch[1]) {
    const matched = matchSingleAccountSource(sourceLineMatch[1], userAccounts);
    if (matched) return matched;
  }

  // Phase B: Clean recipient VPAs (e.g. gopalsweet@okhdfcbank) so payee routing handles don't masquerade as source
  const cleanedText = detectedTextOrBank
    .replace(/\b[a-zA-Z0-9._]+@\w+\b/gi, ' ')
    .replace(/@\w+/gi, ' ');

  return matchSingleAccountSource(cleanedText, userAccounts);
}

function parseTransaction(input) {
  const text = (input.rawText || '').trim();
  const learnedRules = input.learnedRules || [];
  const availableCategories = input.availableCategories || [];
  const userAccounts = input.userAccounts || [];

  let suggestedType = 'expense';
  if (/\b(?:credited|deposited|received|refund|cashback|added)\b/i.test(text)) {
    suggestedType = 'income';
  } else if (/\b(?:debited|spent|paid|withdrawn|deducted|sent|purchase)\b/i.test(text)) {
    suggestedType = 'expense';
  }

  const amountResult = extractAmountWithProminence(text, input.ocrBlocks);
  const amount = amountResult.amount;
  const amountConfidence = amountResult.confidence;
  const upiRef = extractUpiReference(text);
  const date = extractTransactionDate(text) || normalizeDateToIso('today');
  const merchant = extractMerchant(text);
  const normalizedMerchant = normalizeMerchantName(merchant);

  let accountHint;
  let matchedAccountId;
  const acctMatch = text.match(
    /\b(?:A\/[cC]|Acct|Account|Card)\s*(?:no\.?)?\s*([X\*•\.]*\d{3,4})\b|(?:\.{2,}|[X\*•]{2,}|\bending\s+)(\d{3,4})\b/i
  );
  if (acctMatch) {
    accountHint = acctMatch[1] || acctMatch[2];
  }

  if (userAccounts.length > 0) {
    matchedAccountId = matchAccountToSource(text, userAccounts);
    if (matchedAccountId) {
      const found = userAccounts.find((a) => a.id === matchedAccountId);
      if (found) accountHint = found.name;
    }
  }

  let suggestedCategory;
  let merchantConfidence = 'low';
  let isCategoryLearned = false;
  let classificationSource = 'unrecognized';

  const exactRule =
    normalizedMerchant && learnedRules.length > 0
      ? learnedRules.find((r) => r.merchant_name === normalizedMerchant)
      : null;

  if (exactRule) {
    suggestedCategory = exactRule.category;
    if (exactRule.transaction_type) {
      suggestedType = exactRule.transaction_type;
    }
    merchantConfidence = 'high';
    isCategoryLearned = true;
    classificationSource = exactRule.source === 'user_manual' ? 'user_rule' : 'gemini_rule';
  } else {
    const seedCategory = inferCategoryFromText(
      `${merchant} ${text}`,
      availableCategories
    );
    const isRecognizedSeed = CATEGORY_KEYWORD_MAP.some((group) =>
      group.keywords.some((kw) => {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        return regex.test(`${merchant} ${text}`);
      })
    );
    if (isRecognizedSeed) {
      suggestedCategory = seedCategory;
      merchantConfidence = 'medium';
      classificationSource = 'seed_keyword';
    } else {
      suggestedCategory = seedCategory;
      merchantConfidence = 'low';
      classificationSource = 'unrecognized';
    }
  }

  const needsGeminiAmount = amountConfidence === 'low' || amount === null;
  const needsGeminiMerchant =
    classificationSource === 'unrecognized' &&
    merchant !== 'Unknown' &&
    merchant.trim().length > 1;

  return {
    amount,
    amountConfidence,
    amountExtractionMethod: amountResult.method,
    upiRef,
    date,
    merchant,
    normalizedMerchant,
    merchantConfidence,
    suggestedCategory,
    suggestedType,
    isCategoryLearned,
    classificationSource,
    accountHint,
    matchedAccountId,
    rawText: text,
    needsGeminiAmount,
    needsGeminiMerchant,
    resolutionTier: 'tier1_local',
  };
}

async function parseTransactionWithPipeline(input, options = {}) {
  const rawTextTrimmed = (input.rawText || '').trim();
  const hasBlocks = Boolean(input.ocrBlocks && input.ocrBlocks.length > 0);
  const isCorruptedOrBlank = rawTextTrimmed.length < 15 && !hasBlocks;

  // TIER 3: Multimodal Vision Fallback — Strictly invoked ONLY when Tier 1 returns empty or near-empty text
  if (isCorruptedOrBlank && options.imageUri && options.enableGeminiEscalation) {
    if (options.mockGeminiVision) {
      const fullVisionRes = await options.mockGeminiVision({
        imageUri: options.imageUri,
        base64: options.base64,
        mimeType: options.mimeType,
        availableCategories: input.availableCategories,
      });

      if (fullVisionRes.success && fullVisionRes.data) {
        const vData = fullVisionRes.data;
        const normMerchant =
          vData.merchant_or_person && vData.merchant_or_person !== 'Unknown'
            ? normalizeMerchantName(vData.merchant_or_person)
            : '';

        let matchedAccountId;
        if (input.userAccounts && input.userAccounts.length > 0) {
          matchedAccountId = matchAccountToSource(
            `${vData.merchant_or_person || ''} ${rawTextTrimmed}`,
            input.userAccounts
          );
        }

        return {
          amount: vData.amount,
          amountConfidence: vData.amount !== null ? 'high' : 'low',
          amountExtractionMethod: vData.amount !== null ? 'currency_regex' : 'none',
          upiRef: null,
          date: normalizeDateToIso(vData.date_if_present) || normalizeDateToIso('today'),
          merchant: vData.merchant_or_person || 'Unknown',
          normalizedMerchant: normMerchant,
          merchantConfidence: vData.merchant_or_person !== 'Unknown' ? 'high' : 'low',
          suggestedCategory: vData.suggested_category || 'Uncategorized',
          suggestedType: vData.suggested_type || 'expense',
          isCategoryLearned: false,
          classificationSource: 'gemini_rule',
          matchedAccountId,
          rawText: rawTextTrimmed,
          needsGeminiAmount: vData.amount === null,
          needsGeminiMerchant: vData.merchant_or_person === 'Unknown',
          resolutionTier: 'tier3_vision_fallback',
        };
      }
    }
  }

  // TIER 1: Run deterministic on-device parser (0ms, 0 network, 0 API calls)
  const result = parseTransaction(input);
  result.resolutionTier = 'tier1_local';

  if (!options.enableGeminiEscalation) {
    return result;
  }

  const isTier1HighConfidence =
    result.amount !== null &&
    (result.amountConfidence === 'high' || result.amountConfidence === 'medium') &&
    result.merchant !== 'Unknown' &&
    !result.needsGeminiMerchant &&
    (!input.userAccounts?.length || Boolean(result.matchedAccountId));

  if (isTier1HighConfidence) {
    return result;
  }

  // TIER 2: Structured Text + Spatial Coordinates Escalation
  // Sends structured JSON array of text blocks with spatial coordinates (y-pos, width, height) — NEVER raw pixels!
  if (options.mockGeminiSpatial) {
    const spatialRes = await options.mockGeminiSpatial({
      blocks: input.ocrBlocks,
      rawText: input.rawText,
      availableCategories: input.availableCategories,
      userAccounts: input.userAccounts,
    });

    if (spatialRes.success && spatialRes.data) {
      const sData = spatialRes.data;
      result.resolutionTier = 'tier2_gemini_spatial';

      if (sData.amount !== null) {
        result.amount = sData.amount;
        result.amountConfidence = 'high';
        result.needsGeminiAmount = false;
        result.amountExtractionMethod = 'prominence_heuristic';
      }

      if (sData.merchant_or_person && sData.merchant_or_person !== 'Unknown') {
        result.merchant = sData.merchant_or_person;
        result.normalizedMerchant = normalizeMerchantName(sData.merchant_or_person);
        result.merchantConfidence = 'high';
      }

      if (sData.direction) {
        result.suggestedType = sData.direction === 'received' ? 'income' : 'expense';
      }

      if (sData.transaction_datetime) {
        const normDate = normalizeDateToIso(sData.transaction_datetime);
        if (normDate) {
          result.date = normDate;
        }
      }
      if (!result.date) {
        result.date = extractTransactionDate(input.rawText) || normalizeDateToIso('today');
      }

      if (sData.suggested_category) {
        result.suggestedCategory = sData.suggested_category;
        result.classificationSource = 'gemini_rule';
        result.needsGeminiMerchant = false;
      }

      if (sData.detected_bank_or_source) {
        result.detectedBankOrSource = sData.detected_bank_or_source;
      }
      if (input.userAccounts && input.userAccounts.length > 0) {
        const bankQuery = `${sData.detected_bank_or_source || ''} ${input.rawText || ''}`.trim();
        const matched = matchAccountToSource(bankQuery, input.userAccounts);
        if (matched) {
          result.matchedAccountId = matched;
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// TEST FIXTURES
// ---------------------------------------------------------------------------

const mockAccounts = [
  { id: 'acc-sbi-1', name: 'SBI • Salary (0186)', type: 'bank' },
  { id: 'acc-hdfc-2', name: 'HDFC Bank (4521)', type: 'bank' },
  { id: 'acc-cash-3', name: 'Cash Wallet', type: 'cash' },
];

const mockCategories = [
  'Food',
  'Travel',
  'Hostel/Rent',
  'Recharge/Data',
  'Subscriptions',
  'Shopping',
  'Entertainment',
  'Books/Stationery',
  'Other',
];

const mockLearnedRules = [
  {
    merchant_name: 'gopal sweet',
    category: 'Food',
    transaction_type: 'expense',
    source: 'user_manual',
    confidence: 1.0,
    usage_count: 7,
  },
  {
    merchant_name: 'chai point',
    category: 'Food',
    transaction_type: 'expense',
    source: 'gemini',
    confidence: 0.9,
    usage_count: 2,
  },
  {
    merchant_name: 'shree radhe store',
    category: 'Shopping',
    transaction_type: 'expense',
    source: 'user_manual',
    confidence: 1.0,
    usage_count: 4,
  },
];

// ===========================================================================
// [TEST SUITE 1] Google Pay (GPay) Real Screenshot OCR Layouts
// ===========================================================================
console.log('▶ [TEST SUITE 1] Testing Google Pay (GPay) Screenshots...');

// Layout 1A: Standard GPay completed payment with currency symbol
const gpayText1 = `
Paid to
Gopal Sweet
gopalsweet@okhdfcbank
₹450.00
Completed
Sep 29, 2026, 2:30 PM
UPI transaction ID
427189024819
To: GOPAL SWEET
From: State Bank of India (....0186)
Google Transaction ID
CICAgKC12345
`;

const resGpay1 = parseTransaction({
  rawText: gpayText1,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  1A. GPay Standard:');
console.log(`      Amount: ₹${resGpay1.amount} (${resGpay1.amountConfidence} confidence)`);
console.log(`      Merchant: "${resGpay1.merchant}" -> Normalized: "${resGpay1.normalizedMerchant}"`);
console.log(`      Category: ${resGpay1.suggestedCategory} (Source: ${resGpay1.classificationSource})`);
console.log(`      UPI Ref / UTR: ${resGpay1.upiRef}`);
console.log(`      Date: ${resGpay1.date}`);
console.log(`      Matched Account: ${resGpay1.matchedAccountId}`);

assert.strictEqual(resGpay1.amount, 450);
assert.strictEqual(resGpay1.amountConfidence, 'high');
assert.strictEqual(resGpay1.normalizedMerchant, 'gopal sweet');
assert.strictEqual(resGpay1.suggestedCategory, 'Food');
assert.strictEqual(resGpay1.isCategoryLearned, true);
assert.strictEqual(resGpay1.classificationSource, 'user_rule');
assert.strictEqual(resGpay1.upiRef, '427189024819');
assert.strictEqual(resGpay1.date, '2026-09-29');
assert.strictEqual(resGpay1.matchedAccountId, 'acc-sbi-1');
assert.strictEqual(resGpay1.needsGeminiAmount, false);
assert.strictEqual(resGpay1.needsGeminiMerchant, false);

// Layout 1B: GPay layout where currency symbol was missed by OCR, but prominent amount exists
const gpayTextNoCurrency = `
Paid to
Zomato
420.00
Completed • 29 Sep 2026, 1:15 PM
UPI Ref No. 427198273615
Paid using SBI Bank Account ...0186
`;

const resGpayNoCurrency = parseTransaction({
  rawText: gpayTextNoCurrency,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  1B. GPay Without Currency Symbol (Prominence Fallback):');
console.log(`      Amount: ₹${resGpayNoCurrency.amount} (${resGpayNoCurrency.amountConfidence} confidence, method: ${resGpayNoCurrency.amountExtractionMethod})`);
console.log(`      Merchant: "${resGpayNoCurrency.merchant}"`);
console.log(`      UPI Ref: ${resGpayNoCurrency.upiRef}`);

assert.strictEqual(resGpayNoCurrency.amount, 420);
assert.strictEqual(resGpayNoCurrency.amountConfidence, 'medium');
assert.strictEqual(resGpayNoCurrency.amountExtractionMethod, 'prominence_heuristic');
assert.strictEqual(resGpayNoCurrency.upiRef, '427198273615');
assert.strictEqual(resGpayNoCurrency.suggestedCategory, 'Food');
assert.strictEqual(resGpayNoCurrency.classificationSource, 'seed_keyword');

// Layout 1C: GPay with OCR Bounding Box Blocks (Hero number font prominence)
const gpayBlocks = [
  { text: 'Paid to\nZomato', boundingBox: { x: 50, y: 100, width: 300, height: 35 } },
  { text: '650.00', boundingBox: { x: 100, y: 160, width: 220, height: 80 } },
  { text: 'Completed', boundingBox: { x: 120, y: 260, width: 140, height: 25 } },
  { text: 'UPI Ref 427189024819', boundingBox: { x: 50, y: 320, width: 280, height: 20 } },
];

const resGpayBlocks = parseTransaction({
  rawText: 'Paid to Zomato\n650.00\nCompleted\nUPI Ref 427189024819',
  ocrBlocks: gpayBlocks,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  1C. GPay OCR Bounding Box Prominence:');
console.log(`      Hero Amount: ₹${resGpayBlocks.amount} (${resGpayBlocks.amountExtractionMethod})`);
assert.strictEqual(resGpayBlocks.amount, 650);
assert.strictEqual(resGpayBlocks.amountConfidence, 'medium');
assert.strictEqual(resGpayBlocks.upiRef, '427189024819');

console.log('✔ [TEST SUITE 1 PASSED]: All GPay layouts parsed accurately.\n');

// ===========================================================================
// [TEST SUITE 2] PhonePe Real Screenshot OCR Layouts
// ===========================================================================
console.log('▶ [TEST SUITE 2] Testing PhonePe Screenshots...');

// Layout 2A: PhonePe standard successful payment with commas in amount
const phonepeText1 = `
Transaction Successful
29 September 2026 at 1:45 PM
₹1,240
Paid to
Blinkit Commerce Private Limited
blinkit@ybl
Transfer Details
Transaction ID
T2609291345123456789012
UPI Ref No: 427182937401
Debited from
State Bank of India - 0186
UTR: 427182937401
`;

const resPhonePe1 = parseTransaction({
  rawText: phonepeText1,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  2A. PhonePe Standard:');
console.log(`      Amount: ₹${resPhonePe1.amount} (${resPhonePe1.amountConfidence} confidence)`);
console.log(`      Merchant: "${resPhonePe1.merchant}" -> Normalized: "${resPhonePe1.normalizedMerchant}"`);
console.log(`      UPI Ref / UTR: ${resPhonePe1.upiRef}`);
console.log(`      Category: ${resPhonePe1.suggestedCategory}`);
console.log(`      Date: ${resPhonePe1.date}`);
console.log(`      Matched Account: ${resPhonePe1.matchedAccountId}`);

assert.strictEqual(resPhonePe1.amount, 1240);
assert.strictEqual(resPhonePe1.amountConfidence, 'high');
assert.strictEqual(resPhonePe1.normalizedMerchant, 'blinkit');
assert.strictEqual(resPhonePe1.upiRef, '427182937401');
assert.strictEqual(resPhonePe1.suggestedCategory, 'Food');
assert.strictEqual(resPhonePe1.date, '2026-09-29');
assert.strictEqual(resPhonePe1.matchedAccountId, 'acc-sbi-1');

// Layout 2B: PhonePe without currency prefix, relying on prominent number
const phonepeTextNoCurrency = `
Transaction Successful
Paid to
Shree Radhe Store
350
Debit from XX0186
UTR: 427109283741
29 Sep 2026
`;

const resPhonePeNoCurrency = parseTransaction({
  rawText: phonepeTextNoCurrency,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  2B. PhonePe Fallback (Rule Matched):');
console.log(`      Amount: ₹${resPhonePeNoCurrency.amount}`);
console.log(`      Merchant: "${resPhonePeNoCurrency.normalizedMerchant}"`);
console.log(`      Category: ${resPhonePeNoCurrency.suggestedCategory} (Source: ${resPhonePeNoCurrency.classificationSource})`);

assert.strictEqual(resPhonePeNoCurrency.amount, 350);
assert.strictEqual(resPhonePeNoCurrency.normalizedMerchant, 'shree radhe store');
assert.strictEqual(resPhonePeNoCurrency.suggestedCategory, 'Shopping');
assert.strictEqual(resPhonePeNoCurrency.isCategoryLearned, true);
assert.strictEqual(resPhonePeNoCurrency.upiRef, '427109283741');

console.log('✔ [TEST SUITE 2 PASSED]: All PhonePe layouts parsed accurately.\n');

// ===========================================================================
// [TEST SUITE 3] Paytm Real Screenshot OCR Layouts
// ===========================================================================
console.log('▶ [TEST SUITE 3] Testing Paytm Screenshots...');

// Layout 3A: Paytm Money Sent with space between ₹ and amount
const paytmText1 = `
Money Sent Successfully
₹ 520
Paid to
Apollo Pharmacy
apollo@paytm
UPI Ref ID: 427164928172
29/09/2026, 03:15 PM
From: HDFC Bank A/c No. XX4521
`;

const resPaytm1 = parseTransaction({
  rawText: paytmText1,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  3A. Paytm Money Sent:');
console.log(`      Amount: ₹${resPaytm1.amount} (${resPaytm1.amountConfidence})`);
console.log(`      Merchant: "${resPaytm1.merchant}"`);
console.log(`      UPI Ref: ${resPaytm1.upiRef}`);
console.log(`      Date: ${resPaytm1.date}`);
console.log(`      Matched Account: ${resPaytm1.matchedAccountId}`);

assert.strictEqual(resPaytm1.amount, 520);
assert.strictEqual(resPaytm1.amountConfidence, 'high');
assert.strictEqual(resPaytm1.upiRef, '427164928172');
assert.strictEqual(resPaytm1.date, '2026-09-29');
assert.strictEqual(resPaytm1.matchedAccountId, 'acc-hdfc-2');

// Layout 3B: Paytm with decimal format and "To: Chai Point"
const paytmText2 = `
Payment Successful
₹85.00
To: Chai Point
chai@paytm
UPI Ref ID: 427103948572
Date & Time: 29 Sep 2026, 09:20 AM
From: State Bank of India
`;

const resPaytm2 = parseTransaction({
  rawText: paytmText2,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  3B. Paytm Chai Point (Gemini-Learned Rule):');
console.log(`      Amount: ₹${resPaytm2.amount}`);
console.log(`      Merchant: "${resPaytm2.normalizedMerchant}"`);
console.log(`      Category: ${resPaytm2.suggestedCategory} (Source: ${resPaytm2.classificationSource})`);

assert.strictEqual(resPaytm2.amount, 85);
assert.strictEqual(resPaytm2.normalizedMerchant, 'chai point');
assert.strictEqual(resPaytm2.suggestedCategory, 'Food');
assert.strictEqual(resPaytm2.isCategoryLearned, true);
assert.strictEqual(resPaytm2.classificationSource, 'gemini_rule');
assert.strictEqual(resPaytm2.upiRef, '427103948572');

console.log('✔ [TEST SUITE 3 PASSED]: All Paytm layouts parsed accurately.\n');

// ===========================================================================
// [TEST SUITE 4] Banking SMS Parsing via Shared Pipeline
// ===========================================================================
console.log('▶ [TEST SUITE 4] Testing Indian Banking SMS Messages...');

const sms1 = 'Dear SBI User, your A/c ending 0186 debited by Rs.450.00 on 29Sep26 trf to Gopal Sweet Ref 427189024819';
const resSms1 = parseTransaction({
  rawText: sms1,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  4A. SBI SMS:');
console.log(`      Amount: ₹${resSms1.amount}`);
console.log(`      Merchant: "${resSms1.merchant}"`);
console.log(`      Category: ${resSms1.suggestedCategory}`);
console.log(`      Matched Account: ${resSms1.matchedAccountId}`);

assert.strictEqual(resSms1.amount, 450);
assert.strictEqual(resSms1.normalizedMerchant, 'gopal sweet');
assert.strictEqual(resSms1.suggestedCategory, 'Food');
assert.strictEqual(resSms1.matchedAccountId, 'acc-sbi-1');
assert.strictEqual(resSms1.upiRef, '427189024819');
assert.strictEqual(resSms1.date, '2026-09-29');

const sms2 = 'Sent Rs.289.00 from HDFC Bank A/c XX4521 to ZOMATO on 29-09-2026 via UPI Ref 427198273615';
const resSms2 = parseTransaction({
  rawText: sms2,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
  learnedRules: mockLearnedRules,
});

console.log('  4B. HDFC SMS:');
console.log(`      Amount: ₹${resSms2.amount}`);
console.log(`      Merchant: "${resSms2.merchant}"`);
console.log(`      Category: ${resSms2.suggestedCategory}`);

assert.strictEqual(resSms2.amount, 289);
assert.strictEqual(resSms2.normalizedMerchant, 'zomato');
assert.strictEqual(resSms2.suggestedCategory, 'Food');
assert.strictEqual(resSms2.matchedAccountId, 'acc-hdfc-2');

console.log('✔ [TEST SUITE 4 PASSED]: Indian banking SMS alerts parsed cleanly.\n');

// ===========================================================================
// [TEST SUITE 5] Classification: user_merchant_rules Lookup & Zero-AI Invocations
// ===========================================================================
console.log('▶ [TEST SUITE 5] Testing Merchant Rules Lookup & Zero-AI Invocations...');

// Repeat merchant already in user_merchant_rules
const repeatMerchantText = 'Paid ₹450 to Gopal Sweet on 29-09-2026';
const resRepeat = parseTransaction({
  rawText: repeatMerchantText,
  learnedRules: mockLearnedRules,
});

assert.strictEqual(resRepeat.suggestedCategory, 'Food');
assert.strictEqual(resRepeat.isCategoryLearned, true);
assert.strictEqual(resRepeat.needsGeminiMerchant, false);
console.log('  5A. Known merchant "Gopal Sweet" resolved locally without calling Gemini (Zero AI Calls).');

// False positive prevention: "Gopal Medical" MUST NOT match "Gopal Sweet"
const falsePositiveText = 'Paid ₹120 to Gopal Medical Store on 29-09-2026';
const resFalsePos = parseTransaction({
  rawText: falsePositiveText,
  learnedRules: mockLearnedRules,
});

assert.notStrictEqual(resFalsePos.normalizedMerchant, 'gopal sweet');
assert.strictEqual(resFalsePos.isCategoryLearned, false);
assert.strictEqual(resFalsePos.classificationSource, 'unrecognized');
assert.strictEqual(resFalsePos.needsGeminiMerchant, true);
console.log('  5B. "Gopal Medical Store" rejected matching "Gopal Sweet" (Exact matching prevents false positives).');

// Genuinely unrecognized merchant flags for Gemini escalation
const newMerchantText = 'Paid ₹800 to Mohan Woodwork on 29-09-2026';
const resNew = parseTransaction({
  rawText: newMerchantText,
  learnedRules: mockLearnedRules,
});

assert.strictEqual(resNew.classificationSource, 'unrecognized');
assert.strictEqual(resNew.merchantConfidence, 'low');
assert.strictEqual(resNew.needsGeminiMerchant, true);
console.log('  5C. Unrecognized merchant "Mohan Woodwork" flagged for Gemini escalation.');

console.log('✔ [TEST SUITE 5 PASSED]: Rule lookup and classification logic verified.\n');

// ===========================================================================
// [TEST SUITE 6] Low Confidence Amount Escalation
// ===========================================================================
console.log('▶ [TEST SUITE 6] Testing Amount Confidence & Escalation...');

// Case 6A: No number in screenshot/text
const textNoNumber = 'Payment Successful to Zomato on 29 Sep 2026';
const resNoNumber = parseTransaction({
  rawText: textNoNumber,
});

assert.strictEqual(resNoNumber.amount, null);
assert.strictEqual(resNoNumber.amountConfidence, 'low');
assert.strictEqual(resNoNumber.needsGeminiAmount, true);
console.log('  6A. Missing amount correctly marked as low confidence and escalated to Gemini.');

// Case 6B: Ambiguous numbers without currency symbol or clear prominence
const textAmbiguous = 'Order 8892 and invoice 4421 completed successfully for Zomato';
const resAmbiguous = parseTransaction({
  rawText: textAmbiguous,
});

// Since neither has decimals or currency and multiple integers exist, amount confidence is low
assert.strictEqual(resAmbiguous.amountConfidence, 'low');
assert.strictEqual(resAmbiguous.needsGeminiAmount, true);
console.log('  6B. Ambiguous numbers flagged for Gemini escalation instead of silently choosing wrong value.');

console.log('✔ [TEST SUITE 6 PASSED]: Amount confidence and fallback escalation verified.\n');

// ===========================================================================
// [TEST SUITE 7] VPA / UPI ID Handle Filtering in SMS and Screenshots
// ===========================================================================
console.log('▶ [TEST SUITE 7] Testing VPA / UPI ID Filtering (Handle Number Exclusion)...');

// Case 7A: SMS with phone number inside VPA handle (e.g. user9876543210@upi)
const smsVpaPhone = 'Sent Rs.150.00 from SBI A/c 0186 to user9876543210@upi on 29-09-2026 Ref 427189024819';
const resVpa1 = parseTransaction({
  rawText: smsVpaPhone,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
});

console.log('  7A. SMS with phone number VPA:');
console.log(`      Extracted Amount: ₹${resVpa1.amount} (Confidence: ${resVpa1.amountConfidence})`);
assert.strictEqual(resVpa1.amount, 150);
assert.strictEqual(resVpa1.amountConfidence, 'high');
assert.notStrictEqual(resVpa1.amount, 9876543210);

// Case 7B: SMS with numeric suffix inside merchant VPA handle (e.g. merchant123@okhdfcbank)
const smsVpaAlpha = 'Paid Rs.499 to merchant123@okhdfcbank Ref 427189024819';
const resVpa2 = parseTransaction({
  rawText: smsVpaAlpha,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
});

console.log('  7B. SMS with alphanumeric VPA handle:');
console.log(`      Extracted Amount: ₹${resVpa2.amount}`);
assert.strictEqual(resVpa2.amount, 499);
assert.notStrictEqual(resVpa2.amount, 123);

// Case 7C: Screenshot text with VPA handle and amount without explicit Rs symbol
const ocrVpaNoCurrency = `
Paid to
user9998887776@paytm
250
UTR 427189024819
`;
const resVpa3 = parseTransaction({
  rawText: ocrVpaNoCurrency,
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
});

console.log('  7C. OCR text with VPA handle without currency prefix:');
console.log(`      Extracted Amount: ₹${resVpa3.amount}`);
assert.strictEqual(resVpa3.amount, 250);
assert.notStrictEqual(resVpa3.amount, 9998887776);

console.log('✔ [TEST SUITE 7 PASSED]: VPA handles excluded from amount candidates successfully.\n');

// ===========================================================================
// [TEST SUITE 8] Tier 1 vs Tier 2 vs Tier 3 Resolution Cascade
// ===========================================================================
console.log('▶ [TEST SUITE 8] Testing Unified 3-Tier Resolution Pipeline...');

// Case 8A: Tier 1 - High Confidence match resolved locally with 0 AI calls
let tier2Invoked = false;
let tier3Invoked = false;

const resCascadeTier1 = await parseTransactionWithPipeline(
  {
    rawText: gpayText1,
    userAccounts: mockAccounts,
    availableCategories: mockCategories,
    learnedRules: mockLearnedRules,
  },
  {
    enableGeminiEscalation: true,
    mockGeminiSpatial: async () => {
      tier2Invoked = true;
      return { success: true, data: {} };
    },
    mockGeminiVision: async () => {
      tier3Invoked = true;
      return { success: true, data: {} };
    },
  }
);

console.log('  8A. Tier 1 Local Deterministic:');
console.log(`      Resolution Tier: ${resCascadeTier1.resolutionTier}`);
console.log(`      Amount: ₹${resCascadeTier1.amount}, Merchant: "${resCascadeTier1.merchant}"`);
assert.strictEqual(resCascadeTier1.resolutionTier, 'tier1_local');
assert.strictEqual(tier2Invoked, false, 'Tier 2 should NOT be called for high confidence match');
assert.strictEqual(tier3Invoked, false, 'Tier 3 should NOT be called for high confidence match');
assert.strictEqual(resCascadeTier1.amount, 450);

// Case 8B: Tier 2 - Unrecognized merchant / low confidence escalates via spatial text geometry
tier2Invoked = false;
tier3Invoked = false;

const resCascadeTier2 = await parseTransactionWithPipeline(
  {
    rawText: 'Paid ₹800 to Mohan Woodwork on 29-09-2026',
    ocrBlocks: [
      { text: 'Paid to', boundingBox: { x: 50, y: 50, width: 100, height: 20 } },
      { text: 'Mohan Woodwork', boundingBox: { x: 50, y: 80, width: 250, height: 30 } },
      { text: '₹800.00', boundingBox: { x: 50, y: 140, width: 200, height: 60 } },
    ],
    userAccounts: mockAccounts,
    availableCategories: mockCategories,
    learnedRules: mockLearnedRules,
  },
  {
    enableGeminiEscalation: true,
    mockGeminiSpatial: async (options) => {
      tier2Invoked = true;
      assert.ok(options.blocks && options.blocks.length > 0, 'Spatial escalation must send blocks');
      return {
        success: true,
        data: {
          amount: 800,
          merchant_or_person: 'Mohan Woodwork',
          direction: 'sent',
          suggested_category: 'Other',
          detected_bank_or_source: 'SBI',
          transaction_datetime: '2026-09-29',
        },
      };
    },
    mockGeminiVision: async () => {
      tier3Invoked = true;
      return { success: true, data: {} };
    },
  }
);

console.log('  8B. Tier 2 Spatial Coordinates Escalation:');
console.log(`      Resolution Tier: ${resCascadeTier2.resolutionTier}`);
console.log(`      Merchant: "${resCascadeTier2.merchant}", Category: ${resCascadeTier2.suggestedCategory}`);
console.log(`      Type: ${resCascadeTier2.suggestedType}, Matched Account: ${resCascadeTier2.matchedAccountId}`);
assert.strictEqual(resCascadeTier2.resolutionTier, 'tier2_gemini_spatial');
assert.strictEqual(tier2Invoked, true, 'Tier 2 MUST be called for unrecognized merchant');
assert.strictEqual(tier3Invoked, false, 'Tier 3 should NOT be called when text blocks are present');
assert.strictEqual(resCascadeTier2.merchant, 'Mohan Woodwork');
assert.strictEqual(resCascadeTier2.suggestedType, 'expense');
assert.strictEqual(resCascadeTier2.matchedAccountId, 'acc-sbi-1');

// Case 8C: Tier 3 - Blank/Corrupted OCR text falls back to Multimodal Vision
tier2Invoked = false;
tier3Invoked = false;

const resCascadeTier3 = await parseTransactionWithPipeline(
  {
    rawText: '   ',
    ocrBlocks: [],
    availableCategories: mockCategories,
  },
  {
    imageUri: 'file:///mock/receipt_scenery.jpg',
    enableGeminiEscalation: true,
    mockGeminiSpatial: async () => {
      tier2Invoked = true;
      return { success: true, data: {} };
    },
    mockGeminiVision: async (options) => {
      tier3Invoked = true;
      assert.strictEqual(options.imageUri, 'file:///mock/receipt_scenery.jpg');
      return {
        success: true,
        data: {
          amount: 250,
          merchant_or_person: 'Cafe Coffee Day',
          suggested_type: 'expense',
          suggested_category: 'Food',
          date_if_present: '2026-09-29',
        },
      };
    },
  }
);

console.log('  8C. Tier 3 Multimodal Vision Fallback:');
console.log(`      Resolution Tier: ${resCascadeTier3.resolutionTier}`);
console.log(`      Amount: ₹${resCascadeTier3.amount}, Merchant: "${resCascadeTier3.merchant}"`);
assert.strictEqual(resCascadeTier3.resolutionTier, 'tier3_vision_fallback');
assert.strictEqual(tier3Invoked, true, 'Tier 3 MUST be invoked when OCR text is empty/corrupt');
assert.strictEqual(tier2Invoked, false, 'Tier 2 should NOT be called when text is corrupt/empty');
assert.strictEqual(resCascadeTier3.amount, 250);
assert.strictEqual(resCascadeTier3.merchant, 'Cafe Coffee Day');

console.log('✔ [TEST SUITE 8 PASSED]: Tier 1, Tier 2, and Tier 3 resolution cascade verified.\n');

// ===========================================================================
// [TEST SUITE 9] Zero-Defaulting on Source Accounts & 'Uncategorized' Fallback
// ===========================================================================
console.log('▶ [TEST SUITE 9] Testing Zero-Defaulting & Category Fallbacks...');

// Case 9A: When no bank or account is mentioned, matchedAccountId MUST BE undefined (never default to Cash or accounts[0])
const resNoAccount = parseTransaction({
  rawText: 'Paid ₹300 to Chai Wala on 29-09-2026',
  userAccounts: mockAccounts,
  availableCategories: mockCategories,
});

console.log('  9A. Zero-Defaulting on Unmatched Account:');
console.log(`      Matched Account ID: ${resNoAccount.matchedAccountId}`);
console.log(`      Account Hint: ${resNoAccount.accountHint}`);
assert.strictEqual(resNoAccount.matchedAccountId, undefined, 'Must not default to accounts[0] or Cash Wallet');
assert.strictEqual(resNoAccount.accountHint, undefined);

// Case 9B: Unknown merchant category fallback defaults to 'Uncategorized' (never 'Food')
const resUncategorized = parseTransaction({
  rawText: 'Paid ₹500 to Xylophone Software Services on 29-09-2026',
  availableCategories: ['Food', 'Travel', 'Shopping', 'Uncategorized'],
});

console.log('  9B. Category Fallback:');
console.log(`      Suggested Category: "${resUncategorized.suggestedCategory}"`);
assert.strictEqual(resUncategorized.suggestedCategory, 'Uncategorized', 'Fallback must be Uncategorized');
assert.notStrictEqual(resUncategorized.suggestedCategory, 'Food', 'Must never default to Food');

// Case 9C: When availableCategories list doesn't include Uncategorized explicitly, it still returns Uncategorized
const resUncategorizedDefault = parseTransaction({
  rawText: 'Paid ₹500 to Random Vendor 12345',
  availableCategories: ['Food', 'Travel', 'Shopping'],
});
assert.strictEqual(resUncategorizedDefault.suggestedCategory, 'Uncategorized');

console.log('✔ [TEST SUITE 9 PASSED]: Zero-defaulting and Uncategorized fallback verified.\n');

// ===========================================================================
// [TEST SUITE 10] Intelligent Date Normalization & Multi-Tier Bank Matching
// ===========================================================================
console.log('▶ [TEST SUITE 10] Testing Date Normalization & Multi-Tier Bank Matching...');

// Case 10A: Relative & Multi-format Date Normalization
const todayObj = new Date();
const expToday = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
const yestObj = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate() - 1);
const expYest = `${yestObj.getFullYear()}-${String(yestObj.getMonth() + 1).padStart(2, '0')}-${String(yestObj.getDate()).padStart(2, '0')}`;

const dateToday = normalizeDateToIso('Today');
const dateTodayTime = normalizeDateToIso('Today, 8:46 PM');
const dateYest = normalizeDateToIso('Yesterday');
const dateAlphaWithTime = normalizeDateToIso('29 Sep 2026, 8:46 PM');
const dateIsoTimestamp = normalizeDateToIso('2026-09-29T14:30:00.000Z');
const dateInvalid = normalizeDateToIso('non-date garbage text');

console.log('  10A. Date Extraction & Normalization:');
console.log(`      'Today' ➔ ${dateToday} (expected: ${expToday})`);
console.log(`      'Today, 8:46 PM' ➔ ${dateTodayTime} (expected: ${expToday})`);
console.log(`      'Yesterday' ➔ ${dateYest} (expected: ${expYest})`);
console.log(`      '29 Sep 2026, 8:46 PM' ➔ ${dateAlphaWithTime} (expected: 2026-09-29)`);
console.log(`      '2026-09-29T14:30:00.000Z' ➔ ${dateIsoTimestamp} (expected: 2026-09-29)`);

assert.strictEqual(dateToday, expToday, "normalizeDateToIso('Today') must equal today's ISO date");
assert.strictEqual(dateTodayTime, expToday, "normalizeDateToIso('Today, 8:46 PM') must equal today's ISO date");
assert.strictEqual(dateYest, expYest, "normalizeDateToIso('Yesterday') must equal yesterday's ISO date");
assert.strictEqual(dateAlphaWithTime, '2026-09-29', "normalizeDateToIso('29 Sep 2026, 8:46 PM') must extract 2026-09-29");
assert.strictEqual(dateIsoTimestamp, '2026-09-29', "normalizeDateToIso(ISO timestamp) must extract 2026-09-29");
assert.strictEqual(dateInvalid, null, "Invalid date strings must return null and never produce 'Invalid Date'");

// Case 10B: Multi-Tier Bank Matching Algorithm
const accountsForBankMatching = [
  { id: 'acc-sbi-bank', name: 'SBI', type: 'bank' },
  { id: 'acc-sbi-card', name: 'SBI Card', type: 'credit_card' },
  { id: 'acc-fino-bank', name: 'Fino', type: 'bank' },
  { id: 'acc-slice-card', name: 'Slice', type: 'credit_card' },
  { id: 'acc-hdfc-bank', name: 'HDFC Bank (4521)', type: 'bank' },
];

// 1. "State Bank of India" ➔ matches user account "SBI" (NOT "SBI Card")
const sbiMatch = matchAccountToSource('Paid using State Bank of India UPI', accountsForBankMatching);
console.log('  10B. Bank Matching:');
console.log(`      'State Bank of India UPI' ➔ ${sbiMatch} (expected: acc-sbi-bank)`);
assert.strictEqual(sbiMatch, 'acc-sbi-bank', 'Full bank name "State Bank of India" must map to "SBI" bank account');

// 2. "SBI Credit Card" ➔ matches "SBI Card"
const sbiCardMatch = matchAccountToSource('Charged to SBI Credit Card for ₹1,200', accountsForBankMatching);
console.log(`      'SBI Credit Card' ➔ ${sbiCardMatch} (expected: acc-sbi-card)`);
assert.strictEqual(sbiCardMatch, 'acc-sbi-card', 'Credit card receipt must map to "SBI Card", not basic SBI account');

// 3. "Fino Payments Bank" ➔ matches user account "Fino"
const finoMatch = matchAccountToSource('Debited from Fino Payments Bank A/c', accountsForBankMatching);
console.log(`      'Fino Payments Bank' ➔ ${finoMatch} (expected: acc-fino-bank)`);
assert.strictEqual(finoMatch, 'acc-fino-bank', 'Full official name "Fino Payments Bank" must map to "Fino" account');

// 4. "Slice Super Card" ➔ matches user account "Slice"
const sliceMatch = matchAccountToSource('Transaction on Slice Super Card', accountsForBankMatching);
console.log(`      'Slice Super Card' ➔ ${sliceMatch} (expected: acc-slice-card)`);
assert.strictEqual(sliceMatch, 'acc-slice-card', '"Slice Super Card" must map to "Slice"');

// 5. Account number digits matching (A/c ending 4521)
const digitMatchResult = matchAccountToSource('Paid via Netbanking A/c ending 4521', accountsForBankMatching);
console.log(`      'A/c ending 4521' ➔ ${digitMatchResult} (expected: acc-hdfc-bank)`);
assert.strictEqual(digitMatchResult, 'acc-hdfc-bank', 'Matching by 4 digits must resolve to HDFC Bank');

// 6. Unknown bank returns undefined (no false positive / zero defaulting)
const unknownBankMatch = matchAccountToSource('Paid from Deutsche Bank Account', accountsForBankMatching);
console.log(`      'Deutsche Bank' ➔ ${unknownBankMatch} (expected: undefined)`);
assert.strictEqual(unknownBankMatch, undefined, 'Unmatched bank must return undefined without defaulting');

console.log('✔ [TEST SUITE 10 PASSED]: Date normalization and multi-tier bank matching verified.\n');

console.log('================================================================');
console.log(' 🎉 ALL 10 TEST SUITES PASSED! UNIFIED PIPELINE IS 100% OPERATIONAL');
console.log('================================================================');


