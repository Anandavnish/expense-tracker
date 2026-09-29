import assert from 'assert';

/**
 * Redacts sensitive fields from raw SMS / OCR text before escalating to Gemini AI.
 * 
 * Specifically redacts:
 * 1. Account balance figures (e.g. "Avl Bal: INR 45,230.50", "Available Balance Rs 12,000")
 * 2. Partial/full account numbers (e.g. "A/c XX1234", "XXXXXX1234", "A/C 987654321098")
 * 3. Phone numbers (10-digit sequences not already identified as UTR/ref)
 * 4. Standalone 4-6 digit codes that look OTP-like (isolated, not adjacent to "UPI Ref"/"UTR"/"Txn ID")
 * 
 * Preserves completely intact:
 * - Transaction-type keywords: Credited, Debited, Refund, Reversal, EMI, NEFT, IMPS, UPI
 * - Merchant context: e.g. Zomato, Swiggy, Gopal Sweet, Uber, Amazon
 * - Primary transaction amounts
 * - Reference numbers (UTR, UPI Ref, Txn ID)
 */
export function redactSensitiveFields(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Redact Account Balance Figures
  // Patterns like "Avl Bal", "Available Balance", "Avail Bal", "Bal:", "Balance is", "Total Bal" followed by currency & amount
  const balanceRegex = /(?:(?:avl(?:able)?|avail(?:able)?|tot(?:al)?)\s+bal(?:ance)?|\bbal(?:ance)?)\s*(?:is|:|-)?\s*(?:(?:inr|rs\.?|₹)\s*)?[\d,]+(?:\.\d{1,2})?/gi;
  text = text.replace(balanceRegex, '[REDACTED_BALANCE]');

  // 2. Protect UTR / Txn ID / UPI Ref references before phone/OTP redaction
  // Indian UTRs are 12 digits, UPI refs are 12 digits, alphanumeric txn IDs
  const protectedRefs = [];
  const refRegex = /\b(?:upi\s*ref(?:erence)?(?:\s*no\.?)?|utr(?:\s*no\.?)?|txn(?:\s*id)?|transaction\s*id|reference\s*no\.?)\s*[:#-]?\s*([a-zA-Z0-9]{6,22})/gi;
  text = text.replace(refRegex, (match) => {
    const placeholder = `__PROTECTED_REF_${protectedRefs.length}__`;
    protectedRefs.push(match);
    return placeholder;
  });

  // Protect Years (2020-2035) so dates aren't redacted as OTP codes
  text = text.replace(/\b(202[0-9]|203[0-5])\b/g, '__YEAR_$1__');

  // Protect primary amounts already prefixed or suffixed by currency symbols (Rs, INR, ₹)
  const protectedAmounts = [];
  const amountRegex = /(?:(?:inr|rs\.?|₹)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:inr|rs\.?|₹|\/-))/gi;
  text = text.replace(amountRegex, (match) => {
    const placeholder = `__PROTECTED_AMT_${protectedAmounts.length}__`;
    protectedAmounts.push(match);
    return placeholder;
  });

  // 3. Redact Partial / Full Account Numbers
  // e.g. "A/c XX1234", "XXXXXX1234", "A/C 987654321098", "account ending 4321", "Acct XX5678"
  const accountRegex = /\b(?:a\/c|acct|account)\s*(?:no\.?|number|ending\s*(?:in)?)?\s*[:#-]?\s*([xX*]*\d{2,18})\b/gi;
  text = text.replace(accountRegex, '[REDACTED_ACCOUNT]');

  // Masked standalone account tokens like XXXXXX1234, XX1234, ***5678
  const maskedTokenRegex = /\b[xX*]{2,}\d{2,}\b/g;
  text = text.replace(maskedTokenRegex, '[REDACTED_ACCOUNT]');

  // 4. Redact Phone Numbers
  // 10-digit Indian mobile numbers starting with 6-9, optionally with +91 or 0 prefix
  // Also toll-free numbers like 1800xxxxxxx
  const phoneRegex = /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g;
  text = text.replace(phoneRegex, '[REDACTED_PHONE]');

  const tollFreeRegex = /\b1800[\s-]?\d{3}[\s-]?\d{3,4}\b/g;
  text = text.replace(tollFreeRegex, '[REDACTED_PHONE]');

  // 5. Redact Standalone 4-6 Digit Codes that look OTP-like
  // e.g. "OTP 584920", "code is 9182", or isolated 4-6 digits not part of amount/ref/date
  const explicitOtpRegex = /\b(?:otp|code|pin|secret|passcode)\s*(?:is|:|-)?\s*(\d{4,6})\b/gi;
  text = text.replace(explicitOtpRegex, '[REDACTED_CODE]');

  const standaloneCodeRegex = /\b\d{4,6}\b/g;
  text = text.replace(standaloneCodeRegex, '[REDACTED_CODE]');

  // Restore protected amounts
  text = text.replace(/__PROTECTED_AMT_(\d+)__/g, (_, idx) => protectedAmounts[parseInt(idx, 10)]);

  // Restore protected years
  text = text.replace(/__YEAR_(\d+)__/g, '$1');

  // Restore protected UTR / Ref numbers
  text = text.replace(/__PROTECTED_REF_(\d+)__/g, (_, idx) => protectedRefs[parseInt(idx, 10)]);

  return text;
}

// ==================== UNIT TESTS ====================
console.log('Running redactSensitiveFields unit tests...\n');

// Test 1: Pattern 1 (Balance) + Pattern 2 (Masked A/c) + Pattern 3 (Phone number)
const sms1 = "Dear Customer, INR 450.00 debited from A/c XX1234 on 28-SEP-26 via UPI to ZOMATO. UPI Ref 426812345678. Avl Bal: INR 45,230.50. Call 9876543210 if not done by you.";
const redacted1 = redactSensitiveFields(sms1);
console.log('Test 1 Original:', sms1);
console.log('Test 1 Redacted:', redacted1);
assert(!redacted1.includes('45,230.50'), 'Balance amount must be redacted');
assert(redacted1.includes('[REDACTED_BALANCE]'), 'Must contain [REDACTED_BALANCE]');
assert(redacted1.includes('[REDACTED_ACCOUNT]'), 'Must contain [REDACTED_ACCOUNT]');
assert(redacted1.includes('[REDACTED_PHONE]'), 'Must contain [REDACTED_PHONE]');
assert(redacted1.includes('UPI Ref 426812345678'), 'UPI Ref must be preserved intact');
assert(redacted1.includes('INR 450.00'), 'Transaction amount must survive intact');
assert(redacted1.includes('debited'), 'Transaction keyword "debited" must survive');
assert(redacted1.includes('UPI'), 'Transaction keyword "UPI" must survive');
assert(redacted1.includes('ZOMATO'), 'Merchant context "ZOMATO" must survive');
console.log('✅ TEST 1 PASSED: Balance, masked A/c, and phone redacted; transaction amount, UPI ref, keywords survive.');

// Test 2: Pattern 2 (Full A/c number) + Credited keyword + SALARY
const sms2 = "Your A/C 987654321098 is Credited by Rs 25,000.00 on 27-09-2026 by transfer from SALARY. Avl Bal Rs 52,140.75. Not you? SMS BLOCK to 9876543210.";
const redacted2 = redactSensitiveFields(sms2);
console.log('\nTest 2 Original:', sms2);
console.log('Test 2 Redacted:', redacted2);
assert(!redacted2.includes('987654321098'), 'Full account number must be redacted');
assert(!redacted2.includes('52,140.75'), 'Balance must be redacted');
assert(redacted2.includes('Credited'), 'Keyword "Credited" must survive intact');
assert(redacted2.includes('Rs 25,000.00'), 'Transaction amount must survive intact');
assert(redacted2.includes('SALARY'), 'Merchant/source "SALARY" must survive intact');
assert(redacted2.includes('2026'), 'Date year 2026 must survive intact');
console.log('✅ TEST 2 PASSED: Full account number redacted; Credited keyword and salary survive.');

// Test 3: Pattern 1 (Available Balance is...) + UTR
const sms3 = "Acct XX5678 debited with INR 1,299.00 on 29-Sep-26. Info: SWIGGY BANGALORE. Available Balance is Rs. 12,000.00. UTR: 426998877665.";
const redacted3 = redactSensitiveFields(sms3);
console.log('\nTest 3 Original:', sms3);
console.log('Test 3 Redacted:', redacted3);
assert(!redacted3.includes('12,000.00'), 'Available balance must be redacted');
assert(redacted3.includes('debited'), 'Keyword "debited" must survive');
assert(redacted3.includes('INR 1,299.00'), 'Transaction amount must survive');
assert(redacted3.includes('SWIGGY BANGALORE'), 'Merchant context must survive');
assert(redacted3.includes('UTR: 426998877665'), 'UTR must survive intact');
console.log('✅ TEST 3 PASSED: Available Balance redacted; UTR survives intact.');

// Test 4: Pattern 4 (OTP code) + Refund & Reversal keywords
const sms4 = "Rs 2,500.00 debited from account ending 4321 for Refund Reversal. UPI Ref 123456789012. Bal: INR 3,400.00. OTP 584920 was used.";
const redacted4 = redactSensitiveFields(sms4);
console.log('\nTest 4 Original:', sms4);
console.log('Test 4 Redacted:', redacted4);
assert(!redacted4.includes('584920'), 'OTP must be redacted');
assert(!redacted4.includes('3,400.00'), 'Bal must be redacted');
assert(redacted4.includes('Refund'), 'Keyword "Refund" must survive');
assert(redacted4.includes('Reversal'), 'Keyword "Reversal" must survive');
assert(redacted4.includes('UPI Ref 123456789012'), 'UPI Ref must survive');
console.log('✅ TEST 4 PASSED: OTP redacted; Refund and Reversal keywords survive.');

// Test 5: EMI, NEFT, IMPS keywords + Standalone OTP-like isolated code
const sms5 = "EMI of Rs 15,000.00 debited via NEFT / IMPS to HDFC LOAN. Use verification code 491023 to view details. Avl Bal INR 1,000.";
const redacted5 = redactSensitiveFields(sms5);
console.log('\nTest 5 Original:', sms5);
console.log('Test 5 Redacted:', redacted5);
assert(redacted5.includes('EMI'), 'EMI must survive');
assert(redacted5.includes('NEFT'), 'NEFT must survive');
assert(redacted5.includes('IMPS'), 'IMPS must survive');
assert(redacted5.includes('Rs 15,000.00'), 'EMI amount must survive');
assert(redacted5.includes('HDFC LOAN'), 'HDFC LOAN must survive');
assert(!redacted5.includes('491023'), 'Verification code must be redacted');
assert(!redacted5.includes('1,000'), 'Balance must be redacted');
console.log('✅ TEST 5 PASSED: EMI, NEFT, IMPS survive; verification code & balance redacted.');

console.log('\n🎉 ALL 5 REDACTION TESTS PASSED PERFECTLY!');
