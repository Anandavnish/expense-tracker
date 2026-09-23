# Personal Finance Tracker — Progress & Architecture Log

## Project Overview
Foundational architecture build for a high-performance cross-platform personal finance mobile app built for Android using Expo Dev Client, React Native Reanimated, React Native Paper, Zustand, and Supabase.

---

## Repository Structure
```
/
├── PROGRESS.md            # Comprehensive build log and architecture decisions
├── supabase/              # Supabase CLI configuration, versioned SQL migrations
│   ├── config.toml
│   └── migrations/
│       ├── 20260924000001_initial_schema.sql
│       └── 20260924000002_default_accounts_trigger.sql
└── app/                   # Expo dev-client mobile application (renamed from temporary scaffold)
    ├── package.json       # App metadata ("name": "app") and dependencies
    ├── app.json           # Expo config ("name": "Expense Tracker", "slug": "expense-tracker")
    ├── babel.config.js    # Reanimated plugin configuration
    ├── tsconfig.json
    ├── .env               # Supabase project URL & Anon Key
    ├── assets/
    └── src/
        ├── theme/         # Strict tokens (4/8/12/16/24px spacing, deep slate, emerald accent)
        ├── types/         # TypeScript database & view models
        ├── services/      # Supabase client with AsyncStorage session persistence
        ├── store/         # Zustand stores (authStore, optimistic financeStore)
        ├── components/    # ReanimatedNumber, TactileButton, TransactionRow, InlineError
        ├── navigation/    # RootNavigator, AuthStack, MainTabs
        └── screens/       # Login, SignUp, Dashboard, AddTransaction, Budgets, Borrows
```

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
- [x] Applied all migrations to remote Postgres 17.6 instance via `npx supabase db push`.

### 2. App Scaffold & Repository Structure
- [x] Consolidated mobile codebase inside `/app/` matching standard clean structure.
- [x] Verified `app/package.json` "name" is `"app"`.
- [x] Verified `app/app.json` contains sensible identifiers:
  - `"name": "Expense Tracker"`
  - `"slug": "expense-tracker"`
  - `"package": "com.expensetracker.app"`
- [x] Ran `npm install` inside `/app/` — 0 errors, up to date.
- [x] Ran `npx expo-doctor` inside `/app/` — passed 21/21 health checks.
- [x] Ran `npx tsc --noEmit` inside `/app/` — 0 TypeScript compilation errors.

### 3. Design Tokens & Visual Direction
- [x] Built `app/src/theme/tokens.ts` and `app/src/theme/theme.ts`:
  - Enforced strict 4/8/12/16/24px spacing scale.
  - Charcoal/Slate dark theme (`#0B1120`, `#0F172A`, `#1E293B`, `#27354A`).
  - Single crisp emerald accent (`#00D09C`), alert/expense coral (`#FF5A5F`), warning amber (`#F59E0B`).
  - 1px subtle borders (`#334155`) with flat elevation (no floating drop shadows).
  - Tabular figure typography (`fontVariant: ['tabular-nums']`) for hero balances and currency values.

### 4. Authentication Flow
- [x] Created `app/src/store/authStore.ts` using Supabase Auth with automatic session persistence and restoration via AsyncStorage.
- [x] Created `LoginScreen.tsx` and `SignUpScreen.tsx` with high-contrast inputs and tactile feedback.
- [x] Created `AuthStack.tsx` and `RootNavigator.tsx` routing dynamically between Auth Stack and Main App Tabs.

### 5. Optimistic State Management & Realtime
- [x] Created `app/src/store/financeStore.ts`:
  - Instant local mutations: `addTransactionOptimistic`, `toggleSettleBorrowOptimistic`, `addBorrowOptimistic`, `setBudgetOptimistic`, `createAccountOptimistic`.
  - State snapshotting before mutation with automatic rollback and `InlineError` banner on network failure.
  - Multi-table Supabase Realtime channel subscriptions (`accounts`, `transactions`, `borrows`, `budgets`) keeping cross-session data synchronized without manual refresh.
  - Local disk caching via AsyncStorage for instant screen rendering on relaunch.

### 6. Core Screens Built
- [x] **Dashboard (`DashboardScreen.tsx`)**:
  - Hero Total Net Worth balance card with snappy count-up animation (`ReanimatedNumber`).
  - Realtime status indicator and horizontal accounts breakdown pills with individual balances.
  - Monthly budget progress card pulling live from `v_budget_summary` with dynamic color thresholds.
  - Recent transactions list (last 8) with clean empty state.
  - Pull-to-refresh control.
- [x] **Add Transaction (`AddTransactionScreen.tsx`)**:
  - Type selector (Expense, Income, Lent, Borrowed).
  - Hero amount input with tabular figures.
  - Account horizontal selector and category chip grid.
  - Date picker with quick toggles (Today, Yesterday) and optional note.
  - Borrow person name input when Lent/Borrowed is selected (auto-records to both transactions and borrows).
  - Non-blocking optimistic submit with instant redirection to Dashboard.
- [x] **Budgets (`BudgetsScreen.tsx`)**:
  - Overall monthly spend vs limit card with remaining balance and percentage progress bar.
  - Category breakdown cards pulling directly from `v_budget_summary`.
  - Collapsible "+ Set Budget" form for setting overall or per-category monthly limits.
- [x] **Borrows (`BorrowsScreen.tsx`)**:
  - Total Pending vs Settled summary cards.
  - Status filter tabs (All, Pending, Settled).
  - Lent/Owed entries with instant one-tap Settle/Reopen toggle (`toggleSettleBorrowOptimistic`).
  - Collapsible "+ Add Entry" form for quickly recording loans and splits.

---

## Architectural Decisions & Rationale
1. **Repository Structure**: Mobile code cleanly contained in `/app/`, with backend migrations in `/supabase/` and repo docs in `/PROGRESS.md`.
2. **Zustand + AsyncStorage**: Zero-overhead state management with predictable optimistic updates and disk caching.
3. **Reanimated Worklets**: Installed `react-native-worklets` matching Expo SDK 57 for crash-free UI-thread animations.
4. **Flat Card Elevation**: React Native Paper default elevated shadow styling was customized with 1px `#334155` borders to achieve the requested clean, data-dense Cred/Walnut look.
5. **Trigger-Driven Balances**: Database-level triggers keep `accounts.current_balance` accurate in Postgres while the client optimistically mirrors the exact balance calculation locally before the Realtime payload arrives.

---

## Next Steps / Future Enhancements (Post-Groundwork)
- Screenshot OCR / share-intent parsing (requires dev-client native builds).
- Gemini AI financial overview & BYOK API key settings modal.
- CSV/PDF statement export.
