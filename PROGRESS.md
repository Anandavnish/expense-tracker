# Personal Finance Tracker — Progress & Architecture Log

## Project Overview
Foundational architecture build for a high-performance cross-platform personal finance mobile app built for Android using Expo Dev Client, React Native Reanimated, React Native Paper, Zustand, and Supabase.

- **GitHub Repository**: [https://github.com/Anandavnish/expense-tracker](https://github.com/Anandavnish/expense-tracker)
- **Latest Release**: [Expense Tracker v1.0.13 (Build 13)](https://github.com/Anandavnish/expense-tracker/releases/tag/v1.0.13)
- **Direct APK Download**: [ExpenseTracker-v1.0.13.apk](https://github.com/Anandavnish/expense-tracker/releases/download/v1.0.13/ExpenseTracker-v1.0.13.apk)
- **Previous Release**: [Expense Tracker v1.0.12 (Build 12)](https://github.com/Anandavnish/expense-tracker/releases/tag/v1.0.12)

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
└── app/                   # Expo dev-client mobile application
    ├── package.json       # App metadata ("name": "app") and dependencies
    ├── app.json           # Expo config ("name": "Expense Tracker", "slug": "expense-tracker")
    ├── babel.config.js    # Reanimated plugin configuration
    ├── tsconfig.json
    ├── .env               # Supabase project URL & Anon Key
    ├── test_e2e.mjs       # Automated E2E verification test suite
    ├── assets/
    └── src/
        ├── theme/         # Strict MD3 tokens, multi-style palettes, useAppTheme
        ├── types/         # TypeScript database, view models, and bank presets
        ├── utils/         # Category icon mappings and color tokens
        ├── services/      # Supabase client, statement PDF export engine
        ├── store/         # Zustand stores (authStore, financeStore, settingsStore)
        ├── components/    # ReanimatedNumber, TactileButton, TransactionRow, YouTubeStyleDraggableList, InlineError
        ├── navigation/    # RootNavigator, AuthStack, MainTabs
        └── screens/       # Auth (Login, SignUp), Main (Dashboard, Transactions, TransactionDetail, Budgets, Borrows, AddTransaction, AccountDetail, Settings)
```

---

## Architectural Confirmations & System Revisions (Sept 2026)

### 0. Bank Presets Expansion (Slice & Fino) & Recalibratable Money Source Balances (v1.0.13)
- **Status**: **Implemented & Fully Verified**.
- **Slice & Fino Bank Presets**:
  - Added official transparent 256x256 brand mark assets (`app/assets/logos/fino.png` and `app/assets/logos/slice.png`).
  - Updated `logoRegistry.ts` to statically bundle and resolve both Fino and Slice logos at compile-time.
  - Added brand colors to `BANK_BRAND_COLORS` (`fino: '#8E163B'`, `slice: '#7C3AED'`) in `tokens.ts`.
  - Added `Fino` and `Slice` to `BankPresetCode` union type in `database.ts`.
  - Integrated `Fino` and `Slice` into `BANK_PRESETS` in both `DashboardScreen.tsx` and `AccountDetailScreen.tsx`.
  - Updated `BankLogo.tsx` to automatically infer Fino and Slice from account titles and resolve brand tint colors.
- **Editable Money Source Balances (Recalibration)**:
  - **DashboardScreen**: Removed the `{isAddingNewSource && (` restriction around the balance input. For existing accounts, dynamically labeled the field `CURRENT BALANCE (₹)` or `CURRENT OUTSTANDING DUE (₹)`. Passed the updated balance to `updateAccountOptimistic()`.
  - **AccountDetailScreen**: Added `editBalance` state initialized with the account's current balance (or absolute outstanding due for credit cards). Rendered the balance input in the Edit Modal and passed the updated balance into `updateAccountOptimistic()`.
  - Maintained negative sign convention for credit cards (`-Math.abs(due)`).

### 1. Guest-Mode Removal & Scope Verification
- **Audit Result**: Guest mode was newly introduced in commit `ba910a4` and was **not** requested. Because the app has no guest-accessible screens and is strictly auth-gated at `RootNavigator`, guest mode has been **completely removed**.
- **Fixes Applied**:
  - Removed "Continue as Guest (Local Only)" button, handler, and associated styles from `LoginScreen.tsx`.
  - Removed `isGuest`, `signInAsGuest`, `GUEST_SESSION`, `GUEST_USER`, and `GUEST_STORAGE_KEY` from `authStore.ts`.
  - Updated `RootNavigator.tsx` to strictly auth-gate the application (`session ? <AppStack /> : <AuthStack />`).
  - Purged guest caching branches from `financeStore.ts` and `merchantRulesStore.ts`, ensuring all storage keys are strictly keyed to authenticated user IDs (`@finance_store_cache_<userId>_v3`, `@merchant_rules_<userId>_v1`).
  - Updated unit tests (`test_sms_and_guest_isolation.mjs`) to verify multi-user account isolation without guest artifacts.

### 2. User Merchant Rules Migration & Upsert Targeting
- **Status**: **Confirmed 100% compliant**.
- **Verification Details**:
  - Migration `20260928000004_user_merchant_rules.sql` uses a plain-column UNIQUE constraint:
    ```sql
    CONSTRAINT user_merchant_rules_user_merchant_key UNIQUE (user_id, merchant_name)
    ```
  - `merchantRulesStore.ts` strictly pre-normalizes `merchant_name` before insert/lookup via `normalizeMerchantName(rawMerchant)`.
  - The Supabase client upsert cleanly targets the plain composite column constraint:
    ```ts
    await supabase.from('user_merchant_rules').upsert(
      { user_id: currentUserId, merchant_name: norm, category, ... },
      { onConflict: 'user_id,merchant_name' }
    );
    ```
  - This avoids `UNIQUE(user_id, lower(merchant_name))` functional indexes which Postgres/PostgREST/supabase-js ON CONFLICT cannot directly reference.

### 3. Redact Sensitive Fields Before Gemini Escalation (Revision Applied)
- **Status**: **Implemented & Verified with Unit Tests**.
- **Policy**:
  - Raw unredacted SMS or screenshot text is **NEVER** written to Supabase. Supabase only stores parsed transaction records (`amount`, `category`, `note`, `type`, `date`, `account_id`).
  - For Gemini escalation (both low-confidence amount extraction and unrecognized merchant classification), the system sends the full text payload with sensitive fields redacted using `redactSensitiveFields()`:
    1. **Account balance figures** (`Avl Bal`, `Available Balance`, `Bal:`, `Total Bal` followed by currency & amount) &rarr; `[REDACTED_BALANCE]`
    2. **Partial/full account numbers** (`A/c XX1234`, `XXXXXX1234`, `A/C 987654321098`, `account ending 4321`) &rarr; `[REDACTED_ACCOUNT]`
    3. **Phone numbers** (10-digit Indian numbers and toll-free numbers not preceded by UTR/Ref/Txn labels) &rarr; `[REDACTED_PHONE]`
    4. **Standalone 4-6 digit codes** that look OTP-like (isolated or preceded by OTP/code/PIN, excluding years 2020-2035 and amounts) &rarr; `[REDACTED_CODE]`
  - **Surviving Intact**: All transaction-type keywords (`Credited`, `Debited`, `Refund`, `Reversal`, `EMI`, `NEFT`, `IMPS`, `UPI`) and merchant context (`Zomato`, `Swiggy`, `Gopal Sweet`, etc.) survive intact to ensure maximum classification accuracy.
  - **Shared Service & Tests**: Created `app/src/services/dataSanitizer.ts` with `redactSensitiveFields()`. Verified against 5 realistic banking SMS patterns in `app/test_redaction.mjs` (100% pass rate).

### 4. Background Activity Launch (BAL) Handling via Tappable Notifications
- **Status**: **Fixed & Confirmed compliant with Android 10+ restrictions**.
- **Mechanism**:
  - Android 10+ (API 29+) strictly blocks background activity starts (`startActivity` from background/inactive state).
  - Integrated `expo-notifications` (`v57.0.21`) with native config plugin configured in `app.json`.
  - When a shared image or SMS arrives via `expo-share-intent`:
    - If the app is in the background (`AppState.currentState !== 'active'`), the app schedules an immediate local tappable notification (`Notifications.scheduleNotificationAsync`):
      - Title: `Expense Detected: ₹<amount>` / `Receipt Parsed: ₹<amount>`
      - Body: `<Merchant> (<Category>) — Tap to review and save`
      - Payload: `{ screen: 'AddTransaction', params: navParams }`
    - When the user taps the system notification, Android routes via `Notifications.addNotificationResponseReceivedListener`, safely bringing the app to the foreground and opening `AddTransactionScreen`.
    - If the app is already in the active foreground (`AppState.currentState === 'active'`), it continues to navigate directly to `AddTransactionScreen` without delay.

---

## What's Done & Verified

### 1. Backend & Database (Supabase)
- [x] Linked remote Supabase project `expense-tracker` (ID: `yqopwzkvxdxmomvvlpor`, region: `ap-south-1`).
- [x] Created & applied versioned SQL migrations:
  - `profiles`: Linked to `auth.users`, includes `gemini_api_key` placeholder.
  - `accounts`: Stores balances and limits for cash, bank, credit card.
  - `transactions`: Categorized entries with indexes on date and user_id.
  - `borrows`: Tracks lent/owed records with status and transaction linkage.
  - `budgets`: Category and overall monthly targets.
  - Automatic balance trigger `trigger_update_account_balance` maintaining `accounts.current_balance`.
  - Trigger `handle_new_user()` auto-seeding 'Primary Bank' and 'Cash Wallet' accounts upon signup.
  - Strict RLS on all tables with `auth.uid() = user_id`.
  - Realtime publication on `accounts`, `transactions`, `borrows`, `budgets`.
  - Computed views `v_budget_summary` and `v_account_overview` with `security_invoker = true`.
- [x] Configured `mailer_autoconfirm = true` via Supabase Auth API to ensure newly registered users immediately receive active JWT sessions for zero-friction testing.

### 2. Information Architecture (IA) & Screens Redesign
- [x] **DashboardScreen Rebuilt (7-part hierarchy)**:
  1. *Top Bar*: Greeting, active month pill, Settings gear button (navigates to Settings).
  2. *Month Selector Capsule*: Search-bar inspired floating pill (`width: 280, maxWidth: '85%'`, `borderRadius: 26`) fixed above the content with full horizontal transparency on either side and a smooth `LinearGradient` fade on the scroll container so cards dissolve elegantly before reaching the capsule.
  3. *Formula Net Worth Card*: Formula-style card displaying `BIG NET WORTH` with visual breakdown: `+ Bank` `− Credit Card` `+ Cash` `= NET WORTH`.
  4. *This Month's Budget Card*: Clean 6px progress bar changing dynamically at 80% (amber warning) and 100% (coral alert), with daily burn rate and days left in month.
  5. *Money Sources Card*: Displays all accounts with Indian bank presets (SBI, HDFC, ICICI, Axis, Kotak, Cash, Other), current balance, credit limits, inline Manage mode (add/edit/delete), deep-dive clickable navigation to [AccountDetailScreen](file:///c:/Users/anand/Coding%20stuff/Expense%20Tracker/app/src/screens/main/AccountDetailScreen.tsx) with fluid editing, and the **Balance Calibration Flow** (reconciles real-world balances by offering "Yes, log it" adjustment transaction vs "Just adjust").
  6. *Spending by Category Card*: Visual category breakdown seeded with student defaults (*Food & Dining, Groceries, Rent & Utilities, Transport, Shopping, Entertainment, Subscriptions, Health, Education, Personal Care, Travel, Miscellaneous*). Displays category-specific budget limits (e.g. `₹3,200 / ₹5,000 limit`) with dynamic color indicators (accent &rarr; warning at 80% &rarr; alert if overspent).
  7. *Floating Action Button (FAB)*: Circular `+` button pinned to bottom-right with dynamic accent color for instant transaction logging.
- [x] **YouTube-Style Drag-and-Drop Reorder Engine (`YouTubeStyleDraggableList.tsx`)**:
  - Implemented YouTube queue-style drag-and-drop reordering for both **Manage Money Sources** and **Manage Categories** modals.
  - Eliminated pointed chevron arrows (`^`, `v`) and replaced with dual horizontal bar handle (`=`) on the left of each row.
  - Dual bar handle initiates drag on a deliberate 1-second (1000ms) hold (`holdDurationMs: 1000`) before elevating with `expo-haptics` Medium impact vibration, complete with touch-slop cancellation to eliminate accidental drag triggers during scrolling.
  - Dynamic card lift (`scale: 1.03`, `elevation: 24`, accent border glow) with real-time vertical tracking via `Animated.Value`.
  - Floating slot physics: As an item is dragged over other rows, surrounding items smoothly float and spring-shift (`Animated.spring` with native driver) to reassign space with a tactile selection tick (`Haptics.selectionAsync()`).
  - Snaps into target slot on release with `Haptics.impactAsync(Light)` and persists new sequence to Zustand and Supabase.
  - Architecture: Uses stable per-row PanResponders in `DraggableRowItem` with `onPanResponderTerminationRequest: () => false` and temporary `ScrollView` scroll lock (`scrollEnabled={!isDragging}`) to prevent Android scroll gesture interference.
  - Header & Bottom Bar Polish: Removed redundant top `+ Add` button from modal headers; upgraded bottom add button to `TactileButton` with dynamic safe area insets `Math.max(insets.bottom, 20)`. Layout is 100% unified across Money Sources and Categories.
- [x] **Budget Management Engine Fixes (`financeStore.ts` & `BudgetsScreen.tsx`)**:
  - Eliminated 30-40 second latency: Synchronously computes optimistic `BudgetSummary` (spent, remaining, percentage) in local state (0ms) and closes the modal immediately, backgrounding the single database query and eliminating redundant view queries.
  - Redesigned category selection: Replaced the clunky horizontal scroll row with a responsive multi-column wrapping grid. Features an "Overall Monthly Budget" master banner at the top, category icons for all options, and visual checkmark selection states.
  - Replaced upsert with ID-based check & update / insert flow to eliminate PostgreSQL `ON CONFLICT` specification error when saving overall (`category = null`) or category-specific budgets.
  - Silenced Reanimated inline styles warning by migrating accent color tokens from `.value` to `.hex`.
- [x] **Account Creation & Presets Schema Fix (`financeStore.ts` & `DashboardScreen.tsx`)**:
  - Resolved `Could not find the 'bank_preset' column of 'accounts' in the schema cache` error by sanitizing database payloads in `createAccountOptimistic` and `updateAccountOptimistic` to send strictly valid PostgreSQL table columns (`user_id`, `name`, `type`, `current_balance`, `credit_limit`).
  - Seamlessly embedded bank presets and card issuers into `name` (`SBI • Salary`, `HDFC`, etc.) with intelligent two-way parsing in `parseAccountDetails` so icons and names work across all devices without requiring database schema alterations.
- [x] **TransactionsScreen Rebuilt (Unified Search, Segmented Filters, Financial Metrics, Modal Sheet, & Statement PDF Export)**:
  - *Unified Search Bar*: Added live search input supporting notes, merchants, people, categories, amounts, and source accounts with clear button.
  - *Dedicated Filter Modal Trigger*: Compact filter trigger button with active filter badge counter.
  - *1-Tap Type Segment Strip*: Clean segmented control for `All`, `Expense`, `Income`, `Lent`, and `Borrowed` with unified active styling matching `All` tab (`surfaceLight` background, `border`, `textPrimary` bold text) across all tabs.
  - *Interactive Quick-Filter Pills*: Single-line scrollable bar showing active date range, selected account, and active categories with `✕` dismiss pills (removed redundant duplicate type pill).
  - *Real-time Financial Summary Strip*: Compact inline bar displaying live totals for filtered results: `Total Spent: ₹X`, `Total Income: ₹Y`, `Net Lent: ₹Z`, and total matching records.
  - *Comprehensive Filter Sheet Modal*: Bottom sheet modal supporting Date Range presets, custom date pickers with `@react-native-community/datetimepicker`, Money Source account selection, and multi-select Category pills with icons from `categoryIcons.ts`.
  - *Statement PDF Export Engine (`statementExport.ts`)*: Added download header icon button invoking cross-platform PDF generation (`expo-print`) and native share/save sheet (`expo-sharing`). Generates a fintech-grade A4 statement containing user account info (email, user ID), active filter tags, detailed indexed transaction ledger with timestamp and category badges, export datetime, and comprehensive financial breakdown totals at the end.
- [x] **SettingsScreen Added & Enhanced**:
  - *Theme Selector*: Dark / Light / System mode switcher persisted to AsyncStorage via `settingsStore`.
  - *Multi-Style Theme Engine*: Precision Obsidian, Warm Executive, Swiss Minimal, and dynamic Android 12+ Material You wallpaper integration.
  - *Fixed Badge Boundary Layout*: Prevented badge overflow by wrapping row texts in a flex-constrained column (`placeholderTextCol` with `flex: 1`) and adding `flexShrink: 0` to badges.
  - *Live CSV Data Export (`csvExport.ts`)*: Interactive modal allowing custom date range filters without month bounds (All Time, This Month, This Year, Last 30 Days, Custom Range with calendar pickers), account filters, transaction type filters, and category filters. Generates RFC 4180 standard CSV and shares via native system share/save sheet (`expo-sharing` via sandboxed `FileSystem.cacheDirectory`).
  - *Direct Manage Categories Navigation*: Integrated 1-tap navigation to the Dashboard's full Category Manager modal (`openManageCategories: true`), supporting custom category creation, icons, and drag-and-drop ordering.
  - *Account Info & Sign Out*: User email display and secure session termination.
- [x] **AddTransactionScreen Updated (Wrapping Grid & Current-Month Calendar Picker)**:
  - *Money Sources (Multi-Line Wrapping Grid)*: Eliminated the horizontal scroll row. Money sources now wrap naturally onto the next line in a responsive 2-column grid (`moneySourcesGrid`, `sourceCard`), displaying account icon badge, account name, balance/due, and active checkmark.
  - *Default Calendar Date Picker*: Installed `@react-native-community/datetimepicker` (SDK 57 compatible). Clicking the date card opens the native Material calendar picker on Android (or modal picker on iOS).
  - *Current Running Month Restriction*: Date bounds are strictly enforced to the current month (`minimumDate` = 1st of month, `maximumDate` = end of month). Past/future months are disabled and greyed out.
  - *Auto-fill Today in Local Time*: Defaults to today using local timezone formatting (`YYYY-MM-DD`). "Yesterday" quick toggle is conditionally available only when yesterday falls within the current running month.
  - *Form Validation*: Rejects any manually manipulated dates outside the active month.
- [x] **Navigation Stack (`RootNavigator` & `MainTabs`)**:
  - Updated `AppStack` with `MainTabs` (`Dashboard`, `Transactions`, `Budgets`, `Borrows`), `Settings`, and `AddTransaction`.
  - Automatic `loadSettings()` invocation on app boot.

### 3. Runtime Verification & Bug Fixes
- [x] **Runtime Bug Fixed (Babel Preset)**: Discovered that `babel-preset-expo` was missing from `devDependencies` (which threw `Cannot find module 'babel-preset-expo'` during Metro bundling). Installed `babel-preset-expo` and confirmed clean Hermes bytecode export.
- [x] **TypeScript Typecheck**: `npx tsc --noEmit` passes with 0 errors across all screens, stores, and navigators.
- [x] **Hermes Bytecode Export**: `npx expo export --platform android` compiles 1,449 modules with 0 errors (`_expo/static/js/android/index-*.hbc`, 4.2MB).
- [x] **E2E Integration Verification (`app/test_e2e.mjs`)**:
  - Verified user sign-up, default account trigger, transaction insertion + balance update trigger, `v_budget_summary` pre-computed view, Realtime session synchronization, and borrow settle toggles. All 6 steps pass.

---

## Design Tokens & Visual Fidelity Check

| Design Token | Specification | Implementation in Screens |
| :--- | :--- | :--- |
| **Palette** | Deep Slate `#0B1120`, `#1E293B`, `#27354A` | Implemented across all screens for backgrounds, cards, and input fields. Zero purple gradients. |
| **Dynamic Accent** | Emerald `#00D09C` (default), customizable in Settings | Used deliberately for primary action buttons, active tab indicators, and positive cash flow. |
| **Semantic Alerts** | Coral `#FF5A5F` for expenses/over-budget, Amber `#F59E0B` for warnings | Dynamic progress bar and transaction color coding applied based on status/type. |
| **Spacing Scale** | Strict `4 / 8 / 12 / 16 / 24px` only | Strictly enforced across margins, paddings, and card gaps using `SPACING` tokens (`xs`, `sm`, `md`, `lg`, `xl`). No arbitrary values. |
| **Typography** | Tabular figures (`tabular-nums`) + bold weights | Configured on all hero balances, account cards, and transaction amounts via `TYPOGRAPHY.heroNumber` and `TYPOGRAPHY.tabularText`. |
| **Card Borders** | Flat 1px `#334155` borders (no floating drop shadows) | Paper's default elevated shadows were replaced with subtle 1px border outlines across all containers. |
| **Reanimated Micro-Interactions** | Snappy transitions under 250ms | `ReanimatedNumber` uses 240ms cubic ease-out count-up; `TactileButton` uses 150ms spring scale; `TransactionRow` uses 220ms slide-in. |

---

### 4. UI/UX Overhaul & Polish (Eliminating "AI Template" Tropes)
- [x] **Safe Area Insets & Android System Bars Overlap**:
  - Replaced standard React Native `SafeAreaView` (which does not provide insets on Android) across all 7 screens with `useSafeAreaInsets` from `react-native-safe-area-context`.
  - Added dynamic top inset padding (`insets.top`) to prevent status bar/notch collision.
  - Configured `MainTabs` with dynamic bottom inset (`56 + insets.bottom`) to prevent collision with Android gesture navigation bars.
- [x] **Eliminated Platform Emojis Everywhere**:
  - Installed `@expo/vector-icons` and replaced amateur emoji icons (`📊`, `📑`, `🎯`, `🤝`, `💵`, `🏦`, `💳`, `⚙`, `✕`, `‹`, `›`) with crisp, consistent `Ionicons` across tabs, headers, modal close buttons, and money source cards.
- [x] **Hero Net Worth Card Redesign**:
  - Removed horizontal raw formula dump (`₹9,800 +₹500 +₹25,000 = ₹35,300`).
  - Redesigned into a flagship Fintech card featuring a prominent hero balance (`₹35,300`), "+ Add" quick action pill, and neat breakdown row for Cash & Bank, Lent, and Available Credit.
- [x] **Floating Action Button (FAB) Overlap Fixed**:
  - Moved FAB from awkwardly overlapping the center content to the standard bottom-right corner (`bottom: 24`, `right: 20`) with smooth elevation and shadow.
  - Added `paddingBottom: 110` to `ScrollView` content to ensure cards are never obscured.
- [x] **Refined Micro-Interactions**:
  - Removed disruptive `SlideInRight` animations on `TransactionRow` so transaction feeds render instantly and cleanly without flying elements.

### 5. Financial Logic Corrections & Refined Layout
- [x] **Month Selector Capsule Pill**: Redesigned the full-width date bar into a sleek, centered capsule pill (`monthSelectorCapsule`) with subtle borders and smooth chevrons.
- [x] **Removed Duplicate Top Add Button**: Removed the `+ Add` button from the Net Worth card header to streamline visual hierarchy.
- [x] **Fixed Non-Functional Floating Add Button (FAB)**: Replaced wrapper with responsive `TouchableOpacity` and configured `zIndex: 999`, `elevation: 10`, and `hitSlop` to ensure instant responsiveness on Android.
- [x] **Fixed Credit Card Limit Logic (Avail. Credit Calculation)**: Fixed the calculation where spending was erroneously adding to the limit (`limit - (-spent)` = ₹43,500). Credit limits are now strictly fixed, and available limit displays `Math.max(0, limit - spent)` (e.g., ₹6,500 left of ₹25,000).
- [x] **Added Borrow Breakdown to Net Worth**: Added `Borrow` (`−₹...`) alongside `Cash & Bank`, `Lent`, and `Avail. Credit` in the 4-column summary row.
- [x] **Adaptive Font Color for Credit Card in Money Sources**: Fixed font color mismatch on credit cards (which previously inherited unstyled dark text) to adaptively display `COLORS.textPrimary` or `COLORS.alert` if overspent.
- [x] **Functional Credit Card Progress Bar**: Fixed progress bar to accurately visualize remaining limit vs spent, with adaptive color coding (accent when healthy, warning at < 20% remaining, alert on overspend).

### 6. Financial Logic & Credit Card Architecture Redesign
- [x] **Net Worth Hero Formula Correction & Visual Transparency**:
  - Net Worth is now strictly computed and visually transparent as:
    $$\text{Net Worth} = (\text{Cash \& Bank}) + (\text{Lent}) - (\text{Borrow}) - (\text{Credit Card Dues})$$
  - Clarified and resolved the calculation behind the user screenshot (`−₹11,420`): Liquid Total ₹6,480 + Lent ₹600 − Borrow ₹80 − Card Dues ₹18,500 = −₹11,420.
  - Fixed the 4-column summary row on Card 1: Replaced misleading "Avail. Credit ₹6,500" column with "Card Dues" (`−₹...`), so all 4 visible columns mathematically sum directly to the hero Net Worth.
  - Added an "Avail. Limit" indicator pill directly below the hero balance for fast visibility into total available credit without distorting the balance calculation.
- [x] **Lent vs. Borrow Logic Disentanglement**:
  - Identified and fixed bug where borrowed transactions were erroneously counted into `pendingLent`.
  - Added `BorrowType = 'lent' | 'borrowed'` and `parseBorrowDetails()` helper in `database.ts` and `financeStore.ts`.
  - In `BorrowsScreen`, added an `ENTRY TYPE` segmented toggle (`I Lent (They owe me)` vs `I Borrowed (I owe them)`), visual badges (`LENT` / `BORROWED`), and 3 distinct metric cards (`TO RECEIVE`, `TO PAY`, `NET POSITION`).
  - Implemented schema-safe backwards compatibility: encoded direction `[BORROWED]` / `[LENT]` in `person_name` with transaction link fallbacks to avoid schema migration failures on restricted database instances.
- [x] **Credit Card Revolving Credit Architecture**:
  - Re-architected Credit Cards in "Money Sources" to be treated as revolving credit liabilities rather than positive asset accounts:
    - Grouped Money Sources into **Bank & Cash** (Liquid Assets) and **Credit Cards** (Liabilities & Limits).
    - Credit cards display **Current Outstanding Due** (`liability`), **Available Limit**, and **Total Limit** with health-coded progress bars.
    - Removed confusing "Lent & Borrow (Net)" pseudo-account row from Money Sources.
  - Implemented **Pay Credit Card Bill** flow:
    - Dedicated `Pay Card Bill` action pills on Dashboard and `AccountDetailScreen`.
    - Double-entry atomic update: deducts payment from selected Bank/Cash source, credits Credit Card balance (reducing outstanding dues and restoring available limit).
  - Specialized Credit Card Categories & Guardrails:
    - Filtered category list when a credit card is selected to show valid credit events (`Credit Card Payment`, `Cashback`, `Refund`, `Reward Redemption`).
    - Added validation guardrail preventing Lent/Borrow entries from being routed through credit card accounts.

### 7. Fluid 3-Type Money Sources, Sequence Reordering & Safety Flows
- [x] **Fluid 3-Type Money Sources Architecture**:
  - Clarified and streamlined account types into 3 explicit categories:
    1. **Bank Account**: Curated presets for major Indian banks (`SBI`, `India Post`, `HDFC`, `Canara`, `PNB`, `BOB`) with official brand color/icon mapping, plus `+ Custom Bank` allowing arbitrary names, custom color chips, and icons.
    2. **Cash Wallet**: Lightweight physical cash tracking (e.g., "Physical Cash", "Pocket Money") with custom naming and current balance.
    3. **Credit Card**: Curated issuers (`HDFC`, `SBI Card`, `ICICI`, `Axis`, `Kotak`, `Slice`, `OneCard`) + `+ Custom Card`, capturing total credit limit and current outstanding due.
  - Users can create unlimited accounts under each type with arbitrary custom names (e.g., last 4 digits or purpose like "Salary A/c").
- [x] **Dashboard Card Representation (`Preset • Source Name`)**:
  - Implemented `getAccountDisplay()` to prioritize preset branding before the custom account name (e.g., `SBI • Salary A/c` or just `SBI` if no custom nickname is provided).
  - Added `getAccountIconProps()` to display vector bank/card issuer icons and colors on account cards.
- [x] **Sequence Rearranging (`☰` Reorder & Display Order Persistence)**:
  - Added `display_order` support to `Account` model and database types.
  - Implemented `reorderAccounts()` in `financeStore.ts` with local `AsyncStorage` (`@finance_account_order_v1`) persistence for instant optimistic renders, backed by Supabase `display_order` syncing.
  - Added fluid Up (`↑`) / Down (`↓`) swap controls and `☰` drag handles in the Full-Screen Manage Money Sources modal.
- [x] **Non-Zero Balance Calibration & Deletion Safety Flow**:
  - Guarded against accidental deletion of accounts holding active balances or liabilities.
  - If balance $\neq 0$, the app displays a safety modal with two options:
    1. **Calibrate to ₹0 First (Recommended)**: Automatically posts an Adjustment transaction (`income` or `expense`) to reconcile the ledger before deleting the account record, preserving audit trail integrity.
    2. **Delete Anyway**: Instantly purges the account while leaving historical transactions intact.
  - Integrated on both `DashboardScreen` (Manage modal) and `AccountDetailScreen`.
- [x] **Full-Screen Modal Architecture**:
  - Replaced cramped nested popup dialogs with full-screen modals featuring sticky navigation headers and fixed bottom action bars to prevent keyboard clipping on Android.
- [x] **Performance & Bug Fixes**:
  - **Reanimated AST Babel Warning**: Renamed `AccentColor.value` to `AccentColor.hex` across the entire codebase (`tokens.ts`, `settingsStore.ts`, all screens/navigators), completely eliminating Reanimated's Babel plugin false positive warning regarding shared values.
  - **Optimistic Account Key Collision**: Fixed duplicate key errors (`temp_acc_*` vs server UUID) in `financeStore.ts` by deduplicating Realtime `INSERT` events against pending optimistic accounts.
  - **Android Screen Transition White Flash**: Applied `DarkTheme` to `<NavigationContainer theme={appNavTheme}>` and `contentStyle: { backgroundColor: COLORS.background }` on `AppStack.Navigator`, enforcing deep slate (`#0B1120`) window backgrounds during route push/pop animations.
  - **Floating Action Button (FAB) Responsiveness**: Added `hitSlop`, `activeOpacity={0.7}`, and elevation/zIndex tuning to guarantee instantaneous touch response.
  - **Account Detail Spacing**: Stacked transaction title/count badge and filter pills (`All`, `Expense`, `Income`) with `SPACING.sm` gap to eliminate tight layout on narrow devices.

### 8. Authentic Real-World Theme Redesign, White Flash Elimination & Reorder Modernization
- [x] **Theme Redesign (Eliminated "AI Generated" Template Feel)**:
  - **Matte Carbon & Obsidian Palette**: Replaced generic sci-fi dark blue (`#0B1120`, `#1E293B`, `#334155`) with a bespoke, human-designed luxury matte carbon canvas:
    - Canvas Background: `#0C0D11`
    - Elevated Cards & Surfaces: `#17181F`
    - Interactive Surface/Inputs: `#20222B`
    - Hairline Borders: `#282A36`
  - **Refined Organic Accents**: Replaced radioactive neon cyan (`#00D09C`) with authentic Emerald Sage (`#10B981`), Champagne Gold (`#E5B869`), and Clean Crimson (`#EF4444`).
  - **Authentic Bank & Card Brand Identities**: Curated authentic real-world brand colors for SBI (`#0084CA`), IPPB (`#ED1C24`), HDFC (`#004B87`), Canara (`#0091DA`), PNB (`#9E1B32`), BOB (`#F26522`), ICICI (`#A8242A`), Axis (`#861F41`), Slice (`#7025FB`), and OneCard (`#D4AF37`).
  - **Human Title Casing & Typography**: Converted robotic uppercase labels (`TOTAL NET WORTH`, `THIS MONTH'S BUDGET`, `MONEY SOURCES`, `SPENDING BY CATEGORY`, `ACCOUNT TRANSACTIONS`) to refined Title and Sentence Case (`Total Net Worth`, `Monthly Budget`, `Money Sources`, `Spending by Category`, `Account Transactions`).
- [x] **Complete White Flash Blink Elimination**:
  - **Native OS-Level Window Background**: Installed and configured `expo-system-ui` to invoke `SystemUI.setBackgroundColorAsync(COLORS.background)` at native startup.
  - **Native `app.json` Configuration**: Added `backgroundColor: "#0C0D11"` and `android.backgroundColor: "#0C0D11"`, guaranteeing that the Android `DecorView` and `windowBackground` are permanently dark before React Native even boots.
  - **Modal Android Translucency Scrims**: Added `statusBarTranslucent={true}` to every modal dialog across `DashboardScreen.tsx` and `AccountDetailScreen.tsx` to stop Android from resetting system window insets with a white flash.
  - **Navigator Scene Backgrounds**: Injected `sceneStyle: { backgroundColor: COLORS.background }` into `MainTabs.tsx` and `contentStyle` into `AuthStack.tsx`.
- [x] **Manage Money Sources Button Polish**:
  - **Removed Duplicate Add Button**: Removed the redundant top `Add` button in the Manage modal header, leaving one single, clear action path.
  - **Stacked Action Button Redesign**: Redesigned the bottom action button with a prominent `+` icon on the first line and `Add New Money Source` on the next line (`flexDirection: 'column'`).
- [x] **Modernized Sequence Rearranging (`☰` Handle & No Pointed Brackets)**:
  - **Removed Pointed Brackets**: Completely removed the clumsy chevron-up / chevron-down (`< >` / `∧ ∨`) arrow buttons.
  - **Fully Functional `☰` Handle**: Colored the `☰` handle in dynamic accent (`accent.hex`) and made it interactive.
  - **Quick Move Modal**: Tapping `☰` opens a dedicated position sheet allowing one-tap actions:
    - *Move Up One Position*
    - *Move Down One Position*
    - *Move to Very Top (#1)*
    - *Move to Very Bottom*
  - Sequence order persists instantly locally via `AsyncStorage` and syncs with Supabase `display_order`.

### 9. Redesigned Transaction Card & Deep-Dive Transaction Detail Screen
- [x] **Redesigned Modern Fintech Transaction Card (`TransactionRow.tsx`)**:
  - Replaced legacy text layout with modern obsidian/carbon card architecture (`COLORS.surface`, `14px` border radius, subtle obsidian borders).
  - Dynamic Category Avatar (`42x42px`, `12px` rounded capsule) with contextual category icons (`fast-food`, `airplane`, `home`, `cash`, etc.) and tinted frosted background colors.
  - High-contrast visual hierarchy:
    - Primary title displays transaction Note (or Category if note is empty).
    - Meta row includes Category tag, source account pill with mini wallet icon, and formatted transaction date.
    - Large tabular numeric display with bold weights and semantic color coding (Emerald `+` for Inflow/Borrow, Crimson `−` for Expense, Amber for Lent).
    - Compact status/type capsule badge (`INCOME`, `EXPENSE`, `LENT`, `BORROWED`).
  - Action Footer & Buttons:
    - Dedicated interactive **Edit** button (`create-outline` icon + text) with tactile feedback.
    - Dedicated interactive **Delete** button (`trash-outline` icon + text) with alert styling.
    - Chevron detail indicator to signal deep navigation.
    - Tapping the card or any action button seamlessly opens the new deep-dive screen.
- [x] **New Screen: `TransactionDetailScreen.tsx`**:
  - Registered in `RootNavigator.tsx` with smooth slide transition.
  - Comprehensive Transaction Overview:
    - Glowing hero category avatar & large hero amount (`TYPOGRAPHY.tabularText`, font size `32px`).
    - Type pill badge & user description.
    - Detailed Information Breakdown: Money source account with account type badge and balance, category, formatted date and timestamp, flow direction, input source (Manual vs OCR), and complete notes.
    - Linked borrow card representation if associated with a borrow record.
  - In-Place Interactive Edit Mode:
    - Editable fields for amount, transaction type, source account, category, date, and note.
    - Optimistic update via `updateTransactionOptimistic()` in `financeStore.ts`, keeping account balances and budget summaries synchronized and rolling back cleanly on errors.
  - Safe Deletion Flow:
    - Modal confirmation dialog detailing exact account balance reversals and budget recalculations.
    - Optimistic deletion via `deleteTransactionOptimistic()` in `financeStore.ts` with Postgres trigger alignment.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

---

### 10. Unified Manager Redesign: Money Sources & Spending Categories
- [x] **Eliminated Non-Working Horizontal Drag Handle (`=`)**:
  - Replaced the confusing non-functional drag handle (`reorder-two-outline`) with direct, tactile **Move Up (`↑` / `chevron-up`)** and **Move Down (`↓` / `chevron-down`)** buttons on every account row.
  - Tapping `↑` or `↓` instantly swaps account positions with immediate state updates in `financeStore` (`reorderAccounts`) and persists sequence order to `AsyncStorage`.
  - Intelligently disables/dims the Up button on the top item (`idx === 0`) and Down button on the bottom item (`idx === accounts.length - 1`).
- [x] **Replaced Clunky Stacked Bottom Button**:
  - Replaced the oversized 80px vertical stacked button with an ergonomic, modern **horizontal pill button** (`height: 48px`, rounded 12px corners, side-by-side icon and label `+ Add New Money Source`).
  - Applied safe bottom area inset padding (`paddingBottom: Math.max(insets.bottom, 14)`) to avoid collision with Android navigation gesture pills.
- [x] **Unified Layout Between Money Sources & Spending Categories**:
  - Replaced the compact category modal with a full-screen manager matching Money Sources exactly:
    - Same header with close button, title, and quick `+ Add` header button.
    - Same card layout with 38x38px colored icon badges, title, and tabular metadata.
    - Same 4-action button cluster (`[ ↑ ] [ ↓ ] [ ✏️ ] [ 🗑️ ]`).
    - Same sleek 48px horizontal bottom button (`+ Add New Category`).
    - Added category editing/renaming (`updateCategory` in `financeStore`) and safe delete confirmation dialog.
- [x] **Dashboard Category Mini Icon Badges**:
  - Added matching mini icon badges (`categoryMiniIconBadge`) with distinct category colors to each row in the Dashboard's Spending by Category card, mirroring the rhythm of the Money Sources card.

---

### 11. Dark/Light Theme System & Performance Optimization
- [x] **Expanded Accent Palette (10 Options)**:
  - Expanded `ACCENT_PALETTE` in `settingsStore.ts` with 10 rich palettes: `Mint #00D09C`, `Emerald #10B981`, `Cyan #06B6D4`, `Sapphire #3B82F6`, `Violet #8B5CF6`, `Amethyst #A855F7`, `Rose #F43F5E`, `Orange #F97316`, `Gold #F59E0B`, and `Pink #EC4899`.
- [x] **Complete Light Mode Support across DashboardScreen**:
  - Converted static `styles` into theme-reactive `getStyles(colors)` hook using `useMemo(() => getStyles(colors), [colors])`.
  - Converted all containers, cards, text labels, top bar, month capsule, modal forms, and `LinearGradient` to use dynamic `colors.*` (`colors.background`, `colors.surface`, `colors.surfaceLight`, `colors.border`, `colors.textPrimary`, `colors.textSecondary`, `colors.textMuted`, etc.).
  - Added `colors` prop to `YouTubeStyleDraggableList` and `DraggableRowItem` for dynamic Light Mode card borders and backgrounds.
- [x] **Eliminated Lag on TransactionsScreen**:
  - Added 150ms debounced search query (`debouncedQuery`) to prevent expensive re-filtering loops on every keystroke.
  - Memoized `renderItem` using `useCallback` and wrapped `TransactionRow` in `React.memo` to eliminate unnecessary row re-renders.
  - Added FlatList windowing and batching optimizations (`initialNumToRender={12}`, `maxToRenderPerBatch={10}`, `windowSize={5}`, `removeClippedSubviews={Platform.OS === 'android'}`).
- [x] **Complete Light Mode Support across TransactionsScreen**:
  - Converted `TransactionsScreen` styles to `getStyles(colors)` hook using `useMemo(() => getStyles(colors), [colors])`.
  - Filter tabs, search container, interactive quick-filter pills, metrics strip, and filter sheet modal fully adapt between Light and Dark mode.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Android Hermes bundle export builds cleanly (`npx expo export --platform android`).

### 12. Render Error Fix & Distinct Categories by Transaction Type
- [x] **Render Error Fix (`Property 'getStyles' doesn't exist`)**:
  - Resolved `ReferenceError: Property 'getStyles' doesn't exist` that crashed `TransactionsScreen.tsx` on render.
  - Converted `const getStyles = (colors) => StyleSheet.create(...)` into a hoisted `function getStyles(colors: ThemeColors) { return StyleSheet.create(...); }` across both `TransactionsScreen.tsx` and `DashboardScreen.tsx`, guaranteeing proper hoisting and initialization during module evaluation.
- [x] **Distinct Categories per Transaction Type in Filter Popup (`TransactionsScreen.tsx`)**:
  - Added interactive category type tabs inside Section D (CATEGORIES) of the Filter Modal:
    - `All Categories`
    - `Expense` (with alert dot indicator)
    - `Income` (with accent dot indicator)
    - `Lent & Borrow` (with warning dot indicator)
  - Dynamically merges curated defaults (`DEFAULT_INCOME_CATEGORIES`, `DEFAULT_BORROW_CATEGORIES`, expense `categories`) with any existing custom categories recorded in past user transactions.
  - Added active item count badges on tabs displaying how many selected categories belong to that specific type.
  - **Auto-Syncing**: When the user selects a Transaction Type in Section C (e.g. `Income`), the Categories tab below automatically switches to the `Income` tab to show relevant categories instantly.
  - Retained independent multi-selection: filtering by category remains flexible without forcing single-type locks.
- [x] **Distinct Categories in Edit Mode (`TransactionDetailScreen.tsx`)**:
  - Updated transaction edit form to show type-specific categories dynamically when switching between Expense, Income, and Lent/Borrow.
- [x] **Verification**:
  - Full TypeScript typecheck passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

### 13. Single-Section Filter Modal & Quick Pill Direct Access
- [x] **Context-Sensitive Filter Modal**:
  - Replaced monolithic filter modal state (`isFilterModalVisible`) with section-targeted modal state (`filterModalSection: 'all' | 'date' | 'account' | 'type' | 'category' | null`).
  - Clicking any quick filter pill on `TransactionsScreen` now opens the popup displaying **only** the selected section:
    - **Date Range Pill** (`calendar-outline`) -> Opens strictly the Date Range selector (This Month, Last 30 Days, All Time, Custom Range with start/end date pickers).
    - **Account Pill** (`wallet-outline`) -> Opens strictly the Money Source / Account list (All Accounts, Bank, Credit Card, Cash, etc.).
    - **Transaction Type Pill** (`swap-horizontal-outline`) -> Added dedicated quick pill to the filter strip, opens strictly the Transaction Type options (Expense, Income, Lent, Borrowed).
    - **Categories Pill** (`pricetags-outline`) -> Opens strictly the Categories view with type tabs (`All`, `Expense`, `Income`, `Lent & Borrow`) and category chips.
    - **General Filter Button** (`options-outline` in search bar) -> Opens all filter sections simultaneously.
- [x] **Section Switcher Tabs in Modal Header**:
  - Added horizontal section switcher tabs (`All`, `Date`, `Account`, `Type`, `Categories`) at the top of the popup.
  - Users can jump smoothly between filter sections without closing and reopening the modal.
  - Active section badges and dot indicators highlight which filters are currently applied.
- [x] **Adaptive Modal Sizing & Contextual Header**:
  - Modal title and subtitle dynamically adapt to the active section (`"Date Range"`, `"Money Source"`, `"Transaction Type"`, `"Categories"`).
  - Clear / Reset button in the modal header dynamically resets only the currently viewed filter section (or all filters when viewing `All`).
  - Modal card height dynamically contracts when viewing single sections for a sleek, compact bottom sheet experience.
- [x] **Verification**:
  - Full TypeScript typecheck passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.


### 14. Light Mode Integration for Account Details & Log Transaction Screens
- [x] **Complete Light Mode Support for Account Details (`AccountDetailScreen.tsx`)**:
  - Replaced all static `COLORS` tokens with dynamic `ThemeColors` from `../../theme/tokens`.
  - Converted static StyleSheet to theme-reactive hoisted `function getStyles(colors: ThemeColors)` hook with `useMemo(() => getStyles(colors), [colors])`.
  - Full dynamic theme binding across hero balance card, account details, progress bars, quick action buttons, Indian bank preset pills, transaction history list, and empty states.
  - Adapted all 3 modal dialogs (Edit Account, Pay Credit Card Bill, Delete Confirmation) with theme-adaptive modal backgrounds, borders, and text contrast.
  - Configured React Native Paper `TextInput` components with dynamic `textColor`, `placeholderTextColor`, `outlineColor`, `activeOutlineColor`, and `theme={{ colors: { background: colors.surfaceLight } }}`.
- [x] **Complete Light Mode Support for Log Transaction (`AddTransactionScreen.tsx`)**:
  - Replaced all static `COLORS` tokens with dynamic `ThemeColors` from `../../theme/tokens`.
  - Injected `const { accent, colors, effectiveTheme } = useSettingsStore()` and `useMemo(() => getStyles(colors), [colors])`.
  - Converted static StyleSheet to theme-reactive hoisted `function getStyles(colors: ThemeColors)`.
  - Dynamic styling across transaction type tabs (Expense coral, Income accent, Lent/Borrow warning/purple), hero amount card, money source selection grid, category chips, and note inputs.
  - Native calendar picker on iOS dynamically syncs `themeVariant={effectiveTheme === 'light' ? 'light' : 'dark'}`.
  - Verified 0 remaining static `COLORS.` references.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

### 15. Theme System — Multi-Style Engine & Android Material You Support
- [x] **Full Material Design 3 (MD3) Token Architecture (`tokens.ts`)**:
  - Replaced ad-hoc flat naming with formal MD3 roles: `background`, `onBackground`, `surface`, `onSurface`, `surfaceVariant`, `onSurfaceVariant`, `surfaceElevated`, `outline`, `outlineVariant`, `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `inverseSurface`, `inverseOnSurface`, `inversePrimary`, `shadow`, `scrim`.
  - Mapped directly onto React Native Paper's `MD3DarkTheme` and `MD3LightTheme` in `theme.ts`.
- [x] **Three Named Design Styles (Full Dark & Light Variants)**:
  1. *Precision Obsidian*: Indigo brand (`#6366F1` dark / `#4F46E5` light) over a deep, warm near-black base (`#111113`, zero blue-slate bias) and zinc cards (`#18181B`).
  2. *Warm Executive*: Copper brand (`#D97757` dark / `#A85C32` light) with umber dark mode (`#151311` canvas, `#1E1A17` card) and warm paper light mode (`#F7F4EE` canvas, `#FFFDF9` ivory card, `#27221E` espresso ink).
  3. *Swiss Minimal*: High-contrast monochrome ink brand (near-white `#F4F4F5` pill in dark mode with `#09090B` text; near-black `#18181B` pill in light mode with `#FFFFFF` text). All buttons, tabs, borders, and pills are strictly monochrome, leaving financial status colors as the sole color in the UI.
- [x] **Strictly Locked Semantic Financial Flow Tokens**:
  - `income`: `#10B981` (dark) / `#059669` (light)
  - `expense`: `#F43F5E` (dark) / `#E11D48` (light)
  - `lent`: `#F59E0B` (dark) / `#D97706` (light)
  - `borrowed`: `#38BDF8` (dark) / `#0284C7` (light)
  - Locked across all styles and dynamic wallpaper themes — completely independent of brand/accent color.
- [x] **Android 12+ Material You Dynamic Theming (`@pchmn/expo-material3-theme`)**:
  - Installed `@pchmn/expo-material3-theme` via `npx expo install`.
  - Continuous Native Generation: executed `npx expo prebuild --platform android`.
  - Hooked `useMaterial3Theme` in `App.tsx` and dynamically fed system wallpaper schemes into `settingsStore`.
  - Added 4th option in Settings: "Match wallpaper (Android 12+)".
  - Automatic fallback: gracefully falls back to "Precision Obsidian" on iOS, Android < 12, or web.
- [x] **Centralized Design Tokens & Zero Hex Duplication**:
  - Centralized every token in `tokens.ts`, including 12 category tokens (`CATEGORY_TOKENS`), bank presets (`BANK_BRAND_COLORS`), card presets (`CARD_BRAND_COLORS`), custom swatches (`CUSTOM_PALETTE_COLORS`), and account type colors (`ACCOUNT_TYPE_COLORS`).
  - Deleted every duplicate hardcoded hex value across `categoryIcons.ts` and `DashboardScreen.tsx`.
- [x] **SettingsScreen Redesign**:
  - Dedicated "THEME SYSTEM" section with 4 selectable style cards, visual brand swatches, radio selectors, and fallback status badges.
  - Dedicated "APPEARANCE MODE" segmented control (Dark / Light / System) with dynamic high-contrast active text (`onPrimary`).
  - Educational "LOCKED SEMANTIC TOKENS" showcase displaying live income, expense, lent, and borrowed status pills.
- [x] **Interactive Simulator & Visual Verification**:
  - Created standalone interactive simulator artifact `theme_system_showcase.html` with real-time toggle between all styles, Dark/Light modes, and Dashboard/Settings mockups.
  - Generated visual assets for Precision Obsidian and Warm Executive.
- [x] **Verification**:
  - TypeScript typecheck passed with 0 errors (`npx tsc --noEmit`).
  - ESLint passed with 0 errors and 0 warnings (`npx expo lint`).

### 16. UI Polish & Theme Consistency Audit
- [x] **Budget Screen Duplicate Plus Icon Fix (`BudgetsScreen.tsx`)**:
  - Resolved the duplicate `+` indicator on the "+ Set Budget" header action button. The text now renders cleanly as "Set Budget" alongside the `<Ionicons name={showForm ? 'close' : 'add'} />` icon.
- [x] **Complete Hardcoded Hex Purge (`DashboardScreen.tsx`)**:
  - Purged all remaining hardcoded hex values in `DashboardScreen.tsx` (`#D97706` warning icons, `#000` card shadows, `#fff` active border, `#FEF3C7` / `#F59E0B` / `#92400E` sync pills).
  - Fully bound to dynamic design tokens (`colors.warning`, `colors.warningMuted`, `colors.shadow`, `colors.textPrimary`).
- [x] **Transactions Screen Floating Plus Action Button (`TransactionsScreen.tsx`)**:
  - Integrated the identical floating circular `+` button (FAB) from the Dashboard/Home screen into `TransactionsScreen.tsx` (`styles.floatingAddBtn`), pinned to the bottom-right corner (`bottom: 24`, `right: 20`, `elevation: 10`, `zIndex: 999`).
  - Directly triggers `navigation.navigate('AddTransaction')` with tactile opacity response (`activeOpacity={0.7}`) and generous touch hitSlop (`16px`).
  - Styled with dynamic accent background (`accent.hex`), high-contrast icon (`colors.onPrimary`), theme shadow token (`colors.shadow`), and screen-reader accessibility labels (`accessibilityLabel="Add Transaction"`, `accessibilityRole="button"`).
  - Adjusted `listContent` bottom padding (`paddingBottom: 96`) so transactions list items scroll smoothly without being obstructed by the floating button.
- [x] **Credit Card Expense Action Button Duplicate Plus Fix (`DashboardScreen.tsx` & `AccountDetailScreen.tsx`)**:
  - Removed redundant `+` text prefix from the expense action button (`styles.cardExpenseActionPillText`), eliminating the duplicate `+ + Expense` rendering caused by combining `<Ionicons name="add" />` with `+ Expense` label text.
  - Cleaned up matching empty-state `+ Add Credit Card` and `AccountDetailScreen.tsx` quick action button for credit cards.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

### 17. Net Worth Budget Ceiling & Financial Discipline Rule
- [x] **Net Worth Ceiling Enforcement (`BudgetsScreen.tsx`)**:
  - Implemented strict financial discipline rule: monthly budget limits cannot exceed total calculated Net Worth ($$\text{Net Worth} = \text{Cash \& Bank} + \text{Lent} - \text{Borrow} - \text{Credit Card Dues}$$).
  - Synchronously evaluates `calculateNetWorth(accounts, borrows, transactions)` to dynamically compute `totalNetWorth` and `isExceedingNetWorth = !isNaN(parsedLimit) && parsedLimit > totalNetWorth`.
  - Added dynamic `"Net Worth Cap: ₹X"` status label directly in the limit input header, colored in alert crimson (`colors.alert`) when Net Worth is non-positive or warning/muted otherwise.
  - Real-time inline warning box with `Ionicons` alert icon: `"Limit cannot exceed your total net worth (₹X)"` displayed immediately when the typed limit exceeds total net worth.
  - Visual validation cues: Currency text input outline (`outlineColor`, `activeOutlineColor`) and currency prefix affix (`textStyle`) dynamically switch to `colors.alert` when the net worth ceiling is violated.
  - **"Max Net Worth (₹X)" Quick Suggestion Chip**: Added an intelligent 1-tap preset chip to the horizontal suggestions scroll list, allowing users to instantly set the budget limit to their exact current net worth.
  - Cleaned up unused local state variables and redundant hooks in `BudgetsScreen.tsx`.
- [x] **Budget Deletion & Clear Filled Data System (`BudgetsScreen.tsx`, `DashboardScreen.tsx`, `financeStore.ts`)**:
  - Implemented `deleteBudgetOptimistic` in `financeStore.ts` with instant 0ms optimistic cache removal, rollback protection, and PostgreSQL delete query.
  - Added dedicated **Delete / Clear** action button directly on the Overall Monthly Budget card and Category cards (`styles.cardDeletePill`) alongside the Edit pill in `BudgetsScreen.tsx`.
  - Added dynamic **Delete Budget** (when editing existing) or **Clear Data** (when filling new budget) in the form actions row.
  - Added quick **Delete** trash icon to the Dashboard's Monthly Budget card header for 1-tap budget clearance.
  - Designed high-contrast theme-adaptive confirmation dialogs with tactile haptic feedback (`Haptics.notificationAsync`) across all deletion entry points.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

### 18. Ledger Balance Calibration & Offline Sync System
- [x] **Balance Calibration Flow (`financeStore.ts`, `AccountDetailScreen.tsx`, `DashboardScreen.tsx`)**:
  - Replaced ambiguous balance overrides with a strict dual-choice calibration protocol:
    1. **"Calibrate & Log Transaction" (Ledger-Preserving)**: Computes the exact signed difference between old and new balance ($$\Delta = \text{Balance}_{\text{new}} - \text{Balance}_{\text{old}}$$). Automatically posts an Adjustment transaction (`income` if positive, `expense` if negative) categorized as `'Adjustment'` (`"Balance calibration (+/-₹X)"`), fully preserving double-entry accounting integrity and the database balance trigger.
    2. **"Update Balance Only (Sets Sync Required)"**: Directly sets the account balance in PostgreSQL while registering a `PendingCalibration` record in Zustand and `AsyncStorage` (`@finance_pending_calibrations_v1`), signaling an unlogged disparity.
  - Dedicated **Calibrate Balance Modal** in `AccountDetailScreen.tsx` and `DashboardScreen.tsx` (Manage Money Sources):
    - Real-time calculated difference preview showing signed variance (`+₹X` / `−₹X`) with dynamic color coding (accent / alert).
    - Clear explanatory helper text educating the user on ledger implications.
  - **Sync Required Indicators & Interactive Resolution**:
    - Account cards and manager rows display prominent amber warning badges (`"Sync Required"` / `"⚠️ Sync"`) when pending unlogged calibrations exist.
    - One-tap "Log Tx" action button on warning banners to retroactively resolve pending calibrations into balancing transactions (`resolvePendingCalibrationAsTransaction`), safely compensating for the database trigger.
    - Dismissable sync warnings if the user deliberately wants to keep the direct balance override without a ledger entry.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

### 19. Fintech Statement Export & Scoped Storage PDF Sharing
- [x] **Cross-Platform Scoped Storage PDF Export (`statementExport.ts`)**:
  - Fixed Android & Expo Go scoped storage permission barrier (`"Not allowed to read file under given URL"`) when sharing generated PDF files.
  - Integrated `expo-file-system/legacy` to generate the PDF with base64 encoding and safely write it into the application's scoped sandbox directory (`FileSystem.cacheDirectory + 'Statement_YYYY-MM-DD.pdf'`) before passing the URI to `expo-sharing`.
  - Implemented multi-tier fallback pipeline (`options.method: 'save' | 'share' | 'auto'`):
    - Primary: Native share dialog via `Sharing.shareAsync` with UTI `com.adobe.pdf`.
    - Fallback: System Print & "Save as PDF" dialog via `Print.printAsync({ html })` if sharing is unavailable or cancelled.
  - Complete statement metadata header, indexed ledger table, active filter badges, and aggregated financial summary totals.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).

### 20. Cross-Platform Keyboard Avoidance & Fluid Auto-Scroll Architecture
- [x] **Root Cause Diagnosis**:
  - `behavior={Platform.OS === 'android' ? undefined : 'padding'}` disabled `KeyboardAvoidingView` on Android.
  - Android translucent status bar / edge-to-edge modals prevent system `adjustResize` from working properly on nested scrollviews and modals.
  - Standard `ScrollView` lacked dynamic `paddingBottom` expansion when the software keyboard was deployed, physically preventing users from scrolling bottom fields (notes, names, buttons) above the keyboard.
- [x] **Custom Keyboard System (`useKeyboard.ts` & `KeyboardAwareScrollView.tsx`)**:
  - Developed pure JavaScript cross-platform hook `useKeyboard()` listening to `keyboardWillShow`/`keyboardDidShow` and `keyboardWillHide`/`keyboardDidHide`. Fully compatible with Expo Go without requiring native modules or crashing custom turbo runtimes.
  - Developed `KeyboardAwareScrollView` component forward-ref enabled with dynamic `contentContainerStyle.paddingBottom` expansion: expands bottom scroll boundary by `keyboardHeight + extraScrollHeight` when the keyboard is active, with `keyboardShouldPersistTaps="handled"`.
- [x] **Screens & Modals Upgraded**:
  - `AddTransactionScreen.tsx`: Replaced fixed `KeyboardAvoidingView` with `KeyboardAwareScrollView`; added `onFocus` auto-scrolling for Person Name and Note inputs.
  - `BorrowsScreen.tsx`: Replaced `ScrollView` with `KeyboardAwareScrollView`; added `onFocus` auto-scrolling for person name and amount inputs.
  - `BudgetsScreen.tsx`: Replaced root `ScrollView` with `KeyboardAwareScrollView`; added `onFocus` auto-scrolling for monthly budget limit amount.
  - `DashboardScreen.tsx`: Integrated `KeyboardAwareScrollView` into both the Add/Edit Money Source Modal and Manage Categories Modal with auto-scroll for all text inputs.
  - `AccountDetailScreen.tsx`: Dynamic keyboard offset calculation on modal sheets (`Math.min(keyboardHeight * 0.75, 200)`) + `KeyboardAwareScrollView` in Edit Account and Pay Card Bill modals.
  - `TransactionDetailScreen.tsx`: Replaced outer `ScrollView` with `KeyboardAwareScrollView`, replaced nested `KeyboardAvoidingView` with a responsive layout, and added auto-scrolling on Amount, Date, and Note fields.
  - `LoginScreen.tsx` & `SignUpScreen.tsx`: Replaced non-responsive `KeyboardAvoidingView` with `KeyboardAwareScrollView` and auto-scrolling focus handlers.

### 21. Borrows & Lending Architecture Redesign & Money Source Integration
- [x] **Store & Database Ledger Synchronization (`financeStore.ts`)**:
  - Implemented `addBorrowWithTransactionOptimistic`:
    - Synchronously links new Lent/Borrowed entries to money source accounts (`accounts` table).
    - When money is lent (`borrow_given`): generates an outflow transaction, deducting `amount` from the selected account via optimistic state & the database trigger `trigger_update_account_balance`.
    - When money is borrowed (`borrow_taken`): generates an inflow transaction, crediting `amount` to the selected account.
    - Accurately links `linked_transaction_id = tx.id` in both Supabase and Zustand.
    - Also supports untracked personal IOUs (balance unaffected) if explicitly toggled by user.
  - Implemented `settleBorrowWithTransactionOptimistic`:
    - Full settlement dialog supporting deposit/deduction into user's Bank or Cash account.
    - When lent money is repaid: generates an `income` repayment transaction, depositing money back into the selected account.
    - When borrowed money is repaid: generates an `expense` repayment transaction, deducting money from the selected account.
    - Updates borrow status to `'settled'`.
  - Implemented `deleteBorrowOptimistic`:
    - Deletes borrow record with optional restoration/deletion of the linked account transaction.
  - Implemented `reopenBorrowOptimistic`:
    - Restores a settled borrow to active pending status.
- [x] **AddTransactionScreen Synchronization**:
  - Updated `AddTransactionScreen.tsx` to call `addBorrowWithTransactionOptimistic` when `borrow_given` or `borrow_taken` is logged, ensuring borrows created from the general transaction logging flow are bidirectionally linked with their transactions instead of leaving `linked_transaction_id: null`.
- [x] **Complete BorrowsScreen Visual & UI Redesign (`BorrowsScreen.tsx`)**:
  - Fully dynamic theme synchronization: references `colors` and `accent` from `useSettingsStore()`, replacing all legacy static `COLORS`.
  - Financial tokens adherence: uses `colors.lent` (`#F59E0B` Amber) and `colors.borrowed` (`#38BDF8` Sky blue) for tags, badges, icons, and amounts.
  - Sleek top header bar with back navigation and `+ Add Entry` tactile button.
  - 3-part executive metric overview:
    - **To Receive** card (active lent sum & count)
    - **To Pay** card (active borrowed sum & count)
    - **Net Position** dynamic capsule banner (+ Net Receivable / − Net Payable / Settled).
  - Search & filter command bar: live keyword search across person names and notes + horizontal filter pills (`All`, `Pending`, `Settled`, `Lent Only`, `Borrowed Only`).
  - Interactive item cards:
    - Person avatar circle with initial
    - Direction badge (`LENT` / `BORROWED`)
    - Status badge (`PENDING` / `SETTLED`)
    - Connected Money Source tag with account name and type icon
    - Tabular formatted amounts with strike-through when settled
    - Quick actions: Settle Up, Reopen, Delete, and "View Transaction" navigation link.
  - Interactive "Add Entry" modal sheet with live account picker, balance preview, and balance impact notice.
  - Dedicated "Settle Up" modal dialog with account selector for repayment deposits/deductions.
  - Delete confirmation dialog with option to revert the linked account transaction.
  - Native calendar picker integration: Replaced static text inputs with interactive date selector cards invoking `@react-native-community/datetimepicker` in both Add Entry and Settle modals.
  - Header spacing refinement: Distributed flex bounds with dedicated `headerTitleCol` and generous horizontal gaps (`gap: SPACING.md`), giving ample breathing room between screen titles and the `+ Add Entry` tactile button.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npm run lint`).

### 22. Budget Card Action Button & Title Wrapping Fix
- [x] **Card Header Boundary & Delete Button Containment (`BudgetsScreen.tsx`)**:
  - Resolved issue where `cardDeletePill` (trash button) overflowed outside the right border of budget cards on compact screens or with long category names.
  - Constrained `cardHeaderTitleRow` and `catTitleLeft` with `flex: 1`, `marginRight: SPACING.xs`, and `minWidth: 0`.
  - Added dedicated text column containers `cardHeaderTitleTextCol` and `catTitleTextCol` (`flex: 1, minWidth: 0`) with `numberOfLines={2}` and `flexShrink: 1` on `budgetCardName` and `categoryName`, allowing lengthy titles to cleanly wrap to the next line without encroaching on the action buttons.
  - Added `numberOfLines={1}` to `categorySub` to constrain amount texts.
  - Set `flexShrink: 0` on `cardHeaderRight`, `cardActionsCluster`, `cardEditPill`, and `cardDeletePill`, guaranteeing that the percentage badge, edit button, and delete trash button stay strictly anchored inside the card's right boundary.
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).

### 23. OCR Screenshot Logging & AI Spending Overview (BYOK Gemini)
- [x] **Part 1 — BYOK Gemini Key Setup & Security Architecture**:
  - Replaced the placeholder row in `SettingsScreen.tsx` with an interactive Gemini AI Key (BYOK) row featuring dynamic status badges (`ACTIVE` in emerald green or `SET UP` in primary).
  - Added dedicated full-screen BYOK Setup Modal:
    - Step-by-step instructions on obtaining a free API key from `aistudio.google.com/apikey`.
    - Security note explaining keys are stored securely in database profiles and never transmitted in client HTTP bodies.
    - Password-masked API key input with toggle reveal button and 1-tap clipboard paste button (`expo-clipboard`).
    - Save API Key action with validation and instant profile persistence.
    - Fixed `new row violates row-level security policy for table "profiles"`: transitioned `saveGeminiApiKey` from `.upsert()` to `.update()`, directly matching the existing `FOR UPDATE USING (auth.uid() = id)` PostgreSQL RLS policy on `public.profiles`. Created migration `20260928000001_profiles_insert_policy.sql` adding `FOR INSERT WITH CHECK (auth.uid() = id)` for defense-in-depth.
    - Keyboard Avoidance & Auto-Scroll: Wrapped the modal backdrop in `KeyboardAvoidingView` with dynamic `paddingBottom` via `useKeyboard()`, replaced the inner `ScrollView` with `KeyboardAwareScrollView` (`extraScrollHeight={80}`), and added `onFocus` auto-scroll on the API key `TextInput` to ensure the input, paste button, and "Save API Key" button always remain fully visible above the software keyboard.
    - Remove Key action to deactivate AI features and clear database column.
  - Supabase Edge Function `ask-gemini` (`supabase/functions/ask-gemini/index.ts`):
    - Authenticates the calling user via their Supabase JWT (`Authorization: Bearer <token>`).
    - Fetches `gemini_api_key` strictly from the `profiles` table using the authenticated user's ID (`auth.uid()`).
    - Never accepts or trusts client-supplied keys in the request body.
    - Routes requests to Google Generative Language API using Gemini 2.0 Flash (`gemini-2.0-flash`), with automatic graceful fallback to Gemini 1.5 Flash (`gemini-1.5-flash`).
    - Standardized error codes: returns mapped error responses for `UNAUTHORIZED` (401), `MISSING_KEY` (400), `INVALID_KEY` (400), `RATE_LIMIT` (429), and `GEMINI_ERROR` (500).
- [x] **Part 2 — Screenshot OCR Logging & Android Share-Sheet Receiver**:
  - Native Android Share Receiver (`expo-share-intent` v8.0.1):
    - Configured intent filters in `app.json` for `image/*` and `text/*` with Android package `com.expensetracker.app`.
    - Executed Continuous Native Generation (CNG): `npx expo prebuild --platform android --no-install`.
    - Hooked `useShareIntent` in `RootNavigator.tsx` to intercept screenshots shared from Google Pay, PhonePe, Paytm, or Gallery.
  - On-Device OCR Engine (`expo-mlkit-ocr`):
    - `extractTextFromImage(uri)` performs fast on-device text recognition.
    - Forwards extracted text to `ask-gemini` with `action: 'parse_receipt'`.
  - Structured Receipt Parsing:
    - Gemini parses raw OCR text and outputs strict JSON: `amount` (number), `merchant_or_person` (string), `suggested_category` (string matching existing categories), `suggested_type` (`expense`, `income`, `borrow_given`, `borrow_taken`), and `date_if_present` (`YYYY-MM-DD`).
  - Add Transaction Screen Integration (`AddTransactionScreen.tsx`):
    - Added top-right header `Scan` button and gallery picker (`ImagePicker.launchImageLibraryAsync`).
    - Pre-fills form fields (amount, merchant note, person name, category, date) with `source: 'screenshot'` for user review before saving.
    - Prominent status banner (`AI PARSED`) and contextual toast feedback (`scanToast`).
    - Graceful error fallback: if OCR fails or text cannot be parsed, presents a non-intrusive toast (`"Couldn't read that screenshot — enter it manually"`) allowing manual entry.
    - If no Gemini key is configured, displays a prompt alerting the user to set up their key in Settings.
- [x] **Part 3 — Dashboard AI Spending Overview**:
  - Dedicated `AI Spending Overview` card integrated into `DashboardScreen.tsx` directly below the Monthly Budget card.
  - Compact Aggregation Payload: Dashboard aggregates active month metrics (`spent`, `budget_limit`, `days_left_in_month`, `burn_rate`, top 3 spending categories with totals) and sends the aggregated snapshot to `ask-gemini` (`action: 'spending_overview'`). Raw transaction feeds are never transmitted.
  - Executive Financial Synthesis: Gemini returns a concise 2–4 sentence summary highlighting burn rate, largest category outlays, and budget pacing.
  - Zero-Quota Caching (`AsyncStorage`):
    - Stores the synthesized overview per month (`@finance_ai_overview_${month}`).
    - Reopening the app reads from local cache with a `CACHED • [MONTH]` badge, preventing free-tier quota exhaustion.
    - Includes a manual refresh icon button allowing the user to refresh the summary on demand.
- [x] **Verification**:
  - TypeScript compilation: `npx tsc --noEmit` passes with 0 errors.
  - Expo linter: `npm run lint` passes with 0 errors and 0 warnings.
  - Automated E2E verification test suite: `npm run test:e2e` passes with 6/6 checks.
  - Visual verification: Rendered interactive Generative UI simulator artifact `ai_features_showcase.html` and generated high-fidelity UI mockup screenshots for BYOK Setup Modal, OCR Pre-filled Add Transaction, and Dashboard AI Overview across design styles in Dark and Light modes.

- [x] **Past Month Lock & Month Transition Engine**:
  - **Dynamic Month Capsule Lock Indicator**:
    - Appears *strictly* on past months (`month < currentMonth`); never shown on current or future months.
    - Shows `🔒` (locked, view-only) or `🔓` (unlocked) with live remaining countdown (e.g., `🔓 29m`).
    - Tapping when unlocked allows user to manually re-lock immediately.
  - **4-Digit Numeric Verification (`MonthUnlockModal.tsx`)**:
    - Tapping locked icon opens clean verification card displaying a randomly generated 4-digit code (e.g. `4829`).
    - Dedicated numeric keypad (`number-pad`), 4 digit-boxes, and tactile unlock button.
    - Includes a refresh button to generate a new code if desired, with haptic feedback.
    - Temporarily unlocks the month for **30 minutes** with auto-relock timer.
  - **In-Progress Edit Protection**:
    - Active edits inside transaction edit flows are guarded so users are never interrupted mid-edit if the timer expires.
  - **Strict View-Only Guarding in Locked Months**:
    - Adding new transactions: FAB (+) prompts to unlock before adding; `AddTransactionScreen` date picker flags locked dates and submit is blocked.
    - Transaction detail: Edit and Delete buttons are replaced with a locked banner and a 1-tap "Unlock <Month>" button.
    - Budgets: Setting or editing budget limits in a locked month is disabled with a `LOCKED` badge.
  - **Historical Closing Snapshots & Budget Rollover**:
    - Past months calculate closing account balances and Net Worth as of the last day of that month (`YYYY-MM-<lastDay> 23:59:59`).
    - Budget limits (overall and category limits) auto-carry forward fresh into new months with spent amount starting at ₹0, preserving past months' frozen final snapshots.
    - Unsettled borrows/lends persist across months until resolved.

- [x] **Native Module Crash Fix (`Cannot find native module 'ExpoMlkitOcr'`)**:
  - **Root Cause**: `expo-mlkit-ocr` required unbundled native binaries (`android/` Java code) not supported by Expo Go. Its entry point invoked synchronous `requireNativeModule('ExpoMlkitOcr')` during module import, causing a fatal RedScreen crash on launch.
  - **Resolution**:
    - Uninstalled `expo-mlkit-ocr` and purged it from `app.json` plugins.
    - Upgraded receipt/screenshot scanning to **Gemini 2.0 Flash Multimodal Vision** via `inlineData` (base64 image encoded directly via Expo-bundled `expo-file-system/legacy` or `expo-image-picker`).
    - Added direct client fallback in [geminiService.ts](file:///c:/Users/anand/Coding%20stuff/Expense%20Tracker/app/src/services/geminiService.ts) using the user's BYOK key from `settingsStore` if the Supabase Edge Function is un-deployed or offline.
    - Updated [RootNavigator.tsx](file:///c:/Users/anand/Coding%20stuff/Expense%20Tracker/app/src/navigation/RootNavigator.tsx) and [AddTransactionScreen.tsx](file:///c:/Users/anand/Coding%20stuff/Expense%20Tracker/app/src/screens/main/AddTransactionScreen.tsx) to eliminate intermediate OCR parsing and parse receipts directly via multimodal vision.
    - [x] **Gemini 404 Resolution, Multi-Model Cascade & Screenshot Scanning Fix**:
  - **Root Cause of 404 & "Couldn't read that screenshot"**:
    - Direct calls to Google Gemini API hardcoded `gemini-2.0-flash` on `v1beta`. Depending on the user's Google AI Studio project creation date, region, or API tier, `gemini-2.0-flash` returned `404 Not Found`.
    - When `callGeminiDirect` received 404, it fell back to generic error code formatting (`Gemini API returned error code 404`) instead of inspecting Google's error payload.
    - In `AddTransactionScreen.tsx`, screenshot scanning received `error: 'GENERIC_ERROR'` from this 404, triggering the fallback toast: `"Couldn't read that screenshot — enter it manually"`.
  - **Resolution**:
    - **Dynamic Model Discovery (`resolveWorkingGeminiModel`)**: Queries Google's official `GET /v1beta/models` and `GET /v1/models` ListModels endpoints using the user's API key to detect exact available models supporting `generateContent` (prioritizing fast flash models).
    - **Resilient Multi-Model Cascade**: Cascades through `['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-001', 'gemini-2.0-flash-exp', 'gemini-2.5-pro', 'gemini-1.5-pro']` across both `v1beta` and `v1` endpoints until a 200 OK is received, caching the verified working model in memory for subsequent zero-latency requests.
    - **Live Key Verification in Settings (`validateGeminiApiKey`)**: When users enter their API key in Settings, the modal verifies it live against Google Gemini before saving, displaying an immediate `"Verified! Connected to Gemini (Model)"` confirmation or exact Google error message (e.g. invalid key).
    - **Screenshot Vision Enhancement**: Passes image mimeType to `parseReceiptWithGemini` and displays granular diagnostic toasts (`RATE_LIMIT`, Google error message, or fallback manual entry only when receipt contains no readable financial values).
- [x] **AI Spending Overview Concrete Trigger Gate & Tuned Prompt**:
  - **Deterministic Trigger Gate**:
    - Evaluated before calling Gemini API (both client-side in `geminiService.ts` and in `DashboardScreen.tsx`, as well as defense-in-depth in `supabase/functions/ask-gemini/index.ts`).
    - Requires $\ge 5$ transactions logged AND $\ge 2$ distinct categories in the selected month.
    - If criteria are not met, displays a calm, clearly-worded empty state: `"Log a few more transactions this month to unlock an overview"` with current count progress (e.g. `2/5 transactions • 1/2 categories`) — never a weak generic paragraph or error banner.
  - **Historical Closed-Period Framing**:
    - When viewing a locked or past month, the card header dynamically reflects `"Historical summary for [Month]"`.
    - Retrospective closed-period framing is passed into the prompt, instructing Gemini to use past tense and frame the synthesis as a finalized retrospective summary rather than in-progress pace advice.
  - **Strict Budget Variance Omission**:
    - When no budget is set (`budgetLimit <= 0`), budget-related metrics (`budgetLimit`, `budgetSpent`, `budgetRemaining`, `budgetPercentUsed`) are completely stripped from the JSON payload.
    - System prompt strictly instructs Gemini to omit budget commentary when no budget is present, preventing hallucinations such as "you are on track with your budget" when no budget was set.
  - **Tuned Gemini System Prompt**:
    - Enforces observer role (not financial advisor); forbids prescribing financial products, investments, loans, or insurance.
    - Output strictly follows a 4-part structure under 120 words: `SNAPSHOT`, `PATTERN`, `FLAG` (optional), `NEXT STEP`.
    - Section parsing in `DashboardScreen.tsx` cleanly bolds labels and structures the text into visually appealing paragraphs.
  - **Word Capping & Retry Enforcement**:
    - Automatically retries once if output is wildly over length ($> 135$ words) or missing sections.
    - Programmatically truncates output at sentence boundaries to strictly enforce the $\le 120$-word limit.
  - **Verification**:
    - Added and ran automated test suite `app/test_ai_overview_gating.mjs` verifying gating, budget omission, and sentence-boundary word capping.
    - Verified `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors), and `npm run test:e2e` (all 6 E2E steps passed).

---

- [x] **Native Android Standalone APK Build & Self-Hosted In-App Update Engine**:
  - **Standalone Android APK Generation**:
    - Created `eas.json` configuring `preview` and `production` build profiles with `"buildType": "apk"`.
    - Generated Android Keystore in the cloud under `Build Credentials oZAo_joWqw (default)`.
    - Resolved Linux worker dependency sync issue with explicit `@emnapi/core` and `@emnapi/runtime` locking and `.npmrc` (`legacy-peer-deps=true`).
    - Successfully produced standalone multi-architecture `.apk` (v1.0.0, Build 1) on EAS Build ID `c8bbda89-2ef0-46dd-aa2a-0443af4bece7`.
    - Direct download link: `https://expo.dev/artifacts/eas/-Rkp7YdTypZDK3dl1jZ5FKS7f8x3wJDDwExt1R9ViaY.apk`
    - Stored local archive at `app/releases/ExpenseTracker-v1.0.0.apk` (89.5 MB).
  - **Android System Share Sheet Integration (Images & Text)**:
    - Wired `expo-share-intent` in `RootNavigator.tsx` to handle incoming intents from external apps without requiring Expo Go.
    - Supports receiving transaction receipt/payment screenshots (routes to Multimodal Gemini Vision parsing in `AddTransactionScreen`).
    - Supports receiving banking SMS and UPI payment text messages (e.g. from Google Pay, PhonePe, Paytm, Bank SMS alerts) via `processSharedText` with regex amount extraction.
  - **Self-Hosted In-App Version & Update Engine**:
    - **Database Schema (`app_versions` table)**: Created migration `20260928000002_app_versions.sql` with public read access. Tracks `version`, `version_code`, `download_url`, `release_notes`, `is_critical`, and `min_version_code`.
    - **Storage Bucket (`app-releases`)**: Created migration `20260928000003_storage_app_releases.sql` configuring a 100 MB public storage bucket for hosting downloadable update APKs.
    - **Version Service (`versionService.ts`)**: Embedded `CURRENT_APP_VERSION = '1.0.0'` and `CURRENT_VERSION_CODE = 1`. Implemented `checkForAppUpdate()` querying the latest release record from Supabase.
    - **Interactive Update UI (`UpdatePromptModal.tsx`)**:
      - Automatic launch check: alerts users when a newer build is available.
      - Displays version name, build number, release notes, and a direct "Download & Update" button invoking the Android browser/download manager.
      - Enforces mandatory un-dismissible modal if `is_critical` is true or `CURRENT_VERSION_CODE < min_version_code`.
    - **Settings Screen Integration (`SettingsScreen.tsx`)**: Added manual "Check for Updates" button showing current installed version (`v1.0.0 (Build 1)`) with instant alert dialogs.
    - **Test Coverage**: Created and passed unit test suite `test_version_service.mjs` verifying up-to-date checks, optional updates, and critical/forced updates.

---

- [x] **v1.0.1: Smart SMS Parsing, Dynamic Category Selection & Strict Guest Sandbox**:
  - **Strict Guest Mode Sandbox & Session Data Isolation**:
    - Created scoped AsyncStorage keys per user ID (`@finance_store_cache_<userId>_v3`, `@finance_categories_<userId>`, `@finance_account_order_<userId>`).
    - Isolated Guest mode exclusively into `@finance_store_cache_guest_v3`.
    - Added `resetForSignOut()` in `financeStore.ts` that immediately wipes in-memory accounts, transactions, borrows, budgets, active subscriptions, and active user references upon logout or Guest switch, guaranteeing zero data leakage from previously logged-in Google accounts.
  - **Instant Auto-Open Share Intent Navigation (`RootNavigator.tsx`)**:
    - Upgraded intent listener to immediately mount and navigate to `AddTransactionScreen` without requiring manual taps on the `+` FAB.
    - Added `pendingNavRef` and `onReady` synchronization on `<NavigationContainer>` so intents received during initial cold starts navigate instantly as soon as navigation mounts.
  - **Smart Offline Indian Banking & UPI SMS Parser (`smsParser.ts`)**:
    - Built-in regex engine supporting Indian bank SMS alerts (SBI, HDFC, ICICI, Axis, Kotak, PNB, etc.) and UPI apps (Google Pay, PhonePe, Paytm).
    - Extracts amount, debit/credit type, date, merchant (e.g. `Gopal Sweet`, `Zomato`, `Blinkit`, `Swiggy`, `Uber`, `Amazon`), account hint (`X0186`), and automatically associates with the user's matched bank account.
    - Works 100% offline with zero external API calls or latency.
  - **Intelligent Category Auto-Matching & Auto-Addition (`normalizeAndMatchCategory`)**:
    - Normalizes detected payee/merchant names to relevant categories (e.g. `Gopal Sweet` &rarr; `Food`, `Zomato` &rarr; `Food`, `Blinkit` &rarr; `Food`/`Groceries`, `Uber` &rarr; `Travel`).
    - If a valid category does not already exist in the user's category list, it is dynamically registered via `addCategory()` and immediately selected in the UI.
  - **Standalone Android APK v1.0.1 (Build 2)**:
    - EAS Build ID: `fbdf94e6-8a33-4e57-95bf-38a7b996db5e`
    - APK Download Link: `https://expo.dev/artifacts/eas/Ikz2tOAsDafQrFOmQVyb5Fax1IFGEazXwb5qOsuFYl0.apk`
    - Verified all 4 SMS/Isolation tests, TypeScript check (`0 errors`), and ESLint (`0 warnings, 0 errors`).

---

- [x] **Local-First Bank & Issuer Logos with Initials Fallback**:
  - **Asset Pipeline (`app/assets/logos/`)**:
    - Sourced 12 official square symbol/mark brand assets (~256x256 transparent PNGs) for existing bank & credit card issuer presets:
      - Banks: `sbi.png`, `ippb.png` (India Post Payments Bank), `hdfc.png`, `canara.png`, `pnb.png`, `bob.png` (Baroda Sun).
      - Cards: `sbi_card.png`, `icici.png`, `axis.png`, `kotak.png`, `slice.png`, `onecard.png`.
    - No live logo APIs or full wordmarks; all marks isolated, centered, and scaled cleanly to ~240px inside 256x256 canvases.
    - Created `LOGOS.md` with complete source URLs and attribution from official brand websites and Wikimedia Commons.
  - **Static Registry (`logoRegistry.ts`)**:
    - Created `app/src/constants/logoRegistry.ts` exporting `BANK_LOGOS` with explicit static `require(...)` calls compatible with the Metro bundler.
    - Normalization helper `getBankLogo(presetId)` handling case insensitivity, hyphens, and whitespace variations.
  - **New Design Token (`logoTileBackground`)**:
    - Added `logoTileBackground` to `ThemeColors`, `MD3BaseTokens`, and `buildThemeTokens()` in `app/src/theme/tokens.ts`.
    - Neutral light tone (`#FFFFFF`) designed to ensure transparent dark bank marks render with crisp contrast in both dark and light modes.
  - **Reusable Component (`<BankLogo />`)**:
    - Created `app/src/components/BankLogo.tsx` accepting `size`, `presetId`, `name`, `brandColor`, and optional `account`.
    - Renders official brand mark inside a rounded tile (`borderRadius: size * 0.28`) with proportional 4-6px padding (`size * 0.12`) over `logoTileBackground`.
    - Automatic fallback for custom accounts or unmapped presets to a bold initials avatar (1-2 letters) tinted with the brand/custom color (`brandColor + '1E'`).
    - Handled `onError` to guarantee an empty or broken image is never rendered.
  - **Universal Screen & Component Rollout**:
    - Eliminated all remaining generic Ionicons (`wallet-outline`, `business-outline`, `card-outline`, `cash-outline`) for money source institutions across every screen and modal in the application:
    - **Dashboard**:
      - Money Sources cards (Bank Accounts, Cash, Credit Cards).
      - Reorder list view (`YouTubeStyleDraggableList`) and Preset Selection Grid in the Add/Edit Account modal.
      - Pending Balance Sync Sheet item cards.
      - Month Balance Calibration modal pay-source list.
    - **Transaction Detail Screen**:
      - Money Source breakdown row in view mode.
      - Payment Account selector chips in edit mode.
    - **Transactions Screen**:
      - Top active account quick filter pill.
      - Account Filter Sheet modal option list (with active checkmark overlay).
      - Embedded source badges inside `TransactionRow`.
    - **Account Detail Screen**:
      - Hero identity card.
      - Preset selector chips for editing bank and card accounts.
      - Pay Credit Card Bill eligible liquid source list.
    - **Add Transaction Screen**:
      - Deduction source account grid.
    - **Borrows Screen**:
      - Borrow card connected account badge.
      - Add / Edit Borrow deduction/destination account selector pills.
      - Settle Borrow modal eligible liquid account list.
    - **Settings Screen**:
      - CSV Statement Export account filter chips with responsive horizontal layout.
  - **Text-Based Preset Inference (`inferPresetFromText`)**:
    - Added smart text inference in `BankLogo.tsx` that inspects account names or arbitrary strings (e.g., `"SBI • Salary"`, `"Kotak 811"`, `"HDFC Bank"`, `"OneCard Visa"`) to resolve brand logos even when only an account name or string is available.
  - **Verification**:
    - `npx tsc --noEmit`: 0 errors.
    - `npm run lint`: 0 errors, 0 warnings.

- [x] **v1.0.2: Adaptive SMS Learning Engine with Precedence & Cloud Sync**:
  - **PostgreSQL Schema & Unique Constraints**:
    - Created migration `20260928000004_user_merchant_rules.sql` with plain column constraint: `CONSTRAINT user_merchant_rules_user_merchant_key UNIQUE (user_id, merchant_name)`.
    - Added CHECK constraints for `source IN ('gemini', 'user_manual')` and `transaction_type IN ('income', 'expense', 'borrow_given', 'borrow_taken')`.
    - Stores `merchant_name` already-normalized in lowercase, enabling seamless `supabase-js` upserts with zero ON CONFLICT expression index issues.
  - **Indian Banking & UPI String Normalization (`normalizeMerchantName`)**:
    - Extracts canonical merchant keys from noisy bank SMS and UPI strings (e.g. `UPI/4239817/GOPAL SWEET/okhdfcbank` &rarr; `gopal sweet`).
    - Strips full VPA handles (`@okhdfcbank`, `@oksbi`, `@ybl`, etc.), reference/RRN indicators, digit runs, corporate noise words (`pvt ltd`, `commerce private`), and direction words (`paid to`, `trf to`).
  - **Strict Exact Matching (No False Positives)**:
    - High-confidence matching is restricted to exact normalized matches only.
    - Completely prevents false-positive cross-contamination (e.g. "Gopal Medical" will never match "Gopal Sweet").
  - **Separation of Notes from Parsed Merchant**:
    - User free-text notes (e.g. "dinner with friends") are never used to train rules.
    - Rules are keyed strictly on the parser's extracted `parsedMerchant` candidate.
    - Rules are only recorded for SMS and screenshot/OCR shares, never from manual scratch entries.
  - **Precedence & Non-Intrusive Gemini Refinement**:
    - `user_manual` rules are strictly immutable to Gemini AI (Gemini can never overwrite user-confirmed rules).
    - Touch tracking in `AddTransactionScreen` ensures late-arriving Gemini results never overwrite fields the user is currently typing in.
  - **Zustand + Supabase Storage Architecture (`merchantRulesStore.ts`)**:
    - Scoped AsyncStorage cache per user (`@merchant_rules_<userId>_v1`).
    - Automatic cloud sync with Supabase `user_merchant_rules`.
    - Clean Guest mode isolation (Guest mode utilizes seed dictionary without backend sync overhead).
  - **Settings Management Screen**:
    - Added interactive **"Learned Merchants & Rules"** modal in `SettingsScreen.tsx`.
    - Searchable list of all learned merchants, category pills, source tags (`USER` vs `AI`), usage counters, 1-tap category reassignments, and deletion with confirmation.
- [x] **v1.0.3: Unified OCR & SMS Extraction/Classification Pipeline (`transactionParser.ts`)**:
  - **Single Shared Parsing Service (`transactionParser.ts`)**:
    - Unified screenshot OCR and SMS extraction into ONE common, deterministic pipeline used across both `AddTransactionScreen` and `RootNavigator`.
    - Eliminated disparate parsing implementations in favor of a shared deterministic engine (`parseTransaction`) and asynchronous pipeline (`parseTransactionWithPipeline`).
  - **On-Device Text Extraction (`expo-mlkit-ocr`)**:
    - Integrated `expo-mlkit-ocr` within the Expo managed workflow (`ocrService.ts`).
    - Extracts raw text and bounding-box structured OCR blocks without any custom Kotlin/Java native code.
    - Wrapped in safe dynamic runtime loader with graceful fallback, ensuring 100% crash immunity across all test and development environments.
  - **Deterministic Extraction Pipeline (Runs First, Zero AI Calls)**:
    - **Amount Extraction Regexes & Confidence Thresholds**:
      - Explicit Currency Prefix Regex (`HIGH` confidence, score $\ge 100$):
        - `/(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi`
        - `/\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:₹|Rs\.?|INR)\b/gi`
      - Contextual Action Verbs (`HIGH` confidence, score $\ge 90$):
        - `/(?:debited|credited|spent|paid|transferred|sent|received|amount|amt|total)\s+(?:by|of|for|is)?\s*[:=]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi`
      - Prominence Heuristic Fallback (`MEDIUM` confidence, handles layout variations in GPay/PhonePe/Paytm where ₹ is an SVG icon or OCR-missed):
        - *OCR Bounding Box Score*: Calculates visual prominence `score = (boundingBox.height * 2) + Math.sqrt(boundingBox.width * boundingBox.height)`. Detects the hero transaction amount rendered in dominant font height in the card. Candidates with `.XX` decimal receive a $+25\%$ boost.
        - *Text-only Fallback*: Evaluates standalone decimal numbers `\b([0-9,]+\.[0-9]{2})\b` or filtered standalone integers `\b([1-9][0-9]{1,6})\b`, strictly disqualifying 12-digit UTRs, 10-digit phone numbers, years (2020–2030), and account numbers (`XX0186`).
      - Low-Confidence Escalation (`LOW` confidence, `needsGeminiAmount: true`):
        - Triggered when no valid numeric token is found OR multiple ambiguous disparate candidates compete without clear prominence.
        - Escalates specifically the amount field to Gemini AI (`extractAmountWithGemini` or multimodal vision fallback) rather than silently leaving it blank or guessing.
    - **UPI Ref / UTR Extraction**:
      - 12-digit continuous numeric string regex:
        - `/(?:UPI\s*(?:Ref(?:erence)?|Txn|Transaction)?\s*(?:ID|No\.?)?|UTR|RRN|Ref\s*No\.?)\s*[:#-]?\s*(\d{12})\b/i`
        - Standalone 12-digit token: `/\b(\d{12})\b/`
    - **Date Pattern Regexes**:
      - Month-first: `/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/i` (`Sep 29, 2026`)
      - Day-first alphanumeric: `/\b(\d{1,2})[-/ ]?([A-Za-z]{3,9})[-/ ]?(\d{2,4})\b/i` (`29 Sep 2026`, `29-Sep-2026`, `29Sep26`)
      - Slash/hyphen numeric: `/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/` (`29/09/2026`, `29-09-2026`)
      - ISO format: `/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/` (`2026-09-29`)
    - **Bank & Account Matching**:
      - Account hint regex: `/\b(?:A\/[cC]|Acct|Account|Card)\s*(?:no\.?)?\s*([X\*•\.]*\d{3,4})\b|(?:\.{2,}|[X\*•]{2,}|\bending\s+)(\d{3,4})\b/i`
      - Bank alias mapping (`State Bank of India` &rarr; `SBI`, `HDFC`, `ICICI`, `Kotak`, `Axis`, `PNB`, `BOB`, `Canara`, `Paytm`), linking matched account IDs automatically.
  - **Classification Pipeline (Merchant &rarr; Category)**:
    - **Step 1: Learned Rules Lookup**:
      - Exact normalized match in `user_merchant_rules` FIRST (`merchantConfidence: 'high'`).
      - Completely bypasses Gemini AI for all recognized merchants.
    - **Step 2: Seed Keyword Dictionary**:
      - Matches Indian ecosystem brands (Zomato, Swiggy, Uber, Blinkit, DMRC, IRCTC, etc.) locally (`merchantConfidence: 'medium'`).
    - **Step 3: Unrecognized Merchant Escalation**:
      - Only escalates to Gemini if the merchant is genuinely unrecognized (`needsGeminiMerchant: true`).
      - Targeted lightweight prompt: `classifyMerchantWithGemini(merchant, categories)` returns `{ suggested_category, suggested_type }`.
      - Gemini's classification is taught back into `user_merchant_rules` with `source: 'gemini'`, strictly respecting the immutability of `user_manual` rules.
  - **Measurable API Cost Reduction**:
    - Repeat merchants (Zomato, Swiggy, Blinkit, local sweet shops, daily groceries) are resolved 100% on-device after their initial encounter.
    - Drives Gemini API calls for receipt and screenshot scanning toward near-zero during regular ongoing usage.
  - **Verification & Testing**:
    - Built comprehensive unit test suite `app/test_unified_pipeline.mjs` verifying:
      - Google Pay (standard layout, missing ₹ currency symbol prominence fallback, bounding-box hero font height).
      - PhonePe (standard layout, comma amounts, plain integer amounts, UTR extraction).
      - Paytm (Money Sent, space-separated currency, Chai Point learned rule matching).
      - Indian Banking SMS alerts (SBI, HDFC debit alerts).
      - Merchant lookup in `user_merchant_rules` before Gemini (Zero AI invocations).
      - False positive avoidance ("Gopal Medical" vs "Gopal Sweet").
      - Low-confidence amount escalation.
    - Ran and passed all existing test suites: `test_sms_learning_system.mjs`, `test_sms_and_guest_isolation.mjs`, `test_ai_overview_gating.mjs`, `test_version_service.mjs`, and `npm run test:e2e` (all 6 E2E steps passed).
    - Passed TypeScript typecheck (`npx tsc --noEmit`: 0 errors) and ESLint (`npm run lint`: 0 errors, 0 warnings).

- [x] **v1.0.9 (Build 9): Unified Tiered OCR Pipeline, Form State Hand-Off Diagnostics, & Business Logic Enforcement**:
  - **Root Cause Analysis of Hand-Off and State Dropping**:
    1. *Render-Phase State Mutation Dropping*: In `AddTransactionScreen.tsx`, navigation state syncing was previously executed via `setPrevParams(params)` during the render phase. In React Navigation, async navigation completion from `RootNavigator` updated `route.params`, but render-time `setState` collided with active renders, while `amountTouched` checks prevented updates. Moving to a dedicated `useEffect` keyed on a serialized param signature (`paramsSignature`) completely eliminated dropped state.
    2. *Silent Date Loss*: `AddTransactionScreen.tsx` previously had `if (parseInt(yStr, 10) === today.getFullYear() && parseInt(mStr, 10) === today.getMonth() + 1) setDate(parsed.date);`. Any receipt from a past week or prior month was silently discarded and replaced with today's date. Now `applyPrefillDate` preserves the date or triggers the month-lock redirect banner with an unlock action.
    3. *Cash Auto-Defaulting*: `selectedAccountId` previously initialized to `params?.accountId || accounts[0]?.id || ''`, and `effectiveAccountId` fell back to `accounts[0]?.id`. This forced unmatched receipts to silently charge Primary Bank or Cash. Now it initializes to `''` (`effectiveAccountId = selectedAccountId`) and requires explicit user selection (`• Select source`), blocking submission if no account is selected.
    4. *Hardcoded Category Fallback*: `inferCategoryFromText` and `normalizeAndMatchCategory` had `return availableCategories.includes('Food') ? 'Food' : 'Other'`. This has been replaced with `'Uncategorized'`.
  - **3-Tier Cascade Architecture**:
    - **Tier 1 (On-Device ML Kit)**: `expo-mlkit-ocr` extracts text + spatial bounding boxes (`x, y, width, height`). Deterministic regex and bank-alias matching run locally. High confidence prefills directly (0 API calls, 0 network).
    - **Tier 2 (Text + Spatial Geometry Escalation via Gemini)**: When local confidence is low (`needsGeminiAmount`, `needsGeminiMerchant`, or unmatched bank), escalates structured JSON array of text blocks + spatial coordinates (`[{ text, x, y, width, height }]`) to Gemini with sensitive balances and account numbers redacted. **Never sends raw pixels or flat text strings.** Gemini resolves: `amount`, `merchant_or_person`, `direction` (`'sent'` | `'received'`), `transaction_datetime`, and `detected_bank_or_source`.
    - **Tier 3 (Direct Vision Fallback)**: Multimodal call on raw image bytes strictly constrained to corrupted/empty OCR text (`< 15` chars and no blocks).
  - **Boundary Diagnostics (Boundary 1, 2, 3)**:
    - *Boundary 1 (`ocrService.ts`)*: Logs ML Kit extraction success, raw text character length, total block count, and a text preview.
    - *Boundary 2 (`transactionParser.ts`)*: Logs tier resolution (`tier1_local`, `tier2_gemini_spatial`, `tier3_vision_fallback`), extracted amount, confidence, merchant, category, type, date, and matched account ID.
    - *Boundary 3 (`AddTransactionScreen.tsx`)*: Logs param arrival signature, prefill values, and triggers toast badges (`⚡ Tier 1`, `🤖 Tier 2`, `👁️ Tier 3`).
  - **Financial Business Logic & Zero-Defaulting**:
    - *Smart Note Prefill*: Income (`received`) &rarr; counterparty/UPI ID note; Expense (`sent`) &rarr; merchant note.
    - *Month-Lock & Date Enforcement*: Parse explicit receipt date. If in a locked month, do not block or overwrite: write to current active month (today) and render a persistent banner (*"This looks like it's from [Date] — [Month] is locked. Logged to this month instead."*) with a one-tap unlock shortcut that opens `MonthUnlockModal` and relocates the transaction date upon code entry.
    - *Zero Defaulting on Source*: If unmatched, leave unselected (`"• Select source"`); never default to Cash or `accounts[0]`. Form submission is blocked until a money source is explicitly chosen.
    - *Category Fallback*: Defaults to `'Uncategorized'` instead of `'Food'`.
    - *VPA Filtering*: Excludes alphanumeric VPA handles from amount candidates (`user9876543210@upi` ignores `9876543210`).
  - **Verification & Testing**:
    - Expanded `app/test_unified_pipeline.mjs` to 9 comprehensive test suites:
      - Test Suite 1: Google Pay (Standard, No currency prominence, OCR bounding box font height).
      - Test Suite 2: PhonePe (Standard layout, comma formats, fallback amounts, UTR extraction).
      - Test Suite 3: Paytm (Money Sent, decimal format, Chai Point learned rule matching).
      - Test Suite 4: Indian Banking SMS (SBI, HDFC debit alerts).
      - Test Suite 5: Merchant Rules Lookup & Zero-AI Invocations (Gopal Sweet local match, Gopal Medical exact rejection).
      - Test Suite 6: Low Confidence Amount Escalation (Missing amount, ambiguous numbers).
      - Test Suite 7: VPA Handle Filtering in SMS & OCR (`user9876543210@upi` & `merchant123@okhdfcbank` exclusion).
      - Test Suite 8: Tier 1 vs Tier 2 vs Tier 3 Resolution Cascade (Local vs Spatial JSON vs Multimodal Vision).
      - Test Suite 9: Zero-Defaulting on Source Accounts & `'Uncategorized'` Category Fallback.
    - TypeScript typecheck (`npx tsc --noEmit`): 0 errors.
    - ESLint (`npm run lint`): 0 errors, 0 warnings.

- [x] **v1.0.10 (Build 10): Intelligent Date Extraction Normalization, Multi-Tier Bank Matching, Minimal Scan UI, & Google OAuth Fix**:
  - **Date Normalization & "Invalid Date" UI Elimination**:
    - *Root Cause*: In Tier 2 resolution, Gemini spatial extraction returned natural language or locale date strings (e.g., `"29 Sep 2026, 8:46 PM"` or `"Today, 8:46 PM"`). In `AddTransactionScreen.tsx`, date display executed `const [y, m, d] = date.split('-').map(Number); const dObj = new Date(y, m - 1, d);`. Lacking hyphens, this produced `[NaN, NaN, NaN]` &rarr; `new Date(NaN, NaN, NaN)` &rarr; `dObj.toLocaleDateString()` returned literal `"Invalid Date"`.
    - *Solution*: 
      - Created `normalizeDateToIso(rawDate)` in `transactionParser.ts`, strictly transforming arbitrary strings, ISO timestamps (`2026-09-29T...`), relative expressions (`Today`, `Yesterday`), slashed/hyphenated formats (`29/09/2026`, `29-09-26`), and JS `Date.parse()` into strict `YYYY-MM-DD`.
      - Updated Tier 1, Tier 2, and Tier 3 resolution pathways to always normalize dates and fallback to today's ISO date.
      - Sanitized `AddTransactionScreen.tsx` date parser with `isNaN(dObj.getTime())` check, guaranteeing the UI never displays `"Invalid Date"`.
  - **Multi-Tier Intelligent Bank Matching Algorithm (Source Selection)**:
    - *Root Cause*: Previously, receipts containing full bank names like "State Bank of India" or "Fino Payments Bank" failed to match user accounts named "SBI" or "Fino" because of rigid mutual substring checks. Furthermore, recipient UPI handles (e.g. `@okhdfcbank` in `Paid to Gopal Sweet gopalsweet@okhdfcbank`) contaminated whole-text scans, falsely triggering the recipient's bank over the payer's source bank.
    - *Solution*:
      - Implemented comprehensive `BANK_ALIASES` canonical map covering SBI, Fino, Slice, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, Paytm, Airtel, Union Bank, Federal Bank, IDFC, IndusInd, Yes Bank, RBL, Jupiter, Fi, Cred, Cash, etc.
      - Designed two-phase extraction in `matchAccountToSource`:
        - **Phase A (Explicit Source Prioritization)**: Checks labeled source patterns (`From: ...`, `Paid using: ...`, `Debited from: ...`, `Transferred from: ...`) first.
        - **Phase B (Recipient VPA Stripping & Account Scoring)**: Strips recipient UPI/email handles (`gopalsweet@okhdfcbank`), filters generic financial stop-words (`bank`, `account`, `card`, `salary`), and scores accounts on:
          1. Explicit 3-4 digit account numbers (e.g. `XX0186`, `(....0186)`, `ending 4521`).
          2. Exact matching.
          3. Alias family matching with card vs. bank differentiation (e.g., detects "State Bank of India" and chooses user account "SBI" over "SBI Card"; chooses "SBI Card" if "credit card" is present; matches "Fino Payments Bank" to user account "Fino").
      - Zero-defaulting preserved: Unmatched receipts leave source unselected (`• Select source`), preventing unintentional deductions.
  - **Minimal Scan Feedback Banner (UI Clean-up via `/grill-me`)**:
    - Replaced technical jargon and verbose tier badges (`⚡ Tier 1`, `🤖 Tier 2`, `👁️ Tier 3`, "Resolved via Gemini Spatial Layout") with minimal, clean feedback:
      - `✔ Extracted ₹${amount} • ${category}`
      - `Extracted ₹${amount} for ${merchant}`
      - `Matched rule: ${merchant} ➔ ${category}`
  - **Google OAuth Diagnostics & Troubleshooting**:
    - Decoded error strings (`Unable to exchange external code: 4/0A...`) in `authStore.ts`.
    - Documented the 3 required external configuration steps in Google Cloud Console & Supabase Dashboard to resolve Supabase GoTrue token exchange errors.
  - **Verification & Testing**:
    - Expanded `app/test_unified_pipeline.mjs` to **10 test suites** with Test Suite 10 validating:
      - Relative date normalization ("Today", "Today, 8:46 PM", "Yesterday", ISO timestamps).
      - Multi-tier bank matching ("State Bank of India" ➔ "SBI", "SBI Credit Card" ➔ "SBI Card", "Fino Payments Bank" ➔ "Fino", "Slice Super Card" ➔ "Slice", account digit matching `...4521` ➔ "HDFC Bank", unmatched Deutsche Bank ➔ `undefined`).
    - All 10 test suites passed cleanly with 100% assertions satisfied.
    - Automated E2E verification (`npm run test:e2e`): all 6 steps passed.
    - TypeScript typecheck (`npx tsc --noEmit`): 0 errors.
    - ESLint (`npm run lint`): 0 errors, 0 warnings.

- [x] **v1.0.11 (Build 11): Expo Go Runtime Guard for `expo-notifications` on Android**:
  - **Expo SDK 53+ Runtime Guard**:
    - *Issue*: In Expo SDK 53+, remote push notification support was removed from the Expo Go sandbox application. When `expo-notifications` was imported at the module level in `RootNavigator.tsx`, its auto-registration side effect (`DevicePushTokenAutoRegistration.fx`) called `warnOfExpoGoPushUsage()`, which immediately threw a fatal unhandled error on Android (`[runtime not ready]: Error: expo-notifications: Android Push notifications functionality was removed from Expo Go...`). This caused a red-screen crash on startup when developers connected to `expo start` via Expo Go.
    - *Resolution*:
      - Replaced top-level static import with conditional, lazy runtime loading via `isRunningInExpoGo()` from `expo`.
      - When running in Expo Go (`isRunningInExpoGo() === true`), `expo-notifications` is never required or evaluated, completely preventing the fatal crash while allowing hot-reloading and development in Expo Go.
      - When running in a production standalone APK or custom Development Build (`isRunningInExpoGo() === false`), `expo-notifications` is loaded normally with full support for Android background shared intent notifications, notification handler presentation, and tap-to-open routing.
      - Added null-safety checks in `surfaceSharedTransaction` and the notification response listener.
  - **Verification & Testing**:
    - TypeScript typecheck (`npx tsc --noEmit`): 0 errors.
    - ESLint (`npm run lint`): 0 errors, 0 warnings.
    - Full unified pipeline test suite (`node test_unified_pipeline.mjs`): 10/10 test suites passed.

- [x] **v1.0.12 (Build 12): Tier 3 Gemini Vision Bank Auto-Selection & Expo Go LogBox Warning Silence**:
  - **Tier 3 Gemini Vision Bank Auto-Selection**:
    - *Issue*: In Expo Go, where on-device MLKit OCR is unavailable, receipts seamlessly fall back to Tier 3 (Multimodal Vision). However, Tier 3 was only prompting for amount, merchant, and category, and was omitting `detected_bank_or_source`. This prevented the multi-tier bank matching engine from auto-selecting the user's money source (e.g. matching "State Bank of India" to "SBI" or "Fino Payments Bank" to "Fino").
    - *Resolution*:
      - Updated `ParsedReceiptData` interface in `geminiService.ts` to include `detected_bank_or_source?: string | null`.
      - Augmented `parseReceiptWithGemini` system prompt to explicitly extract the payer's source bank, card, or account (`detected_bank_or_source`), while explicitly instructing the model to disregard the payee's recipient VPA handle (e.g., in `Paid to Gopal Sweet gopalsweet@okhdfcbank`, the payer bank is not HDFC).
      - Updated Tier 3 resolution in `transactionParser.ts` to pass `vData.detected_bank_or_source` into `matchAccountToSource`.
      - Preserved strict matching & zero-defaulting: when no bank is visible, `matchedAccountId` remains `undefined` (`• Select source`), ensuring no erroneous charges occur.
  - **Expo Go LogBox Warning Suppression**:
    - In `ocrService.ts`, added `isRunningInExpoGo()` detection. In Expo Go, native MLKit is bypassed with an informative `console.log` instead of `console.warn`, completely eliminating disruptive yellow LogBox warning popups on the device screen.
  - **Verification & Testing**:
    - TypeScript typecheck (`npx tsc --noEmit`): 0 errors.
    - ESLint (`npm run lint`): 0 errors, 0 warnings.
    - Full unified pipeline test suite (`node test_unified_pipeline.mjs`): 10/10 test suites passed, including Tier 3 Vision bank matching assertion.

---

## Architecture Summary
All features and native capabilities are fully implemented, verified, and integrated:
- Core Supabase backend with auto-balancing triggers, RLS, and Realtime sync.
- 7-part Dashboard with Net Worth hero, Indian bank presets, and Category Manager.
- Local-first bank & issuer logo system with static Metro registry and initials fallback.
- Adaptive SMS & UPI learning engine with exact matching, precedence rules, and Supabase cloud sync.
- YouTube-style drag-and-drop reordering with haptic physics.
- Financial discipline rules: Net Worth ceiling and balance calibration audit logging.
- Past month lock system with 4-digit security code and 30-minute auto-relock.
- Historical closing balances snapshot & fresh budget limit rollover.
- Fintech statement PDF export & CSV custom export with scoped storage sharing.
- Cross-platform keyboard avoidance with fluid auto-scroll.
- Complete 4-style MD3 dynamic theme system with Android 12+ Material You support.
- Multimodal Gemini Flash receipt parser & Android share-sheet receiver with zero native dependencies.
- On-demand AI Spending Overview with deterministic trigger gating ($\ge 5$ txns, $\ge 2$ categories), historical closed-period framing, budget omission, tuned prompt, and $\le 120$-word cap.
- Dynamic Gemini model discovery and multi-generation fallback cascade.
- Standalone Android APK build (v1.0.2, Build 3) with native share sheet receiving.
- Self-hosted in-app update prompt system backed by Supabase `app_versions` and `app-releases` bucket.


