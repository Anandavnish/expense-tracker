import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { TransactionType } from '../../types/database';

interface AddTransactionScreenProps {
  navigation: any;
  route?: any;
}

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Allowance',
  'Gift',
  'Refund',
  'Other',
];

const BORROW_CATEGORIES = [
  'Personal Loan',
  'Dinner Split',
  'Trip Expense',
  'Emergency',
  'Other',
];

const CREDIT_CARD_INCOME_CATEGORIES = [
  'Credit Card Payment',
  'Cashback',
  'Refund',
  'Reward Redemption',
  'Other',
];

export const AddTransactionScreen: React.FC<AddTransactionScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { accent } = useSettingsStore();
  const {
    accounts,
    categories,
    addTransactionOptimistic,
    addBorrowOptimistic,
  } = useFinanceStore();

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(
    route?.params?.accountId || accounts[0]?.id || ''
  );
  const [category, setCategory] = useState(categories[0] || 'Food');
  const [note, setNote] = useState('');
  const [personName, setPersonName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveAccountId = selectedAccountId || route?.params?.accountId || accounts[0]?.id || '';
  const selectedAccount = accounts.find((a) => a.id === effectiveAccountId);
  const isCreditCard = selectedAccount?.type === 'credit_card';

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'expense') {
      setCategory(categories[0] || 'Food');
    } else if (newType === 'income') {
      setCategory(isCreditCard ? CREDIT_CARD_INCOME_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    } else {
      setCategory(BORROW_CATEGORIES[0]);
    }
  };

  const getAvailableCategories = () => {
    if (isCreditCard && type === 'income') return CREDIT_CARD_INCOME_CATEGORIES;
    if (type === 'expense') return categories;
    if (type === 'income') return INCOME_CATEGORIES;
    return BORROW_CATEGORIES;
  };

  const handleSubmit = () => {
    if (!user) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount greater than 0');
      return;
    }
    if (!selectedAccountId) {
      setFormError('Please select a source account to deduct from');
      return;
    }
    if (isCreditCard && (type === 'borrow_given' || type === 'borrow_taken')) {
      setFormError('Credit cards cannot be used for Lent/Borrowed entries. Please select a Bank or Cash account.');
      return;
    }
    if ((type === 'borrow_given' || type === 'borrow_taken') && !personName.trim()) {
      setFormError('Please enter person name for borrow entry');
      return;
    }

    setFormError(null);

    // 1. Optimistic write to transaction store (fires background sync)
    addTransactionOptimistic({
      user_id: user.id,
      account_id: effectiveAccountId,
      type,
      amount: numAmount,
      category,
      note: note.trim() || null,
      date,
      source: 'manual',
    });

    // 2. If borrow, also add to borrows optimistic store with clean direction
    if (type === 'borrow_given' || type === 'borrow_taken') {
      addBorrowOptimistic({
        user_id: user.id,
        person_name: personName.trim(),
        amount: numAmount,
        status: 'pending',
        type: type === 'borrow_taken' ? 'borrowed' : 'lent',
        linked_transaction_id: null,
        date,
      });
    }

    // 3. Reset form and navigate back immediately (non-blocking)
    setAmount('');
    setNote('');
    setPersonName('');
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Dashboard');
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {navigation.canGoBack() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={accent.hex} />
            <Text style={[styles.backText, { color: accent.hex }]}>Cancel</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>LOG TRANSACTION</Text>
        {navigation.canGoBack() && <View style={styles.headerSpacer} />}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? undefined : 'padding'}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {formError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          ) : null}

          {/* 1. Transaction Type Selector */}
          <View style={styles.typeSelector}>
            {(
              [
                { key: 'expense', label: 'Expense' },
                { key: 'income', label: 'Income' },
                { key: 'borrow_given', label: 'Lent' },
                { key: 'borrow_taken', label: 'Borrowed' },
              ] as const
            ).map((item) => {
              const active = type === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => handleTypeChange(item.key)}
                  style={[styles.typeTab, active && styles.typeTabActive]}
                >
                  <Text
                    style={[
                      styles.typeTabText,
                      active && styles.typeTabTextActive,
                      active && item.key === 'expense' && { color: COLORS.alert },
                      active && item.key === 'income' && { color: accent.hex },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2. Hero Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={[styles.currencyPrefix, { color: accent.hex }]}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={(text) => {
                setFormError(null);
                setAmount(text.replace(/[^0-9.]/g, ''));
              }}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              textColor={COLORS.textPrimary}
              style={[styles.amountInput, TYPOGRAPHY.heroNumber]}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
            />
          </View>

          {/* 3. Account / Money Source Picker (Source to deduct from) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MONEY SOURCE (DEDUCT FROM)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {accounts.map((acc) => {
                const active = effectiveAccountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    onPress={() => {
                      setFormError(null);
                      setSelectedAccountId(acc.id);
                    }}
                    style={[
                      styles.chip,
                      active && {
                        borderColor: accent.hex,
                        backgroundColor: accent.muted,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        acc.type === 'cash'
                          ? 'cash-outline'
                          : acc.type === 'credit_card'
                          ? 'card-outline'
                          : 'business-outline'
                      }
                      size={15}
                      color={active ? accent.hex : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        active && { color: accent.hex, fontWeight: '700' },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* If borrow, show Person Name input */}
          {(type === 'borrow_given' || type === 'borrow_taken') && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {type === 'borrow_given' ? 'LENT TO (PERSON NAME)' : 'BORROWED FROM (PERSON NAME)'}
              </Text>
              <TextInput
                value={personName}
                onChangeText={setPersonName}
                placeholder="e.g. Rahul, Priya"
                placeholderTextColor={COLORS.textMuted}
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                textColor={COLORS.textPrimary}
                style={styles.textInput}
              />
            </View>
          )}

          {/* 4. Category Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CATEGORY</Text>
            <View style={styles.categoriesGrid}>
              {getAvailableCategories().map((cat) => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.categoryPill,
                      active && {
                        borderColor: accent.hex,
                        backgroundColor: accent.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        active && { color: accent.hex, fontWeight: '700' },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 5. Date & Quick Toggles */}
          <View style={styles.section}>
            <View style={styles.dateHeader}>
              <Text style={styles.sectionLabel}>DATE</Text>
              <View style={styles.quickDateRow}>
                <TouchableOpacity
                  onPress={() => setDate(new Date().toISOString().substring(0, 10))}
                  style={styles.quickDateBtn}
                >
                  <Text style={[styles.quickDateText, { color: accent.hex }]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    setDate(yesterday.toISOString().substring(0, 10));
                  }}
                  style={styles.quickDateBtn}
                >
                  <Text style={[styles.quickDateText, { color: accent.hex }]}>Yesterday</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={accent.hex}
              textColor={COLORS.textPrimary}
              style={styles.textInput}
            />
          </View>

          {/* 6. Note (Optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Lunch with friends, Book purchase"
              placeholderTextColor={COLORS.textMuted}
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={accent.hex}
              textColor={COLORS.textPrimary}
              style={styles.textInput}
            />
          </View>

          {/* Submit Button */}
          <TactileButton
            onPress={handleSubmit}
            style={[styles.submitBtn, { backgroundColor: accent.hex }]}
          >
            <Text style={styles.submitBtnText}>Save Transaction</Text>
          </TactileButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    paddingVertical: SPACING.xs,
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 48,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  errorBanner: {
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorBannerText: {
    color: COLORS.alert,
    fontSize: 13,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    marginBottom: SPACING.lg,
  },
  typeTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 6,
  },
  typeTabActive: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeTabText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  typeTabTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '800',
    marginRight: SPACING.xs,
  },
  amountInput: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 32,
    fontWeight: '800',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    gap: 6,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  categoryPill: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  categoryPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  quickDateBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 4,
  },
  quickDateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: COLORS.surface,
  },
  submitBtn: {
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  submitBtnText: {
    color: COLORS.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
});
