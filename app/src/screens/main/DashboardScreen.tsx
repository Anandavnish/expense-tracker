// src/screens/main/DashboardScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ProgressBar, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { Account, AccountType, BankPreset } from '../../types/database';

interface DashboardScreenProps {
  navigation: any;
}

const BANK_PRESETS: { name: BankPreset; label: string; code: string }[] = [
  { name: 'HDFC', label: 'HDFC Bank', code: 'HDFC' },
  { name: 'SBI', label: 'State Bank of India', code: 'SBI' },
  { name: 'ICICI', label: 'ICICI Bank', code: 'ICICI' },
  { name: 'Axis', label: 'Axis Bank', code: 'AXIS' },
  { name: 'Kotak', label: 'Kotak Mahindra', code: 'KOTAK' },
  { name: 'Other', label: 'Other Bank', code: 'BANK' },
];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const { user } = useAuthStore();
  const { accent } = useSettingsStore();
  const {
    accounts,
    transactions,
    borrows,
    budgetSummaries,
    selectedMonth,
    categories,
    setSelectedMonth,
    fetchInitialData,
    createAccountOptimistic,
    updateAccountOptimistic,
    deleteAccountOptimistic,
    calibrateAccountBalance,
    addCategory,
    removeCategory,
    reorderCategories,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  const [refreshing, setRefreshing] = useState(false);

  // Manage Money Sources State
  const [sourcesManageVisible, setSourcesManageVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AccountType>('bank');
  const [editBankPreset, setEditBankPreset] = useState<BankPreset>('HDFC');
  const [editBalance, setEditBalance] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [isAddingNewSource, setIsAddingNewSource] = useState(false);

  // Calibration Confirmation Dialog State
  const [calibrationPending, setCalibrationPending] = useState<{
    account: Account;
    newBalance: number;
    difference: number;
  } | null>(null);

  // Manage Categories State
  const [categoriesManageVisible, setCategoriesManageVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const onRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await fetchInitialData(user.id);
    setRefreshing(false);
  };

  // Month navigation logic
  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) - 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    setSelectedMonth(newMonth, user?.id);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const newMonth = `${year}-${String(month).padStart(2, '0')}`;
    setSelectedMonth(newMonth, user?.id);
  };

  const formattedMonthLabel = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Calculations for Net Worth Formula:
  // Amount1 = SUM(all bank accounts + cash)
  const liquidAccounts = accounts.filter(
    (a) => a.type === 'bank' || a.type === 'cash'
  );
  const liquidTotal = liquidAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance || 0),
    0
  );

  // Lent & Borrowed adjustments
  const pendingBorrows = borrows.filter((b) => b.status === 'pending');
  // For borrows: linked transactions or types determine lent vs borrowed
  // A positive borrow given is lent; taken is borrowed
  const totalLent = pendingBorrows.reduce(
    (sum, b) => sum + Number(b.amount || 0),
    0
  );
  const totalBorrowed = 0; // If user owes, tracked accordingly; currently pending borrows are lent

  // Unused credit limit = SUM(credit_limit - current_balance) for credit_card accounts
  const creditAccounts = accounts.filter((a) => a.type === 'credit_card');
  const unusedCredit = creditAccounts.reduce((sum, a) => {
    const limit = Number(a.credit_limit || 0);
    const used = Number(a.current_balance || 0);
    return sum + Math.max(0, limit - used);
  }, 0);

  // Fuller Net Worth Total
  const fullNetWorth = liquidTotal + totalLent - totalBorrowed + unusedCredit;

  // This Month's Budget
  const overallBudget =
    budgetSummaries.find((b) => b.category === null) || budgetSummaries[0] || null;

  const budgetSpent = overallBudget ? Number(overallBudget.spent) : 0;
  const budgetLimit = overallBudget ? Number(overallBudget.monthly_limit) : 0;
  const budgetRemaining = overallBudget ? Number(overallBudget.remaining) : 0;
  const budgetPct = overallBudget
    ? Math.min(Number(overallBudget.spent_percentage) / 100, 1)
    : 0;

  const budgetColor =
    budgetPct >= 1 ? COLORS.alert : budgetPct > 0.8 ? COLORS.warning : accent.value;

  // Category spending for selected month
  const categorySpendingMap = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach((cat) => {
      map[cat] = 0;
    });

    // Check budgetSummaries first
    budgetSummaries.forEach((bs) => {
      if (bs.category) {
        map[bs.category] = Number(bs.spent || 0);
      }
    });

    // Also scan transactions for that month to capture all categories
    transactions.forEach((tx) => {
      if (tx.type === 'expense' && tx.date.startsWith(selectedMonth)) {
        if (map[tx.category] !== undefined) {
          if (!budgetSummaries.some((bs) => bs.category === tx.category)) {
            map[tx.category] += Number(tx.amount);
          }
        } else {
          map[tx.category] = (map[tx.category] || 0) + Number(tx.amount);
        }
      }
    });

    return map;
  }, [categories, budgetSummaries, transactions, selectedMonth]);

  // Max spend for category progress relative calculation
  const maxCategorySpend = useMemo(() => {
    const vals = Object.values(categorySpendingMap);
    return Math.max(1, ...vals);
  }, [categorySpendingMap]);

  // Handle Save or Edit Source
  const handleOpenEditSource = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      setEditName(account.name);
      setEditType(account.type);
      setEditBankPreset((account.bank_preset as BankPreset) || 'HDFC');
      setEditBalance(String(account.current_balance));
      setEditCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
      setIsAddingNewSource(false);
    } else {
      setEditingAccount(null);
      setEditName('');
      setEditType('bank');
      setEditBankPreset('HDFC');
      setEditBalance('0');
      setEditCreditLimit('');
      setIsAddingNewSource(true);
    }
  };

  const handleSaveSource = async () => {
    if (!user || !editName.trim()) return;

    const parsedBalance = parseFloat(editBalance) || 0;
    const parsedLimit = editCreditLimit ? parseFloat(editCreditLimit) || null : null;

    if (isAddingNewSource) {
      await createAccountOptimistic({
        user_id: user.id,
        name: editName.trim(),
        type: editType,
        current_balance: parsedBalance,
        credit_limit: parsedLimit,
        bank_preset: editType === 'bank' ? editBankPreset : null,
      });
      setEditingAccount(null);
      setIsAddingNewSource(false);
    } else if (editingAccount) {
      const oldBalance = Number(editingAccount.current_balance);
      const diff = parsedBalance - oldBalance;

      // Update name, type, limit first
      await updateAccountOptimistic(editingAccount.id, {
        name: editName.trim(),
        type: editType,
        credit_limit: parsedLimit,
        bank_preset: editType === 'bank' ? editBankPreset : null,
      });

      // Check if balance changed -> CALIBRATION FLOW
      if (Math.abs(diff) > 0.01) {
        setCalibrationPending({
          account: editingAccount,
          newBalance: parsedBalance,
          difference: diff,
        });
      }

      setEditingAccount(null);
    }
  };

  const handleCalibrationChoice = async (logAsTransaction: boolean) => {
    if (!user || !calibrationPending) return;
    const { account, newBalance } = calibrationPending;

    await calibrateAccountBalance(
      account.id,
      newBalance,
      logAsTransaction,
      user.id
    );

    setCalibrationPending(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* 1. Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.appName}>Finance Tracker</Text>
        <View style={styles.topRightActions}>
          <View style={[styles.avatarPill, { borderColor: accent.value }]}>
            <Text style={[styles.avatarText, { color: accent.value }]}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsIconBtn}
          >
            <Text style={styles.settingsIconText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Month Selector */}
      <View style={styles.monthSelectorBar}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn}>
          <Text style={[styles.arrowText, { color: accent.value }]}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabelText}>{formattedMonthLabel}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.arrowBtn}>
          <Text style={[styles.arrowText, { color: accent.value }]}>›</Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent.value}
            colors={[accent.value]}
          />
        }
      >
        {/* 3. CURRENT TOTAL NET WORTH Card (Formula Layout) */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderLabel}>CURRENT TOTAL NET WORTH</Text>

          <View style={styles.formulaRow}>
            {/* Amount 1: Liquid Total */}
            <Text style={[styles.formulaBigNumber, TYPOGRAPHY.heroNumber]}>
              ₹{liquidTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>

            {/* Adjustments (inline small terms) */}
            {totalLent > 0 && (
              <Text
                style={[
                  styles.formulaSmallTerm,
                  TYPOGRAPHY.tabularText,
                  { color: accent.value },
                ]}
              >
                +₹{totalLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            )}

            {totalBorrowed > 0 && (
              <Text
                style={[
                  styles.formulaSmallTerm,
                  TYPOGRAPHY.tabularText,
                  { color: COLORS.alert },
                ]}
              >
                −₹{totalBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            )}

            {unusedCredit > 0 && (
              <Text
                style={[
                  styles.formulaSmallTerm,
                  TYPOGRAPHY.tabularText,
                  { color: accent.value },
                ]}
              >
                +₹{unusedCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            )}

            {/* Big Final Total */}
            <Text
              style={[
                styles.formulaFinalNumber,
                TYPOGRAPHY.heroNumber,
                { color: accent.value },
              ]}
            >
              = ₹{fullNetWorth.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>

        {/* 4. This Month's Budget Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>THIS MONTH'S BUDGET</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Budgets')}>
              <Text style={[styles.cardHeaderAction, { color: accent.value }]}>
                {budgetLimit > 0 ? 'Edit' : '+ Set'}
              </Text>
            </TouchableOpacity>
          </View>

          {budgetLimit > 0 ? (
            <View style={styles.budgetContent}>
              <Text style={styles.budgetStatusLine}>
                ₹{budgetSpent.toLocaleString('en-IN')} spent of ₹
                {budgetLimit.toLocaleString('en-IN')}
              </Text>

              <ProgressBar
                progress={budgetPct}
                color={budgetColor}
                style={styles.budgetProgressBar}
              />

              <View style={styles.budgetMetaRow}>
                <Text style={styles.budgetRemainingLabel}>
                  Remaining:{' '}
                  <Text
                    style={[
                      TYPOGRAPHY.tabularText,
                      { color: budgetRemaining >= 0 ? accent.value : COLORS.alert },
                    ]}
                  >
                    ₹{budgetRemaining.toLocaleString('en-IN')}
                  </Text>
                </Text>
                <Text
                  style={[
                    styles.budgetPercentText,
                    TYPOGRAPHY.tabularText,
                    { color: budgetColor },
                  ]}
                >
                  {Math.round(budgetPct * 100)}%
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCardContent}>
              <Text style={styles.emptyCardText}>No budget configured for this month.</Text>
            </View>
          )}
        </View>

        {/* 5. Money Sources Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>MONEY SOURCES</Text>
            <TouchableOpacity
              onPress={() => setSourcesManageVisible(true)}
              style={styles.manageIconBtn}
            >
              <Text style={styles.manageIconText}>⚙</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sourcesList}>
            {/* Cash & Bank Accounts */}
            {accounts
              .filter((a) => a.type !== 'credit_card')
              .map((acc) => (
                <View key={acc.id} style={styles.sourceRow}>
                  <View style={styles.sourceLeft}>
                    <View style={styles.sourceIconBadge}>
                      <Text style={styles.sourceIconText}>
                        {acc.type === 'cash' ? '💵' : '🏦'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.sourceName}>{acc.name}</Text>
                      {acc.bank_preset && (
                        <Text style={styles.sourceSub}>{acc.bank_preset}</Text>
                      )}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.sourceAmount,
                      TYPOGRAPHY.tabularText,
                      {
                        color:
                          Number(acc.current_balance) >= 0
                            ? COLORS.textPrimary
                            : COLORS.alert,
                      },
                    ]}
                  >
                    ₹
                    {Number(acc.current_balance).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              ))}

            {/* Lent & Borrow Net Row */}
            <View style={styles.sourceRow}>
              <View style={styles.sourceLeft}>
                <View style={styles.sourceIconBadge}>
                  <Text style={styles.sourceIconText}>🤝</Text>
                </View>
                <View>
                  <Text style={styles.sourceName}>Lent & Borrow (Net)</Text>
                  <Text style={styles.sourceSub}>
                    Lent: ₹{totalLent.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.sourceAmount,
                  TYPOGRAPHY.tabularText,
                  { color: totalLent >= 0 ? accent.value : COLORS.alert },
                ]}
              >
                ₹
                {(totalLent - totalBorrowed).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </View>

            {/* Credit Card Accounts */}
            {creditAccounts.map((card) => {
              const used = Number(card.current_balance || 0);
              const limit = Number(card.credit_limit || 0);
              const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
              return (
                <View key={card.id} style={styles.creditCardSourceRow}>
                  <View style={styles.sourceRow}>
                    <View style={styles.sourceLeft}>
                      <View style={styles.sourceIconBadge}>
                        <Text style={styles.sourceIconText}>💳</Text>
                      </View>
                      <Text style={styles.sourceName}>{card.name}</Text>
                    </View>
                    <Text style={[styles.sourceAmount, TYPOGRAPHY.tabularText]}>
                      ₹{used.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={pct}
                    color={pct > 0.8 ? COLORS.alert : accent.value}
                    style={styles.creditProgressBar}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* 6. Spending by Category Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithAction}>
            <Text style={styles.cardHeaderLabel}>SPENDING BY CATEGORY</Text>
            <TouchableOpacity
              onPress={() => setCategoriesManageVisible(true)}
              style={styles.manageIconBtn}
            >
              <Text style={styles.manageIconText}>⚙</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.categoriesList}>
            {categories.map((cat) => {
              const spent = categorySpendingMap[cat] || 0;
              const ratio = maxCategorySpend > 0 ? spent / maxCategorySpend : 0;

              return (
                <View key={cat} style={styles.categorySpendRow}>
                  <View style={styles.categorySpendHeader}>
                    <Text style={styles.categorySpendName}>{cat}</Text>
                    <Text style={[styles.categorySpendAmount, TYPOGRAPHY.tabularText]}>
                      ₹{spent.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={ratio}
                    color={spent > 0 ? accent.value : COLORS.border}
                    style={styles.categoryProgressBar}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* 7. Floating Circular "+" Button */}
      <TactileButton
        onPress={() => navigation.navigate('AddTransaction')}
        style={[styles.floatingAddBtn, { backgroundColor: accent.value }]}
      >
        <Text style={styles.floatingAddBtnText}>+</Text>
      </TactileButton>

      {/* CALIBRATION CONFIRMATION MODAL */}
      <Modal
        visible={!!calibrationPending}
        transparent
        animationType="fade"
        onRequestClose={() => setCalibrationPending(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CALIBRATE BALANCE</Text>
            {calibrationPending && (
              <Text style={styles.modalBodyText}>
                Balance changed from ₹
                {Number(calibrationPending.account.current_balance).toLocaleString('en-IN')}{' '}
                to ₹{calibrationPending.newBalance.toLocaleString('en-IN')} — a difference
                of ₹{Math.abs(calibrationPending.difference).toLocaleString('en-IN')}.
                {'\n\n'}Log this as an Adjustment transaction in your history?
              </Text>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                onPress={() => handleCalibrationChoice(false)}
                style={styles.modalSecondaryBtn}
              >
                <Text style={styles.modalSecondaryBtnText}>Just adjust</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleCalibrationChoice(true)}
                style={[styles.modalPrimaryBtn, { backgroundColor: accent.value }]}
              >
                <Text style={styles.modalPrimaryBtnText}>Yes, log it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MANAGE SOURCES MODAL */}
      <Modal
        visible={sourcesManageVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSourcesManageVisible(false);
          setEditingAccount(null);
          setIsAddingNewSource(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'android' ? undefined : 'padding'}
          style={styles.modalBackdrop}
        >
          <View style={styles.manageSourcesModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>
                {editingAccount || isAddingNewSource
                  ? isAddingNewSource
                    ? 'NEW MONEY SOURCE'
                    : 'EDIT SOURCE'
                  : 'MANAGE MONEY SOURCES'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSourcesManageVisible(false);
                  setEditingAccount(null);
                  setIsAddingNewSource(false);
                }}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {editingAccount || isAddingNewSource ? (
              <ScrollView style={styles.modalEditForm}>
                <Text style={styles.inputLabel}>SOURCE NAME</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. Salary Account, Cash Wallet"
                  mode="outlined"
                  outlineColor={COLORS.border}
                  activeOutlineColor={accent.value}
                  textColor={COLORS.textPrimary}
                  style={styles.modalInput}
                />

                <Text style={styles.inputLabel}>TYPE</Text>
                <View style={styles.typeToggleRow}>
                  {(['bank', 'cash', 'credit_card'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setEditType(t)}
                      style={[
                        styles.typeToggleBtn,
                        editType === t && { borderColor: accent.value, backgroundColor: COLORS.surfaceLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeToggleBtnText,
                          editType === t && { color: accent.value, fontWeight: '700' },
                        ]}
                      >
                        {t === 'credit_card' ? 'Credit Card' : t.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editType === 'bank' && (
                  <>
                    <Text style={styles.inputLabel}>BANK PRESET</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
                      {BANK_PRESETS.map((p) => (
                        <TouchableOpacity
                          key={p.name}
                          onPress={() => setEditBankPreset(p.name)}
                          style={[
                            styles.presetChip,
                            editBankPreset === p.name && {
                              borderColor: accent.value,
                              backgroundColor: accent.muted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              editBankPreset === p.name && { color: accent.value, fontWeight: '700' },
                            ]}
                          >
                            {p.code}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={styles.inputLabel}>BALANCE (₹)</Text>
                <TextInput
                  value={editBalance}
                  onChangeText={setEditBalance}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  mode="outlined"
                  outlineColor={COLORS.border}
                  activeOutlineColor={accent.value}
                  textColor={COLORS.textPrimary}
                  style={styles.modalInput}
                />

                {editType === 'credit_card' && (
                  <>
                    <Text style={styles.inputLabel}>CREDIT LIMIT (₹)</Text>
                    <TextInput
                      value={editCreditLimit}
                      onChangeText={setEditCreditLimit}
                      placeholder="e.g. 50000"
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={COLORS.border}
                      activeOutlineColor={accent.value}
                      textColor={COLORS.textPrimary}
                      style={styles.modalInput}
                    />
                  </>
                )}

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingAccount(null);
                      setIsAddingNewSource(false);
                    }}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveSource}
                    style={[styles.saveSourceBtn, { backgroundColor: accent.value }]}
                  >
                    <Text style={styles.saveSourceBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={styles.sourcesListModal}>
                {accounts.map((acc) => (
                  <View key={acc.id} style={styles.manageSourceItem}>
                    <View style={styles.manageSourceItemLeft}>
                      <Text style={styles.manageSourceItemName}>{acc.name}</Text>
                      <Text style={styles.manageSourceItemSub}>
                        {acc.type.toUpperCase()} • ₹{Number(acc.current_balance).toLocaleString('en-IN')}
                      </Text>
                    </View>

                    <View style={styles.manageSourceItemActions}>
                      <TouchableOpacity
                        onPress={() => handleOpenEditSource(acc)}
                        style={styles.editSourceBtn}
                      >
                        <Text style={styles.editSourceBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteAccountOptimistic(acc.id)}
                        style={styles.deleteSourceBtn}
                      >
                        <Text style={styles.deleteSourceBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={() => handleOpenEditSource()}
                  style={[styles.addSourceBtn, { borderColor: accent.value }]}
                >
                  <Text style={[styles.addSourceBtnText, { color: accent.value }]}>
                    + Add New Source
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MANAGE CATEGORIES MODAL */}
      <Modal
        visible={categoriesManageVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoriesManageVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.manageCategoriesModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>MANAGE CATEGORIES</Text>
              <TouchableOpacity onPress={() => setCategoriesManageVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.newCategoryRow}>
              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="New category name"
                placeholderTextColor={COLORS.textMuted}
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={accent.value}
                textColor={COLORS.textPrimary}
                style={styles.newCatInput}
              />
              <TouchableOpacity
                onPress={() => {
                  if (newCategoryName.trim()) {
                    addCategory(newCategoryName.trim());
                    setNewCategoryName('');
                  }
                }}
                style={[styles.addCatBtn, { backgroundColor: accent.value }]}
              >
                <Text style={styles.addCatBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.categoriesModalList}>
              {categories.map((cat, idx) => (
                <View key={cat} style={styles.categoryItemRow}>
                  <Text style={styles.categoryItemName}>{cat}</Text>
                  <View style={styles.categoryItemActions}>
                    {idx > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          const copy = [...categories];
                          const temp = copy[idx - 1];
                          copy[idx - 1] = copy[idx];
                          copy[idx] = temp;
                          reorderCategories(copy);
                        }}
                        style={styles.reorderBtn}
                      >
                        <Text style={styles.reorderBtnText}>↑</Text>
                      </TouchableOpacity>
                    )}
                    {idx < categories.length - 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          const copy = [...categories];
                          const temp = copy[idx + 1];
                          copy[idx + 1] = copy[idx];
                          copy[idx] = temp;
                          reorderCategories(copy);
                        }}
                        style={styles.reorderBtn}
                      >
                        <Text style={styles.reorderBtnText}>↓</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => removeCategory(cat)}
                      style={styles.removeCatBtn}
                    >
                      <Text style={styles.removeCatBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appName: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  avatarPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
  },
  settingsIconBtn: {
    padding: SPACING.xs,
  },
  settingsIconText: {
    color: COLORS.textSecondary,
    fontSize: 20,
  },
  monthSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.lg,
  },
  arrowBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
  },
  arrowText: {
    fontSize: 20,
    fontWeight: '800',
  },
  monthLabelText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100, // Space for floating button
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeaderLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cardHeaderAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  manageIconBtn: {
    padding: SPACING.xs,
  },
  manageIconText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  formulaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  formulaBigNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  formulaSmallTerm: {
    fontSize: 13,
    fontWeight: '700',
  },
  formulaFinalNumber: {
    fontSize: 24,
    fontWeight: '800',
  },
  budgetContent: {
    marginTop: SPACING.xs,
  },
  budgetStatusLine: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  budgetProgressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.xs,
  },
  budgetMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  budgetRemainingLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  budgetPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCardContent: {
    paddingVertical: SPACING.sm,
  },
  emptyCardText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  sourcesList: {
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sourceIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sourceIconText: {
    fontSize: 16,
  },
  sourceName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  sourceSub: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  sourceAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  creditCardSourceRow: {
    gap: 4,
  },
  creditProgressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceLight,
    marginTop: 2,
  },
  categoriesList: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  categorySpendRow: {
    gap: 2,
  },
  categorySpendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categorySpendName: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  categorySpendAmount: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryProgressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
  },
  floatingAddBtn: {
    position: 'absolute',
    bottom: SPACING.xl,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  floatingAddBtnText: {
    color: COLORS.textInverse,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 34,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  modalBodyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalSecondaryBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSecondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalPrimaryBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  modalPrimaryBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  manageSourcesModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  manageCategoriesModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalCloseText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    padding: SPACING.xs,
  },
  modalEditForm: {
    maxHeight: 450,
  },
  inputLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  modalInput: {
    backgroundColor: COLORS.surfaceLight,
    marginBottom: SPACING.xs,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeToggleBtnText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  presetScroll: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  presetChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
    marginRight: SPACING.xs,
  },
  presetChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  saveSourceBtn: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  saveSourceBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  sourcesListModal: {
    maxHeight: 350,
  },
  manageSourceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  manageSourceItemLeft: {
    flex: 1,
  },
  manageSourceItemName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  manageSourceItemSub: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  manageSourceItemActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  editSourceBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editSourceBtnText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  deleteSourceBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: COLORS.alertMuted,
  },
  deleteSourceBtnText: {
    color: COLORS.alert,
    fontSize: 11,
    fontWeight: '700',
  },
  addSourceBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addSourceBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  newCategoryRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  newCatInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  addCatBtn: {
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    borderRadius: 6,
  },
  addCatBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  categoriesModalList: {
    maxHeight: 300,
  },
  categoryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  categoryItemName: {
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  categoryItemActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  reorderBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 4,
  },
  reorderBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  removeCatBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: COLORS.alertMuted,
    borderRadius: 4,
  },
  removeCatBtnText: {
    color: COLORS.alert,
    fontSize: 11,
  },
});
