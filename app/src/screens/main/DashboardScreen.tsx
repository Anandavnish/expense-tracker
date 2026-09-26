import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressBar, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, parseBorrowDetails } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { YouTubeStyleDraggableList } from '../../components/YouTubeStyleDraggableList';
import { Account, AccountType, BankPresetCode, CreditCardIssuerCode } from '../../types/database';

interface DashboardScreenProps {
  navigation: any;
}

interface BankPresetItem {
  code: BankPresetCode;
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const BANK_PRESETS: BankPresetItem[] = [
  { code: 'SBI', label: 'SBI', short: 'State Bank', icon: 'business', color: '#1B5E20' },
  { code: 'India Post', label: 'India Post', short: 'Post Office', icon: 'mail', color: '#C62828' },
  { code: 'HDFC', label: 'HDFC', short: 'HDFC Bank', icon: 'shield-checkmark', color: '#0D47A1' },
  { code: 'Canara', label: 'Canara', short: 'Canara Bank', icon: 'triangle', color: '#00838F' },
  { code: 'PNB', label: 'PNB', short: 'Punjab National', icon: 'ribbon', color: '#AD1457' },
  { code: 'BOB', label: 'BOB', short: 'Bank of Baroda', icon: 'sunny', color: '#E65100' },
  { code: 'Custom', label: '+ Custom', short: 'Other Bank', icon: 'add-circle-outline', color: '#6366F1' },
];

interface CardIssuerItem {
  code: CreditCardIssuerCode;
  label: string;
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const CARD_ISSUERS: CardIssuerItem[] = [
  { code: 'HDFC', label: 'HDFC', short: 'HDFC Bank', icon: 'card', color: '#0D47A1' },
  { code: 'SBI Card', label: 'SBI Card', short: 'SBI Cards', icon: 'card', color: '#1B5E20' },
  { code: 'ICICI', label: 'ICICI', short: 'ICICI Bank', icon: 'card', color: '#B71C1C' },
  { code: 'Axis', label: 'Axis', short: 'Axis Bank', icon: 'card', color: '#880E4F' },
  { code: 'Kotak', label: 'Kotak', short: 'Kotak Mahindra', icon: 'card', color: '#C2185B' },
  { code: 'Slice', label: 'Slice', short: 'Slice Card', icon: 'card', color: '#7C3AED' },
  { code: 'OneCard', label: 'OneCard', short: 'OneCard', icon: 'card', color: '#2563EB' },
  { code: 'Custom', label: '+ Custom', short: 'Other Issuer', icon: 'add-circle-outline', color: '#059669' },
];

const CUSTOM_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

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
  const lower = category.toLowerCase();
  if (lower.includes('food') || lower.includes('dining') || lower.includes('eat') || lower.includes('cafe')) {
    return { name: 'restaurant-outline', color: '#F97316' };
  }
  if (lower.includes('travel') || lower.includes('transport') || lower.includes('fuel') || lower.includes('cab') || lower.includes('bus')) {
    return { name: 'car-outline', color: '#06B6D4' };
  }
  if (lower.includes('rent') || lower.includes('hostel') || lower.includes('home') || lower.includes('room')) {
    return { name: 'home-outline', color: '#8B5CF6' };
  }
  if (lower.includes('recharge') || lower.includes('data') || lower.includes('phone') || lower.includes('wifi')) {
    return { name: 'phone-portrait-outline', color: '#3B82F6' };
  }
  if (lower.includes('subscript') || lower.includes('stream') || lower.includes('ott')) {
    return { name: 'play-circle-outline', color: '#EC4899' };
  }
  if (lower.includes('book') || lower.includes('station') || lower.includes('study') || lower.includes('edu')) {
    return { name: 'book-outline', color: '#10B981' };
  }
  if (lower.includes('shop') || lower.includes('cloth') || lower.includes('grocer') || lower.includes('mart')) {
    return { name: 'cart-outline', color: '#F59E0B' };
  }
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('game') || lower.includes('party')) {
    return { name: 'film-outline', color: '#E11D48' };
  }
  if (lower.includes('health') || lower.includes('med') || lower.includes('doctor') || lower.includes('gym')) {
    return { name: 'fitness-outline', color: '#14B8A6' };
  }
  if (lower.includes('personal') || lower.includes('care') || lower.includes('salon')) {
    return { name: 'sparkles-outline', color: '#A855F7' };
  }
  return { name: 'pricetag-outline', color: '#94A3B8' };
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { accent } = useSettingsStore();
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
    deleteAccountWithCalibration,
    reorderAccounts,
    calibrateAccountBalance,
    payCreditCardBill,
    addCategory,
    updateCategory,
    removeCategory,
    reorderCategories,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const [refreshing, setRefreshing] = useState(false);

  // Manage Money Sources State
  const [sourcesManageVisible, setSourcesManageVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AccountType>('bank');
  const [editBankPreset, setEditBankPreset] = useState<BankPresetCode>('SBI');
  const [editCardIssuer, setEditCardIssuer] = useState<CreditCardIssuerCode>('HDFC');
  const [editCustomColor, setEditCustomColor] = useState('#3B82F6');
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

  // Calibration Confirmation Dialog State
  const [calibrationPending, setCalibrationPending] = useState<{
    account: Account;
    newBalance: number;
    difference: number;
  } | null>(null);

  // Manage Categories State
  const [categoriesManageVisible, setCategoriesManageVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryInputValue, setCategoryInputValue] = useState('');
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<string | null>(null);

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

  // Calculations for Net Worth Formula:
  // 1. Liquid Assets: SUM(all bank accounts + cash)
  const liquidAccounts = accounts.filter(
    (a) => a.type === 'bank' || a.type === 'cash'
  );
  const liquidTotal = liquidAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance || 0),
    0
  );

  // 2. Lent & Borrowed (Pending only, separated cleanly using parseBorrowDetails)
  const pendingBorrows = borrows.filter((b) => b.status === 'pending');
  let totalLent = 0;
  let totalBorrowed = 0;

  pendingBorrows.forEach((b) => {
    const { type } = parseBorrowDetails(b, transactions);
    if (type === 'borrowed') {
      totalBorrowed += Number(b.amount || 0);
    } else {
      totalLent += Number(b.amount || 0);
    }
  });

  // 3. Credit Card Accounts calculations
  const creditAccounts = accounts.filter((a) => a.type === 'credit_card');
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
  const fullNetWorth = liquidTotal + totalLent - totalBorrowed - totalCreditDebt;
  const formattedNetWorth = fullNetWorth < 0
    ? `−₹${Math.abs(fullNetWorth).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : `₹${fullNetWorth.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

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
    budgetPct >= 1 ? COLORS.alert : budgetPct > 0.8 ? COLORS.warning : accent.hex;

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

  // Max spend for category progress relative calculation
  const maxCategorySpend = useMemo(() => {
    const vals = Object.values(categorySpendingMap);
    return Math.max(1, ...vals);
  }, [categorySpendingMap]);

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

  const getAccountIconProps = (acc: Account): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    if (acc.type === 'bank') {
      const parsed = parseAccountDetails(acc);
      const presetCode = acc.bank_preset || parsed.preset;
      const preset = BANK_PRESETS.find((p) => p.code === presetCode);
      if (preset && preset.code !== 'Custom') {
        return { name: preset.icon, color: preset.color };
      }
      return {
        name: (acc.custom_icon as any) || 'business-outline',
        color: acc.custom_color || accent.hex,
      };
    }

    if (acc.type === 'credit_card') {
      const parsed = parseAccountDetails(acc);
      const issuerCode = acc.card_issuer || parsed.issuer;
      const issuer = CARD_ISSUERS.find((i) => i.code === issuerCode);
      if (issuer && issuer.code !== 'Custom') {
        return { name: issuer.icon, color: issuer.color };
      }
      return {
        name: (acc.custom_icon as any) || 'card-outline',
        color: acc.custom_color || accent.hex,
      };
    }

    return {
      name: 'cash-outline',
      color: '#10B981',
    };
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
      setEditCustomColor(account.custom_color || '#3B82F6');
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
        setEditBalance(String(outstanding));
      } else {
        setEditBalance(String(account.current_balance || 0));
      }
      setEditCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
      setIsAddingNewSource(false);
    } else {
      setEditingAccount(null);
      setEditName('');
      setEditType('bank');
      setEditBankPreset('SBI');
      setEditCardIssuer('HDFC');
      setEditCustomColor('#3B82F6');
      setEditCustomIcon('business-outline');
      setEditBalance('0');
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

  const handleSwapAccountOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) return;

    const reordered = [...accounts];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    await reorderAccounts(reordered);
  };

  const handleSwapCategoryOrder = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    reorderCategories(reordered);
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

  const handleConfirmDeleteAccount = async (calibrateFirst: boolean) => {
    if (!deleteTargetAccount || !user) return;
    setIsDeletingSource(true);
    const res = await deleteAccountWithCalibration(deleteTargetAccount.id, user.id, calibrateFirst);
    setIsDeletingSource(false);
    if (res.success) {
      setDeleteTargetAccount(null);
      if (editingAccount?.id === deleteTargetAccount.id) {
        setEditingAccount(null);
        setIsAddingNewSource(false);
      }
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
      const oldBalance = Number(editingAccount.current_balance);
      const diff = parsedBalance - oldBalance;

      // Update name, type, limit first
      await updateAccountOptimistic(editingAccount.id, {
        name: finalName,
        type: editType,
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

      // Check if balance changed -> CALIBRATION FLOW
      if (Math.abs(diff) > 0.01) {
        setCalibrationPending({
          account: editingAccount,
          newBalance: parsedBalance,
          difference: diff,
        });
      }

      setEditingAccount(null);
      setIsAddingNewSource(false);
    }
  };

  const handleCalibrationChoice = async (logAsTransaction: boolean) => {
    if (!user || !calibrationPending) return;
    const { account, newBalance } = calibrationPending;

    await calibrateAccountBalance(
      account.id,
      newBalance,
      logAsTransaction,
      user.id
    );

    setCalibrationPending(null);
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {/* 1. Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appGreeting}>Welcome back,</Text>
          <Text style={styles.appName}>
            {user?.email ? user.email.split('@')[0] : 'Expense Tracker'}
          </Text>
        </View>
        <View style={styles.topRightActions}>
          <View style={[styles.avatarPill, { borderColor: accent.hex }]}>
            <Text style={[styles.avatarText, { color: accent.hex }]}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsIconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
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
          <Text style={styles.monthLabelText}>{formattedMonthLabel}</Text>
          <TouchableOpacity
            onPress={handleNextMonth}
            style={styles.arrowBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={18} color={accent.hex} />
          </TouchableOpacity>
        </View>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <View style={styles.scrollWrapper}>
        <LinearGradient
          colors={[COLORS.background, 'transparent']}
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
              <Text style={styles.netWorthEyebrow}>Total Net Worth</Text>
              <Text
                style={[
                  styles.netWorthHeroNumber,
                  TYPOGRAPHY.heroNumber,
                  { color: fullNetWorth < 0 ? COLORS.alert : COLORS.textPrimary },
                ]}
              >
                {formattedNetWorth}
              </Text>
              {totalCreditLimit > 0 && (
                <View style={[styles.availCreditPill, { borderColor: COLORS.border }]}>
                  <Ionicons name="card-outline" size={12} color={accent.hex} />
                  <Text style={styles.availCreditText}>
                    Avail. Credit: ₹{totalAvailCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })} of ₹{totalCreditLimit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              )}
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

            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Lent</Text>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalLent > 0 ? accent.hex : COLORS.textSecondary },
                ]}
              >
                {totalLent > 0 ? `+₹${totalLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
              </Text>
            </View>

            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Borrowed</Text>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalBorrowed > 0 ? COLORS.alert : COLORS.textSecondary },
                ]}
              >
                {totalBorrowed > 0 ? `−₹${totalBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
              </Text>
            </View>

            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Card Dues</Text>
              <Text
                style={[
                  styles.breakdownValue,
                  TYPOGRAPHY.tabularText,
                  { color: totalCreditDebt > 0 ? COLORS.alert : COLORS.textSecondary },
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
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Budgets', {
                  editCategory: 'Overall Budget',
                  currentLimit: budgetLimit > 0 ? String(budgetLimit) : '',
                })
              }
            >
              <Text style={[styles.cardHeaderAction, { color: accent.hex }]}>
                {budgetLimit > 0 ? 'Edit' : '+ Set'}
              </Text>
            </TouchableOpacity>
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
                      { color: budgetRemaining >= 0 ? accent.hex : COLORS.alert },
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

        {/* 5. Money Sources Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>Money Sources</Text>
            <TouchableOpacity
              onPress={() => setSourcesManageVisible(true)}
              style={styles.manageIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={15} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.sourcesList}>
            {/* Section A: Liquid Funds (Cash & Bank) */}
            <View style={styles.sourceSectionHeader}>
              <Text style={styles.sourceSectionTitle}>Bank & Cash</Text>
              <Text style={[styles.sourceSectionBadge, TYPOGRAPHY.tabularText]}>
                ₹{liquidTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>

            {accounts
              .filter((a) => a.type !== 'credit_card')
              .map((acc) => {
                const { title, subtitle } = getAccountDisplay(acc);
                const iconProps = getAccountIconProps(acc);
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
                      <View style={[styles.sourceIconBadge, { backgroundColor: iconProps.color + '15' }]}>
                        <Ionicons
                          name={iconProps.name}
                          size={16}
                          color={iconProps.color}
                        />
                      </View>
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
                                ? COLORS.textPrimary
                                : COLORS.alert,
                          },
                        ]}
                      >
                        ₹
                        {Number(acc.current_balance).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
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
                  { color: totalCreditDebt > 0 ? COLORS.alert : accent.hex },
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
                  + Add Credit Card
                </Text>
              </TouchableOpacity>
            ) : (
              creditAccounts.map((card) => {
                const limit = Number(card.credit_limit || 0);
                const spent = Math.abs(Math.min(0, Number(card.current_balance || 0)));
                const available = Math.max(0, limit - spent);
                const isOverspent = spent > limit;
                const usedRatio = limit > 0 ? Math.min(spent / limit, 1) : 0;
                const barColor = isOverspent ? COLORS.alert : usedRatio > 0.8 ? COLORS.warning : accent.hex;
                const { title } = getAccountDisplay(card);
                const iconProps = getAccountIconProps(card);

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
                          <View style={[styles.sourceIconBadge, { backgroundColor: iconProps.color + '15' }]}>
                            <Ionicons name={iconProps.name} size={16} color={iconProps.color} />
                          </View>
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
                              { color: spent > 0 ? COLORS.alert : accent.hex },
                            ]}
                          >
                            {spent > 0
                              ? `₹${spent.toLocaleString('en-IN')} Due`
                              : '₹0 Due'}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
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
                        <Ionicons name="add" size={13} color={COLORS.textSecondary} />
                        <Text style={styles.cardExpenseActionPillText}>+ Expense</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* 6. Spending by Category Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>Spending by Category</Text>
            <TouchableOpacity
              onPress={() => setCategoriesManageVisible(true)}
              style={styles.manageIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={15} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

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
                ? COLORS.alert
                : hasBudget && ratio > 0.8
                ? COLORS.warning
                : spent > 0
                ? accent.hex
                : COLORS.border;

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
                        <Text style={{ fontSize: 11, color: isOver ? COLORS.alert : COLORS.textMuted }}>
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
        onPress={() => navigation.navigate('AddTransaction')}
        style={[styles.floatingAddBtn, { backgroundColor: accent.hex }]}
        activeOpacity={0.7}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Ionicons name="add" size={30} color={COLORS.textInverse} />
      </TouchableOpacity>

      {/* CALIBRATION CONFIRMATION MODAL */}
      <Modal
        visible={!!calibrationPending}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCalibrationPending(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Calibrate Balance</Text>
            {calibrationPending && (
              <Text style={styles.modalBodyText}>
                Balance changed from ₹
                {Number(calibrationPending.account.current_balance).toLocaleString('en-IN')}{' '}
                to ₹{calibrationPending.newBalance.toLocaleString('en-IN')} — a difference
                of ₹{Math.abs(calibrationPending.difference).toLocaleString('en-IN')}.
                {'\n\n'}Log this as an Adjustment transaction in your history?
              </Text>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                onPress={() => handleCalibrationChoice(false)}
                style={styles.modalSecondaryBtn}
              >
                <Text style={styles.modalSecondaryBtnText}>Just adjust</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleCalibrationChoice(true)}
                style={[styles.modalPrimaryBtn, { backgroundColor: accent.hex }]}
              >
                <Text style={styles.modalPrimaryBtnText}>Yes, log it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
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
                  outlineColor={COLORS.border}
                  activeOutlineColor={accent.hex}
                  textColor={COLORS.textPrimary}
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
                            backgroundColor: COLORS.surfaceLight,
                          },
                        ]}
                      >
                        <View style={styles.paySourceItemLeft}>
                          <Ionicons
                            name={acc.type === 'cash' ? 'cash-outline' : 'business-outline'}
                            size={16}
                            color={isSelected ? accent.hex : COLORS.textSecondary}
                          />
                          <Text
                            style={[
                              styles.paySourceName,
                              isSelected && { color: COLORS.textPrimary, fontWeight: '700' },
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
                color={COLORS.textPrimary}
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
                  : `${accounts.length} accounts • Hold = to drag & rearrange`}
              </Text>
            </View>

            <View style={{ width: 36 }} />
          </View>

          {editingAccount || isAddingNewSource ? (
            /* ADD / EDIT VIEW */
            <KeyboardAvoidingView
              behavior={Platform.OS === 'android' ? undefined : 'padding'}
              style={{ flex: 1 }}
            >
              <ScrollView
                style={styles.fullScreenModalScroll}
                contentContainerStyle={{ paddingBottom: 100 }}
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
                      color={editType === 'bank' ? accent.hex : COLORS.textSecondary}
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
                      color={editType === 'cash' ? accent.hex : COLORS.textSecondary}
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
                      color={editType === 'credit_card' ? accent.hex : COLORS.textSecondary}
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
                            <View style={[styles.presetIconBadge, { backgroundColor: preset.color + '20' }]}>
                              <Ionicons name={preset.icon} size={20} color={preset.color} />
                            </View>
                            <View style={styles.presetInfoCol}>
                              <Text
                                style={[
                                  styles.presetItemTitle,
                                  isSelected && { color: COLORS.textPrimary, fontWeight: '700' },
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
                                color={editCustomIcon === ic ? accent.hex : COLORS.textSecondary}
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
                            <View style={[styles.presetIconBadge, { backgroundColor: issuer.color + '20' }]}>
                              <Ionicons name={issuer.icon} size={20} color={issuer.color} />
                            </View>
                            <View style={styles.presetInfoCol}>
                              <Text
                                style={[
                                  styles.presetItemTitle,
                                  isSelected && { color: COLORS.textPrimary, fontWeight: '700' },
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
                                color={editCustomIcon === ic ? accent.hex : COLORS.textSecondary}
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
                  outlineColor={COLORS.border}
                  activeOutlineColor={accent.hex}
                  textColor={COLORS.textPrimary}
                  theme={{ colors: { background: COLORS.surfaceLight } }}
                  style={styles.modalInput}
                />

                {editType === 'credit_card' ? (
                  <>
                    <Text style={styles.inputSectionLabel}>TOTAL CREDIT LIMIT (₹)</Text>
                    <TextInput
                      value={editCreditLimit}
                      onChangeText={setEditCreditLimit}
                      placeholder="e.g. 50000"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={COLORS.border}
                      activeOutlineColor={accent.hex}
                      textColor={COLORS.textPrimary}
                      theme={{ colors: { background: COLORS.surfaceLight } }}
                      style={styles.modalInput}
                    />

                    <Text style={styles.inputSectionLabel}>CURRENT OUTSTANDING DUE (₹)</Text>
                    <TextInput
                      value={editBalance}
                      onChangeText={setEditBalance}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={COLORS.border}
                      activeOutlineColor={accent.hex}
                      textColor={COLORS.textPrimary}
                      theme={{ colors: { background: COLORS.surfaceLight } }}
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
                    <Text style={styles.inputSectionLabel}>CURRENT BALANCE (₹)</Text>
                    <TextInput
                      value={editBalance}
                      onChangeText={setEditBalance}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={COLORS.border}
                      activeOutlineColor={accent.hex}
                      textColor={COLORS.textPrimary}
                      theme={{ colors: { background: COLORS.surfaceLight } }}
                      style={styles.modalInput}
                    />
                  </>
                )}
              </ScrollView>

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
                    <Ionicons name="wallet-outline" size={48} color={COLORS.textMuted} />
                    <Text style={styles.emptySourcesText}>No money sources found.</Text>
                  </View>
                ) : (
                  <YouTubeStyleDraggableList
                    data={accounts}
                    keyExtractor={(acc) => acc.id}
                    onReorder={reorderAccounts}
                    accentColor={accent.hex}
                    itemHeight={64}
                    gap={8}
                    onDragBegin={() => setIsSourcesDragging(true)}
                    onDragEnd={() => setIsSourcesDragging(false)}
                    renderContent={(acc) => {
                      const { title } = getAccountDisplay(acc);
                      const iconProps = getAccountIconProps(acc);

                      return (
                        <TouchableOpacity
                          style={styles.draggableContentRow}
                          onPress={() => handleOpenEditSource(acc)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.managerItemIconBadge, { backgroundColor: iconProps.color + '18' }]}>
                            <Ionicons name={iconProps.name} size={18} color={iconProps.color} />
                          </View>

                          <View style={styles.managerItemTextCol}>
                            <Text style={styles.managerItemName} numberOfLines={1}>
                              {title}
                            </Text>
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
                                        ? COLORS.alert
                                        : Number(acc.current_balance) >= 0
                                        ? COLORS.textPrimary
                                        : COLORS.alert,
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
                        <TouchableOpacity
                          onPress={() => handleOpenEditSource(acc)}
                          style={styles.managerCircleBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                          <Ionicons name="pencil-outline" size={14} color={COLORS.textSecondary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleOpenDeleteAccount(acc)}
                          style={[styles.managerCircleBtn, styles.managerDeleteCircleBtn]}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                          <Ionicons name="trash-outline" size={14} color={COLORS.alert} />
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
                  <Ionicons name="add" size={20} color={COLORS.textInverse} />
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
              <Ionicons name="trash-outline" size={28} color={COLORS.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Money Source?</Text>

            {deleteTargetAccount && Math.abs(Number(deleteTargetAccount.current_balance || 0)) > 0.01 ? (
              <>
                <Text style={styles.deleteModalExplanation}>
                  <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{deleteTargetAccount.name}</Text> currently has an active balance of{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.alert }}>
                    ₹{Math.abs(Number(deleteTargetAccount.current_balance || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>.
                  {'\n\n'}
                  Deleting without calibrating will leave an untracked gap in your calculated net worth.
                </Text>

                <View style={styles.deleteModalActionList}>
                  <TactileButton
                    onPress={() => handleConfirmDeleteAccount(true)}
                    disabled={isDeletingSource}
                    style={[styles.modalPrimaryBtn, { backgroundColor: accent.hex, paddingVertical: 12 }]}
                  >
                    <Text style={styles.modalPrimaryBtnText}>
                      {isDeletingSource ? 'Calibrating & Deleting...' : 'Calibrate to ₹0 First (Recommended)'}
                    </Text>
                  </TactileButton>

                  <TouchableOpacity
                    onPress={() => handleConfirmDeleteAccount(false)}
                    disabled={isDeletingSource}
                    style={styles.forceDeleteSourceBtn}
                  >
                    <Text style={styles.forceDeleteSourceBtnText}>Delete Anyway (Leave Gap)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setDeleteTargetAccount(null)}
                    disabled={isDeletingSource}
                    style={styles.modalSecondaryBtn}
                  >
                    <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.deleteModalExplanation}>
                  Are you sure you want to delete <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{deleteTargetAccount?.name}</Text>? Past transaction history linked to this source will be preserved.
                </Text>

                <View style={styles.deleteModalActionList}>
                  <TactileButton
                    onPress={() => handleConfirmDeleteAccount(false)}
                    disabled={isDeletingSource}
                    style={[styles.modalPrimaryBtn, { backgroundColor: COLORS.alert, paddingVertical: 12 }]}
                  >
                    <Text style={styles.modalPrimaryBtnText}>
                      {isDeletingSource ? 'Deleting...' : 'Delete Account'}
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
              </>
            )}
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
                color={COLORS.textPrimary}
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
            <ScrollView
              style={styles.managerScroll}
              contentContainerStyle={styles.managerScrollContent}
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
                      placeholderTextColor={COLORS.textMuted}
                      mode="outlined"
                      outlineColor={COLORS.border}
                      activeOutlineColor={accent.hex}
                      textColor={COLORS.textPrimary}
                      theme={{ colors: { background: COLORS.surfaceLight } }}
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
                  <Ionicons name="pricetags-outline" size={48} color={COLORS.textMuted} />
                  <Text style={styles.emptySourcesText}>No categories found.</Text>
                </View>
              ) : (
                <YouTubeStyleDraggableList
                  data={categories}
                  keyExtractor={(cat) => cat}
                  onReorder={reorderCategories}
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
                                { color: spent > 0 ? accent.hex : COLORS.textMuted },
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
                      <TouchableOpacity
                        onPress={() => handleStartEditCategory(cat)}
                        style={styles.managerCircleBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="pencil-outline" size={14} color={COLORS.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setCategoryDeleteTarget(cat)}
                        style={[styles.managerCircleBtn, styles.managerDeleteCircleBtn]}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="trash-outline" size={14} color={COLORS.alert} />
                      </TouchableOpacity>
                    </View>
                  )}
                />
              )}
            </ScrollView>

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
                  <Ionicons name="add" size={20} color={COLORS.textInverse} />
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
              <Ionicons name="trash-outline" size={28} color={COLORS.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Category?</Text>

            <Text style={styles.deleteModalExplanation}>
              Are you sure you want to remove <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>"{categoryDeleteTarget}"</Text>? Existing transactions assigned to this category will not be lost.
            </Text>

            <View style={styles.deleteModalActionList}>
              <TactileButton
                onPress={handleConfirmDeleteCategory}
                style={[styles.modalPrimaryBtn, { backgroundColor: COLORS.alert, paddingVertical: 12 }]}
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
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.background,
  },
  appGreeting: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  appName: {
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surfaceLight,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthSelectorContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  monthSelectorCapsule: {
    width: 280,
    maxWidth: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 26,
    alignSelf: 'center',
    shadowColor: '#000',
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
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  netWorthHeroNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
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
    color: COLORS.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  netWorthDivider: {
    height: 1,
    backgroundColor: COLORS.border,
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
  breakdownLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  breakdownValue: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeaderLabel: {
    color: COLORS.textMuted,
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
  manageIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetContent: {
    marginTop: SPACING.xs,
  },
  budgetStatusLine: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  budgetProgressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.xs,
  },
  budgetMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  budgetRemainingLabel: {
    color: COLORS.textSecondary,
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
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sourceIconText: {
    fontSize: 16,
  },
  sourceName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  sourceSub: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  sourceAmount: {
    color: COLORS.textPrimary,
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
    borderBottomColor: COLORS.border + '50',
  },
  sourceSectionTitle: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sourceSectionBadge: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  creditCardSourceContainer: {
    backgroundColor: COLORS.surfaceLight + '30',
    borderRadius: 8,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border + '40',
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
    backgroundColor: COLORS.surfaceLight,
  },
  cardExpenseActionPillText: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  availCreditText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  creditCalcBox: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  creditCalcSub: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  creditCalcMain: {
    fontSize: 13,
    fontWeight: '700',
  },
  payBillModalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
    maxHeight: '85%',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSubTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  billDueSummaryBox: {
    backgroundColor: COLORS.alert + '15',
    borderWidth: 1,
    borderColor: COLORS.alert + '40',
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 4,
  },
  billDueLabel: {
    color: COLORS.alert,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  billDueAmount: {
    color: COLORS.alert,
    fontSize: 22,
    fontWeight: '800',
  },
  billDueHelp: {
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surfaceLight,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  paySourceItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  paySourceName: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  paySourceBalance: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  creditProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
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
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  categorySpendAmount: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  floatingAddBtnText: {
    color: COLORS.textInverse,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  modalBodyText: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
  },
  modalSecondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  modalPrimaryBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  manageSourcesModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  manageCategoriesModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    color: COLORS.textSecondary,
    fontSize: 16,
    padding: SPACING.xs,
  },
  modalEditForm: {
    maxHeight: 450,
  },
  inputLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    backgroundColor: COLORS.surfaceLight,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeToggleBtnText: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
    marginRight: SPACING.xs,
  },
  presetChipText: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  saveSourceBtn: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  saveSourceBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  sourcesListModal: {
    maxHeight: 350,
  },
  fullScreenModal: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fullScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  modalBackNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeaderTitleBlock: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  fullScreenModalTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fullScreenModalSubtitle: {
    color: COLORS.textMuted,
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
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  inputSubLabel: {
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeSelectorCardText: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
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
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetItemSub: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  customPickerSection: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    borderColor: '#fff',
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalCancelPillBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  modalCancelPillBtnText: {
    color: COLORS.textSecondary,
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
    color: COLORS.textInverse,
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
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  managerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerHeaderCenter: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  managerTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  managerSubtitle: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textPrimary,
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
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  managerItemBullet: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerBtnDisabled: {
    opacity: 0.25,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  managerDeleteCircleBtn: {
    backgroundColor: COLORS.alert + '14',
    borderColor: COLORS.alert + '35',
  },
  managerBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  managerPrimaryAddBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  managerPrimaryAddBtnText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  categoryInputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 10,
  },
  categoryInputCardTitle: {
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surfaceLight,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryInputCancelText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryInputSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  categoryInputSaveText: {
    color: COLORS.textInverse,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.alert + '15',
    borderWidth: 1,
    borderColor: COLORS.alert + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteModalExplanation: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.alert + '50',
    backgroundColor: COLORS.alert + '15',
  },
  forceDeleteSourceBtnText: {
    color: COLORS.alert,
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
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
