-- Migration: 20260924000002_default_accounts_trigger.sql
-- Automatically seed default accounts ('Primary Bank', 'Cash Wallet') for newly registered users

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- 1. Create profile
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

    -- 2. Create default starter accounts
    INSERT INTO public.accounts (user_id, name, type, current_balance)
    VALUES 
        (NEW.id, 'Primary Bank', 'bank', 0.00),
        (NEW.id, 'Cash Wallet', 'cash', 0.00);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
