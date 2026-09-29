import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, getCurrentMonthString } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { exportTransactionsStatement } from '../../services/statementExport';
import { SPACING, TYPOGRAPHY, ThemeColors } from '../../theme/tokens';
import { Transaction, TransactionType } from '../../types/database';
import { TransactionRow } from '../../components/TransactionRow';
import { TactileButton } from '../../components/TactileButton';
import { MonthUnlockModal } from '../../components/MonthUnlockModal';
import { BankLogo } from '../../components/BankLogo';
import {
  getCategoryIcon,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_BORROW_CATEGORIES,
} from '../../utils/categoryIcons';

type DateFilterOption = 'this_month' | 'last_30_days' | 'all' | 'custom';
type CategoryTab = 'all' | 'expense' | 'income' | 'borrow';
type FilterModalSection = 'all' | 'date' | 'account' | 'type' | 'category';

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  borrow_given: 'Lent',
  borrow_taken: 'Borrowed',
};

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface TransactionsScreenProps {
  navigation?: any;
}

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({ navigation: propNav }) => {
  const insets = useSafeAreaInsets();
  const hookNav = useNavigation<any>();
  const navigation = propNav || hookNav;
  const { user } = useAuthStore();
  const { accent, colors } = useSettingsStore();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const {
    transactions,
    accounts,
    categories,
    selectedMonth,
    isMonthLocked,
  } = useFinanceStore();

  // Month lock & unlock state
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const currentMonthStr = useMemo(() => getCurrentMonthString(), []);
  const isPastMonth = selectedMonth < currentMonthStr;
  const isFutureMonth = selectedMonth > currentMonthStr;
  const isLocked = isPastMonth && isMonthLocked(selectedMonth);

  const formattedMonthLabel = useMemo(() => {
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  const handleOpenAddTransaction = () => {
    if (dateFilter === 'this_month' && isFutureMonth) {
      Alert.alert(
        'Upcoming Month',
        `${formattedMonthLabel} has not begun yet. Transactions cannot be logged in future months.`
      );
      return;
    }
    if (dateFilter === 'this_month' && isPastMonth && isLocked) {
      Alert.alert(
        'Month Locked',
        `${formattedMonthLabel} is locked to protect historical records. Unlock this month to log or edit transactions.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unlock Month', onPress: () => setUnlockModalVisible(true) },
        ]
      );
      return;
    }
    navigation.navigate('AddTransaction', {
      initialMonth: dateFilter === 'this_month' && isPastMonth ? selectedMonth : undefined,
    });
  };

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Search State with 150ms debounce for lag-free typing & filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter States
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [categoryTypeTab, setCategoryTypeTab] = useState<CategoryTab>('all');

  // Modal & Date Picker States
  const [filterModalSection, setFilterModalSection] = useState<FilterModalSection | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);

  // Dynamic distinct categories grouped by transaction type
  const distinctCategoriesByTab = useMemo(() => {
    const expenseSet = new Set<string>(categories);
    const incomeSet = new Set<string>(DEFAULT_INCOME_CATEGORIES);
    const borrowSet = new Set<string>(DEFAULT_BORROW_CATEGORIES);

    transactions.forEach((tx) => {
      if (!tx.category) return;
      if (tx.type === 'expense') {
        expenseSet.add(tx.category);
      } else if (tx.type === 'income') {
        incomeSet.add(tx.category);
      } else if (tx.type === 'borrow_given' || tx.type === 'borrow_taken') {
        borrowSet.add(tx.category);
      }
    });

    const expenseList = Array.from(expenseSet);
    const incomeList = Array.from(incomeSet);
    const borrowList = Array.from(borrowSet);
    const allList = Array.from(new Set([...expenseList, ...incomeList, ...borrowList]));

    return {
      all: allList,
      expense: expenseList,
      income: incomeList,
      borrow: borrowList,
    };
  }, [categories, transactions]);

  // Accounts lookup map for fast source name retrieval
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      map[acc.id] = acc.name;
    });
    return map;
  }, [accounts]);

  // Toggle Type Selection in Modal / Segment with auto-sync to category tab
  const toggleType = (t: TransactionType) => {
    let nextTypes: TransactionType[];
    if (selectedTypes.includes(t)) {
      nextTypes = selectedTypes.filter((x) => x !== t);
    } else {
      nextTypes = [...selectedTypes, t];
    }
    setSelectedTypes(nextTypes);

    // Auto-sync category tab to the picked type
    if (t === 'expense') {
      setCategoryTypeTab('expense');
    } else if (t === 'income') {
      setCategoryTypeTab('income');
    } else if (t === 'borrow_given' || t === 'borrow_taken') {
      setCategoryTypeTab('borrow');
    }
  };

  const handleQuickTypeSelect = (t: TransactionType | 'all') => {
    if (t === 'all') {
      setSelectedTypes([]);
      setCategoryTypeTab('all');
    } else if (selectedTypes.length === 1 && selectedTypes[0] === t) {
      setSelectedTypes([]);
      setCategoryTypeTab('all');
    } else {
      setSelectedTypes([t]);
      if (t === 'expense') setCategoryTypeTab('expense');
      else if (t === 'income') setCategoryTypeTab('income');
      else if (t === 'borrow_given' || t === 'borrow_taken') setCategoryTypeTab('borrow');
    }
  };

  // Toggle Category Selection
  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  // Toggle Account Selection
  const toggleAccount = (accId: string) => {
    if (selectedAccountId === accId) {
      setSelectedAccountId(null);
    } else {
      setSelectedAccountId(accId);
    }
  };

  // Reset All Filters
  const resetFilters = () => {
    setSearchQuery('');
    setDateFilter('this_month');
    setCustomFrom('');
    setCustomTo('');
    setSelectedTypes([]);
    setSelectedCategories([]);
    setSelectedAccountId(null);
    setCategoryTypeTab('all');
  };

  // Active Filters Count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== 'this_month') count++;
    if (selectedTypes.length > 0) count += selectedTypes.length;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (selectedAccountId) count++;
    if (searchQuery.trim().length > 0) count++;
    return count;
  }, [dateFilter, selectedTypes, selectedCategories, selectedAccountId, searchQuery]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const thirtyDaysAgoStr = formatLocalDate(thirtyDaysAgo);

    const query = debouncedQuery.trim().toLowerCase();

    return transactions.filter((tx) => {
      // 1. Search Query (note, person_name, category, amount, source account)
      if (query) {
        const noteMatch = (tx.note || '').toLowerCase().includes(query);
        const personMatch = ((tx as any).person_name || '').toLowerCase().includes(query);
        const catMatch = (tx.category || '').toLowerCase().includes(query);
        const amountMatch = String(tx.amount).includes(query);
        const accountMatch = (accountMap[tx.account_id] || '').toLowerCase().includes(query);
        if (!noteMatch && !personMatch && !catMatch && !amountMatch && !accountMatch) {
          return false;
        }
      }

      // 2. Date filter
      if (dateFilter === 'this_month') {
        if (!tx.date.startsWith(selectedMonth)) return false;
      } else if (dateFilter === 'last_30_days') {
        if (tx.date < thirtyDaysAgoStr) return false;
      } else if (dateFilter === 'custom') {
        if (customFrom && tx.date < customFrom) return false;
        if (customTo && tx.date > customTo) return false;
      }

      // 3. Type filter
      if (selectedTypes.length > 0) {
        if (!selectedTypes.includes(tx.type)) return false;
      }

      // 4. Category filter
      if (selectedCategories.length > 0) {
        if (!selectedCategories.includes(tx.category)) return false;
      }

      // 5. Account filter
      if (selectedAccountId) {
        if (tx.account_id !== selectedAccountId) return false;
      }

      return true;
    });
  }, [
    transactions,
    debouncedQuery,
    dateFilter,
    selectedMonth,
    customFrom,
    customTo,
    selectedTypes,
    selectedCategories,
    selectedAccountId,
    accountMap,
  ]);

  // Real-time Financial Metrics for the filtered view
  const filteredStats = useMemo(() => {
    let totalExpense = 0;
    let totalIncome = 0;
    let totalLent = 0;
    let totalBorrowed = 0;

    filteredTransactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'expense') totalExpense += amt;
      else if (tx.type === 'income') totalIncome += amt;
      else if (tx.type === 'borrow_given') totalLent += amt;
      else if (tx.type === 'borrow_taken') totalBorrowed += amt;
    });

    return { totalExpense, totalIncome, totalLent, totalBorrowed };
  }, [filteredTransactions]);

  const handleCustomDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
    if (event.type === 'set' && selectedDate) {
      const formatted = formatLocalDate(selectedDate);
      if (datePickerTarget === 'from') {
        setCustomFrom(formatted);
      } else if (datePickerTarget === 'to') {
        setCustomTo(formatted);
      }
    }
  };

  // Render Transaction Item using redesigned TransactionRow (memoized)
  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => {
      const sourceAccountName = accountMap[item.account_id];
      return (
        <TransactionRow
          transaction={item}
          accountName={sourceAccountName}
        />
      );
    },
    [accountMap]
  );


  const dateFilterLabel = useMemo(() => {
    if (dateFilter === 'this_month') return formattedMonthLabel;
    if (dateFilter === 'last_30_days') return 'Last 30 Days';
    if (dateFilter === 'all') return 'All Time';
    if (dateFilter === 'custom') {
      if (customFrom && customTo) return `${customFrom} → ${customTo}`;
      if (customFrom) return `From ${customFrom}`;
      if (customTo) return `Up to ${customTo}`;
      return 'Custom Range';
    }
    return 'Date';
  }, [dateFilter, formattedMonthLabel, customFrom, customTo]);

  const typeFilterLabel = useMemo(() => {
    if (selectedTypes.length === 0) return 'All Types';
    if (selectedTypes.length === 1) return TYPE_LABELS[selectedTypes[0]] || 'Type';
    return `${selectedTypes.length} Types`;
  }, [selectedTypes]);

  const modalSectionConfig = useMemo(() => {
    switch (filterModalSection) {
      case 'date':
        return {
          title: 'Date Range',
          subtitle: dateFilterLabel,
          hasActive: dateFilter !== 'this_month' || Boolean(customFrom) || Boolean(customTo),
          clear: () => {
            setDateFilter('this_month');
            setCustomFrom('');
            setCustomTo('');
          },
        };
      case 'account':
        return {
          title: 'Money Source',
          subtitle: selectedAccountId ? accountMap[selectedAccountId] || '1 Account Selected' : 'All Accounts',
          hasActive: selectedAccountId !== null,
          clear: () => setSelectedAccountId(null),
        };
      case 'type':
        return {
          title: 'Transaction Type',
          subtitle: selectedTypes.length > 0 ? `${selectedTypes.length} types selected` : 'All Types',
          hasActive: selectedTypes.length > 0,
          clear: () => {
            setSelectedTypes([]);
            setCategoryTypeTab('all');
          },
        };
      case 'category':
        return {
          title: 'Categories',
          subtitle: selectedCategories.length > 0 ? `${selectedCategories.length} categories selected` : 'All Categories',
          hasActive: selectedCategories.length > 0,
          clear: () => setSelectedCategories([]),
        };
      case 'all':
      default:
        return {
          title: 'Filter Transactions',
          subtitle: `${filteredTransactions.length} results matching`,
          hasActive: activeFiltersCount > 0,
          clear: resetFilters,
        };
    }
  }, [
    filterModalSection,
    dateFilter,
    dateFilterLabel,
    customFrom,
    customTo,
    selectedAccountId,
    accountMap,
    selectedTypes,
    selectedCategories,
    filteredTransactions.length,
    activeFiltersCount,
  ]);

  const performExport = async (method: 'save' | 'share') => {
    try {
      setIsExporting(true);
      const catLabel =
        selectedCategories.length === 0
          ? 'All Categories'
          : selectedCategories.length === 1
          ? selectedCategories[0]
          : `${selectedCategories.length} Categories`;

      const result = await exportTransactionsStatement({
        userEmail: user?.email || 'Account Holder',
        userId: user?.id,
        dateFilterLabel,
        accountFilterLabel: selectedAccountId ? accountMap[selectedAccountId] || 'Selected Account' : 'All Accounts',
        typeFilterLabel,
        categoriesFilterLabel: catLabel,
        searchQuery: searchQuery.trim() || undefined,
        transactions: filteredTransactions,
        accountMap,
        method,
      });

      if (!result.success && result.error) {
        Alert.alert('Export Notice', result.error);
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to download statement');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadStatement = () => {
    Alert.alert(
      'Export Statement',
      `Export ${filteredTransactions.length} filtered transaction${filteredTransactions.length === 1 ? '' : 's'} as PDF:`,
      [
        {
          text: 'Save as PDF (Direct)',
          onPress: () => performExport('save'),
        },
        {
          text: 'Share via Apps',
          onPress: () => performExport('share'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* 1. Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Transactions</Text>
          <View style={styles.recordBadge}>
            <Text style={[styles.recordBadgeText, { color: accent.hex }]}>
              {filteredTransactions.length}
            </Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          {activeFiltersCount > 0 && (
            <TouchableOpacity
              onPress={resetFilters}
              style={styles.clearAllHeaderBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="refresh-outline" size={14} color={accent.hex} />
              <Text style={[styles.clearAllHeaderText, { color: accent.hex }]}>Reset</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleDownloadStatement}
            style={[
              styles.downloadHeaderBtn,
              { backgroundColor: colors.surfaceLight, borderColor: colors.border },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={isExporting}
            accessibilityLabel="Download Statement"
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={accent.hex} />
            ) : (
              <Ionicons name="download-outline" size={16} color={colors.textPrimary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Unified Search & Filter Command Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notes, merchants, people..."
            placeholderTextColor={colors.textMuted}
            textColor={colors.textPrimary}
            style={styles.searchInput}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.searchClearBtn}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Dedicated Filter Sheet Button with Active Count Badge */}
        <TouchableOpacity
          onPress={() => setFilterModalSection('all')}
          style={[
            styles.filterTriggerBtn,
            activeFiltersCount > 0 && {
              borderColor: accent.hex,
              backgroundColor: accent.hex + '18',
            },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={activeFiltersCount > 0 ? accent.hex : colors.textSecondary}
          />
          {activeFiltersCount > 0 && (
            <View style={[styles.filterBadgeBubble, { backgroundColor: accent.hex }]}>
              <Text style={styles.filterBadgeBubbleText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 3. Primary Transaction Type Segment Pills */}
      <View style={styles.typeSegmentContainer}>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'expense', label: 'Expense', color: colors.expense },
            { key: 'income', label: 'Income', color: colors.income },
            { key: 'borrow_given', label: 'Lent', color: colors.lent },
            { key: 'borrow_taken', label: 'Borrowed', color: colors.borrowed },
          ] as const
        ).map((item) => {
          const isAll = item.key === 'all';
          const active = isAll
            ? selectedTypes.length === 0
            : selectedTypes.includes(item.key as TransactionType);

          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => handleQuickTypeSelect(item.key as any)}
              style={[
                styles.typeSegmentTab,
                active && styles.typeSegmentTabActive,
              ]}
            >
              <Text
                style={[
                  styles.typeSegmentText,
                  active && styles.typeSegmentTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4. Interactive Quick-Filter Chips Strip */}
      <View style={styles.quickFilterStripContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFilterScroll}
        >
          {/* Date Selector Pill */}
          <TouchableOpacity
            onPress={() => setFilterModalSection('date')}
            style={[
              styles.quickPill,
              dateFilter !== 'this_month' && {
                borderColor: accent.hex,
                backgroundColor: accent.hex + '18',
              },
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color={dateFilter !== 'this_month' ? accent.hex : colors.textSecondary}
            />
            <Text
              style={[
                styles.quickPillText,
                dateFilter !== 'this_month' && { color: accent.hex, fontWeight: '700' },
              ]}
            >
              {dateFilterLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={11}
              color={dateFilter !== 'this_month' ? accent.hex : colors.textMuted}
            />
          </TouchableOpacity>

          {/* Account Filter Pill */}
          <TouchableOpacity
            onPress={() => setFilterModalSection('account')}
            style={[
              styles.quickPill,
              !!selectedAccountId && {
                borderColor: accent.hex,
                backgroundColor: accent.hex + '18',
              },
            ]}
          >
            {selectedAccountId ? (
              <BankLogo
                account={accounts.find((a) => a.id === selectedAccountId)}
                name={accountMap[selectedAccountId]}
                size={16}
                style={{ marginRight: 5 }}
              />
            ) : (
              <Ionicons
                name="wallet-outline"
                size={13}
                color={colors.textSecondary}
              />
            )}
            <Text
              style={[
                styles.quickPillText,
                !!selectedAccountId && { color: accent.hex, fontWeight: '700' },
              ]}
            >
              {selectedAccountId ? accountMap[selectedAccountId] || 'Account' : 'All Accounts'}
            </Text>
            {selectedAccountId ? (
              <TouchableOpacity
                onPress={() => setSelectedAccountId(null)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close-circle" size={13} color={accent.hex} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {/* Category Filter Pill */}
          <TouchableOpacity
            onPress={() => setFilterModalSection('category')}
            style={[
              styles.quickPill,
              selectedCategories.length > 0 && {
                borderColor: accent.hex,
                backgroundColor: accent.hex + '18',
              },
            ]}
          >
            <Ionicons
              name="pricetags-outline"
              size={13}
              color={selectedCategories.length > 0 ? accent.hex : colors.textSecondary}
            />
            <Text
              style={[
                styles.quickPillText,
                selectedCategories.length > 0 && { color: accent.hex, fontWeight: '700' },
              ]}
            >
              {selectedCategories.length === 0
                ? 'All Categories'
                : selectedCategories.length === 1
                ? selectedCategories[0]
                : `${selectedCategories.length} Categories`}
            </Text>
            {selectedCategories.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSelectedCategories([])}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close-circle" size={13} color={accent.hex} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {/* Active Category Badges with quick dismissal */}
          {selectedCategories.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => toggleCategory(cat)}
              style={styles.activeTagPill}
            >
              <Text style={styles.activeTagText}>{cat}</Text>
              <Ionicons name="close" size={12} color={colors.textPrimary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 5. Real-Time Financial Summary Strip */}
      <View style={styles.metricsStrip}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>SPENT</Text>
          <Text style={[styles.metricValue, TYPOGRAPHY.tabularText, { color: colors.alert }]}>
            ₹{filteredStats.totalExpense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>INCOME</Text>
          <Text style={[styles.metricValue, TYPOGRAPHY.tabularText, { color: accent.hex }]}>
            ₹{filteredStats.totalIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>

        {(filteredStats.totalLent > 0 || filteredStats.totalBorrowed > 0) && (
          <>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>NET LENT</Text>
              <Text
                style={[
                  styles.metricValue,
                  TYPOGRAPHY.tabularText,
                  {
                    color:
                      filteredStats.totalLent >= filteredStats.totalBorrowed
                        ? colors.warning
                        : colors.alert,
                  },
                ]}
              >
                ₹{(filteredStats.totalLent - filteredStats.totalBorrowed).toLocaleString('en-IN', {
                  maximumFractionDigits: 0,
                })}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 6. TRANSACTIONS LIST */}
      <View style={styles.listWrapper}>
        <LinearGradient
          colors={[colors.background, 'transparent']}
          style={styles.topFadeGradient}
          pointerEvents="none"
        />
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="normal"
          overScrollMode="never"
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="search-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No transactions found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No records matching "${searchQuery}".`
                  : 'No records match the current filter criteria.'}
              </Text>
              {activeFiltersCount > 0 && (
                <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
                  <Text style={[styles.resetBtnText, { color: accent.hex }]}>Reset All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </View>

      {/* 7. Comprehensive Filter Modal */}
      <Modal
        visible={filterModalSection !== null}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setFilterModalSection(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleCol}>
                <Text style={styles.modalHeaderTitle}>{modalSectionConfig.title}</Text>
                <Text style={styles.modalHeaderSubtitle}>
                  {modalSectionConfig.subtitle}
                </Text>
              </View>

              <View style={styles.modalHeaderActions}>
                {modalSectionConfig.hasActive && (
                  <TouchableOpacity onPress={modalSectionConfig.clear} style={styles.modalResetBtn}>
                    <Text style={[styles.modalResetText, { color: accent.hex }]}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setFilterModalSection(null)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Section Tabs Selector */}
            <View style={styles.modalSectionTabsContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.modalSectionTabsScroll}
              >
                {(
                  [
                    { key: 'all' as FilterModalSection, label: 'All', hasBadge: activeFiltersCount > 0 },
                    {
                      key: 'date' as FilterModalSection,
                      label: 'Date',
                      hasBadge: dateFilter !== 'this_month' || Boolean(customFrom) || Boolean(customTo),
                    },
                    {
                      key: 'account' as FilterModalSection,
                      label: 'Account',
                      hasBadge: selectedAccountId !== null,
                    },
                    {
                      key: 'type' as FilterModalSection,
                      label: 'Type',
                      hasBadge: selectedTypes.length > 0,
                    },
                    {
                      key: 'category' as FilterModalSection,
                      label: 'Categories',
                      hasBadge: selectedCategories.length > 0,
                    },
                  ] as const
                ).map((tab) => {
                  const active = filterModalSection === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setFilterModalSection(tab.key)}
                      style={[
                        styles.modalSectionTab,
                        active && {
                          borderColor: accent.hex,
                          backgroundColor: accent.hex + '18',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalSectionTabText,
                          active && { color: accent.hex, fontWeight: '700' },
                        ]}
                      >
                        {tab.label}
                      </Text>
                      {tab.hasBadge && (
                        <View style={[styles.modalSectionTabDot, { backgroundColor: accent.hex }]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {/* SECTION A: DATE RANGE */}
              {(filterModalSection === 'all' || filterModalSection === 'date') && (
                <View style={styles.modalSectionBlock}>
                  {filterModalSection === 'all' && (
                    <Text style={styles.modalSectionLabel}>DATE RANGE</Text>
                  )}
                  <View style={styles.modalPillGrid}>
                    {[
                      { key: 'this_month', label: `This Month (${formattedMonthLabel})` },
                      { key: 'last_30_days', label: 'Last 30 Days' },
                      { key: 'all', label: 'All Time' },
                      { key: 'custom', label: 'Custom Range' },
                    ].map((item) => {
                      const active = dateFilter === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => setDateFilter(item.key as DateFilterOption)}
                          style={[
                            styles.modalOptionPill,
                            active && {
                              borderColor: accent.hex,
                              backgroundColor: accent.hex + '18',
                            },
                          ]}
                        >
                          <Ionicons
                            name={active ? 'checkmark-circle' : 'calendar-outline'}
                            size={14}
                            color={active ? accent.hex : colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.modalOptionText,
                              active && { color: colors.textPrimary, fontWeight: '700' },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Custom Date Pickers if custom selected */}
                  {dateFilter === 'custom' && (
                    <View style={styles.customDateBlock}>
                      <View style={styles.customDatePickersRow}>
                        <TouchableOpacity
                          onPress={() => setDatePickerTarget('from')}
                          style={[
                            styles.customDatePickerBtn,
                            datePickerTarget === 'from' && { borderColor: accent.hex },
                          ]}
                        >
                          <Ionicons name="calendar-outline" size={14} color={accent.hex} />
                          <View>
                            <Text style={styles.customDateLabel}>FROM</Text>
                            <Text style={styles.customDateValue}>
                              {customFrom || 'Select start date'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => setDatePickerTarget('to')}
                          style={[
                            styles.customDatePickerBtn,
                            datePickerTarget === 'to' && { borderColor: accent.hex },
                          ]}
                        >
                          <Ionicons name="calendar-outline" size={14} color={accent.hex} />
                          <View>
                            <Text style={styles.customDateLabel}>TO</Text>
                            <Text style={styles.customDateValue}>
                              {customTo || 'Select end date'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* SECTION B: MONEY SOURCE / ACCOUNT */}
              {(filterModalSection === 'all' || filterModalSection === 'account') && (
                <View style={styles.modalSectionBlock}>
                  {filterModalSection === 'all' && (
                    <Text style={styles.modalSectionLabel}>MONEY SOURCE / ACCOUNT</Text>
                  )}
                  <View style={styles.modalPillGrid}>
                    <TouchableOpacity
                      onPress={() => setSelectedAccountId(null)}
                      style={[
                        styles.modalOptionPill,
                        selectedAccountId === null && {
                          borderColor: accent.hex,
                          backgroundColor: accent.hex + '18',
                        },
                      ]}
                    >
                      <Ionicons
                        name={selectedAccountId === null ? 'checkmark-circle' : 'wallet-outline'}
                        size={14}
                        color={selectedAccountId === null ? accent.hex : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.modalOptionText,
                          selectedAccountId === null && { color: colors.textPrimary, fontWeight: '700' },
                        ]}
                      >
                        All Accounts
                      </Text>
                    </TouchableOpacity>

                    {accounts.map((acc) => {
                      const active = selectedAccountId === acc.id;
                      return (
                        <TouchableOpacity
                          key={acc.id}
                          onPress={() => toggleAccount(acc.id)}
                          style={[
                            styles.modalOptionPill,
                            active && {
                              borderColor: accent.hex,
                              backgroundColor: accent.hex + '18',
                            },
                          ]}
                        >
                          <BankLogo
                            account={acc}
                            size={18}
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={[
                              styles.modalOptionText,
                              active && { color: colors.textPrimary, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {acc.name}
                          </Text>
                          {active && (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color={accent.hex}
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* SECTION C: TRANSACTION TYPE */}
              {(filterModalSection === 'all' || filterModalSection === 'type') && (
                <View style={styles.modalSectionBlock}>
                  {filterModalSection === 'all' && (
                    <Text style={styles.modalSectionLabel}>TRANSACTION TYPE</Text>
                  )}
                  <View style={styles.modalPillGrid}>
                    {[
                      { key: 'expense' as TransactionType, label: 'Expense', color: colors.expense },
                      { key: 'income' as TransactionType, label: 'Income', color: colors.income },
                      { key: 'borrow_given' as TransactionType, label: 'Lent', color: colors.lent },
                      { key: 'borrow_taken' as TransactionType, label: 'Borrowed', color: colors.borrowed },
                    ].map((item) => {
                      const active = selectedTypes.includes(item.key);
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => toggleType(item.key)}
                          style={[
                            styles.modalOptionPill,
                            active && {
                              borderColor: item.color,
                              backgroundColor: item.color + '18',
                            },
                          ]}
                        >
                          <Ionicons
                            name={active ? 'checkmark-circle' : 'radio-button-off'}
                            size={14}
                            color={active ? item.color : colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.modalOptionText,
                              active && { color: item.color, fontWeight: '700' },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* SECTION D: CATEGORIES */}
              {(filterModalSection === 'all' || filterModalSection === 'category') && (
                <View style={styles.modalSectionBlock}>
                  <View style={styles.categoriesHeaderRow}>
                    <Text style={styles.modalSectionLabel}>
                      {filterModalSection === 'all' ? 'CATEGORIES' : 'CATEGORY FILTER'}
                    </Text>
                    {selectedCategories.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSelectedCategories([])}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[styles.modalClearLink, { color: accent.hex }]}>
                          Clear Selected ({selectedCategories.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Category Type Tabs */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryTabsRow}
                  >
                    {(
                      [
                        { key: 'all' as CategoryTab, label: 'All', dotColor: undefined },
                        { key: 'expense' as CategoryTab, label: 'Expense', dotColor: colors.alert },
                        { key: 'income' as CategoryTab, label: 'Income', dotColor: accent.hex },
                        { key: 'borrow' as CategoryTab, label: 'Lent & Borrow', dotColor: colors.warning },
                      ] as const
                    ).map((tab) => {
                      const active = categoryTypeTab === tab.key;
                      const selectedInTabCount = selectedCategories.filter((c) =>
                        distinctCategoriesByTab[tab.key].includes(c)
                      ).length;

                      return (
                        <TouchableOpacity
                          key={tab.key}
                          onPress={() => setCategoryTypeTab(tab.key)}
                          style={[
                            styles.categoryTypeTabPill,
                            active && {
                              borderColor: tab.dotColor || accent.hex,
                              backgroundColor: (tab.dotColor || accent.hex) + '18',
                            },
                          ]}
                        >
                          {tab.dotColor ? (
                            <View style={[styles.categoryTypeTabDot, { backgroundColor: tab.dotColor }]} />
                          ) : (
                            <Ionicons
                              name="grid-outline"
                              size={12}
                              color={active ? accent.hex : colors.textMuted}
                            />
                          )}
                          <Text
                            style={[
                              styles.categoryTypeTabText,
                              active && { color: tab.dotColor || accent.hex, fontWeight: '700' },
                            ]}
                          >
                            {tab.label}
                          </Text>
                          {selectedInTabCount > 0 && (
                            <View
                              style={[
                                styles.categoryTypeTabBadge,
                                { backgroundColor: tab.dotColor || accent.hex },
                              ]}
                            >
                              <Text style={styles.categoryTypeTabBadgeText}>
                                {selectedInTabCount}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.categoriesPillGrid}>
                    {distinctCategoriesByTab[categoryTypeTab].map((cat) => {
                      const active = selectedCategories.includes(cat);
                      const iconName = getCategoryIcon(
                        cat,
                        categoryTypeTab === 'income'
                          ? 'income'
                          : categoryTypeTab === 'borrow'
                          ? 'borrow_given'
                          : categoryTypeTab === 'expense'
                          ? 'expense'
                          : undefined
                      );

                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => toggleCategory(cat)}
                          style={[
                            styles.categoryOptionPill,
                            active && {
                              borderColor: accent.hex,
                              backgroundColor: accent.hex + '18',
                            },
                          ]}
                        >
                          <Ionicons
                            name={iconName}
                            size={14}
                            color={active ? accent.hex : colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.categoryOptionText,
                              active && { color: colors.textPrimary, fontWeight: '700' },
                            ]}
                          >
                            {cat}
                          </Text>
                          {active && (
                            <Ionicons name="checkmark" size={12} color={accent.hex} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Bar */}
            <View style={styles.modalBottomBar}>
              <TactileButton
                onPress={() => setFilterModalSection(null)}
                style={[styles.applyFilterBtn, { backgroundColor: accent.hex }]}
              >
                <Text style={styles.applyFilterBtnText}>
                  Show {filteredTransactions.length} Transactions
                </Text>
              </TactileButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Date Pickers Dialog */}
      {datePickerTarget && (
        <DateTimePicker
          value={
            datePickerTarget === 'from' && customFrom
              ? new Date(customFrom)
              : datePickerTarget === 'to' && customTo
              ? new Date(customTo)
              : new Date()
          }
          mode="date"
          display="default"
          onChange={handleCustomDateChange}
        />
      )}

      {/* Floating Circular "+" Button (Guarded by month lock) */}
      <TouchableOpacity
        onPress={handleOpenAddTransaction}
        style={[
          styles.floatingAddBtn,
          {
            backgroundColor:
              dateFilter === 'this_month' && (isFutureMonth || (isPastMonth && isLocked))
                ? colors.surfaceLight
                : accent.hex,
          },
          dateFilter === 'this_month' &&
            (isFutureMonth || (isPastMonth && isLocked)) && {
              borderColor: colors.border,
              borderWidth: 1,
            },
        ]}
        activeOpacity={0.7}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        accessibilityLabel="Add Transaction"
        accessibilityRole="button"
      >
        <Ionicons
          name={
            dateFilter === 'this_month' && isFutureMonth
              ? 'time-outline'
              : dateFilter === 'this_month' && isPastMonth && isLocked
              ? 'lock-closed'
              : 'add'
          }
          size={
            dateFilter === 'this_month' && (isFutureMonth || (isPastMonth && isLocked)) ? 20 : 30
          }
          color={
            dateFilter === 'this_month' && (isFutureMonth || (isPastMonth && isLocked))
              ? colors.textMuted
              : colors.onPrimary
          }
        />
      </TouchableOpacity>

      {/* Month Unlock Modal */}
      <MonthUnlockModal
        visible={unlockModalVisible}
        month={selectedMonth}
        onClose={() => setUnlockModalVisible(false)}
        onUnlockSuccess={() => {
          navigation.navigate('AddTransaction', {
            initialMonth: selectedMonth,
          });
        }}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    recordBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    recordBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    clearAllHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surfaceLight,
    },
    clearAllHeaderText: {
      fontSize: 12,
      fontWeight: '700',
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    downloadHeaderBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
    },
    searchIcon: {
      marginRight: 6,
    },
    searchInput: {
      flex: 1,
      backgroundColor: 'transparent',
      fontSize: 13,
      height: 40,
      paddingHorizontal: 0,
    },
    searchClearBtn: {
      padding: 4,
    },
    filterTriggerBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeBubble: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadgeBubbleText: {
      color: '#0B1120',
      fontSize: 10,
      fontWeight: '800',
    },
    typeSegmentContainer: {
      flexDirection: 'row',
      marginHorizontal: SPACING.lg,
      marginTop: 4,
      marginBottom: 6,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 3,
    },
    typeSegmentTab: {
      flex: 1,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    typeSegmentTabActive: {
      backgroundColor: colors.surfaceLight,
      borderColor: colors.border,
    },
    typeSegmentText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    typeSegmentTextActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    quickFilterStripContainer: {
      marginBottom: 6,
    },
    quickFilterScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      gap: 8,
    },
    quickPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
    },
    quickPillText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    activeTagPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.surfaceLight,
      borderColor: colors.border,
      borderWidth: 1,
    },
    activeTagText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: '600',
    },
    metricsStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.xs,
      paddingVertical: 10,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 22,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 5,
      zIndex: 20,
    },
    listWrapper: {
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
    metricItem: {
      alignItems: 'center',
      flex: 1,
    },
    metricLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    metricValue: {
      fontSize: 13,
      fontWeight: '800',
    },
    metricDivider: {
      width: 1,
      height: 22,
      backgroundColor: colors.border,
    },
    listContent: {
      paddingHorizontal: SPACING.lg,
      paddingTop: 8,
      paddingBottom: 96,
      gap: SPACING.xs,
    },
    emptyContainer: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: SPACING.xl,
      alignItems: 'center',
      marginTop: SPACING.xl,
      gap: 8,
    },
    emptyIconBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    resetBtn: {
      marginTop: 6,
      paddingHorizontal: SPACING.lg,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resetBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderColor: colors.border,
      borderTopWidth: 1,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalHeaderTitleCol: {
      flex: 1,
    },
    modalHeaderTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '800',
    },
    modalHeaderSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    modalHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalResetBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    modalResetText: {
      fontSize: 13,
      fontWeight: '700',
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalSectionTabsContainer: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    modalSectionTabsScroll: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.lg,
      paddingVertical: 8,
      gap: 6,
    },
    modalSectionTab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    modalSectionTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modalSectionTabDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    modalSectionBlock: {
      marginBottom: 16,
    },
    modalScroll: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
    },
    modalSectionLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 12,
    },
    modalPillGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    modalOptionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalOptionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    customDateBlock: {
      marginBottom: 8,
    },
    customDatePickersRow: {
      flexDirection: 'row',
      gap: 8,
    },
    customDatePickerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    customDateLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
    },
    customDateValue: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 1,
    },
    categoriesHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 8,
    },
    modalClearLink: {
      fontSize: 11,
      fontWeight: '700',
    },
    categoryTabsRow: {
      flexDirection: 'row',
      gap: 6,
      paddingBottom: 10,
    },
    categoryTypeTabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    categoryTypeTabDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    categoryTypeTabText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    categoryTypeTabBadge: {
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      marginLeft: 2,
    },
    categoryTypeTabBadgeText: {
      color: colors.textInverse,
      fontSize: 9,
      fontWeight: '800',
    },
    categoriesPillGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    categoryOptionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryOptionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    modalBottomBar: {
      paddingHorizontal: SPACING.lg,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    applyFilterBtn: {
      height: 46,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyFilterBtnText: {
      color: colors.textInverse,
      fontSize: 14,
      fontWeight: '700',
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
  });
}
