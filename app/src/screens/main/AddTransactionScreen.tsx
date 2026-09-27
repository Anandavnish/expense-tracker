import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, TYPOGRAPHY, ThemeColors, ACCOUNT_TYPE_COLORS } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { TransactionType } from '../../types/database';

interface AddTransactionScreenProps {
  navigation: any;
  route?: any;
}

const formatLocalDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getAccountIconProps = (acc: { type: string }) => {
  if (acc.type === 'credit_card') {
    return { name: 'card-outline' as const, color: ACCOUNT_TYPE_COLORS.credit_card };
  }
  if (acc.type === 'cash') {
    return { name: 'cash-outline' as const, color: ACCOUNT_TYPE_COLORS.cash };
  }
  return { name: 'business-outline' as const, color: ACCOUNT_TYPE_COLORS.bank };
};

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
  const { accent, colors, effectiveTheme } = useSettingsStore();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const {
    accounts,
    categories,
    addTransactionOptimistic,
    addBorrowOptimistic,
  } = useFinanceStore();

  const today = useMemo(() => new Date(), []);
  const minDate = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const maxDate = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59),
    [today]
  );
  const currentMonthName = useMemo(() => {
    return today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [today]);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(
    route?.params?.accountId || accounts[0]?.id || ''
  );
  const [category, setCategory] = useState(categories[0] || 'Food');
  const [note, setNote] = useState('');
  const [personName, setPersonName] = useState('');
  const [date, setDate] = useState(() => formatLocalDate(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveAccountId = selectedAccountId || route?.params?.accountId || accounts[0]?.id || '';
  const selectedAccount = accounts.find((a) => a.id === effectiveAccountId);
  const isCreditCard = selectedAccount?.type === 'credit_card';

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      if (selectedDate < minDate) {
        setDate(formatLocalDate(minDate));
      } else if (selectedDate > maxDate) {
        setDate(formatLocalDate(maxDate));
      } else {
        setDate(formatLocalDate(selectedDate));
      }
      setFormError(null);
    } else if (event.type === 'dismissed') {
      setShowDatePicker(false);
    }
  };

  const parsedDateObj = useMemo(() => {
    try {
      const [y, m, d] = date.split('-').map(Number);
      if (y && m && d) {
        return new Date(y, m - 1, d);
      }
      return today;
    } catch {
      return today;
    }
  }, [date, today]);

  const formattedDateLabel = useMemo(() => {
    try {
      const [y, m, d] = date.split('-').map(Number);
      const dObj = new Date(y, m - 1, d);
      const isToday = date === formatLocalDate(today);
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const isYesterday = date === formatLocalDate(yesterday);

      const baseStr = dObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      if (isToday) return `${baseStr} • Today`;
      if (isYesterday) return `${baseStr} • Yesterday`;
      return baseStr;
    } catch {
      return date;
    }
  }, [date, today]);

  const yesterdayInCurrentMonth = today.getDate() > 1;

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

    // Validate that transaction date falls within the current running month
    const [yStr, mStr] = date.split('-');
    const selYear = parseInt(yStr, 10);
    const selMonth = parseInt(mStr, 10);
    if (selYear !== today.getFullYear() || selMonth !== today.getMonth() + 1) {
      setFormError(
        `Transactions can only be logged for the current running month (${currentMonthName}).`
      );
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
                      active && item.key === 'expense' && { color: colors.alert },
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
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              textColor={colors.textPrimary}
              style={[styles.amountInput, TYPOGRAPHY.heroNumber]}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
            />
          </View>

          {/* 3. Account / Money Source Picker (Source to deduct from - Wrapping Grid) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MONEY SOURCE (DEDUCT FROM)</Text>
            <View style={styles.moneySourcesGrid}>
              {accounts.map((acc) => {
                const active = effectiveAccountId === acc.id;
                const iconProps = getAccountIconProps(acc);
                const isCard = acc.type === 'credit_card';
                const bal = Number(acc.current_balance || 0);
                const balText = isCard
                  ? bal < 0
                    ? `₹${Math.abs(bal).toLocaleString('en-IN')} Due`
                    : `₹0 Due`
                  : `₹${bal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

                return (
                  <TouchableOpacity
                    key={acc.id}
                    onPress={() => {
                      setFormError(null);
                      setSelectedAccountId(acc.id);
                    }}
                    activeOpacity={0.7}
                    style={[
                      styles.sourceCard,
                      active && {
                        borderColor: accent.hex,
                        backgroundColor: accent.hex + '14',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.sourceIconBadge,
                        { backgroundColor: iconProps.color + '18' },
                      ]}
                    >
                      <Ionicons
                        name={iconProps.name}
                        size={16}
                        color={active ? accent.hex : iconProps.color}
                      />
                    </View>

                    <View style={styles.sourceTextCol}>
                      <Text
                        style={[
                          styles.sourceName,
                          active && { color: colors.textPrimary, fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {acc.name}
                      </Text>
                      <Text
                        style={[
                          styles.sourceBalance,
                          TYPOGRAPHY.tabularText,
                          active && { color: accent.hex, fontWeight: '600' },
                        ]}
                        numberOfLines={1}
                      >
                        {balText}
                      </Text>
                    </View>

                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={accent.hex}
                        style={styles.sourceCheckIcon}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
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
                placeholderTextColor={colors.textMuted}
                mode="outlined"
                outlineColor={colors.border}
                activeOutlineColor={accent.hex}
                textColor={colors.textPrimary}
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

          {/* 5. Date & Calendar Picker (Restricted to Current Running Month) */}
          <View style={styles.section}>
            <View style={styles.dateHeader}>
              <Text style={styles.sectionLabel}>DATE (CURRENT MONTH ONLY)</Text>
              <View style={styles.quickDateRow}>
                <TouchableOpacity
                  onPress={() => {
                    setDate(formatLocalDate(today));
                    setFormError(null);
                  }}
                  style={[
                    styles.quickDateBtn,
                    date === formatLocalDate(today) && {
                      backgroundColor: accent.hex + '22',
                      borderColor: accent.hex,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickDateText,
                      { color: date === formatLocalDate(today) ? accent.hex : colors.textSecondary },
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>

                {yesterdayInCurrentMonth && (
                  <TouchableOpacity
                    onPress={() => {
                      const yesterday = new Date(
                        today.getFullYear(),
                        today.getMonth(),
                        today.getDate() - 1
                      );
                      setDate(formatLocalDate(yesterday));
                      setFormError(null);
                    }}
                    style={[
                      styles.quickDateBtn,
                      date ===
                        formatLocalDate(
                          new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
                        ) && {
                        backgroundColor: accent.hex + '22',
                        borderColor: accent.hex,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickDateText,
                        {
                          color:
                            date ===
                            formatLocalDate(
                              new Date(
                                today.getFullYear(),
                                today.getMonth(),
                                today.getDate() - 1
                              )
                            )
                              ? accent.hex
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      Yesterday
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Clickable Date Card that calls the native default calendar */}
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
              style={[
                styles.dateSelectorCard,
                showDatePicker && { borderColor: accent.hex, backgroundColor: accent.hex + '0A' },
              ]}
            >
              <View style={[styles.dateIconBadge, { backgroundColor: accent.hex + '18' }]}>
                <Ionicons name="calendar-outline" size={18} color={accent.hex} />
              </View>
              <View style={styles.dateTextCol}>
                <Text style={styles.dateSelectedText}>{formattedDateLabel}</Text>
                <Text style={styles.dateMonthRestrictionHint}>
                  {currentMonthName} (1st – {maxDate.getDate()}th only)
                </Text>
              </View>
              <View style={[styles.dateChangeBadge, { borderColor: accent.hex + '40' }]}>
                <Text style={[styles.dateChangeBadgeText, { color: accent.hex }]}>Pick Date</Text>
                <Ionicons name="calendar" size={13} color={accent.hex} />
              </View>
            </TouchableOpacity>

            {/* Native Calendar Picker Dialog */}
            {showDatePicker &&
              (Platform.OS === 'ios' ? (
                <Modal
                  transparent
                  animationType="fade"
                  visible={showDatePicker}
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <View style={styles.datePickerModalBackdrop}>
                    <View style={styles.datePickerModalCard}>
                      <View style={styles.datePickerModalHeader}>
                        <Text style={styles.datePickerModalTitle}>
                          Select Date • {currentMonthName}
                        </Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={[styles.datePickerModalDoneText, { color: accent.hex }]}>
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={parsedDateObj}
                        mode="date"
                        display="inline"
                        minimumDate={minDate}
                        maximumDate={maxDate}
                        themeVariant={effectiveTheme === 'light' ? 'light' : 'dark'}
                        onChange={handleDateChange}
                      />
                    </View>
                  </View>
                </Modal>
              ) : (
                <DateTimePicker
                  value={parsedDateObj}
                  mode="date"
                  display="default"
                  minimumDate={minDate}
                  maximumDate={maxDate}
                  onChange={handleDateChange}
                />
              ))}
          </View>

          {/* 6. Note (Optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Lunch with friends, Book purchase"
              placeholderTextColor={colors.textMuted}
              mode="outlined"
              outlineColor={colors.border}
              activeOutlineColor={accent.hex}
              textColor={colors.textPrimary}
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

function getStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      paddingVertical: SPACING.xs,
    },
    backText: {
      fontSize: 15,
      fontWeight: '700',
    },
    headerTitle: {
      color: colors.textPrimary,
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
      backgroundColor: colors.alertMuted,
      borderColor: colors.alert,
      borderWidth: 1,
      borderRadius: 8,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    errorBannerText: {
      color: colors.alert,
      fontSize: 13,
    },
    typeSelector: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeTabText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    typeTabTextActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    amountContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
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
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: SPACING.sm,
    },
    moneySourcesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    sourceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minWidth: '47%',
      flex: 1,
      gap: 8,
    },
    sourceIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sourceTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    sourceName: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    sourceBalance: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 1,
    },
    sourceCheckIcon: {
      marginLeft: 2,
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    categoryPill: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    categoryPillText: {
      color: colors.textSecondary,
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
      paddingVertical: 4,
      backgroundColor: colors.surfaceLight,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    quickDateText: {
      fontSize: 11,
      fontWeight: '600',
    },
    dateSelectorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 12,
    },
    dateIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    dateSelectedText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    dateMonthRestrictionHint: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    dateChangeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      backgroundColor: colors.surfaceLight,
    },
    dateChangeBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    datePickerModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    datePickerModalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: SPACING.md,
    },
    datePickerModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    datePickerModalTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    datePickerModalDoneText: {
      fontSize: 14,
      fontWeight: '700',
    },
    textInput: {
      backgroundColor: colors.surface,
    },
    submitBtn: {
      borderRadius: 8,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    submitBtnText: {
      color: colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
