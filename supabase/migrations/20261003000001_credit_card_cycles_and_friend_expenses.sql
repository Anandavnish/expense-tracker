-- Migration: 20261003000001_credit_card_cycles_and_friend_expenses.sql
-- Description: Adds credit card billing cycle & payment due days, and enables transactions paid by friends (nullable account_id)

-- 1. Add credit card cycle day columns to accounts
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS billing_cycle_day INTEGER CHECK (billing_cycle_day BETWEEN 1 AND 31),
ADD COLUMN IF NOT EXISTS payment_due_day INTEGER CHECK (payment_due_day BETWEEN 1 AND 31);

-- 2. Allow transactions to be logged without an account_id (e.g. when paid directly by a friend)
ALTER TABLE public.transactions
ALTER COLUMN account_id DROP NOT NULL;

-- 3. Add friend-paid metadata columns to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS paid_by_friend BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS friend_name TEXT NULL;

-- 4. Add index for faster querying of friend-paid transactions
CREATE INDEX IF NOT EXISTS idx_transactions_paid_by_friend ON public.transactions(paid_by_friend) WHERE paid_by_friend = true;
