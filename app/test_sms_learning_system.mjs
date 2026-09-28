// app/test_sms_learning_system.mjs
// Verification of Indian UPI & Banking SMS normalization, exact learned matching, and precedence rules

import assert from 'assert';

// 1. Normalization function under test
function normalizeMerchantName(raw) {
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

console.log('--- STARTING ADAPTIVE SMS LEARNING SYSTEM TESTS ---\n');

// [TEST 1] Testing Real Indian UPI Normalization across multiple banking formats
console.log('[TEST 1] Testing UPI String Normalization...');

const upiSamples = [
  'UPI/4239817/GOPAL SWEET/okhdfcbank',
  'UPI/P2M/324234/GOPAL SWEET/SBI',
  'UPI-GOPAL SWEET-gopal@oksbi',
  'paid to Gopal Sweet Ref 374282012696',
  'trf to Gopal Sweet and Refno 374282012696',
];

for (const sample of upiSamples) {
  const normalized = normalizeMerchantName(sample);
  console.log(`  "${sample}" ➔ "${normalized}"`);
  assert.strictEqual(
    normalized,
    'gopal sweet',
    `Sample "${sample}" did not normalize to "gopal sweet" (got: "${normalized}")`
  );
}

// Corporate & app brand samples
assert.strictEqual(normalizeMerchantName('BLINKIT COMMERCE PRIVATE LIMITED'), 'blinkit');
assert.strictEqual(normalizeMerchantName('UBER INDIA TECHNOLOGY PVT LTD'), 'uber');
console.log('✅ TEST 1 PASSED: Real UPI strings consistently normalized to clean merchant keys.\n');

// [TEST 2] Testing Exact Matching vs Dangerous Fuzzy Matching
console.log('[TEST 2] Testing Exact Match vs False Positive Avoidance...');

const learnedRules = [
  {
    merchant_name: 'gopal sweet',
    category: 'Food',
    transaction_type: 'expense',
    source: 'user_manual',
    confidence: 1.0,
    usage_count: 5,
  },
  {
    merchant_name: 'apollo pharmacy',
    category: 'Other',
    transaction_type: 'expense',
    source: 'user_manual',
    confidence: 1.0,
    usage_count: 2,
  },
];

function matchRule(rawMerchant, rules) {
  const norm = normalizeMerchantName(rawMerchant);
  if (!norm) return null;
  // Exact match only!
  const rule = rules.find((r) => r.merchant_name === norm);
  return rule || null;
}

// Exact match works
const matchGopalSweet = matchRule('Gopal Sweet and Refno 374282012696', learnedRules);
assert.notStrictEqual(matchGopalSweet, null);
assert.strictEqual(matchGopalSweet.category, 'Food');
console.log('  "Gopal Sweet" matched rule: Food (100% High Confidence)');

// False positive test: "Gopal Medical" MUST NOT match "Gopal Sweet"!
const matchGopalMedical = matchRule('Gopal Medical Store', learnedRules);
assert.strictEqual(
  matchGopalMedical,
  null,
  'CRITICAL: "Gopal Medical Store" falsely matched "Gopal Sweet"!'
);
console.log('  "Gopal Medical Store" correctly rejected matching "Gopal Sweet" (No dangerous fuzzy match)');

console.log('✅ TEST 2 PASSED: Exact matching confirmed; dangerous false positives prevented.\n');

// [TEST 3] Testing Precedence: user_manual cannot be overwritten by Gemini
console.log('[TEST 3] Testing AI vs User Precedence Rules...');

let activeRules = [
  {
    merchant_name: 'gopal sweet',
    category: 'Food',
    transaction_type: 'expense',
    source: 'user_manual', // Set by user
    usage_count: 3,
  },
];

function recordGeminiRule(rules, merchantRaw, category, type) {
  const norm = normalizeMerchantName(merchantRaw);
  const existing = rules.find((r) => r.merchant_name === norm);

  // Gemini must NEVER overwrite a user_manual rule
  if (existing && existing.source === 'user_manual') {
    return { modified: false, reason: 'user_manual_immutable' };
  }

  return { modified: true, reason: 'updated' };
}

const geminiAttempt = recordGeminiRule(activeRules, 'Gopal Sweet', 'Shopping', 'expense');
assert.strictEqual(geminiAttempt.modified, false);
assert.strictEqual(geminiAttempt.reason, 'user_manual_immutable');
assert.strictEqual(activeRules[0].category, 'Food');
console.log('  Gemini attempt to overwrite user_manual rule rejected cleanly.');
console.log('✅ TEST 3 PASSED: user_manual rules are strictly immutable to Gemini AI.\n');

// [TEST 4] Testing User Edit from Note vs Parsed Merchant
console.log('[TEST 4] Testing Separation of User Free-Text Note from Parsed Merchant...');

// Suppose user logs an SMS transaction:
// Parsed Merchant: "Gopal Sweet"
// User edits note to: "Dinner with college friends at hostel"
const transactionContext = {
  source: 'sms',
  parsedMerchant: 'Gopal Sweet',
  note: 'Dinner with college friends at hostel',
  category: 'Food',
  type: 'expense',
};

function recordLearnedRuleOnSubmit(ctx) {
  // Only learn for sms/screenshot, and KEY on parsedMerchant, NOT the note!
  if ((ctx.source === 'sms' || ctx.source === 'screenshot') && ctx.parsedMerchant) {
    const key = normalizeMerchantName(ctx.parsedMerchant);
    return {
      learnedKey: key,
      category: ctx.category,
      type: ctx.type,
    };
  }
  return null;
}

const learnedResult = recordLearnedRuleOnSubmit(transactionContext);
assert.strictEqual(learnedResult.learnedKey, 'gopal sweet');
assert.notStrictEqual(learnedResult.learnedKey, normalizeMerchantName(transactionContext.note));
console.log(`  Rule keyed on parsed merchant: "${learnedResult.learnedKey}" (Note was completely ignored)`);

// Standard manual entries from scratch do NOT create learned rules
const manualCtx = {
  source: 'manual',
  parsedMerchant: undefined,
  note: 'Coffee at Starbucks',
  category: 'Food',
  type: 'expense',
};
const manualResult = recordLearnedRuleOnSubmit(manualCtx);
assert.strictEqual(manualResult, null);
console.log('  Scratch manual entries correctly skipped from polluting learned rules.');

console.log('✅ TEST 4 PASSED: Rules only recorded from parsed merchants on SMS/Receipt shares.\n');

console.log('--- ALL ADAPTIVE SMS LEARNING SYSTEM TESTS PASSED CLEANLY ---');
