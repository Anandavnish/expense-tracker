import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { InlineError } from '../../components/InlineError';

const getCategoryIcon = (cat: string): keyof typeof Ionicons.glyphMap => {
  const lower = cat.toLowerCase();
  if (lower.includes('overall')) return 'pie-chart-outline';
  if (lower.includes('food') || lower.includes('dining')) return 'fast-food-outline';
  if (lower.includes('grocer')) return 'cart-outline';
  if (lower.includes('rent') || lower.includes('util')) return 'home-outline';
  if (lower.includes('transp')) return 'car-outline';
  if (lower.includes('shop')) return 'bag-handle-outline';
  if (lower.includes('entertain')) return 'film-outline';
  if (lower.includes('subscript')) return 'calendar-outline';
  if (lower.includes('health')) return 'medkit-outline';
  if (lower.includes('educat')) return 'school-outline';
  if (lower.includes('care')) return 'sparkles-outline';
  if (lower.includes('travel')) return 'airplane-outline';
  return 'pricetag-outline';
};

interface BudgetsScreenProps {
  route?: {
    params?: {
      editCategory?: string;
      currentLimit?: string;
    };
  };
}

export const BudgetsScreen: React.FC<BudgetsScreenProps> = ({ route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { accent } = useSettingsStore();
  const {
    budgetSummaries,
    categories,
    selectedMonth,
    setBudgetOptimistic,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const initialCategory = route?.params?.editCategory !== undefined ? route.params.editCategory : 'Overall Budget';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [prevParamCategory, setPrevParamCategory] = useState(route?.params?.editCategory);
  const [limitAmount, setLimitAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const overallSummary = budgetSummaries.find((b) => b.category === null);
  const categorySummaries = budgetSummaries.filter((b) => b.category !== null);

  // Auto-handle edit params from route (e.g. from Dashboard "Edit" button)
  if (route?.params?.editCategory !== prevParamCategory) {
    setPrevParamCategory(route?.params?.editCategory);
    if (route?.params?.editCategory !== undefined) {
      const cat = route.params.editCategory;
      setSelectedCategory(cat);
      if (route.params.currentLimit) {
        setLimitAmount(String(route.params.currentLimit));
      } else {
        const target = cat === 'Overall Budget' ? null : cat;
        const existing = budgetSummaries.find((b) => b.category === target);
        if (existing && Number(existing.monthly_limit) > 0) {
          setLimitAmount(String(existing.monthly_limit));
        } else {
          setLimitAmount('');
        }
      }
      setShowForm(true);
    }
  }

  // When changing category in form, prefill limit if one already exists
  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    const target = cat === 'Overall Budget' ? null : cat;
    const existing = budgetSummaries.find((b) => b.category === target);
    if (existing && Number(existing.monthly_limit) > 0) {
      setLimitAmount(String(existing.monthly_limit));
    } else {
      setLimitAmount('');
    }
  };

  const isEditingExisting = useMemo(() => {
    const target = selectedCategory === 'Overall Budget' ? null : selectedCategory;
    const existing = budgetSummaries.find((b) => b.category === target);
    return !!existing && Number(existing.monthly_limit) > 0;
  }, [selectedCategory, budgetSummaries]);

  const handleSaveBudget = () => {
    if (!user) return;
    const numLimit = parseFloat(limitAmount);
    if (isNaN(numLimit) || numLimit <= 0) {
      setFormError('Please enter a valid monthly limit');
      return;
    }

    setFormError(null);
    const categoryToSave =
      selectedCategory === 'Overall Budget' ? null : selectedCategory;

    // Instant UI close - 0ms lag
    setShowForm(false);
    setLimitAmount('');

    setBudgetOptimistic({
      user_id: user.id,
      category: categoryToSave,
      monthly_limit: numLimit,
      month: selectedMonth,
    });
  };

  const getStatusColor = (pct: number) => {
    if (pct >= 100) return COLORS.alert;
    if (pct >= 80) return COLORS.warning;
    return accent.hex;
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.topHeader}>
        <View>
          <Text style={[styles.appTitle, { color: accent.hex }]}>BUDGETS</Text>
          <Text style={styles.monthText}>Current Period: {selectedMonth}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowForm(!showForm)}
          style={styles.addBudgetBtn}
        >
          <Text style={[styles.addBudgetText, { color: accent.hex }]}>
            {showForm ? 'Cancel' : '+ Set Budget'}
          </Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Set Budget Form (Collapsible) */}
        {showForm ? (
          <View style={[styles.formCard, { borderColor: accent.hex }]}>
            <Text style={styles.formTitle}>
              {isEditingExisting ? 'EDIT MONTHLY LIMIT' : 'CONFIGURE MONTHLY LIMIT'}
            </Text>
            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>SELECT BUDGET TARGET</Text>
            
            {/* Primary Overall Option */}
            <TouchableOpacity
              onPress={() => handleSelectCategory('Overall Budget')}
              style={[
                styles.overallCategoryPill,
                selectedCategory === 'Overall Budget' && {
                  borderColor: accent.hex,
                  backgroundColor: accent.muted,
                },
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.catPillLeft}>
                <Ionicons
                  name="pie-chart-outline"
                  size={16}
                  color={selectedCategory === 'Overall Budget' ? accent.hex : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.overallCategoryText,
                    selectedCategory === 'Overall Budget' && {
                      color: accent.hex,
                      fontWeight: '700',
                    },
                  ]}
                >
                  Overall Monthly Budget
                </Text>
              </View>
              {selectedCategory === 'Overall Budget' && (
                <Ionicons name="checkmark-circle" size={16} color={accent.hex} />
              )}
            </TouchableOpacity>

            {/* Redesigned Multi-column Wrapping Grid of Categories */}
            <View style={styles.categoriesGrid}>
              {categories.map((cat) => {
                const active = selectedCategory === cat;
                const iconName = getCategoryIcon(cat);
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => handleSelectCategory(cat)}
                    style={[
                      styles.categoryGridPill,
                      active && {
                        borderColor: accent.hex,
                        backgroundColor: accent.muted,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={iconName}
                      size={14}
                      color={active ? accent.hex : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.categoryGridPillText,
                        active && { color: accent.hex, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {cat}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark-circle" size={13} color={accent.hex} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>MONTHLY LIMIT (₹)</Text>
            <TextInput
              value={limitAmount}
              onChangeText={setLimitAmount}
              placeholder="e.g. 25000"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.limitInput}
            />

            <TouchableOpacity
              onPress={handleSaveBudget}
              style={[styles.saveBudgetBtn, { backgroundColor: accent.hex }]}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBudgetBtnText}>
                {isEditingExisting ? 'Update Budget' : 'Save Budget'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 1. Overall Monthly Budget Card */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>OVERALL MONTHLY SPEND</Text>
        </View>

        {overallSummary ? (
          <View style={styles.budgetCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitleRow}>
                <Ionicons name="pie-chart-outline" size={17} color={accent.hex} />
                <Text style={styles.budgetCardName}>Overall Budget</Text>
              </View>
              <View style={styles.cardHeaderRight}>
                <Text
                  style={[
                    styles.pctBadgeText,
                    { color: getStatusColor(Number(overallSummary.spent_percentage)) },
                  ]}
                >
                  {Math.round(Number(overallSummary.spent_percentage))}% spent
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    handleSelectCategory('Overall Budget');
                    setShowForm(true);
                  }}
                  style={[styles.cardEditPill, { borderColor: accent.hex }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil-outline" size={13} color={accent.hex} />
                  <Text style={[styles.cardEditPillText, { color: accent.hex }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.numbersRow}>
              <View>
                <Text style={styles.label}>SPENT</Text>
                <Text style={[styles.spentNumber, TYPOGRAPHY.tabularText]}>
                  ₹{Number(overallSummary.spent).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.rightAlign}>
                <Text style={styles.label}>LIMIT</Text>
                <Text style={[styles.limitNumber, TYPOGRAPHY.tabularText]}>
                  ₹{Number(overallSummary.monthly_limit).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            <ProgressBar
              progress={Math.min(Number(overallSummary.spent_percentage) / 100, 1)}
              color={getStatusColor(Number(overallSummary.spent_percentage))}
              style={styles.progressBar}
            />

            <View style={styles.footerRow}>
              <Text style={styles.remainingLabel}>Remaining</Text>
              <Text
                style={[
                  styles.remainingValue,
                  TYPOGRAPHY.tabularText,
                  {
                    color:
                      Number(overallSummary.remaining) >= 0
                        ? COLORS.accent
                        : COLORS.alert,
                  },
                ]}
              >
                ₹{Number(overallSummary.remaining).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No overall budget configured</Text>
            <Text style={styles.emptySubtitle}>
              Tap "+ Set Budget" above to set a target for {selectedMonth}.
            </Text>
          </View>
        )}

        {/* 2. Category Budgets Section */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.lg }]}>
          <Text style={styles.sectionTitle}>CATEGORY BREAKDOWN</Text>
          <Text style={styles.sectionCount}>{categorySummaries.length} active</Text>
        </View>

        {categorySummaries.length > 0 ? (
          categorySummaries.map((catSummary) => {
            const pct = Math.min(Number(catSummary.spent_percentage) / 100, 1);
            const color = getStatusColor(Number(catSummary.spent_percentage));

            return (
              <View key={catSummary.budget_id} style={styles.catBudgetCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.catTitleLeft}>
                    <Ionicons
                      name={getCategoryIcon(catSummary.category || '')}
                      size={15}
                      color={accent.hex}
                    />
                    <Text style={styles.categoryName}>{catSummary.category}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text
                      style={[
                        styles.categoryPct,
                        TYPOGRAPHY.tabularText,
                        { color },
                      ]}
                    >
                      {Math.round(Number(catSummary.spent_percentage))}%
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        handleSelectCategory(catSummary.category || 'Overall Budget');
                        setShowForm(true);
                      }}
                      style={[styles.cardEditPill, { borderColor: accent.hex }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={13} color={accent.hex} />
                      <Text style={[styles.cardEditPillText, { color: accent.hex }]}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ProgressBar progress={pct} color={color} style={styles.catProgressBar} />

                <View style={styles.catFooter}>
                  <Text style={styles.catMeta}>
                    Spent: ₹{Number(catSummary.spent).toLocaleString('en-IN')} of ₹
                    {Number(catSummary.monthly_limit).toLocaleString('en-IN')}
                  </Text>
                  <Text
                    style={[
                      styles.catRemaining,
                      TYPOGRAPHY.tabularText,
                      {
                        color:
                          Number(catSummary.remaining) >= 0
                            ? COLORS.textSecondary
                            : COLORS.alert,
                      },
                    ]}
                  >
                    {Number(catSummary.remaining) >= 0 ? 'Left: ' : 'Over: '}₹
                    {Math.abs(Number(catSummary.remaining)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No category limits configured</Text>
            <Text style={styles.emptySubtitle}>
              Set limits for dining, groceries, shopping, and more to monitor spending.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  monthText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  addBudgetBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addBudgetText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  formTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.md,
  },
  errorBox: {
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
    borderWidth: 1,
    borderRadius: 6,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.alert,
    fontSize: 12,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  overallCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  catPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  overallCategoryText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  categoryGridPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  categoryGridPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  limitInput: {
    backgroundColor: COLORS.surfaceLight,
    marginBottom: SPACING.md,
  },
  saveBudgetBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveBudgetBtnText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionCount: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  budgetCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  catTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  cardEditPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  budgetCardName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  pctBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  spentNumber: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  rightAlign: {
    alignItems: 'flex-end',
  },
  limitNumber: {
    color: COLORS.textSecondary,
    fontSize: 20,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.xs,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  remainingLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  remainingValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  catBudgetCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  categoryName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryPct: {
    fontSize: 13,
    fontWeight: '700',
  },
  catProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.xs,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  catRemaining: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
