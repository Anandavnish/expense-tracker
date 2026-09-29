import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressBar, TextInput } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../store/authStore';
import {
  useFinanceStore,
  parseBorrowDetails,
  calculateNetWorth,
  getCurrentMonthString,
  getHistoricalAccountBalances,
  getHistoricalBorrows,
  calculateHistoricalNetWorth,
} from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { MonthUnlockModal } from '../../components/MonthUnlockModal';
import { getSpendingOverviewWithGemini } from '../../services/geminiService';
import {
  SPACING,
  TYPOGRAPHY,
  ThemeColors,
  BANK_BRAND_COLORS,
  CARD_BRAND_COLORS,
  CUSTOM_PALETTE_COLORS,
  getCategoryToken,
} from '../../theme/tokens';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { YouTubeStyleDraggableList } from '../../components/YouTubeStyleDraggableList';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { BankLogo } from '../../components/BankLogo';
import { EditButton } from '../../components/EditButton';
import { CategoryDonutChart, CategoryChartItem } from '../../components/CategoryDonutChart';
import { Account, AccountType, BankPresetCode, CreditCardIssuerCode } from '../../types/database';

interface DashboardScreenProps {
  navigation: any;
  route?: any;
}

interface BankPresetItem {
  code: BankPresetCode;
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const BANK_PRESETS: BankPresetItem[] = [
  { code: 'SBI', label: 'SBI', short: 'State Bank', icon: 'business', color: BANK_BRAND_COLORS.sbi },
  { code: 'India Post', label: 'India Post', short: 'Post Office', icon: 'mail', color: BANK_BRAND_COLORS.indiaPost },
  { code: 'HDFC', label: 'HDFC', short: 'HDFC Bank', icon: 'shield-checkmark', color: BANK_BRAND_COLORS.hdfc },
  { code: 'Canara', label: 'Canara', short: 'Canara Bank', icon: 'triangle', color: BANK_BRAND_COLORS.canara },
  { code: 'PNB', label: 'PNB', short: 'Punjab National', icon: 'ribbon', color: BANK_BRAND_COLORS.pnb },
  { code: 'BOB', label: 'BOB', short: 'Bank of Baroda', icon: 'sunny', color: BANK_BRAND_COLORS.bob },
  { code: 'Fino', label: 'Fino', short: 'Fino Bank', icon: 'star', color: BANK_BRAND_COLORS.fino },
  { code: 'Slice', label: 'Slice', short: 'Slice Bank', icon: 'card', color: BANK_BRAND_COLORS.slice },
  { code: 'Custom', label: '+ Custom', short: 'Other Bank', icon: 'add-circle-outline', color: BANK_BRAND_COLORS.custom },
];

interface CardIssuerItem {
  code: CreditCardIssuerCode;
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const CARD_ISSUERS: CardIssuerItem[] = [
  { code: 'HDFC', label: 'HDFC', short: 'HDFC Bank', icon: 'card', color: CARD_BRAND_COLORS.hdfc },
  { code: 'SBI Card', label: 'SBI Card', short: 'SBI Cards', icon: 'card', color: CARD_BRAND_COLORS.sbiCard },
  { code: 'ICICI', label: 'ICICI', short: 'ICICI Bank', icon: 'card', color: CARD_BRAND_COLORS.icici },
  { code: 'Axis', label: 'Axis', short: 'Axis Bank', icon: 'card', color: CARD_BRAND_COLORS.axis },
  { code: 'Kotak', label: 'Kotak', short: 'Kotak Mahindra', icon: 'card', color: CARD_BRAND_COLORS.kotak },
  { code: 'Slice', label: 'Slice', short: 'Slice Card', icon: 'card', color: CARD_BRAND_COLORS.slice },
  { code: 'OneCard', label: 'OneCard', short: 'OneCard', icon: 'card', color: CARD_BRAND_COLORS.oneCard },
  { code: 'Custom', label: '+ Custom', short: 'Other Issuer', icon: 'add-circle-outline', color: CARD_BRAND_COLORS.custom },
];

const CUSTOM_COLORS = CUSTOM_PALETTE_COLORS;

const CUSTOM_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'business-outline',
  'wallet-outline',
  'card-outline',
  'globe-outline',
  'diamond-outline',
  'rocket-outline',
  'gift-outline',
  'briefcase-outline',
];

export const getCategoryIconProps = (category: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
  return {
    name: getCategoryIcon(category, 'expense'),
    color: getCategoryToken(category).color,
  };
};

/**
 * Renders AI Overview cleanly as natural flowing sentences/paragraphs without artificial subheadings
 */
const renderFormattedOverview = (text: string, styles: any, colors: any, _accent: any) => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // Strip any artificial section labels (e.g., "1. SNAPSHOT:", "PATTERN -", "FLAG:", "NEXT STEP:")
      return line.replace(/^(\d+\.?\s*)?(SNAPSHOT|PATTERN|FLAG|NEXT\s*STEP)\s*[:—–-]\s*/i, '').trim();
    })
    .filter(Boolean);

  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, idx) => (
        <Text key={idx} style={[styles.aiOverviewParagraph, { color: colors.textPrimary }]}>
          {line}
        </Text>
      ))}
    </View>
  );
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuthStore();
  const { accent, colors, hasGeminiApiKey, showAiOverviewOnDashboard } = useSettingsStore();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const sourceModalScrollRef = useRef<ScrollView>(null);
  const categoryModalScrollRef = useRef<ScrollView>(null);

  const {
    accounts,
    transactions,
    borrows,
    budgetSummaries,
    selectedMonth,
    categories,
    setSelectedMonth,
    fetchInitialData,
    createAccountOptimistic,
    updateAccountOptimistic,
    deleteAccountOptimistic,
    reorderAccounts,
    payCreditCardBill,
    deleteBudgetOptimistic,
    addCategory,
    updateCategory,
    removeCategory,
    reorderCategories,
    inlineError,
    setInlineError,
    isMonthLocked,
    lockMonth,
    getUnlockRemainingSeconds,
  } = useFinanceStore();

  const [refreshing, setRefreshing] = useState(false);

  // Month lock & unlock state
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [, setLockTick] = useState(0);

  // Monthly Budget Deletion State
  const [deleteBudgetModalVisible, setDeleteBudgetModalVisible] = useState(false);
  const [isDeletingBudget, setIsDeletingBudget] = useState(false);

  // AI Spending Overview State (On-demand with local cache)
  const [aiOverviewText, setAiOverviewText] = useState<string | null>(null);
  const [aiOverviewTimestamp, setAiOverviewTimestamp] = useState<string | null>(null);
  const [isGeneratingAiOverview, setIsGeneratingAiOverview] = useState(false);
  const [aiOverviewError, setAiOverviewError] = useState<string | null>(null);

  // Load cached AI spending overview whenever selectedMonth changes
  useEffect(() => {
    let isMounted = true;
    const loadCachedAiOverview = async () => {
      try {
        const cached = await AsyncStorage.getItem(`@finance_ai_overview_${selectedMonth}`);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          setAiOverviewText(parsed.text || null);
          setAiOverviewTimestamp(parsed.generatedAt || null);
        } else if (isMounted) {
          setAiOverviewText(null);
          setAiOverviewTimestamp(null);
        }
      } catch {
        if (isMounted) {
          setAiOverviewText(null);
          setAiOverviewTimestamp(null);
        }
      }
    };
    loadCachedAiOverview();
    return () => {
      isMounted = false;
    };
  }, [selectedMonth]);

  const handleConfirmDeleteBudget = async () => {
    if (!user) return;
    setIsDeletingBudget(true);
    const overall = budgetSummaries.find(
      (b) => b.category === null && b.month === selectedMonth
    );
    if (overall) {
      await deleteBudgetOptimistic(overall.budget_id, null, selectedMonth, user.id);
    }
    setIsDeletingBudget(false);
    setDeleteBudgetModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // Manage Money Sources State
  const [sourcesManageVisible, setSourcesManageVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AccountType>('bank');
  const [editBankPreset, setEditBankPreset] = useState<BankPresetCode>('SBI');
  const [editCardIssuer, setEditCardIssuer] = useState<CreditCardIssuerCode>('HDFC');
  const [editCustomColor, setEditCustomColor] = useState<string>(CUSTOM_COLORS[0]);
  const [editCustomIcon, setEditCustomIcon] = useState<keyof typeof Ionicons.glyphMap>('business-outline');
  const [editBalance, setEditBalance] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [isAddingNewSource, setIsAddingNewSource] = useState(false);


  // Delete Account Confirmation State
  const [deleteTargetAccount, setDeleteTargetAccount] = useState<Account | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);

  // Pay Credit Card Bill State
  const [payBillModalVisible, setPayBillModalVisible] = useState(false);
  const [payingCard, setPayingCard] = useState<Account | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paySourceAccountId, setPaySourceAccountId] = useState('');
  const [isPayingBill, setIsPayingBill] = useState(false);

  // Manage Categories State
  const [categoriesManageVisible, setCategoriesManageVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryInputValue, setCategoryInputValue] = useState('');
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<string | null>(null);

  // Auto-handle openManageCategories route param during render (React 19 prop-to-state pattern)
  const [prevOpenCategoriesParam, setPrevOpenCategoriesParam] = useState(route?.params?.openManageCategories);
  if (route?.params?.openManageCategories && route.params.openManageCategories !== prevOpenCategoriesParam) {
    setPrevOpenCategoriesParam(route.params.openManageCategories);
    setCategoriesManageVisible(true);
  }

  // Reorder Drag State (locks scroll while dragging)
  const [isSourcesDragging, setIsSourcesDragging] = useState(false);
  const [isCategoriesDragging, setIsCategoriesDragging] = useState(false);

  const onRefresh = async () => {
    if (!user) return;
    setInlineError(null);
    setRefreshing(true);
    await fetchInitialData(user.id);
    setRefreshing(false);
  };

  // Month navigation logic
  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    setSelectedMonth(newMonth, user?.id);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    setSelectedMonth(newMonth, user?.id);
  };

  const formattedMonthLabel = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const currentMonthStr = useMemo(() => getCurrentMonthString(), []);
  const isPastMonth = selectedMonth < currentMonthStr;
  const isFutureMonth = selectedMonth > currentMonthStr;
  const isLocked = isPastMonth ? isMonthLocked(selectedMonth) : false;
  const unlockSecondsLeft = isPastMonth && !isLocked ? getUnlockRemainingSeconds(selectedMonth) : 0;

  // Real-time countdown timer for unlocked past months
  useEffect(() => {
    if (!isPastMonth || isLocked) {
      return;
    }
    const timer = setInterval(() => {
      const remaining = getUnlockRemainingSeconds(selectedMonth);
      if (remaining <= 0) {
        lockMonth(selectedMonth);
      } else {
        setLockTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedMonth, isPastMonth, isLocked, getUnlockRemainingSeconds, lockMonth]);

  const handleToggleLock = () => {
    if (isLocked) {
      setUnlockModalVisible(true);
    } else {
      Alert.alert(
        'Lock Month?',
        `Re-lock ${formattedMonthLabel} now? No further transactions or edits can be made without entering the security code.`,
        [
          { text: 'Keep Unlocked', style: 'cancel' },
          {
            text: 'Lock Now',
            style: 'destructive',
            onPress: () => {
              lockMonth(selectedMonth);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            },
          },
        ]
      );
    }
  };

  // Calculations for Net Worth Formula (Historical closing balances if past month, 0 if future):
  const effectiveAccounts = useMemo(() => {
    if (isFutureMonth) {
      return accounts.map((acc) => ({ ...acc, current_balance: 0 }));
    }
    if (isPastMonth) {
      return getHistoricalAccountBalances(accounts, transactions, selectedMonth);
    }
    return accounts;
  }, [accounts, transactions, selectedMonth, isPastMonth, isFutureMonth]);

  // 1. Liquid Assets: SUM(all bank accounts + cash)
  const liquidAccounts = effectiveAccounts.filter(
    (a) => a.type === 'bank' || a.type === 'cash'
  );
  const liquidTotal = liquidAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance || 0),
    0
  );

  // 2. Lent & Borrowed (Using getHistoricalBorrows so past months don't show future borrows, and future months show 0)
  const effectiveBorrows = useMemo(() => {
    return getHistoricalBorrows(borrows, transactions, selectedMonth);
  }, [borrows, transactions, selectedMonth]);

  let totalLent = 0;
  let totalBorrowed = 0;
  let pendingLentCount = 0;
  let pendingBorrowedCount = 0;

  effectiveBorrows.forEach((b) => {
    const { type } = parseBorrowDetails(b, transactions);
    if (type === 'borrowed') {
      totalBorrowed += Number(b.amount || 0);
      pendingBorrowedCount += 1;
    } else {
      totalLent += Number(b.amount || 0);
      pendingLentCount += 1;
    }
  });

  // 3. Credit Card Accounts calculations
  const creditAccounts = effectiveAccounts.filter((a) => a.type === 'credit_card');
  const totalCreditLimit = creditAccounts.reduce(
    (sum, a) => sum + Number(a.credit_limit || 0),
    0
  );
  // Outstanding debt owed to credit cards (negative balance represents dues)
  const totalCreditDebt = creditAccounts.reduce(
    (sum, a) => sum + Math.abs(Math.min(0, Number(a.current_balance || 0))),
    0
  );
  // Available limit remaining after spend (fixed limit - debt)
  const totalAvailCredit = Math.max(0, totalCreditLimit - totalCreditDebt);

  // Net Worth: Liquid (Bank + Cash) + Lent - Borrowed - Credit Card Dues
  const fullNetWorth = useMemo(() => {
    if (isFutureMonth) {
      return 0;
    }
    if (isPastMonth) {
      return calculateHistoricalNetWorth(accounts, borrows, transactions, selectedMonth);
    }
    return calculateNetWorth(accounts, borrows, transactions);
  }, [accounts, borrows, transactions, selectedMonth, isPastMonth, isFutureMonth]);

  const formattedNetWorth = fullNetWorth < 0
    ? `−₹${Math.abs(fullNetWorth).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : `₹${fullNetWorth.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  // Previous month string (YYYY-MM) for Net Worth delta indicator
  const previousMonthStr = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!y || !m) return null;
    let prevY = y;
    let prevM = m - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    return `${prevY}-${String(prevM).padStart(2, '0')}`;
  }, [selectedMonth]);

  // Net Worth delta comparing current/selected month closing against previous month's closing net worth
  const netWorthDelta = useMemo(() => {
    if (isFutureMonth || !previousMonthStr) return null;
    const prevNetWorth = calculateHistoricalNetWorth(accounts, borrows, transactions, previousMonthStr);
    if (prevNetWorth === 0 && fullNetWorth === 0) return null;
    const diff = fullNetWorth - prevNetWorth;
    let pct: number | null = null;
    if (prevNetWorth !== 0) {
      const rawPct = (diff / Math.abs(prevNetWorth)) * 100;
      pct = Math.abs(rawPct) >= 10 ? Math.round(rawPct) : Number(rawPct.toFixed(1));
    }
    return {
      diff,
      pct,
      prevNetWorth,
    };
  }, [accounts, borrows, transactions, previousMonthStr, fullNetWorth, isFutureMonth]);

  // This Month's Budget
  const overallBudget =
    budgetSummaries.find((b) => b.category === null) || budgetSummaries[0] || null;

  const budgetSpent = overallBudget ? Number(overallBudget.spent) : 0;
  const budgetLimit = overallBudget ? Number(overallBudget.monthly_limit) : 0;
  const budgetRemaining = overallBudget ? Number(overallBudget.remaining) : 0;
  const budgetPct = overallBudget
    ? Math.min(Number(overallBudget.spent_percentage) / 100, 1)
    : 0;

  const budgetColor =
    budgetPct >= 1 ? colors.alert : budgetPct > 0.8 ? colors.warning : accent.hex;

  // Category spending for selected month
  const categorySpendingMap = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach((cat) => {
      map[cat] = 0;
    });

    // Check budgetSummaries first
    budgetSummaries.forEach((bs) => {
      if (bs.category) {
        map[bs.category] = Number(bs.spent || 0);
      }
    });

    // Also scan transactions for that month to capture all categories
    transactions.forEach((tx) => {
      if (tx.type === 'expense' && tx.date.startsWith(selectedMonth)) {
        if (map[tx.category] !== undefined) {
          if (!budgetSummaries.some((bs) => bs.category === tx.category)) {
            map[tx.category] += Number(tx.amount);
          }
        } else {
          map[tx.category] = (map[tx.category] || 0) + Number(tx.amount);
        }
      }
    });

    return map;
  }, [categories, budgetSummaries, transactions, selectedMonth]);

  // Data formatted specifically for the CategoryDonutChart (only categories with spend > 0)
  const { categoryChartData, totalCategoryExpenses } = useMemo(() => {
    let total = 0;
    const items: CategoryChartItem[] = [];
    Object.entries(categorySpendingMap).forEach(([cat, amt]) => {
      if (amt > 0) {
        total += amt;
        items.push({
          category: cat,
          amount: amt,
          color: getCategoryToken(cat).color,
        });
      }
    });
    return {
      categoryChartData: items,
      totalCategoryExpenses: total,
    };
  }, [categorySpendingMap]);

  // Max spend for category progress relative calculation
  const maxCategorySpend = useMemo(() => {
    const vals = Object.values(categorySpendingMap);
    return Math.max(1, ...vals);
  }, [categorySpendingMap]);

  // Month transactions and distinct categories for gating & overview
  const monthTransactions = useMemo(() => {
    return transactions.filter(
      (t) => t.date && t.date.startsWith(selectedMonth)
    );
  }, [transactions, selectedMonth]);

  const distinctCategoriesCount = useMemo(() => {
    const set = new Set<string>();
    monthTransactions.forEach((t) => {
      if (t.category && t.category.trim()) {
        set.add(t.category.trim());
      }
    });
    return set.size;
  }, [monthTransactions]);

  // Concrete trigger gate: At least 5 transactions AND at least 2 distinct categories
  const isAiOverviewGated = monthTransactions.length < 5 || distinctCategoriesCount < 2;

  const handleGenerateAiOverview = async () => {
    // 1. Concrete deterministic trigger gate BEFORE calling Gemini
    if (isAiOverviewGated) {
      return;
    }

    if (!hasGeminiApiKey) {
      Alert.alert(
        'Gemini Key Required',
        'Set up your free AI key in Settings to unlock AI spending summaries.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => navigation.navigate('Settings'),
          },
        ]
      );
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setIsGeneratingAiOverview(true);
      setAiOverviewError(null);

      let totalIncome = 0;
      let totalExpense = 0;
      const categoryMap: Record<string, number> = {};

      monthTransactions.forEach((t) => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
          totalIncome += amt;
        } else if (t.type === 'expense') {
          totalExpense += amt;
          categoryMap[t.category] = (categoryMap[t.category] || 0) + amt;
        }
      });

      // Top 5 categories with percentages
      const topCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, amt]) => ({
          category: cat,
          amount: amt,
          percentOfTotal: totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0,
        }));

      const isHistorical = isPastMonth || isLocked;

      // Days remaining in month (only for active in-progress month)
      let daysRemainingInMonth: number | null = null;
      if (!isHistorical) {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonthNum = today.getMonth() + 1;
        const [selYear, selMonth] = selectedMonth.split('-').map(Number);
        if (selYear === currentYear && selMonth === currentMonthNum) {
          const daysInMonth = new Date(selYear, selMonth, 0).getDate();
          daysRemainingInMonth = Math.max(0, daysInMonth - today.getDate());
        }
      }

      // Check credit limit & debt across all credit cards
      const totalCreditLimit = creditAccounts.reduce((sum, c) => sum + Number(c.credit_limit || 0), 0);

      // Construct compact summary with strict omission of budget variance if no budget exists
      const compactSummary: Record<string, any> = {
        month: formattedMonthLabel,
        currency: 'INR (₹)',
        currencySymbol: '₹',
        isHistorical,
        periodStatus: isHistorical
          ? `Historical closed and finalized period for ${formattedMonthLabel}`
          : `Active in-progress period for ${formattedMonthLabel}`,
        totalIncome,
        totalExpense,
        netSavings: totalIncome - totalExpense,
        transactionCount: monthTransactions.length,
        distinctCategoriesCount,
        topSpendingCategories: topCategories,
        ...(daysRemainingInMonth !== null ? { daysRemainingInMonth } : {}),
        ...(totalCreditLimit > 0
          ? {
              creditCardUtilizationPercent: Math.round((totalCreditDebt / totalCreditLimit) * 100),
            }
          : {}),
      };

      // STRICT: Omit budget-variance data entirely if no budget is set!
      if (budgetLimit > 0) {
        compactSummary.budgetLimit = budgetLimit;
        compactSummary.budgetSpent = budgetSpent;
        compactSummary.budgetRemaining = budgetLimit - budgetSpent;
        compactSummary.budgetPercentUsed = Math.round((budgetSpent / budgetLimit) * 100);
      }

      const res = await getSpendingOverviewWithGemini(compactSummary);
      setIsGeneratingAiOverview(false);

      if (res.success && res.data) {
        setAiOverviewText(res.data);
        const nowIso = new Date().toISOString();
        setAiOverviewTimestamp(nowIso);
        await AsyncStorage.setItem(
          `@finance_ai_overview_${selectedMonth}`,
          JSON.stringify({ month: selectedMonth, text: res.data, generatedAt: nowIso })
        ).catch(() => {});
      } else {
        if (res.error === 'INSUFFICIENT_DATA') {
          setAiOverviewError(res.message || 'Log a few more transactions this month to unlock an overview');
        } else if (res.error === 'MISSING_KEY') {
          Alert.alert(
            'Gemini Key Required',
            'Set up your AI key in Settings to use this feature.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
            ]
          );
        } else if (res.error === 'INVALID_KEY') {
          Alert.alert(
            'Invalid API Key',
            res.message || 'Please check your Gemini key in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
            ]
          );
        } else if (res.error === 'RATE_LIMIT') {
          setAiOverviewError('Rate limit exceeded. Please wait a minute before trying again.');
        } else {
          setAiOverviewError(res.message || 'Failed to generate AI overview.');
        }
      }
    } catch (err: any) {
      setIsGeneratingAiOverview(false);
      setAiOverviewError(err?.message || 'Failed to generate AI overview.');
    }
  };

  // Helper to parse preset & custom name from an account
  const parseAccountDetails = (acc: Account) => {
    const raw = acc.name?.trim() || '';
    if (acc.type === 'bank') {
      if (raw.includes('•')) {
        const parts = raw.split('•').map((s) => s.trim());
        const match = BANK_PRESETS.find((p) => p.code.toLowerCase() === parts[0].toLowerCase());
        return {
          preset: match ? match.code : parts[0],
          customName: parts.slice(1).join(' • '),
        };
      }
      const directMatch = BANK_PRESETS.find((p) => p.code.toLowerCase() === raw.toLowerCase());
      if (directMatch) {
        return { preset: directMatch.code, customName: '' };
      }
      return { preset: acc.bank_preset || null, customName: raw };
    }
    if (acc.type === 'credit_card') {
      if (raw.includes('•')) {
        const parts = raw.split('•').map((s) => s.trim());
        const match = CARD_ISSUERS.find((i) => i.code.toLowerCase() === parts[0].toLowerCase());
        return {
          issuer: match ? match.code : parts[0],
          customName: parts.slice(1).join(' • '),
        };
      }
      const directMatch = CARD_ISSUERS.find((i) => i.code.toLowerCase() === raw.toLowerCase());
      if (directMatch) {
        return { issuer: directMatch.code, customName: '' };
      }
      return { issuer: acc.card_issuer || null, customName: raw };
    }
    return { preset: null, issuer: null, customName: raw };
  };

  // Account display formatting: Preset shortcut first, then source name (e.g. SBI • Salary A/c or just SBI)
  const getAccountDisplay = (acc: Account) => {
    const rawName = acc.name?.trim();

    if (acc.type === 'bank') {
      const parsed = parseAccountDetails(acc);
      const preset = acc.bank_preset && acc.bank_preset !== 'Custom' ? acc.bank_preset : parsed.preset;
      const subName = parsed.customName;
      if (preset && subName) {
        return { title: `${preset} • ${subName}`, subtitle: 'Bank Account' };
      } else if (preset) {
        return { title: preset, subtitle: 'Bank Account' };
      }
      return { title: rawName || 'Bank Account', subtitle: 'Bank Account' };
    }

    if (acc.type === 'credit_card') {
      const parsed = parseAccountDetails(acc);
      const issuer = acc.card_issuer && acc.card_issuer !== 'Custom' ? acc.card_issuer : parsed.issuer;
      const subName = parsed.customName;
      if (issuer && subName) {
        return { title: `${issuer} • ${subName}`, subtitle: 'Credit Card' };
      } else if (issuer) {
        return { title: issuer, subtitle: 'Credit Card' };
      }
      return { title: rawName || 'Credit Card', subtitle: 'Credit Card' };
    }

    // Cash
    return { title: rawName || 'Cash Wallet', subtitle: 'Cash Wallet' };
  };

  // Handle Save or Edit Source
  const handleOpenEditSource = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      const parsed = parseAccountDetails(account);
      setEditName(parsed.customName || account.name || '');
      setEditType(account.type);
      setEditBankPreset(((account.bank_preset || parsed.preset || 'SBI') as BankPresetCode));
      setEditCardIssuer(((account.card_issuer || parsed.issuer || 'HDFC') as CreditCardIssuerCode));
      setEditCustomColor(account.custom_color || CUSTOM_COLORS[0]);
      setEditCustomIcon(
        (account.custom_icon as any) ||
          (account.type === 'credit_card'
            ? 'card-outline'
            : account.type === 'cash'
            ? 'wallet-outline'
            : 'business-outline')
      );
      if (account.type === 'credit_card') {
        const outstanding = Math.abs(Math.min(0, Number(account.current_balance || 0)));
        setEditBalance(outstanding > 0 ? String(outstanding) : '');
      } else {
        const bal = Number(account.current_balance || 0);
        setEditBalance(bal !== 0 ? String(bal) : '');
      }
      setEditCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
      setIsAddingNewSource(false);
    } else {
      setEditingAccount(null);
      setEditName('');
      setEditType('bank');
      setEditBankPreset('SBI');
      setEditCardIssuer('HDFC');
      setEditCustomColor(CUSTOM_COLORS[0]);
      setEditCustomIcon('business-outline');
      setEditBalance('');
      setEditCreditLimit('');
      setIsAddingNewSource(true);
    }
  };

  const handleOpenPayBill = (card: Account) => {
    setPayingCard(card);
    const spent = Math.abs(Math.min(0, Number(card.current_balance || 0)));
    setPayAmount(spent > 0 ? String(spent) : '');
    const defaultSource = liquidAccounts.find((a) => a.type === 'bank') || liquidAccounts[0];
    setPaySourceAccountId(defaultSource?.id || '');
    setPayBillModalVisible(true);
  };

  const handleConfirmPayBill = async () => {
    if (!user || !payingCard || !paySourceAccountId) return;
    const numAmount = parseFloat(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setInlineError('Please enter a valid bill payment amount');
      return;
    }
    setIsPayingBill(true);
    const res = await payCreditCardBill(
      payingCard.id,
      paySourceAccountId,
      numAmount,
      user.id
    );
    setIsPayingBill(false);
    if (res.success) {
      setPayBillModalVisible(false);
      setPayingCard(null);
    }
  };


  const handleSaveCategory = () => {
    const trimmed = categoryInputValue.trim();
    if (!trimmed) return;

    if (editingCategory) {
      updateCategory(editingCategory, trimmed);
    } else {
      addCategory(trimmed);
    }

    setCategoryInputValue('');
    setEditingCategory(null);
    setShowAddCategoryInput(false);
  };

  const handleStartEditCategory = (cat: string) => {
    setEditingCategory(cat);
    setCategoryInputValue(cat);
    setShowAddCategoryInput(true);
  };

  const handleCancelCategoryInput = () => {
    setCategoryInputValue('');
    setEditingCategory(null);
    setShowAddCategoryInput(false);
  };

  const handleConfirmDeleteCategory = () => {
    if (categoryDeleteTarget) {
      removeCategory(categoryDeleteTarget);
      setCategoryDeleteTarget(null);
    }
  };

  const handleOpenDeleteAccount = (acc: Account) => {
    setDeleteTargetAccount(acc);
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deleteTargetAccount) return;
    setIsDeletingSource(true);
    await deleteAccountOptimistic(deleteTargetAccount.id);
    setIsDeletingSource(false);
    setDeleteTargetAccount(null);
    if (editingAccount?.id === deleteTargetAccount.id) {
      setEditingAccount(null);
      setIsAddingNewSource(false);
    }
  };

  const handleSaveSource = async () => {
    if (!user) return;

    let finalName = editName.trim();
    if (editType === 'bank') {
      if (editBankPreset !== 'Custom') {
        finalName = editName.trim() && editName.trim().toLowerCase() !== editBankPreset.toLowerCase()
          ? `${editBankPreset} • ${editName.trim()}`
          : editBankPreset;
      } else {
        finalName = editName.trim() || 'Bank Account';
      }
    } else if (editType === 'credit_card') {
      if (editCardIssuer !== 'Custom') {
        finalName = editName.trim() && editName.trim().toLowerCase() !== editCardIssuer.toLowerCase()
          ? `${editCardIssuer} • ${editName.trim()}`
          : editCardIssuer;
      } else {
        finalName = editName.trim() || 'Credit Card';
      }
    } else {
      finalName = editName.trim() || 'Cash Wallet';
    }

    const rawVal = parseFloat(editBalance) || 0;
    const parsedBalance = editType === 'credit_card' ? -Math.abs(rawVal) : rawVal;
    const parsedLimit = editCreditLimit ? parseFloat(editCreditLimit) || null : null;

    if (isAddingNewSource) {
      await createAccountOptimistic({
        user_id: user.id,
        name: finalName,
        type: editType,
        current_balance: parsedBalance,
        credit_limit: parsedLimit,
        bank_preset: editType === 'bank' ? editBankPreset : null,
        card_issuer: editType === 'credit_card' ? editCardIssuer : null,
        custom_color:
          (editType === 'bank' && editBankPreset === 'Custom') ||
          (editType === 'credit_card' && editCardIssuer === 'Custom')
            ? editCustomColor
            : null,
        custom_icon:
          (editType === 'bank' && editBankPreset === 'Custom') ||
          (editType === 'credit_card' && editCardIssuer === 'Custom')
            ? editCustomIcon
            : null,
      });
      setEditingAccount(null);
      setIsAddingNewSource(false);
    } else if (editingAccount) {
      // Update metadata and recalibrated balance
      await updateAccountOptimistic(editingAccount.id, {
        name: finalName,
        type: editType,
        current_balance: parsedBalance,
        credit_limit: parsedLimit,
        bank_preset: editType === 'bank' ? editBankPreset : null,
        card_issuer: editType === 'credit_card' ? editCardIssuer : null,
        custom_color:
          (editType === 'bank' && editBankPreset === 'Custom') ||
          (editType === 'credit_card' && editCardIssuer === 'Custom')
            ? editCustomColor
            : null,
        custom_icon:
          (editType === 'bank' && editBankPreset === 'Custom') ||
          (editType === 'credit_card' && editCardIssuer === 'Custom')
            ? editCustomIcon
            : null,
      });

      setEditingAccount(null);
      setIsAddingNewSource(false);
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {/* 1. Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appGreeting}>Welcome back,</Text>
          <Text style={styles.appName}>
            {isGuest ? 'Guest Explorer' : user?.email ? user.email.split('@')[0] : 'Expense Tracker'}
          </Text>
        </View>
        <View style={styles.topRightActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            style={[styles.avatarPill, { borderColor: accent.hex }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            {isGuest ? (
              <Ionicons name="person-outline" size={16} color={accent.hex} />
            ) : (
              <Text style={[styles.avatarText, { color: accent.hex }]}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Fixed Month Selector (Capsule with transparent area around it) */}
      <View style={styles.monthSelectorContainer}>
        <View style={styles.monthSelectorCapsule}>
          <TouchableOpacity
            onPress={handlePrevMonth}
            style={styles.arrowBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={18} color={accent.hex} />
          </TouchableOpacity>

          <View style={styles.capsuleCenterRow}>
            <Text style={styles.monthLabelText}>{formattedMonthLabel}</Text>
            {isPastMonth && (
              <TouchableOpacity
                onPress={handleToggleLock}
                style={[
                  styles.capsuleLockBadge,
                  isLocked ? styles.capsuleLockBadgeLocked : styles.capsuleLockBadgeUnlocked,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'lock-open'}
                  size={12}
                  color={isLocked ? colors.textMuted : accent.hex}
                />
                {!isLocked && (
                  <Text style={[styles.capsuleLockTimerText, { color: accent.hex }]}>
                    {Math.max(1, Math.ceil(unlockSecondsLeft / 60))}m
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {isFutureMonth && (
              <View style={[styles.capsuleLockBadge, styles.capsuleLockBadgeLocked]}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.capsuleLockTimerText, { color: colors.textMuted }]}>
                  UPCOMING
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleNextMonth}
            style={styles.arrowBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={18} color={accent.hex} />
          </TouchableOpacity>
        </View>

        {selectedMonth !== currentMonthStr && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setSelectedMonth(currentMonthStr, user?.id);
            }}
            style={[
              styles.returnCurrentMonthBtn,
              { borderColor: accent.hex + '44', backgroundColor: colors.surface },
            ]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-undo-outline" size={12} color={accent.hex} />
            <Text style={[styles.returnCurrentMonthText, { color: accent.hex }]}>
              Return to Current Month
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <View style={styles.scrollWrapper}>
        <LinearGradient
          colors={[colors.background, 'transparent']}
          style={styles.topFadeGradient}
          pointerEvents="none"
        />
        <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        {/* 3. TOTAL NET WORTH Card */}
        <View style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.netWorthEyebrow}>Total Net Worth</Text>
                {isPastMonth && (
                  <View style={styles.historicalSnapshotPill}>
                    <Text style={styles.historicalSnapshotText}>CLOSING SNAPSHOT</Text>
                  </View>
                )}
                {isFutureMonth && (
                  <View style={[styles.historicalSnapshotPill, { backgroundColor: colors.border }]}>
                    <Text style={[styles.historicalSnapshotText, { color: colors.textMuted }]}>UPCOMING</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.netWorthHeroNumber,
                  TYPOGRAPHY.heroNumber,
                  { color: colors.textPrimary },
                ]}
              >
                {formattedNetWorth}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
                {netWorthDelta && !isFutureMonth && (
                  <View
                    style={[
                      styles.netWorthDeltaBadge,
                      {
                        backgroundColor:
                          netWorthDelta.diff > 0
                            ? colors.success + '15'
                            : netWorthDelta.diff < 0
                            ? colors.alert + '15'
                            : colors.surfaceLight,
                        borderColor:
                          netWorthDelta.diff > 0
                            ? colors.success + '30'
                            : netWorthDelta.diff < 0
                            ? colors.alert + '30'
                            : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        netWorthDelta.diff > 0
                          ? 'trending-up'
                          : netWorthDelta.diff < 0
                          ? 'trending-down'
                          : 'remove'
                      }
                      size={12}
                      color={
                        netWorthDelta.diff > 0
                          ? colors.success
                          : netWorthDelta.diff < 0
                          ? colors.alert
                          : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.netWorthDeltaText,
                        TYPOGRAPHY.tabularText,
                        {
                          color:
                            netWorthDelta.diff > 0
                              ? colors.success
                              : netWorthDelta.diff < 0
                              ? colors.alert
                              : colors.textMuted,
                        },
                      ]}
                    >
                      {netWorthDelta.diff > 0 ? '▲ +' : netWorthDelta.diff < 0 ? '▼ −' : '— '}₹
                      {Math.abs(netWorthDelta.diff).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      {netWorthDelta.pct !== null
                        ? ` (${netWorthDelta.diff > 0 ? '+' : ''}${netWorthDelta.pct}%)`
                        : ''}{' '}
                      vs last month
                    </Text>
                  </View>
                )}
                {totalCreditLimit > 0 && !isFutureMonth && (
                  <View style={[styles.availCreditPill, { borderColor: colors.border, marginTop: 0 }]}>
                    <Ionicons name="card-outline" size={12} color={accent.hex} />
                    <Text style={styles.availCreditText}>
                      Avail. Credit: ₹{totalAvailCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })} of ₹{totalCreditLimit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.netWorthDivider} />

          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Cash & Bank</Text>
              <Text style={[styles.breakdownValue, TYPOGRAPHY.tabularText]}>
                ₹{liquidTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.breakdownItem}
              onPress={() => navigation.navigate('Borrows')}
              activeOpacity={0.7}
            >
              <View style={styles.breakdownLabelRow}>
                <Text style={styles.breakdownLabel}>Lent</Text>
                <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
              </View>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalLent > 0 ? colors.success : colors.textSecondary },
                ]}
              >
                {totalLent > 0 ? `+₹${totalLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.breakdownItem}
              onPress={() => navigation.navigate('Borrows')}
              activeOpacity={0.7}
            >
              <View style={styles.breakdownLabelRow}>
                <Text style={styles.breakdownLabel}>Borrowed</Text>
                <Ionicons name="chevron-forward" size={10} color={colors.textMuted} />
              </View>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalBorrowed > 0 ? colors.warning : colors.textSecondary },
                ]}
              >
                {totalBorrowed > 0 ? `−₹${totalBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
              </Text>
            </TouchableOpacity>

            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Card Dues</Text>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalCreditDebt > 0 ? colors.warning : colors.textSecondary },
                ]}
              >
                {totalCreditDebt > 0
                  ? `−₹${totalCreditDebt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  : '₹0'}
              </Text>
            </View>
          </View>
        </View>

        {/* 4. This Month's Budget Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>Monthly Budget</Text>
            {isPastMonth && isLocked ? (
              <View style={styles.budgetLockedTag}>
                <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
                <Text style={styles.budgetLockedTagText}>LOCKED</Text>
              </View>
            ) : budgetLimit > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <EditButton
                  size={26}
                  iconSize={13}
                  onPress={() =>
                    navigation.navigate('Budgets', {
                      editCategory: 'Overall Budget',
                      currentLimit: String(budgetLimit),
                    })
                  }
                />
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setDeleteBudgetModalVisible(true);
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    backgroundColor: `${colors.alert}15`,
                    borderColor: `${colors.alert}30`,
                    borderWidth: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={13} color={colors.alert} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('Budgets', {
                    editCategory: 'Overall Budget',
                    currentLimit: '',
                  })
                }
              >
                <Text style={[styles.cardHeaderAction, { color: accent.hex }]}>+ Set</Text>
              </TouchableOpacity>
            )}
          </View>

          {budgetLimit > 0 ? (
            <View style={styles.budgetContent}>
              <Text style={styles.budgetStatusLine}>
                ₹{budgetSpent.toLocaleString('en-IN')} spent of ₹
                {budgetLimit.toLocaleString('en-IN')}
              </Text>

              <ProgressBar
                progress={budgetPct}
                color={budgetColor}
                style={styles.budgetProgressBar}
              />

              <View style={styles.budgetMetaRow}>
                <Text style={styles.budgetRemainingLabel}>
                  Remaining:{' '}
                  <Text
                    style={[
                      TYPOGRAPHY.tabularText,
                      { color: budgetRemaining >= 0 ? accent.hex : colors.alert },
                    ]}
                  >
                    ₹{budgetRemaining.toLocaleString('en-IN')}
                  </Text>
                </Text>
                <Text
                  style={[
                    styles.budgetPercentText,
                    TYPOGRAPHY.tabularText,
                    { color: budgetColor },
                  ]}
                >
                  {Math.round(budgetPct * 100)}%
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCardContent}>
              <Text style={styles.emptyCardText}>No budget configured for this month.</Text>
            </View>
          )}
        </View>

        {/* AI Spending Overview Card */}
        {showAiOverviewOnDashboard && (
          <View style={styles.card}>
            <View style={styles.cardHeaderWithAction}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 8 }}>
                <Ionicons
                  name={isPastMonth || isLocked ? 'time-outline' : 'sparkles'}
                  size={14}
                  color={accent.hex}
                />
                <Text style={styles.cardHeaderLabel} numberOfLines={1}>
                  {isPastMonth || isLocked
                    ? `Historical summary for ${formattedMonthLabel}`
                    : 'Spending Overview'}
                </Text>
              </View>
              {!isAiOverviewGated && aiOverviewText && (
                <TouchableOpacity
                  onPress={handleGenerateAiOverview}
                  disabled={isGeneratingAiOverview}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  {isGeneratingAiOverview ? (
                    <ActivityIndicator size="small" color={accent.hex} />
                  ) : (
                    <>
                      <Ionicons name="reload-outline" size={13} color={accent.hex} />
                      <Text style={[styles.cardHeaderAction, { color: accent.hex }]}>Refresh</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {isGeneratingAiOverview ? (
              <View style={styles.aiOverviewLoadingBox}>
                <ActivityIndicator size="small" color={accent.hex} />
                <Text style={styles.aiOverviewLoadingText}>
                  {isPastMonth || isLocked
                    ? `Synthesizing historical summary for ${formattedMonthLabel}...`
                    : `Analyzing your ${formattedMonthLabel} spending with Gemini AI...`}
                </Text>
              </View>
            ) : isAiOverviewGated ? (
              /* Distinct, clearly-worded empty state (not an error) */
              <View style={styles.aiOverviewGatedBox}>
                <View style={[styles.aiOverviewGatedIconBadge, { backgroundColor: colors.surfaceVariant }]}>
                  <Ionicons name="bar-chart-outline" size={20} color={colors.textSecondary} />
                </View>
                <Text style={[styles.aiOverviewGatedTitle, { color: colors.textPrimary }]}>
                  Log a few more transactions this month to unlock an overview
                </Text>
                <Text style={[styles.aiOverviewGatedSub, { color: colors.textMuted }]}>
                  Requires at least 5 transactions across 2 distinct categories (Currently {monthTransactions.length}/5 transactions • {distinctCategoriesCount}/2 categories)
                </Text>
              </View>
            ) : aiOverviewText ? (
              <View style={styles.aiOverviewContentBox}>
                {renderFormattedOverview(aiOverviewText, styles, colors, accent)}
                {aiOverviewTimestamp && (
                  <View style={styles.aiOverviewMetaRow}>
                    <Text style={styles.aiOverviewMetaText}>
                      Cached • Generated{' '}
                      {new Date(aiOverviewTimestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <View style={[styles.byokTag, { borderColor: colors.border }]}>
                      <Text style={styles.byokTagText}>
                        {isPastMonth || isLocked ? 'CLOSED PERIOD' : 'BYOK GEMINI'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.aiOverviewEmptyBox}>
                <Text style={styles.aiOverviewEmptyDesc}>
                  {isPastMonth || isLocked
                    ? `Generate an official historical synthesis of your closed ${formattedMonthLabel} ledger.`
                    : `Get an on-demand, plain-language summary of your spending patterns and top categories for ${formattedMonthLabel}.`}
                </Text>
                <TactileButton
                  onPress={handleGenerateAiOverview}
                  style={[
                    styles.aiGenerateBtn,
                    { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={14} color={accent.hex} />
                    <Text style={[styles.aiGenerateBtnText, { color: colors.textPrimary }]}>
                      {isPastMonth || isLocked ? 'Generate Historical Summary' : 'Generate AI Overview'}
                    </Text>
                  </View>
                </TactileButton>
              </View>
            )}

            {aiOverviewError && !isAiOverviewGated && (
              <View style={styles.aiOverviewErrorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.alert} />
                <Text style={styles.aiOverviewErrorText}>{aiOverviewError}</Text>
              </View>
            )}
          </View>
        )}

        {/* 5. Money Sources Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cardHeaderLabel}>Money Sources</Text>
              {isPastMonth && (
                <View style={styles.historicalSnapshotPill}>
                  <Text style={styles.historicalSnapshotText}>CLOSING SNAPSHOT</Text>
                </View>
              )}
              {isFutureMonth && (
                <View style={[styles.historicalSnapshotPill, { backgroundColor: colors.border }]}>
                  <Text style={[styles.historicalSnapshotText, { color: colors.textMuted }]}>UPCOMING</Text>
                </View>
              )}
            </View>
            {isPastMonth || isFutureMonth ? null : (
              <EditButton
                size={26}
                iconSize={13}
                onPress={() => setSourcesManageVisible(true)}
              />
            )}
          </View>

          <View style={styles.sourcesList}>
            {/* Section A: Liquid Funds (Cash & Bank) */}
            <View style={styles.sourceSectionHeader}>
              <Text style={styles.sourceSectionTitle}>Bank & Cash</Text>
              <Text style={[styles.sourceSectionBadge, TYPOGRAPHY.tabularText]}>
                ₹{liquidTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>

            {effectiveAccounts
              .filter((a) => a.type !== 'credit_card')
              .map((acc) => {
                const { title, subtitle } = getAccountDisplay(acc);
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={styles.sourceRow}
                    onPress={() =>
                      navigation.navigate('AccountDetail', { accountId: acc.id })
                    }
                    onLongPress={() => handleOpenEditSource(acc)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sourceLeft}>
                      <BankLogo account={acc} name={title} size={36} />
                      <View>
                        <Text style={styles.sourceName}>{title}</Text>
                        {subtitle ? (
                          <Text style={styles.sourceSub}>{subtitle}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.sourceRightCol}>
                      <Text
                        style={[
                          styles.sourceAmount,
                          TYPOGRAPHY.tabularText,
                          {
                            color:
                              Number(acc.current_balance) >= 0
                                ? colors.textPrimary
                                : colors.alert,
                          },
                        ]}
                      >
                        ₹
                        {Number(acc.current_balance).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}

            {/* Section B: Credit Cards (Credit Lines & Debt) */}
            <View style={[styles.sourceSectionHeader, { marginTop: SPACING.md }]}>
              <Text style={styles.sourceSectionTitle}>Credit Cards</Text>
              <Text
                style={[
                  styles.sourceSectionBadge,
                  TYPOGRAPHY.tabularText,
                  { color: totalCreditDebt > 0 ? colors.warning : colors.success },
                ]}
              >
                {totalCreditDebt > 0
                  ? `₹${totalCreditDebt.toLocaleString('en-IN')} Due`
                  : 'All Paid Off'}
              </Text>
            </View>

            {creditAccounts.length === 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setEditingAccount(null);
                  setEditName('');
                  setEditType('credit_card');
                  setEditCardIssuer('HDFC');
                  setEditBalance('0');
                  setEditCreditLimit('25000');
                  setIsAddingNewSource(true);
                  setSourcesManageVisible(true);
                }}
                style={styles.addCreditCardBtn}
              >
                <Ionicons name="add-circle-outline" size={16} color={accent.hex} />
                <Text style={[styles.addCreditCardBtnText, { color: accent.hex }]}>
                  Add Credit Card
                </Text>
              </TouchableOpacity>
            ) : (
              creditAccounts.map((card) => {
                const limit = Number(card.credit_limit || 0);
                const spent = Math.abs(Math.min(0, Number(card.current_balance || 0)));
                const available = Math.max(0, limit - spent);
                const isOverspent = spent > limit;
                const usedRatio = limit > 0 ? Math.min(spent / limit, 1) : 0;
                const barColor = isOverspent ? colors.alert : usedRatio > 0.8 ? colors.warning : accent.hex;
                const { title } = getAccountDisplay(card);

                return (
                  <View key={card.id} style={styles.creditCardSourceContainer}>
                    <TouchableOpacity
                      style={styles.creditCardSourceRow}
                      onPress={() =>
                        navigation.navigate('AccountDetail', { accountId: card.id })
                      }
                      onLongPress={() => handleOpenEditSource(card)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sourceRow}>
                        <View style={styles.sourceLeft}>
                          <BankLogo account={card} name={title} size={36} />
                          <View>
                            <Text style={styles.sourceName}>{title}</Text>
                            <Text style={styles.sourceSub}>
                              {isOverspent
                                ? `Overspent: ₹${(spent - limit).toLocaleString('en-IN')}`
                                : `Avail: ₹${available.toLocaleString('en-IN')} of ₹${limit.toLocaleString('en-IN')}`}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.sourceRightCol}>
                          <Text
                            style={[
                              styles.sourceAmount,
                              TYPOGRAPHY.tabularText,
                              { color: spent > 0 ? colors.warning : colors.success },
                            ]}
                          >
                            {spent > 0
                              ? `₹${spent.toLocaleString('en-IN')} Due`
                              : '₹0 Due'}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                        </View>
                      </View>
                      <ProgressBar
                        progress={usedRatio}
                        color={barColor}
                        style={styles.creditProgressBar}
                      />
                    </TouchableOpacity>

                    {/* Quick Action Pill Row */}
                    <View style={styles.cardActionsRow}>
                      {spent > 0 ? (
                        <TouchableOpacity
                          style={[styles.payBillActionPill, { borderColor: accent.hex }]}
                          onPress={() => handleOpenPayBill(card)}
                        >
                          <Ionicons name="wallet-outline" size={13} color={accent.hex} />
                          <Text style={[styles.payBillActionPillText, { color: accent.hex }]}>
                            Pay Bill
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={styles.cardExpenseActionPill}
                        onPress={() =>
                          navigation.navigate('AddTransaction', { accountId: card.id })
                        }
                      >
                        <Ionicons name="add" size={13} color={colors.textSecondary} />
                        <Text style={styles.cardExpenseActionPillText}>Expense</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Debts & Borrows Summary Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="swap-horizontal" size={16} color={accent.hex} />
              <Text style={styles.cardHeaderLabel}>Debts & Borrows</Text>
              {isPastMonth && (
                <View style={styles.historicalSnapshotPill}>
                  <Text style={styles.historicalSnapshotText}>CLOSING SNAPSHOT</Text>
                </View>
              )}
              {isFutureMonth && (
                <View style={[styles.historicalSnapshotPill, { backgroundColor: colors.border }]}>
                  <Text style={[styles.historicalSnapshotText, { color: colors.textMuted }]}>UPCOMING</Text>
                </View>
              )}
            </View>
            {isFutureMonth ? null : (
              <TouchableOpacity
                onPress={() => navigation.navigate('Borrows')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Text style={[styles.cardHeaderAction, { color: accent.hex }]}>Manage</Text>
                <Ionicons name="chevron-forward" size={13} color={accent.hex} />
              </TouchableOpacity>
            )}
          </View>

          {effectiveBorrows.length === 0 ? (
            <TouchableOpacity
              style={styles.borrowEmptyRow}
              onPress={() => navigation.navigate('Borrows')}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.textMuted} />
              <Text style={styles.borrowEmptyText}>
                {isFutureMonth
                  ? 'Upcoming month — No active debts or loans recorded yet.'
                  : isPastMonth
                  ? `No active debts or loans were recorded for ${formattedMonthLabel}.`
                  : 'No open debts or loans. Tap to record or view history.'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.borrowOverviewContent}>
              <View style={styles.borrowStatsRow}>
                <TouchableOpacity
                  style={[styles.borrowStatBox, { borderColor: `${colors.lent}33`, backgroundColor: `${colors.lent}0D` }]}
                  onPress={() => navigation.navigate('Borrows')}
                  activeOpacity={0.8}
                >
                  <View style={styles.borrowStatHeader}>
                    <Ionicons name="arrow-up-circle" size={14} color={colors.lent} />
                    <Text style={[styles.borrowStatBadgeText, { color: colors.lent }]}>TO RECEIVE</Text>
                  </View>
                  <Text style={[styles.borrowStatAmount, TYPOGRAPHY.tabularText, { color: colors.lent }]}>
                    +₹{totalLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.borrowStatSub}>
                    {pendingLentCount} {pendingLentCount === 1 ? 'person owes you' : 'people owe you'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.borrowStatBox, { borderColor: `${colors.borrowed}33`, backgroundColor: `${colors.borrowed}0D` }]}
                  onPress={() => navigation.navigate('Borrows')}
                  activeOpacity={0.8}
                >
                  <View style={styles.borrowStatHeader}>
                    <Ionicons name="arrow-down-circle" size={14} color={colors.borrowed} />
                    <Text style={[styles.borrowStatBadgeText, { color: colors.borrowed }]}>TO PAY</Text>
                  </View>
                  <Text style={[styles.borrowStatAmount, TYPOGRAPHY.tabularText, { color: colors.borrowed }]}>
                    −₹{totalBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.borrowStatSub}>
                    {pendingBorrowedCount} {pendingBorrowedCount === 1 ? 'person to repay' : 'people to repay'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Show top 2 active pending items for instant context */}
              <View style={styles.borrowMiniList}>
                {effectiveBorrows.slice(0, 2).map((b) => {
                  const { type, displayName } = parseBorrowDetails(b, transactions);
                  const isLent = type !== 'borrowed';
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={styles.borrowMiniItem}
                      onPress={() => navigation.navigate('Borrows')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.borrowMiniLeft}>
                        <View
                          style={[
                            styles.borrowMiniBadge,
                            { backgroundColor: isLent ? colors.lentMuted : colors.borrowedMuted },
                          ]}
                        >
                          <Ionicons
                            name={isLent ? 'arrow-up' : 'arrow-down'}
                            size={12}
                            color={isLent ? colors.lent : colors.borrowed}
                          />
                        </View>
                        <Text style={styles.borrowMiniName} numberOfLines={1}>
                          {displayName || b.person_name}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.borrowMiniAmount,
                          TYPOGRAPHY.tabularText,
                          { color: isLent ? colors.lent : colors.borrowed },
                        ]}
                      >
                        {isLent ? '+' : '−'}₹{Number(b.amount || 0).toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* 6. Spending by Category Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>Spending by Category</Text>
            <EditButton
              size={26}
              iconSize={13}
              onPress={() => setCategoriesManageVisible(true)}
            />
          </View>

          <CategoryDonutChart
            data={categoryChartData}
            totalAmount={totalCategoryExpenses}
          />

          <View style={styles.categoriesList}>
            {categories.map((cat) => {
              const spent = categorySpendingMap[cat] || 0;
              const catBudget = budgetSummaries.find((b) => b.category === cat);
              const hasBudget = !!catBudget && Number(catBudget.monthly_limit) > 0;
              const limit = hasBudget ? Number(catBudget.monthly_limit) : 0;
              const ratio = hasBudget
                ? Math.min(spent / limit, 1)
                : maxCategorySpend > 0
                ? spent / maxCategorySpend
                : 0;
              const isOver = hasBudget && spent > limit;
              const barColor = isOver
                ? colors.alert
                : hasBudget && ratio > 0.8
                ? colors.warning
                : spent > 0
                ? accent.hex
                : colors.border;

              const catIcon = getCategoryIconProps(cat);

              return (
                <View key={cat} style={styles.categorySpendRow}>
                  <View style={styles.categorySpendHeader}>
                    <View style={styles.categorySpendLeft}>
                      <View style={[styles.categoryMiniIconBadge, { backgroundColor: catIcon.color + '15' }]}>
                        <Ionicons name={catIcon.name} size={14} color={catIcon.color} />
                      </View>
                      <Text style={styles.categorySpendName}>{cat}</Text>
                    </View>
                    <Text style={[styles.categorySpendAmount, TYPOGRAPHY.tabularText]}>
                      ₹{spent.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                      {hasBudget ? (
                        <Text style={{ fontSize: 11, color: isOver ? colors.alert : colors.textMuted }}>
                          {' '}/ ₹{limit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={ratio}
                    color={barColor}
                    style={styles.categoryProgressBar}
                  />
                </View>
              );
            })}
          </View>
        </View>
        </ScrollView>
      </View>

      {/* 7. Floating Circular "+" Button */}
      <TouchableOpacity
        onPress={() => {
          if (isFutureMonth) {
            Alert.alert(
              'Upcoming Month',
              `${formattedMonthLabel} has not begun yet. Transactions cannot be logged in future months.`
            );
            return;
          }
          if (isPastMonth && isLocked) {
            setUnlockModalVisible(true);
          } else {
            navigation.navigate('AddTransaction', isPastMonth ? { initialMonth: selectedMonth } : undefined);
          }
        }}
        style={[
          styles.floatingAddBtn,
          {
            backgroundColor:
              isFutureMonth
                ? colors.surfaceLight
                : isPastMonth && isLocked
                ? colors.surfaceLight
                : accent.hex,
          },
          (isFutureMonth || (isPastMonth && isLocked)) && {
            borderColor: colors.border,
            borderWidth: 1,
          },
        ]}
        activeOpacity={0.7}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Ionicons
          name={isFutureMonth ? 'time-outline' : isPastMonth && isLocked ? 'lock-closed' : 'add'}
          size={isFutureMonth || (isPastMonth && isLocked) ? 20 : 30}
          color={isFutureMonth || (isPastMonth && isLocked) ? colors.textMuted : colors.onPrimary}
        />
      </TouchableOpacity>



      {/* PAY CREDIT CARD BILL MODAL */}
      <Modal
        visible={payBillModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          setPayBillModalVisible(false);
          setPayingCard(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'android' ? undefined : 'padding'}
          style={styles.modalBackdrop}
        >
          <View style={styles.payBillModalCard}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Pay Card Bill</Text>
                <Text style={styles.modalSubTitle}>
                  {payingCard?.name || 'Credit Card'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPayBillModalVisible(false);
                  setPayingCard(null);
                }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {payingCard && (
              <ScrollView style={styles.modalEditForm}>
                <View style={styles.billDueSummaryBox}>
                  <Text style={styles.billDueLabel}>TOTAL OUTSTANDING DUE</Text>
                  <Text style={[styles.billDueAmount, TYPOGRAPHY.tabularText]}>
                    ₹{Math.abs(Math.min(0, Number(payingCard.current_balance || 0))).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.billDueHelp}>
                    Paying this bill will reduce your credit card debt and deduct funds from your chosen bank/cash account.
                  </Text>
                </View>

                <Text style={styles.inputLabel}>AMOUNT TO PAY (₹)</Text>
                <TextInput
                  value={payAmount}
                  onChangeText={setPayAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={styles.modalInput}
                />

                <View style={styles.quickPayChipsRow}>
                  <TouchableOpacity
                    style={[styles.quickPayChip, { borderColor: accent.hex }]}
                    onPress={() => {
                      const spent = Math.abs(Math.min(0, Number(payingCard.current_balance || 0)));
                      setPayAmount(String(spent));
                    }}
                  >
                    <Text style={[styles.quickPayChipText, { color: accent.hex }]}>
                      Full Due (₹{Math.abs(Math.min(0, Number(payingCard.current_balance || 0))).toLocaleString('en-IN')})
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.inputLabel, { marginTop: SPACING.md }]}>PAY FROM (BANK / CASH)</Text>
                <View style={styles.paySourceList}>
                  {liquidAccounts.map((acc) => {
                    const isSelected = paySourceAccountId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        onPress={() => setPaySourceAccountId(acc.id)}
                        style={[
                          styles.paySourceItem,
                          isSelected && {
                            borderColor: accent.hex,
                            backgroundColor: colors.surfaceLight,
                          },
                        ]}
                      >
                        <View style={styles.paySourceItemLeft}>
                          <BankLogo
                            account={acc}
                            size={22}
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={[
                              styles.paySourceName,
                              isSelected && { color: colors.textPrimary, fontWeight: '700' },
                            ]}
                          >
                            {acc.name}
                          </Text>
                        </View>
                        <Text style={[styles.paySourceBalance, TYPOGRAPHY.tabularText]}>
                          ₹{Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      setPayBillModalVisible(false);
                      setPayingCard(null);
                    }}
                    style={styles.cancelBtn}
                    disabled={isPayingBill}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleConfirmPayBill}
                    disabled={isPayingBill}
                    style={[styles.saveSourceBtn, { backgroundColor: accent.hex }]}
                  >
                    <Text style={styles.saveSourceBtnText}>
                      {isPayingBill ? 'Processing...' : 'Confirm Payment'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FULL-SCREEN MANAGE & ADD/EDIT MONEY SOURCES MODAL */}
      <Modal
        visible={sourcesManageVisible}
        animationType="slide"
        statusBarTranslucent
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (editingAccount || isAddingNewSource) {
            setEditingAccount(null);
            setIsAddingNewSource(false);
          } else {
            setSourcesManageVisible(false);
          }
        }}
      >
        <View style={[styles.fullScreenModal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* Modal Header */}
          <View style={styles.managerHeader}>
            <TouchableOpacity
              onPress={() => {
                if (editingAccount || isAddingNewSource) {
                  setEditingAccount(null);
                  setIsAddingNewSource(false);
                } else {
                  setSourcesManageVisible(false);
                }
              }}
              style={styles.managerCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={editingAccount || isAddingNewSource ? 'arrow-back' : 'close'}
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>

            <View style={styles.managerHeaderCenter}>
              <Text style={styles.managerTitle}>
                {isAddingNewSource
                  ? 'Add Money Source'
                  : editingAccount
                  ? 'Edit Money Source'
                  : 'Manage Money Sources'}
              </Text>
              <Text style={styles.managerSubtitle}>
                {editingAccount || isAddingNewSource
                  ? 'Configure details and starting balance'
                  : `${accounts.length} accounts • Tap ☰ to reorder`}
              </Text>
            </View>

            <View style={{ width: 36 }} />
          </View>

          {editingAccount || isAddingNewSource ? (
            /* ADD / EDIT VIEW */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <KeyboardAwareScrollView
                ref={sourceModalScrollRef}
                style={styles.fullScreenModalScroll}
                contentContainerStyle={{ paddingBottom: 140 }}
                extraScrollHeight={80}
                showsVerticalScrollIndicator={false}
              >
                {/* 1. Account Type Selection (3 Fluid Types) */}
                <Text style={styles.inputSectionLabel}>SELECT SOURCE TYPE</Text>
                <View style={styles.typeSelectorGrid}>
                  <TouchableOpacity
                    onPress={() => setEditType('bank')}
                    style={[
                      styles.typeSelectorCard,
                      editType === 'bank' && { borderColor: accent.hex, backgroundColor: accent.hex + '15' },
                    ]}
                  >
                    <Ionicons
                      name="business-outline"
                      size={22}
                      color={editType === 'bank' ? accent.hex : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeSelectorCardText,
                        editType === 'bank' && { color: accent.hex, fontWeight: '700' },
                      ]}
                    >
                      Bank Account
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setEditType('cash')}
                    style={[
                      styles.typeSelectorCard,
                      editType === 'cash' && { borderColor: accent.hex, backgroundColor: accent.hex + '15' },
                    ]}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={22}
                      color={editType === 'cash' ? accent.hex : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeSelectorCardText,
                        editType === 'cash' && { color: accent.hex, fontWeight: '700' },
                      ]}
                    >
                      Cash Wallet
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setEditType('credit_card')}
                    style={[
                      styles.typeSelectorCard,
                      editType === 'credit_card' && { borderColor: accent.hex, backgroundColor: accent.hex + '15' },
                    ]}
                  >
                    <Ionicons
                      name="card-outline"
                      size={22}
                      color={editType === 'credit_card' ? accent.hex : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeSelectorCardText,
                        editType === 'credit_card' && { color: accent.hex, fontWeight: '700' },
                      ]}
                    >
                      Credit Card
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. Bank Preset Grid (if Bank) */}
                {editType === 'bank' && (
                  <View style={styles.presetSectionBlock}>
                    <Text style={styles.inputSectionLabel}>SELECT BANK PRESET</Text>
                    <View style={styles.presetGrid}>
                      {BANK_PRESETS.map((preset) => {
                        const isSelected = editBankPreset === preset.code;
                        return (
                          <TouchableOpacity
                            key={preset.code}
                            onPress={() => setEditBankPreset(preset.code)}
                            style={[
                              styles.presetGridItem,
                              isSelected && { borderColor: accent.hex, backgroundColor: accent.hex + '12' },
                            ]}
                          >
                            <BankLogo
                              presetId={preset.code}
                              name={preset.label}
                              brandColor={preset.color}
                              size={36}
                            />
                            <View style={styles.presetInfoCol}>
                              <Text
                                style={[
                                  styles.presetItemTitle,
                                  isSelected && { color: colors.textPrimary, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {preset.label}
                              </Text>
                              <Text style={styles.presetItemSub} numberOfLines={1}>
                                {preset.short}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={16} color={accent.hex} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {editBankPreset === 'Custom' && (
                      <View style={styles.customPickerSection}>
                        <Text style={styles.inputSubLabel}>CHOOSE CUSTOM COLOR</Text>
                        <View style={styles.colorPaletteRow}>
                          {CUSTOM_COLORS.map((col) => (
                            <TouchableOpacity
                              key={col}
                              onPress={() => setEditCustomColor(col)}
                              style={[
                                styles.colorCircle,
                                { backgroundColor: col },
                                editCustomColor === col && styles.colorCircleActive,
                              ]}
                            />
                          ))}
                        </View>

                        <Text style={[styles.inputSubLabel, { marginTop: SPACING.sm }]}>CHOOSE CUSTOM ICON</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScrollRow}>
                          {CUSTOM_ICONS.map((ic) => (
                            <TouchableOpacity
                              key={ic}
                              onPress={() => setEditCustomIcon(ic)}
                              style={[
                                styles.iconPickBtn,
                                editCustomIcon === ic && { borderColor: accent.hex, backgroundColor: accent.hex + '20' },
                              ]}
                            >
                              <Ionicons
                                name={ic}
                                size={20}
                                color={editCustomIcon === ic ? accent.hex : colors.textSecondary}
                              />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* 3. Credit Card Issuer Grid (if Credit Card) */}
                {editType === 'credit_card' && (
                  <View style={styles.presetSectionBlock}>
                    <Text style={styles.inputSectionLabel}>SELECT CARD ISSUER</Text>
                    <View style={styles.presetGrid}>
                      {CARD_ISSUERS.map((issuer) => {
                        const isSelected = editCardIssuer === issuer.code;
                        return (
                          <TouchableOpacity
                            key={issuer.code}
                            onPress={() => setEditCardIssuer(issuer.code)}
                            style={[
                              styles.presetGridItem,
                              isSelected && { borderColor: accent.hex, backgroundColor: accent.hex + '12' },
                            ]}
                          >
                            <BankLogo
                              presetId={issuer.code}
                              name={issuer.label}
                              brandColor={issuer.color}
                              size={36}
                            />
                            <View style={styles.presetInfoCol}>
                              <Text
                                style={[
                                  styles.presetItemTitle,
                                  isSelected && { color: colors.textPrimary, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {issuer.label}
                              </Text>
                              <Text style={styles.presetItemSub} numberOfLines={1}>
                                {issuer.short}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={16} color={accent.hex} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {editCardIssuer === 'Custom' && (
                      <View style={styles.customPickerSection}>
                        <Text style={styles.inputSubLabel}>CHOOSE CUSTOM COLOR</Text>
                        <View style={styles.colorPaletteRow}>
                          {CUSTOM_COLORS.map((col) => (
                            <TouchableOpacity
                              key={col}
                              onPress={() => setEditCustomColor(col)}
                              style={[
                                styles.colorCircle,
                                { backgroundColor: col },
                                editCustomColor === col && styles.colorCircleActive,
                              ]}
                            />
                          ))}
                        </View>

                        <Text style={[styles.inputSubLabel, { marginTop: SPACING.sm }]}>CHOOSE CUSTOM ICON</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScrollRow}>
                          {CUSTOM_ICONS.map((ic) => (
                            <TouchableOpacity
                              key={ic}
                              onPress={() => setEditCustomIcon(ic)}
                              style={[
                                styles.iconPickBtn,
                                editCustomIcon === ic && { borderColor: accent.hex, backgroundColor: accent.hex + '20' },
                              ]}
                            >
                              <Ionicons
                                name={ic}
                                size={20}
                                color={editCustomIcon === ic ? accent.hex : colors.textSecondary}
                              />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* 4. Common Inputs */}
                <Text style={styles.inputSectionLabel}>
                  {editType === 'bank'
                    ? 'ACCOUNT NAME / NICKNAME'
                    : editType === 'credit_card'
                    ? 'CARD NAME / NICKNAME'
                    : 'WALLET NAME'}
                </Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder={
                    editType === 'bank'
                      ? 'e.g. Salary A/c or •••• 4821'
                      : editType === 'credit_card'
                      ? 'e.g. Millennia or •••• 1234'
                      : 'e.g. Physical Cash, Pocket Wallet'
                  }
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  theme={{ colors: { background: colors.surfaceLight } }}
                  style={styles.modalInput}
                />

                {editType === 'credit_card' && (
                  <>
                    <Text style={styles.inputSectionLabel}>TOTAL CREDIT LIMIT (₹)</Text>
                    <TextInput
                      value={editCreditLimit}
                      onChangeText={setEditCreditLimit}
                      placeholder="e.g. 50000"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={accent.hex}
                      textColor={colors.textPrimary}
                      theme={{ colors: { background: colors.surfaceLight } }}
                      style={styles.modalInput}
                    />
                  </>
                )}

                {editType === 'credit_card' ? (
                  <>
                    <Text style={styles.inputSectionLabel}>
                      {isAddingNewSource ? 'STARTING OUTSTANDING DUE (₹)' : 'CURRENT OUTSTANDING DUE (₹)'}
                    </Text>
                    <TextInput
                      value={editBalance}
                      onChangeText={setEditBalance}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={accent.hex}
                      textColor={colors.textPrimary}
                      theme={{ colors: { background: colors.surfaceLight } }}
                      style={styles.modalInput}
                    />

                    <View style={styles.creditCalcBox}>
                      <Text style={styles.creditCalcSub}>
                        Limit: ₹{(parseFloat(editCreditLimit) || 0).toLocaleString('en-IN')}  •  Due: ₹{(parseFloat(editBalance) || 0).toLocaleString('en-IN')}
                      </Text>
                      <Text style={[styles.creditCalcMain, { color: accent.hex }]}>
                        Available Credit: ₹{Math.max(0, (parseFloat(editCreditLimit) || 0) - (parseFloat(editBalance) || 0)).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.inputSectionLabel}>
                      {isAddingNewSource ? 'STARTING BALANCE (₹)' : 'CURRENT BALANCE (₹)'}
                    </Text>
                    <TextInput
                      value={editBalance}
                      onChangeText={setEditBalance}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={accent.hex}
                      textColor={colors.textPrimary}
                      theme={{ colors: { background: colors.surfaceLight } }}
                      style={styles.modalInput}
                    />
                  </>
                )}
              </KeyboardAwareScrollView>

              {/* Fixed Bottom Action Bar (Add/Edit) */}
              <View style={styles.fullScreenModalBottomBar}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingAccount(null);
                    setIsAddingNewSource(false);
                  }}
                  style={styles.modalCancelPillBtn}
                >
                  <Text style={styles.modalCancelPillBtnText}>Back</Text>
                </TouchableOpacity>

                <TactileButton
                  onPress={handleSaveSource}
                  style={[styles.modalSavePillBtn, { backgroundColor: accent.hex }]}
                >
                  <Text style={styles.modalSavePillBtnText}>Save Money Source</Text>
                </TactileButton>
              </View>
            </KeyboardAvoidingView>
          ) : (
            /* MANAGE & REORDER VIEW */
            <View style={{ flex: 1 }}>
              <ScrollView
                style={styles.managerScroll}
                contentContainerStyle={styles.managerScrollContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={!isSourcesDragging}
              >
                {accounts.length === 0 ? (
                  <View style={styles.emptySourcesContainer}>
                    <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
                    <Text style={styles.emptySourcesText}>No money sources found.</Text>
                  </View>
                ) : (
                  <YouTubeStyleDraggableList
                    data={accounts}
                    keyExtractor={(acc) => acc.id}
                    onReorder={reorderAccounts}
                    colors={colors}
                    accentColor={accent.hex}
                    itemHeight={64}
                    gap={8}
                    onDragBegin={() => setIsSourcesDragging(true)}
                    onDragEnd={() => setIsSourcesDragging(false)}
                    renderContent={(acc) => {
                      const { title } = getAccountDisplay(acc);

                      return (
                        <TouchableOpacity
                          style={styles.draggableContentRow}
                          onPress={() => handleOpenEditSource(acc)}
                          activeOpacity={0.7}
                        >
                          <BankLogo account={acc} name={title} size={36} />

                          <View style={styles.managerItemTextCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.managerItemName} numberOfLines={1}>
                                {title}
                              </Text>
                            </View>
                            <View style={styles.managerItemMetaRow}>
                              <Text style={styles.managerItemType}>
                                {acc.type === 'credit_card'
                                  ? 'Credit Card'
                                  : acc.type === 'cash'
                                  ? 'Cash'
                                  : 'Bank'}
                              </Text>
                              <Text style={styles.managerItemBullet}>•</Text>
                              <Text
                                style={[
                                  styles.managerItemBalance,
                                  TYPOGRAPHY.tabularText,
                                  {
                                    color:
                                      acc.type === 'credit_card'
                                        ? colors.warning
                                        : Number(acc.current_balance) >= 0
                                        ? colors.textPrimary
                                        : colors.alert,
                                  },
                                ]}
                              >
                                {acc.type === 'credit_card'
                                  ? `₹${Math.abs(Math.min(0, Number(acc.current_balance || 0))).toLocaleString('en-IN')} Due`
                                  : `₹${Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    renderActions={(acc) => (
                      <View style={styles.managerItemActions}>
                        <EditButton
                          size={28}
                          iconSize={14}
                          onPress={() => handleOpenEditSource(acc)}
                        />

                        <TouchableOpacity
                          onPress={() => handleOpenDeleteAccount(acc)}
                          style={styles.managerCircleBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                          <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                )}
              </ScrollView>

              {/* Fixed Bottom Action Bar */}
              <View style={[styles.managerBottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TactileButton
                  onPress={() => handleOpenEditSource()}
                  style={[styles.managerPrimaryAddBtn, { backgroundColor: accent.hex }]}
                >
                  <Ionicons name="add" size={20} color={colors.onPrimary} />
                  <Text style={styles.managerPrimaryAddBtnText}>Add New Money Source</Text>
                </TactileButton>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* DELETE ACCOUNT CONFIRMATION MODAL (WITH CALIBRATION SAFETY) */}
      <Modal
        visible={!!deleteTargetAccount}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isDeletingSource && setDeleteTargetAccount(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteConfirmModalCard}>
            <View style={styles.deleteModalIconBadge}>
              <Ionicons name="trash-outline" size={28} color={colors.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Money Source?</Text>

            <Text style={styles.deleteModalExplanation}>
              Are you sure you want to delete <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{deleteTargetAccount?.name}</Text>? Past transaction history linked to this source will be preserved.
            </Text>

            <View style={styles.deleteModalActionList}>
              <TactileButton
                onPress={handleConfirmDeleteAccount}
                disabled={isDeletingSource}
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.alert, paddingVertical: 12 }]}
              >
                <Text style={styles.modalPrimaryBtnText}>
                  {isDeletingSource ? 'Deleting...' : 'Delete Money Source'}
                </Text>
              </TactileButton>

              <TouchableOpacity
                onPress={() => setDeleteTargetAccount(null)}
                disabled={isDeletingSource}
                style={styles.modalSecondaryBtn}
              >
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* FULL-SCREEN MANAGE CATEGORIES MODAL (MATCHING MONEY SOURCES LAYOUT) */}
      <Modal
        visible={categoriesManageVisible}
        animationType="slide"
        statusBarTranslucent
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (showAddCategoryInput) {
            handleCancelCategoryInput();
          } else {
            setCategoriesManageVisible(false);
          }
        }}
      >
        <View style={[styles.fullScreenModal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* Header */}
          <View style={styles.managerHeader}>
            <TouchableOpacity
              onPress={() => {
                if (showAddCategoryInput) {
                  handleCancelCategoryInput();
                } else {
                  setCategoriesManageVisible(false);
                }
              }}
              style={styles.managerCloseBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={showAddCategoryInput ? 'arrow-back' : 'close'}
                size={20}
                color={colors.textPrimary}
              />
            </TouchableOpacity>

            <View style={styles.managerHeaderCenter}>
              <Text style={styles.managerTitle}>Manage Categories</Text>
              <Text style={styles.managerSubtitle}>
                {categories.length} categories • Hold = to drag & rearrange
              </Text>
            </View>

            <View style={{ width: 36 }} />
          </View>

          <View style={{ flex: 1 }}>
            <KeyboardAwareScrollView
              ref={categoryModalScrollRef}
              style={styles.managerScroll}
              contentContainerStyle={styles.managerScrollContent}
              extraScrollHeight={80}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!isCategoriesDragging}
            >
              {/* Inline Add / Edit Category Input Form */}
              {showAddCategoryInput && (
                <View style={styles.categoryInputCard}>
                  <Text style={styles.categoryInputCardTitle}>
                    {editingCategory ? `EDIT CATEGORY: ${editingCategory.toUpperCase()}` : 'NEW CATEGORY'}
                  </Text>
                  <View style={styles.categoryInputRow}>
                    <TextInput
                      value={categoryInputValue}
                      onChangeText={setCategoryInputValue}
                      placeholder="e.g. Books, Subscriptions"
                      placeholderTextColor={colors.textMuted}
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={accent.hex}
                      textColor={colors.textPrimary}
                      theme={{ colors: { background: colors.surfaceLight } }}
                      style={styles.categoryInputField}
                      autoFocus
                    />
                  </View>
                  <View style={styles.categoryInputButtonsRow}>
                    <TouchableOpacity
                      onPress={handleCancelCategoryInput}
                      style={styles.categoryInputCancelBtn}
                    >
                      <Text style={styles.categoryInputCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveCategory}
                      style={[styles.categoryInputSaveBtn, { backgroundColor: accent.hex }]}
                    >
                      <Text style={styles.categoryInputSaveText}>
                        {editingCategory ? 'Save Changes' : 'Add Category'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {categories.length === 0 ? (
                <View style={styles.emptySourcesContainer}>
                  <Ionicons name="pricetags-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptySourcesText}>No categories found.</Text>
                </View>
              ) : (
                <YouTubeStyleDraggableList
                  data={categories}
                  keyExtractor={(cat) => cat}
                  onReorder={reorderCategories}
                  colors={colors}
                  accentColor={accent.hex}
                  itemHeight={64}
                  gap={8}
                  onDragBegin={() => setIsCategoriesDragging(true)}
                  onDragEnd={() => setIsCategoriesDragging(false)}
                  renderContent={(cat) => {
                    const spent = categorySpendingMap[cat] || 0;
                    const catIcon = getCategoryIconProps(cat);

                    return (
                      <TouchableOpacity
                        style={styles.draggableContentRow}
                        onPress={() => handleStartEditCategory(cat)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.managerItemIconBadge, { backgroundColor: catIcon.color + '18' }]}>
                          <Ionicons name={catIcon.name} size={18} color={catIcon.color} />
                        </View>

                        <View style={styles.managerItemTextCol}>
                          <Text style={styles.managerItemName} numberOfLines={1}>
                            {cat}
                          </Text>
                          <View style={styles.managerItemMetaRow}>
                            <Text style={styles.managerItemType}>Spent this month</Text>
                            <Text style={styles.managerItemBullet}>•</Text>
                            <Text
                              style={[
                                styles.managerItemBalance,
                                TYPOGRAPHY.tabularText,
                                { color: spent > 0 ? accent.hex : colors.textMuted },
                              ]}
                            >
                              ₹{spent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  renderActions={(cat) => (
                    <View style={styles.managerItemActions}>
                      <EditButton
                        size={28}
                        iconSize={14}
                        onPress={() => handleStartEditCategory(cat)}
                      />

                      <TouchableOpacity
                        onPress={() => setCategoryDeleteTarget(cat)}
                        style={[styles.managerCircleBtn, styles.managerDeleteCircleBtn]}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.alert} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </KeyboardAwareScrollView>

            {/* Fixed Bottom Action Bar */}
            {!showAddCategoryInput && (
              <View style={[styles.managerBottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TactileButton
                  onPress={() => {
                    setEditingCategory(null);
                    setCategoryInputValue('');
                    setShowAddCategoryInput(true);
                  }}
                  style={[styles.managerPrimaryAddBtn, { backgroundColor: accent.hex }]}
                >
                  <Ionicons name="add" size={20} color={colors.onPrimary} />
                  <Text style={styles.managerPrimaryAddBtnText}>Add New Category</Text>
                </TactileButton>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* DELETE CATEGORY CONFIRMATION MODAL */}
      <Modal
        visible={!!categoryDeleteTarget}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCategoryDeleteTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteConfirmModalCard}>
            <View style={styles.deleteModalIconBadge}>
              <Ionicons name="trash-outline" size={28} color={colors.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Category?</Text>

            <Text style={styles.deleteModalExplanation}>
              Are you sure you want to remove <Text style={{ fontWeight: '700', color: colors.textPrimary }}>"{categoryDeleteTarget}"</Text>? Existing transactions assigned to this category will not be lost.
            </Text>

            <View style={styles.deleteModalActionList}>
              <TactileButton
                onPress={handleConfirmDeleteCategory}
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.alert, paddingVertical: 12 }]}
              >
                <Text style={styles.modalPrimaryBtnText}>Delete Category</Text>
              </TactileButton>

              <TouchableOpacity
                onPress={() => setCategoryDeleteTarget(null)}
                style={styles.modalSecondaryBtn}
              >
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETE MONTHLY BUDGET CONFIRMATION MODAL */}
      <Modal
        visible={deleteBudgetModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isDeletingBudget && setDeleteBudgetModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteConfirmModalCard}>
            <View style={styles.deleteModalIconBadge}>
              <Ionicons name="trash-outline" size={28} color={colors.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Monthly Budget?</Text>

            <Text style={styles.deleteModalExplanation}>
              Are you sure you want to clear your overall monthly budget for {selectedMonth}? The spending limit will be removed from your dashboard.
            </Text>

            <View style={styles.deleteModalActionList}>
              <TactileButton
                onPress={handleConfirmDeleteBudget}
                disabled={isDeletingBudget}
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.alert, paddingVertical: 12 }]}
              >
                <Text style={styles.modalPrimaryBtnText}>
                  {isDeletingBudget ? 'Deleting...' : 'Delete Budget'}
                </Text>
              </TactileButton>

              <TouchableOpacity
                onPress={() => setDeleteBudgetModalVisible(false)}
                disabled={isDeletingBudget}
                style={styles.modalSecondaryBtn}
              >
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MONTH UNLOCK VERIFICATION MODAL */}
      <MonthUnlockModal
        visible={unlockModalVisible}
        month={selectedMonth}
        onClose={() => setUnlockModalVisible(false)}
      />
    </View>
  );
};

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: colors.background,
  },
  appGreeting: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  avatarPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
  },
  settingsIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthSelectorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  returnCurrentMonthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  returnCurrentMonthText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  monthSelectorCapsule: {
    width: 280,
    maxWidth: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 26,
    alignSelf: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  arrowBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  monthLabelText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  capsuleCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  capsuleLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  capsuleLockBadgeLocked: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
  },
  capsuleLockBadgeUnlocked: {
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
  },
  capsuleLockTimerText: {
    fontSize: 10,
    fontWeight: '700',
  },
  budgetLockedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetLockedTagText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historicalSnapshotPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historicalSnapshotText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollWrapper: {
    flex: 1,
    position: 'relative',
  },
  topFadeGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
    zIndex: 10,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  netWorthCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  netWorthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  netWorthEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  netWorthHeroNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  netWorthDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  netWorthDeltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickAddPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  quickAddPillText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  netWorthDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: SPACING.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  breakdownItem: {
    flex: 1,
    minWidth: 80,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  breakdownLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakdownValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeaderLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cardHeaderAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  borrowEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  borrowEmptyText: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  borrowOverviewContent: {
    gap: SPACING.sm,
  },
  borrowStatsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  borrowStatBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.sm,
  },
  borrowStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  borrowStatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  borrowStatAmount: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  borrowStatSub: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  borrowMiniList: {
    gap: 6,
    marginTop: 4,
  },
  borrowMiniItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceVariant,
  },
  borrowMiniLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  borrowMiniBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borrowMiniName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  borrowMiniAmount: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  aiOverviewLoadingBox: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  aiOverviewLoadingText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  aiOverviewContentBox: {
    gap: 10,
  },
  aiOverviewParagraph: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  aiOverviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  aiOverviewMetaText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  byokTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  byokTagText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiOverviewEmptyBox: {
    gap: 12,
  },
  aiOverviewEmptyDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  aiGenerateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiGenerateBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  aiOverviewErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.alertMuted,
    borderWidth: 1,
    borderColor: colors.alert,
  },
  aiOverviewErrorText: {
    color: colors.alert,
    fontSize: 11,
    flex: 1,
  },
  aiOverviewGatedBox: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  aiOverviewGatedIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  aiOverviewGatedTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  aiOverviewGatedSub: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 15,
  },
  aiSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  aiSectionBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  manageIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetContent: {
    marginTop: SPACING.xs,
  },
  budgetStatusLine: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  budgetProgressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    marginVertical: SPACING.xs,
  },
  budgetMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  budgetRemainingLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  budgetPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCardContent: {
    paddingVertical: SPACING.sm,
  },
  emptyCardText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  sourcesList: {
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sourceIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceIconText: {
    fontSize: 16,
  },
  sourceName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  sourceSub: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  sourceAmount: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  sourceRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creditCardSourceRow: {
    gap: 6,
  },
  sourceSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '50',
  },
  sourceSectionTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sourceSectionBadge: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  creditCardSourceContainer: {
    backgroundColor: colors.surfaceLight + '30',
    borderRadius: 8,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border + '40',
  },
  payBillActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  payBillActionPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardExpenseActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
  },
  cardExpenseActionPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  addCreditCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addCreditCardBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  availCreditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  availCreditText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  creditCalcBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  creditCalcSub: {
    color: colors.textMuted,
    fontSize: 11,
  },
  creditCalcMain: {
    fontSize: 13,
    fontWeight: '700',
  },
  payBillModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    maxHeight: '85%',
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSubTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  billDueSummaryBox: {
    backgroundColor: colors.alert + '15',
    borderWidth: 1,
    borderColor: colors.alert + '40',
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 4,
  },
  billDueLabel: {
    color: colors.alert,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  billDueAmount: {
    color: colors.alert,
    fontSize: 22,
    fontWeight: '800',
  },
  billDueHelp: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  quickPayChipsRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: SPACING.xs,
  },
  quickPayChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.surfaceLight,
  },
  quickPayChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  paySourceList: {
    gap: 8,
    marginBottom: SPACING.md,
  },
  paySourceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paySourceItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  paySourceName: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  paySourceBalance: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  creditProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
    marginTop: 4,
  },
  categoriesList: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  categorySpendRow: {
    gap: 2,
  },
  categorySpendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categorySpendName: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  categorySpendAmount: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceLight,
  },
  floatingAddBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    zIndex: 999,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  floatingAddBtnText: {
    color: colors.textInverse,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 34,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  modalBodyText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalSecondaryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSecondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  modalPrimaryBtnText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  manageSourcesModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  manageCategoriesModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalCloseText: {
    color: colors.textSecondary,
    fontSize: 16,
    padding: SPACING.xs,
  },
  modalEditForm: {
    maxHeight: 450,
  },
  inputLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    backgroundColor: colors.surfaceLight,
    marginBottom: SPACING.xs,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeToggleBtnText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  presetScroll: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  presetChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    marginRight: SPACING.xs,
  },
  presetChipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  saveSourceBtn: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  saveSourceBtnText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  sourcesListModal: {
    maxHeight: 350,
  },
  fullScreenModal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fullScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalBackNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeaderTitleBlock: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  fullScreenModalTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fullScreenModalSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  modalHeaderAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalHeaderAddText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fullScreenModalScroll: {
    flex: 1,
    padding: SPACING.lg,
  },
  inputSectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  inputSubLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  typeSelectorGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  typeSelectorCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeSelectorCardText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  presetSectionBlock: {
    marginBottom: SPACING.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetGridItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  presetIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetInfoCol: {
    flex: 1,
  },
  presetItemTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetItemSub: {
    color: colors.textMuted,
    fontSize: 10,
  },
  customPickerSection: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: colors.textPrimary,
  },
  iconScrollRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  iconPickBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  fullScreenModalBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelPillBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
  },
  modalCancelPillBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSavePillBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSavePillBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  managerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  managerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerHeaderCenter: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  managerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  managerSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  managerHeaderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  managerHeaderActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  managerScroll: {
    flex: 1,
  },
  managerScrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 110,
  },
  managerItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    gap: 12,
  },
  managerItemIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draggableContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  managerItemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  managerItemTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  managerItemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  managerItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  managerItemType: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  managerItemBullet: {
    color: colors.textMuted,
    fontSize: 10,
  },
  managerItemBalance: {
    fontSize: 12,
    fontWeight: '600',
  },
  managerItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  managerCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerBtnDisabled: {
    opacity: 0.25,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  managerDeleteCircleBtn: {
    backgroundColor: colors.alert + '14',
    borderColor: colors.alert + '35',
  },
  managerBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  managerPrimaryAddBtn: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  managerPrimaryAddBtnText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  categoryInputCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 10,
  },
  categoryInputCardTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  categoryInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryInputField: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    height: 42,
  },
  categoryInputButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  categoryInputCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryInputCancelText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryInputSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  categoryInputSaveText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  categorySpendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryMiniIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    alignSelf: 'center',
  },
  deleteModalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.alert + '15',
    borderWidth: 1,
    borderColor: colors.alert + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteModalExplanation: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginVertical: SPACING.md,
  },
  deleteModalActionList: {
    width: '100%',
    gap: SPACING.sm,
  },
  forceDeleteSourceBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.alert + '50',
    backgroundColor: colors.alert + '15',
  },
  forceDeleteSourceBtnText: {
    color: colors.alert,
    fontSize: 13,
    fontWeight: '700',
  },
  emptySourcesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptySourcesText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  syncRequiredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncRequiredPillText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  syncSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  syncSheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  syncSheetDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  syncSheetEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  syncItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  syncItemInfoCol: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  syncItemAccountName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  syncItemDiffText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  syncItemDateText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  syncItemActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncItemLogBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  syncItemLogBtnText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  syncItemDismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  syncItemDismissBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  modalAccountSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  calibrationInfoBox: {
    backgroundColor: colors.surfaceLight,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  calibrationInfoLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  calibrationCurrentBalance: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  diffPreviewBox: {
    backgroundColor: colors.surfaceLight,
    padding: SPACING.md,
    borderRadius: 8,
    marginVertical: SPACING.md,
  },
  diffPreviewLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  diffPreviewAmount: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  diffHelpText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  calibrationActionsCol: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  managerSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  managerSyncBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
});
}
