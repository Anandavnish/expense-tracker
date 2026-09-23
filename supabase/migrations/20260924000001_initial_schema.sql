-- Migration: 20260924000001_initial_schema.sql
-- Personal Finance Tracker Foundational Schema
-- Tables: profiles, accounts, transactions, borrows, budgets
-- Enforces Row Level Security (RLS) on all tables, triggers, and views

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    gemini_api_key TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to automatically create a profile row when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'credit_card')),
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(14,2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);

-- 3. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'borrow_given', 'borrow_taken')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL,
    note TEXT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL CHECK (source IN ('manual', 'screenshot')) DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(date DESC);

-- 4. BORROWS TABLE
CREATE TABLE IF NOT EXISTS public.borrows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    person_name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'settled')) DEFAULT 'pending',
    linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_borrows_user_id ON public.borrows(user_id);
CREATE INDEX IF NOT EXISTS idx_borrows_status ON public.borrows(status);

-- 5. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NULL, -- NULL indicates overall monthly budget
    monthly_limit NUMERIC(14,2) NOT NULL CHECK (monthly_limit >= 0),
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_cat_month ON public.budgets(user_id, COALESCE(category, '__OVERALL__'), month);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON public.budgets(user_id, month);

-- 6. BALANCE UPDATE TRIGGER
-- Automatically updates accounts.current_balance when transactions are created, modified, or deleted
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle deletion or old row on update
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.type IN ('income', 'borrow_taken') THEN
            UPDATE public.accounts
            SET current_balance = current_balance - OLD.amount,
                updated_at = now()
            WHERE id = OLD.account_id;
        ELSIF OLD.type IN ('expense', 'borrow_given') THEN
            UPDATE public.accounts
            SET current_balance = current_balance + OLD.amount,
                updated_at = now()
            WHERE id = OLD.account_id;
        END IF;
    END IF;

    -- Handle insertion or new row on update
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.type IN ('income', 'borrow_taken') THEN
            UPDATE public.accounts
            SET current_balance = current_balance + NEW.amount,
                updated_at = now()
            WHERE id = NEW.account_id;
        ELSIF NEW.type IN ('expense', 'borrow_given') THEN
            UPDATE public.accounts
            SET current_balance = current_balance - NEW.amount,
                updated_at = now()
            WHERE id = NEW.account_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.transactions;
CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- Mandatory: users can only read/write their own records (auth.uid() = user_id)

-- profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- accounts RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
    ON public.accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
    ON public.accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
    ON public.accounts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
    ON public.accounts FOR DELETE
    USING (auth.uid() = user_id);

-- transactions RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
    ON public.transactions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
    ON public.transactions FOR DELETE
    USING (auth.uid() = user_id);

-- borrows RLS
ALTER TABLE public.borrows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own borrows"
    ON public.borrows FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own borrows"
    ON public.borrows FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own borrows"
    ON public.borrows FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own borrows"
    ON public.borrows FOR DELETE
    USING (auth.uid() = user_id);

-- budgets RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budgets"
    ON public.budgets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets"
    ON public.budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
    ON public.budgets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
    ON public.budgets FOR DELETE
    USING (auth.uid() = user_id);

-- 8. COMPUTED POSTGRES VIEWS
-- Budget summary view: computes spent, remaining, and percentage so client doesn't need to manually sum transactions
CREATE OR REPLACE VIEW public.v_budget_summary 
WITH (security_invoker = true) AS
SELECT 
    b.id AS budget_id,
    b.user_id,
    b.category,
    b.monthly_limit,
    b.month,
    COALESCE(SUM(t.amount), 0.00) AS spent,
    (b.monthly_limit - COALESCE(SUM(t.amount), 0.00)) AS remaining,
    CASE 
        WHEN b.monthly_limit > 0 THEN 
            ROUND((COALESCE(SUM(t.amount), 0.00) / b.monthly_limit) * 100, 1)
        ELSE 0.0 
    END AS spent_percentage,
    b.created_at,
    b.updated_at
FROM public.budgets b
LEFT JOIN public.transactions t 
    ON t.user_id = b.user_id 
    AND to_char(t.date, 'YYYY-MM') = b.month
    AND t.type = 'expense'
    AND (b.category IS NULL OR t.category = b.category)
GROUP BY b.id, b.user_id, b.category, b.monthly_limit, b.month, b.created_at, b.updated_at;

-- Account summary view: computes total income, total expense, and transaction count
CREATE OR REPLACE VIEW public.v_account_overview
WITH (security_invoker = true) AS
SELECT
    a.id AS account_id,
    a.user_id,
    a.name,
    a.type,
    a.current_balance,
    a.credit_limit,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0.00) AS total_income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0.00) AS total_expense,
    COUNT(t.id) AS transaction_count,
    a.updated_at
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id, a.user_id, a.name, a.type, a.current_balance, a.credit_limit, a.updated_at;

-- 9. ENABLE REALTIME
-- Realtime publication for tables requiring reactive UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.borrows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;

ALTER TABLE public.accounts REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.borrows REPLICA IDENTITY FULL;
ALTER TABLE public.budgets REPLICA IDENTITY FULL;
