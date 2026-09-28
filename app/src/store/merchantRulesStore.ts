// src/store/merchantRulesStore.ts
// Standard Zustand store for learned merchant rules with AsyncStorage caching & Supabase sync

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { LearnedMerchantRule, TransactionType } from '../types/database';
import { normalizeMerchantName } from '../services/smsParser';

export const getMerchantRulesStorageKey = (userId?: string | null) => {
  const effective = userId && userId !== 'guest_local_user' ? userId : 'guest';
  return `@merchant_rules_${effective}_v1`;
};

interface MerchantRulesState {
  rules: LearnedMerchantRule[];
  currentUserId: string | null;
  isLoading: boolean;

  // Actions
  loadRules: (userId: string | null) => Promise<void>;
  getRuleForMerchant: (rawMerchant: string) => LearnedMerchantRule | null;
  recordUserRule: (
    rawMerchant: string,
    category: string,
    transactionType: TransactionType
  ) => Promise<void>;
  recordGeminiRule: (
    rawMerchant: string,
    category: string,
    transactionType: TransactionType
  ) => Promise<void>;
  updateRuleCategory: (merchantName: string, newCategory: string) => Promise<void>;
  deleteRule: (merchantName: string) => Promise<void>;
  resetForSignOut: () => void;
}

const persistLocalRules = (userId: string | null, rules: LearnedMerchantRule[]) => {
  const key = getMerchantRulesStorageKey(userId);
  AsyncStorage.setItem(key, JSON.stringify(rules)).catch(() => {});
};

export const useMerchantRulesStore = create<MerchantRulesState>((set, get) => ({
  rules: [],
  currentUserId: null,
  isLoading: false,

  loadRules: async (userId: string | null) => {
    set({ currentUserId: userId, isLoading: true });

    const key = getMerchantRulesStorageKey(userId);
    // 1. Instant local cache load
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          set({ rules: parsed });
        }
      }
    } catch {
      // Local cache read failed, continue
    }

    // 2. If logged in (not guest), sync from Supabase
    if (userId && userId !== 'guest_local_user') {
      try {
        const { data, error } = await supabase
          .from('user_merchant_rules')
          .select('*')
          .eq('user_id', userId)
          .order('usage_count', { ascending: false });

        if (!error && data) {
          set({ rules: data });
          persistLocalRules(userId, data);
        }
      } catch (err) {
        console.warn('[merchantRulesStore] Failed syncing rules from cloud:', err);
      }
    }

    set({ isLoading: false });
  },

  getRuleForMerchant: (rawMerchant: string): LearnedMerchantRule | null => {
    const norm = normalizeMerchantName(rawMerchant);
    if (!norm) return null;

    // Exact normalized match only (prevents "Gopal Medical" from matching "Gopal Sweet")
    const match = get().rules.find((r) => r.merchant_name === norm);
    return match || null;
  },

  recordUserRule: async (
    rawMerchant: string,
    category: string,
    transactionType: TransactionType
  ) => {
    const norm = normalizeMerchantName(rawMerchant);
    if (!norm) return;

    const { currentUserId, rules } = get();
    const existingIndex = rules.findIndex((r) => r.merchant_name === norm);

    const now = new Date().toISOString();
    const newRule: LearnedMerchantRule = {
      user_id: currentUserId || 'guest_local_user',
      merchant_name: norm,
      category,
      transaction_type: transactionType,
      source: 'user_manual', // 100% Ground Truth
      confidence: 1.0,
      usage_count: existingIndex >= 0 ? (rules[existingIndex].usage_count || 1) + 1 : 1,
      updated_at: now,
    };

    let updatedRules: LearnedMerchantRule[];
    if (existingIndex >= 0) {
      updatedRules = [...rules];
      updatedRules[existingIndex] = { ...rules[existingIndex], ...newRule };
    } else {
      updatedRules = [newRule, ...rules];
    }

    set({ rules: updatedRules });
    persistLocalRules(currentUserId, updatedRules);

    // Sync to Supabase if authenticated
    if (currentUserId && currentUserId !== 'guest_local_user') {
      try {
        await supabase.from('user_merchant_rules').upsert(
          {
            user_id: currentUserId,
            merchant_name: norm,
            category,
            transaction_type: transactionType,
            source: 'user_manual',
            confidence: 1.0,
            usage_count: newRule.usage_count,
            updated_at: now,
          },
          { onConflict: 'user_id,merchant_name' }
        );
      } catch (err) {
        console.warn('[merchantRulesStore] Error upserting user rule:', err);
      }
    }
  },

  recordGeminiRule: async (
    rawMerchant: string,
    category: string,
    transactionType: TransactionType
  ) => {
    const norm = normalizeMerchantName(rawMerchant);
    if (!norm) return;

    const { currentUserId, rules } = get();
    const existing = rules.find((r) => r.merchant_name === norm);

    // PRECEDENCE RULE: Gemini must NEVER overwrite a user_manual rule!
    if (existing && existing.source === 'user_manual') {
      return;
    }

    const now = new Date().toISOString();
    const newRule: LearnedMerchantRule = {
      user_id: currentUserId || 'guest_local_user',
      merchant_name: norm,
      category,
      transaction_type: transactionType,
      source: 'gemini',
      confidence: 0.9,
      usage_count: existing ? (existing.usage_count || 1) + 1 : 1,
      updated_at: now,
    };

    let updatedRules: LearnedMerchantRule[];
    const existingIndex = rules.findIndex((r) => r.merchant_name === norm);
    if (existingIndex >= 0) {
      updatedRules = [...rules];
      updatedRules[existingIndex] = { ...rules[existingIndex], ...newRule };
    } else {
      updatedRules = [newRule, ...rules];
    }

    set({ rules: updatedRules });
    persistLocalRules(currentUserId, updatedRules);

    // Sync to Supabase if authenticated
    if (currentUserId && currentUserId !== 'guest_local_user') {
      try {
        await supabase.from('user_merchant_rules').upsert(
          {
            user_id: currentUserId,
            merchant_name: norm,
            category,
            transaction_type: transactionType,
            source: 'gemini',
            confidence: 0.9,
            usage_count: newRule.usage_count,
            updated_at: now,
          },
          { onConflict: 'user_id,merchant_name' }
        );
      } catch (err) {
        console.warn('[merchantRulesStore] Error upserting gemini rule:', err);
      }
    }
  },

  updateRuleCategory: async (merchantName: string, newCategory: string) => {
    const { currentUserId, rules } = get();
    const now = new Date().toISOString();

    const updatedRules = rules.map((r) =>
      r.merchant_name === merchantName
        ? { ...r, category: newCategory, source: 'user_manual' as const, updated_at: now }
        : r
    );

    set({ rules: updatedRules });
    persistLocalRules(currentUserId, updatedRules);

    if (currentUserId && currentUserId !== 'guest_local_user') {
      try {
        await supabase
          .from('user_merchant_rules')
          .update({
            category: newCategory,
            source: 'user_manual',
            updated_at: now,
          })
          .eq('user_id', currentUserId)
          .eq('merchant_name', merchantName);
      } catch (err) {
        console.warn('[merchantRulesStore] Error updating rule category:', err);
      }
    }
  },

  deleteRule: async (merchantName: string) => {
    const { currentUserId, rules } = get();
    const updatedRules = rules.filter((r) => r.merchant_name !== merchantName);

    set({ rules: updatedRules });
    persistLocalRules(currentUserId, updatedRules);

    if (currentUserId && currentUserId !== 'guest_local_user') {
      try {
        await supabase
          .from('user_merchant_rules')
          .delete()
          .eq('user_id', currentUserId)
          .eq('merchant_name', merchantName);
      } catch (err) {
        console.warn('[merchantRulesStore] Error deleting rule:', err);
      }
    }
  },

  resetForSignOut: () => {
    set({ rules: [], currentUserId: null, isLoading: false });
  },
}));
