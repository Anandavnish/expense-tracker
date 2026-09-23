// src/components/TransactionRow.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { Transaction } from '../types/database';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';

interface TransactionRowProps {
  transaction: Transaction;
  accountName?: string;
  animate?: boolean;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  accountName,
  animate = true,
}) => {
  const isPositive =
    transaction.type === 'income' || transaction.type === 'borrow_taken';

  const amountPrefix = isPositive ? '+' : '-';
  const amountColor = isPositive ? COLORS.accent : COLORS.alert;

  const typeLabels: Record<string, string> = {
    income: 'Income',
    expense: 'Expense',
    borrow_given: 'Lent',
    borrow_taken: 'Borrowed',
  };

  const formattedAmount = Number(transaction.amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Animated.View
      entering={animate ? SlideInRight.duration(220) : undefined}
      style={styles.container}
    >
      <View style={styles.leftColumn}>
        <View style={styles.categoryRow}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {transaction.category}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{typeLabels[transaction.type] || transaction.type}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{transaction.date}</Text>
          {accountName ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{accountName}</Text>
            </>
          ) : null}
          {transaction.note ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.noteText} numberOfLines={1}>
                {transaction.note}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.rightColumn}>
        <Text style={[styles.amountText, TYPOGRAPHY.tabularText, { color: amountColor }]}>
          {amountPrefix}₹{formattedAmount}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  leftColumn: {
    flex: 1,
    marginRight: SPACING.md,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  categoryText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginRight: SPACING.sm,
  },
  badge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  metaDot: {
    color: COLORS.textMuted,
    marginHorizontal: SPACING.xs,
    fontSize: 10,
  },
  noteText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
