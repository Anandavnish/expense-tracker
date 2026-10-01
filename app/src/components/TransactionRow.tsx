// src/components/TransactionRow.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction, TransactionType } from '../types/database';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useAppTheme } from '../theme/useAppTheme';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { BankLogo } from './BankLogo';
import { EditButton } from './EditButton';
import { useFinanceStore } from '../store/financeStore';

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

const TransactionRowComponent: React.FC<TransactionRowProps> = ({
  transaction,
  accountName,
  onPress,
  onPressEdit,
  onPressDelete,
  showActions = true,
}) => {
  const navigation = useNavigation<any>();
  const { colors, accent } = useAppTheme();
  const account = useFinanceStore(
    React.useCallback((s) => s.accounts.find((a) => a.id === transaction.account_id), [transaction.account_id])
  );

  const isIncome = transaction.type === 'income';
  const isExpense = transaction.type === 'expense';
  const isBorrowTaken = transaction.type === 'borrow_taken';
  const isBorrowGiven = transaction.type === 'borrow_given';
  const isCreditCardPayment = transaction.category === 'Credit Card Payment';

  let amountPrefix = '';
  // Refined palette: normal expenses are crisp neutral text (never shouting red)
  let amountColor = colors.textPrimary;

  if (isCreditCardPayment) {
    amountPrefix = '⇄ ';
    amountColor = colors.textSecondary;
  } else if (isIncome) {
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
              numberOfLines={2}
            >
              {displayTitle}
            </Text>
          </View>

          {hasCustomNote ? (
            <>
              {/* Category & Account on first sub-row */}
              <View style={styles.metaRow}>
                <Text
                  style={[styles.metaCategoryTag, { color: categoryStyle.text }]}
                  numberOfLines={1}
                >
                  {transaction.category.toUpperCase()}
                </Text>

                {accountName ? (
                  <>
                    <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                    <View
                      style={[
                        styles.accountBadge,
                        { backgroundColor: colors.surfaceLight },
                      ]}
                    >
                      <BankLogo
                        account={account}
                        name={accountName}
                        size={14}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[styles.accountBadgeText, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {accountName}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Date cleanly sent to the next line */}
              <View style={styles.dateRow}>
                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                  {transaction.date}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.metaRow}>
              {accountName ? (
                <>
                  <View
                    style={[
                      styles.accountBadge,
                      { backgroundColor: colors.surfaceLight },
                    ]}
                  >
                    <BankLogo
                      account={account}
                      name={accountName}
                      size={14}
                      style={{ marginRight: 4 }}
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
          )}
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

          {/* Non-expense types and Credit Card Payments get clean informative badges */}
          {isCreditCardPayment ? (
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: `${accent.hex}18` },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: accent.hex },
                ]}
              >
                SETTLEMENT
              </Text>
            </View>
          ) : !isExpense ? (
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
          ) : null}
        </View>
      </View>

      {/* Bottom Action Footer with Subtle, Refined Edit and Delete Buttons */}
      {showActions && (
        <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
          <View style={styles.footerActionsGroup}>
            <EditButton
              size={26}
              iconSize={13}
              onPress={handleEditPress}
              accessibilityLabel="Edit transaction"
            />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeletePress}
              style={[
                styles.actionIconBtn,
                {
                  backgroundColor: `${colors.alert}15`,
                  borderColor: `${colors.alert}30`,
                },
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Delete transaction"
            >
              <Ionicons name="trash-outline" size={13} color={colors.alert} />
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

export const TransactionRow = React.memo(TransactionRowComponent);

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
    minWidth: 0,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  titleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
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
    flexShrink: 0,
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
  actionIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
