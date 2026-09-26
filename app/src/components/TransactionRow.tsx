// src/components/TransactionRow.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction, TransactionType } from '../types/database';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useAppTheme } from '../theme/useAppTheme';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

export interface TransactionRowProps {
  transaction: Transaction;
  accountName?: string;
  onPress?: () => void;
  onPressEdit?: () => void;
  onPressDelete?: () => void;
  showActions?: boolean;
}

const typeLabels: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  borrow_given: 'Lent',
  borrow_taken: 'Borrowed',
};

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  accountName,
  onPress,
  onPressEdit,
  onPressDelete,
  showActions = true,
}) => {
  const navigation = useNavigation<any>();
  const { colors, accent } = useAppTheme();

  const isIncome = transaction.type === 'income';
  const isExpense = transaction.type === 'expense';
  const isBorrowTaken = transaction.type === 'borrow_taken';
  const isBorrowGiven = transaction.type === 'borrow_given';

  let amountPrefix = '';
  // Refined palette: normal expenses are crisp neutral text (never shouting red)
  let amountColor = colors.textPrimary;

  if (isIncome) {
    amountPrefix = '+';
    amountColor = colors.success;
  } else if (isBorrowTaken) {
    amountPrefix = '+';
    amountColor = colors.warning;
  } else if (isBorrowGiven) {
    amountPrefix = '−';
    amountColor = colors.warning;
  } else {
    // Normal expense
    amountPrefix = '−';
    amountColor = colors.textPrimary;
  }

  const categoryStyle = getCategoryColor(transaction.category, transaction.type, accent.hex);
  const categoryIcon = getCategoryIcon(transaction.category, transaction.type);

  const formattedAmount = Number(transaction.amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const displayTitle = transaction.note?.trim() || transaction.category;
  const hasCustomNote = Boolean(transaction.note?.trim());

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      navigation.navigate('TransactionDetail', {
        transactionId: transaction.id,
      });
    }
  };

  const handleEditPress = () => {
    if (onPressEdit) {
      onPressEdit();
    } else {
      navigation.navigate('TransactionDetail', {
        transactionId: transaction.id,
        initialMode: 'edit',
      });
    }
  };

  const handleDeletePress = () => {
    if (onPressDelete) {
      onPressDelete();
    } else {
      navigation.navigate('TransactionDetail', {
        transactionId: transaction.id,
        initialMode: 'delete',
      });
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={handleCardPress}
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Top Main Section */}
      <View style={styles.topRow}>
        {/* Category Icon Badge */}
        <View style={[styles.iconContainer, { backgroundColor: categoryStyle.bg }]}>
          <Ionicons name={categoryIcon} size={20} color={categoryStyle.text} />
        </View>

        {/* Center Details */}
        <View style={styles.centerContent}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.titleText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {displayTitle}
            </Text>
          </View>

          <View style={styles.metaRow}>
            {hasCustomNote && (
              <>
                <Text
                  style={[styles.metaCategoryTag, { color: categoryStyle.text }]}
                  numberOfLines={1}
                >
                  {transaction.category.toUpperCase()}
                </Text>
                <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
              </>
            )}

            {accountName ? (
              <>
                <View
                  style={[
                    styles.accountBadge,
                    { backgroundColor: colors.surfaceLight },
                  ]}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={11}
                    color={colors.textSecondary}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[styles.accountBadgeText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {accountName}
                  </Text>
                </View>
                <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
              </>
            ) : null}

            <Text style={[styles.dateText, { color: colors.textMuted }]}>
              {transaction.date}
            </Text>
          </View>
        </View>

        {/* Right Details: Clean Amount & Non-Expense Badges */}
        <View style={styles.rightContent}>
          <Text
            style={[
              styles.amountText,
              TYPOGRAPHY.tabularText,
              { color: amountColor },
            ]}
          >
            {amountPrefix}₹{formattedAmount}
          </Text>

          {/* Only non-expense types get a badge to avoid shouting red EXPENSE on every card */}
          {!isExpense && (
            <View
              style={[
                styles.typeBadge,
                isIncome && { backgroundColor: `${colors.success}18` },
                (isBorrowGiven || isBorrowTaken) && {
                  backgroundColor: colors.warningMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  isIncome && { color: colors.success },
                  (isBorrowGiven || isBorrowTaken) && {
                    color: colors.warning,
                  },
                ]}
              >
                {typeLabels[transaction.type]}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Action Footer with Subtle, Refined Edit and Delete Buttons */}
      {showActions && (
        <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
          <View style={styles.footerActionsGroup}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleEditPress}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceLight }]}
            >
              <Ionicons name="create-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
                Edit
              </Text>
            </TouchableOpacity>

            <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeletePress}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceLight }]}
            >
              <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.actionBtnText, { color: colors.textMuted }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerDetailLink}>
            <Text style={[styles.detailLinkText, { color: colors.textMuted }]}>
              Details
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  centerContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  metaCategoryTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    maxWidth: 90,
  },
  metaDot: {
    marginHorizontal: 4,
    fontSize: 10,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    maxWidth: 100,
  },
  accountBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
  },
  rightContent: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: SPACING.sm,
    paddingTop: 8,
  },
  footerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionDivider: {
    width: 1,
    height: 14,
    marginHorizontal: 2,
  },
  footerDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  detailLinkText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
