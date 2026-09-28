// src/services/smsParser.ts
// Robust offline parser for Indian banking SMS and UPI transaction messages
// Works without requiring any API keys or network connection

import { TransactionType, LearnedMerchantRule } from '../types/database';

export interface ParsedSmsData {
  amount: number | null;
  merchant_or_person: string;
  suggested_category: string;
  suggested_type: TransactionType;
  date_if_present: string | null;
  account_hint?: string;
  matched_account_id?: string;
  raw_reference?: string;
  confidence: 'high' | 'medium' | 'low';
  is_learned?: boolean;
}

// Common Indian merchant and keyword category dictionary
const CATEGORY_KEYWORD_MAP: { keywords: string[]; category: string }[] = [
  {
    category: 'Food',
    keywords: [
      'sweet', 'sweets', 'mithai', 'bakery', 'bake', 'cake', 'cafe', 'coffee',
      'restaurant', 'restro', 'hotel', 'dhaba', 'canteen', 'mess', 'kitchen',
      'food', 'foods', 'eat', 'eats', 'dining', 'dine', 'treat', 'pizza',
      'burger', 'mcdonald', 'kfc', 'domino', 'subway', 'starbucks', 'chai',
      'tea', 'barista', 'haldiram', 'bikanervala', 'zomato', 'swiggy',
    ],
  },
  {
    category: 'Food', // If user doesn't have Groceries, falls back to Food
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

/**
 * Parses Indian date format like "26Sep26", "26-Sep-2026", "26/09/2026", "26-09-26"
 */
function parseSmsDate(text: string): string | null {
  const currentYear = new Date().getFullYear();

  // Pattern 1: 26Sep26 or 26Sep2026 or 26-Sep-26
  const alphaMatch = text.match(/\b(\d{1,2})[-/ ]?([A-Za-z]{3})[-/ ]?(\d{2,4})\b/);
  if (alphaMatch) {
    const day = parseInt(alphaMatch[1], 10);
    const monthStr = alphaMatch[2].toLowerCase();
    let year = parseInt(alphaMatch[3], 10);
    if (year < 100) year += 2000;

    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = monthMap[monthStr];
    if (month && day >= 1 && day <= 31 && year >= 2020 && year <= currentYear + 1) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Pattern 2: 26/09/2026 or 26-09-2026 or 26-09-26
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

  return null;
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
        // If availableCategories is provided, find best match
        if (availableCategories && availableCategories.length > 0) {
          const exact = availableCategories.find(
            (c) => c.toLowerCase() === group.category.toLowerCase()
          );
          if (exact) return exact;

          // Partial match (e.g. "Food" in "Food & Dining")
          const partial = availableCategories.find((c) =>
            c.toLowerCase().includes(group.category.toLowerCase()) ||
            group.category.toLowerCase().includes(c.toLowerCase())
          );
          if (partial) return partial;
        }
        return group.category;
      }
    }
  }

  // Default fallback
  if (availableCategories && availableCategories.includes('Food')) {
    return 'Food';
  }
  return availableCategories?.[0] || 'Other';
}

/**
 * Normalizes and matches a suggested category to existing categories,
 * supporting aliases, fuzzy matching, and detecting new custom categories.
 */
export function normalizeAndMatchCategory(
  suggestedCategory?: string,
  existingCategories: string[] = []
): { category: string; isNew: boolean } {
  if (!suggestedCategory || !suggestedCategory.trim()) {
    return { category: existingCategories[0] || 'Food', isNew: false };
  }
  const clean = suggestedCategory.trim();

  // 1. Exact match (case-insensitive)
  const exact = existingCategories.find((c) => c.toLowerCase() === clean.toLowerCase());
  if (exact) return { category: exact, isNew: false };

  // 2. Common Indian & financial alias mapping
  const ALIAS_MAP: Record<string, string> = {
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

  const lower = clean.toLowerCase();
  if (ALIAS_MAP[lower]) {
    const target = ALIAS_MAP[lower];
    const match = existingCategories.find((c) => c.toLowerCase() === target.toLowerCase());
    if (match) return { category: match, isNew: false };
  }

  // 3. Substring match
  const sub = existingCategories.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
  );
  if (sub) return { category: sub, isNew: false };

  // 4. If clean is a valid non-empty name and not generic "Other" / "Unknown", it is a new custom category
  if (clean !== 'Unknown' && clean !== 'Other' && clean !== 'Miscellaneous') {
    return { category: clean, isNew: true };
  }

  return { category: existingCategories[0] || 'Food', isNew: false };
}

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
  str = str.replace(/\/(?:okhdfcbank|oksbi|okaxis|okicici|ybl|paytm|apl|axl|ibl|sbi|hdfc|icici|axis)\b/gi, ' ');

  // 3. Remove reference / RRN / transaction number indicators with following digits
  str = str.replace(/\b(?:ref\s*(?:no\.?)?|rrn|txn\s*(?:id|no\.?)?|upi\s*ref|crn)\s*[:#-]?\s*\d+\b/gi, ' ');

  // 4. Remove common prefixes / routing protocol headers
  str = str.replace(/\b(?:upi|vpa|p2m|p2a|pos|ecom|imps|neft|rtgs)\b\s*[/:-]?/gi, ' ');

  // 5. Remove transaction direction prefixes
  str = str.replace(/\b(?:paid\s+to|trf\s+to|transfer\s+to|sent\s+to|debited\s+for|spent\s+at|payment\s+to|info\s*:?|towards)\b/gi, ' ');

  // 6. Remove standalone long digit runs (reference numbers, account numbers, timestamps, e.g. 4239817, 374282012696)
  str = str.replace(/\b\d{3,}\b/g, ' ');

  // 7. Remove corporate & retail noise suffixes
  str = str.replace(/\b(?:pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|commerce\s+private|retail\s+private|technology|technologies|services|enterprises|india)\b/gi, ' ');

  // 8. Remove common trailing noise words like "and", "or", "for", "on", "dated"
  str = str.replace(/\b(?:and|refno|ref|call|if\s+not\s+u)\b/gi, ' ');

  // 9. Replace punctuation and delimiters with spaces
  str = str.replace(/[/\\_.:,;*#\-+~|!?()[\]{}'"`]/g, ' ');

  // 10. Collapse multiple whitespaces and lowercase
  str = str.replace(/\s+/g, ' ').trim().toLowerCase();

  return str;
}

/**
 * Extracts payee or merchant name from transaction text
 */
export function extractMerchant(text: string): string {
  // Pattern 0: UPI/<ref>/<Merchant>/<vpa> or Info: UPI/<ref>/<Merchant>/...
  const upiSlashMatch = text.match(/(?:UPI|Info|Txn)[:\s/]+(?:\w+\/)?(?:\d+\/)?([A-Za-z\s&.\-_]+?)(?:\/[A-Za-z0-9@.\-_]+|$)/i);
  if (upiSlashMatch && upiSlashMatch[1] && upiSlashMatch[1].trim().length > 1) {
    const candidate = cleanMerchantName(upiSlashMatch[1]);
    if (candidate && candidate !== 'Unknown' && !/^\d+$/.test(candidate)) {
      return candidate;
    }
  }

  // Pattern 1: trf to <Merchant> and Refno / at / on
  const trfMatch = text.match(/trf\s+to\s+([^,\.\n]+?)(?:\s+(?:and\s+Refno|ref|on\s+date|at|avl|upi|if\s+not)\b|[,\.\n]|$)/i);
  if (trfMatch && trfMatch[1].trim()) {
    return cleanMerchantName(trfMatch[1]);
  }

  // Pattern 2: paid to <Merchant> / sent to <Merchant> / to <Merchant>
  const paidMatch = text.match(/(?:paid|sent|transferred|transfer)\s+to\s+([^,\.\n]+?)(?:\s+(?:on|via|ref|refno|using|from|avl|upi|if\s+not)\b|[,\.\n]|$)/i);
  if (paidMatch && paidMatch[1].trim()) {
    return cleanMerchantName(paidMatch[1]);
  }

  // Pattern 3: at <Merchant> on / using
  const atMatch = text.match(/\bat\s+([^,\.\n]+?)(?:\s+(?:on|via|ref|refno|using|avl|if\s+not)\b|[,\.\n]|$)/i);
  if (atMatch && atMatch[1].trim()) {
    const candidate = atMatch[1].trim();
    // Exclude times like "at 12:30 PM"
    if (!/^\d{1,2}[:.]\d{2}/.test(candidate)) {
      return cleanMerchantName(candidate);
    }
  }

  // Pattern 4: VPA <vpa> or VPA: <vpa>
  const vpaMatch = text.match(/VPA\s*[:]?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/i);
  if (vpaMatch && vpaMatch[1].trim()) {
    return vpaMatch[1].trim();
  }

  return 'Unknown';
}

function cleanMerchantName(name: string): string {
  return name
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(?:and\s+Refno|Ref\s+no|Refno|Ref|UPI|RRn|Txn)\b.*$/i, '')
    .trim();
}

/**
 * Main offline banking SMS / text parser
 */
export function parseBankingSms(
  rawText: string,
  userAccounts?: { id: string; name: string; type: string }[],
  availableCategories?: string[],
  learnedRules?: LearnedMerchantRule[]
): ParsedSmsData {
  const text = rawText.trim();

  // 1. Transaction Type: Debited (Expense) vs Credited (Income)
  let suggested_type: TransactionType = 'expense';
  if (/\b(?:credited|deposited|received|refund|cashback|added)\b/i.test(text)) {
    suggested_type = 'income';
  } else if (/\b(?:debited|spent|paid|withdrawn|deducted|sent|purchase)\b/i.test(text)) {
    suggested_type = 'expense';
  }

  // 2. Amount Extraction
  let amount: number | null = null;
  const amountPatterns = [
    /(?:debited|credited|spent|paid|transferred|received|deposit|withdrawn)\s+by\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+(?:debited|credited|spent|paid|transferred|withdrawn)/i,
    /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:amount|amt)[:\s]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\b([0-9,]+(?:\.[0-9]{2}))\b/,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleanVal = match[1].replace(/,/g, '');
      const parsedVal = parseFloat(cleanVal);
      if (!isNaN(parsedVal) && parsedVal > 0) {
        amount = parsedVal;
        break;
      }
    }
  }

  // 3. Merchant / Payee Extraction
  const merchant_or_person = extractMerchant(text);
  const normalizedMerchant = normalizeMerchantName(merchant_or_person);

  // 4. Date Extraction
  const date_if_present = parseSmsDate(text);

  // 5. Account Hint & Auto-matching
  let account_hint: string | undefined;
  let matched_account_id: string | undefined;

  const acctMatch = text.match(/\b(?:A\/[cC]|Acct|Account|Card)\s*(?:no\.?)?\s*([X\*]*\d{3,4})\b/i);
  const bankMatch = text.match(/\b(SBI|HDFC|ICICI|Axis|Kotak|PNB|BOB|Canara|IndusInd|Yes\s*Bank|Paytm\s*Bank)\b/i);

  if (acctMatch && acctMatch[1]) {
    account_hint = acctMatch[1];
  } else if (bankMatch && bankMatch[1]) {
    account_hint = bankMatch[1];
  }

  if (userAccounts && userAccounts.length > 0) {
    if (account_hint) {
      const cleanDigits = account_hint.replace(/\D/g, '');
      const cleanHintUpper = account_hint.toUpperCase();

      const found = userAccounts.find((acc) => {
        const accNameUpper = acc.name.toUpperCase();
        if (cleanDigits && acc.name.includes(cleanDigits)) return true;
        if (accNameUpper.includes(cleanHintUpper)) return true;
        return false;
      });

      if (found) {
        matched_account_id = found.id;
      }
    }

    if (!matched_account_id && bankMatch) {
      const bankUpper = bankMatch[1].toUpperCase();
      const foundBank = userAccounts.find((acc) =>
        acc.name.toUpperCase().includes(bankUpper)
      );
      if (foundBank) {
        matched_account_id = foundBank.id;
      }
    }
  }

  // 6. Category Inference & Confidence:
  // Step 6a: Check Learned Rules FIRST with EXACT MATCH ONLY
  // (Prevents "Gopal Medical" from matching "Gopal Sweet")
  let suggested_category: string;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let is_learned = false;

  const exactRule =
    normalizedMerchant && learnedRules && learnedRules.length > 0
      ? learnedRules.find((r) => r.merchant_name === normalizedMerchant)
      : null;

  if (exactRule) {
    suggested_category = exactRule.category;
    if (exactRule.transaction_type) {
      suggested_type = exactRule.transaction_type;
    }
    confidence = 'high';
    is_learned = true;
  } else {
    // Step 6b: Fall back to seed keyword map
    suggested_category = inferCategoryFromText(
      `${merchant_or_person} ${text}`,
      availableCategories
    );

    if (merchant_or_person !== 'Unknown' && amount !== null) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }

  return {
    amount,
    merchant_or_person,
    suggested_category,
    suggested_type,
    date_if_present,
    account_hint,
    matched_account_id,
    confidence,
    is_learned,
  };
}
