// src/services/smsParser.ts
// Offline parser for Indian banking SMS and UPI transaction messages
// Powered by the unified transactionParser pipeline for complete shared logic

import { TransactionType, LearnedMerchantRule } from '../types/database';
import {
  parseTransaction,
  normalizeMerchantName,
  normalizeAndMatchCategory,
  inferCategoryFromText,
  extractMerchant,
  extractTransactionDate,
  extractUpiReference,
  extractAmountWithProminence,
  CATEGORY_KEYWORD_MAP,
  CATEGORY_ALIAS_MAP,
} from './transactionParser';

export {
  normalizeMerchantName,
  normalizeAndMatchCategory,
  inferCategoryFromText,
  extractMerchant,
  extractTransactionDate,
  extractUpiReference,
  extractAmountWithProminence,
  CATEGORY_KEYWORD_MAP,
  CATEGORY_ALIAS_MAP,
};

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

/**
 * Main offline banking SMS / text parser.
 * Delegates directly to the shared transactionParser engine.
 */
export function parseBankingSms(
  rawText: string,
  userAccounts?: { id: string; name: string; type: string }[],
  availableCategories?: string[],
  learnedRules?: LearnedMerchantRule[]
): ParsedSmsData {
  const result = parseTransaction({
    rawText,
    userAccounts,
    availableCategories,
    learnedRules,
  });

  // Calculate composite confidence for backwards compatibility
  let overallConfidence: 'high' | 'medium' | 'low' = 'low';
  if (result.isCategoryLearned && result.amountConfidence === 'high') {
    overallConfidence = 'high';
  } else if (result.amount !== null && result.merchant !== 'Unknown') {
    overallConfidence = 'medium';
  }

  return {
    amount: result.amount,
    merchant_or_person: result.merchant,
    suggested_category: result.suggestedCategory,
    suggested_type: result.suggestedType,
    date_if_present: result.date,
    account_hint: result.accountHint,
    matched_account_id: result.matchedAccountId,
    raw_reference: result.upiRef || undefined,
    confidence: overallConfidence,
    is_learned: result.isCategoryLearned,
  };
}
