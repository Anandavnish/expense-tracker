// src/store/financeStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import {
  Account,
  Transaction,
  TransactionType,
  Borrow,
  BorrowStatus,
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
  selectedMonth: new Date().toISOString().substring(0, 7), // 'YYYY-MM'
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

      const [cached, cachedCats, cachedOrder] = await Promise.all([
        AsyncStorage.getItem(getStorageKey(effectiveUserId)),
        AsyncStorage.getItem(getCategoriesKey(effectiveUserId)),
        AsyncStorage.getItem(getAccountOrderKey(effectiveUserId)),
      ]);

      let categories = DEFAULT_STUDENT_CATEGORIES;
      if (cachedCats) {
        try {
          const parsedCats = JSON.parse(cachedCats);
          if (Array.isArray(parsedCats) && parsedCats.length > 0) {
            categories = parsedCats;
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

        const rawAccounts = ((parsed.accounts || []) as Account[]).filter(
          (a) => a.user_id === effectiveUserId
        );
        const accounts = sortAccountsByOrder(deduplicateAccounts(rawAccounts), orderIds);

        const transactions = deduplicateTransactions(
          ((parsed.transactions || []) as Transaction[]).filter(
            (t) => t.user_id === effectiveUserId
          )
        );
        const borrows = ((parsed.borrows || []) as Borrow[]).filter(
          (b) => b.user_id === effectiveUserId
        );
        const budgets = ((parsed.budgets || []) as Budget[]).filter(
          (bg) => bg.user_id === effectiveUserId
        );

        set({
          accounts,
          transactions,
          borrows,
          budgets,
          budgetSummaries: parsed.budgetSummaries || [],
          categories,
          isInitialLoading: false,
        });
      } else {
        set({
          accounts: [],
          transactions: [],
          borrows: [],
          budgets: [],
          budgetSummaries: [],
          categories,
          isInitialLoading: false,
        });
      }
    } catch {
      set({ isInitialLoading: false });
    }
  },

  addCategory: (category: string) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    const current = get().categories;
    if (current.includes(trimmed)) return;
    const updated = [...current, trimmed];
    set({ categories: updated });
    AsyncStorage.setItem(getCategoriesKey(get().currentUserId), JSON.stringify(updated)).catch(() => {});
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
    const updated = get().categories.filter((c) => c !== category);
    set({ categories: updated });
    AsyncStorage.setItem(getCategoriesKey(get().currentUserId), JSON.stringify(updated)).catch(() => {});
  },

  fetchInitialData: async (userId: string) => {
    set({ currentUserId: userId });
    if (isGuestUser(userId)) {
      await get().loadCachedData(userId);
      set({ isInitialLoading: false, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() });
      return;
    }

    try {
      const month = get().selectedMonth;

      const [accountsRes, txRes, borrowsRes, budgetsRes, summaryRes, cachedOrder] = await Promise.all([
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
      ]);

      let orderIds: string[] | null = null;
      if (cachedOrder) {
        try {
          orderIds = JSON.parse(cachedOrder);
        } catch {}
      }

      const rawAccounts = (accountsRes.data as Account[]) || [];
      const accounts = sortAccountsByOrder(deduplicateAccounts(rawAccounts), orderIds);
      const transactions = deduplicateTransactions((txRes.data as Transaction[]) || []);
      const borrows = (borrowsRes.data as Borrow[]) || [];
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

      set({
        accounts,
        transactions,
        borrows,
        budgets,
        budgetSummaries,
        isInitialLoading: false,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      });

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
    const { activeChannel } = get();
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
    }

    const channel = supabase
      .channel(`realtime_finance_${userId}`)
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
                  current.map((a) => (a.id === tempMatch.id ? newAcc : a))
                ),
              });
            } else {
              set({ accounts: deduplicateAccounts([...current, newAcc]) });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedAcc = payload.new as Account;
            set({
              accounts: deduplicateAccounts(
                current.map((a) => (a.id === updatedAcc.id ? updatedAcc : a))
              ),
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old.id;
            set({ accounts: current.filter((a) => a.id !== oldId) });
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
    const { activeChannel } = get();
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      set({ activeChannel: null });
    }
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
      if (acc.id === txData.account_id) {
        let delta = 0;
        if (txData.type === 'income' || txData.type === 'borrow_taken') {
          delta = Number(txData.amount);
        } else if (txData.type === 'expense' || txData.type === 'borrow_given') {
          delta = -Number(txData.amount);
        }
        return {
          ...acc,
          current_balance: Number(acc.current_balance) + delta,
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

    if (isGuestUser(txData.user_id)) {
      return { success: true };
    }

    try {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: txData.user_id,
          account_id: txData.account_id,
          type: txData.type,
          amount: txData.amount,
          category: txData.category,
          note: txData.note,
          date: txData.date,
          source: txData.source,
        })
        .select()
        .single();

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

    set({
      transactions: prevTransactions.map((t) => (t.id === transactionId ? newTx : t)),
      accounts: updatedAccounts,
      budgetSummaries: updatedSummaries,
      inlineError: null,
    });
    persistFinanceCache(get());

    if (isGuestUser(oldTx.user_id)) {
      return { success: true };
    }

    try {
      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', transactionId)
        .select()
        .single();

      if (error) throw error;
      if (data) {
        set((state) => ({
          transactions: state.transactions.map((t) => (t.id === transactionId ? (data as Transaction) : t)),
        }));
        persistFinanceCache(get());
      }
      return { success: true };
    } catch (err: any) {
      set({
        transactions: prevTransactions,
        accounts: prevAccounts,
        budgetSummaries: prevSummaries,
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

    // Revert account balance effect
    const updatedAccounts = prevAccounts.map((acc) => {
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

    const updatedBorrows = prevBorrows.map((b) =>
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
    const prevBorrows = [...get().borrows];
    const prevTransactions = [...get().transactions];
    const prevAccounts = [...get().accounts];

    const targetBorrow = prevBorrows.find((b) => b.id === params.borrowId);
    if (!targetBorrow) return { success: false, error: 'Borrow entry not found' };

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
        set((state) => ({
          transactions: state.transactions.map((t) => (t.id === tempTxId ? realTx! : t)),
        }));
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

  setBudgetOptimistic: async (budgetData) => {
    // Enforce Rule: Budget limit cannot exceed total net worth (can be less or equal) for all types of budget
    const netWorth = calculateNetWorth(get().accounts, get().borrows, get().transactions);
    if (budgetData.monthly_limit > netWorth) {
      const errorMsg = `Budget limit (₹${budgetData.monthly_limit.toLocaleString('en-IN')}) cannot exceed your total net worth (₹${Math.max(0, netWorth).toLocaleString('en-IN')}).`;
      set({ inlineError: errorMsg });
      return { success: false, error: errorMsg };
    }

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
    if (targetAcc && isGuestUser(targetAcc.user_id)) {
      return { success: true };
    }

    try {
      const validDbFields = ['name', 'type', 'current_balance', 'credit_limit'];
      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const field of validDbFields) {
        if (field in updates) {
          dbUpdates[field] = (updates as any)[field];
        }
      }

      const { error } = await supabase
        .from('accounts')
        .update(dbUpdates)
        .eq('id', accountId);

      if (error) throw error;
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
    set({
      accounts: prevAccounts.filter((a) => a.id !== accountId),
      inlineError: null,
    });
    persistFinanceCache(get());

    const targetAcc = prevAccounts.find((a) => a.id === accountId);
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
        return { ...a, current_balance: Number(a.current_balance) + paymentAmount };
      }
      return a;
    });

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
      currentUserId: null,
      activeChannel: null,
      lastSyncedAt: null,
      syncStatus: 'idle',
      inlineError: null,
      isInitialLoading: false,
    });
  },
}));
