// src/components/TransactionRow.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction, TransactionType } from '../types/database';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/tokens';
import { useSettingsStore } from '../store/settingsStore';
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
  const { accent } = useSettingsStore();

  const isIncome = transaction.type === 'income';
  const isExpense = transaction.type === 'expense';
  const isBorrowTaken = transaction.type === 'borrow_taken';

  let amountPrefix = '';
  let amountColor: string = COLORS.textPrimary;

  if (isIncome || isBorrowTaken) {
    amountPrefix = '+';
    amountColor = accent.hex;
  } else if (isExpense) {
    amountPrefix = '−';
    amountColor = COLORS.alert;
  } else {
    amountPrefix = '−';
    amountColor = COLORS.warning;
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
      style={styles.cardContainer}
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
            <Text style={styles.titleText} numberOfLines={1}>
              {displayTitle}
            </Text>
          </View>

          <View style={styles.metaRow}>
            {hasCustomNote && (
              <>
                <Text style={[styles.metaCategoryTag, { color: categoryStyle.text }]} numberOfLines={1}>
                  {transaction.category.toUpperCase()}
                </Text>
                <Text style={styles.metaDot}>·</Text>
              </>
            )}

            {accountName ? (
              <>
                <View style={styles.accountBadge}>
                  <Ionicons name="wallet-outline" size={11} color={COLORS.textSecondary} style={{ marginRight: 3 }} />
                  <Text style={styles.accountBadgeText} numberOfLines={1}>
                    {accountName}
                  </Text>
                </View>
                <Text style={styles.metaDot}>·</Text>
              </>
            ) : null}

            <Text style={styles.dateText}>{transaction.date}</Text>
          </View>
        </View>

        {/* Right Details: Amount & Type Tag */}
        <View style={styles.rightContent}>
          <Text style={[styles.amountText, TYPOGRAPHY.tabularText, { color: amountColor }]}>
            {amountPrefix}₹{formattedAmount}
          </Text>
          <View
            style={[
              styles.typeBadge,
              isIncome && { backgroundColor: `${accent.hex}18` },
              isExpense && { backgroundColor: COLORS.alertMuted },
              (transaction.type === 'borrow_given' || transaction.type === 'borrow_taken') && {
                backgroundColor: COLORS.warningMuted,
              },
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                isIncome && { color: accent.hex },
                isExpense && { color: COLORS.alert },
                (transaction.type === 'borrow_given' || transaction.type === 'borrow_taken') && {
                  color: COLORS.warning,
                },
              ]}
            >
              {typeLabels[transaction.type]?.toUpperCase() || transaction.type.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Action Footer with Edit and Delete Buttons */}
      {showActions && (
        <View style={styles.footerRow}>
          <View style={styles.footerActionsGroup}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleEditPress}
              style={styles.actionBtn}
            >
              <Ionicons name="create-outline" size={14} color={accent.hex} />
              <Text style={[styles.actionBtnText, { color: accent.hex }]}>Edit</Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeletePress}
              style={styles.actionBtn}
            >
              <Ionicons name="trash-outline" size={14} color={COLORS.alert} />
              <Text style={[styles.actionBtnText, { color: COLORS.alert }]}>Delete</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerDetailLink}>
            <Text style={styles.detailLinkText}>Details</Text>
            <Ionicons name="chevron-forward" size={13} color={COLORS.textMuted} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
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
    color: COLORS.textPrimary,
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
    color: COLORS.textMuted,
    marginHorizontal: 4,
    fontSize: 10,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    maxWidth: 100,
  },
  accountBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  dateText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  rightContent: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceLight,
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
    backgroundColor: COLORS.border,
    marginHorizontal: 2,
  },
  footerDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  detailLinkText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
