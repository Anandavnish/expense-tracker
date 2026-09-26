import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, parseBorrowDetails } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';

export const BorrowsScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { accent } = useSettingsStore();
  const {
    borrows,
    transactions,
    toggleSettleBorrowOptimistic,
    addBorrowOptimistic,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const [filter, setFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [borrowType, setBorrowType] = useState<'lent' | 'borrowed'>('lent');
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Filtered borrows list
  const filteredBorrows = borrows.filter((b) => {
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'settled') return b.status === 'settled';
    return true;
  });

  // Calculate totals separated cleanly between lent and borrowed
  let totalPendingLent = 0;
  let totalPendingBorrowed = 0;
  borrows.forEach((b) => {
    const { type } = parseBorrowDetails(b, transactions);
    if (b.status === 'pending') {
      if (type === 'borrowed') {
        totalPendingBorrowed += Number(b.amount || 0);
      } else {
        totalPendingLent += Number(b.amount || 0);
      }
    }
  });

  const netPending = totalPendingLent - totalPendingBorrowed;

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
      type: borrowType,
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
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
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
        {/* Quick Summary Cards (3-part: Lent, Borrowed, Net) */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TO RECEIVE (LENT)</Text>
            <Text
              style={[
                styles.summaryNumber,
                TYPOGRAPHY.tabularText,
                { color: accent.hex },
              ]}
            >
              +₹{totalPendingLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>TO PAY (BORROWED)</Text>
            <Text
              style={[
                styles.summaryNumber,
                TYPOGRAPHY.tabularText,
                { color: COLORS.alert },
              ]}
            >
              −₹{totalPendingBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>NET POSITION</Text>
            <Text
              style={[
                styles.summaryNumber,
                TYPOGRAPHY.tabularText,
                { color: netPending >= 0 ? accent.hex : COLORS.alert },
              ]}
            >
              {netPending < 0 ? '−' : '+'}₹{Math.abs(netPending).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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

            <Text style={styles.fieldLabel}>ENTRY TYPE</Text>
            <View style={styles.directionToggleRow}>
              <TouchableOpacity
                onPress={() => setBorrowType('lent')}
                style={[
                  styles.directionBtn,
                  borrowType === 'lent' && {
                    borderColor: accent.hex,
                    backgroundColor: COLORS.surfaceLight,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-up-circle-outline"
                  size={16}
                  color={borrowType === 'lent' ? accent.hex : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.directionBtnText,
                    borrowType === 'lent' && { color: accent.hex, fontWeight: '700' },
                  ]}
                >
                  I Lent (They owe me)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setBorrowType('borrowed')}
                style={[
                  styles.directionBtn,
                  borrowType === 'borrowed' && {
                    borderColor: COLORS.alert,
                    backgroundColor: COLORS.surfaceLight,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-down-circle-outline"
                  size={16}
                  color={borrowType === 'borrowed' ? COLORS.alert : COLORS.textMuted}
                />
                <Text
                  style={[
                    styles.directionBtnText,
                    borrowType === 'borrowed' && { color: COLORS.alert, fontWeight: '700' },
                  ]}
                >
                  I Borrowed (I owe them)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>PERSON NAME</Text>
            <TextInput
              value={personName}
              onChangeText={setPersonName}
              placeholder="e.g. Rahul, Sneha"
              placeholderTextColor={COLORS.textMuted}
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={accent.hex}
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
              activeOutlineColor={accent.hex}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <TactileButton
              onPress={handleAddBorrow}
              style={[styles.saveBtn, { backgroundColor: accent.hex }]}
            >
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
            const { type, displayName } = parseBorrowDetails(borrow, transactions);
            const isSettled = borrow.status === 'settled';
            const isLent = type === 'lent';

            return (
              <View key={borrow.id} style={styles.borrowItem}>
                <View style={styles.borrowLeft}>
                  <Text style={styles.personName}>{displayName}</Text>
                  <View style={styles.borrowMeta}>
                    <Text style={styles.dateText}>{borrow.date}</Text>
                    <View
                      style={[
                        styles.directionTag,
                        { borderColor: isLent ? accent.hex : COLORS.alert },
                      ]}
                    >
                      <Text
                        style={[
                          styles.directionTagText,
                          { color: isLent ? accent.hex : COLORS.alert },
                        ]}
                      >
                        {isLent ? 'LENT' : 'BORROWED'}
                      </Text>
                    </View>
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
                  <Text
                    style={[
                      styles.amountText,
                      TYPOGRAPHY.tabularText,
                      { color: isLent ? accent.hex : COLORS.alert },
                    ]}
                  >
                    {isLent ? '+' : '−'}₹
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
  directionToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  directionBtnText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  directionTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  directionTagText: {
    fontSize: 9,
    fontWeight: '700',
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
