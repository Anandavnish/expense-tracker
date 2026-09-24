// src/screens/main/BudgetsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ProgressBar, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';

export const BudgetsScreen = () => {
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

  const availableCategories = ['Overall Budget', ...categories];
  const [selectedCategory, setSelectedCategory] = useState('Overall Budget');
  const [limitAmount, setLimitAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const overallSummary = budgetSummaries.find((b) => b.category === null);
  const categorySummaries = budgetSummaries.filter((b) => b.category !== null);

  const handleSaveBudget = async () => {
    if (!user) return;
    const numLimit = parseFloat(limitAmount);
    if (isNaN(numLimit) || numLimit <= 0) {
      setFormError('Please enter a valid monthly limit');
      return;
    }

    setFormError(null);
    const categoryToSave =
      selectedCategory === 'Overall Budget' ? null : selectedCategory;

    await setBudgetOptimistic({
      user_id: user.id,
      category: categoryToSave,
      monthly_limit: numLimit,
      month: selectedMonth,
    });

    setLimitAmount('');
    setShowForm(false);
  };

  const getStatusColor = (pct: number) => {
    if (pct >= 100) return COLORS.alert;
    if (pct >= 80) return COLORS.warning;
    return accent.value;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <View>
          <Text style={[styles.appTitle, { color: accent.value }]}>BUDGETS</Text>
          <Text style={styles.monthText}>Current Period: {selectedMonth}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowForm(!showForm)}
          style={styles.addBudgetBtn}
        >
          <Text style={[styles.addBudgetText, { color: accent.value }]}>
            {showForm ? 'Cancel' : '+ Set Budget'}
          </Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Set Budget Form (Collapsible) */}
        {showForm ? (
          <View style={[styles.formCard, { borderColor: accent.value }]}>
            <Text style={styles.formTitle}>CONFIGURE MONTHLY LIMIT</Text>
            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.catChipsScroll}
            >
              {availableCategories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.catChip,
                      active && {
                        borderColor: accent.value,
                        backgroundColor: accent.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        active && styles.catChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

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

            <TactileButton onPress={handleSaveBudget} style={styles.saveBudgetBtn}>
              <Text style={styles.saveBudgetBtnText}>Save Budget</Text>
            </TactileButton>
          </View>
        ) : null}

        {/* 1. Overall Monthly Budget Card */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>OVERALL MONTHLY SPEND</Text>
        </View>

        {overallSummary ? (
          <View style={styles.budgetCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.budgetCardName}>Overall Budget</Text>
              <Text
                style={[
                  styles.pctBadgeText,
                  { color: getStatusColor(Number(overallSummary.spent_percentage)) },
                ]}
              >
                {Math.round(Number(overallSummary.spent_percentage))}% spent
              </Text>
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
                  <Text style={styles.categoryName}>{catSummary.category}</Text>
                  <Text
                    style={[
                      styles.categoryPct,
                      TYPOGRAPHY.tabularText,
                      { color },
                    ]}
                  >
                    {Math.round(Number(catSummary.spent_percentage))}%
                  </Text>
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
    </SafeAreaView>
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
  catChipsScroll: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  catChip: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.xs,
  },
  catChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentMuted,
  },
  catChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  catChipTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
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
