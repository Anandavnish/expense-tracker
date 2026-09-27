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
└── app/                   # Expo dev-client mobile application
    ├── package.json       # App metadata ("name": "app") and dependencies
    ├── app.json           # Expo config ("name": "Expense Tracker", "slug": "expense-tracker")
    ├── babel.config.js    # Reanimated plugin configuration
    ├── tsconfig.json
    ├── .env               # Supabase project URL & Anon Key
    ├── test_e2e.mjs       # Automated E2E verification test suite
    ├── assets/
    └── src/
        ├── theme/         # Strict tokens (4/8/12/16/24px spacing, deep slate, dynamic accents)
        ├── types/         # TypeScript database, view models, and bank presets
        ├── services/      # Supabase client with AsyncStorage session persistence
        ├── store/         # Zustand stores (authStore, financeStore, settingsStore)
        ├── components/    # ReanimatedNumber, TactileButton, TransactionRow, InlineError
        ├── navigation/    # RootNavigator, AuthStack, MainTabs
        └── screens/       # Login, SignUp, Dashboard, Transactions, AddTransaction, Budgets, Borrows, Settings
```

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
- [x] **SettingsScreen Added**:
  - *Theme Selector*: Dark / Light / System mode switcher persisted to AsyncStorage via `settingsStore`.
  - *Accent Palette Picker*: 6 swatches (Emerald `#00D09C`, Cyan `#06B6D4`, Amber `#F59E0B`, Rose `#F43F5E`, Blue `#3B82F6`, Violet `#8B5CF6`).
  - *Placeholders*: AI BYOK (Gemini API key), CSV Data Export, and Custom Category Manager.
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

### 8. Redesigned Transaction Card & Deep-Dive Transaction Detail Screen
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

### 6. Unified Manager Redesign: Money Sources & Spending Categories
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

### 7. Dark/Light Theme System & Performance Optimization
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

### 9. Render Error Fix & Distinct Categories by Transaction Type
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

### 10. Single-Section Filter Modal & Quick Pill Direct Access
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


### 11. Light Mode Integration for Account Details & Log Transaction Screens
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

### 12. Theme System — Multi-Style Engine & Android Material You Support
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

### 13. UI Polish & Theme Consistency Audit
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
- [x] **Verification**:
  - Full TypeScript compilation passes with 0 errors (`npx tsc --noEmit`).
  - Expo lint passes with 0 errors and 0 warnings (`npx expo lint`).
  - Automated E2E verification test suite (`node test_e2e.mjs`) passes 100%.

---

## Next Steps
- Implement Screenshot OCR & share-intent parsing (requires dev-client native builds).
- Implement Gemini AI overview & BYOK API key settings modal.






