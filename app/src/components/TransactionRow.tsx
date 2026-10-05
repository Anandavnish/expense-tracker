// src/components/TransactionRow.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction, TransactionType } from '../types/database';
import { TYPOGRAPHY } from '../theme/tokens';
import { useAppTheme } from '../theme/useAppTheme';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { BankLogo } from './BankLogo';
import { EditButton } from './EditButton';
import { useFinanceStore } from '../store/financeStore';

export interface TransactionRowProps {
  transaction: Transaction;
  accountName?: string;
  showDate?: boolean;
  showActions?: boolean;
  onPress?: () => void;
  onPressEdit?: () => void;
  onPressDelete?: () => void;
}

const typeLabels: Record<TransactionType, string> = {
  income: 'INCOME',
  expense: 'EXPENSE',
  borrow_given: 'LENT',
  borrow_taken: 'BORROWED',
};

const TransactionRowComponent: React.FC<TransactionRowProps> = ({
  transaction,
  accountName,
  showDate = true,
  showActions = false,
  onPress,
  onPressEdit,
  onPressDelete,
}) => {
  const navigation = useNavigation<any>();
  const { colors, accent } = useAppTheme();

  const account = useFinanceStore(
    React.useCallback((s) => s.accounts.find((a) => a.id === transaction.account_id), [transaction.account_id])
  );
  const linkedBorrow = useFinanceStore(
    React.useCallback((s) => s.borrows.find((b) => b.linked_transaction_id === transaction.id), [transaction.id])
  );
  const isBorrowSettled = linkedBorrow?.status === 'settled';

  const isIncome = transaction.type === 'income';
  const isExpense = transaction.type === 'expense';
  const isBorrowTaken = transaction.type === 'borrow_taken';
  const isBorrowGiven = transaction.type === 'borrow_given';
  const isCreditCardPayment = transaction.category === 'Credit Card Payment';

  let amountPrefix = '−';
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
    amountPrefix = '−';
    amountColor = colors.textPrimary;
  }

  const categoryStyle = getCategoryColor(transaction.category, transaction.type, accent.hex);
  const categoryIcon = getCategoryIcon(transaction.category, transaction.type);

  const formattedAmount = Number(transaction.amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const hasCustomNote = Boolean(transaction.note?.trim());
  const displayTitle = hasCustomNote ? transaction.note!.trim() : transaction.category;

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
      activeOpacity={0.72}
      onPress={handleCardPress}
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.mainRow}>
        {/* Category Icon Avatar */}
        <View style={[styles.iconAvatar, { backgroundColor: categoryStyle.bg }]}>
          <Ionicons name={categoryIcon} size={22} color={categoryStyle.text} />
        </View>

        {/* Center Details */}
        <View style={styles.centerCol}>
          <Text
            style={[styles.primaryTitle, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {displayTitle}
          </Text>

          <View style={styles.subMetaRow}>
            {/* If a note is shown as title, show the Category Tag */}
            {hasCustomNote && (
              <View style={[styles.categoryTag, { backgroundColor: categoryStyle.bg }]}>
                <Text
                  style={[styles.categoryTagText, { color: categoryStyle.text }]}
                  numberOfLines={1}
                >
                  {transaction.category}
                </Text>
              </View>
            )}

            {/* Friend / Account Badge */}
            {transaction.paid_by_friend ? (
              <View
                style={[
                  styles.accountBadge,
                  {
                    backgroundColor: isBorrowSettled ? `${colors.success}15` : `${colors.warning}15`,
                    borderColor: isBorrowSettled ? `${colors.success}35` : `${colors.warning}35`,
                  },
                ]}
              >
                <Ionicons
                  name={isBorrowSettled ? 'checkmark-circle' : 'people'}
                  size={11}
                  color={isBorrowSettled ? colors.success : colors.warning}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.accountBadgeText,
                    { color: isBorrowSettled ? colors.success : colors.warning, fontWeight: '600' },
                  ]}
                  numberOfLines={1}
                >
                  {transaction.friend_name || 'Friend'}{isBorrowSettled ? ' · Settled' : ' · Due'}
                </Text>
              </View>
            ) : accountName ? (
              <View
                style={[
                  styles.accountBadge,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.border },
                ]}
              >
                <BankLogo
                  account={account}
                  name={accountName}
                  size={12}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[styles.accountBadgeText, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {accountName}
                </Text>
              </View>
            ) : null}

            {/* Date (if showDate is true) */}
            {showDate && (
              <Text style={[styles.dateText, { color: colors.textMuted }]}>
                {transaction.date}
              </Text>
            )}
          </View>
        </View>

        {/* Right Details: Clean Tabular Amount & Type Tag */}
        <View style={styles.rightCol}>
          <Text
            style={[
              styles.amountText,
              TYPOGRAPHY.tabularText,
              { color: amountColor },
            ]}
            numberOfLines={1}
          >
            {amountPrefix}₹{formattedAmount}
          </Text>

          {isCreditCardPayment ? (
            <View style={[styles.typeBadge, { backgroundColor: `${accent.hex}15` }]}>
              <Text style={[styles.typeBadgeText, { color: accent.hex }]}>
                CARD BILL
              </Text>
            </View>
          ) : !isExpense ? (
            <View
              style={[
                styles.typeBadge,
                isIncome && { backgroundColor: `${colors.success}15` },
                (isBorrowGiven || isBorrowTaken) && { backgroundColor: `${colors.warning}15` },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  isIncome && { color: colors.success },
                  (isBorrowGiven || isBorrowTaken) && { color: colors.warning },
                ]}
              >
                {typeLabels[transaction.type]}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Subtle Chevron indicator */}
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.textMuted}
          style={styles.chevronIcon}
        />
      </View>

      {/* Optional Slim Action Footer if explicitly requested */}
      {showActions && (
        <View style={[styles.slimFooter, { borderTopColor: colors.border }]}>
          <View style={styles.footerActions}>
            <EditButton
              size={24}
              iconSize={12}
              onPress={handleEditPress}
              accessibilityLabel="Edit transaction"
            />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeletePress}
              style={[
                styles.deleteIconBtn,
                {
                  backgroundColor: `${colors.alert}15`,
                  borderColor: `${colors.alert}30`,
                },
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Delete transaction"
            >
              <Ionicons name="trash-outline" size={12} color={colors.alert} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.footerDetailText, { color: colors.textMuted }]}>
            Tap for full receipt & breakdown
          </Text>
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
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  centerCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
    minWidth: 0,
  },
  primaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    maxWidth: 100,
  },
  categoryTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 110,
  },
  accountBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
    fontWeight: '400',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  amountText: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  typeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 3,
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  chevronIcon: {
    marginLeft: 6,
    opacity: 0.5,
  },
  slimFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerDetailText: {
    fontSize: 10.5,
    fontStyle: 'italic',
  },
});
