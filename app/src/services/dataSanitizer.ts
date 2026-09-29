/**
 * dataSanitizer.ts
 *
 * Privacy and Data Protection Utility for Expense Tracker.
 * 
 * Ensures that PII (Personally Identifiable Information) and banking credentials
 * are strictly redacted before sending text payloads to external LLM services (Gemini).
 */

/**
 * Redacts sensitive fields from raw SMS / OCR text before escalating to Gemini AI.
 * 
 * Specifically redacts:
 * 1. Account balance figures (e.g. "Avl Bal: INR 45,230.50", "Available Balance Rs 12,000")
 * 2. Partial/full account numbers (e.g. "A/c XX1234", "XXXXXX1234", "A/C 987654321098", "account ending 4321")
 * 3. Phone numbers (10-digit sequences not already identified as UTR/ref)
 * 4. Standalone 4-6 digit codes that look OTP-like (isolated, not adjacent to "UPI Ref"/"UTR"/"Txn ID")
 * 
 * Preserves completely intact:
 * - Transaction-type keywords: Credited, Debited, Refund, Reversal, EMI, NEFT, IMPS, UPI
 * - Merchant context: e.g. Zomato, Swiggy, Gopal Sweet, Uber, Amazon
 * - Primary transaction amounts: e.g. Rs 500, INR 1,299.00
 * - Transaction reference numbers: UTR, UPI Ref, Txn ID
 */
export function redactSensitiveFields(rawText?: string | null): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Redact Account Balance Figures
  // Patterns like "Avl Bal", "Available Balance", "Avail Bal", "Bal:", "Balance is", "Total Bal" followed by currency & amount
  const balanceRegex = /(?:(?:avl(?:able)?|avail(?:able)?|tot(?:al)?)\s+bal(?:ance)?|\bbal(?:ance)?)\s*(?:is|:|-)?\s*(?:(?:inr|rs\.?|₹)\s*)?[\d,]+(?:\.\d{1,2})?/gi;
  text = text.replace(balanceRegex, '[REDACTED_BALANCE]');

  // 2. Protect UTR / Txn ID / UPI Ref references before phone/OTP redaction
  // Indian UTRs are 12 digits, UPI refs are 12 digits, alphanumeric txn IDs
  const protectedRefs: string[] = [];
  const refRegex = /\b(?:upi\s*ref(?:erence)?(?:\s*no\.?)?|utr(?:\s*no\.?)?|txn(?:\s*id)?|transaction\s*id|reference\s*no\.?)\s*[:#-]?\s*([a-zA-Z0-9]{6,22})/gi;
  text = text.replace(refRegex, (match) => {
    const placeholder = `__PROTECTED_REF_${protectedRefs.length}__`;
    protectedRefs.push(match);
    return placeholder;
  });

  // Protect Years (2020-2035) so dates aren't redacted as OTP codes
  text = text.replace(/\b(202[0-9]|203[0-5])\b/g, '__YEAR_$1__');

  // Protect primary amounts already prefixed or suffixed by currency symbols (Rs, INR, ₹)
  const protectedAmounts: string[] = [];
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
