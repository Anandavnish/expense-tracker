// src/store/financeStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import {
  Account,
  Transaction,
  TransactionType,
  TransactionSource,
  Borrow,
  BorrowStatus,
  BorrowType,
  Budget,
  BudgetSummary,
} from '../types/database';
import { RealtimeChannel } from '@supabase/supabase-js';

export const getStorageKey = (userId?: string | null) => {
  return `@finance_store_cache_${userId || 'default'}_v3`;
};

export const getCategoriesKey = (userId?: string | null) => {
  return `@finance_categories_${userId || 'default'}_v1`;
};

export const getAccountOrderKey = (userId?: string | null) => {
  return `@finance_account_order_${userId || 'default'}_v1`;
};

export const getAccountMetaKey = (userId?: string | null) => {
  return `@account_metadata_${userId || 'default'}_v1`;
};

export interface AccountMetadata {
  billing_cycle_day?: number | null;
  payment_due_day?: number | null;
  current_statement_billed_due?: number | null;
  bank_preset?: string | null;
  card_issuer?: string | null;
  custom_icon?: string | null;
  custom_color?: string | null;
}

// Module-level in-memory metadata cache to guarantee metadata is NEVER lost or stripped
// even across realtime database events, account clones, or optimistic mutations.
let inMemoryAccountMetadata: Record<string, AccountMetadata> = {};
const GLOBAL_ACCOUNT_META_KEY = '@account_metadata_global_v1';
const inProgressSettleBorrowIds = new Set<string>();

export const getInMemoryAccountMetadata = () => inMemoryAccountMetadata;

export const saveAccountMetadata = async (
  userId: string | null | undefined,
  accountId: string,
  meta: AccountMetadata
) => {
  try {
    inMemoryAccountMetadata[accountId] = {
      ...(inMemoryAccountMetadata[accountId] || {}),
      ...meta,
    };
    // 1. Save to user-scoped key
    const key = getAccountMetaKey(userId);
    const existingRaw = await AsyncStorage.getItem(key);
    const map: Record<string, AccountMetadata> = existingRaw ? JSON.parse(existingRaw) : {};
    map[accountId] = {
      ...(map[accountId] || {}),
      ...meta,
    };
    await AsyncStorage.setItem(key, JSON.stringify(map));

    // 2. Also save to global fallback key
    const globalRaw = await AsyncStorage.getItem(GLOBAL_ACCOUNT_META_KEY);
    const globalMap: Record<string, AccountMetadata> = globalRaw ? JSON.parse(globalRaw) : {};
    globalMap[accountId] = {
      ...(globalMap[accountId] || {}),
      ...meta,
    };
    await AsyncStorage.setItem(GLOBAL_ACCOUNT_META_KEY, JSON.stringify(globalMap));
  } catch {}
};

export const loadAllAccountMetadata = async (
  userId: string | null | undefined
): Promise<Record<string, AccountMetadata>> => {
  try {
    const key = getAccountMetaKey(userId);
    const [raw, globalRaw] = await Promise.all([
      AsyncStorage.getItem(key),
      AsyncStorage.getItem(GLOBAL_ACCOUNT_META_KEY),
    ]);
    const parsed = raw ? JSON.parse(raw) : {};
    const parsedGlobal = globalRaw ? JSON.parse(globalRaw) : {};
    const merged = { ...parsedGlobal, ...parsed };
    inMemoryAccountMetadata = { ...inMemoryAccountMetadata, ...merged };
    return merged;
  } catch {
    return inMemoryAccountMetadata;
  }
};

export const removeAccountMetadata = async (
  userId: string | null | undefined,
  accountId: string
) => {
  try {
    delete inMemoryAccountMetadata[accountId];
    const key = getAccountMetaKey(userId);
    const existingRaw = await AsyncStorage.getItem(key);
    if (!existingRaw) return;
    const map: Record<string, AccountMetadata> = JSON.parse(existingRaw);
    delete map[accountId];
    await AsyncStorage.setItem(key, JSON.stringify(map));
  } catch {}
};

export const hydrateTransactions = (
  transactions: Transaction[],
  borrows: Borrow[]
): Transaction[] => {
  const borrowMap = new Map<string, Borrow>();
  borrows.forEach((b) => {
    if (b.linked_transaction_id) {
      borrowMap.set(b.linked_transaction_id, b);
    }
  });

  return transactions.map((tx) => {
    const linkedBorrow = borrowMap.get(tx.id);
    let friendName = tx.friend_name || null;
    let isPaidByFriend = Boolean(tx.paid_by_friend);

    if (
      linkedBorrow &&
      (linkedBorrow.type === 'borrowed' || linkedBorrow.person_name?.startsWith('[BORROWED]'))
    ) {
      isPaidByFriend = true;
      if (!friendName) {
        friendName = linkedBorrow.person_name.replace(/^\[BORROWED\]\s*/i, '').trim();
      }
    } else if (tx.note && /\[Paid by ([^\]]+)\]/i.test(tx.note)) {
      const match = tx.note.match(/\[Paid by ([^\]]+)\]/i);
      if (match && match[1]) {
        isPaidByFriend = true;
        if (!friendName) {
          friendName = match[1].trim();
        }
      }
    }

    if (isPaidByFriend) {
      return {
        ...tx,
        paid_by_friend: true,
        friend_name: friendName || 'Friend',
      };
    }

    return tx;
  });
};

const persistFinanceCache = (
  state: {
    accounts: Account[];
    transactions: Transaction[];
    borrows: Borrow[];
    budgets: Budget[];
    budgetSummaries: BudgetSummary[];
    currentUserId?: string | null;
  }
) => {
  if (!state.currentUserId) return;

  const key = getStorageKey(state.currentUserId);

  const filteredAccounts = state.accounts.filter((a) => a.user_id === state.currentUserId);
  const filteredTransactions = state.transactions.filter((t) => t.user_id === state.currentUserId);
  const filteredBorrows = state.borrows.filter((b) => b.user_id === state.currentUserId);
  const filteredBudgets = state.budgets.filter((bg) => bg.user_id === state.currentUserId);

  AsyncStorage.setItem(
    key,
    JSON.stringify({
      accounts: filteredAccounts,
      transactions: filteredTransactions,
      borrows: filteredBorrows,
      budgets: filteredBudgets,
      budgetSummaries: state.budgetSummaries,
    })
  ).catch(() => {});
};

const isGuestUser = (_userId?: string | null): boolean => false;

export const getDeletedCategoriesKey = (userId?: string | null) => {
  return `@finance_deleted_categories_${userId || 'default'}_v1`;
};

export const DEFAULT_STUDENT_CATEGORIES = [
  'Food',
  'Travel',
  'Hostel/Rent',
  'Recharge/Data',
  'Subscriptions',
  'Books/Stationery',
  'Shopping',
  'Entertainment',
  'Other',
];

export const mergeCategoriesWithDefaults = (
  savedCategories?: string[] | null,
  transactions?: Transaction[] | null,
  budgets?: Budget[] | null,
  extraCategories?: (string | null | undefined)[] | null,
  deletedCategories?: string[] | null
): string[] => {
  const categorySet = new Set<string>();
  const merged: string[] = [];

  const deletedSet = new Set<string>(
    (deletedCategories || []).map((c) => (c || '').toLowerCase().trim())
  );

  const addCat = (c?: string | null) => {
    if (!c) return;
    const clean = c.trim();
    if (
      !clean ||
      clean === 'Credit Card Payment' ||
      clean === 'Overall Budget' ||
      clean.toLowerCase() === 'uncategorized'
    ) {
      return;
    }
    const lower = clean.toLowerCase();
    if (deletedSet.has(lower)) {
      return;
    }
    if (!categorySet.has(lower)) {
      categorySet.add(lower);
      merged.push(clean);
    }
  };

  // 1. Saved custom categories in user's preferred order (Primary source of truth)
  const hasUserCustomCategories = savedCategories && Array.isArray(savedCategories);
  if (hasUserCustomCategories) {
    savedCategories.forEach(addCat);
  }

  // 2. Extra categories only if user has never saved any custom categories
  if (!hasUserCustomCategories && extraCategories && Array.isArray(extraCategories)) {
    extraCategories.forEach(addCat);
  }

  // 3. Default categories ONLY if user has never saved any custom categories
  if (!hasUserCustomCategories) {
    DEFAULT_STUDENT_CATEGORIES.forEach(addCat);
  }

  return merged;
};

export const parseBorrowDetails = (
  borrow: Borrow,
  transactions?: Transaction[]
): {
  type: 'lent' | 'borrowed';
  displayName: string;
} => {
  if (borrow.type) {
    return {
      type: borrow.type,
      displayName: borrow.person_name.replace(/^\[(BORROWED|LENT)\]\s*/i, '').trim(),
    };
  }
  if (borrow.person_name?.startsWith('[BORROWED]')) {
    return {
      type: 'borrowed',
      displayName: borrow.person_name.replace(/^\[BORROWED\]\s*/i, '').trim(),
    };
  }
  if (borrow.person_name?.startsWith('[LENT]')) {
    return {
      type: 'lent',
      displayName: borrow.person_name.replace(/^\[LENT\]\s*/i, '').trim(),
    };
  }
  if (borrow.linked_transaction_id && transactions) {
    const linkedTx = transactions.find((t) => t.id === borrow.linked_transaction_id);
    if (linkedTx) {
      return {
        type: linkedTx.type === 'borrow_taken' ? 'borrowed' : 'lent',
        displayName: borrow.person_name,
      };
    }
  }
  return {
    type: 'lent',
    displayName: borrow.person_name || 'Borrow',
  };
};

export const calculateNetWorth = (
  accounts: Account[],
  borrows: Borrow[],
  transactions?: Transaction[]
): number => {
  const liquidAccounts = accounts.filter(
    (a) => a.type === 'bank' || a.type === 'cash'
  );
  const liquidTotal = liquidAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance || 0),
    0
  );

  const pendingBorrows = borrows.filter((b) => b.status === 'pending');
  let totalLent = 0;
  let totalBorrowed = 0;

  pendingBorrows.forEach((b) => {
    const { type } = parseBorrowDetails(b, transactions);
    if (type === 'borrowed') {
      totalBorrowed += Number(b.amount || 0);
    } else {
      totalLent += Number(b.amount || 0);
    }
  });

  const creditAccounts = accounts.filter((a) => a.type === 'credit_card');
  const totalCreditDebt = creditAccounts.reduce(
    (sum, a) => sum + Math.abs(Math.min(0, Number(a.current_balance || 0))),
    0
  );

  return liquidTotal + totalLent - totalBorrowed - totalCreditDebt;
};

export interface CreditCardCycleDues {
  totalDues: number;
  billedDues: number;
  unbilledDues: number;
  isSplitActive: boolean;
  billingCycleDay: number | null;
  paymentDueDay: number | null;
  statementDateStr: string | null;
  paymentDueDateStr: string | null;
  daysUntilDue: number | null;
  isOverdue: boolean;
}

export const calculateCreditCardCycleDues = (
  card: Account,
  transactions: Transaction[],
  refDateStr?: string
): CreditCardCycleDues => {
  const totalDues = Math.abs(Math.min(0, Number(card.current_balance || 0)));
  const meta = inMemoryAccountMetadata[card.id];
  const rawBDay = card.billing_cycle_day ?? meta?.billing_cycle_day;
  const rawPDay = card.payment_due_day ?? meta?.payment_due_day;
  const bDay = rawBDay != null && !isNaN(Number(rawBDay)) ? Number(rawBDay) : null;
  const pDay = rawPDay != null && !isNaN(Number(rawPDay)) ? Number(rawPDay) : null;

  if (!bDay || bDay < 1 || bDay > 31 || totalDues <= 0) {
    return {
      totalDues,
      billedDues: totalDues,
      unbilledDues: 0,
      isSplitActive: false,
      billingCycleDay: bDay || null,
      paymentDueDay: pDay || null,
      statementDateStr: null,
      paymentDueDateStr: null,
      daysUntilDue: null,
      isOverdue: false,
    };
  }

  let now: Date;
  if (refDateStr && /^\d{4}-\d{2}-\d{2}$/.test(refDateStr)) {
    const [y, m, d] = refDateStr.split('-').map(Number);
    now = new Date(y, m - 1, d);
  } else if (refDateStr) {
    now = new Date(refDateStr);
  } else {
    now = new Date();
  }

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 9=Oct)
  const currentDay = now.getDate();
  const nowZero = new Date(currentYear, currentMonth, currentDay);

  // Clamp day to maximum available days in month
  const getClampedDate = (year: number, month: number, day: number) => {
    const maxDays = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, maxDays));
  };

  const formatDateIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let statementDate: Date;
  let paymentDueDate: Date;

  if (currentDay >= bDay) {
    // Current cycle statement generated on bDay of this month
    statementDate = getClampedDate(currentYear, currentMonth, bDay);
    const dueMonth = (pDay || 5) <= bDay ? currentMonth + 1 : currentMonth;
    paymentDueDate = getClampedDate(currentYear, dueMonth, pDay || 5);
  } else {
    // Current day is before bDay, so latest statement was generated in previous month
    statementDate = getClampedDate(currentYear, currentMonth - 1, bDay);
    const dueMonth = (pDay || 5) <= bDay ? currentMonth : currentMonth - 1;
    paymentDueDate = getClampedDate(currentYear, dueMonth, pDay || 5);
  }

  const statementDateStr = formatDateIso(statementDate);
  const paymentDueDateStr = formatDateIso(paymentDueDate);

  const statementZero = new Date(statementDate.getFullYear(), statementDate.getMonth(), statementDate.getDate());
  const dueZero = new Date(paymentDueDate.getFullYear(), paymentDueDate.getMonth(), paymentDueDate.getDate());

  // Window checks
  const isInCycleWindow = nowZero.getTime() >= statementZero.getTime() && nowZero.getTime() <= dueZero.getTime();
  const isPastDueDate = nowZero.getTime() > dueZero.getTime();
  const diffMs = dueZero.getTime() - nowZero.getTime();
  const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Card transactions
  const cardTx = transactions.filter((t) => t.account_id === card.id);
  let unbilledSpend = 0;

  const normalizeIso = (raw: string): string => {
    if (!raw) return '';
    const str = raw.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, '-');
    if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
      const [d, m, y] = str.split('-');
      return `${y}-${m}-${d}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [d, m, y] = str.split('/');
      return `${y}-${m}-${d}`;
    }
    return str;
  };

  cardTx.forEach((tx) => {
    const txDate = normalizeIso(tx.date || tx.created_at || '');
    const amt = Number(tx.amount || 0);

    // Spends strictly after statementDateStr belong to running cycle (unbilled)
    if ((tx.type === 'expense' || tx.type === 'borrow_given') && txDate > statementDateStr) {
      unbilledSpend += amt;
    }
  });

  // Capped Billed Amount determination & split calculation
  let billedDues: number;
  let unbilledDues: number;

  const rawBilledSnap =
    card.current_statement_billed_due !== undefined && card.current_statement_billed_due !== null
      ? card.current_statement_billed_due
      : meta?.current_statement_billed_due;

  if (rawBilledSnap !== undefined && rawBilledSnap !== null && !isNaN(Number(rawBilledSnap))) {
    // Explicit statement snapshot calibrated by user (capped 1st amount)
    billedDues = Math.min(totalDues, Math.max(0, Number(rawBilledSnap)));
    unbilledDues = Math.max(0, totalDues - billedDues);
  } else {
    // Automatic calibration: unbilledSpend is running cycle spend strictly after statement date.
    // Billed due is capped at (totalDues - unbilledSpend), and all remaining debt belongs to unbilled.
    billedDues = Math.max(0, totalDues - unbilledSpend);
    unbilledDues = Math.max(0, totalDues - billedDues);
  }

  // Active Split Condition:
  // Strictly active between Billing Date and Due Date (isInCycleWindow) when there is debt.
  // Once Due Date passes, amounts merge into a single total due (flagged as overdue if billed debt remains).
  const isSplitActive = isInCycleWindow && totalDues > 0;
  const isOverdue = isPastDueDate && billedDues > 0;

  return {
    totalDues,
    billedDues,
    unbilledDues,
    isSplitActive,
    billingCycleDay: bDay,
    paymentDueDay: pDay || null,
    statementDateStr,
    paymentDueDateStr,
    daysUntilDue,
    isOverdue,
  };
};

export const calculateAggregateCreditCycleDues = (
  creditAccounts: Account[],
  transactions: Transaction[],
  refDateStr?: string
) => {
  let totalDues = 0;
  let billedDues = 0;
  let unbilledDues = 0;
  let nearestDueDays: number | null = null;
  let hasBilledDues = false;
  let hasActiveSplit = false;
  let hasOverdue = false;

  creditAccounts.forEach((acc) => {
    const dues = calculateCreditCardCycleDues(acc, transactions, refDateStr);
    totalDues += dues.totalDues;
    billedDues += dues.billedDues;
    unbilledDues += dues.unbilledDues;
    if (dues.isSplitActive) {
      hasActiveSplit = true;
    }
    if (dues.isOverdue) {
      hasOverdue = true;
    }
    if (dues.billedDues > 0 && dues.daysUntilDue !== null) {
      hasBilledDues = true;
      if (nearestDueDays === null || dues.daysUntilDue < nearestDueDays) {
        nearestDueDays = dues.daysUntilDue;
      }
    }
  });

  return {
    totalDues,
    billedDues,
    unbilledDues,
    nearestDueDays,
    hasBilledDues,
    isSplitActive: hasActiveSplit,
    isOverdue: hasOverdue,
  };
};

export const getCurrentMonthString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const getHistoricalAccountBalances = (
  accounts: Account[],
  transactions: Transaction[],
  month: string
): Account[] => {
  const currentMonth = getCurrentMonthString();
  if (month > currentMonth) {
    return accounts.map((acc) => ({ ...acc, current_balance: 0 }));
  }
  if (month === currentMonth) {
    return accounts;
  }

  const [yearStr, monthStr] = month.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  const lastDateStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  const futureTransactions = transactions.filter((t) => {
    const txDate = (t.date || t.created_at || '').slice(0, 10);
    return txDate > lastDateStr;
  });

  const deltasByAccount: Record<string, number> = {};
  futureTransactions.forEach((tx) => {
    if (!tx.account_id) return;
    let delta = 0;
    if (tx.type === 'income' || tx.type === 'borrow_taken') {
      delta = Number(tx.amount || 0);
    } else if (tx.type === 'expense' || tx.type === 'borrow_given') {
      delta = -Number(tx.amount || 0);
    }
    deltasByAccount[tx.account_id] = (deltasByAccount[tx.account_id] || 0) + delta;
  });

  return accounts.map((acc) => {
    // If account was created AFTER this month, it did not exist in this month
    if (acc.created_at && acc.created_at.slice(0, 7) > month) {
      return {
        ...acc,
        current_balance: 0,
      };
    }

    const futureDelta = deltasByAccount[acc.id] || 0;
    const closingBalance = Number(acc.current_balance || 0) - futureDelta;
    return {
      ...acc,
      current_balance: closingBalance,
    };
  });
};

export const getHistoricalBorrows = (
  borrows: Borrow[],
  transactions: Transaction[],
  month: string
): Borrow[] => {
  const currentMonth = getCurrentMonthString();
  if (month > currentMonth) {
    return [];
  }
  if (month === currentMonth) {
    return borrows.filter((b) => b.status === 'pending');
  }

  const [yearStr, monthStr] = month.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  const lastDateStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  return borrows.filter((b) => {
    const bDate = (b.date || b.created_at || '').slice(0, 10);
    // If borrow date did not exist yet or is after this month ended, it did not exist in this snapshot
    if (!bDate || bDate > lastDateStr) return false;

    const bCreated = (b.created_at || '').slice(0, 10);
    if (bCreated && bCreated > lastDateStr) return false;

    // If it is still pending today, it was pending at that month end
    if (b.status === 'pending') return true;

    // If it was settled, did the settlement occur AFTER this month ended?
    if (b.linked_transaction_id && transactions) {
      const linkedTx = transactions.find((t) => t.id === b.linked_transaction_id);
      if (linkedTx) {
        const txDate = (linkedTx.date || linkedTx.created_at || '').slice(0, 10);
        if (txDate > lastDateStr) {
          return true;
        }
      }
    }
    return false;
  });
};

export const calculateHistoricalNetWorth = (
  accounts: Account[],
  borrows: Borrow[],
  transactions: Transaction[],
  month: string
): number => {
  const currentMonth = getCurrentMonthString();
  if (month > currentMonth) {
    return 0;
  }
  if (month === currentMonth) {
    return calculateNetWorth(accounts, borrows, transactions);
  }

  const historicalAccounts = getHistoricalAccountBalances(accounts, transactions, month);
  const activeBorrows = getHistoricalBorrows(borrows, transactions, month);
  return calculateNetWorth(historicalAccounts, activeBorrows, transactions);
};

const sortAccountsByOrder = (accounts: Account[], orderIds: string[] | null): Account[] => {
  if (!orderIds || orderIds.length === 0) return accounts;
  const orderMap = new Map<string, number>();
  orderIds.forEach((id, idx) => orderMap.set(id, idx));
  return [...accounts].sort((a, b) => {
    const orderA = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 9999;
    const orderB = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 9999;
    return orderA - orderB;
  });
};

const deduplicateAccounts = (accounts: Account[]): Account[] => {
  const seen = new Set<string>();
  const res: Account[] = [];
  for (const acc of accounts) {
    if (!seen.has(acc.id)) {
      seen.add(acc.id);
      res.push(acc);
    }
  }
  return res;
};

export const deduplicateTransactions = (transactions: Transaction[]): Transaction[] => {
  const seen = new Set<string>();
  const res: Transaction[] = [];
  for (const tx of transactions) {
    if (tx && tx.id && !seen.has(tx.id)) {
      seen.add(tx.id);
      res.push(tx);
    }
  }
  return res;
};

interface FinanceState {
  accounts: Account[];
  transactions: Transaction[];
  borrows: Borrow[];
  budgets: Budget[];
  budgetSummaries: BudgetSummary[];
  selectedMonth: string; // 'YYYY-MM'
  categories: string[];
  currentUserId: string | null;
  isInitialLoading: boolean;
  inlineError: string | null;
  activeChannel: RealtimeChannel | null;
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';

  // Actions
  setInlineError: (error: string | null) => void;
  setSelectedMonth: (month: string, userId?: string) => Promise<void>;
  loadCachedData: (userId?: string) => Promise<void>;
  fetchInitialData: (userId: string) => Promise<void>;
  subscribeRealtime: (userId: string) => void;
  unsubscribeRealtime: () => void;
  triggerCloudSync: () => Promise<{ success: boolean; error?: string }>;
  migrateLocalDataToCloud: (userId: string) => Promise<{ success: boolean; error?: string }>;
  clearAllLocalData: () => Promise<void>;
  resetForSignOut: () => void;

  // Category management
  addCategory: (category: string) => void;
  updateCategory: (oldCategory: string, newCategory: string) => void;
  reorderCategories: (categories: string[]) => void;
  removeCategory: (category: string) => void;

  // Optimistic mutations
  addTransactionOptimistic: (
    txData: Omit<Transaction, 'id' | 'created_at'>
  ) => Promise<{ success: boolean; error?: string }>;

  updateTransactionOptimistic: (
    transactionId: string,
    updates: Partial<Omit<Transaction, 'id' | 'created_at' | 'user_id'>>
  ) => Promise<{ success: boolean; error?: string }>;

  deleteTransactionOptimistic: (
    transactionId: string
  ) => Promise<{ success: boolean; error?: string }>;

  toggleSettleBorrowOptimistic: (
    borrowId: string
  ) => Promise<{ success: boolean; error?: string }>;

  settleBorrowWithTransactionOptimistic: (params: {
    borrowId: string;
    depositAccountId?: string | null;
    date?: string;
    note?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;

  reopenBorrowOptimistic: (
    borrowId: string
  ) => Promise<{ success: boolean; error?: string }>;

  deleteBorrowOptimistic: (
    borrowId: string,
    deleteLinkedTx?: boolean
  ) => Promise<{ success: boolean; error?: string }>;

  addBorrowOptimistic: (
    borrowData: Omit<Borrow, 'id' | 'created_at' | 'updated_at'>
  ) => Promise<{ success: boolean; error?: string }>;

  addBorrowWithTransactionOptimistic: (params: {
    user_id: string;
    person_name: string;
    amount: number;
    type: 'lent' | 'borrowed';
    date: string;
    account_id?: string | null;
    note?: string | null;
  }) => Promise<{ success: boolean; borrow?: Borrow; error?: string }>;

  updateBorrowWithTransactionOptimistic: (params: {
    borrowId: string;
    person_name: string;
    amount: number;
    type: BorrowType;
    date: string;
    account_id?: string | null;
    note?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;

  mergeBorrowsOptimistic: (
    personName: string,
    type: BorrowType
  ) => Promise<{ success: boolean; error?: string }>;

  netSettleBorrowsOptimistic: (
    personName: string
  ) => Promise<{ success: boolean; error?: string }>;

  addPaidByFriendExpenseOptimistic: (params: {
    user_id: string;
    amount: number;
    category: string;
    friend_name: string;
    date: string;
    account_id?: string | null;
    note?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;

  setBudgetOptimistic: (
    budgetData: Omit<Budget, 'id' | 'created_at' | 'updated_at'>
  ) => Promise<{ success: boolean; error?: string }>;

  deleteBudgetOptimistic: (
    budgetId: string,
    category?: string | null,
    month?: string,
    userId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  createAccountOptimistic: (
    accData: Omit<Account, 'id' | 'created_at' | 'updated_at'>
  ) => Promise<{ success: boolean; error?: string; account?: Account }>;

  updateAccountOptimistic: (
    accountId: string,
    updates: Partial<Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ) => Promise<{ success: boolean; error?: string }>;

  deleteAccountOptimistic: (
    accountId: string
  ) => Promise<{ success: boolean; error?: string }>;

  reorderAccounts: (
    newAccounts: Account[]
  ) => Promise<void>;

  // Credit Card Bill Payment
  payCreditCardBill: (
    creditCardId: string,
    fromAccountId: string,
    amount: number,
    userId: string,
    date?: string,
    note?: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Month lock & unlock state
  unlockedMonths: Record<string, number>;
  unlockMonth: (month: string, durationMinutes?: number) => void;
  lockMonth: (month: string) => void;
  isMonthLocked: (month: string) => boolean;
  getUnlockRemainingSeconds: (month: string) => number;
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  accounts: [],
  transactions: [],
  borrows: [],
  budgets: [],
  budgetSummaries: [],
  selectedMonth: getCurrentMonthString(), // 'YYYY-MM'
  categories: DEFAULT_STUDENT_CATEGORIES,
  currentUserId: null,
  isInitialLoading: true,
  inlineError: null,
  activeChannel: null,
  lastSyncedAt: null,
  syncStatus: 'idle',
  unlockedMonths: {},

  unlockMonth: (month: string, durationMinutes = 30) => {
    const expiry = Date.now() + durationMinutes * 60 * 1000;
    set((state) => ({
      unlockedMonths: {
        ...state.unlockedMonths,
        [month]: expiry,
      },
    }));
  },

  lockMonth: (month: string) => {
    set((state) => {
      const next = { ...state.unlockedMonths };
      delete next[month];
      return { unlockedMonths: next };
    });
  },

  isMonthLocked: (month: string) => {
    const currentMonth = getCurrentMonthString();
    if (month >= currentMonth) {
      return false; // Current and future months are never locked
    }
    const expiry = get().unlockedMonths[month];
    if (expiry && Date.now() < expiry) {
      return false; // Still within active unlocked window
    }
    return true; // Past month is locked
  },

  getUnlockRemainingSeconds: (month: string) => {
    const expiry = get().unlockedMonths[month];
    if (!expiry) return 0;
    const diff = Math.floor((expiry - Date.now()) / 1000);
    return Math.max(0, diff);
  },

  setInlineError: (error: string | null) => set({ inlineError: error }),

  setSelectedMonth: async (month: string, userId?: string) => {
    set({ selectedMonth: month });
    if (!userId) return;

    try {
      const [budgetsRes, summaryRes] = await Promise.all([
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('month', month),
        supabase
          .from('v_budget_summary')
          .select('*')
          .eq('user_id', userId)
          .eq('month', month),
      ]);

      let loadedBudgets = (budgetsRes.data as Budget[]) || [];
      let loadedSummaries = (summaryRes.data as BudgetSummary[]) || [];

      // Auto-carry budget limits into current/new month if empty
      if (loadedBudgets.length === 0 && month >= getCurrentMonthString()) {
        const [curY, curM] = month.split('-').map(Number);
        const prevMonthDate = new Date(curY, curM - 2, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const { data: prevBudgets } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('month', prevMonthStr);

        if (prevBudgets && prevBudgets.length > 0) {
          const toInsert = prevBudgets.map((pb) => ({
            user_id: userId,
            category: pb.category,
            monthly_limit: pb.monthly_limit,
            month: month,
          }));

          const { data: inserted, error: insErr } = await supabase
            .from('budgets')
            .insert(toInsert)
            .select();

          if (!insErr && inserted) {
            loadedBudgets = inserted as Budget[];
            const { data: refSummary } = await supabase
              .from('v_budget_summary')
              .select('*')
              .eq('user_id', userId)
              .eq('month', month);
            if (refSummary) {
              loadedSummaries = refSummary as BudgetSummary[];
            }
          }
        }
      }

      set({
        budgets: loadedBudgets,
        budgetSummaries: loadedSummaries,
      });
    } catch (err: any) {
      set({ inlineError: `Failed to load data for ${month}: ${err.message}` });
    }
  },

  loadCachedData: async (targetUserId?: string) => {
    try {
      const effectiveUserId = targetUserId || get().currentUserId;
      if (!effectiveUserId) {
        set({ isInitialLoading: false });
        return;
      }
      set({ currentUserId: effectiveUserId });

      const [cached, cachedCats, cachedOrder, cachedDeleted] = await Promise.all([
        AsyncStorage.getItem(getStorageKey(effectiveUserId)),
        AsyncStorage.getItem(getCategoriesKey(effectiveUserId)),
        AsyncStorage.getItem(getAccountOrderKey(effectiveUserId)),
        AsyncStorage.getItem(getDeletedCategoriesKey(effectiveUserId)),
      ]);

      let parsedCustomCats: string[] | null = null;
      if (cachedCats) {
        try {
          const parsedCats = JSON.parse(cachedCats);
          if (Array.isArray(parsedCats)) {
            parsedCustomCats = parsedCats;
          }
        } catch {}
      }

      let parsedDeletedCats: string[] = [];
      if (cachedDeleted) {
        try {
          const parsed = JSON.parse(cachedDeleted);
          if (Array.isArray(parsed)) {
            parsedDeletedCats = parsed;
          }
        } catch {}
      }

      let orderIds: string[] | null = null;
      if (cachedOrder) {
        try {
          orderIds = JSON.parse(cachedOrder);
        } catch {}
      }

      if (cached) {
        const parsed = JSON.parse(cached);

        const metaMap = await loadAllAccountMetadata(effectiveUserId);
        const rawAccounts = ((parsed.accounts || []) as Account[]).filter(
          (a) => a.user_id === effectiveUserId
        );
        const accountsWithMeta = rawAccounts.map((acc) => {
          const meta = metaMap[acc.id];
          if (!meta) return acc;
          return {
            ...acc,
            billing_cycle_day: acc.billing_cycle_day ?? meta.billing_cycle_day ?? null,
            payment_due_day: acc.payment_due_day ?? meta.payment_due_day ?? null,
            current_statement_billed_due: acc.current_statement_billed_due ?? meta.current_statement_billed_due ?? null,
            bank_preset: acc.bank_preset ?? meta.bank_preset ?? null,
            card_issuer: acc.card_issuer ?? meta.card_issuer ?? null,
            custom_icon: acc.custom_icon ?? meta.custom_icon ?? null,
            custom_color: acc.custom_color ?? meta.custom_color ?? null,
          };
        });
        const accounts = sortAccountsByOrder(deduplicateAccounts(accountsWithMeta), orderIds);

        const rawTransactions = deduplicateTransactions(
          ((parsed.transactions || []) as Transaction[]).filter(
            (t) => t.user_id === effectiveUserId
          )
        );
        const borrows = ((parsed.borrows || []) as Borrow[]).filter(
          (b) => b.user_id === effectiveUserId
        );
        const transactions = hydrateTransactions(rawTransactions, borrows);
        const budgets = ((parsed.budgets || []) as Budget[]).filter(
          (bg) => bg.user_id === effectiveUserId
        );

        const categories = mergeCategoriesWithDefaults(
          parsedCustomCats,
          rawTransactions,
          budgets,
          parsedCustomCats ? null : get().categories,
          parsedDeletedCats
        );

        set({
          accounts,
          transactions,
          borrows,
          budgets,
          budgetSummaries: parsed.budgetSummaries || [],
          categories,
          selectedMonth: getCurrentMonthString(),
          isInitialLoading: false,
        });

        AsyncStorage.setItem(
          getCategoriesKey(effectiveUserId),
          JSON.stringify(categories)
        ).catch(() => {});
      } else {
        const categories = mergeCategoriesWithDefaults(
          parsedCustomCats,
          [],
          [],
          parsedCustomCats ? null : get().categories,
          parsedDeletedCats
        );

        set({
          accounts: [],
          transactions: [],
          borrows: [],
          budgets: [],
          budgetSummaries: [],
          categories,
          selectedMonth: getCurrentMonthString(),
          isInitialLoading: false,
        });

        AsyncStorage.setItem(
          getCategoriesKey(effectiveUserId),
          JSON.stringify(categories)
        ).catch(() => {});
      }
    } catch {
      set({ isInitialLoading: false });
    }
  },

  addCategory: (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    const current = get().categories;
    if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...current, trimmed];
    set({ categories: updated });
    const userId = get().currentUserId;
    AsyncStorage.setItem(getCategoriesKey(userId), JSON.stringify(updated)).catch(() => {});
    // Unmark from deleted categories blacklist if previously deleted
    AsyncStorage.getItem(getDeletedCategoriesKey(userId)).then((stored) => {
      if (stored) {
        try {
          const list: string[] = JSON.parse(stored);
          const filtered = list.filter((c) => c.toLowerCase() !== trimmed.toLowerCase());
          AsyncStorage.setItem(getDeletedCategoriesKey(userId), JSON.stringify(filtered)).catch(() => {});
        } catch {}
      }
    }).catch(() => {});
  },

  updateCategory: (oldCategory: string, newCategory: string) => {
    const trimmed = newCategory.trim();
    if (!trimmed || trimmed === oldCategory) return;
    const current = get().categories;
    const updated = current.map((c) => (c === oldCategory ? trimmed : c));
    set({ categories: updated });
    AsyncStorage.setItem(getCategoriesKey(get().currentUserId), JSON.stringify(updated)).catch(() => {});
  },

  reorderCategories: (categories: string[]) => {
    set({ categories });
    AsyncStorage.setItem(getCategoriesKey(get().currentUserId), JSON.stringify(categories)).catch(() => {});
  },

  removeCategory: (category: string) => {
    const cleanTarget = category.trim();
    const updated = get().categories.filter((c) => c.toLowerCase() !== cleanTarget.toLowerCase());
    set({ categories: updated });
    const userId = get().currentUserId;
    AsyncStorage.setItem(getCategoriesKey(userId), JSON.stringify(updated)).catch(() => {});
    // Persist to deleted categories blacklist to permanently prevent resurrection on next open
    AsyncStorage.getItem(getDeletedCategoriesKey(userId)).then((stored) => {
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.some((c) => c.toLowerCase() === cleanTarget.toLowerCase())) {
        list.push(cleanTarget.toLowerCase());
        AsyncStorage.setItem(getDeletedCategoriesKey(userId), JSON.stringify(list)).catch(() => {});
      }
    }).catch(() => {});
  },

  fetchInitialData: async (userId: string) => {
    const month = getCurrentMonthString();
    set({ currentUserId: userId, selectedMonth: month });
    if (isGuestUser(userId)) {
      await get().loadCachedData(userId);
      set({ isInitialLoading: false, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() });
      return;
    }

    try {

      const [accountsRes, txRes, borrowsRes, budgetsRes, summaryRes, cachedOrder, cachedCats, cachedDeleted] = await Promise.all([
        supabase
          .from('accounts')
          .select('*')
          .eq('user_id', userId)
          .order('name', { ascending: true }),
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('borrows')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false }),
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('month', month),
        supabase
          .from('v_budget_summary')
          .select('*')
          .eq('user_id', userId)
          .eq('month', month),
        AsyncStorage.getItem(getAccountOrderKey(userId)),
        AsyncStorage.getItem(getCategoriesKey(userId)),
        AsyncStorage.getItem(getDeletedCategoriesKey(userId)),
      ]);

      let orderIds: string[] | null = null;
      if (cachedOrder) {
        try {
          orderIds = JSON.parse(cachedOrder);
        } catch {}
      }

      let parsedCustomCats: string[] | null = null;
      if (cachedCats) {
        try {
          const parsed = JSON.parse(cachedCats);
          if (Array.isArray(parsed)) {
            parsedCustomCats = parsed;
          }
        } catch {}
      }

      let parsedDeletedCats: string[] = [];
      if (cachedDeleted) {
        try {
          const parsed = JSON.parse(cachedDeleted);
          if (Array.isArray(parsed)) {
            parsedDeletedCats = parsed;
          }
        } catch {}
      }

      const metaMap = await loadAllAccountMetadata(userId);
      const rawAccounts = (accountsRes.data as Account[]) || [];
      const accountsWithMeta = rawAccounts.map((acc) => {
        const meta = metaMap[acc.id];
        if (!meta) return acc;
        return {
          ...acc,
          billing_cycle_day: acc.billing_cycle_day ?? meta.billing_cycle_day ?? null,
          payment_due_day: acc.payment_due_day ?? meta.payment_due_day ?? null,
          current_statement_billed_due: acc.current_statement_billed_due ?? meta.current_statement_billed_due ?? null,
          bank_preset: acc.bank_preset ?? meta.bank_preset ?? null,
          card_issuer: acc.card_issuer ?? meta.card_issuer ?? null,
          custom_icon: acc.custom_icon ?? meta.custom_icon ?? null,
          custom_color: acc.custom_color ?? meta.custom_color ?? null,
        };
      });
      const accounts = sortAccountsByOrder(deduplicateAccounts(accountsWithMeta), orderIds);
      const rawTransactions = deduplicateTransactions((txRes.data as Transaction[]) || []);
      const borrows = (borrowsRes.data as Borrow[]) || [];
      const transactions = hydrateTransactions(rawTransactions, borrows);
      let budgets = (budgetsRes.data as Budget[]) || [];
      let budgetSummaries = (summaryRes.data as BudgetSummary[]) || [];

      // Auto-carry budget limits if current month budgets are empty
      if (budgets.length === 0 && month >= getCurrentMonthString()) {
        const [curY, curM] = month.split('-').map(Number);
        const prevMonthDate = new Date(curY, curM - 2, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

        const { data: prevBudgets } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('month', prevMonthStr);

        if (prevBudgets && prevBudgets.length > 0) {
          const toInsert = prevBudgets.map((pb) => ({
            user_id: userId,
            category: pb.category,
            monthly_limit: pb.monthly_limit,
            month: month,
          }));

          const { data: inserted, error: insErr } = await supabase
            .from('budgets')
            .insert(toInsert)
            .select();

          if (!insErr && inserted) {
            budgets = inserted as Budget[];
            const { data: refSummary } = await supabase
              .from('v_budget_summary')
              .select('*')
              .eq('user_id', userId)
              .eq('month', month);
            if (refSummary) {
              budgetSummaries = refSummary as BudgetSummary[];
            }
          }
        }
      }

      const categories = mergeCategoriesWithDefaults(
        parsedCustomCats,
        rawTransactions,
        budgets,
        parsedCustomCats ? null : get().categories,
        parsedDeletedCats
      );

      set({
        accounts,
        transactions,
        borrows,
        budgets,
        budgetSummaries,
        categories,
        isInitialLoading: false,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      });

      AsyncStorage.setItem(
        getCategoriesKey(userId),
        JSON.stringify(categories)
      ).catch(() => {});

      AsyncStorage.setItem(
        getStorageKey(userId),
        JSON.stringify({ accounts, transactions, borrows, budgets, budgetSummaries })
      ).catch(() => {});
    } catch (err: any) {
      set({
        isInitialLoading: false,
        syncStatus: 'error',
        inlineError: `Network error loading data: ${err.message || 'Check connection'}`,
      });
    }
  },

  subscribeRealtime: (userId: string) => {
    if (isGuestUser(userId)) return;
    try {
      supabase.removeAllChannels();
    } catch {}

    const channel = supabase
      .channel(`realtime_finance_${userId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const current = get().accounts;
          if (payload.eventType === 'INSERT') {
            const newAcc = payload.new as Account;
            if (current.some((a) => a.id === newAcc.id)) return;

            // Check if there is an optimistic temp account matching name and type
            const tempMatch = current.find(
              (a) => a.id.startsWith('temp_acc_') && a.name === newAcc.name && a.type === newAcc.type
            );
            if (tempMatch) {
              set({
                accounts: deduplicateAccounts(
                  current.map((a) =>
                    a.id === tempMatch.id
                      ? {
                          ...tempMatch,
                          ...newAcc,
                          billing_cycle_day: tempMatch.billing_cycle_day ?? newAcc.billing_cycle_day ?? null,
                          payment_due_day: tempMatch.payment_due_day ?? newAcc.payment_due_day ?? null,
                          current_statement_billed_due:
                            tempMatch.current_statement_billed_due ?? newAcc.current_statement_billed_due ?? null,
                          bank_preset: tempMatch.bank_preset ?? newAcc.bank_preset ?? null,
                          card_issuer: tempMatch.card_issuer ?? newAcc.card_issuer ?? null,
                          custom_icon: tempMatch.custom_icon ?? newAcc.custom_icon ?? null,
                          custom_color: tempMatch.custom_color ?? newAcc.custom_color ?? null,
                        }
                      : a
                  )
                ),
              });
              persistFinanceCache(get());
            } else {
              set({ accounts: deduplicateAccounts([...current, newAcc]) });
              persistFinanceCache(get());
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedAcc = payload.new as Account;
            const meta = inMemoryAccountMetadata[updatedAcc.id] || {};
            set((state) => {
              const existingAcc = state.accounts.find((a) => a.id === updatedAcc.id);
              return {
                accounts: deduplicateAccounts(
                  state.accounts.map((a) => {
                    if (a.id !== updatedAcc.id) return a;
                    // ALWAYS preserve existing in-memory metadata not stored in the DB columns
                    return {
                      ...a,
                      ...updatedAcc,
                      billing_cycle_day:
                        existingAcc?.billing_cycle_day ??
                        a.billing_cycle_day ??
                        meta.billing_cycle_day ??
                        updatedAcc.billing_cycle_day ??
                        null,
                      payment_due_day:
                        existingAcc?.payment_due_day ??
                        a.payment_due_day ??
                        meta.payment_due_day ??
                        updatedAcc.payment_due_day ??
                        null,
                      current_statement_billed_due:
                        existingAcc?.current_statement_billed_due ??
                        a.current_statement_billed_due ??
                        meta.current_statement_billed_due ??
                        updatedAcc.current_statement_billed_due ??
                        null,
                      bank_preset:
                        existingAcc?.bank_preset ??
                        a.bank_preset ??
                        meta.bank_preset ??
                        updatedAcc.bank_preset ??
                        null,
                      card_issuer:
                        existingAcc?.card_issuer ??
                        a.card_issuer ??
                        meta.card_issuer ??
                        updatedAcc.card_issuer ??
                        null,
                      custom_icon:
                        existingAcc?.custom_icon ??
                        a.custom_icon ??
                        meta.custom_icon ??
                        updatedAcc.custom_icon ??
                        null,
                      custom_color:
                        existingAcc?.custom_color ??
                        a.custom_color ??
                        meta.custom_color ??
                        updatedAcc.custom_color ??
                        null,
                    };
                  })
                ),
              };
            });
            persistFinanceCache(get());

            // Guarantee fresh metadata sync from storage as backup
            loadAllAccountMetadata(userId).then((freshMeta) => {
              const freshAccMeta = freshMeta[updatedAcc.id];
              if (freshAccMeta) {
                set((state) => ({
                  accounts: state.accounts.map((a) =>
                    a.id === updatedAcc.id
                      ? {
                          ...a,
                          billing_cycle_day: a.billing_cycle_day ?? freshAccMeta.billing_cycle_day ?? null,
                          payment_due_day: a.payment_due_day ?? freshAccMeta.payment_due_day ?? null,
                          current_statement_billed_due:
                            a.current_statement_billed_due ?? freshAccMeta.current_statement_billed_due ?? null,
                          bank_preset: a.bank_preset ?? freshAccMeta.bank_preset ?? null,
                          card_issuer: a.card_issuer ?? freshAccMeta.card_issuer ?? null,
                          custom_icon: a.custom_icon ?? freshAccMeta.custom_icon ?? null,
                          custom_color: a.custom_color ?? freshAccMeta.custom_color ?? null,
                        }
                      : a
                  ),
                }));
              }
            }).catch(() => {});
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old.id;
            set({ accounts: current.filter((a) => a.id !== oldId) });
            persistFinanceCache(get());
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const current = get().transactions;
          if (payload.eventType === 'INSERT') {
            const newTx = payload.new as Transaction;
            const exists = current.some((t) => t.id === newTx.id);
            if (!exists) {
              const tempMatch = current.find(
                (t) =>
                  t.id.startsWith('temp_') &&
                  Number(t.amount) === Number(newTx.amount) &&
                  t.account_id === newTx.account_id &&
                  t.type === newTx.type &&
                  t.category === newTx.category
              );
              if (tempMatch) {
                set({
                  transactions: deduplicateTransactions(
                    current.map((t) => (t.id === tempMatch.id ? newTx : t))
                  ),
                });
              } else {
                set({ transactions: deduplicateTransactions([newTx, ...current]) });
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedTx = payload.new as Transaction;
            set({
              transactions: current.map((t) => (t.id === updatedTx.id ? updatedTx : t)),
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old.id;
            set({ transactions: current.filter((t) => t.id !== oldId) });
          }

          const month = get().selectedMonth;
          const { data } = await supabase
            .from('v_budget_summary')
            .select('*')
            .eq('user_id', userId)
            .eq('month', month);
          if (data) {
            set({ budgetSummaries: data as BudgetSummary[] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'borrows', filter: `user_id=eq.${userId}` },
        (payload) => {
          const current = get().borrows;
          if (payload.eventType === 'INSERT') {
            const newBorrow = payload.new as Borrow;
            if (!current.some((b) => b.id === newBorrow.id)) {
              set({ borrows: [newBorrow, ...current] });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Borrow;
            set({
              borrows: current.map((b) => (b.id === updated.id ? updated : b)),
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old.id;
            set({ borrows: current.filter((b) => b.id !== oldId) });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const current = get().budgets;
          if (payload.eventType === 'INSERT') {
            set({ budgets: [...current, payload.new as Budget] });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Budget;
            set({ budgets: current.map((b) => (b.id === updated.id ? updated : b)) });
          } else if (payload.eventType === 'DELETE') {
            set({ budgets: current.filter((b) => b.id !== payload.old.id) });
          }

          const month = get().selectedMonth;
          const { data } = await supabase
            .from('v_budget_summary')
            .select('*')
            .eq('user_id', userId)
            .eq('month', month);
          if (data) {
            set({ budgetSummaries: data as BudgetSummary[] });
          }
        }
      )
      .subscribe();

    set({ activeChannel: channel });
  },

  unsubscribeRealtime: () => {
    try {
      supabase.removeAllChannels();
    } catch {}
    set({ activeChannel: null });
  },

  addTransactionOptimistic: async (txData) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const optimisticTx: Transaction = {
      ...txData,
      id: tempId,
      created_at: new Date().toISOString(),
    };

    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];
    const prevSummaries = [...get().budgetSummaries];

    const updatedAccounts = prevAccounts.map((acc) => {
      const meta = inMemoryAccountMetadata[acc.id];
      if (acc.id === txData.account_id) {
        let delta = 0;
        if (txData.type === 'income' || txData.type === 'borrow_taken') {
          delta = Number(txData.amount);
        } else if (txData.type === 'expense' || txData.type === 'borrow_given') {
          delta = -Number(txData.amount);
        }
        let nextBilled = acc.current_statement_billed_due ?? meta?.current_statement_billed_due ?? null;
        if (
          acc.type === 'credit_card' &&
          (txData.type === 'income' || txData.type === 'borrow_taken') &&
          nextBilled != null
        ) {
          nextBilled = Math.max(0, Number(nextBilled) - Number(txData.amount));
          saveAccountMetadata(acc.user_id, acc.id, { current_statement_billed_due: nextBilled });
        }
        return {
          ...acc,
          billing_cycle_day: acc.billing_cycle_day ?? meta?.billing_cycle_day ?? null,
          payment_due_day: acc.payment_due_day ?? meta?.payment_due_day ?? null,
          bank_preset: acc.bank_preset ?? meta?.bank_preset ?? null,
          card_issuer: acc.card_issuer ?? meta?.card_issuer ?? null,
          custom_icon: acc.custom_icon ?? meta?.custom_icon ?? null,
          custom_color: acc.custom_color ?? meta?.custom_color ?? null,
          current_balance: Number(acc.current_balance) + delta,
          current_statement_billed_due: nextBilled,
        };
      }
      if (meta) {
        return {
          ...acc,
          billing_cycle_day: acc.billing_cycle_day ?? meta.billing_cycle_day ?? null,
          payment_due_day: acc.payment_due_day ?? meta.payment_due_day ?? null,
          current_statement_billed_due: acc.current_statement_billed_due ?? meta.current_statement_billed_due ?? null,
          bank_preset: acc.bank_preset ?? meta.bank_preset ?? null,
          card_issuer: acc.card_issuer ?? meta.card_issuer ?? null,
          custom_icon: acc.custom_icon ?? meta.custom_icon ?? null,
          custom_color: acc.custom_color ?? meta.custom_color ?? null,
        };
      }
      return acc;
    });

    const updatedSummaries = prevSummaries.map((bs) => {
      if (txData.type === 'expense') {
        const matchesCategory = bs.category === txData.category || bs.category === null;
        if (matchesCategory) {
          const newSpent = Number(bs.spent) + Number(txData.amount);
          const newRemaining = Number(bs.monthly_limit) - newSpent;
          const newPct =
            bs.monthly_limit > 0 ? Math.round((newSpent / Number(bs.monthly_limit)) * 100) : 0;
          return {
            ...bs,
            spent: newSpent,
            remaining: newRemaining,
            spent_percentage: newPct,
          };
        }
      }
      return bs;
    });

    set({
      transactions: [optimisticTx, ...prevTransactions],
      accounts: updatedAccounts,
      budgetSummaries: updatedSummaries,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (txData.type === 'expense' && txData.category) {
      const cleanCat = txData.category.trim();
      if (
        cleanCat &&
        cleanCat !== 'Credit Card Payment' &&
        cleanCat.toLowerCase() !== 'uncategorized'
      ) {
        const currentCats = get().categories;
        if (!currentCats.some((c) => c.toLowerCase() === cleanCat.toLowerCase())) {
          get().addCategory(cleanCat);
        }
      }
    }

    if (isGuestUser(txData.user_id)) {
      return { success: true };
    }

    try {
      let insertSource = txData.source;
      let { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: txData.user_id,
          account_id: txData.account_id,
          type: txData.type,
          amount: txData.amount,
          category: txData.category,
          note: txData.note,
          date: txData.date,
          source: insertSource,
        })
        .select()
        .single();

      // Graceful fallback: If Supabase schema has check constraint restricting source to ('manual', 'screenshot'),
      // automatically retry with 'manual' so transaction creation is NEVER blocked for the user
      if (error && (error.message?.includes('transactions_source_check') || error.code === '23514')) {
        const fallbackSource: TransactionSource = insertSource === 'screenshot' ? 'screenshot' : 'manual';
        const retryResult = await supabase
          .from('transactions')
          .insert({
            user_id: txData.user_id,
            account_id: txData.account_id,
            type: txData.type,
            amount: txData.amount,
            category: txData.category,
            note: txData.note,
            date: txData.date,
            source: fallbackSource,
          })
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;

      const realTx = data as Transaction;
      set((state) => {
        const alreadyHasReal = state.transactions.some((t) => t.id === realTx.id);
        if (alreadyHasReal) {
          return {
            transactions: state.transactions.filter((t) => t.id !== tempId),
          };
        }
        return {
          transactions: deduplicateTransactions(
            state.transactions.map((t) => (t.id === tempId ? realTx : t))
          ),
        };
      });

      return { success: true };
    } catch (err: any) {
      set({
        transactions: prevTransactions,
        accounts: prevAccounts,
        budgetSummaries: prevSummaries,
        inlineError: `Could not save transaction: ${err.message || 'Network error'}. Changes rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  updateTransactionOptimistic: async (transactionId, updates) => {
    const prevTransactions = [...get().transactions];
    const oldTx = prevTransactions.find((t) => t.id === transactionId);
    if (!oldTx) return { success: false, error: 'Transaction not found' };

    const newTx: Transaction = {
      ...oldTx,
      ...updates,
    };

    const prevAccounts = [...get().accounts];
    const prevSummaries = [...get().budgetSummaries];

    // Recompute account balances
    const updatedAccounts = prevAccounts.map((acc) => {
      let balance = Number(acc.current_balance);

      if (acc.id === oldTx.account_id) {
        if (oldTx.type === 'income' || oldTx.type === 'borrow_taken') {
          balance -= Number(oldTx.amount);
        } else if (oldTx.type === 'expense' || oldTx.type === 'borrow_given') {
          balance += Number(oldTx.amount);
        }
      }

      if (acc.id === newTx.account_id) {
        if (newTx.type === 'income' || newTx.type === 'borrow_taken') {
          balance += Number(newTx.amount);
        } else if (newTx.type === 'expense' || newTx.type === 'borrow_given') {
          balance -= Number(newTx.amount);
        }
      }

      return {
        ...acc,
        current_balance: balance,
      };
    });

    // Recompute budget summaries
    const updatedSummaries = prevSummaries.map((bs) => {
      let spent = Number(bs.spent);

      if (oldTx.type === 'expense' && (bs.category === oldTx.category || bs.category === null)) {
        spent -= Number(oldTx.amount);
      }
      if (newTx.type === 'expense' && (bs.category === newTx.category || bs.category === null)) {
        spent += Number(newTx.amount);
      }

      spent = Math.max(0, spent);
      const newRemaining = Number(bs.monthly_limit) - spent;
      const newPct =
        bs.monthly_limit > 0 ? Math.round((spent / Number(bs.monthly_limit)) * 100) : 0;

      return {
        ...bs,
        spent,
        remaining: newRemaining,
        spent_percentage: newPct,
      };
    });

    const prevBorrows = [...get().borrows];
    const linkedBorrow = prevBorrows.find((b) => b.linked_transaction_id === transactionId);
    let updatedBorrows = prevBorrows;
    if (linkedBorrow) {
      updatedBorrows = prevBorrows.map((b) => {
        if (b.linked_transaction_id === transactionId) {
          return {
            ...b,
            amount: updates.amount !== undefined ? Number(updates.amount) : b.amount,
            date: updates.date || b.date,
            updated_at: new Date().toISOString(),
          };
        }
        return b;
      });
    }

    set({
      transactions: prevTransactions.map((t) => (t.id === transactionId ? newTx : t)),
      accounts: updatedAccounts,
      budgetSummaries: updatedSummaries,
      borrows: updatedBorrows,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(oldTx.user_id)) {
      return { success: true };
    }

    try {
      const validTxDbFields = ['account_id', 'type', 'amount', 'category', 'note', 'date', 'source'];
      const dbUpdates: Record<string, any> = {};
      for (const field of validTxDbFields) {
        if (field in updates) {
          dbUpdates[field] = (updates as any)[field];
        }
      }

      let { data, error } = await supabase
        .from('transactions')
        .update(dbUpdates)
        .eq('id', transactionId)
        .select()
        .single();

      if (error && (error.message?.includes('transactions_source_check') || error.code === '23514') && dbUpdates.source) {
        dbUpdates.source = dbUpdates.source === 'screenshot' ? 'screenshot' : 'manual';
        const retryResult = await supabase
          .from('transactions')
          .update(dbUpdates)
          .eq('id', transactionId)
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) throw error;

      if (linkedBorrow && (updates.amount !== undefined || updates.date)) {
        const borrowDbUpdates: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.amount !== undefined) borrowDbUpdates.amount = Number(updates.amount);
        if (updates.date) borrowDbUpdates.date = updates.date;
        await supabase
          .from('borrows')
          .update(borrowDbUpdates)
          .eq('linked_transaction_id', transactionId);
      }

      if (data) {
        const returnedTx: Transaction = {
          ...(data as Transaction),
          paid_by_friend: newTx.paid_by_friend,
          friend_name: newTx.friend_name,
        };
        set((state) => ({
          transactions: state.transactions.map((t) => (t.id === transactionId ? returnedTx : t)),
        }));
        persistFinanceCache(get());
      }
      return { success: true };
    } catch (err: any) {
      set({
        transactions: prevTransactions,
        accounts: prevAccounts,
        budgetSummaries: prevSummaries,
        borrows: prevBorrows,
        inlineError: `Could not update transaction: ${err.message || 'Network error'}. Changes rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  deleteTransactionOptimistic: async (transactionId) => {
    const prevTransactions = [...get().transactions];
    const targetTx = prevTransactions.find((t) => t.id === transactionId);
    if (!targetTx) return { success: false, error: 'Transaction not found' };

    const prevAccounts = [...get().accounts];
    const prevSummaries = [...get().budgetSummaries];
    const prevBorrows = [...get().borrows];

    const isFriendPaidTx =
      Boolean(targetTx.paid_by_friend) ||
      Boolean(targetTx.note?.startsWith('[Paid by ')) ||
      prevBorrows.some(
        (b) =>
          b.linked_transaction_id === transactionId &&
          (b.type === 'borrowed' || b.person_name?.startsWith('[BORROWED]'))
      );
    const isBorrowTx =
      targetTx.type === 'borrow_given' ||
      targetTx.type === 'borrow_taken' ||
      prevBorrows.some((b) => b.linked_transaction_id === transactionId);

    // Revert account balance effect (only for transactions that actually altered account balances)
    const updatedAccounts = isFriendPaidTx
      ? prevAccounts
      : prevAccounts.map((acc) => {
          if (acc.id === targetTx.account_id) {
            let delta = 0;
            if (targetTx.type === 'income' || targetTx.type === 'borrow_taken') {
              delta = -Number(targetTx.amount);
            } else if (targetTx.type === 'expense' || targetTx.type === 'borrow_given') {
              delta = Number(targetTx.amount);
            }
            return {
              ...acc,
              current_balance: Number(acc.current_balance) + delta,
            };
          }
          return acc;
        });

    // Revert budget spent effect if expense
    const updatedSummaries = prevSummaries.map((bs) => {
      if (targetTx.type === 'expense') {
        const matchesCategory = bs.category === targetTx.category || bs.category === null;
        if (matchesCategory) {
          const newSpent = Math.max(0, Number(bs.spent) - Number(targetTx.amount));
          const newRemaining = Number(bs.monthly_limit) - newSpent;
          const newPct =
            bs.monthly_limit > 0 ? Math.round((newSpent / Number(bs.monthly_limit)) * 100) : 0;
          return {
            ...bs,
            spent: newSpent,
            remaining: newRemaining,
            spent_percentage: newPct,
          };
        }
      }
      return bs;
    });

    const updatedBorrows = (isFriendPaidTx || isBorrowTx)
      ? prevBorrows.filter((b) => b.linked_transaction_id !== transactionId)
      : prevBorrows.map((b) =>
          b.linked_transaction_id === transactionId ? { ...b, linked_transaction_id: null } : b
        );

    set({
      transactions: prevTransactions.filter((t) => t.id !== transactionId),
      accounts: updatedAccounts,
      budgetSummaries: updatedSummaries,
      borrows: updatedBorrows,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetTx.user_id)) {
      return { success: true };
    }

    try {
      if (isFriendPaidTx || isBorrowTx) {
        await supabase.from('borrows').delete().eq('linked_transaction_id', transactionId);
      }
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        transactions: prevTransactions,
        accounts: prevAccounts,
        budgetSummaries: prevSummaries,
        borrows: prevBorrows,
        inlineError: `Could not delete transaction: ${err.message || 'Network error'}. Changes rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  toggleSettleBorrowOptimistic: async (borrowId: string) => {
    const prevBorrows = [...get().borrows];
    const targetBorrow = prevBorrows.find((b) => b.id === borrowId);
    if (!targetBorrow) return { success: false, error: 'Borrow entry not found' };

    const newStatus = targetBorrow.status === 'pending' ? 'settled' : 'pending';

    set({
      borrows: prevBorrows.map((b) => (b.id === borrowId ? { ...b, status: newStatus } : b)),
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetBorrow.user_id)) {
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('borrows')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', borrowId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        inlineError: `Failed to update borrow: ${err.message || 'Network error'}. Reverted.`,
      });
      return { success: false, error: err.message };
    }
  },

  addBorrowOptimistic: async (borrowData) => {
    const tempId = `temp_borrow_${Date.now()}`;
    const cleanName = borrowData.person_name.replace(/^\[(BORROWED|LENT)\]\s*/i, '').trim();
    const isBorrowed =
      borrowData.type === 'borrowed' ||
      borrowData.person_name.startsWith('[BORROWED]');
    const encodedPersonName = isBorrowed ? `[BORROWED] ${cleanName}` : `[LENT] ${cleanName}`;

    const optimisticBorrow: Borrow = {
      ...borrowData,
      person_name: encodedPersonName,
      type: isBorrowed ? 'borrowed' : 'lent',
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const prevBorrows = [...get().borrows];
    set({
      borrows: [optimisticBorrow, ...prevBorrows],
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(borrowData.user_id)) {
      return { success: true };
    }

    try {
      const { data, error } = await supabase
        .from('borrows')
        .insert({
          user_id: borrowData.user_id,
          person_name: encodedPersonName,
          amount: borrowData.amount,
          status: borrowData.status,
          linked_transaction_id: borrowData.linked_transaction_id,
          date: borrowData.date,
        })
        .select()
        .single();

      if (error) throw error;

      const savedBorrow = {
        ...(data as Borrow),
        type: isBorrowed ? ('borrowed' as const) : ('lent' as const),
      };

      set((state) => ({
        borrows: state.borrows.map((b) => (b.id === tempId ? savedBorrow : b)),
      }));

      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        inlineError: `Could not add borrow: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  settleBorrowWithTransactionOptimistic: async (params) => {
    if (inProgressSettleBorrowIds.has(params.borrowId)) {
      return { success: true };
    }
    inProgressSettleBorrowIds.add(params.borrowId);

    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];

    const targetBorrow = prevBorrows.find((b) => b.id === params.borrowId);
    if (!targetBorrow) {
      inProgressSettleBorrowIds.delete(params.borrowId);
      return { success: false, error: 'Borrow entry not found' };
    }

    if (targetBorrow.status === 'settled') {
      inProgressSettleBorrowIds.delete(params.borrowId);
      return { success: true };
    }

    const { type, displayName } = parseBorrowDetails(targetBorrow, prevTransactions);
    const settleDate = params.date || new Date().toISOString().substring(0, 10);

    let optimisticTx: Transaction | null = null;
    let tempTxId: string | null = null;
    let updatedAccounts = prevAccounts;

    if (params.depositAccountId) {
      tempTxId = `temp_settle_tx_${Date.now()}`;
      // If Lent: money was returned to me -> income (credit to account)
      // If Borrowed: I repaid the debt -> expense (debit from account)
      const txType: TransactionType = type === 'lent' ? 'income' : 'expense';
      const txCategory = 'Repayment';
      const txNote =
        params.note?.trim() ||
        (type === 'lent'
          ? `Repayment received from ${displayName}`
          : `Repayment paid to ${displayName}`);

      optimisticTx = {
        id: tempTxId,
        user_id: targetBorrow.user_id,
        account_id: params.depositAccountId,
        type: txType,
        amount: targetBorrow.amount,
        category: txCategory,
        note: txNote,
        date: settleDate,
        source: 'manual',
        created_at: new Date().toISOString(),
      };

      updatedAccounts = prevAccounts.map((acc) => {
        if (acc.id === params.depositAccountId) {
          const delta = txType === 'income' ? targetBorrow.amount : -targetBorrow.amount;
          return {
            ...acc,
            current_balance: Number(acc.current_balance) + delta,
          };
        }
        return acc;
      });
    }

    const updatedBorrows = prevBorrows.map((b) =>
      b.id === params.borrowId
        ? { ...b, status: 'settled' as BorrowStatus, updated_at: new Date().toISOString() }
        : b
    );

    set({
      borrows: updatedBorrows,
      transactions: optimisticTx ? [optimisticTx, ...prevTransactions] : prevTransactions,
      accounts: updatedAccounts,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetBorrow.user_id)) {
      inProgressSettleBorrowIds.delete(params.borrowId);
      return { success: true };
    }

    try {
      let realTx: Transaction | null = null;
      if (params.depositAccountId && optimisticTx) {
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: targetBorrow.user_id,
            account_id: params.depositAccountId,
            type: optimisticTx.type,
            amount: optimisticTx.amount,
            category: optimisticTx.category,
            note: optimisticTx.note,
            date: optimisticTx.date,
            source: 'manual',
          })
          .select()
          .single();

        if (txError) throw txError;
        realTx = txData as Transaction;
      }

      const { error: borrowError } = await supabase
        .from('borrows')
        .update({
          status: 'settled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.borrowId);

      if (borrowError) throw borrowError;

      if (realTx && tempTxId) {
        set((state) => {
          const alreadyHasReal = state.transactions.some((t) => t.id === realTx!.id);
          if (alreadyHasReal) {
            return {
              transactions: state.transactions.filter((t) => t.id !== tempTxId),
            };
          }
          return {
            transactions: deduplicateTransactions(
              state.transactions.map((t) => (t.id === tempTxId ? realTx! : t))
            ),
          };
        });
      }

      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        transactions: prevTransactions,
        accounts: prevAccounts,
        inlineError: `Failed to settle borrow: ${err.message || 'Network error'}. Reverted.`,
      });
      return { success: false, error: err.message };
    } finally {
      inProgressSettleBorrowIds.delete(params.borrowId);
    }
  },

  updateBorrowWithTransactionOptimistic: async (params) => {
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];

    const targetBorrow = prevBorrows.find((b) => b.id === params.borrowId);
    if (!targetBorrow) return { success: false, error: 'Borrow entry not found' };

    const cleanName = params.person_name.replace(/^\[(BORROWED|LENT)\]\s*/i, '').trim();
    const encodedPersonName =
      params.type === 'borrowed' ? `[BORROWED] ${cleanName}` : `[LENT] ${cleanName}`;

    const numAmount = Number(params.amount);
    const nowIso = new Date().toISOString();

    const updatedBorrow: Borrow = {
      ...targetBorrow,
      person_name: encodedPersonName,
      amount: numAmount,
      type: params.type,
      date: params.date,
      updated_at: nowIso,
    };

    let updatedTransactions = prevTransactions;
    let updatedAccounts = prevAccounts;
    const linkedTx = targetBorrow.linked_transaction_id
      ? prevTransactions.find((t) => t.id === targetBorrow.linked_transaction_id)
      : null;

    if (linkedTx) {
      const newTxType: TransactionType = params.type === 'borrowed' ? 'borrow_taken' : 'borrow_given';
      const targetAccountId = params.account_id !== undefined ? params.account_id : linkedTx.account_id;
      const txNote =
        params.note !== undefined
          ? params.note?.trim() || null
          : params.type === 'borrowed'
          ? `Borrowed from ${cleanName}`
          : `Lent to ${cleanName}`;

      const updatedTx: Transaction = {
        ...linkedTx,
        amount: numAmount,
        date: params.date,
        type: newTxType,
        account_id: targetAccountId || null,
        note: txNote,
      };

      updatedTransactions = prevTransactions.map((t) => (t.id === linkedTx.id ? updatedTx : t));

      // Recompute account balances
      updatedAccounts = prevAccounts.map((acc) => {
        let bal = Number(acc.current_balance);
        if (acc.id === linkedTx.account_id) {
          const oldDelta = linkedTx.type === 'borrow_taken' ? Number(linkedTx.amount) : -Number(linkedTx.amount);
          bal -= oldDelta;
        }
        if (acc.id === targetAccountId) {
          const newDelta = newTxType === 'borrow_taken' ? numAmount : -numAmount;
          bal += newDelta;
        }
        return { ...acc, current_balance: bal };
      });
    }

    set({
      borrows: prevBorrows.map((b) => (b.id === params.borrowId ? updatedBorrow : b)),
      transactions: updatedTransactions,
      accounts: updatedAccounts,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetBorrow.user_id)) {
      return { success: true };
    }

    try {
      const { error: bErr } = await supabase
        .from('borrows')
        .update({
          person_name: encodedPersonName,
          amount: numAmount,
          date: params.date,
          updated_at: nowIso,
        })
        .eq('id', params.borrowId);
      if (bErr) throw bErr;

      if (linkedTx) {
        const newTxType: TransactionType = params.type === 'borrowed' ? 'borrow_taken' : 'borrow_given';
        const targetAccountId = params.account_id !== undefined ? params.account_id : linkedTx.account_id;
        const txNote =
          params.note !== undefined
            ? params.note?.trim() || null
            : params.type === 'borrowed'
            ? `Borrowed from ${cleanName}`
            : `Lent to ${cleanName}`;

        const { error: tErr } = await supabase
          .from('transactions')
          .update({
            amount: numAmount,
            date: params.date,
            type: newTxType,
            account_id: targetAccountId || null,
            note: txNote,
          })
          .eq('id', linkedTx.id);
        if (tErr) throw tErr;
      }

      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        transactions: prevTransactions,
        accounts: prevAccounts,
        inlineError: `Could not update borrow: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  mergeBorrowsOptimistic: async (personName, type) => {
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const matching = prevBorrows.filter((b) => {
      if (b.status !== 'pending') return false;
      const details = parseBorrowDetails(b, prevTransactions);
      return (
        details.displayName.toLowerCase().trim() === personName.toLowerCase().trim() &&
        details.type === type
      );
    });

    if (matching.length < 2) {
      return { success: false, error: 'Need at least 2 entries of same type to merge' };
    }

    const totalAmount = matching.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const primary = matching[0];
    const rest = matching.slice(1);
    const restIds = rest.map((b) => b.id);
    const nowIso = new Date().toISOString();

    const updatedBorrows = prevBorrows.map((b) => {
      if (b.id === primary.id) {
        return {
          ...b,
          amount: totalAmount,
          updated_at: nowIso,
        };
      }
      if (restIds.includes(b.id)) {
        return {
          ...b,
          status: 'settled' as BorrowStatus,
          updated_at: nowIso,
        };
      }
      return b;
    });

    set({ borrows: updatedBorrows });
    persistFinanceCache(get());

    if (isGuestUser(primary.user_id)) {
      return { success: true };
    }

    try {
      await supabase
        .from('borrows')
        .update({ amount: totalAmount, updated_at: nowIso })
        .eq('id', primary.id);

      await supabase
        .from('borrows')
        .update({ status: 'settled', updated_at: nowIso })
        .in('id', restIds);

      if (primary.linked_transaction_id) {
        await supabase
          .from('transactions')
          .update({ amount: totalAmount })
          .eq('id', primary.linked_transaction_id);

        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === primary.linked_transaction_id ? { ...t, amount: totalAmount } : t
          ),
        }));
      }

      return { success: true };
    } catch (err: any) {
      set({ borrows: prevBorrows, inlineError: `Failed to merge: ${err.message}` });
      return { success: false, error: err.message };
    }
  },

  netSettleBorrowsOptimistic: async (personName) => {
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const lentEntries = prevBorrows.filter((b) => {
      if (b.status !== 'pending') return false;
      const details = parseBorrowDetails(b, prevTransactions);
      return (
        details.displayName.toLowerCase().trim() === personName.toLowerCase().trim() &&
        details.type === 'lent'
      );
    });
    const borrowedEntries = prevBorrows.filter((b) => {
      if (b.status !== 'pending') return false;
      const details = parseBorrowDetails(b, prevTransactions);
      return (
        details.displayName.toLowerCase().trim() === personName.toLowerCase().trim() &&
        details.type === 'borrowed'
      );
    });

    if (lentEntries.length === 0 || borrowedEntries.length === 0) {
      return { success: false, error: 'Need both Lent and Borrowed entries to net settle' };
    }

    const totalLent = lentEntries.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalBorrowed = borrowedEntries.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const nowIso = new Date().toISOString();

    let updatedBorrows = [...prevBorrows];
    let toSettleIds: string[] = [];
    let toUpdateId: string | null = null;
    let newAmount: number = 0;

    if (totalLent === totalBorrowed) {
      toSettleIds = [...lentEntries.map((b) => b.id), ...borrowedEntries.map((b) => b.id)];
      updatedBorrows = updatedBorrows.map((b) =>
        toSettleIds.includes(b.id) ? { ...b, status: 'settled' as BorrowStatus, updated_at: nowIso } : b
      );
    } else if (totalLent > totalBorrowed) {
      const netAmount = totalLent - totalBorrowed;
      const primaryLent = lentEntries[0];
      const otherLentIds = lentEntries.slice(1).map((b) => b.id);
      toSettleIds = [...borrowedEntries.map((b) => b.id), ...otherLentIds];
      toUpdateId = primaryLent.id;
      newAmount = netAmount;

      updatedBorrows = updatedBorrows.map((b) => {
        if (b.id === primaryLent.id) {
          return { ...b, amount: netAmount, updated_at: nowIso };
        }
        if (toSettleIds.includes(b.id)) {
          return { ...b, status: 'settled' as BorrowStatus, updated_at: nowIso };
        }
        return b;
      });
    } else {
      const netAmount = totalBorrowed - totalLent;
      const primaryBorrowed = borrowedEntries[0];
      const otherBorrowedIds = borrowedEntries.slice(1).map((b) => b.id);
      toSettleIds = [...lentEntries.map((b) => b.id), ...otherBorrowedIds];
      toUpdateId = primaryBorrowed.id;
      newAmount = netAmount;

      updatedBorrows = updatedBorrows.map((b) => {
        if (b.id === primaryBorrowed.id) {
          return { ...b, amount: netAmount, updated_at: nowIso };
        }
        if (toSettleIds.includes(b.id)) {
          return { ...b, status: 'settled' as BorrowStatus, updated_at: nowIso };
        }
        return b;
      });
    }

    set({ borrows: updatedBorrows });
    persistFinanceCache(get());

    if (isGuestUser(prevBorrows[0]?.user_id || '')) {
      return { success: true };
    }

    try {
      if (toSettleIds.length > 0) {
        await supabase
          .from('borrows')
          .update({ status: 'settled', updated_at: nowIso })
          .in('id', toSettleIds);
      }
      if (toUpdateId && newAmount > 0) {
        await supabase
          .from('borrows')
          .update({ amount: newAmount, updated_at: nowIso })
          .eq('id', toUpdateId);

        const primaryBorrow = prevBorrows.find((b) => b.id === toUpdateId);
        if (primaryBorrow?.linked_transaction_id) {
          await supabase
            .from('transactions')
            .update({ amount: newAmount })
            .eq('id', primaryBorrow.linked_transaction_id);

          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === primaryBorrow.linked_transaction_id ? { ...t, amount: newAmount } : t
            ),
          }));
        }
      }
      return { success: true };
    } catch (err: any) {
      set({ borrows: prevBorrows, inlineError: `Failed to net settle: ${err.message}` });
      return { success: false, error: err.message };
    }
  },

  reopenBorrowOptimistic: async (borrowId) => {
    const prevBorrows = [...get().borrows];
    const targetBorrow = prevBorrows.find((b) => b.id === borrowId);
    if (!targetBorrow) return { success: false, error: 'Borrow entry not found' };

    set({
      borrows: prevBorrows.map((b) =>
        b.id === borrowId ? { ...b, status: 'pending' as BorrowStatus } : b
      ),
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetBorrow.user_id)) {
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('borrows')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', borrowId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        inlineError: `Could not reopen borrow: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  deleteBorrowOptimistic: async (borrowId, deleteLinkedTx = false) => {
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];

    const targetBorrow = prevBorrows.find((b) => b.id === borrowId);
    if (!targetBorrow) return { success: false, error: 'Borrow not found' };

    let updatedTransactions = prevTransactions;
    let updatedAccounts = prevAccounts;

    if (deleteLinkedTx && targetBorrow.linked_transaction_id) {
      const linkedTx = prevTransactions.find((t) => t.id === targetBorrow.linked_transaction_id);
      if (linkedTx) {
        updatedTransactions = prevTransactions.filter((t) => t.id !== linkedTx.id);
        updatedAccounts = prevAccounts.map((acc) => {
          if (acc.id === linkedTx.account_id) {
            let delta = 0;
            if (linkedTx.type === 'income' || linkedTx.type === 'borrow_taken') {
              delta = -Number(linkedTx.amount);
            } else if (linkedTx.type === 'expense' || linkedTx.type === 'borrow_given') {
              delta = Number(linkedTx.amount);
            }
            return {
              ...acc,
              current_balance: Number(acc.current_balance) + delta,
            };
          }
          return acc;
        });
      }
    }

    set({
      borrows: prevBorrows.filter((b) => b.id !== borrowId),
      transactions: updatedTransactions,
      accounts: updatedAccounts,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(targetBorrow.user_id)) {
      return { success: true };
    }

    try {
      if (deleteLinkedTx && targetBorrow.linked_transaction_id) {
        await supabase.from('transactions').delete().eq('id', targetBorrow.linked_transaction_id);
      }
      const { error } = await supabase.from('borrows').delete().eq('id', borrowId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        transactions: prevTransactions,
        accounts: prevAccounts,
        inlineError: `Could not delete borrow: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  addBorrowWithTransactionOptimistic: async (params) => {
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];

    const tempBorrowId = `temp_borrow_${Date.now()}`;
    const cleanName = params.person_name.replace(/^\[(BORROWED|LENT)\]\s*/i, '').trim();
    const encodedPersonName =
      params.type === 'borrowed' ? `[BORROWED] ${cleanName}` : `[LENT] ${cleanName}`;

    let optimisticTx: Transaction | null = null;
    let tempTxId: string | null = null;
    let updatedAccounts = prevAccounts;

    if (params.account_id) {
      tempTxId = `temp_tx_${Date.now()}`;
      const txType: TransactionType = params.type === 'borrowed' ? 'borrow_taken' : 'borrow_given';
      const txNote =
        params.note?.trim() ||
        (params.type === 'borrowed'
          ? `Borrowed from ${cleanName}`
          : `Lent to ${cleanName}`);

      optimisticTx = {
        id: tempTxId,
        user_id: params.user_id,
        account_id: params.account_id,
        type: txType,
        amount: params.amount,
        category: 'Personal Loan',
        note: txNote,
        date: params.date,
        source: 'manual',
        created_at: new Date().toISOString(),
      };

      updatedAccounts = prevAccounts.map((acc) => {
        if (acc.id === params.account_id) {
          const delta = txType === 'borrow_taken' ? params.amount : -params.amount;
          return {
            ...acc,
            current_balance: Number(acc.current_balance) + delta,
          };
        }
        return acc;
      });
    }

    const optimisticBorrow: Borrow = {
      id: tempBorrowId,
      user_id: params.user_id,
      person_name: encodedPersonName,
      amount: params.amount,
      status: 'pending',
      type: params.type,
      linked_transaction_id: tempTxId,
      date: params.date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    set({
      borrows: [optimisticBorrow, ...prevBorrows],
      transactions: optimisticTx ? [optimisticTx, ...prevTransactions] : prevTransactions,
      accounts: updatedAccounts,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(params.user_id)) {
      return { success: true, borrow: optimisticBorrow };
    }

    try {
      let realTxId: string | null = null;
      let realTx: Transaction | null = null;

      if (params.account_id && optimisticTx) {
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: params.user_id,
            account_id: params.account_id,
            type: optimisticTx.type,
            amount: optimisticTx.amount,
            category: optimisticTx.category,
            note: optimisticTx.note,
            date: optimisticTx.date,
            source: 'manual',
          })
          .select()
          .single();

        if (txError) throw txError;
        realTx = txData as Transaction;
        realTxId = realTx.id;
      }

      const { data: borrowData, error: borrowError } = await supabase
        .from('borrows')
        .insert({
          user_id: params.user_id,
          person_name: encodedPersonName,
          amount: params.amount,
          status: 'pending',
          linked_transaction_id: realTxId,
          date: params.date,
        })
        .select()
        .single();

      if (borrowError) throw borrowError;

      const savedBorrow: Borrow = {
        ...(borrowData as Borrow),
        type: params.type,
      };

      set((state) => ({
        borrows: state.borrows.map((b) => (b.id === tempBorrowId ? savedBorrow : b)),
        transactions:
          realTx && tempTxId
            ? state.transactions.map((t) => (t.id === tempTxId ? realTx! : t))
            : state.transactions,
      }));

      return { success: true, borrow: savedBorrow };
    } catch (err: any) {
      set({
        borrows: prevBorrows,
        transactions: prevTransactions,
        accounts: prevAccounts,
        inlineError: `Could not save borrow entry: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  addPaidByFriendExpenseOptimistic: async (params) => {
    const prevTransactions = [...get().transactions];
    const prevBorrows = [...get().borrows];
    const prevSummaries = [...get().budgetSummaries];

    const tempTxId = `temp_tx_${Date.now()}`;
    const tempBorrowId = `temp_borrow_${Date.now()}`;
    const cleanFriendName = params.friend_name.trim();

    const optimisticTx: Transaction = {
      id: tempTxId,
      user_id: params.user_id,
      account_id: params.account_id || null,
      type: 'expense',
      amount: Number(params.amount),
      category: params.category,
      note: params.note ? `[Paid by ${cleanFriendName}] ${params.note}` : `[Paid by ${cleanFriendName}]`,
      date: params.date,
      source: 'manual',
      paid_by_friend: true,
      friend_name: cleanFriendName,
      created_at: new Date().toISOString(),
    };

    const optimisticBorrow: Borrow = {
      id: tempBorrowId,
      user_id: params.user_id,
      person_name: `[BORROWED] ${cleanFriendName}`,
      amount: Number(params.amount),
      status: 'pending',
      type: 'borrowed',
      linked_transaction_id: tempTxId,
      date: params.date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Update budget summaries for this expense
    const updatedSummaries = prevSummaries.map((bs) => {
      const matchesCategory = bs.category === params.category || bs.category === null;
      if (matchesCategory) {
        const newSpent = Number(bs.spent) + Number(params.amount);
        const newRemaining = Number(bs.monthly_limit) - newSpent;
        const newPct =
          bs.monthly_limit > 0 ? Math.round((newSpent / Number(bs.monthly_limit)) * 100) : 0;
        return {
          ...bs,
          spent: newSpent,
          remaining: newRemaining,
          spent_percentage: newPct,
        };
      }
      return bs;
    });

    set({
      transactions: [optimisticTx, ...prevTransactions],
      borrows: [optimisticBorrow, ...prevBorrows],
      budgetSummaries: updatedSummaries,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(params.user_id)) {
      return { success: true };
    }

    try {
      // 1. Insert transaction into Supabase without non-schema columns (paid_by_friend, friend_name)
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          user_id: params.user_id,
          account_id: params.account_id || null,
          type: 'expense',
          amount: params.amount,
          category: params.category,
          note: params.note ? `[Paid by ${cleanFriendName}] ${params.note}` : `[Paid by ${cleanFriendName}]`,
          date: params.date,
          source: 'manual',
        })
        .select()
        .single();

      if (txError) throw txError;
      const realTx: Transaction = {
        ...(txData as Transaction),
        paid_by_friend: true,
        friend_name: cleanFriendName,
      };

      // 2. Insert borrow linked to real transaction
      const { data: borrowData, error: borrowError } = await supabase
        .from('borrows')
        .insert({
          user_id: params.user_id,
          person_name: `[BORROWED] ${cleanFriendName}`,
          amount: params.amount,
          status: 'pending',
          type: 'borrowed',
          linked_transaction_id: realTx.id,
          date: params.date,
        })
        .select()
        .single();

      if (borrowError) throw borrowError;
      const realBorrow = {
        ...(borrowData as Borrow),
        type: 'borrowed' as const,
      };

      set((state) => ({
        transactions: state.transactions.map((t) => (t.id === tempTxId ? realTx : t)),
        borrows: state.borrows.map((b) => (b.id === tempBorrowId ? realBorrow : b)),
      }));
      persistFinanceCache(get());

      return { success: true };
    } catch (err: any) {
      set({
        transactions: prevTransactions,
        borrows: prevBorrows,
        budgetSummaries: prevSummaries,
        inlineError: `Could not save friend-paid expense: ${err.message || 'Network error'}. Changes rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  setBudgetOptimistic: async (budgetData) => {
    const prevBudgets = [...get().budgets];
    const prevSummaries = [...get().budgetSummaries];
    const allTx = get().transactions;

    // 1. Calculate optimistic spent for this category and month directly from local transactions (0ms)
    const txForMonth = allTx.filter(
      (t) => t.type === 'expense' && t.date.startsWith(budgetData.month)
    );
    const spent = txForMonth
      .filter((t) => (budgetData.category === null ? true : t.category === budgetData.category))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const remaining = budgetData.monthly_limit - spent;
    const spent_percentage = budgetData.monthly_limit > 0
      ? Math.round((spent / budgetData.monthly_limit) * 1000) / 10
      : 0;

    // 2. Optimistically update budgets list
    const existingBudgetIndex = prevBudgets.findIndex(
      (b) => b.category === budgetData.category && b.month === budgetData.month
    );
    const tempId = prevBudgets[existingBudgetIndex]?.id || `temp_budget_${Date.now()}`;
    const optimisticBudget: Budget = {
      ...budgetData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedBudgets = existingBudgetIndex >= 0
      ? prevBudgets.map((b, idx) => (idx === existingBudgetIndex ? optimisticBudget : b))
      : [...prevBudgets, optimisticBudget];

    // 3. Optimistically update budgetSummaries list (SYNCHRONOUS UI UPDATE - 0ms)
    const existingSummaryIndex = prevSummaries.findIndex(
      (s) => s.category === budgetData.category && s.month === budgetData.month
    );
    const optimisticSummary: BudgetSummary = {
      budget_id: tempId,
      user_id: budgetData.user_id,
      category: budgetData.category ?? null,
      monthly_limit: budgetData.monthly_limit,
      month: budgetData.month,
      spent,
      remaining,
      spent_percentage,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedSummaries = existingSummaryIndex >= 0
      ? prevSummaries.map((s, idx) => (idx === existingSummaryIndex ? optimisticSummary : s))
      : [...prevSummaries, optimisticSummary];

    // Apply state immediately so UI updates without ANY lag
    set({
      budgets: updatedBudgets,
      budgetSummaries: updatedSummaries,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(budgetData.user_id)) {
      return { success: true };
    }

    try {
      // Find existing budget record for this user, category, and month
      let query = supabase
        .from('budgets')
        .select('id')
        .eq('user_id', budgetData.user_id)
        .eq('month', budgetData.month);

      if (budgetData.category === null || budgetData.category === undefined) {
        query = query.is('category', null);
      } else {
        query = query.eq('category', budgetData.category);
      }

      const { data: existingRows, error: findError } = await query;
      if (findError) throw findError;

      let savedId = tempId;
      if (existingRows && existingRows.length > 0) {
        savedId = existingRows[0].id;
        const { error: updateError } = await supabase
          .from('budgets')
          .update({
            monthly_limit: budgetData.monthly_limit,
            updated_at: new Date().toISOString(),
          })
          .eq('id', savedId);

        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('budgets')
          .insert({
            user_id: budgetData.user_id,
            category: budgetData.category ?? null,
            monthly_limit: budgetData.monthly_limit,
            month: budgetData.month,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        if (inserted) savedId = inserted.id;
      }

      // Sync real ID from DB
      set({
        budgets: get().budgets.map((b) => (b.id === tempId ? { ...b, id: savedId } : b)),
        budgetSummaries: get().budgetSummaries.map((s) => (s.budget_id === tempId ? { ...s, budget_id: savedId } : s)),
      });

      return { success: true };
    } catch (err: any) {
      set({
        budgets: prevBudgets,
        budgetSummaries: prevSummaries,
        inlineError: `Could not save budget: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  deleteBudgetOptimistic: async (budgetId, category, month, userId) => {
    const prevBudgets = [...get().budgets];
    const prevSummaries = [...get().budgetSummaries];

    // Find the target budget / summary to know its category, month, and user_id
    const targetBudget = prevBudgets.find((b) => b.id === budgetId);
    const targetSummary = prevSummaries.find((s) => s.budget_id === budgetId);
    const resolvedCat = category !== undefined ? category : targetBudget?.category ?? targetSummary?.category ?? null;
    const resolvedMonth = month || targetBudget?.month || targetSummary?.month || get().selectedMonth;
    const resolvedUserId = userId || targetBudget?.user_id || targetSummary?.user_id;

    // Optimistically remove from state
    set({
      budgets: prevBudgets.filter(
        (b) => b.id !== budgetId && !(b.category === resolvedCat && b.month === resolvedMonth)
      ),
      budgetSummaries: prevSummaries.filter(
        (s) => s.budget_id !== budgetId && !(s.category === resolvedCat && s.month === resolvedMonth)
      ),
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(resolvedUserId)) {
      return { success: true };
    }

    try {
      let query = supabase.from('budgets').delete();
      if (!budgetId.startsWith('temp_budget_')) {
        query = query.eq('id', budgetId);
      } else if (resolvedUserId) {
        query = query.eq('user_id', resolvedUserId).eq('month', resolvedMonth);
        if (resolvedCat === null) {
          query = query.is('category', null);
        } else {
          query = query.eq('category', resolvedCat);
        }
      }

      const { error } = await query;
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        budgets: prevBudgets,
        budgetSummaries: prevSummaries,
        inlineError: `Could not delete budget: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  createAccountOptimistic: async (accData) => {
    // Prevent adding duplicate pending accounts if one with identical temp name & type is already in progress
    const alreadyPending = get().accounts.some(
      (a) =>
        a.id.startsWith('temp_acc_') &&
        a.name.trim().toLowerCase() === accData.name.trim().toLowerCase() &&
        a.type === accData.type
    );
    if (alreadyPending) {
      return { success: false, error: 'Account creation already in progress' };
    }

    const tempId = `temp_acc_${Date.now()}`;
    const optimisticAcc: Account = {
      ...accData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const prevAccounts = [...get().accounts];
    set({
      accounts: deduplicateAccounts([...prevAccounts, optimisticAcc]),
      inlineError: null,
    });
    persistFinanceCache(get());

    const meta: AccountMetadata = {
      billing_cycle_day: accData.billing_cycle_day,
      payment_due_day: accData.payment_due_day,
      current_statement_billed_due: (accData as any).current_statement_billed_due,
      bank_preset: accData.bank_preset,
      card_issuer: accData.card_issuer,
      custom_icon: accData.custom_icon,
      custom_color: accData.custom_color,
    };
    saveAccountMetadata(accData.user_id, tempId, meta);

    if (isGuestUser(accData.user_id)) {
      return { success: true, account: optimisticAcc };
    }

    try {
      const dbPayload = {
        user_id: accData.user_id,
        name: accData.name,
        type: accData.type,
        current_balance: accData.current_balance,
        credit_limit: accData.credit_limit,
      };

      const { data, error } = await supabase
        .from('accounts')
        .insert(dbPayload)
        .select()
        .single();

      if (error) throw error;

      const realAcc = { ...optimisticAcc, ...(data as Account) };
      saveAccountMetadata(accData.user_id, realAcc.id, meta);

      set((state) => {
        const alreadyHasReal = state.accounts.some((a) => a.id === realAcc.id);
        let updated: Account[];
        if (alreadyHasReal) {
          updated = state.accounts.filter((a) => a.id !== tempId);
        } else {
          updated = state.accounts.map((a) => (a.id === tempId ? realAcc : a));
        }
        return { accounts: deduplicateAccounts(updated) };
      });
      persistFinanceCache(get());

      return { success: true, account: realAcc };
    } catch (err: any) {
      set({
        accounts: prevAccounts,
        inlineError: `Could not create account: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  updateAccountOptimistic: async (accountId, updates) => {
    const prevAccounts = [...get().accounts];
    set({
      accounts: deduplicateAccounts(
        prevAccounts.map((a) => (a.id === accountId ? { ...a, ...updates } : a))
      ),
      inlineError: null,
    });
    persistFinanceCache(get());

    const targetAcc = prevAccounts.find((a) => a.id === accountId);
    const metaUpdates: AccountMetadata = {};
    if ('billing_cycle_day' in updates) metaUpdates.billing_cycle_day = updates.billing_cycle_day;
    if ('payment_due_day' in updates) metaUpdates.payment_due_day = updates.payment_due_day;
    if ('current_statement_billed_due' in updates) metaUpdates.current_statement_billed_due = updates.current_statement_billed_due;
    if ('bank_preset' in updates) metaUpdates.bank_preset = updates.bank_preset;
    if ('card_issuer' in updates) metaUpdates.card_issuer = updates.card_issuer;
    if ('custom_icon' in updates) metaUpdates.custom_icon = updates.custom_icon;
    if ('custom_color' in updates) metaUpdates.custom_color = updates.custom_color;

    if (Object.keys(metaUpdates).length > 0) {
      saveAccountMetadata(targetAcc?.user_id || get().currentUserId, accountId, metaUpdates);
    }

    if (targetAcc && isGuestUser(targetAcc.user_id)) {
      return { success: true };
    }

    try {
      const candidateFields = [
        'name',
        'type',
        'current_balance',
        'credit_limit',
        'billing_cycle_day',
        'payment_due_day',
        'current_statement_billed_due',
        'bank_preset',
        'card_issuer',
        'custom_icon',
        'custom_color',
      ];
      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const field of candidateFields) {
        if (field in updates) {
          dbUpdates[field] = (updates as any)[field];
        }
      }

      const { error: fullError } = await supabase
        .from('accounts')
        .update(dbUpdates)
        .eq('id', accountId);

      if (fullError) {
        // If Supabase schema lacks optional metadata columns, fallback to core fields
        const coreFields = ['name', 'type', 'current_balance', 'credit_limit'];
        const coreUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const field of coreFields) {
          if (field in updates) {
            coreUpdates[field] = (updates as any)[field];
          }
        }
        const { error: coreError } = await supabase
          .from('accounts')
          .update(coreUpdates)
          .eq('id', accountId);

        if (coreError) throw coreError;
      }

      return { success: true };
    } catch (err: any) {
      set({
        accounts: prevAccounts,
        inlineError: `Could not update account: ${err.message || 'Network error'}`,
      });
      return { success: false, error: err.message };
    }
  },

  deleteAccountOptimistic: async (accountId) => {
    const prevAccounts = [...get().accounts];
    const targetAcc = prevAccounts.find((a) => a.id === accountId);
    set({
      accounts: prevAccounts.filter((a) => a.id !== accountId),
      inlineError: null,
    });
    persistFinanceCache(get());

    removeAccountMetadata(targetAcc?.user_id || get().currentUserId, accountId);

    if (targetAcc && isGuestUser(targetAcc.user_id)) {
      return { success: true };
    }

    try {
      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        accounts: prevAccounts,
        inlineError: `Could not delete account: ${err.message || 'Network error'}`,
      });
      return { success: false, error: err.message };
    }
  },

  reorderAccounts: async (newAccounts: Account[]) => {
    const deduplicated = deduplicateAccounts(newAccounts);
    set({ accounts: deduplicated });
    const orderIds = deduplicated.map((a) => a.id);
    await AsyncStorage.setItem(getAccountOrderKey(get().currentUserId), JSON.stringify(orderIds)).catch(() => {});
  },

  // Credit Card Bill Payment
  payCreditCardBill: async (creditCardId, fromAccountId, amount, userId, date, note) => {
    const txDate = date || new Date().toISOString().substring(0, 10);
    const prevAccounts = [...get().accounts];
    const prevTransactions = [...get().transactions];

    const card = prevAccounts.find((a) => a.id === creditCardId);
    const sourceAcc = prevAccounts.find((a) => a.id === fromAccountId);

    if (!card || !sourceAcc) {
      return { success: false, error: 'Credit Card or Payment Source account not found' };
    }

    const paymentAmount = Number(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return { success: false, error: 'Please enter a valid payment amount' };
    }

    // 1. Optimistic updates
    const tempBankTxId = `temp_pay_bank_${Date.now()}`;
    const tempCardTxId = `temp_pay_card_${Date.now()}`;

    const bankTx: Transaction = {
      id: tempBankTxId,
      user_id: userId,
      account_id: fromAccountId,
      type: 'expense',
      amount: paymentAmount,
      category: 'Credit Card Payment',
      note: note || `Bill payment to ${card.name}`,
      date: txDate,
      source: 'manual',
      created_at: new Date().toISOString(),
    };

    const cardTx: Transaction = {
      id: tempCardTxId,
      user_id: userId,
      account_id: creditCardId,
      type: 'income',
      amount: paymentAmount,
      category: 'Credit Card Payment',
      note: note || `Bill payment from ${sourceAcc.name}`,
      date: txDate,
      source: 'manual',
      created_at: new Date().toISOString(),
    };

    const updatedAccounts = prevAccounts.map((a) => {
      if (a.id === fromAccountId) {
        return { ...a, current_balance: Number(a.current_balance) - paymentAmount };
      }
      if (a.id === creditCardId) {
        const nextBilled = a.current_statement_billed_due != null
          ? Math.max(0, Number(a.current_statement_billed_due) - paymentAmount)
          : a.current_statement_billed_due;
        return {
          ...a,
          current_balance: Number(a.current_balance) + paymentAmount,
          current_statement_billed_due: nextBilled,
        };
      }
      return a;
    });

    if (card.current_statement_billed_due != null) {
      saveAccountMetadata(userId, creditCardId, {
        current_statement_billed_due: Math.max(0, Number(card.current_statement_billed_due) - paymentAmount),
      });
    }

    set({
      accounts: updatedAccounts,
      transactions: [bankTx, cardTx, ...prevTransactions],
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(userId)) {
      return { success: true };
    }

    try {
      const { data: insertedBankTx, error: bankErr } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: fromAccountId,
          type: 'expense',
          amount: paymentAmount,
          category: 'Credit Card Payment',
          note: note || `Bill payment to ${card.name}`,
          date: txDate,
          source: 'manual',
        })
        .select()
        .single();

      if (bankErr) throw bankErr;

      const { data: insertedCardTx, error: cardErr } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: creditCardId,
          type: 'income',
          amount: paymentAmount,
          category: 'Credit Card Payment',
          note: note || `Bill payment from ${sourceAcc.name}`,
          date: txDate,
          source: 'manual',
        })
        .select()
        .single();

      if (cardErr) throw cardErr;

      set((state) => ({
        transactions: state.transactions.map((t) => {
          if (t.id === tempBankTxId) return insertedBankTx as Transaction;
          if (t.id === tempCardTxId) return insertedCardTx as Transaction;
          return t;
        }),
      }));

      return { success: true };
    } catch (err: any) {
      set({
        accounts: prevAccounts,
        transactions: prevTransactions,
        inlineError: `Could not process bill payment: ${err.message || 'Network error'}. Rolled back.`,
      });
      return { success: false, error: err.message };
    }
  },

  triggerCloudSync: async () => {
    set({ syncStatus: 'syncing' });
    try {
      const isGuest =
        get().accounts.some((a) => a.user_id === 'guest_local_user') ||
        get().transactions.some((t) => t.user_id === 'guest_local_user');
      if (isGuest) {
        persistFinanceCache(get());
        const now = new Date().toISOString();
        set({ lastSyncedAt: now, syncStatus: 'synced' });
        return { success: true };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        set({ syncStatus: 'error' });
        return { success: false, error: 'User is not authenticated' };
      }

      await get().fetchInitialData(userId);
      const now = new Date().toISOString();
      set({ lastSyncedAt: now, syncStatus: 'synced' });
      return { success: true };
    } catch (err: any) {
      set({ syncStatus: 'error' });
      return { success: false, error: err.message || 'Sync failed' };
    }
  },

  migrateLocalDataToCloud: async (userId: string) => {
    set({ syncStatus: 'syncing' });
    try {
      const state = get();
      const localAccounts = state.accounts.map((a) => ({
        ...a,
        user_id: userId,
      }));
      const localTransactions = state.transactions.map((t) => ({
        ...t,
        user_id: userId,
      }));
      const localBorrows = state.borrows.map((b) => ({
        ...b,
        user_id: userId,
      }));
      const localBudgets = state.budgets.map((bg) => ({
        ...bg,
        user_id: userId,
      }));

      // 1. Upsert accounts
      if (localAccounts.length > 0) {
        const { error: accErr } = await supabase.from('accounts').upsert(
          localAccounts.map((a) => ({
            id: a.id,
            user_id: userId,
            name: a.name,
            type: a.type,
            current_balance: a.current_balance,
            credit_limit: a.credit_limit,
          }))
        );
        if (accErr) console.warn('[financeStore] Account migration warning:', accErr.message);
      }

      // 2. Upsert transactions
      if (localTransactions.length > 0) {
        const { error: txErr } = await supabase.from('transactions').upsert(
          localTransactions.map((t) => ({
            id: t.id,
            user_id: userId,
            account_id: t.account_id,
            type: t.type,
            amount: t.amount,
            category: t.category,
            note: t.note,
            date: t.date,
            source: t.source || 'manual',
          }))
        );
        if (txErr) console.warn('[financeStore] Transaction migration warning:', txErr.message);
      }

      // 3. Upsert borrows
      if (localBorrows.length > 0) {
        const { error: bErr } = await supabase.from('borrows').upsert(
          localBorrows.map((b) => ({
            id: b.id,
            user_id: userId,
            person_name: b.person_name,
            amount: b.amount,
            status: b.status,
            type: b.type,
            linked_transaction_id: b.linked_transaction_id,
            date: b.date,
          }))
        );
        if (bErr) console.warn('[financeStore] Borrow migration warning:', bErr.message);
      }

      // 4. Upsert budgets
      if (localBudgets.length > 0) {
        const { error: bgErr } = await supabase.from('budgets').upsert(
          localBudgets.map((bg) => ({
            id: bg.id,
            user_id: userId,
            category: bg.category,
            monthly_limit: bg.monthly_limit,
            month: bg.month,
          }))
        );
        if (bgErr) console.warn('[financeStore] Budget migration warning:', bgErr.message);
      }

      // Refresh full dataset from Supabase
      await get().fetchInitialData(userId);
      // Clean up the guest local cache now that it has been migrated to cloud
      await Promise.allSettled([
        AsyncStorage.removeItem(getStorageKey('guest_local_user')),
        AsyncStorage.removeItem(getCategoriesKey('guest_local_user')),
        AsyncStorage.removeItem(getAccountOrderKey('guest_local_user')),
      ]);
      set({ syncStatus: 'synced', lastSyncedAt: new Date().toISOString() });
      return { success: true };
    } catch (err: any) {
      set({ syncStatus: 'error' });
      return { success: false, error: err.message || 'Migration failed' };
    }
  },

  clearAllLocalData: async () => {
    const uid = get().currentUserId;
    set({
      accounts: [],
      transactions: [],
      borrows: [],
      budgets: [],
      budgetSummaries: [],
      lastSyncedAt: null,
      syncStatus: 'idle',
    });
    await Promise.allSettled([
      AsyncStorage.removeItem(getStorageKey(uid)),
      AsyncStorage.removeItem(getCategoriesKey(uid)),
      AsyncStorage.removeItem(getAccountOrderKey(uid)),
      AsyncStorage.removeItem(getAccountMetaKey(uid)),
    ]);
  },

  resetForSignOut: () => {
    const { activeChannel } = get();
    if (activeChannel) {
      try {
        supabase.removeChannel(activeChannel);
      } catch {}
    }
    set({
      accounts: [],
      transactions: [],
      borrows: [],
      budgets: [],
      budgetSummaries: [],
      categories: DEFAULT_STUDENT_CATEGORIES,
      selectedMonth: getCurrentMonthString(),
      currentUserId: null,
      activeChannel: null,
      lastSyncedAt: null,
      syncStatus: 'idle',
      inlineError: null,
      isInitialLoading: false,
    });
  },
}));
