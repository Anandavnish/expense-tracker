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
  AccountOverview,
  BankPreset,
} from '../types/database';
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = '@finance_store_cache_v2';
const CATEGORIES_STORAGE_KEY = '@finance_categories_v1';

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
  reorderCategories: (categories: string[]) => void;
  removeCategory: (category: string) => void;

  // Optimistic mutations
  addTransactionOptimistic: (
    txData: Omit<Transaction, 'id' | 'created_at'>
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
  ) => Promise<{ success: boolean; error?: string }>;

  updateAccountOptimistic: (
    accountId: string,
    updates: Partial<Pick<Account, 'name' | 'type' | 'credit_limit' | 'bank_preset'>>
  ) => Promise<{ success: boolean; error?: string }>;

  deleteAccountOptimistic: (
    accountId: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Calibration flow
  calibrateAccountBalance: (
    accountId: string,
    newBalance: number,
    logAsTransaction: boolean,
    userId: string
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
      const [cached, cachedCats] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(CATEGORIES_STORAGE_KEY),
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

      if (cached) {
        const parsed = JSON.parse(cached);
        set({
          accounts: parsed.accounts || [],
          transactions: parsed.transactions || [],
          borrows: parsed.borrows || [],
          budgets: parsed.budgets || [],
          budgetSummaries: parsed.budgetSummaries || [],
          categories,
          isInitialLoading: false,
        });
      } else {
        set({ categories, isInitialLoading: false });
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

      const [accountsRes, txRes, borrowsRes, budgetsRes, summaryRes] = await Promise.all([
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
      ]);

      const accounts = (accountsRes.data as Account[]) || [];
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
            if (!current.some((a) => a.id === newAcc.id)) {
              set({ accounts: [...current, newAcc] });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedAcc = payload.new as Account;
            set({
              accounts: current.map((a) => (a.id === updatedAcc.id ? updatedAcc : a)),
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
    const optimisticBorrow: Borrow = {
      ...borrowData,
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
          person_name: borrowData.person_name,
          amount: borrowData.amount,
          status: borrowData.status,
          linked_transaction_id: borrowData.linked_transaction_id,
          date: borrowData.date,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        borrows: state.borrows.map((b) => (b.id === tempId ? (data as Borrow) : b)),
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

    const existingIndex = prevBudgets.findIndex(
      (b) => b.category === budgetData.category && b.month === budgetData.month
    );

    let updatedBudgets: Budget[];
    const tempId = `temp_budget_${Date.now()}`;
    if (existingIndex >= 0) {
      updatedBudgets = prevBudgets.map((b, idx) =>
        idx === existingIndex ? { ...b, monthly_limit: budgetData.monthly_limit } : b
      );
    } else {
      const newBudget: Budget = {
        ...budgetData,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updatedBudgets = [...prevBudgets, newBudget];
    }

    set({ budgets: updatedBudgets, inlineError: null });

    try {
      const { error } = await supabase
        .from('budgets')
        .upsert(
          {
            user_id: budgetData.user_id,
            category: budgetData.category,
            monthly_limit: budgetData.monthly_limit,
            month: budgetData.month,
          },
          { onConflict: 'user_id,category,month' }
        )
        .select()
        .single();

      if (error) throw error;

      const { data: summaryData } = await supabase
        .from('v_budget_summary')
        .select('*')
        .eq('user_id', budgetData.user_id)
        .eq('month', budgetData.month);

      if (summaryData) {
        set({ budgetSummaries: summaryData as BudgetSummary[] });
      }

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
      accounts: [...prevAccounts, optimisticAcc],
      inlineError: null,
    });

    try {
      const { data, error } = await supabase
        .from('accounts')
        .insert({
          user_id: accData.user_id,
          name: accData.name,
          type: accData.type,
          current_balance: accData.current_balance,
          credit_limit: accData.credit_limit,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === tempId ? (data as Account) : a)),
      }));

      return { success: true };
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
      accounts: prevAccounts.map((a) => (a.id === accountId ? { ...a, ...updates } : a)),
      inlineError: null,
    });

    try {
      const { error } = await supabase
        .from('accounts')
        .update({ ...updates, updated_at: new Date().toISOString() })
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

  // Calibration Flow
  calibrateAccountBalance: async (accountId, newBalance, logAsTransaction, userId) => {
    const prevAccounts = [...get().accounts];
    const targetAccount = prevAccounts.find((a) => a.id === accountId);
    if (!targetAccount) return { success: false, error: 'Account not found' };

    const oldBalance = Number(targetAccount.current_balance);
    const diff = newBalance - oldBalance;

    if (diff === 0) return { success: true };

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
}));
