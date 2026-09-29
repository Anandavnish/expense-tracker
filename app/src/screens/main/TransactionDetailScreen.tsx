// src/screens/main/TransactionDetailScreen.tsx
import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { TransactionType } from '../../types/database';
import { MonthUnlockModal } from '../../components/MonthUnlockModal';
import { BankLogo } from '../../components/BankLogo';
import { EditButton, EditIcon } from '../../components/EditButton';
import {
  getCategoryIcon,
  getCategoryColor,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_BORROW_CATEGORIES,
} from '../../utils/categoryIcons';

export const TransactionDetailScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { transactionId, initialMode } = route.params || {};

  const { accent } = useSettingsStore();
  const {
    transactions,
    accounts,
    categories,
    borrows,
    updateTransactionOptimistic,
    deleteTransactionOptimistic,
    isMonthLocked,
  } = useFinanceStore();

  const transaction = useMemo(
    () => transactions.find((t) => t.id === transactionId),
    [transactions, transactionId]
  );

  const txMonth = useMemo(
    () => (transaction ? transaction.date.substring(0, 7) : ''),
    [transaction]
  );
  const isLocked = useMemo(
    () => (txMonth ? isMonthLocked(txMonth) : false),
    [txMonth, isMonthLocked]
  );
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);

  const formattedMonthLabel = useMemo(() => {
    if (!txMonth) return '';
    try {
      const [yearStr, monthStr] = txMonth.split('-');
      const d = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return txMonth;
    }
  }, [txMonth]);

  const account = useMemo(
    () => accounts.find((a) => a.id === transaction?.account_id),
    [accounts, transaction?.account_id]
  );

  const linkedBorrow = useMemo(
    () => borrows.find((b) => b.linked_transaction_id === transactionId),
    [borrows, transactionId]
  );

  // Screen State
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [deleteModalVisible, setDeleteModalVisible] = useState(initialMode === 'delete');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const detailScrollRef = useRef<ScrollView>(null);

  // Edit Form State
  const [editAmount, setEditAmount] = useState(() => (transaction ? String(transaction.amount) : ''));
  const [editType, setEditType] = useState<TransactionType>(() => transaction?.type || 'expense');
  const [editAccountId, setEditAccountId] = useState(() => transaction?.account_id || '');
  const [editCategory, setEditCategory] = useState(() => transaction?.category || '');
  const [editDate, setEditDate] = useState(() => transaction?.date || '');
  const [editNote, setEditNote] = useState(() => transaction?.note || '');

  const startEditing = () => {
    if (transaction) {
      setEditAmount(String(transaction.amount));
      setEditType(transaction.type);
      setEditAccountId(transaction.account_id);
      setEditCategory(transaction.category);
      setEditDate(transaction.date);
      setEditNote(transaction.note || '');
    }
    setIsEditing(true);
  };

  const getAvailableCategoriesForEdit = () => {
    if (editType === 'income') return DEFAULT_INCOME_CATEGORIES;
    if (editType === 'borrow_given' || editType === 'borrow_taken') return DEFAULT_BORROW_CATEGORIES;
    return categories;
  };

  const handleTypeSelect = (newType: TransactionType) => {
    setEditType(newType);
    let available: string[];
    if (newType === 'income') available = DEFAULT_INCOME_CATEGORIES;
    else if (newType === 'borrow_given' || newType === 'borrow_taken') available = DEFAULT_BORROW_CATEGORIES;
    else available = categories;

    if (!available.includes(editCategory)) {
      setEditCategory(available[0] || 'Other');
    }
  };

  if (!transaction) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>TRANSACTION DETAILS</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Transaction Not Found</Text>
          <Text style={styles.emptySubtitle}>
            This transaction may have been deleted or does not exist.
          </Text>
          <TactileButton
            style={styles.emptyBackBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.emptyBackBtnText}>Go Back</Text>
          </TactileButton>
        </View>
      </View>
    );
  }

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

  const formattedAmount = Number(transaction.amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const categoryStyle = getCategoryColor(transaction.category, transaction.type, accent.hex);
  const categoryIcon = getCategoryIcon(transaction.category, transaction.type);

  // Formatted date string
  const formattedFullDate = (() => {
    try {
      const [year, month, day] = transaction.date.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return transaction.date;
    }
  })();

  const formattedTime = (() => {
    try {
      if (transaction.created_at) {
        const d = new Date(transaction.created_at);
        return d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {}
    return null;
  })();

  // Handle Save Edits
  const handleSaveEdit = async () => {
    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0');
      return;
    }
    if (!editAccountId) {
      setErrorMessage('Please select a payment account');
      return;
    }
    if (!editCategory.trim()) {
      setErrorMessage('Please select a category');
      return;
    }
    if (!editDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setErrorMessage('Please enter date in YYYY-MM-DD format');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    const res = await updateTransactionOptimistic(transaction.id, {
      amount: numAmount,
      type: editType,
      account_id: editAccountId,
      category: editCategory.trim(),
      date: editDate.trim(),
      note: editNote.trim() || null,
    });

    setIsSaving(false);

    if (res.success) {
      setIsEditing(false);
    } else {
      setErrorMessage(res.error || 'Failed to update transaction');
    }
  };

  // Handle Delete
  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    const res = await deleteTransactionOptimistic(transaction.id);
    setIsDeleting(false);

    if (res.success) {
      setDeleteModalVisible(false);
      navigation.goBack();
    } else {
      setErrorMessage(res.error || 'Failed to delete transaction');
      setDeleteModalVisible(false);
    }
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isEditing) {
              setIsEditing(false);
            } else {
              navigation.goBack();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>
          {isEditing ? 'EDIT TRANSACTION' : 'TRANSACTION DETAILS'}
        </Text>

        <View style={styles.topBarActions}>
          {!isEditing && (
            isLocked ? (
              <TouchableOpacity
                style={styles.lockedHeaderBadge}
                onPress={() => setUnlockModalVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="lock-closed" size={13} color={COLORS.textMuted} />
                <Text style={styles.lockedHeaderBadgeText}>Locked</Text>
              </TouchableOpacity>
            ) : (
              <>
                <EditButton
                  size={32}
                  iconSize={15}
                  onPress={startEditing}
                  accessibilityLabel="Edit transaction"
                />

                <TouchableOpacity
                  style={styles.topActionIconBtn}
                  onPress={() => setDeleteModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.alert} />
                </TouchableOpacity>
              </>
            )
          )}
        </View>
      </View>

      <InlineError message={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <KeyboardAwareScrollView
        ref={detailScrollRef}
        extraScrollHeight={80}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SPACING.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {!isEditing ? (
          // ================= VIEW MODE =================
          <>
            {/* Hero Card */}
            <View style={styles.heroCard}>
              <View style={[styles.heroIconContainer, { backgroundColor: categoryStyle.bg }]}>
                <Ionicons name={categoryIcon} size={36} color={categoryStyle.text} />
              </View>

              <Text style={[styles.heroAmount, TYPOGRAPHY.tabularText, { color: amountColor }]}>
                {amountPrefix}₹{formattedAmount}
              </Text>

              <View style={styles.heroTagsRow}>
                <View
                  style={[
                    styles.heroTypeBadge,
                    isIncome && { backgroundColor: `${accent.hex}22` },
                    isExpense && { backgroundColor: COLORS.alertMuted },
                    (transaction.type === 'borrow_given' || transaction.type === 'borrow_taken') && {
                      backgroundColor: COLORS.warningMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.heroTypeBadgeText,
                      isIncome && { color: accent.hex },
                      isExpense && { color: COLORS.alert },
                      (transaction.type === 'borrow_given' || transaction.type === 'borrow_taken') && {
                        color: COLORS.warning,
                      },
                    ]}
                  >
                    {transaction.type.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.heroCategoryBadge}>
                  <Text style={[styles.heroCategoryText, { color: categoryStyle.text }]}>
                    {transaction.category}
                  </Text>
                </View>
              </View>

              {transaction.note ? (
                <Text style={styles.heroNoteTitle}>"{transaction.note}"</Text>
              ) : null}
            </View>

            {/* Quick Action Buttons (Edit & Delete) or Locked Notice Card */}
            {isLocked ? (
              <View style={styles.lockedNoticeCard}>
                <View style={styles.lockedNoticeIconBadge}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.warning} />
                </View>
                <View style={styles.lockedNoticeContent}>
                  <Text style={styles.lockedNoticeTitle}>Month Locked (View Only)</Text>
                  <Text style={styles.lockedNoticeDesc}>
                    This entry belongs to {formattedMonthLabel} which is locked against modifications. Unlock this month to edit or delete it.
                  </Text>
                  <TouchableOpacity
                    style={[styles.unlockEntryBtn, { borderColor: accent.hex }]}
                    onPress={() => setUnlockModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="lock-open-outline" size={14} color={accent.hex} />
                    <Text style={[styles.unlockEntryBtnText, { color: accent.hex }]}>
                      Unlock {formattedMonthLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.quickActionsContainer}>
                <TouchableOpacity
                  style={[styles.quickActionButton, { borderColor: accent.hex }]}
                  onPress={startEditing}
                  activeOpacity={0.7}
                >
                  <EditIcon size={18} color={accent.hex} />
                  <Text style={[styles.quickActionText, { color: accent.hex }]}>Edit Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickActionButton, { borderColor: COLORS.alert }]}
                  onPress={() => setDeleteModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.alert} />
                  <Text style={[styles.quickActionText, { color: COLORS.alert }]}>Delete Entry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Structured Details Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeaderTitle}>TRANSACTION INFORMATION</Text>

              {/* Payment Account */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelGroup}>
                  {account ? (
                    <BankLogo account={account} name={account.name} size={18} />
                  ) : (
                    <Ionicons name="wallet-outline" size={18} color={COLORS.textSecondary} />
                  )}
                  <Text style={styles.infoLabel}>Money Source</Text>
                </View>
                <View style={styles.infoValueRight}>
                  <Text style={styles.infoValuePrimary}>{account?.name || 'Unknown Account'}</Text>
                  <View style={styles.accountTypeTag}>
                    <Text style={styles.accountTypeTagText}>
                      {account?.type ? account.type.toUpperCase() : 'ACCOUNT'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Category */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelGroup}>
                  <Ionicons name="pricetag-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Category</Text>
                </View>
                <Text style={styles.infoValuePrimary}>{transaction.category}</Text>
              </View>

              <View style={styles.divider} />

              {/* Date */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelGroup}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Date</Text>
                </View>
                <View style={styles.infoValueRight}>
                  <Text style={styles.infoValuePrimary}>{formattedFullDate}</Text>
                  <Text style={styles.infoValueSecondary}>{transaction.date}</Text>
                </View>
              </View>

              {formattedTime && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabelGroup}>
                      <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
                      <Text style={styles.infoLabel}>Logged Time</Text>
                    </View>
                    <Text style={styles.infoValuePrimary}>{formattedTime}</Text>
                  </View>
                </>
              )}

              <View style={styles.divider} />

              {/* Flow Direction */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelGroup}>
                  <Ionicons name="swap-vertical-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Flow Direction</Text>
                </View>
                <Text style={styles.infoValuePrimary}>
                  {isIncome
                    ? 'Inflow (Credited)'
                    : isExpense
                    ? 'Outflow (Deducted)'
                    : transaction.type === 'borrow_taken'
                    ? 'Borrow Inflow'
                    : 'Lent Outflow'}
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Source */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabelGroup}>
                  <Ionicons name="finger-print-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Input Source</Text>
                </View>
                <Text style={styles.infoValuePrimary}>
                  {transaction.source === 'screenshot' ? 'Screenshot OCR' : 'Manual Entry'}
                </Text>
              </View>

              {/* Note / Remarks */}
              <View style={styles.divider} />
              <View style={styles.noteSection}>
                <View style={styles.infoLabelGroup}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.infoLabel}>Notes & Remarks</Text>
                </View>
                <Text style={styles.fullNoteText}>
                  {transaction.note ? transaction.note : 'No notes attached to this transaction.'}
                </Text>
              </View>
            </View>

            {/* Linked Borrow Card (if applicable) */}
            {linkedBorrow && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeaderTitle}>LINKED BORROW RECORD</Text>
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelGroup}>
                    <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
                    <Text style={styles.infoLabel}>Contact Person</Text>
                  </View>
                  <Text style={styles.infoValuePrimary}>{linkedBorrow.person_name}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <View style={styles.infoLabelGroup}>
                    <Ionicons name="checkbox-outline" size={18} color={COLORS.textSecondary} />
                    <Text style={styles.infoLabel}>Status</Text>
                  </View>
                  <View
                    style={[
                      styles.borrowStatusBadge,
                      {
                        backgroundColor:
                          linkedBorrow.status === 'settled' ? `${accent.hex}22` : COLORS.warningMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.borrowStatusBadgeText,
                        {
                          color:
                            linkedBorrow.status === 'settled' ? accent.hex : COLORS.warning,
                        },
                      ]}
                    >
                      {linkedBorrow.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Prominent Delete Button at Bottom (Only if not locked) */}
            {!isLocked && (
              <TouchableOpacity
                style={styles.bottomDeleteBtn}
                onPress={() => setDeleteModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.alert} />
                <Text style={styles.bottomDeleteBtnText}>Delete This Transaction</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          // ================= EDIT MODE =================
          <View style={styles.editFormContainer}>
            {/* Amount Input */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>AMOUNT (₹)</Text>
              <TextInput
                value={editAmount}
                onChangeText={setEditAmount}
                onFocus={() => {
                  setTimeout(() => {
                    detailScrollRef.current?.scrollTo({ y: 50, animated: true });
                  }, 150);
                }}
                keyboardType="decimal-pad"
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                textColor={COLORS.textPrimary}
                style={styles.formTextInput}
                placeholder="0.00"
              />
            </View>

            {/* Transaction Type Selector */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>TRANSACTION TYPE</Text>
              <View style={styles.typeSelectorRow}>
                {(
                  [
                    { type: 'expense' as TransactionType, label: 'Expense' },
                    { type: 'income' as TransactionType, label: 'Income' },
                    { type: 'borrow_given' as TransactionType, label: 'Lent' },
                    { type: 'borrow_taken' as TransactionType, label: 'Borrowed' },
                  ] as const
                ).map((t) => {
                  const active = editType === t.type;
                  return (
                    <TouchableOpacity
                      key={t.type}
                      onPress={() => handleTypeSelect(t.type)}
                      style={[
                        styles.typePill,
                        active && {
                          borderColor: accent.hex,
                          backgroundColor: `${accent.hex}22`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          active && { color: accent.hex, fontWeight: '700' },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Account Selector */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>PAYMENT ACCOUNT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {accounts.map((acc) => {
                  const active = editAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() => setEditAccountId(acc.id)}
                      style={[
                        styles.chipPill,
                        active && {
                          borderColor: accent.hex,
                          backgroundColor: `${accent.hex}22`,
                        },
                      ]}
                    >
                      <BankLogo account={acc} size={16} style={{ marginRight: 6 }} />
                      <Text
                        style={[
                          styles.chipPillText,
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

            {/* Category Selector */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {getAvailableCategoriesForEdit().map((cat) => {
                  const active = editCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setEditCategory(cat)}
                      style={[
                        styles.chipPill,
                        active && {
                          borderColor: accent.hex,
                          backgroundColor: `${accent.hex}22`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipPillText,
                          active && { color: accent.hex, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Date Input */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>DATE (YYYY-MM-DD)</Text>
              <TextInput
                value={editDate}
                onChangeText={setEditDate}
                onFocus={() => {
                  setTimeout(() => {
                    detailScrollRef.current?.scrollTo({ y: 350, animated: true });
                  }, 150);
                }}
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                textColor={COLORS.textPrimary}
                style={styles.formTextInput}
                placeholder="YYYY-MM-DD"
              />
            </View>

            {/* Note Input */}
            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>NOTE / DESCRIPTION</Text>
              <TextInput
                value={editNote}
                onChangeText={setEditNote}
                onFocus={() => {
                  setTimeout(() => {
                    detailScrollRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={accent.hex}
                textColor={COLORS.textPrimary}
                style={[styles.formTextInput, { minHeight: 70 }]}
                multiline
                numberOfLines={3}
                placeholder="Optional merchant or item note"
              />
            </View>

            {/* Save & Cancel Buttons */}
            <View style={styles.formActionButtonsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEditing(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                style={[styles.saveButton, { backgroundColor: accent.hex }]}
                onPress={handleSaveEdit}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Text>
              </TactileButton>
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalAlertIcon}>
              <Ionicons name="trash-outline" size={32} color={COLORS.alert} />
            </View>

            <Text style={styles.modalTitle}>Delete Transaction?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to delete this transaction for{' '}
              <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>
                ₹{formattedAmount}
              </Text>
              ? This action will reverse your account balance and recalculate your budgets.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalDeleteConfirmBtn}
                onPress={handleDeleteConfirm}
                disabled={isDeleting}
              >
                <Text style={styles.modalDeleteConfirmBtnText}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MONTH UNLOCK MODAL */}
      <MonthUnlockModal
        visible={unlockModalVisible}
        month={txMonth}
        onClose={() => setUnlockModalVisible(false)}
        onUnlockSuccess={() => {
          startEditing();
        }}
      />
    </View>
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
    borderRadius: 8,
  },
  topBarTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  topActionIconBtn: {
    padding: SPACING.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  heroIconContainer: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  heroTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  heroTypeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroTypeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroCategoryBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroCategoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroNoteTitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  lockedHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedHeaderBadgeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  lockedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  lockedNoticeIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedNoticeContent: {
    flex: 1,
  },
  lockedNoticeTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  lockedNoticeDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  unlockEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  unlockEntryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    gap: 6,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionHeaderTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  infoLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  infoValueRight: {
    alignItems: 'flex-end',
  },
  infoValuePrimary: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  infoValueSecondary: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  accountTypeTag: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
  },
  accountTypeTagText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  noteSection: {
    paddingVertical: SPACING.xs,
  },
  fullNoteText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: 8,
  },
  borrowStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  borrowStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  bottomDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  bottomDeleteBtnText: {
    color: COLORS.alert,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  emptyBackBtn: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
  },
  emptyBackBtnText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  // Edit Form Styles
  editFormContainer: {
    gap: SPACING.md,
  },
  formField: {
    marginBottom: SPACING.xs,
  },
  formFieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  formTextInput: {
    backgroundColor: COLORS.surface,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  typePill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typePillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingVertical: 2,
  },
  chipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipPillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  formActionButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  saveButton: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: '800',
  },
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalAlertIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.alertMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  modalMessage: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.xl,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  modalDeleteConfirmBtn: {
    flex: 1,
    backgroundColor: COLORS.alert,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalDeleteConfirmBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
