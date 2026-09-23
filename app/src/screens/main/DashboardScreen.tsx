// src/screens/main/DashboardScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { ReanimatedNumber } from '../../components/ReanimatedNumber';
import { TransactionRow } from '../../components/TransactionRow';
import { InlineError } from '../../components/InlineError';
import { TactileButton } from '../../components/TactileButton';

interface DashboardScreenProps {
  navigation: any;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const { user, signOut } = useAuthStore();
  const {
    accounts,
    transactions,
    budgetSummaries,
    fetchInitialData,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await fetchInitialData(user.id);
    setRefreshing(false);
  };

  // Calculate Net Worth across all accounts
  const totalNetWorth = accounts.reduce(
    (sum, acc) => sum + Number(acc.current_balance || 0),
    0
  );

  // Overall budget summary
  const overallBudget =
    budgetSummaries.find((b) => b.category === null) ||
    budgetSummaries[0] ||
    null;

  const budgetSpent = overallBudget ? Number(overallBudget.spent) : 0;
  const budgetLimit = overallBudget ? Number(overallBudget.monthly_limit) : 0;
  const budgetRemaining = overallBudget ? Number(overallBudget.remaining) : 0;
  const budgetPct = overallBudget
    ? Math.min(Number(overallBudget.spent_percentage) / 100, 1)
    : 0;

  const budgetColor =
    budgetPct >= 1 ? COLORS.alert : budgetPct > 0.8 ? COLORS.warning : COLORS.accent;

  // Recent transactions (last 8)
  const recentTransactions = transactions.slice(0, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {user?.email || 'Personal Finance'}
          </Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {/* 1. Primary Hero Balance Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroLabel}>TOTAL NET WORTH</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>REALTIME</Text>
            </View>
          </View>
          <ReanimatedNumber value={totalNetWorth} style={styles.heroBalance} />

          {/* Accounts Breakdown Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accountsPills}
          >
            {accounts.map((acc) => (
              <View key={acc.id} style={styles.accountPill}>
                <Text style={styles.accountPillName}>{acc.name}</Text>
                <Text
                  style={[
                    styles.accountPillBalance,
                    TYPOGRAPHY.tabularText,
                    {
                      color:
                        Number(acc.current_balance) >= 0 ? COLORS.textPrimary : COLORS.alert,
                    },
                  ]}
                >
                  ₹
                  {Number(acc.current_balance).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* 2. Monthly Budget Progress Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>MONTHLY BUDGET</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Budgets')}>
              <Text style={styles.cardAction}>Manage</Text>
            </TouchableOpacity>
          </View>

          {overallBudget && budgetLimit > 0 ? (
            <View style={styles.budgetBody}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetLabel}>Spent: ₹{budgetSpent.toLocaleString('en-IN')}</Text>
                <Text style={styles.budgetLimitText}>
                  Limit: ₹{budgetLimit.toLocaleString('en-IN')}
                </Text>
              </View>

              <ProgressBar
                progress={budgetPct}
                color={budgetColor}
                style={styles.progressBar}
              />

              <View style={styles.budgetFooter}>
                <Text style={styles.budgetRemainingText}>
                  Remaining:{' '}
                  <Text
                    style={[
                      TYPOGRAPHY.tabularText,
                      { color: budgetRemaining >= 0 ? COLORS.accent : COLORS.alert },
                    ]}
                  >
                    ₹{budgetRemaining.toLocaleString('en-IN')}
                  </Text>
                </Text>
                <Text style={[styles.budgetPercentText, TYPOGRAPHY.tabularText]}>
                  {Math.round(budgetPct * 100)}%
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyBudgetBox}>
              <Text style={styles.emptyBudgetText}>No monthly budget set yet.</Text>
              <TactileButton
                onPress={() => navigation.navigate('Budgets')}
                style={styles.setBudgetBtn}
              >
                <Text style={styles.setBudgetBtnText}>Set Budget</Text>
              </TactileButton>
            </View>
          )}
        </View>

        {/* 3. Recent Activity Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
          <Text style={styles.sectionCount}>{transactions.length} total</Text>
        </View>

        {recentTransactions.length > 0 ? (
          recentTransactions.map((tx) => {
            const acc = accounts.find((a) => a.id === tx.account_id);
            return (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                accountName={acc?.name}
                animate={false}
              />
            );
          })
        ) : (
          <View style={styles.emptyActivityBox}>
            <Text style={styles.emptyActivityTitle}>No transactions recorded</Text>
            <Text style={styles.emptyActivitySubtitle}>
              Tap the "+ Add" tab below to log your first income or expense.
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
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  userEmail: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  signOutBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  signOutText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  heroLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginRight: 4,
  },
  liveText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '700',
  },
  heroBalance: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginVertical: SPACING.xs,
  },
  accountsPills: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  accountPill: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 110,
  },
  accountPillName: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  accountPillBalance: {
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  cardTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardAction: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  budgetBody: {
    gap: SPACING.sm,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetLabel: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  budgetLimitText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.xs,
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetRemainingText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  budgetPercentText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyBudgetBox: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  emptyBudgetText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  setBudgetBtn: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  setBudgetBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
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
  emptyActivityBox: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyActivityTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  emptyActivitySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
