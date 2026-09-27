// src/store/financeStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import {
  Account,
  Transaction,
  Borrow,
  Budget,
  BudgetSummary,
} from '../types/database';
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = '@finance_store_cache_v2';
const CATEGORIES_STORAGE_KEY = '@finance_categories_v1';
const ACCOUNT_ORDER_STORAGE_KEY = '@finance_account_order_v1';
const PENDING_CALIBRATIONS_STORAGE_KEY = '@finance_pending_calibrations_v1';

export interface PendingCalibration {
  accountId: string;
  difference: number;
  oldBalance: number;
  newBalance: number;
  date: string;
}

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

interface FinanceState {
  accounts: Account[];
  transactions: Transaction[];
  borrows: Borrow[];
  budgets: Budget[];
  budgetSummaries: BudgetSummary[];
  selectedMonth: string; // 'YYYY-MM'
  categories: string[];
  isInitialLoading: boolean;
  inlineError: string | null;
  activeChannel: RealtimeChannel | null;

  // Actions
  setInlineError: (error: string | null) => void;
  setSelectedMonth: (month: string, userId?: string) => Promise<void>;
  loadCachedData: () => Promise<void>;
  fetchInitialData: (userId: string) => Promise<void>;
  subscribeRealtime: (userId: string) => void;
  unsubscribeRealtime: () => void;

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

  addBorrowOptimistic: (
    borrowData: Omit<Borrow, 'id' | 'created_at' | 'updated_at'>
  ) => Promise<{ success: boolean; error?: string }>;

  setBudgetOptimistic: (
    budgetData: Omit<Budget, 'id' | 'created_at' | 'updated_at'>
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

  deleteAccountWithCalibration: (
    accountId: string,
    userId: string,
    calibrateFirst: boolean
  ) => Promise<{ success: boolean; error?: string }>;

  reorderAccounts: (
    newAccounts: Account[]
  ) => Promise<void>;

  // Calibration flow
  pendingCalibrations: Record<string, PendingCalibration>;
  setPendingCalibration: (item: PendingCalibration) => Promise<void>;
  clearPendingCalibration: (accountId: string) => Promise<void>;
  resolvePendingCalibrationAsTransaction: (
    accountId: string,
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;
  calibrateAccountBalance: (
    accountId: string,
    newBalance: number,
    logAsTransaction: boolean,
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Credit Card Bill Payment
  payCreditCardBill: (
    creditCardId: string,
    fromAccountId: string,
    amount: number,
    userId: string,
    date?: string,
    note?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  accounts: [],
  transactions: [],
  borrows: [],
  budgets: [],
  budgetSummaries: [],
  selectedMonth: new Date().toISOString().substring(0, 7), // 'YYYY-MM'
  categories: DEFAULT_STUDENT_CATEGORIES,
  pendingCalibrations: {},
  isInitialLoading: true,
  inlineError: null,
  activeChannel: null,

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

      set({
        budgets: (budgetsRes.data as Budget[]) || [],
        budgetSummaries: (summaryRes.data as BudgetSummary[]) || [],
      });
    } catch (err: any) {
      set({ inlineError: `Failed to load data for ${month}: ${err.message}` });
    }
  },

  loadCachedData: async () => {
    try {
      const [cached, cachedCats, cachedOrder, cachedCalibrations] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(CATEGORIES_STORAGE_KEY),
        AsyncStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY),
        AsyncStorage.getItem(PENDING_CALIBRATIONS_STORAGE_KEY),
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

      let pendingCalibrations: Record<string, PendingCalibration> = {};
      if (cachedCalibrations) {
        try {
          pendingCalibrations = JSON.parse(cachedCalibrations) || {};
        } catch {}
      }

      if (cached) {
        const parsed = JSON.parse(cached);
        const rawAccounts = (parsed.accounts || []) as Account[];
        const accounts = sortAccountsByOrder(deduplicateAccounts(rawAccounts), orderIds);

        set({
          accounts,
          transactions: parsed.transactions || [],
          borrows: parsed.borrows || [],
          budgets: parsed.budgets || [],
          budgetSummaries: parsed.budgetSummaries || [],
          categories,
          pendingCalibrations,
          isInitialLoading: false,
        });
      } else {
        set({ categories, pendingCalibrations, isInitialLoading: false });
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
    AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  updateCategory: (oldCategory: string, newCategory: string) => {
    const trimmed = newCategory.trim();
    if (!trimmed || trimmed === oldCategory) return;
    const current = get().categories;
    const updated = current.map((c) => (c === oldCategory ? trimmed : c));
    set({ categories: updated });
    AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  reorderCategories: (categories: string[]) => {
    set({ categories });
    AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories)).catch(() => {});
  },

  removeCategory: (category: string) => {
    const updated = get().categories.filter((c) => c !== category);
    set({ categories: updated });
    AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  fetchInitialData: async (userId: string) => {
    try {
      const month = get().selectedMonth;

      const [accountsRes, txRes, borrowsRes, budgetsRes, summaryRes, cachedOrder, cachedCalibrations] = await Promise.all([
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
        AsyncStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY),
        AsyncStorage.getItem(PENDING_CALIBRATIONS_STORAGE_KEY),
      ]);

      let orderIds: string[] | null = null;
      if (cachedOrder) {
        try {
          orderIds = JSON.parse(cachedOrder);
        } catch {}
      }

      let pendingCalibrations: Record<string, PendingCalibration> = {};
      if (cachedCalibrations) {
        try {
          pendingCalibrations = JSON.parse(cachedCalibrations) || {};
        } catch {}
      }

      const rawAccounts = (accountsRes.data as Account[]) || [];
      const accounts = sortAccountsByOrder(deduplicateAccounts(rawAccounts), orderIds);
      const transactions = (txRes.data as Transaction[]) || [];
      const borrows = (borrowsRes.data as Borrow[]) || [];
      const budgets = (budgetsRes.data as Budget[]) || [];
      const budgetSummaries = (summaryRes.data as BudgetSummary[]) || [];

      set({
        accounts,
        transactions,
        borrows,
        budgets,
        budgetSummaries,
        pendingCalibrations,
        isInitialLoading: false,
      });

      AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accounts, transactions, borrows, budgets, budgetSummaries })
      ).catch(() => {});
    } catch (err: any) {
      set({
        isInitialLoading: false,
        inlineError: `Network error loading data: ${err.message || 'Check connection'}`,
      });
    }
  },

  subscribeRealtime: (userId: string) => {
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
              set({ transactions: [newTx, ...current] });
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
      set((state) => ({
        transactions: state.transactions.map((t) => (t.id === tempId ? realTx : t)),
      }));

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

  createAccountOptimistic: async (accData) => {
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
    const prevCalibrations = { ...get().pendingCalibrations };
    delete prevCalibrations[accountId];
    set({
      accounts: prevAccounts.filter((a) => a.id !== accountId),
      pendingCalibrations: prevCalibrations,
      inlineError: null,
    });
    AsyncStorage.setItem(PENDING_CALIBRATIONS_STORAGE_KEY, JSON.stringify(prevCalibrations)).catch(() => {});

    try {
      const { error } = await supabase.from('accounts').delete().eq('id', accountId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      set({
        accounts: prevAccounts,
        pendingCalibrations: get().pendingCalibrations,
        inlineError: `Could not delete account: ${err.message || 'Network error'}`,
      });
      return { success: false, error: err.message };
    }
  },

  deleteAccountWithCalibration: async (accountId: string, userId: string, calibrateFirst: boolean) => {
    const target = get().accounts.find((a) => a.id === accountId);
    if (!target) return { success: false, error: 'Account not found' };

    const balance = Number(target.current_balance || 0);

    if (calibrateFirst && Math.abs(balance) > 0.01) {
      const calRes = await get().calibrateAccountBalance(accountId, 0, true, userId);
      if (!calRes.success) {
        return calRes;
      }
    }

    return await get().deleteAccountOptimistic(accountId);
  },

  reorderAccounts: async (newAccounts: Account[]) => {
    const deduplicated = deduplicateAccounts(newAccounts);
    set({ accounts: deduplicated });
    const orderIds = deduplicated.map((a) => a.id);
    await AsyncStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(orderIds)).catch(() => {});
  },

  setPendingCalibration: async (item: PendingCalibration) => {
    const updated = {
      ...get().pendingCalibrations,
      [item.accountId]: item,
    };
    set({ pendingCalibrations: updated });
    await AsyncStorage.setItem(PENDING_CALIBRATIONS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  clearPendingCalibration: async (accountId: string) => {
    const updated = { ...get().pendingCalibrations };
    delete updated[accountId];
    set({ pendingCalibrations: updated });
    await AsyncStorage.setItem(PENDING_CALIBRATIONS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },

  resolvePendingCalibrationAsTransaction: async (accountId: string, userId: string) => {
    const pending = get().pendingCalibrations[accountId];
    if (!pending) return { success: false, error: 'No pending calibration found for this account' };

    const targetAccount = get().accounts.find((a) => a.id === accountId);
    if (!targetAccount) {
      await get().clearPendingCalibration(accountId);
      return { success: false, error: 'Account not found' };
    }

    const diff = pending.difference;
    const absAmount = Math.abs(diff);
    const txType = diff > 0 ? 'income' : 'expense';

    try {
      // Revert current_balance by -diff in DB so trigger restores it to targetAccount.current_balance upon transaction insert
      await supabase
        .from('accounts')
        .update({
          current_balance: Number(targetAccount.current_balance) - diff,
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);

      const res = await get().addTransactionOptimistic({
        user_id: userId,
        account_id: accountId,
        type: txType,
        amount: absAmount,
        category: 'Adjustment',
        note: `Balance calibration (${diff > 0 ? '+' : '-'}₹${absAmount.toLocaleString('en-IN')})`,
        date: new Date().toISOString().substring(0, 10),
        source: 'manual',
      });

      if (res.success) {
        await get().clearPendingCalibration(accountId);
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to resolve calibration' };
    }
  },

  // Calibration Flow
  calibrateAccountBalance: async (accountId, newBalance, logAsTransaction, userId) => {
    const prevAccounts = [...get().accounts];
    const targetAccount = prevAccounts.find((a) => a.id === accountId);
    if (!targetAccount) return { success: false, error: 'Account not found' };

    const oldBalance = Number(targetAccount.current_balance);
    const diff = newBalance - oldBalance;

    if (Math.abs(diff) < 0.01) return { success: true };

    if (logAsTransaction) {
      const txType = diff > 0 ? 'income' : 'expense';
      const absAmount = Math.abs(diff);

      const res = await get().addTransactionOptimistic({
        user_id: userId,
        account_id: accountId,
        type: txType,
        amount: absAmount,
        category: 'Adjustment',
        note: `Manual balance calibration (${diff > 0 ? '+' : '-'}₹${absAmount.toLocaleString('en-IN')})`,
        date: new Date().toISOString().substring(0, 10),
        source: 'manual',
      });

      if (res.success) {
        await get().clearPendingCalibration(accountId);
      }

      return res;
    } else {
      // Just adjust silently
      set({
        accounts: prevAccounts.map((a) =>
          a.id === accountId ? { ...a, current_balance: newBalance } : a
        ),
        inlineError: null,
      });

      try {
        const { error } = await supabase
          .from('accounts')
          .update({
            current_balance: newBalance,
            updated_at: new Date().toISOString(),
          })
          .eq('id', accountId);

        if (error) throw error;

        await get().setPendingCalibration({
          accountId,
          difference: diff,
          oldBalance,
          newBalance,
          date: new Date().toISOString(),
        });

        return { success: true };
      } catch (err: any) {
        set({
          accounts: prevAccounts,
          inlineError: `Could not calibrate balance: ${err.message || 'Network error'}`,
        });
        return { success: false, error: err.message };
      }
    }
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
}));
