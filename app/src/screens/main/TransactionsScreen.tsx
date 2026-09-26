import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { Transaction, TransactionType } from '../../types/database';
import { TransactionRow } from '../../components/TransactionRow';
import { TactileButton } from '../../components/TactileButton';
import { getCategoryIcon } from '../../utils/categoryIcons';

type DateFilterOption = 'this_month' | 'last_30_days' | 'all' | 'custom';

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const TransactionsScreen = () => {
  const insets = useSafeAreaInsets();
  const { accent, colors } = useSettingsStore();
  const { transactions, accounts, categories, selectedMonth } = useFinanceStore();

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Filter States
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Modal & Date Picker States
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);

  // Accounts lookup map for fast source name retrieval
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      map[acc.id] = acc.name;
    });
    return map;
  }, [accounts]);

  // Toggle Type Selection in Modal / Segment
  const toggleType = (t: TransactionType) => {
    if (selectedTypes.includes(t)) {
      setSelectedTypes(selectedTypes.filter((x) => x !== t));
    } else {
      setSelectedTypes([...selectedTypes, t]);
    }
  };

  const handleQuickTypeSelect = (t: TransactionType | 'all') => {
    if (t === 'all') {
      setSelectedTypes([]);
    } else if (selectedTypes.length === 1 && selectedTypes[0] === t) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes([t]);
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

    const query = searchQuery.trim().toLowerCase();

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
    searchQuery,
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

  // Render Transaction Item using redesigned TransactionRow
  const renderItem = ({ item }: { item: Transaction }) => {
    const sourceAccountName = accountMap[item.account_id];
    return (
      <TransactionRow
        transaction={item}
        accountName={sourceAccountName}
      />
    );
  };

  const formattedMonthLabel = useMemo(() => {
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

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
      </View>

      {/* 2. Unified Search & Filter Command Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notes, merchants, people..."
            placeholderTextColor={COLORS.textMuted}
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
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Dedicated Filter Sheet Button with Active Count Badge */}
        <TouchableOpacity
          onPress={() => setIsFilterModalVisible(true)}
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
            { key: 'expense', label: 'Expense', color: COLORS.alert },
            { key: 'income', label: 'Income', color: accent.hex },
            { key: 'borrow_given', label: 'Lent', color: COLORS.warning },
            { key: 'borrow_taken', label: 'Borrowed', color: '#8B5CF6' },
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
                active && !isAll && { borderColor: (item as any).color + '60' },
              ]}
            >
              <Text
                style={[
                  styles.typeSegmentText,
                  active && styles.typeSegmentTextActive,
                  active && !isAll && { color: (item as any).color },
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
            onPress={() => setIsFilterModalVisible(true)}
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
            onPress={() => setIsFilterModalVisible(true)}
            style={[
              styles.quickPill,
              !!selectedAccountId && {
                borderColor: accent.hex,
                backgroundColor: accent.hex + '18',
              },
            ]}
          >
            <Ionicons
              name="wallet-outline"
              size={13}
              color={selectedAccountId ? accent.hex : colors.textSecondary}
            />
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
            onPress={() => setIsFilterModalVisible(true)}
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
          <Text style={[styles.metricValue, TYPOGRAPHY.tabularText, { color: COLORS.alert }]}>
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
                        ? COLORS.warning
                        : COLORS.alert,
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
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBadge}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
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

      {/* 7. Comprehensive Filter Modal */}
      <Modal
        visible={isFilterModalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleCol}>
                <Text style={styles.modalHeaderTitle}>Filter Transactions</Text>
                <Text style={styles.modalHeaderSubtitle}>
                  {filteredTransactions.length} results matching
                </Text>
              </View>

              <View style={styles.modalHeaderActions}>
                {activeFiltersCount > 0 && (
                  <TouchableOpacity onPress={resetFilters} style={styles.modalResetBtn}>
                    <Text style={[styles.modalResetText, { color: accent.hex }]}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setIsFilterModalVisible(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              {/* SECTION A: DATE RANGE */}
              <Text style={styles.modalSectionLabel}>DATE RANGE</Text>
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

              {/* SECTION B: MONEY SOURCE / ACCOUNT */}
              <Text style={styles.modalSectionLabel}>MONEY SOURCE / ACCOUNT</Text>
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
                      <Ionicons
                        name={
                          active
                            ? 'checkmark-circle'
                            : acc.type === 'credit_card'
                            ? 'card-outline'
                            : acc.type === 'cash'
                            ? 'cash-outline'
                            : 'business-outline'
                        }
                        size={14}
                        color={active ? accent.hex : colors.textMuted}
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
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* SECTION C: TRANSACTION TYPE */}
              <Text style={styles.modalSectionLabel}>TRANSACTION TYPE</Text>
              <View style={styles.modalPillGrid}>
                {[
                  { key: 'expense' as TransactionType, label: 'Expense', color: COLORS.alert },
                  { key: 'income' as TransactionType, label: 'Income', color: accent.hex },
                  { key: 'borrow_given' as TransactionType, label: 'Lent', color: COLORS.warning },
                  { key: 'borrow_taken' as TransactionType, label: 'Borrowed', color: '#8B5CF6' },
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

              {/* SECTION D: CATEGORIES */}
              <Text style={styles.modalSectionLabel}>CATEGORIES</Text>
              <View style={styles.categoriesPillGrid}>
                {categories.map((cat) => {
                  const active = selectedCategories.includes(cat);
                  const iconName = getCategoryIcon(cat);

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
            </ScrollView>

            {/* Modal Bottom Bar */}
            <View style={styles.modalBottomBar}>
              <TactileButton
                onPress={() => setIsFilterModalVisible(false)}
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
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceLight,
  },
  clearAllHeaderText: {
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
  },
  typeSegmentText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  typeSegmentTextActive: {
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  quickPillText: {
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  activeTagText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  metricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
    gap: SPACING.xs,
  },
  emptyContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  resetBtn: {
    marginTop: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: COLORS.border,
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
    borderBottomColor: COLORS.border,
  },
  modalHeaderTitleCol: {
    flex: 1,
  },
  modalHeaderTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modalHeaderSubtitle: {
    color: COLORS.textMuted,
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
  modalScroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  modalSectionLabel: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalOptionText: {
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  customDateLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  customDateValue: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
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
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryOptionText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  modalBottomBar: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  applyFilterBtn: {
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFilterBtnText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
});
