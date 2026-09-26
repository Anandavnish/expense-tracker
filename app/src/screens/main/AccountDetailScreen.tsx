import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { TransactionRow } from '../../components/TransactionRow';
import { TransactionType, AccountType, BankPreset } from '../../types/database';

interface AccountDetailScreenProps {
  navigation?: any;
  route?: {
    params?: {
      accountId?: string;
    };
  };
}

const BANK_PRESETS: { name: BankPreset; code: string }[] = [
  { name: 'SBI', code: 'SBI' },
  { name: 'India Post', code: 'India Post' },
  { name: 'HDFC', code: 'HDFC' },
  { name: 'Canara', code: 'Canara' },
  { name: 'PNB', code: 'PNB' },
  { name: 'BOB', code: 'BOB' },
  { name: 'Custom', code: 'Custom' },
];

export const AccountDetailScreen: React.FC<AccountDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { accent, colors } = useSettingsStore();
  const accountId = route?.params?.accountId;

  const {
    accounts,
    transactions,
    calibrateAccountBalance,
    updateAccountOptimistic,
    deleteAccountWithCalibration,
    payCreditCardBill,
  } = useFinanceStore();

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const liquidAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'bank' || a.type === 'cash'),
    [accounts]
  );

  // Filter transactions strictly for this account
  const accountTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.account_id === accountId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, accountId]);

  // Transaction filter: 'all' | 'expense' | 'income'
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');

  const filteredTransactions = useMemo(() => {
    if (filterType === 'all') return accountTransactions;
    return accountTransactions.filter((t) => t.type === filterType);
  }, [accountTransactions, filterType]);

  // Computed account stats
  const totalInflow = useMemo(() => {
    return accountTransactions
      .filter((t) => t.type === 'income' || t.type === 'borrow_taken')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [accountTransactions]);

  const totalOutflow = useMemo(() => {
    return accountTransactions
      .filter((t) => t.type === 'expense' || t.type === 'borrow_given')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [accountTransactions]);

  // Comprehensive Edit Modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<AccountType>('bank');
  const [editBankPreset, setEditBankPreset] = useState<BankPreset>('HDFC');
  const [editBalance, setEditBalance] = useState('0');
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Pay Bill Modal State
  const [payBillModalVisible, setPayBillModalVisible] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paySourceAccountId, setPaySourceAccountId] = useState('');
  const [isPayingBill, setIsPayingBill] = useState(false);

  // Delete Confirmation Modal State (with Calibration Warning)
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenPayBill = () => {
    if (!account) return;
    const spent = Math.abs(Math.min(0, Number(account.current_balance || 0)));
    setPayAmount(spent > 0 ? String(spent) : '');
    setPaySourceAccountId(liquidAccounts[0]?.id || '');
    setPayBillModalVisible(true);
  };

  const handleConfirmPayBill = async () => {
    if (!user || !account || !paySourceAccountId) return;
    const numAmount = parseFloat(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    setIsPayingBill(true);
    const res = await payCreditCardBill(
      account.id,
      paySourceAccountId,
      numAmount,
      user.id
    );
    setIsPayingBill(false);
    if (res.success) {
      setPayBillModalVisible(false);
    }
  };

  const openEditModal = () => {
    if (!account) return;
    setEditName(account.name || '');
    setEditType(account.type);
    setEditBankPreset((account.bank_preset as BankPreset) || 'HDFC');
    if (account.type === 'credit_card') {
      const outstanding = Math.abs(Math.min(0, Number(account.current_balance || 0)));
      setEditBalance(String(outstanding));
    } else {
      setEditBalance(String(account.current_balance));
    }
    setEditCreditLimit(account.credit_limit ? String(account.credit_limit) : '');
    setEditModalVisible(true);
  };

  const handleSaveAccountEdit = async (logAsTransaction: boolean) => {
    if (!user || !account) return;
    setIsSavingEdit(true);

    const fallbackName =
      editType === 'bank'
        ? editBankPreset ? `Bank (${editBankPreset})` : 'Bank'
        : editType === 'credit_card'
        ? 'Credit Card'
        : 'Cash';

    const finalName = editName.trim() || fallbackName;
    const parsedLimit = editCreditLimit ? parseFloat(editCreditLimit) || null : null;
    const rawVal = parseFloat(editBalance) || 0;
    const parsedBalance = editType === 'credit_card' ? -Math.abs(rawVal) : rawVal;
    const oldBalance = Number(account.current_balance);
    const balanceChanged = Math.abs(parsedBalance - oldBalance) > 0.01;

    // 1. Update name, type, limit, preset
    await updateAccountOptimistic(account.id, {
      name: finalName,
      type: editType,
      credit_limit: parsedLimit,
      bank_preset: editType === 'bank' ? editBankPreset : null,
    });

    // 2. If balance changed, calibrate it
    if (balanceChanged) {
      await calibrateAccountBalance(account.id, parsedBalance, logAsTransaction, user.id);
    }

    setIsSavingEdit(false);
    setEditModalVisible(false);
  };

  const handleOpenDeleteConfirm = () => {
    setDeleteConfirmModalVisible(true);
  };

  const handleConfirmDelete = async (calibrateFirst: boolean) => {
    if (!account || !user) return;
    setIsDeleting(true);
    const res = await deleteAccountWithCalibration(account.id, user.id, calibrateFirst);
    setIsDeleting(false);
    if (res.success) {
      setDeleteConfirmModalVisible(false);
      setEditModalVisible(false);
      navigation?.goBack();
    }
  };

  if (!account) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ACCOUNT DETAILS</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.notFoundContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.notFoundText}>Account not found or was removed.</Text>
          <TactileButton
            onPress={() => navigation.goBack()}
            style={[styles.primaryBtn, { backgroundColor: accent.hex }]}
          >
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TactileButton>
        </View>
      </View>
    );
  }

  const isCreditCard = account.type === 'credit_card';
  const isCash = account.type === 'cash';

  // Credit card specific numbers
  const limit = Number(account.credit_limit || 0);
  const spent = Math.abs(Math.min(0, Number(account.current_balance || 0)));
  const availableCredit = Math.max(0, limit - spent);
  const isOverspent = spent > limit;
  const usedRatio = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const barColor = isOverspent ? COLORS.alert : usedRatio > 0.8 ? COLORS.warning : accent.hex;

  const typeLabel =
    account.type === 'bank'
      ? account.bank_preset ? `Bank · ${account.bank_preset}` : 'Bank Account'
      : account.type === 'credit_card'
      ? 'Credit Card'
      : 'Cash Wallet';

  const displayTitle = account.name?.trim() || typeLabel;
  const displaySubtitle = account.name?.trim() ? typeLabel : null;


  const accountBalanceNum = Number(account.current_balance || 0);
  const hasNonZeroBalance = Math.abs(accountBalanceNum) > 0.01;

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {/* 1. Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ACCOUNT DETAILS</Text>
        <TouchableOpacity
          onPress={openEditModal}
          style={styles.actionHeaderBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="pencil-outline" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Account Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.accountIdentity}>
              <View style={[styles.accountIconBadge, { backgroundColor: COLORS.surfaceLight }]}>
                <Ionicons
                  name={
                    isCreditCard
                      ? 'card-outline'
                      : isCash
                      ? 'cash-outline'
                      : 'business-outline'
                  }
                  size={24}
                  color={accent.hex}
                />
              </View>
              <View>
                <Text style={styles.accountNameText}>{displayTitle}</Text>
                {displaySubtitle ? (
                  <View style={styles.accountBadgeRow}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>
                        {displaySubtitle.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Balance / Credit Metrics */}
          {isCreditCard ? (
            <View style={styles.creditCardDetailsBox}>
              <View style={styles.balanceHeaderRow}>
                <View>
                  <Text style={styles.balanceLabel}>AVAILABLE CREDIT (LEFT)</Text>
                  <Text style={[styles.heroBalanceText, TYPOGRAPHY.tabularText]}>
                    ₹{availableCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.balanceLabel}>USED / LIMIT</Text>
                  <Text style={[styles.creditLimitText, TYPOGRAPHY.tabularText]}>
                    ₹{spent.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / ₹{limit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <ProgressBar
                  progress={usedRatio}
                  color={barColor}
                  style={styles.progressBar}
                />
                <View style={styles.progressSubRow}>
                  <Text style={styles.progressSubText}>
                    Left: ₹{availableCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={[styles.progressSubText, { color: barColor }]}>
                    {isOverspent
                      ? 'Over Limit'
                      : `${Math.round(usedRatio * 100)}% used`}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.standardBalanceBox}>
              <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
              <Text
                style={[
                  styles.heroBalanceText,
                  TYPOGRAPHY.tabularText,
                  {
                    color:
                      Number(account.current_balance) >= 0
                        ? COLORS.textPrimary
                        : COLORS.alert,
                  },
                ]}
              >
                ₹
                {Number(account.current_balance).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          )}

          {/* Account Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TOTAL INFLOW</Text>
              <Text
                style={[
                  styles.statValue,
                  TYPOGRAPHY.tabularText,
                  { color: accent.hex },
                ]}
              >
                +₹{totalInflow.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TOTAL OUTFLOW</Text>
              <Text
                style={[
                  styles.statValue,
                  TYPOGRAPHY.tabularText,
                  { color: colors.textPrimary },
                ]}
              >
                −₹{totalOutflow.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TRANSACTIONS</Text>
              <Text style={[styles.statValue, TYPOGRAPHY.tabularText]}>
                {accountTransactions.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions Row */}
        <View style={styles.quickActionsContainer}>
          {isCreditCard && spent > 0 ? (
            <TouchableOpacity
              style={[
                styles.quickActionButton,
                { borderColor: accent.hex, backgroundColor: accent.hex + '15' },
              ]}
              onPress={handleOpenPayBill}
              activeOpacity={0.7}
            >
              <Ionicons name="wallet-outline" size={18} color={accent.hex} />
              <Text style={[styles.quickActionText, { color: accent.hex, fontWeight: '700' }]}>
                Pay Card Bill
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.quickActionButton, !isCreditCard && { borderColor: accent.hex }]}
            onPress={() =>
              navigation.navigate('AddTransaction', { accountId: account.id })
            }
            activeOpacity={0.7}
          >
            <Ionicons
              name="add"
              size={18}
              color={!isCreditCard ? accent.hex : COLORS.textSecondary}
            />
            <Text
              style={[
                styles.quickActionText,
                !isCreditCard && { color: accent.hex },
              ]}
            >
              {isCreditCard ? '+ Expense' : 'Add Transaction'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={openEditModal}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.quickActionText}>Edit Account</Text>
          </TouchableOpacity>
        </View>

        {/* 3. Section Header & Filter Chips */}
        <View style={styles.sectionHeaderContainer}>
          <View style={styles.sectionTitleWithCount}>
            <Text style={styles.sectionTitle}>Account Transactions</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredTransactions.length}</Text>
            </View>
          </View>

          <View style={styles.filterChipsRow}>
            {(['all', 'expense', 'income'] as const).map((filter) => {
              const isSelected = filterType === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setFilterType(filter)}
                  style={[
                    styles.filterChip,
                    isSelected && {
                      backgroundColor: accent.hex + '25',
                      borderColor: accent.hex,
                    },
                  ]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isSelected && { color: accent.hex, fontWeight: '700' },
                    ]}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 4. Transactions List (Only for this account) */}
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={36} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Transactions Yet</Text>
            <Text style={styles.emptySubtitle}>
              {filterType === 'all'
                ? `No transactions recorded using ${account.name} yet.`
                : `No ${filterType} records found for this account.`}
            </Text>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('AddTransaction', { accountId: account.id })
              }
              style={[styles.emptyActionBtn, { backgroundColor: accent.hex }]}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={COLORS.textInverse} />
              <Text style={styles.emptyActionBtnText}>Record First Transaction</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {filteredTransactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                accountName={account.name}
              />
            ))}
          </View>
        )}

        {/* 5. Prominent Delete Account Button */}
        <View style={styles.deleteSection}>
          <TouchableOpacity
            style={styles.prominentDeleteBtn}
            onPress={handleOpenDeleteConfirm}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.alert} />
            <Text style={styles.prominentDeleteBtnText}>Delete This Money Source</Text>
          </TouchableOpacity>
          <Text style={styles.deleteHintText}>
            Removing this source will preserve its associated transaction history.
          </Text>
        </View>
      </ScrollView>

      {/* Complete Edit Account & Balance Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Edit Money Source</Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.inputLabel}>SOURCE NAME</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. Salary, Slice, Main Wallet"
                mode="outlined"
                textColor={COLORS.textPrimary}
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                theme={{ colors: { background: COLORS.surfaceLight } }}
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
                      editType === t && { borderColor: accent.hex, backgroundColor: COLORS.surfaceLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeToggleBtnText,
                        editType === t && { color: accent.hex, fontWeight: '700' },
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
                            borderColor: accent.hex,
                            backgroundColor: COLORS.surfaceLight,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            editBankPreset === p.name && { color: accent.hex, fontWeight: '700' },
                          ]}
                        >
                          {p.code}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {editType === 'credit_card' ? (
                <>
                  <Text style={styles.inputLabel}>TOTAL CREDIT LIMIT (₹)</Text>
                  <TextInput
                    value={editCreditLimit}
                    onChangeText={setEditCreditLimit}
                    placeholder="e.g. 25000"
                    keyboardType="numeric"
                    mode="outlined"
                    textColor={COLORS.textPrimary}
                    outlineColor={COLORS.border}
                    activeOutlineColor={accent.hex}
                    theme={{ colors: { background: COLORS.surfaceLight } }}
                    style={styles.modalInput}
                  />

                  <Text style={styles.inputLabel}>CURRENT OUTSTANDING DUE (₹)</Text>
                  <TextInput
                    value={editBalance}
                    onChangeText={setEditBalance}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    mode="outlined"
                    textColor={COLORS.textPrimary}
                    outlineColor={COLORS.border}
                    activeOutlineColor={accent.hex}
                    theme={{ colors: { background: COLORS.surfaceLight } }}
                    style={styles.modalInput}
                  />

                  <View style={styles.creditCalcBox}>
                    <Text style={styles.creditCalcSub}>
                      Total Limit: ₹{(parseFloat(editCreditLimit) || 0).toLocaleString('en-IN')}  ·  Due: ₹{(parseFloat(editBalance) || 0).toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.creditCalcMain, { color: accent.hex }]}>
                      Available Credit: ₹{Math.max(0, (parseFloat(editCreditLimit) || 0) - (parseFloat(editBalance) || 0)).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>CURRENT BALANCE (₹)</Text>
                  <TextInput
                    value={editBalance}
                    onChangeText={setEditBalance}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    mode="outlined"
                    textColor={COLORS.textPrimary}
                    outlineColor={COLORS.border}
                    activeOutlineColor={accent.hex}
                    theme={{ colors: { background: COLORS.surfaceLight } }}
                    style={styles.modalInput}
                  />
                </>
              )}

              <View style={styles.modalActionsCol}>
                <TactileButton
                  onPress={() => handleSaveAccountEdit(true)}
                  disabled={isSavingEdit}
                  style={[styles.modalApplyBtn, { backgroundColor: accent.hex }]}
                >
                  <Text style={styles.modalApplyBtnText}>
                    {isSavingEdit ? 'Saving...' : 'Save & Log Adjustment'}
                  </Text>
                </TactileButton>

                <TouchableOpacity
                  onPress={() => handleSaveAccountEdit(false)}
                  disabled={isSavingEdit}
                  style={styles.modalSecondaryBtn}
                >
                  <Text style={styles.modalSecondaryBtnText}>
                    Just Update (No Transaction)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenDeleteConfirm}
                  disabled={isSavingEdit}
                  style={styles.deleteAccountBtn}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.alert} />
                  <Text style={styles.deleteAccountBtnText}>Delete This Account</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pay Credit Card Bill Modal */}
      <Modal
        visible={payBillModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPayBillModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Pay Card Bill</Text>
                <Text style={styles.modalSubtitleText}>{account?.name}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPayBillModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <View style={styles.billDueSummaryBox}>
                <Text style={styles.billDueLabel}>TOTAL OUTSTANDING DUE</Text>
                <Text style={[styles.billDueAmount, TYPOGRAPHY.tabularText]}>
                  ₹{spent.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.billDueHelp}>
                  Paying this bill reduces your credit card dues and deducts funds from your selected account.
                </Text>
              </View>

              <Text style={styles.inputLabel}>AMOUNT TO PAY (₹)</Text>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                mode="outlined"
                textColor={COLORS.textPrimary}
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                theme={{ colors: { background: COLORS.surfaceLight } }}
                style={styles.modalInput}
              />

              <View style={styles.quickPayChipsRow}>
                <TouchableOpacity
                  style={[styles.quickPayChip, { borderColor: accent.hex }]}
                  onPress={() => setPayAmount(String(spent))}
                >
                  <Text style={[styles.quickPayChipText, { color: accent.hex }]}>
                    Full Due (₹{spent.toLocaleString('en-IN')})
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { marginTop: SPACING.md }]}>PAY FROM (BANK / CASH)</Text>
              <View style={styles.paySourceList}>
                {liquidAccounts.map((acc) => {
                  const isSelected = paySourceAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() => setPaySourceAccountId(acc.id)}
                      style={[
                        styles.paySourceItem,
                        isSelected && {
                          borderColor: accent.hex,
                          backgroundColor: COLORS.surfaceLight,
                        },
                      ]}
                    >
                      <View style={styles.paySourceItemLeft}>
                        <Ionicons
                          name={acc.type === 'cash' ? 'cash-outline' : 'business-outline'}
                          size={16}
                          color={isSelected ? accent.hex : COLORS.textSecondary}
                        />
                        <Text
                          style={[
                            styles.paySourceName,
                            isSelected && { color: COLORS.textPrimary, fontWeight: '700' },
                          ]}
                        >
                          {acc.name}
                        </Text>
                      </View>
                      <Text style={[styles.paySourceBalance, TYPOGRAPHY.tabularText]}>
                        ₹{Number(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalActionsCol}>
                <TactileButton
                  onPress={handleConfirmPayBill}
                  disabled={isPayingBill}
                  style={[styles.modalApplyBtn, { backgroundColor: accent.hex }]}
                >
                  <Text style={styles.modalApplyBtnText}>
                    {isPayingBill ? 'Processing...' : 'Confirm Bill Payment'}
                  </Text>
                </TactileButton>

                <TouchableOpacity
                  onPress={() => setPayBillModalVisible(false)}
                  disabled={isPayingBill}
                  style={styles.modalSecondaryBtn}
                >
                  <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal (with Calibration Warning) */}
      <Modal
        visible={deleteConfirmModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isDeleting && setDeleteConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteConfirmCard}>
            <View style={styles.deleteIconBadge}>
              <Ionicons name="trash-outline" size={28} color={COLORS.alert} />
            </View>

            <Text style={styles.deleteConfirmTitle}>Delete Money Source?</Text>

            {hasNonZeroBalance ? (
              <>
                <Text style={styles.deleteConfirmBody}>
                  <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{account.name}</Text> currently has an active balance of{' '}
                  <Text style={{ fontWeight: '700', color: accountBalanceNum < 0 ? COLORS.alert : accent.hex }}>
                    ₹{Math.abs(accountBalanceNum).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>.
                  {'\n\n'}
                  Deleting without calibrating will leave an unadjusted gap in your calculated net worth.
                </Text>

                <View style={styles.deleteActionButtons}>
                  <TactileButton
                    onPress={() => handleConfirmDelete(true)}
                    disabled={isDeleting}
                    style={[styles.modalApplyBtn, { backgroundColor: accent.hex }]}
                  >
                    <Text style={styles.modalApplyBtnText}>
                      {isDeleting ? 'Calibrating & Deleting...' : 'Calibrate to ₹0 First (Recommended)'}
                    </Text>
                  </TactileButton>

                  <TouchableOpacity
                    onPress={() => handleConfirmDelete(false)}
                    disabled={isDeleting}
                    style={styles.deleteAnywayBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteAnywayBtnText}>Delete Anyway (Leave Gap)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setDeleteConfirmModalVisible(false)}
                    disabled={isDeleting}
                    style={styles.modalSecondaryBtn}
                  >
                    <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.deleteConfirmBody}>
                  Are you sure you want to delete <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{account.name}</Text>? Past transaction records linked to this source will remain in your history.
                </Text>

                <View style={styles.deleteActionButtons}>
                  <TactileButton
                    onPress={() => handleConfirmDelete(false)}
                    disabled={isDeleting}
                    style={[styles.modalApplyBtn, { backgroundColor: COLORS.alert }]}
                  >
                    <Text style={styles.modalApplyBtnText}>
                      {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </Text>
                  </TactileButton>

                  <TouchableOpacity
                    onPress={() => setDeleteConfirmModalVisible(false)}
                    disabled={isDeleting}
                    style={styles.modalSecondaryBtn}
                  >
                    <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  accountIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  accountNameText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  accountBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  standardBalanceBox: {
    paddingVertical: SPACING.sm,
  },
  creditCardDetailsBox: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroBalanceText: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  creditLimitText: {
    color: COLORS.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  progressContainer: {
    gap: 6,
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceLight,
  },
  progressSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressSubText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 10,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
  },
  quickActionText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeaderContainer: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  sectionTitleWithCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  countBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  countBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  transactionsList: {
    gap: SPACING.sm,
  },
  transactionCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  txRowLine1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txTitleText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: SPACING.md,
  },
  txAmountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  txRowLine2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  txCategoryTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  txTagDivider: {
    color: COLORS.textMuted,
    marginHorizontal: 6,
    fontSize: 12,
  },
  txTypeTag: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  txRowLine3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDateText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  txNoteSnippet: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
    maxWidth: '50%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    gap: SPACING.sm,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  emptyActionBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  notFoundText: {
    color: COLORS.textMuted,
    fontSize: 15,
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: SPACING.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalHelperText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  modalInput: {
    marginBottom: SPACING.md,
  },
  modalActionsCol: {
    gap: SPACING.sm,
  },
  modalApplyBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalApplyBtnText: {
    color: COLORS.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 8,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.md,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeToggleBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  presetScroll: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
    marginRight: 8,
  },
  presetChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  deleteAccountBtnText: {
    color: COLORS.alert,
    fontSize: 12,
    fontWeight: '700',
  },
  creditCalcBox: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 2,
  },
  creditCalcSub: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  creditCalcMain: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalSubtitleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  billDueSummaryBox: {
    backgroundColor: COLORS.alert + '15',
    borderWidth: 1,
    borderColor: COLORS.alert + '40',
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 4,
  },
  billDueLabel: {
    color: COLORS.alert,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  billDueAmount: {
    color: COLORS.alert,
    fontSize: 22,
    fontWeight: '800',
  },
  billDueHelp: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  quickPayChipsRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: SPACING.xs,
  },
  quickPayChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  quickPayChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  paySourceList: {
    gap: 8,
    marginBottom: SPACING.md,
  },
  paySourceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  paySourceItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  paySourceName: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  paySourceBalance: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteSection: {
    marginTop: SPACING.md,
    gap: 8,
    alignItems: 'center',
  },
  prominentDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.alert + '60',
    backgroundColor: COLORS.alert + '12',
  },
  prominentDeleteBtnText: {
    color: COLORS.alert,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteHintText: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  deleteConfirmCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    maxWidth: 380,
    alignSelf: 'center',
    width: '100%',
  },
  deleteIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.alert + '15',
    borderWidth: 1,
    borderColor: COLORS.alert + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteConfirmTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  deleteConfirmBody: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  deleteActionButtons: {
    width: '100%',
    gap: SPACING.sm,
  },
  deleteAnywayBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.alert + '50',
    backgroundColor: COLORS.alert + '15',
  },
  deleteAnywayBtnText: {
    color: COLORS.alert,
    fontSize: 13,
    fontWeight: '700',
  },
});
