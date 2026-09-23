# Personal Finance Tracker — Progress & Architecture Log

## Project Overview
Foundational architecture build for a high-performance cross-platform personal finance mobile app built for Android using Expo Dev Client, React Native Reanimated, React Native Paper, Zustand, and Supabase.

---

## What's Done

### 1. Backend & Database (Supabase)
- [x] Initialized Supabase CLI & linked remote project `expense-tracker` (ID: `yqopwzkvxdxmomvvlpor`, region: `ap-south-1`).
- [x] Created versioned SQL migration `20260924000001_initial_schema.sql`:
  - `profiles`: Linked to `auth.users`, includes `gemini_api_key` placeholder for future BYOK.
  - `accounts`: Supports `cash`, `bank`, `credit_card`, stores `current_balance`, nullable `credit_limit`.
  - `transactions`: Supports `income`, `expense`, `borrow_given`, `borrow_taken`, categorized, indexed on `date` and `user_id`.
  - `borrows`: Supports `pending`/`settled` status, tracks `person_name`, linked transaction ID.
  - `budgets`: Configurable monthly limit per category or overall (NULL category), with unique constraint per user/category/month.
  - Automatic balance trigger `trigger_update_account_balance` maintains `accounts.current_balance` on insert/update/delete.
  - Row Level Security (RLS) fully enabled on every table with strict `auth.uid() = user_id` check.
  - Realtime publication enabled on `accounts`, `transactions`, `borrows`, and `budgets` with `REPLICA IDENTITY FULL`.
  - Computed Postgres views:
    - `v_budget_summary`: Aggregates spend, computes remaining budget and percentage without requiring manual client math.
    - `v_account_overview`: Aggregates account metrics with `security_invoker = true`.
- [x] Created migration `20260924000002_default_accounts_trigger.sql` to auto-provision initial 'Primary Bank' and 'Cash Wallet' accounts upon user registration.
- [x] Successfully applied all migrations to remote Postgres 17.6 instance via `npx supabase db push`.

---

## Architectural Decisions & Rationale

1. **UI Library: React Native Paper vs Tamagui**
   - **Decision**: React Native Paper.
   - **Reasoning**: React Native Paper has zero native-compiler complexity, battle-tested Hermes support on Android, and predictable styling. We override MD3 default elevated drop-shadows with 1px subtle borders (`#334155`) to achieve the data-dense, flat Cred/Walnut aesthetic requested.
2. **State Management & Offline/Optimistic Engine**
   - **Decision**: Zustand with AsyncStorage persistence.
   - **Reasoning**: Extremely lightweight, no boilerplate, seamless optimistic mutations (immediate UI balance update followed by background sync and rollback on error).
3. **Color Palette & Design Tokens**
   - **Background**: Deep Slate `#0B1120` / `#0F172A`
   - **Surfaces**: `#1E293B`
   - **Single Accent**: Crisp Emerald Mint `#00D09C`
   - **Alert/Expense**: `#FF5A5F`
   - **Spacing**: Strict 4, 8, 12, 16, 24px scale
   - **Typography**: Heavy tabular figures for hero currency/balances, clean system sans for labels.

---

## What's Next
- [ ] Initialize Expo dev-client scaffold with TypeScript.
- [ ] Configure dependencies (`react-native-reanimated`, `react-native-paper`, `@supabase/supabase-js`, `@react-navigation`).
- [ ] Implement Auth flow (Sign Up, Sign In, Session restoration).
- [ ] Implement optimistic Zustand store & Supabase Realtime subscriptions.
- [ ] Build Core Screens:
  - Dashboard (Hero balance count-up, budget progress, recent transactions).
  - Add Transaction (Tactile keypad/form, instant optimistic append).
  - Budgets (Overall & per-category progress).
  - Borrows (Lent/Owed list with instant settle toggle).
