-- Migration: Allow 'sms' in transactions table source check constraint
-- Fixes constraint violation: "transactions_source_check" when saving SMS-detected transactions

DO $$
BEGIN
    -- Drop the existing constraint if present
    ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
    
    -- Re-add the constraint including 'sms'
    ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_source_check 
        CHECK (source IN ('manual', 'screenshot', 'sms'));
END $$;
