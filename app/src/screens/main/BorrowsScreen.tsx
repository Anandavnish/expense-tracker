// src/screens/main/BorrowsScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { Borrow } from '../../types/database';

export const BorrowsScreen = () => {
  const { user } = useAuthStore();
  const {
    borrows,
    toggleSettleBorrowOptimistic,
    addBorrowOptimistic,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const [filter, setFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Filtered borrows list
  const filteredBorrows = borrows.filter((b) => {
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'settled') return b.status === 'settled';
    return true;
  });

  // Calculate totals
  const totalPending = borrows
    .filter((b) => b.status === 'pending')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const totalSettled = borrows
    .filter((b) => b.status === 'settled')
    .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const handleAddBorrow = async () => {
    if (!user) return;
    const numAmount = parseFloat(amount);
    if (!personName.trim()) {
      setFormError('Please enter person name');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount');
      return;
    }

    setFormError(null);
    await addBorrowOptimistic({
      user_id: user.id,
      person_name: personName.trim(),
      amount: numAmount,
      status: 'pending',
      linked_transaction_id: null,
      date: new Date().toISOString().substring(0, 10),
    });

    setPersonName('');
    setAmount('');
    setShowAddForm(false);
  };

  const handleToggleSettle = (borrowId: string) => {
    toggleSettleBorrowOptimistic(borrowId);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.appTitle}>BORROWS & LENDING</Text>
          <Text style={styles.subtitle}>Track money lent and owed</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>
            {showAddForm ? 'Cancel' : '+ Add Entry'}
          </Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Quick Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TOTAL PENDING</Text>
            <Text
              style={[
                styles.summaryNumber,
                TYPOGRAPHY.tabularText,
                { color: COLORS.warning },
              ]}
            >
              ₹{totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TOTAL SETTLED</Text>
            <Text
              style={[
                styles.summaryNumber,
                TYPOGRAPHY.tabularText,
                { color: COLORS.accent },
              ]}
            >
              ₹{totalSettled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Add Entry Form (Collapsible) */}
        {showAddForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>NEW BORROW / LEND ENTRY</Text>
            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>PERSON NAME</Text>
            <TextInput
              value={personName}
              onChangeText={setPersonName}
              placeholder="e.g. Rahul, Sneha"
              placeholderTextColor={COLORS.textMuted}
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>AMOUNT (₹)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <TactileButton onPress={handleAddBorrow} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save Entry</Text>
            </TactileButton>
          </View>
        ) : null}

        {/* Status Filters */}
        <View style={styles.filterRow}>
          {(['all', 'pending', 'settled'] as const).map((tab) => {
            const active = filter === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Borrows List */}
        {filteredBorrows.length > 0 ? (
          filteredBorrows.map((borrow) => {
            const isSettled = borrow.status === 'settled';

            return (
              <View key={borrow.id} style={styles.borrowItem}>
                <View style={styles.borrowLeft}>
                  <Text style={styles.personName}>{borrow.person_name}</Text>
                  <View style={styles.borrowMeta}>
                    <Text style={styles.dateText}>{borrow.date}</Text>
                    <View
                      style={[
                        styles.statusTag,
                        isSettled ? styles.statusSettled : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          isSettled ? styles.settledText : styles.pendingText,
                        ]}
                      >
                        {isSettled ? 'SETTLED' : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.borrowRight}>
                  <Text style={[styles.amountText, TYPOGRAPHY.tabularText]}>
                    ₹
                    {Number(borrow.amount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                  <TactileButton
                    onPress={() => handleToggleSettle(borrow.id)}
                    style={[
                      styles.toggleBtn,
                      isSettled ? styles.reopenBtn : styles.settleBtn,
                    ]}
                  >
                    <Text
                      style={
                        isSettled ? styles.reopenBtnText : styles.settleBtnText
                      }
                    >
                      {isSettled ? 'Reopen' : 'Settle'}
                    </Text>
                  </TactileButton>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No borrow records found</Text>
            <Text style={styles.emptySubtitle}>
              Tap "+ Add Entry" or log a Lent/Borrowed transaction to track here.
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
  subtitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addBtnText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: '800',
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
  input: {
    backgroundColor: COLORS.surfaceLight,
    marginBottom: SPACING.md,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  filterChip: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surfaceLight,
  },
  filterChipText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  borrowItem: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  borrowLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  personName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  borrowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dateText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  statusTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusPending: {
    backgroundColor: COLORS.warningMuted,
    borderColor: COLORS.warning,
  },
  statusSettled: {
    backgroundColor: COLORS.accentMuted,
    borderColor: COLORS.accent,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  pendingText: {
    color: COLORS.warning,
  },
  settledText: {
    color: COLORS.accent,
  },
  borrowRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  amountText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  toggleBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  settleBtn: {
    backgroundColor: COLORS.accentMuted,
    borderColor: COLORS.accent,
  },
  settleBtnText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  reopenBtn: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
  },
  reopenBtnText: {
    color: COLORS.textSecondary,
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
