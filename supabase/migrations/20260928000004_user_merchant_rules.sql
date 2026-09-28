-- Migration: 20260928000004_user_merchant_rules.sql
-- Table to store user-specific learned merchant-to-category rules

CREATE TABLE IF NOT EXISTS public.user_merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  category TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income', 'expense', 'borrow_given', 'borrow_taken')),
  source TEXT NOT NULL DEFAULT 'gemini' CHECK (source IN ('gemini', 'user_manual')),
  confidence NUMERIC DEFAULT 1.0,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_merchant_rules_user_merchant_key UNIQUE (user_id, merchant_name)
);

-- Index for fast user-specific lookups
CREATE INDEX IF NOT EXISTS idx_user_merchant_rules_lookup 
  ON public.user_merchant_rules (user_id, merchant_name);

-- Enable RLS
ALTER TABLE public.user_merchant_rules ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own rules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_merchant_rules' 
      AND policyname = 'Users can view their own merchant rules'
  ) THEN
    CREATE POLICY "Users can view their own merchant rules"
      ON public.user_merchant_rules
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_merchant_rules' 
      AND policyname = 'Users can insert their own merchant rules'
  ) THEN
    CREATE POLICY "Users can insert their own merchant rules"
      ON public.user_merchant_rules
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_merchant_rules' 
      AND policyname = 'Users can update their own merchant rules'
  ) THEN
    CREATE POLICY "Users can update their own merchant rules"
      ON public.user_merchant_rules
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'user_merchant_rules' 
      AND policyname = 'Users can delete their own merchant rules'
  ) THEN
    CREATE POLICY "Users can delete their own merchant rules"
      ON public.user_merchant_rules
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
