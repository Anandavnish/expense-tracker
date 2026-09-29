// src/services/transactionParser.ts
// Unified Extraction & Classification Pipeline for Indian Banking/UPI SMS and Screenshots (GPay, PhonePe, Paytm)
// Runs 100% deterministic local extraction and rule-based classification first before any AI escalation.

import { TransactionType, LearnedMerchantRule } from '../types/database';
export { redactSensitiveFields } from './dataSanitizer';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrToken {
  text: string;
  boundingBox?: OcrBoundingBox;
}

export interface OcrBlockInput {
  text: string;
  boundingBox?: OcrBoundingBox;
  lines?: {
    text: string;
    boundingBox?: OcrBoundingBox;
    elements?: {
      text: string;
      boundingBox?: OcrBoundingBox;
    }[];
  }[];
}

export interface TransactionParserInput {
  rawText: string;
  ocrBlocks?: OcrBlockInput[];
  userAccounts?: { id: string; name: string; type: string }[];
  availableCategories?: string[];
  learnedRules?: LearnedMerchantRule[];
}

export type ResolutionTier = 'tier1_local' | 'tier2_gemini_spatial' | 'tier3_vision_fallback';

export interface ParsedTransactionResult {
  amount: number | null;
  amountConfidence: ConfidenceLevel;
  amountExtractionMethod: 'currency_regex' | 'prominence_heuristic' | 'contextual_verb' | 'none';
  upiRef: string | null;
  date: string | null;
  merchant: string;
  normalizedMerchant: string;
  merchantConfidence: ConfidenceLevel;
  suggestedCategory: string;
  suggestedType: TransactionType;
  isCategoryLearned: boolean;
  classificationSource: 'user_rule' | 'gemini_rule' | 'seed_keyword' | 'unrecognized';
  accountHint?: string;
  matchedAccountId?: string;
  detectedBankOrSource?: string | null;
  rawText: string;
  needsGeminiAmount: boolean;
  needsGeminiMerchant: boolean;
  resolutionTier: ResolutionTier;
}

// ---------------------------------------------------------------------------
// 1. Seed Keyword Dictionaries (Offline Ground Truth for Indian Ecosystem)
// ---------------------------------------------------------------------------

export const CATEGORY_KEYWORD_MAP: { keywords: string[]; category: string }[] = [
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
    category: 'Food', // Groceries fallback to Food if user lacks Groceries category
    keywords: [
      'blinkit', 'zepto', 'instamart', 'bigbasket', 'bb daily', 'dunzo',
      'grocery', 'groceries', 'supermarket', 'hypermarket', 'kirana', 'mart',
      'retail', 'dmart', 'reliance fresh', 'nature basket', 'spencer',
      'more retail', 'milk', 'dairy', 'mother dairy', 'amul',
    ],
  },
  {
    category: 'Travel',
    keywords: [
      'uber', 'ola', 'rapido', 'metro', 'dmrc', 'bmrc', 'mmrcl', 'irctc', 'rail',
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
      'igl', 'mgl',
    ],
  },
  {
    category: 'Recharge/Data',
    keywords: [
      'recharge', 'prepaid', 'postpaid', 'jio', 'airtel', 'vi', 'vodafone',
      'idea', 'bsnl', 'broadband', 'wifi', 'act fibernet', 'hathway',
      'dth', 'tata play', 'dish tv', 'airtel digital', 'sun direct',
    ],
  },
  {
    category: 'Subscriptions',
    keywords: [
      'netflix', 'spotify', 'prime', 'amazon prime', 'hotstar', 'disney',
      'youtube', 'apple', 'itunes', 'google play', 'sonyliv', 'zee5',
      'audible', 'chatgpt', 'openai', 'github', 'notion', 'canva',
      'medium', 'substack', 'linkedin',
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
      'ticket', 'concert', 'gaming', 'steam', 'playstation', 'events', 'paytm insider',
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

// Common Indian & financial alias mapping for normalizing categories
export const CATEGORY_ALIAS_MAP: Record<string, string> = {
  'food & dining': 'Food',
  'dining': 'Food',
  'restaurant': 'Food',
  'cafe': 'Food',
  'bakery': 'Food',
  'sweets': 'Food',
  'groceries': 'Food',
  'grocery': 'Food',
  'transport': 'Travel',
  'transportation': 'Travel',
  'travel': 'Travel',
  'fuel': 'Travel',
  'rent & utilities': 'Hostel/Rent',
  'utilities': 'Hostel/Rent',
  'rent': 'Hostel/Rent',
  'hostel': 'Hostel/Rent',
  'recharge': 'Recharge/Data',
  'mobile recharge': 'Recharge/Data',
  'data': 'Recharge/Data',
  'stationery': 'Books/Stationery',
  'education': 'Books/Stationery',
  'books': 'Books/Stationery',
  'tuition': 'Books/Stationery',
  'movies': 'Entertainment',
  'cinema': 'Entertainment',
  'movie': 'Entertainment',
  'shopping': 'Shopping',
  'subscriptions': 'Subscriptions',
  'subscription': 'Subscriptions',
  'health': 'Other',
  'medical': 'Other',
  'personal care': 'Other',
  'miscellaneous': 'Other',
};

// ---------------------------------------------------------------------------
// 2. Normalization & Category Matching
// ---------------------------------------------------------------------------

/**
 * Normalizes Indian banking & UPI merchant strings into a canonical merchant key.
 * Strips VPA handles, reference IDs, digit runs, payment direction keywords, corporate suffixes,
 * and punctuation, returning a clean, lowercased name.
 */
export function normalizeMerchantName(raw: string): string {
  if (!raw) return '';

  let str = raw.trim();

  // 1. Remove full VPA handles like gopal@oksbi, merchant.123@okhdfcbank, @oksbi, @ybl, etc.
  str = str.replace(/\b[a-zA-Z0-9._]+@\w+\b/gi, ' ');
  str = str.replace(/@\w+/gi, ' ');

  // 2. Remove common UPI / banking routing codes like /okhdfcbank, /sbi, /ybl at end of tokens
  str = str.replace(
    /\/(?:okhdfcbank|oksbi|okaxis|okicici|ybl|paytm|apl|axl|ibl|sbi|hdfc|icici|axis)\b/gi,
    ' '
  );

  // 3. Remove reference / RRN / transaction number indicators with following digits
  str = str.replace(
    /\b(?:ref\s*(?:no\.?)?|rrn|txn\s*(?:id|no\.?)?|upi\s*ref|crn)\s*[:#-]?\s*\d+\b/gi,
    ' '
  );

  // 4. Remove common prefixes / routing protocol headers
  str = str.replace(/\b(?:upi|vpa|p2m|p2a|pos|ecom|imps|neft|rtgs)\b\s*[/:-]?/gi, ' ');

  // 5. Remove transaction direction prefixes
  str = str.replace(
    /\b(?:paid\s+to|payment\s+to|money\s+sent\s+to|trf\s+to|transfer\s+to|sent\s+to|debited\s+for|spent\s+at|info\s*:?|towards)\b/gi,
    ' '
  );

  // 6. Remove standalone long digit runs (reference numbers, account numbers, timestamps, e.g. 4239817, 374282012696)
  str = str.replace(/\b\d{3,}\b/g, ' ');

  // 7. Remove corporate & retail noise suffixes
  str = str.replace(
    /\b(?:pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|commerce\s+private|retail\s+private|technology|technologies|services|enterprises|india)\b/gi,
    ' '
  );

  // 8. Remove common trailing noise words like "and", "or", "for", "on", "dated"
  str = str.replace(/\b(?:and|refno|ref|call|if\s+not\s+u)\b/gi, ' ');

  // 9. Replace punctuation and delimiters with spaces
  str = str.replace(/[/\\_.:,;*#\-+~|!?()[\]{}'"`]/g, ' ');

  // 10. Collapse multiple whitespaces and lowercase
  str = str.replace(/\s+/g, ' ').trim().toLowerCase();

  return str;
}

/**
 * Infers category from merchant name or SMS text
 */
export function inferCategoryFromText(
  text: string,
  availableCategories?: string[]
): string {
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
    return availableCategories.find((c) => c.toLowerCase() === 'uncategorized')!;
  }
  return 'Uncategorized';
}

/**
 * Normalizes and matches a suggested category to existing categories,
 * supporting aliases, fuzzy matching, and detecting new custom categories.
 */
export function normalizeAndMatchCategory(
  suggestedCategory?: string,
  existingCategories: string[] = []
): { category: string; isNew: boolean } {
  const fallbackCat =
    existingCategories.find((c) => c.toLowerCase() === 'uncategorized') || 'Uncategorized';

  if (!suggestedCategory || !suggestedCategory.trim()) {
    return { category: fallbackCat, isNew: false };
  }
  const clean = suggestedCategory.trim();

  // 1. Exact match (case-insensitive)
  const exact = existingCategories.find((c) => c.toLowerCase() === clean.toLowerCase());
  if (exact) return { category: exact, isNew: false };

  // 2. Common Indian & financial alias mapping
  const lower = clean.toLowerCase();
  if (CATEGORY_ALIAS_MAP[lower]) {
    const target = CATEGORY_ALIAS_MAP[lower];
    const match = existingCategories.find((c) => c.toLowerCase() === target.toLowerCase());
    if (match) return { category: match, isNew: false };
  }

  // 3. Substring match
  const sub = existingCategories.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
  );
  if (sub) return { category: sub, isNew: false };

  // 4. Valid custom category detection
  if (clean !== 'Unknown' && clean !== 'Other' && clean !== 'Miscellaneous') {
    return { category: clean, isNew: true };
  }

  return { category: fallbackCat, isNew: false };
}

// ---------------------------------------------------------------------------
// 3. Deterministic Extraction Engine
// ---------------------------------------------------------------------------

/**
 * Extracts 12-digit continuous UPI Ref / UTR / RRN string
 */
export function extractUpiReference(text: string): string | null {
  if (!text) return null;

  // 1. Keyword-anchored 12-digit extraction (highest precision)
  const labeledMatch = text.match(
    /(?:UPI\s*(?:Ref(?:erence)?|Txn|Transaction)?\s*(?:ID|No\.?)?|UTR|RRN|Ref\s*No\.?)\s*[:#-]?\s*(\d{12})\b/i
  );
  if (labeledMatch && labeledMatch[1]) {
    return labeledMatch[1];
  }

  // 2. Standalone 12-digit continuous numeric token
  const all12 = text.match(/\b\d{12}\b/g);
  if (all12 && all12.length > 0) {
    // If multiple, pick the first one not immediately preceded by A/c or phone indicators
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

/**
  * Parses date string in various Indian banking & receipt formats:
 * - 29 Sep 2026, 29-Sep-2026, 29Sep26, Sep 29, 2026, 29 September 2026
 * - 29/09/2026, 29-09-2026, 29-09-26, 2026-09-29
 * - Today, Today at 8:46 PM, Yesterday
 */
export function extractTransactionDate(text: string): string | null {
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

  const monthMap: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  // Pattern 1: "Sep 29, 2026" or "September 29, 2026"
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

  // Pattern 2: "29 Sep 2026" or "29-Sep-2026" or "29Sep26" or "29 September 2026"
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

  // Pattern 3: "29/09/2026" or "29-09-2026" or "29-09-26"
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

  // Pattern 4: "2026-09-29" (ISO format)
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

/**
 * Normalizes any arbitrary date string into strict YYYY-MM-DD format.
 * Gracefully handles ISO timestamps, relative strings ("Today"), and locale formats.
 */
export function normalizeDateToIso(rawDate: string | null | undefined): string | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // 1. Strict YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. ISO timestamp with T (e.g., "2026-09-29T14:30:00.000Z")
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) {
    return isoPrefix[1];
  }

  // 3. Relative or explicit date extraction
  const fromExtractor = extractTransactionDate(trimmed);
  if (fromExtractor) {
    return fromExtractor;
  }

  // 4. Fallback to JavaScript Date.parse
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

/**
 * Extracts merchant/payee name from OCR screenshot text or SMS
 */
export function extractMerchant(text: string): string {
  if (!text) return 'Unknown';

  // Pattern 0: Specific screenshot headers "Paid to <Merchant>" / "Payment to <Merchant>" / "Money Sent to <Merchant>"
  const appPaidMatch = text.match(
    /(?:Paid\s+to|Payment\s+to|Money\s+Sent\s+to|Money\s+Transferred\s+to)\s*[:]?\s*\n*([A-Za-z0-9\s&.\-_]+?)(?:\n|(?:\s+(?:on|via|ref|refno|using|from|avl|upi|completed|successful|at)\b)|[,\.]|$)/i
  );
  if (appPaidMatch && appPaidMatch[1] && appPaidMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(appPaidMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  // Pattern 1: "To: <Merchant>" or "To\n<Merchant>"
  const toMatch = text.match(/\b(?:To|Payee)\s*[:]?\s*\n*([A-Za-z0-9\s&.\-_]+?)(?:\n|(?:\s+(?:on|via|ref|refno|using|from)\b)|[,\.]|$)/i);
  if (toMatch && toMatch[1] && toMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(toMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  // Pattern 2: UPI/<ref>/<Merchant>/<vpa> or Info: UPI/<ref>/<Merchant>/...
  const upiSlashMatch = text.match(
    /(?:UPI|Info|Txn)[:\s/]+(?:\w+\/)?(?:\d+\/)?([A-Za-z\s&.\-_]+?)(?:\/[A-Za-z0-9@.\-_]+|$)/i
  );
  if (upiSlashMatch && upiSlashMatch[1] && upiSlashMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(upiSlashMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  // Pattern 3: trf to <Merchant> and Refno / at / on
  const trfMatch = text.match(
    /trf\s+to\s+([^,\.\n]+?)(?:\s+(?:and\s+Refno|ref|on\s+date|at|avl|upi|if\s+not)\b|[,\.\n]|$)/i
  );
  if (trfMatch && trfMatch[1] && trfMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(trfMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  // Pattern 4: towards <Merchant>
  const towardsMatch = text.match(
    /towards\s+([^,\.\n]+?)(?:\s+(?:on|via|ref|refno|using|from|avl|upi|if\s+not)\b|[,\.\n]|$)/i
  );
  if (towardsMatch && towardsMatch[1] && towardsMatch[1].trim().length > 1) {
    const candidate = cleanMerchantCandidate(towardsMatch[1]);
    if (isValidMerchantCandidate(candidate)) {
      return candidate;
    }
  }

  // Pattern 5: at <Merchant> on / using
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

  // Pattern 6: VPA handle
  const vpaMatch = text.match(/VPA\s*[:]?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/i);
  if (vpaMatch && vpaMatch[1].trim()) {
    return vpaMatch[1].trim();
  }

  return 'Unknown';
}

function cleanMerchantCandidate(name: string): string {
  return name
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:and\s+Refno|Ref\s+no|Refno|Ref|UPI|RRn|Txn|UTR|Date|Time)\b.*$/i, '')
    .trim();
}

function isValidMerchantCandidate(name: string): boolean {
  if (!name || name === 'Unknown' || name.length <= 1) return false;
  // Disqualify if all numbers or common false-positive words
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

// ---------------------------------------------------------------------------
// 4. Amount Extraction with Prominence Fallback Heuristic
// ---------------------------------------------------------------------------

export interface AmountCandidate {
  val: number;
  rawStr: string;
  source: 'currency_regex' | 'prominence_heuristic' | 'contextual_verb';
  confidence: ConfidenceLevel;
  score: number;
}

/**
 * Extracts transaction amount from text and/or OCR blocks.
 *
 * Runs deterministic regex for currency-prefixed numbers (₹, Rs, INR) first.
 * If missing or ambiguous, evaluates the most prominent numeric token from OCR blocks
 * (using font height / bounding box area and layout heuristics across GPay/PhonePe/Paytm).
 *
 * Returns amount, confidence ('high' | 'medium' | 'low'), and extraction method.
 */
export function extractAmountWithProminence(
  text: string,
  ocrBlocks?: OcrBlockInput[]
): {
  amount: number | null;
  confidence: ConfidenceLevel;
  method: 'currency_regex' | 'prominence_heuristic' | 'contextual_verb' | 'none';
} {
  if (!text && (!ocrBlocks || ocrBlocks.length === 0)) {
    return { amount: null, confidence: 'low', method: 'none' };
  }

  const upiRef = extractUpiReference(text);
  const vpaHandles = text.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\b/g) || [];
  // Mask VPA handles so alphanumeric sequences with @ are not parsed as standalone amounts
  const textWithoutVpas = text.replace(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\b/gi, ' ');
  const candidates: AmountCandidate[] = [];

  // Helper to validate whether a numeric float is a plausible payment amount
  const isPlausibleAmount = (n: number, raw: string): boolean => {
    if (isNaN(n) || n <= 0 || n > 10000000) return false;
    // Exclude 12-digit UPI reference
    if (raw.replace(/\D/g, '').length === 12 || (upiRef && raw.includes(upiRef))) {
      return false;
    }
    // Exclude numbers contained in or adjacent to VPA / UPI ID handles (e.g. user9876543210@upi, merchant123@okhdfcbank)
    const cleanRaw = raw.replace(/[,\s]/g, '');
    for (const vpa of vpaHandles) {
      if (vpa.includes(cleanRaw)) {
        return false;
      }
    }
    // Exclude 10-digit phone numbers
    if (raw.replace(/\D/g, '').length === 10 && /^[6-9]/.test(raw.trim())) {
      return false;
    }
    // Exclude years (2020-2030) if formatted as bare integer
    if (!raw.includes('.') && n >= 2020 && n <= 2030) {
      return false;
    }
    return true;
  };

  // -------------------------------------------------------------------------
  // Step 1: Explicit Currency Symbol Regex (₹, Rs, INR) — Highest Confidence
  // -------------------------------------------------------------------------
  const currencyPrefixRegexes = [
    // ₹ 450.00 or Rs. 1,240 or INR 500
    /(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi,
    // 450.00 ₹ or 1,240 Rs
    /\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:₹|Rs\.?|INR)\b/gi,
  ];

  for (const regex of currencyPrefixRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textWithoutVpas)) !== null) {
      const rawNum = match[1];
      const parsed = parseFloat(rawNum.replace(/,/g, ''));
      if (isPlausibleAmount(parsed, rawNum)) {
        // High confidence for explicit currency-prefixed amount
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

  // Contextual verbs: "debited by Rs 450", "paid 450.00", "total: 500"
  const verbRegex =
    /(?:debited|credited|spent|paid|transferred|sent|received|withdrawn|deposit(?:ed)?|amount|amt|total)\s+(?:by|of|for|is)?\s*[:=]?\s*(?:₹|Rs\.?|INR)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

  let verbMatch: RegExpExecArray | null;
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

  // If we found clear currency or verb matches:
  if (candidates.length > 0) {
    // If all top candidates agree on the same amount:
    const distinctVals = Array.from(new Set(candidates.map((c) => c.val)));
    if (distinctVals.length === 1) {
      return {
        amount: distinctVals[0],
        confidence: 'high',
        method: candidates[0].source,
      };
    }

    // If multiple candidates exist, sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // If highest score is significantly greater than others, pick it
    if (candidates[0].score > candidates[1].score + 15) {
      return {
        amount: candidates[0].val,
        confidence: 'high',
        method: candidates[0].source,
      };
    }

    // Multiple ambiguous currency amounts (e.g. subtotal vs total or conflicting numbers)
    return {
      amount: candidates[0].val,
      confidence: 'medium',
      method: candidates[0].source,
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Fallback Heuristic: OCR Prominence (Largest / Prominent Font Block)
  // -------------------------------------------------------------------------
  // Across GPay, PhonePe, and Paytm screenshots, the transaction amount is
  // always rendered with the largest font size / prominence in the card.
  if (ocrBlocks && ocrBlocks.length > 0) {
    const blockCandidates: AmountCandidate[] = [];

    for (const block of ocrBlocks) {
      // Inspect elements or lines
      const elementsToScan: { text: string; box?: OcrBoundingBox }[] = [];

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
        // Look for clean numeric token or currency-stripped token
        const cleanMatch = itemText.match(
          /^[₹RsINR\s]*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)[₹RsINR\s]*$/i
        );

        if (cleanMatch) {
          const rawNum = cleanMatch[1];
          const parsed = parseFloat(rawNum.replace(/,/g, ''));

          if (isPlausibleAmount(parsed, rawNum)) {
            // Visual prominence score based on bounding box
            const box = item.box || block.boundingBox;
            let prominenceScore = 20;

            if (box) {
              // Font height is the direct proxy for font size!
              const height = box.height || 0;
              const area = (box.width || 0) * height;
              prominenceScore = height * 2 + Math.sqrt(area);
            }

            // Bonus for standard decimal monetary format (e.g. 450.00)
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

      // Check if top candidate is distinct and prominent
      const competitors = blockCandidates.filter(
        (c) => c.val !== top.val && c.score >= top.score * 0.75
      );

      if (competitors.length === 0) {
        // Clear prominent winner!
        return {
          amount: top.val,
          confidence: 'medium',
          method: 'prominence_heuristic',
        };
      }

      // Ambiguous multiple large numbers of similar visual prominence
      return {
        amount: top.val,
        confidence: 'low',
        method: 'prominence_heuristic',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Text-Only Standalone Numeric Heuristic (if no OCR blocks provided)
  // -------------------------------------------------------------------------
  // 3A: Standalone decimal amounts (e.g. 420.00)
  const standaloneDecimals = textWithoutVpas.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/g);
  if (standaloneDecimals && standaloneDecimals.length > 0) {
    const validDecimals: number[] = [];
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
      // Multiple candidates without currency or prominence -> low confidence
      return {
        amount: uniqueDecimals[0],
        confidence: 'low',
        method: 'prominence_heuristic',
      };
    }
  }

  // 3B: Standalone integers (e.g. 350, 1500)
  const allNumbers = textWithoutVpas.match(/\b([1-9][0-9]{1,6})\b/g);
  if (allNumbers && allNumbers.length > 0) {
    const validIntegers: number[] = [];
    const txDate = extractTransactionDate(text);

    for (const numStr of allNumbers) {
      const parsed = parseInt(numStr, 10);
      if (isPlausibleAmount(parsed, numStr)) {
        // Disqualify if it matches the transaction date day or year
        if (txDate) {
          const [y, m, d] = txDate.split('-').map(Number);
          if (parsed === y || parsed === d || (parsed === m && numStr.length <= 2)) {
            continue;
          }
        }
        // Disqualify if preceded by account or card indicators
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

  // No amount could be identified with reasonable confidence
  return {
    amount: null,
    confidence: 'low',
    method: 'none',
  };
}

// ---------------------------------------------------------------------------
// 5. Bank Aliases & Multi-Tiered Account Matching Engine
// ---------------------------------------------------------------------------

export const BANK_ALIASES: Record<string, string[]> = {
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

/**
 * Intelligent account matching algorithm:
 * Matches user's registered accounts (e.g. "SBI", "Fino", "SBI Card", "HDFC")
 * against detected bank name, OCR text, or account number digits.
 */
export interface AccountInput {
  id?: string;
  name: string;
  type?: string;
}

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

function matchSingleAccountSource(
  targetText: string,
  userAccounts: AccountInput[]
): string | undefined {
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
  let bestCandidateId: string | undefined;
  let highestScore = 0;

  const detectedIsCard = /\b(?:card|credit)\b/i.test(rawLower);

  for (const acc of userAccounts) {
    const accLower = acc.name.toLowerCase().trim();
    const accountIsCard = acc.type === 'credit_card' || /\b(?:card|credit)\b/i.test(accLower);
    let score = 0;

    // Check alias families
    for (const [canonical, aliases] of Object.entries(BANK_ALIASES)) {
      const detectedMatchesFamily = aliases.some((alias) => rawLower.includes(alias));
      const accountMatchesFamily = aliases.some((alias) => accLower.includes(alias));

      if (detectedMatchesFamily && accountMatchesFamily) {
        score += 100;

        // Card vs Bank differentiation
        if (detectedIsCard === accountIsCard) {
          score += 50;
        } else {
          score -= 30;
        }

        // Specificity boost (e.g., "sbi card" match is more specific than just "sbi")
        if (canonical === 'sbi card' && accountIsCard) {
          score += 20;
        }
      }
    }

    // Direct token overlap scoring for non-generic words (e.g. "fino" in "fino payments bank")
    const accWords = accLower.split(/\s+/).filter((w: string) => w.length > 2 && !GENERIC_ACCOUNT_WORDS.has(w));
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

export function matchAccountToSource(
  detectedTextOrBank: string,
  userAccounts: AccountInput[]
): string | undefined {
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

// ---------------------------------------------------------------------------
// 6. Unified Transaction Parsing Function (Sync & Pure)
// ---------------------------------------------------------------------------

/**
 * Pure deterministic parser combining OCR and SMS extraction and rule classification.
 * Runs 100% locally with 0 API calls and 0 network latency.
 */
export function parseTransaction(input: TransactionParserInput): ParsedTransactionResult {
  const text = (input.rawText || '').trim();
  const learnedRules = input.learnedRules || [];
  const availableCategories = input.availableCategories || [];
  const userAccounts = input.userAccounts || [];

  // 1. Transaction Type (Income vs Expense vs Borrow)
  let suggestedType: TransactionType = 'expense';
  if (
    /(?:received\s+from|money\s+received|\breceived\b|\bcredited\b|\bdeposited\b|\brefund\b|\bcashback\b|\badded\b)/i.test(
      text
    )
  ) {
    suggestedType = 'income';
  } else if (
    /(?:you\s+paid|paid\s+to|payment\s+to|money\s+sent\s+to|sent\s+to|\bdebited\b|\bspent\b|\bpaid\b|\bwithdrawn\b|\bdeducted\b|\bsent\b|\bpurchase\b)/i.test(
      text
    )
  ) {
    suggestedType = 'expense';
  }

  // 2. Amount Extraction (Currency regex first, then OCR prominence heuristic fallback)
  const amountResult = extractAmountWithProminence(text, input.ocrBlocks);
  const amount = amountResult.amount;
  const amountConfidence = amountResult.confidence;

  // 3. UPI Reference / UTR
  const upiRef = extractUpiReference(text);

  // 4. Date Extraction (strictly normalized to ISO YYYY-MM-DD or defaults to today)
  const date = extractTransactionDate(text) || normalizeDateToIso('today');

  // 5. Merchant Extraction & Canonical Normalization
  const merchant = extractMerchant(text);
  const normalizedMerchant = normalizeMerchantName(merchant);

  // 6. Account Matching & Hint using multi-tiered engine
  let accountHint: string | undefined;
  let matchedAccountId: string | undefined;

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

  // 7. Classification: Merchant -> Category & Transaction Type
  let suggestedCategory: string;
  let merchantConfidence: ConfidenceLevel = 'low';
  let isCategoryLearned = false;
  let classificationSource: 'user_rule' | 'gemini_rule' | 'seed_keyword' | 'unrecognized' =
    'unrecognized';

  // STEP 7A: Exact Match in user_merchant_rules FIRST (Prevents "Gopal Medical" matching "Gopal Sweet")
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
    // STEP 7B: Fall back to seed keyword map (Zomato, Swiggy, Uber, Blinkit, etc.)
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
      // Unrecognized merchant
      suggestedCategory = seedCategory;
      merchantConfidence = 'low';
      classificationSource = 'unrecognized';
    }
  }

  // Determine if specific fields need Gemini escalation
  // Amount needs Gemini if confidence is LOW (nothing found or multiple ambiguous candidates)
  const needsGeminiAmount = amountConfidence === 'low' || amount === null;

  // Merchant needs Gemini only if genuinely unrecognized (not in learned rules and not in seed keywords)
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

export interface PipelineOptions {
  imageUri?: string;
  base64?: string;
  mimeType?: string;
  enableGeminiEscalation?: boolean;
  onTeachRule?: (merchant: string, category: string, type: TransactionType) => void;
}

/**
 * Full unified pipeline:
 * 1. Executes deterministic OCR / text extraction and rule classification locally (0ms, 0 AI calls).
 * 2. If OCR produced completely empty/corrupt text, falls back to Tier 3 (Multimodal Vision Fallback).
 * 3. If Tier 1 confidence is high (amount known, recognized merchant, matched account), prefill directly (Tier 1).
 * 4. If Tier 1 confidence is low (needsGeminiAmount, needsGeminiMerchant, or unmatched bank), escalates via
 *    Tier 2: Structured Text + Bounding Box Coordinates (Gemini) — without transmitting raw pixels!
 */
export async function parseTransactionWithPipeline(
  input: TransactionParserInput,
  options?: PipelineOptions
): Promise<ParsedTransactionResult> {
  const rawTextTrimmed = (input.rawText || '').trim();
  const hasBlocks = Boolean(input.ocrBlocks && input.ocrBlocks.length > 0);
  const isCorruptedOrBlank = rawTextTrimmed.length < 15 && !hasBlocks;

  // TIER 3: Multimodal Vision Fallback — Strictly invoked ONLY when Tier 1 returns empty or near-empty text
  if (isCorruptedOrBlank && options?.imageUri && options?.enableGeminiEscalation) {
    try {
      const { parseReceiptWithGemini } = await import('./geminiService');
      const fullVisionRes = await parseReceiptWithGemini({
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

        let matchedAccountId: string | undefined;
        if (input.userAccounts && input.userAccounts.length > 0) {
          matchedAccountId = matchAccountToSource(
            `${vData.merchant_or_person || ''} ${rawTextTrimmed}`,
            input.userAccounts
          );
        }

        const tier3Result: ParsedTransactionResult = {
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

        if (options?.onTeachRule && vData.merchant_or_person && vData.merchant_or_person !== 'Unknown') {
          options.onTeachRule(vData.merchant_or_person, vData.suggested_category, vData.suggested_type);
        }

        console.log('[Boundary 2: transactionParser] Tier 3 Multimodal Vision completed:', {
          resolutionTier: tier3Result.resolutionTier,
          amount: tier3Result.amount,
          merchant: tier3Result.merchant,
          category: tier3Result.suggestedCategory,
          type: tier3Result.suggestedType,
          date: tier3Result.date,
          matchedAccountId: tier3Result.matchedAccountId,
        });

        return tier3Result;
      }
    } catch (e) {
      console.warn('[Boundary 2: transactionParser] Tier 3 full vision fallback failed:', e);
    }
  }

  // TIER 1: Run deterministic on-device parser (0ms, 0 network, 0 API calls)
  const result = parseTransaction(input);
  result.resolutionTier = 'tier1_local';

  // If Gemini escalation is disabled or not requested, return Tier 1 result
  if (!options?.enableGeminiEscalation) {
    console.log('[Boundary 2: transactionParser] Tier 1 deterministic completed (Escalation disabled):', {
      resolutionTier: result.resolutionTier,
      amount: result.amount,
      merchant: result.merchant,
      category: result.suggestedCategory,
      type: result.suggestedType,
      date: result.date,
      matchedAccountId: result.matchedAccountId,
    });
    return result;
  }

  // Tier 1 High Confidence check:
  // - Valid amount found
  // - Known merchant / classification source is not unrecognized
  // - Source account matched (or no user accounts configured)
  const isTier1HighConfidence =
    result.amount !== null &&
    (result.amountConfidence === 'high' || result.amountConfidence === 'medium') &&
    result.merchant !== 'Unknown' &&
    !result.needsGeminiMerchant &&
    (!input.userAccounts?.length || Boolean(result.matchedAccountId));

  if (isTier1HighConfidence) {
    console.log('[Boundary 2: transactionParser] Tier 1 High Confidence match resolved locally (0 API calls):', {
      resolutionTier: result.resolutionTier,
      amount: result.amount,
      merchant: result.merchant,
      category: result.suggestedCategory,
      type: result.suggestedType,
      date: result.date,
      matchedAccountId: result.matchedAccountId,
    });
    return result;
  }

  // TIER 2: Structured Text + Coordinate Escalation via Gemini
  // Triggered when local confidence is low (needsGeminiAmount, needsGeminiMerchant, or unmatched bank/source).
  // Sends structured JSON array of text blocks with spatial coordinates (y-pos, width, height) — NEVER raw pixels!
  try {
    const { escalateWithSpatialHierarchyGemini } = await import('./geminiService');
    const spatialRes = await escalateWithSpatialHierarchyGemini({
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

        if (options?.onTeachRule && result.merchant !== 'Unknown') {
          options.onTeachRule(result.merchant, sData.suggested_category, result.suggestedType);
        }
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
  } catch (err) {
    console.warn('[Boundary 2: transactionParser] Tier 2 spatial escalation failed:', err);
  }

  console.log('[Boundary 2: transactionParser] parseTransactionWithPipeline completed:', {
    resolutionTier: result.resolutionTier,
    amount: result.amount,
    amountConfidence: result.amountConfidence,
    merchant: result.merchant,
    category: result.suggestedCategory,
    type: result.suggestedType,
    date: result.date,
    matchedAccountId: result.matchedAccountId,
    detectedBankOrSource: result.detectedBankOrSource,
  });

  return result;
}

