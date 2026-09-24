// src/screens/main/TransactionsScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { TextInput } from 'react-native-paper';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { Transaction, TransactionType } from '../../types/database';

type DateFilterOption = 'this_month' | 'last_30_days' | 'all' | 'custom';

export const TransactionsScreen = () => {
  const { accent } = useSettingsStore();
  const { transactions, accounts, categories, selectedMonth } = useFinanceStore();

  // Filter States
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Accounts lookup map for fast source name retrieval
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      map[acc.id] = acc.name;
    });
    return map;
  }, [accounts]);

  // Toggle Type Selection
  const toggleType = (t: TransactionType) => {
    if (selectedTypes.includes(t)) {
      setSelectedTypes(selectedTypes.filter((x) => x !== t));
    } else {
      setSelectedTypes([...selectedTypes, t]);
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

  // Reset Filters
  const resetFilters = () => {
    setDateFilter('this_month');
    setSelectedTypes([]);
    setSelectedCategories([]);
    setShowCustomRange(false);
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().substring(0, 10);

    return transactions.filter((tx) => {
      // 1. Date filter
      if (dateFilter === 'this_month') {
        if (!tx.date.startsWith(selectedMonth)) return false;
      } else if (dateFilter === 'last_30_days') {
        if (tx.date < thirtyDaysAgoStr) return false;
      } else if (dateFilter === 'custom') {
        if (customFrom && tx.date < customFrom) return false;
        if (customTo && tx.date > customTo) return false;
      }

      // 2. Type filter
      if (selectedTypes.length > 0) {
        if (!selectedTypes.includes(tx.type)) return false;
      }

      // 3. Category filter
      if (selectedCategories.length > 0) {
        if (!selectedCategories.includes(tx.category)) return false;
      }

      return true;
    });
  }, [
    transactions,
    dateFilter,
    selectedMonth,
    customFrom,
    customTo,
    selectedTypes,
    selectedCategories,
  ]);

  // Type labels for Line 2
  const typeDisplayLabels: Record<TransactionType, string> = {
    expense: 'Expense',
    income: 'Income',
    borrow_given: 'Lent',
    borrow_taken: 'Borrowed',
  };

  // Render 3-Line Transaction Item
  const renderItem = ({ item }: { item: Transaction }) => {
    const isIncome = item.type === 'income';
    const isExpense = item.type === 'expense';
    const isLentOrBorrowed =
      item.type === 'borrow_given' || item.type === 'borrow_taken';

    // Amount styling based on spec:
    // Green for income, red for expense, plain/neutral for lent/borrowed
    let amountColor: string = COLORS.textPrimary;
    let amountPrefix = '';

    if (isIncome) {
      amountColor = accent.value;
      amountPrefix = '+';
    } else if (isExpense) {
      amountColor = COLORS.alert;
      amountPrefix = '−';
    }

    const title = item.note || item.category || 'Transaction';
    const sourceAccountName = accountMap[item.account_id] || 'Source Account';
    const formattedAmount = Number(item.amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return (
      <View style={styles.transactionCard}>
        {/* LINE 1: Title (merchant/person/note) on left, Amount on right */}
        <View style={styles.rowLine1}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[
              styles.amountText,
              TYPOGRAPHY.tabularText,
              { color: amountColor },
            ]}
          >
            {amountPrefix}₹{formattedAmount}
          </Text>
        </View>

        {/* LINE 2: "tag1 · tag2" where tag1 = category (accent), tag2 = type (warning) */}
        <View style={styles.rowLine2}>
          <Text style={[styles.tagCategory, { color: accent.value }]}>
            {item.category.toUpperCase()}
          </Text>
          <Text style={styles.tagDivider}>·</Text>
          <Text style={styles.tagType}>
            {typeDisplayLabels[item.type]?.toUpperCase() || item.type.toUpperCase()}
          </Text>
        </View>

        {/* LINE 3: date/time on left, source account name on right */}
        <View style={styles.rowLine3}>
          <Text style={styles.metaLeftText}>{item.date}</Text>
          <Text style={styles.metaRightText} numberOfLines={1}>
            {sourceAccountName}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TRANSACTIONS</Text>
        <Text style={styles.headerCount}>{filteredTransactions.length} records</Text>
      </View>

      {/* FILTER BAR */}
      <View style={styles.filterBarContainer}>
        {/* Date Range Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            onPress={() => {
              setDateFilter('this_month');
              setShowCustomRange(false);
            }}
            style={[
              styles.filterPill,
              dateFilter === 'this_month' && {
                borderColor: accent.value,
                backgroundColor: accent.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                dateFilter === 'this_month' && { color: accent.value, fontWeight: '700' },
              ]}
            >
              This Month
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setDateFilter('last_30_days');
              setShowCustomRange(false);
            }}
            style={[
              styles.filterPill,
              dateFilter === 'last_30_days' && {
                borderColor: accent.value,
                backgroundColor: accent.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                dateFilter === 'last_30_days' && { color: accent.value, fontWeight: '700' },
              ]}
            >
              Last 30 Days
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setDateFilter('all');
              setShowCustomRange(false);
            }}
            style={[
              styles.filterPill,
              dateFilter === 'all' && {
                borderColor: accent.value,
                backgroundColor: accent.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                dateFilter === 'all' && { color: accent.value, fontWeight: '700' },
              ]}
            >
              All Time
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setDateFilter('custom');
              setShowCustomRange(!showCustomRange);
            }}
            style={[
              styles.filterPill,
              dateFilter === 'custom' && {
                borderColor: accent.value,
                backgroundColor: accent.muted,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                dateFilter === 'custom' && { color: accent.value, fontWeight: '700' },
              ]}
            >
              Custom Range
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Custom Range Input Inputs */}
        {showCustomRange && dateFilter === 'custom' && (
          <View style={styles.customDateInputsRow}>
            <TextInput
              value={customFrom}
              onChangeText={setCustomFrom}
              placeholder="From YYYY-MM-DD"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={accent.value}
              textColor={COLORS.textPrimary}
              style={styles.customDateInput}
            />
            <TextInput
              value={customTo}
              onChangeText={setCustomTo}
              placeholder="To YYYY-MM-DD"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={accent.value}
              textColor={COLORS.textPrimary}
              style={styles.customDateInput}
            />
          </View>
        )}

        {/* Type Multi-Select Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(
            [
              { type: 'expense' as TransactionType, label: 'Expense' },
              { type: 'income' as TransactionType, label: 'Income' },
              { type: 'borrow_given' as TransactionType, label: 'Lent' },
              { type: 'borrow_taken' as TransactionType, label: 'Borrowed' },
            ] as const
          ).map((item) => {
            const active = selectedTypes.includes(item.type);
            return (
              <TouchableOpacity
                key={item.type}
                onPress={() => toggleType(item.type)}
                style={[
                  styles.filterTagChip,
                  active && {
                    borderColor: COLORS.warning,
                    backgroundColor: COLORS.warningMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterTagText,
                    active && { color: COLORS.warning, fontWeight: '700' },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category Multi-Select Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {categories.map((cat) => {
            const active = selectedCategories.includes(cat);
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => toggleCategory(cat)}
                style={[
                  styles.filterCategoryChip,
                  active && {
                    borderColor: accent.value,
                    backgroundColor: accent.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterCategoryText,
                    active && { color: accent.value, fontWeight: '700' },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* TRANSACTIONS LIST */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No matching transactions</Text>
            <Text style={styles.emptySubtitle}>
              Try adjusting your date range, type, or category filters.
            </Text>
            <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
              <Text style={[styles.resetBtnText, { color: accent.value }]}>
                Reset Filters
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
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
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterBarContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.xs,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
  },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  filterPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  customDateInputsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  customDateInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    height: 40,
  },
  filterTagChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  filterTagText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  filterCategoryChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  filterCategoryText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  transactionCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowLine1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: SPACING.md,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
  },
  rowLine2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: SPACING.xs,
  },
  tagCategory: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagDivider: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  tagType: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rowLine3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLeftText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  metaRightText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    maxWidth: '50%',
  },
  emptyContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.xl,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  resetBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
