// src/types/database.ts

export type AccountType = 'cash' | 'bank' | 'credit_card';
export type BankPresetCode = 'SBI' | 'India Post' | 'HDFC' | 'Canara' | 'PNB' | 'BOB' | 'Custom';
export type BankPreset = BankPresetCode;
export type CreditCardIssuerCode = 'HDFC' | 'SBI Card' | 'ICICI' | 'Axis' | 'Kotak' | 'Slice' | 'OneCard' | 'Custom';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  current_balance: number;
  credit_limit: number | null;
  bank_preset?: string | null;
  card_issuer?: string | null;
  custom_icon?: string | null;
  custom_color?: string | null;
  display_order?: number;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'income' | 'expense' | 'borrow_given' | 'borrow_taken';
export type TransactionSource = 'manual' | 'screenshot';

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  category: string;
  note: string | null;
  date: string; // YYYY-MM-DD
  source: TransactionSource;
  created_at: string;
}

export type BorrowStatus = 'pending' | 'settled';
export type BorrowType = 'lent' | 'borrowed';

export interface Borrow {
  id: string;
  user_id: string;
  person_name: string;
  amount: number;
  status: BorrowStatus;
  type?: BorrowType;
  linked_transaction_id: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category: string | null; // null represents overall monthly budget
  monthly_limit: number;
  month: string; // YYYY-MM
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  gemini_api_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetSummary {
  budget_id: string;
  user_id: string;
  category: string | null;
  monthly_limit: number;
  month: string;
  spent: number;
  remaining: number;
  spent_percentage: number;
  created_at: string;
  updated_at: string;
}

export interface AccountOverview {
  account_id: string;
  user_id: string;
  name: string;
  type: AccountType;
  current_balance: number;
  credit_limit: number | null;
  total_income: number;
  total_expense: number;
  transaction_count: number;
  updated_at: string;
}
