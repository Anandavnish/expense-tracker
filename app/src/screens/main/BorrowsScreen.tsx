// src/screens/main/BorrowsScreen.tsx
import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';

import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, parseBorrowDetails } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, TYPOGRAPHY, ThemeColors } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { InlineError } from '../../components/InlineError';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Borrow, BorrowType } from '../../types/database';
import { BankLogo } from '../../components/BankLogo';

export const BorrowsScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const scrollRef = useRef<ScrollView>(null);
  const addModalScrollRef = useRef<ScrollView>(null);
  const settleModalScrollRef = useRef<ScrollView>(null);
  const editModalScrollRef = useRef<ScrollView>(null);

  const isSubmittingAddRef = useRef(false);
  const isSubmittingSettleRef = useRef(false);
  const isSubmittingEditRef = useRef(false);

  const { user } = useAuthStore();
  const { accent, colors, effectiveTheme } = useSettingsStore();
  const {
    borrows,
    transactions,
    accounts,
    addBorrowWithTransactionOptimistic,
    updateBorrowWithTransactionOptimistic,
    settleBorrowWithTransactionOptimistic,
    reopenBorrowOptimistic,
    deleteBorrowOptimistic,
    mergeBorrowsOptimistic,
    netSettleBorrowsOptimistic,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'settled' | 'lent' | 'borrowed'>('all');

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<BorrowType>('lent');
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    const defaultAcc = accounts.find((a) => a.type === 'bank') || accounts[0];
    return defaultAcc?.id || '';
  });
  const [connectToAccount, setConnectToAccount] = useState(true);
  const [addDate, setAddDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [showAddDatePicker, setShowAddDatePicker] = useState(false);
  const [addNote, setAddNote] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit Modal State
  const [editBorrowItem, setEditBorrowItem] = useState<Borrow | null>(null);
  const [editType, setEditType] = useState<BorrowType>('lent');
  const [editPersonName, setEditPersonName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editAccountId, setEditAccountId] = useState<string>('');
  const [editConnectToAccount, setEditConnectToAccount] = useState(true);
  const [editDate, setEditDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Settle Modal State
  const [settleBorrowItem, setSettleBorrowItem] = useState<Borrow | null>(null);
  const [settleMode, setSettleMode] = useState<'with_account' | 'without_account'>('with_account');
  const [settleAccountId, setSettleAccountId] = useState<string>('');
  const [settleDate, setSettleDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [showSettleDatePicker, setShowSettleDatePicker] = useState(false);
  const [settleNote, setSettleNote] = useState('');
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);

  // Delete Modal State
  const [borrowToDelete, setBorrowToDelete] = useState<Borrow | null>(null);
  const [deleteLinkedTx, setDeleteLinkedTx] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // Liquid accounts eligible for money flow (Bank and Cash, not Credit Card)
  const eligibleAccounts = useMemo(() => {
    return accounts.filter((a) => a.type !== 'credit_card');
  }, [accounts]);

  // Accounts available for Add (Credit Card allowed when lending money!)
  const accountsForAdd = useMemo(() => {
    if (addType === 'lent') {
      return accounts;
    }
    return eligibleAccounts;
  }, [accounts, eligibleAccounts, addType]);

  // Accounts available for Edit (Credit Card allowed when lending money!)
  const accountsForEdit = useMemo(() => {
    if (editType === 'lent') {
      return accounts;
    }
    return eligibleAccounts;
  }, [accounts, eligibleAccounts, editType]);

  // Selected account objects
  const activeSelectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const activeSettleAccount = useMemo(() => {
    return accounts.find((a) => a.id === settleAccountId);
  }, [accounts, settleAccountId]);

  // Date formatting helpers
  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) return dateStr;
      const dateObj = new Date(y, m - 1, d);
      const today = new Date();
      const isToday =
        today.getFullYear() === y &&
        today.getMonth() === m - 1 &&
        today.getDate() === d;
      const formatted = dateObj.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return isToday ? `Today (${formatted})` : formatted;
    } catch {
      return dateStr;
    }
  };

  const parseDateObj = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (y && m && d) {
        return new Date(y, m - 1, d);
      }
      return new Date();
    } catch {
      return new Date();
    }
  };

  const handleAddDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowAddDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setAddDate(formatLocalDate(selectedDate));
    } else if (event.type === 'dismissed') {
      setShowAddDatePicker(false);
    }
  };

  const handleSettleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowSettleDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setSettleDate(formatLocalDate(selectedDate));
    } else if (event.type === 'dismissed') {
      setShowSettleDatePicker(false);
    }
  };

  // Calculations for executive summary metrics
  const { totalPendingLent, totalPendingBorrowed, pendingLentCount, pendingBorrowedCount } =
    useMemo(() => {
      let lentTotal = 0;
      let borrowedTotal = 0;
      let lentCount = 0;
      let borrowedCount = 0;

      borrows.forEach((b) => {
        if (b.status === 'pending') {
          const { type } = parseBorrowDetails(b, transactions);
          if (type === 'borrowed') {
            borrowedTotal += Number(b.amount || 0);
            borrowedCount += 1;
          } else {
            lentTotal += Number(b.amount || 0);
            lentCount += 1;
          }
        }
      });

      return {
        totalPendingLent: lentTotal,
        totalPendingBorrowed: borrowedTotal,
        pendingLentCount: lentCount,
        pendingBorrowedCount: borrowedCount,
      };
    }, [borrows, transactions]);

  const netPending = totalPendingLent - totalPendingBorrowed;

  // Filtered & Searched Borrows List
  const filteredBorrows = useMemo(() => {
    return borrows.filter((b) => {
      const { type, displayName } = parseBorrowDetails(b, transactions);

      // Status / Direction Filter
      if (filter === 'pending' && b.status !== 'pending') return false;
      if (filter === 'settled' && b.status !== 'settled') return false;
      if (filter === 'lent' && type !== 'lent') return false;
      if (filter === 'borrowed' && type !== 'borrowed') return false;

      // Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = displayName.toLowerCase().includes(query);
        const matchesRaw = (b.person_name || '').toLowerCase().includes(query);
        const linkedTx = b.linked_transaction_id
          ? transactions.find((t) => t.id === b.linked_transaction_id)
          : null;
        const matchesNote = (linkedTx?.note || '').toLowerCase().includes(query);
        if (!matchesName && !matchesRaw && !matchesNote) return false;
      }

      return true;
    });
  }, [borrows, filter, searchQuery, transactions]);

  // Existing people with their pending amounts and counts
  const existingPeople = useMemo(() => {
    const map = new Map<
      string,
      { displayName: string; pendingLent: number; pendingBorrowed: number; openCount: number }
    >();
    borrows.forEach((b) => {
      const { displayName, type } = parseBorrowDetails(b, transactions);
      const key = displayName.trim();
      if (!key) return;
      const lower = key.toLowerCase();
      const existing = map.get(lower) || {
        displayName: key,
        pendingLent: 0,
        pendingBorrowed: 0,
        openCount: 0,
      };
      if (b.status === 'pending') {
        existing.openCount += 1;
        if (type === 'lent') existing.pendingLent += Number(b.amount || 0);
        else existing.pendingBorrowed += Number(b.amount || 0);
      }
      map.set(lower, existing);
    });
    return Array.from(map.values());
  }, [borrows, transactions]);

  // Person suggestions for autocomplete in Add Modal
  const personSuggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return existingPeople.slice(0, 6);
    return existingPeople.filter((p) => p.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [existingPeople, personName]);

  const matchedExistingPerson = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return null;
    return existingPeople.find((p) => p.displayName.toLowerCase() === q) || null;
  }, [existingPeople, personName]);

  // Smart Groups for Dashboard (Net Settle & Merge)
  const smartGroups = useMemo(() => {
    const map: Record<
      string,
      {
        displayName: string;
        lentEntries: Borrow[];
        borrowedEntries: Borrow[];
        totalLent: number;
        totalBorrowed: number;
      }
    > = {};

    borrows.forEach((b) => {
      if (b.status !== 'pending') return;
      const { displayName, type } = parseBorrowDetails(b, transactions);
      const norm = displayName.toLowerCase().trim();
      if (!norm) return;

      if (!map[norm]) {
        map[norm] = {
          displayName,
          lentEntries: [],
          borrowedEntries: [],
          totalLent: 0,
          totalBorrowed: 0,
        };
      }

      if (type === 'lent') {
        map[norm].lentEntries.push(b);
        map[norm].totalLent += Number(b.amount || 0);
      } else {
        map[norm].borrowedEntries.push(b);
        map[norm].totalBorrowed += Number(b.amount || 0);
      }
    });

    return Object.values(map).filter(
      (g) =>
        (g.lentEntries.length > 0 && g.borrowedEntries.length > 0) ||
        g.lentEntries.length > 1 ||
        g.borrowedEntries.length > 1
    );
  }, [borrows, transactions]);

  // Handle Opening Add Modal
  const handleOpenAddModal = (direction: BorrowType = 'lent') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAddType(direction);
    setPersonName('');
    setAmount('');
    setAddNote('');
    setAddError(null);
    setAddDate(new Date().toISOString().substring(0, 10));
    setShowAddDatePicker(false);
    setConnectToAccount(true);

    const availableAccs = direction === 'lent' ? accounts : eligibleAccounts;
    const defaultAcc = availableAccs.find((a) => a.type === 'bank') || availableAccs[0];
    if (defaultAcc) setSelectedAccountId(defaultAcc.id);

    setShowAddModal(true);
  };

  // Handle Submitting Add Borrow
  const handleSaveAddBorrow = async () => {
    if (!user) return;
    if (isSubmittingAddRef.current) return;
    const numAmount = parseFloat(amount);

    if (!personName.trim()) {
      setAddError('Please enter person name');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setAddError('Please enter a valid amount greater than 0');
      return;
    }
    if (connectToAccount && !selectedAccountId) {
      setAddError('Please select a money source account');
      return;
    }

    setAddError(null);
    isSubmittingAddRef.current = true;
    setIsSubmittingAdd(true);

    try {
      const res = await addBorrowWithTransactionOptimistic({
        user_id: user.id,
        person_name: personName.trim(),
        amount: numAmount,
        type: addType,
        date: addDate,
        account_id: connectToAccount ? selectedAccountId : null,
        note: addNote.trim() || null,
      });

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setShowAddModal(false);
      } else {
        setAddError(res.error || 'Failed to save borrow entry');
      }
    } finally {
      isSubmittingAddRef.current = false;
      setIsSubmittingAdd(false);
    }
  };

  // Handle Opening Edit Modal
  const handleOpenEditModal = (borrow: Borrow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const { displayName, type } = parseBorrowDetails(borrow, transactions);
    const linkedTx = borrow.linked_transaction_id
      ? transactions.find((t) => t.id === borrow.linked_transaction_id)
      : null;

    setEditBorrowItem(borrow);
    setEditType(type);
    setEditPersonName(displayName);
    setEditAmount(String(linkedTx?.amount ?? borrow.amount));
    setEditDate(linkedTx?.date ?? borrow.date ?? new Date().toISOString().substring(0, 10));
    setEditNote(linkedTx?.note ?? '');
    setEditError(null);
    setShowEditDatePicker(false);

    if (linkedTx?.account_id) {
      setEditAccountId(linkedTx.account_id);
      setEditConnectToAccount(true);
    } else {
      setEditConnectToAccount(false);
      const availableAccs = type === 'lent' ? accounts : eligibleAccounts;
      const defaultAcc = availableAccs.find((a) => a.type === 'bank') || availableAccs[0];
      if (defaultAcc) setEditAccountId(defaultAcc.id);
    }
  };

  // Handle Submitting Edit Borrow
  const handleSaveEditBorrow = async () => {
    if (!editBorrowItem) return;
    if (isSubmittingEditRef.current) return;
    const numAmount = parseFloat(editAmount);

    if (!editPersonName.trim()) {
      setEditError('Please enter person name');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setEditError('Please enter a valid amount greater than 0');
      return;
    }
    if (editConnectToAccount && !editAccountId) {
      setEditError('Please select a money source account');
      return;
    }

    setEditError(null);
    isSubmittingEditRef.current = true;
    setIsSubmittingEdit(true);

    try {
      const res = await updateBorrowWithTransactionOptimistic({
        borrowId: editBorrowItem.id,
        person_name: editPersonName.trim(),
        amount: numAmount,
        type: editType,
        date: editDate,
        account_id: editConnectToAccount ? editAccountId : null,
        note: editNote.trim() || null,
      });

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setEditBorrowItem(null);
      } else {
        setEditError(res.error || 'Failed to update borrow entry');
      }
    } finally {
      isSubmittingEditRef.current = false;
      setIsSubmittingEdit(false);
    }
  };

  // Handle Opening Settle Modal
  const handleOpenSettleModal = (borrow: Borrow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSettleBorrowItem(borrow);
    setSettleMode('with_account');
    setSettleDate(new Date().toISOString().substring(0, 10));
    setShowSettleDatePicker(false);
    setSettleNote('');

    // Pre-select account from original transaction if available, else primary bank
    const linkedTx = borrow.linked_transaction_id
      ? transactions.find((t) => t.id === borrow.linked_transaction_id)
      : null;
    const defaultAcc =
      (linkedTx && eligibleAccounts.find((a) => a.id === linkedTx.account_id)) ||
      eligibleAccounts.find((a) => a.type === 'bank') ||
      eligibleAccounts[0];

    if (defaultAcc) {
      setSettleAccountId(defaultAcc.id);
    }
  };

  // Handle Submitting Settle
  const handleConfirmSettle = async () => {
    if (!settleBorrowItem) return;
    if (isSubmittingSettleRef.current) return;

    if (settleMode === 'with_account' && !settleAccountId) {
      setInlineError('Please select an account for the settlement transaction');
      return;
    }

    isSubmittingSettleRef.current = true;
    setIsSubmittingSettle(true);
    try {
      const res = await settleBorrowWithTransactionOptimistic({
        borrowId: settleBorrowItem.id,
        depositAccountId: settleMode === 'with_account' ? settleAccountId : null,
        date: settleDate,
        note: settleNote.trim() || null,
      });

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSettleBorrowItem(null);
      }
    } finally {
      isSubmittingSettleRef.current = false;
      setIsSubmittingSettle(false);
    }
  };

  // Handle Reopening Borrow
  const handleReopenBorrow = async (borrowId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await reopenBorrowOptimistic(borrowId);
  };

  // Handle Confirming Delete
  const handleConfirmDelete = async () => {
    if (!borrowToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteBorrowOptimistic(borrowToDelete.id, deleteLinkedTx);
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setBorrowToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const dynamicStyles = useMemo(() => getStyles(colors, accent.hex), [colors, accent.hex]);

  return (
    <View style={[dynamicStyles.safeArea, { paddingTop: insets.top }]}>
      {/* 1. Spacious, Non-Cramped Top Header Bar */}
      <View style={dynamicStyles.topHeader}>
        <View style={dynamicStyles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={dynamicStyles.headerBackBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={dynamicStyles.headerTitleCol}>
            <Text style={dynamicStyles.appTitle}>BORROWS & LENDING</Text>
            <Text style={dynamicStyles.subtitle} numberOfLines={1}>
              Track debts, loans & settlements
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => handleOpenAddModal('lent')}
          style={dynamicStyles.headerAddBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={16} color={colors.textInverse} style={{ marginRight: 4 }} />
          <Text style={dynamicStyles.headerAddBtnText}>Add Entry</Text>
        </TouchableOpacity>
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={[
          dynamicStyles.scrollContent,
          { paddingBottom: insets.bottom + SPACING.xl * 2 },
        ]}
        extraScrollHeight={60}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Executive 3-Card Summary Overview */}
        <View style={dynamicStyles.summarySection}>
          <View style={dynamicStyles.summaryCardsRow}>
            {/* To Receive Card (Lent) */}
            <TouchableOpacity
              style={[dynamicStyles.metricCard, { borderColor: `${colors.lent}33` }]}
              onPress={() => setFilter('lent')}
              activeOpacity={0.85}
            >
              <View style={dynamicStyles.metricCardHeader}>
                <View style={[dynamicStyles.metricBadge, { backgroundColor: colors.lentMuted }]}>
                  <Ionicons name="arrow-up-circle-outline" size={14} color={colors.lent} />
                  <Text style={[dynamicStyles.metricBadgeText, { color: colors.lent }]}>TO RECEIVE</Text>
                </View>
                <Text style={dynamicStyles.metricCountText}>{pendingLentCount} open</Text>
              </View>

              <Text style={[dynamicStyles.metricAmount, TYPOGRAPHY.tabularText, { color: colors.lent }]}>
                +₹{totalPendingLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={dynamicStyles.metricSubtext}>Money you lent to people</Text>
            </TouchableOpacity>

            {/* To Pay Card (Borrowed) */}
            <TouchableOpacity
              style={[dynamicStyles.metricCard, { borderColor: `${colors.borrowed}33` }]}
              onPress={() => setFilter('borrowed')}
              activeOpacity={0.85}
            >
              <View style={dynamicStyles.metricCardHeader}>
                <View style={[dynamicStyles.metricBadge, { backgroundColor: colors.borrowedMuted }]}>
                  <Ionicons name="arrow-down-circle-outline" size={14} color={colors.borrowed} />
                  <Text style={[dynamicStyles.metricBadgeText, { color: colors.borrowed }]}>TO PAY</Text>
                </View>
                <Text style={dynamicStyles.metricCountText}>{pendingBorrowedCount} open</Text>
              </View>

              <Text style={[dynamicStyles.metricAmount, TYPOGRAPHY.tabularText, { color: colors.borrowed }]}>
                −₹{totalPendingBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={dynamicStyles.metricSubtext}>Money you owe to people</Text>
            </TouchableOpacity>
          </View>

          {/* Net Position Capsule Banner */}
          <View
            style={[
              dynamicStyles.netPositionCapsule,
              netPending > 0 && {
                borderColor: `${colors.lent}44`,
                backgroundColor: `${colors.lent}12`,
              },
              netPending < 0 && {
                borderColor: `${colors.borrowed}44`,
                backgroundColor: `${colors.borrowed}12`,
              },
              netPending === 0 && {
                borderColor: colors.border,
                backgroundColor: colors.surfaceLight,
              },
            ]}
          >
            <View style={dynamicStyles.netPositionLeft}>
              <Ionicons
                name={
                  netPending > 0
                    ? 'trending-up-outline'
                    : netPending < 0
                    ? 'trending-down-outline'
                    : 'checkmark-circle-outline'
                }
                size={18}
                color={
                  netPending > 0 ? colors.lent : netPending < 0 ? colors.borrowed : colors.textMuted
                }
              />
              <Text style={dynamicStyles.netPositionLabel}>
                {netPending > 0
                  ? 'Net Receivable Balance'
                  : netPending < 0
                  ? 'Net Payable Balance'
                  : 'All Borrows Settled'}
              </Text>
            </View>

            <Text
              style={[
                dynamicStyles.netPositionValue,
                TYPOGRAPHY.tabularText,
                {
                  color:
                    netPending > 0
                      ? colors.lent
                      : netPending < 0
                      ? colors.borrowed
                      : colors.textSecondary,
                },
              ]}
            >
              {netPending < 0 ? '−' : netPending > 0 ? '+' : ''}₹
              {Math.abs(netPending).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
        </View>

        {/* 3. Search & Filter Bar */}
        <View style={dynamicStyles.searchFilterContainer}>
          <View style={dynamicStyles.searchInputWrapper}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} style={dynamicStyles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search person name or notes..."
              placeholderTextColor={colors.textMuted}
              textColor={colors.textPrimary}
              style={dynamicStyles.searchInput}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={dynamicStyles.searchClearBtn}
              >
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.filterPillsRow}>
            {(
              [
                { id: 'all', label: 'All', count: borrows.length },
                { id: 'pending', label: 'Pending', count: pendingLentCount + pendingBorrowedCount },
                { id: 'settled', label: 'Settled', count: borrows.filter((b) => b.status === 'settled').length },
                { id: 'lent', label: 'Lent Only', count: pendingLentCount },
                { id: 'borrowed', label: 'Borrowed Only', count: pendingBorrowedCount },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFilter(tab.id);
                  }}
                  style={[
                    dynamicStyles.filterChip,
                    active && {
                      borderColor: accent.hex,
                      backgroundColor: `${accent.hex}18`,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      dynamicStyles.filterChipText,
                      active && { color: accent.hex, fontWeight: '700' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={[
                      dynamicStyles.filterCountBadge,
                      active
                        ? { backgroundColor: `${accent.hex}33` }
                        : { backgroundColor: colors.surfaceLight },
                    ]}
                  >
                    <Text
                      style={[
                        dynamicStyles.filterCountBadgeText,
                        active ? { color: accent.hex } : { color: colors.textMuted },
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Smart Deduplication & Net Settlement Banner / Cards */}
        {smartGroups.length > 0 && (
          <View style={dynamicStyles.smartSection}>
            <View style={dynamicStyles.smartSectionHeader}>
              <View style={dynamicStyles.smartHeaderLeft}>
                <Ionicons name="sparkles" size={15} color={accent.hex} style={{ marginRight: 6 }} />
                <Text style={dynamicStyles.smartSectionTitle}>SMART SETTLE & MERGE</Text>
              </View>
              <Text style={dynamicStyles.smartBadgeCount}>{smartGroups.length} suggestions</Text>
            </View>

            {smartGroups.map((g) => {
              const hasBothSides = g.lentEntries.length > 0 && g.borrowedEntries.length > 0;
              const hasMultipleLent = g.lentEntries.length > 1;
              const hasMultipleBorrowed = g.borrowedEntries.length > 1;

              return (
                <View key={g.displayName} style={dynamicStyles.smartGroupCard}>
                  <View style={dynamicStyles.smartGroupTop}>
                    <Text style={dynamicStyles.smartGroupName}>{g.displayName}</Text>
                    {hasBothSides ? (
                      <View style={dynamicStyles.smartBothBadge}>
                        <Text style={dynamicStyles.smartBothBadgeText}>LENT & BORROWED</Text>
                      </View>
                    ) : (
                      <View style={dynamicStyles.smartSameBadge}>
                        <Text style={dynamicStyles.smartSameBadgeText}>MULTIPLE ENTRIES</Text>
                      </View>
                    )}
                  </View>

                  {hasBothSides && (
                    <View style={dynamicStyles.smartActionRow}>
                      <View style={dynamicStyles.smartAmountsCol}>
                        <Text style={dynamicStyles.smartDetailText}>
                          Lent: <Text style={{ color: colors.lent, fontWeight: '700' }}>₹{g.totalLent.toLocaleString('en-IN')}</Text>
                          {'  •  '}
                          Borrowed: <Text style={{ color: colors.borrowed, fontWeight: '700' }}>₹{g.totalBorrowed.toLocaleString('en-IN')}</Text>
                        </Text>
                        <Text style={dynamicStyles.smartNetText}>
                          Net: {g.totalLent >= g.totalBorrowed ? `Receive ₹${(g.totalLent - g.totalBorrowed).toLocaleString('en-IN')}` : `Pay ₹${(g.totalBorrowed - g.totalLent).toLocaleString('en-IN')}`}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[dynamicStyles.smartActionBtn, { backgroundColor: accent.hex }]}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          await netSettleBorrowsOptimistic(g.displayName);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="git-merge-outline" size={13} color={colors.textInverse} style={{ marginRight: 4 }} />
                        <Text style={dynamicStyles.smartActionBtnText}>Net Settle</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!hasBothSides && hasMultipleLent && (
                    <View style={dynamicStyles.smartActionRow}>
                      <View style={dynamicStyles.smartAmountsCol}>
                        <Text style={dynamicStyles.smartDetailText}>
                          {g.lentEntries.length} open Lent entries
                        </Text>
                        <Text style={dynamicStyles.smartNetText}>
                          Total: ₹{g.totalLent.toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[dynamicStyles.smartActionBtn, { backgroundColor: colors.lent }]}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          await mergeBorrowsOptimistic(g.displayName, 'lent');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="layers-outline" size={13} color={colors.textInverse} style={{ marginRight: 4 }} />
                        <Text style={dynamicStyles.smartActionBtnText}>Merge Entries</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {!hasBothSides && hasMultipleBorrowed && (
                    <View style={dynamicStyles.smartActionRow}>
                      <View style={dynamicStyles.smartAmountsCol}>
                        <Text style={dynamicStyles.smartDetailText}>
                          {g.borrowedEntries.length} open Borrowed entries
                        </Text>
                        <Text style={dynamicStyles.smartNetText}>
                          Total: ₹{g.totalBorrowed.toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[dynamicStyles.smartActionBtn, { backgroundColor: colors.borrowed }]}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          await mergeBorrowsOptimistic(g.displayName, 'borrowed');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="layers-outline" size={13} color={colors.textInverse} style={{ marginRight: 4 }} />
                        <Text style={dynamicStyles.smartActionBtnText}>Merge Entries</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* 4. Borrows List Section */}
        {filteredBorrows.length > 0 ? (
          filteredBorrows.map((borrow) => {
            const { type, displayName } = parseBorrowDetails(borrow, transactions);
            const isSettled = borrow.status === 'settled';
            const isLent = type === 'lent';
            const themeColor = isLent ? colors.lent : colors.borrowed;
            const themeBg = isLent ? colors.lentMuted : colors.borrowedMuted;

            // Find linked transaction if any to show money source details
            const linkedTx = borrow.linked_transaction_id
              ? transactions.find((t) => t.id === borrow.linked_transaction_id)
              : null;
            const linkedAcc = linkedTx ? accounts.find((a) => a.id === linkedTx.account_id) : null;
            const effectiveAmount = linkedTx ? Number(linkedTx.amount) : Number(borrow.amount);
            const effectiveDate = linkedTx?.date || borrow.date;

            return (
              <View
                key={borrow.id}
                style={[
                  dynamicStyles.borrowCard,
                  isSettled && dynamicStyles.borrowCardSettled,
                ]}
              >
                {/* Card Top Row: Avatar, Names, Direction Badge, Amount */}
                <View style={dynamicStyles.cardTopRow}>
                  <View style={dynamicStyles.avatarAndName}>
                    <View
                      style={[
                        dynamicStyles.personAvatar,
                        { backgroundColor: isSettled ? colors.surfaceLight : themeBg },
                      ]}
                    >
                      <Text
                        style={[
                          dynamicStyles.personAvatarText,
                          { color: isSettled ? colors.textMuted : themeColor },
                        ]}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={dynamicStyles.nameMetaColumn}>
                      <Text
                        style={[
                          dynamicStyles.personNameText,
                          isSettled && { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>

                      <View style={dynamicStyles.badgeRow}>
                        {/* Direction Badge */}
                        <View
                          style={[
                            dynamicStyles.directionBadge,
                            {
                              backgroundColor: isSettled ? colors.surfaceLight : themeBg,
                              borderColor: isSettled ? colors.border : `${themeColor}44`,
                            },
                          ]}
                        >
                          <Ionicons
                            name={isLent ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
                            size={12}
                            color={isSettled ? colors.textMuted : themeColor}
                            style={{ marginRight: 3 }}
                          />
                          <Text
                            style={[
                              dynamicStyles.directionBadgeText,
                              { color: isSettled ? colors.textMuted : themeColor },
                            ]}
                          >
                            {isLent ? 'LENT' : 'BORROWED'}
                          </Text>
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            dynamicStyles.statusBadge,
                            isSettled
                              ? {
                                  backgroundColor: `${colors.income}1A`,
                                  borderColor: `${colors.income}44`,
                                }
                              : {
                                  backgroundColor: `${colors.warning}1A`,
                                  borderColor: `${colors.warning}44`,
                                },
                          ]}
                        >
                          <Text
                            style={[
                              dynamicStyles.statusBadgeText,
                              { color: isSettled ? colors.income : colors.warning },
                            ]}
                          >
                            {isSettled ? 'SETTLED' : 'PENDING'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Big Tabular Amount */}
                  <View style={dynamicStyles.cardAmountWrapper}>
                    <Text
                      style={[
                        dynamicStyles.cardAmountText,
                        TYPOGRAPHY.tabularText,
                        isSettled
                          ? dynamicStyles.cardAmountSettled
                          : { color: themeColor },
                      ]}
                    >
                      {isLent ? '+' : '−'}₹
                      {effectiveAmount.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                    <Text style={dynamicStyles.cardDateText}>{effectiveDate}</Text>
                  </View>
                </View>

                {/* Card Middle: Money Source Info & Notes */}
                <View style={dynamicStyles.cardDetailsBox}>
                  <View style={dynamicStyles.sourceInfoRow}>
                    {linkedAcc ? (
                      <BankLogo account={linkedAcc} size={15} style={{ marginRight: 5 }} />
                    ) : (
                      <Ionicons
                        name="document-text-outline"
                        size={14}
                        color={colors.textMuted}
                        style={{ marginRight: 5 }}
                      />
                    )}
                    <Text style={dynamicStyles.sourceInfoText} numberOfLines={1}>
                      {linkedAcc
                        ? `Connected: ${linkedAcc.name} (${linkedAcc.type.toUpperCase()})`
                        : 'Untracked IOU (No account balance affected)'}
                    </Text>
                  </View>

                  {linkedTx?.note ? (
                    <Text style={dynamicStyles.cardNoteText} numberOfLines={2}>
                      Note: {linkedTx.note}
                    </Text>
                  ) : null}
                </View>

                {/* Card Footer: Action Buttons */}
                <View style={dynamicStyles.cardActionsRow}>
                  {linkedTx ? (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('TransactionDetail', {
                          transactionId: linkedTx.id,
                        })
                      }
                      style={dynamicStyles.viewTxBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={dynamicStyles.viewTxBtnText}>View Transaction</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}

                  <View style={dynamicStyles.cardRightActionGroup}>
                    {/* Edit Action Button */}
                    <TouchableOpacity
                      onPress={() => handleOpenEditModal(borrow)}
                      style={dynamicStyles.editBtn}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="pencil-outline" size={15} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Delete Action Button */}
                    <TouchableOpacity
                      onPress={() => setBorrowToDelete(borrow)}
                      style={dynamicStyles.deleteBtn}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.alert} />
                    </TouchableOpacity>

                    {/* Settle / Reopen Toggle Button */}
                    {isSettled ? (
                      <TouchableOpacity
                        onPress={() => handleReopenBorrow(borrow.id)}
                        style={dynamicStyles.reopenBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="refresh-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={dynamicStyles.reopenBtnText}>Reopen</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleOpenSettleModal(borrow)}
                        style={[dynamicStyles.settleBtn, { backgroundColor: accent.hex }]}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-done" size={14} color={colors.textInverse} style={{ marginRight: 4 }} />
                        <Text style={dynamicStyles.settleBtnText}>Settle Up</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          /* Empty State */
          <View style={dynamicStyles.emptyStateContainer}>
            <View style={dynamicStyles.emptyIconCircle}>
              <Ionicons name="people-outline" size={36} color={colors.textMuted} />
            </View>
            <Text style={dynamicStyles.emptyTitle}>
              {searchQuery ? 'No matching borrow records' : 'No records found in this view'}
            </Text>
            <Text style={dynamicStyles.emptySubtitle}>
              {searchQuery
                ? `No borrows or lending entries matching "${searchQuery}".`
                : 'Track loans, dinners, trip splits, and repayments with friends easily.'}
            </Text>

            {!searchQuery && (
              <View style={dynamicStyles.emptyActionRow}>
                <TactileButton
                  onPress={() => handleOpenAddModal('lent')}
                  style={[dynamicStyles.emptyAddBtn, { backgroundColor: colors.lent }]}
                >
                  <Text style={dynamicStyles.emptyAddBtnText}>+ Lent Money</Text>
                </TactileButton>

                <TactileButton
                  onPress={() => handleOpenAddModal('borrowed')}
                  style={[dynamicStyles.emptyAddBtn, { backgroundColor: colors.borrowed }]}
                >
                  <Text style={dynamicStyles.emptyAddBtnText}>+ Borrowed Money</Text>
                </TactileButton>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* ========================================================================= */}
      {/* 5. ADD BORROW / LEND MODAL (CONNECTED TO MONEY SOURCE + CALENDAR)        */}
      {/* ========================================================================= */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '92%' }]}>
            {/* Modal Header */}
            <View style={dynamicStyles.modalHeader}>
              <View>
                <Text style={dynamicStyles.modalTitle}>
                  {addType === 'lent' ? 'LEND MONEY' : 'BORROW MONEY'}
                </Text>
                <Text style={dynamicStyles.modalSubtitle}>
                  {addType === 'lent'
                    ? 'Track money you gave to someone'
                    : 'Track money you took from someone'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={dynamicStyles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <InlineError message={addError} onDismiss={() => setAddError(null)} />

            <KeyboardAwareScrollView
              ref={addModalScrollRef}
              contentContainerStyle={dynamicStyles.modalScrollContent}
              extraScrollHeight={60}
            >
              {/* Direction Toggle Pills */}
              <View style={dynamicStyles.directionToggleRow}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setAddType('lent');
                  }}
                  style={[
                    dynamicStyles.directionBtn,
                    addType === 'lent' && {
                      borderColor: colors.lent,
                      backgroundColor: colors.lentMuted,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={18}
                    color={addType === 'lent' ? colors.lent : colors.textMuted}
                  />
                  <View style={dynamicStyles.directionBtnTextCol}>
                    <Text
                      style={[
                        dynamicStyles.directionBtnTitle,
                        addType === 'lent' && { color: colors.lent, fontWeight: '700' },
                      ]}
                    >
                      I Lent Money
                    </Text>
                    <Text style={dynamicStyles.directionBtnSub}>They owe me</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setAddType('borrowed');
                    const sel = accounts.find((a) => a.id === selectedAccountId);
                    if (sel?.type === 'credit_card') {
                      setSelectedAccountId(eligibleAccounts[0]?.id || '');
                    }
                  }}
                  style={[
                    dynamicStyles.directionBtn,
                    addType === 'borrowed' && {
                      borderColor: colors.borrowed,
                      backgroundColor: colors.borrowedMuted,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={18}
                    color={addType === 'borrowed' ? colors.borrowed : colors.textMuted}
                  />
                  <View style={dynamicStyles.directionBtnTextCol}>
                    <Text
                      style={[
                        dynamicStyles.directionBtnTitle,
                        addType === 'borrowed' && { color: colors.borrowed, fontWeight: '700' },
                      ]}
                    >
                      I Borrowed Money
                    </Text>
                    <Text style={dynamicStyles.directionBtnSub}>I owe them</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Person Name Input with Smart Auto-Suggestions */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>PERSON NAME *</Text>
                <TextInput
                  value={personName}
                  onChangeText={setPersonName}
                  onFocus={() => {
                    setTimeout(() => {
                      addModalScrollRef.current?.scrollTo({ y: 50, animated: true });
                    }, 120);
                  }}
                  placeholder="e.g. Rahul, Sneha, Mom, Landlord"
                  placeholderTextColor={colors.textMuted}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={addType === 'lent' ? colors.lent : colors.borrowed}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />

                {personSuggestions.length > 0 && (
                  <View style={dynamicStyles.suggestionsContainer}>
                    <Text style={dynamicStyles.suggestionsTitle}>EXISTING CONTACTS / QUICK SELECT:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.suggestionsRow}>
                      {personSuggestions.map((p) => {
                        const isMatch = personName.trim().toLowerCase() === p.displayName.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={p.displayName}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setPersonName(p.displayName);
                            }}
                            style={[
                              dynamicStyles.personChip,
                              isMatch && {
                                borderColor: addType === 'lent' ? colors.lent : colors.borrowed,
                                backgroundColor:
                                  addType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                dynamicStyles.personChipText,
                                isMatch && {
                                  color: addType === 'lent' ? colors.lent : colors.borrowed,
                                  fontWeight: '700',
                                },
                              ]}
                            >
                              {p.displayName}
                            </Text>
                            {p.openCount > 0 && (
                              <View style={dynamicStyles.chipOpenBadge}>
                                <Text style={dynamicStyles.chipOpenBadgeText}>
                                  {p.pendingLent > 0 ? `+₹${p.pendingLent}` : `-₹${p.pendingBorrowed}`}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {matchedExistingPerson && matchedExistingPerson.openCount > 0 && (
                  <View style={dynamicStyles.modalNoticeBox}>
                    <Ionicons name="sparkles" size={15} color={accent.hex} style={{ marginRight: 6 }} />
                    <Text style={dynamicStyles.modalNoticeText}>
                      {matchedExistingPerson.pendingLent > 0 && matchedExistingPerson.pendingBorrowed > 0
                        ? `${matchedExistingPerson.displayName} has both Lent (+₹${matchedExistingPerson.pendingLent}) and Borrowed (-₹${matchedExistingPerson.pendingBorrowed}) open. Use Smart Settle on the main screen to balance.`
                        : matchedExistingPerson.pendingLent > 0
                        ? `${matchedExistingPerson.displayName} already has +₹${matchedExistingPerson.pendingLent} open in Lent. Entries can be merged.`
                        : `${matchedExistingPerson.displayName} already has -₹${matchedExistingPerson.pendingBorrowed} open in Borrowed. Entries can be merged.`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Amount Input */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>AMOUNT (₹) *</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={() => {
                    setTimeout(() => {
                      addModalScrollRef.current?.scrollTo({ y: 130, animated: true });
                    }, 120);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={addType === 'lent' ? colors.lent : colors.borrowed}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>

              {/* CONNECT TO MONEY SOURCE SECTION (CORE FEATURE) */}
              <View style={dynamicStyles.moneySourceSection}>
                <View style={dynamicStyles.moneySourceHeader}>
                  <View>
                    <Text style={dynamicStyles.moneySourceTitle}>MONEY SOURCE CONNECTION</Text>
                    <Text style={dynamicStyles.moneySourceSubtitle}>
                      {connectToAccount
                        ? addType === 'lent'
                          ? 'Deducts money from your account balance'
                          : 'Adds money to your account balance'
                        : 'Untracked IOU (leaves account balances untouched)'}
                    </Text>
                  </View>

                  <Switch
                    value={connectToAccount}
                    onValueChange={(val) => {
                      Haptics.selectionAsync().catch(() => {});
                      setConnectToAccount(val);
                    }}
                    trackColor={{ false: colors.border, true: accent.hex }}
                    thumbColor={colors.surface}
                  />
                </View>

                {connectToAccount && (
                  <View style={dynamicStyles.accountsList}>
                    <Text style={dynamicStyles.selectAccountLabel}>SELECT PAYMENT ACCOUNT:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.accountsPillsRow}>
                      {accountsForAdd.map((acc) => {
                        const isSelected = selectedAccountId === acc.id;
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
                              Haptics.selectionAsync().catch(() => {});
                              setSelectedAccountId(acc.id);
                            }}
                            style={[
                              dynamicStyles.accountCardPill,
                              isSelected && {
                                borderColor: addType === 'lent' ? colors.lent : colors.borrowed,
                                backgroundColor:
                                  addType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                              },
                            ]}
                            activeOpacity={0.8}
                          >
                            <BankLogo
                              account={acc}
                              size={20}
                              style={{ marginRight: 6 }}
                            />
                            <View style={dynamicStyles.accountCardPillInfo}>
                              <Text
                                style={[
                                  dynamicStyles.accountCardPillName,
                                  isSelected && {
                                    color: addType === 'lent' ? colors.lent : colors.borrowed,
                                    fontWeight: '700',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {acc.name}
                              </Text>
                              <Text
                                style={[dynamicStyles.accountCardPillBal, TYPOGRAPHY.tabularText]}
                              >
                                {balText}
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color={addType === 'lent' ? colors.lent : colors.borrowed}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Impact preview pill */}
                    <View
                      style={[
                        dynamicStyles.impactNoticePill,
                        {
                          backgroundColor:
                            addType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                          borderColor: `${
                            addType === 'lent' ? colors.lent : colors.borrowed
                          }44`,
                        },
                      ]}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={15}
                        color={addType === 'lent' ? colors.lent : colors.borrowed}
                      />
                      <Text
                        style={[
                          dynamicStyles.impactNoticeText,
                          { color: addType === 'lent' ? colors.lent : colors.borrowed },
                        ]}
                      >
                        {addType === 'lent'
                          ? `₹${amount || '0'} will be deducted from ${
                              activeSelectedAccount?.name || 'Selected Account'
                            }`
                          : `₹${amount || '0'} will be deposited into ${
                              activeSelectedAccount?.name || 'Selected Account'
                            }`}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Clickable Date Card calling native Calendar picker */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>ENTRY DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowAddDatePicker(true)}
                  activeOpacity={0.7}
                  style={[
                    dynamicStyles.dateSelectorCard,
                    showAddDatePicker && {
                      borderColor: addType === 'lent' ? colors.lent : colors.borrowed,
                      backgroundColor:
                        addType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                    },
                  ]}
                >
                  <View
                    style={[
                      dynamicStyles.dateIconBadge,
                      {
                        backgroundColor:
                          addType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                      },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={addType === 'lent' ? colors.lent : colors.borrowed}
                    />
                  </View>
                  <View style={dynamicStyles.dateTextCol}>
                    <Text style={dynamicStyles.dateSelectedText}>{formatDateLabel(addDate)}</Text>
                  </View>
                  <View
                    style={[
                      dynamicStyles.dateChangeBadge,
                      {
                        borderColor: `${addType === 'lent' ? colors.lent : colors.borrowed}44`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        dynamicStyles.dateChangeBadgeText,
                        { color: addType === 'lent' ? colors.lent : colors.borrowed },
                      ]}
                    >
                      Pick Date
                    </Text>
                    <Ionicons
                      name="calendar"
                      size={13}
                      color={addType === 'lent' ? colors.lent : colors.borrowed}
                    />
                  </View>
                </TouchableOpacity>

                {showAddDatePicker &&
                  (Platform.OS === 'ios' ? (
                    <Modal
                      transparent
                      animationType="fade"
                      visible={showAddDatePicker}
                      onRequestClose={() => setShowAddDatePicker(false)}
                    >
                      <View style={dynamicStyles.datePickerModalBackdrop}>
                        <View style={dynamicStyles.datePickerModalCard}>
                          <View style={dynamicStyles.datePickerModalHeader}>
                            <Text style={dynamicStyles.datePickerModalTitle}>Select Date</Text>
                            <TouchableOpacity onPress={() => setShowAddDatePicker(false)}>
                              <Text
                                style={[
                                  dynamicStyles.datePickerModalDoneText,
                                  { color: accent.hex },
                                ]}
                              >
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <DateTimePicker
                            value={parseDateObj(addDate)}
                            mode="date"
                            display="inline"
                            themeVariant={effectiveTheme === 'light' ? 'light' : 'dark'}
                            onChange={handleAddDateChange}
                          />
                        </View>
                      </View>
                    </Modal>
                  ) : (
                    <DateTimePicker
                      value={parseDateObj(addDate)}
                      mode="date"
                      display="default"
                      onChange={handleAddDateChange}
                    />
                  ))}
              </View>

              {/* Optional Note */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>NOTES & REMARKS (OPTIONAL)</Text>
                <TextInput
                  value={addNote}
                  onChangeText={setAddNote}
                  onFocus={() => {
                    setTimeout(() => {
                      addModalScrollRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }}
                  placeholder="e.g. Dinner split, Travel ticket, Emergency loan"
                  placeholderTextColor={colors.textMuted}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>

              {/* Save & Cancel Buttons */}
              <View style={dynamicStyles.modalActionButtonsRow}>
                <TouchableOpacity
                  onPress={() => setShowAddModal(false)}
                  style={dynamicStyles.modalCancelBtn}
                  activeOpacity={0.7}
                >
                  <Text style={dynamicStyles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TactileButton
                  onPress={handleSaveAddBorrow}
                  disabled={isSubmittingAdd}
                  style={[
                    dynamicStyles.modalSubmitBtn,
                    { backgroundColor: addType === 'lent' ? colors.lent : colors.borrowed },
                  ]}
                >
                  {isSubmittingAdd ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={dynamicStyles.modalSubmitBtnText}>Save Entry</Text>
                  )}
                </TactileButton>
              </View>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. SETTLE BORROW MODAL (CONNECT TO REPAYMENT MONEY SOURCE + CALENDAR)      */}
      {/* ========================================================================= */}
      <Modal
        visible={Boolean(settleBorrowItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setSettleBorrowItem(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '90%' }]}>
            {settleBorrowItem && (
              <>
                <View style={dynamicStyles.modalHeader}>
                  <View>
                    <Text style={dynamicStyles.modalTitle}>SETTLE UP ENTRY</Text>
                    <Text style={dynamicStyles.modalSubtitle}>
                      Record the return of borrowed or lent money
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSettleBorrowItem(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={dynamicStyles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <KeyboardAwareScrollView
                  ref={settleModalScrollRef}
                  contentContainerStyle={dynamicStyles.modalScrollContent}
                  extraScrollHeight={60}
                >
                  {/* Settle Target Summary Card */}
                  {(() => {
                    const { type, displayName } = parseBorrowDetails(
                      settleBorrowItem,
                      transactions
                    );
                    const isLent = type === 'lent';
                    return (
                      <View style={dynamicStyles.settleTargetCard}>
                        <View style={dynamicStyles.settleTargetInfo}>
                          <Text style={dynamicStyles.settleTargetName}>{displayName}</Text>
                          <Text style={dynamicStyles.settleTargetSub}>
                            {isLent
                              ? 'Returning money that was lent to them'
                              : 'Repaying debt that was borrowed from them'}
                          </Text>
                        </View>
                        <Text
                          style={[
                            dynamicStyles.settleTargetAmount,
                            TYPOGRAPHY.tabularText,
                            { color: isLent ? colors.lent : colors.borrowed },
                          ]}
                        >
                          ₹{Number(settleBorrowItem.amount).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </Text>
                      </View>
                    );
                  })()}

                  {/* Settle Mode Options */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>SETTLEMENT METHOD</Text>
                    <View style={dynamicStyles.settleModeRow}>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSettleMode('with_account');
                        }}
                        style={[
                          dynamicStyles.settleModeBtn,
                          settleMode === 'with_account' && {
                            borderColor: accent.hex,
                            backgroundColor: `${accent.hex}18`,
                          },
                        ]}
                      >
                        <Ionicons
                          name="wallet-outline"
                          size={16}
                          color={settleMode === 'with_account' ? accent.hex : colors.textMuted}
                        />
                        <Text
                          style={[
                            dynamicStyles.settleModeBtnText,
                            settleMode === 'with_account' && {
                              color: accent.hex,
                              fontWeight: '700',
                            },
                          ]}
                        >
                          Log to Money Source
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSettleMode('without_account');
                        }}
                        style={[
                          dynamicStyles.settleModeBtn,
                          settleMode === 'without_account' && {
                            borderColor: accent.hex,
                            backgroundColor: `${accent.hex}18`,
                          },
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={16}
                          color={settleMode === 'without_account' ? accent.hex : colors.textMuted}
                        />
                        <Text
                          style={[
                            dynamicStyles.settleModeBtnText,
                            settleMode === 'without_account' && {
                              color: accent.hex,
                              fontWeight: '700',
                            },
                          ]}
                        >
                          Mark Settled Only
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Account Selector for Settlement */}
                  {settleMode === 'with_account' && (
                    <View style={dynamicStyles.modalFieldGroup}>
                      <Text style={dynamicStyles.modalFieldLabel}>
                        {parseBorrowDetails(settleBorrowItem, transactions).type === 'lent'
                          ? 'DEPOSIT REPAYMENT INTO ACCOUNT:'
                          : 'DEDUCT REPAYMENT FROM ACCOUNT:'}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={dynamicStyles.accountsPillsRow}
                      >
                        {eligibleAccounts.map((acc) => {
                          const isSelected = settleAccountId === acc.id;
                          return (
                            <TouchableOpacity
                              key={acc.id}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setSettleAccountId(acc.id);
                              }}
                              style={[
                                dynamicStyles.accountCardPill,
                                isSelected && {
                                  borderColor: accent.hex,
                                  backgroundColor: `${accent.hex}18`,
                                },
                              ]}
                            >
                              <BankLogo
                                account={acc}
                                size={20}
                                style={{ marginRight: 6 }}
                              />
                              <View style={dynamicStyles.accountCardPillInfo}>
                                <Text
                                  style={[
                                    dynamicStyles.accountCardPillName,
                                    isSelected && { color: accent.hex, fontWeight: '700' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {acc.name}
                                </Text>
                                <Text
                                  style={[
                                    dynamicStyles.accountCardPillBal,
                                    TYPOGRAPHY.tabularText,
                                  ]}
                                >
                                  ₹{Number(acc.current_balance).toLocaleString('en-IN')}
                                </Text>
                              </View>
                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={14} color={accent.hex} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Notice */}
                      <View style={dynamicStyles.settleNoticeBox}>
                        <Ionicons name="swap-vertical-outline" size={16} color={accent.hex} />
                        <Text style={dynamicStyles.settleNoticeText}>
                          {parseBorrowDetails(settleBorrowItem, transactions).type === 'lent'
                            ? `₹${settleBorrowItem.amount} will be credited into ${
                                activeSettleAccount?.name || 'Selected Account'
                              }`
                            : `₹${settleBorrowItem.amount} will be debited from ${
                                activeSettleAccount?.name || 'Selected Account'
                              }`}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Settlement Date with Clickable Calendar Trigger */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>SETTLEMENT DATE</Text>
                    <TouchableOpacity
                      onPress={() => setShowSettleDatePicker(true)}
                      activeOpacity={0.7}
                      style={[
                        dynamicStyles.dateSelectorCard,
                        showSettleDatePicker && {
                          borderColor: accent.hex,
                          backgroundColor: `${accent.hex}14`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          dynamicStyles.dateIconBadge,
                          { backgroundColor: `${accent.hex}18` },
                        ]}
                      >
                        <Ionicons name="calendar-outline" size={18} color={accent.hex} />
                      </View>
                      <View style={dynamicStyles.dateTextCol}>
                        <Text style={dynamicStyles.dateSelectedText}>
                          {formatDateLabel(settleDate)}
                        </Text>
                      </View>
                      <View
                        style={[
                          dynamicStyles.dateChangeBadge,
                          { borderColor: `${accent.hex}44` },
                        ]}
                      >
                        <Text style={[dynamicStyles.dateChangeBadgeText, { color: accent.hex }]}>
                          Pick Date
                        </Text>
                        <Ionicons name="calendar" size={13} color={accent.hex} />
                      </View>
                    </TouchableOpacity>

                    {showSettleDatePicker &&
                      (Platform.OS === 'ios' ? (
                        <Modal
                          transparent
                          animationType="fade"
                          visible={showSettleDatePicker}
                          onRequestClose={() => setShowSettleDatePicker(false)}
                        >
                          <View style={dynamicStyles.datePickerModalBackdrop}>
                            <View style={dynamicStyles.datePickerModalCard}>
                              <View style={dynamicStyles.datePickerModalHeader}>
                                <Text style={dynamicStyles.datePickerModalTitle}>
                                  Select Settlement Date
                                </Text>
                                <TouchableOpacity onPress={() => setShowSettleDatePicker(false)}>
                                  <Text
                                    style={[
                                      dynamicStyles.datePickerModalDoneText,
                                      { color: accent.hex },
                                    ]}
                                  >
                                    Done
                                  </Text>
                                </TouchableOpacity>
                              </View>
                              <DateTimePicker
                                value={parseDateObj(settleDate)}
                                mode="date"
                                display="inline"
                                themeVariant={effectiveTheme === 'light' ? 'light' : 'dark'}
                                onChange={handleSettleDateChange}
                              />
                            </View>
                          </View>
                        </Modal>
                      ) : (
                        <DateTimePicker
                          value={parseDateObj(settleDate)}
                          mode="date"
                          display="default"
                          onChange={handleSettleDateChange}
                        />
                      ))}
                  </View>

                  {/* Remarks */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>REMARKS (OPTIONAL)</Text>
                    <TextInput
                      value={settleNote}
                      onChangeText={setSettleNote}
                      placeholder="e.g. Paid via GPay / UPI, Settled in cash"
                      placeholderTextColor={colors.textMuted}
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={accent.hex}
                      textColor={colors.textPrimary}
                      style={dynamicStyles.modalTextInput}
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={dynamicStyles.modalActionButtonsRow}>
                    <TouchableOpacity
                      onPress={() => setSettleBorrowItem(null)}
                      style={dynamicStyles.modalCancelBtn}
                    >
                      <Text style={dynamicStyles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TactileButton
                      onPress={handleConfirmSettle}
                      disabled={isSubmittingSettle}
                      style={[dynamicStyles.modalSubmitBtn, { backgroundColor: accent.hex }]}
                    >
                      {isSubmittingSettle ? (
                        <ActivityIndicator size="small" color={colors.textInverse} />
                      ) : (
                        <Text style={dynamicStyles.modalSubmitBtnText}>Confirm Settlement</Text>
                      )}
                    </TactileButton>
                  </View>
                </KeyboardAwareScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. DELETE CONFIRMATION MODAL                                             */}
      {/* ========================================================================= */}
      <Modal
        visible={Boolean(borrowToDelete)}
        transparent
        animationType="fade"
        onRequestClose={() => setBorrowToDelete(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={dynamicStyles.deleteDialogCard}>
            <View style={dynamicStyles.deleteDialogIconCircle}>
              <Ionicons name="trash-outline" size={28} color={colors.alert} />
            </View>

            <Text style={dynamicStyles.deleteDialogTitle}>Delete Borrow Entry?</Text>
            <Text style={dynamicStyles.deleteDialogMessage}>
              Are you sure you want to remove the record for{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {borrowToDelete ? parseBorrowDetails(borrowToDelete, transactions).displayName : ''}
              </Text>{' '}
              (₹{borrowToDelete?.amount})?
            </Text>

            {borrowToDelete?.linked_transaction_id && (
              <TouchableOpacity
                style={dynamicStyles.deleteLinkedOption}
                onPress={() => setDeleteLinkedTx(!deleteLinkedTx)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={deleteLinkedTx ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={deleteLinkedTx ? colors.alert : colors.textMuted}
                />
                <Text style={dynamicStyles.deleteLinkedOptionText}>
                  Also remove linked transaction & restore account balance
                </Text>
              </TouchableOpacity>
            )}

            <View style={dynamicStyles.deleteDialogActionsRow}>
              <TouchableOpacity
                onPress={() => setBorrowToDelete(null)}
                style={dynamicStyles.deleteDialogCancelBtn}
              >
                <Text style={dynamicStyles.deleteDialogCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                onPress={handleConfirmDelete}
                disabled={isDeleting}
                style={dynamicStyles.deleteDialogConfirmBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={dynamicStyles.deleteDialogConfirmBtnText}>Delete</Text>
                )}
              </TactileButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. EDIT BORROW MODAL (IN-SYNC WITH TRANSACTIONS & MONEY SOURCE)           */}
      {/* ========================================================================= */}
      <Modal
        visible={Boolean(editBorrowItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditBorrowItem(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '92%' }]}>
            {editBorrowItem && (
              <>
                <View style={dynamicStyles.modalHeader}>
                  <View>
                    <Text style={dynamicStyles.modalTitle}>EDIT BORROW / LENT</Text>
                    <Text style={dynamicStyles.modalSubtitle}>
                      Update person, amount, date or money source
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditBorrowItem(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={dynamicStyles.modalCloseBtn}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <InlineError message={editError} onDismiss={() => setEditError(null)} />

                <KeyboardAwareScrollView
                  ref={editModalScrollRef}
                  contentContainerStyle={dynamicStyles.modalScrollContent}
                  extraScrollHeight={100}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Direction Switch */}
                  <View style={dynamicStyles.directionToggleRow}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setEditType('lent');
                      }}
                      style={[
                        dynamicStyles.directionBtn,
                        editType === 'lent' && {
                          borderColor: colors.lent,
                          backgroundColor: colors.lentMuted,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="arrow-up-circle-outline"
                        size={18}
                        color={editType === 'lent' ? colors.lent : colors.textMuted}
                      />
                      <View style={dynamicStyles.directionBtnTextCol}>
                        <Text
                          style={[
                            dynamicStyles.directionBtnTitle,
                            editType === 'lent' && { color: colors.lent, fontWeight: '700' },
                          ]}
                        >
                          I Lent Money
                        </Text>
                        <Text style={dynamicStyles.directionBtnSub}>They owe me</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setEditType('borrowed');
                        const sel = accounts.find((a) => a.id === editAccountId);
                        if (sel?.type === 'credit_card') {
                          setEditAccountId(eligibleAccounts[0]?.id || '');
                        }
                      }}
                      style={[
                        dynamicStyles.directionBtn,
                        editType === 'borrowed' && {
                          borderColor: colors.borrowed,
                          backgroundColor: colors.borrowedMuted,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="arrow-down-circle-outline"
                        size={18}
                        color={editType === 'borrowed' ? colors.borrowed : colors.textMuted}
                      />
                      <View style={dynamicStyles.directionBtnTextCol}>
                        <Text
                          style={[
                            dynamicStyles.directionBtnTitle,
                            editType === 'borrowed' && { color: colors.borrowed, fontWeight: '700' },
                          ]}
                        >
                          I Borrowed Money
                        </Text>
                        <Text style={dynamicStyles.directionBtnSub}>I owe them</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Person Name Input */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>PERSON NAME *</Text>
                    <TextInput
                      value={editPersonName}
                      onChangeText={setEditPersonName}
                      placeholder="e.g. Rahul, Sneha, Mom, Landlord"
                      placeholderTextColor={colors.textMuted}
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={editType === 'lent' ? colors.lent : colors.borrowed}
                      textColor={colors.textPrimary}
                      style={dynamicStyles.modalTextInput}
                    />
                  </View>

                  {/* Amount Input */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>AMOUNT (₹) *</Text>
                    <TextInput
                      value={editAmount}
                      onChangeText={setEditAmount}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={editType === 'lent' ? colors.lent : colors.borrowed}
                      textColor={colors.textPrimary}
                      style={dynamicStyles.modalTextInput}
                    />
                  </View>

                  {/* CONNECT TO MONEY SOURCE SECTION */}
                  <View style={dynamicStyles.moneySourceSection}>
                    <View style={dynamicStyles.moneySourceHeader}>
                      <View>
                        <Text style={dynamicStyles.moneySourceTitle}>MONEY SOURCE CONNECTION</Text>
                        <Text style={dynamicStyles.moneySourceSubtitle}>
                          {editConnectToAccount
                            ? editType === 'lent'
                              ? 'Deducts money from your account balance'
                              : 'Adds money to your account balance'
                            : 'Untracked IOU (leaves account balances untouched)'}
                        </Text>
                      </View>

                      <Switch
                        value={editConnectToAccount}
                        onValueChange={(val) => {
                          Haptics.selectionAsync().catch(() => {});
                          setEditConnectToAccount(val);
                        }}
                        trackColor={{ false: colors.border, true: accent.hex }}
                        thumbColor={colors.surface}
                      />
                    </View>

                    {editConnectToAccount && (
                      <View style={dynamicStyles.accountsList}>
                        <Text style={dynamicStyles.selectAccountLabel}>SELECT PAYMENT ACCOUNT:</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.accountsPillsRow}>
                          {accountsForEdit.map((acc) => {
                            const isSelected = editAccountId === acc.id;
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
                                  Haptics.selectionAsync().catch(() => {});
                                  setEditAccountId(acc.id);
                                }}
                                style={[
                                  dynamicStyles.accountCardPill,
                                  isSelected && {
                                    borderColor: editType === 'lent' ? colors.lent : colors.borrowed,
                                    backgroundColor:
                                      editType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                                  },
                                ]}
                                activeOpacity={0.8}
                              >
                                <BankLogo
                                  account={acc}
                                  size={20}
                                  style={{ marginRight: 6 }}
                                />
                                <View style={dynamicStyles.accountCardPillInfo}>
                                  <Text
                                    style={[
                                      dynamicStyles.accountCardPillName,
                                      isSelected && {
                                        color: editType === 'lent' ? colors.lent : colors.borrowed,
                                        fontWeight: '700',
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {acc.name}
                                  </Text>
                                  <Text
                                    style={[dynamicStyles.accountCardPillBal, TYPOGRAPHY.tabularText]}
                                  >
                                    {balText}
                                  </Text>
                                </View>
                                {isSelected && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={14}
                                    color={editType === 'lent' ? colors.lent : colors.borrowed}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Date Input */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>TRANSACTION DATE</Text>
                    <TouchableOpacity
                      onPress={() => setShowEditDatePicker(true)}
                      activeOpacity={0.7}
                      style={[
                        dynamicStyles.dateSelectorCard,
                        showEditDatePicker && {
                          borderColor: editType === 'lent' ? colors.lent : colors.borrowed,
                          backgroundColor:
                            editType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                        },
                      ]}
                    >
                      <View
                        style={[
                          dynamicStyles.dateIconBadge,
                          {
                            backgroundColor:
                              editType === 'lent' ? colors.lentMuted : colors.borrowedMuted,
                          },
                        ]}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={editType === 'lent' ? colors.lent : colors.borrowed}
                        />
                      </View>
                      <View style={dynamicStyles.dateTextCol}>
                        <Text style={dynamicStyles.dateSelectedText}>{formatDateLabel(editDate)}</Text>
                      </View>
                    </TouchableOpacity>

                    {showEditDatePicker &&
                      (Platform.OS === 'ios' ? (
                        <Modal visible={showEditDatePicker} transparent animationType="fade">
                          <View style={dynamicStyles.datePickerModalBackdrop}>
                            <View style={dynamicStyles.datePickerModalCard}>
                              <View style={dynamicStyles.datePickerModalHeader}>
                                <Text style={dynamicStyles.datePickerModalTitle}>Select Date</Text>
                                <TouchableOpacity onPress={() => setShowEditDatePicker(false)}>
                                  <Text style={[dynamicStyles.datePickerModalDoneText, { color: accent.hex }]}>Done</Text>
                                </TouchableOpacity>
                              </View>
                              <DateTimePicker
                                value={parseDateObj(editDate)}
                                mode="date"
                                display="inline"
                                themeVariant={effectiveTheme === 'light' ? 'light' : 'dark'}
                                onChange={(e, d) => {
                                  if (d) setEditDate(formatLocalDate(d));
                                }}
                              />
                            </View>
                          </View>
                        </Modal>
                      ) : (
                        <DateTimePicker
                          value={parseDateObj(editDate)}
                          mode="date"
                          display="default"
                          onChange={(e, d) => {
                            setShowEditDatePicker(false);
                            if (e.type === 'set' && d) setEditDate(formatLocalDate(d));
                          }}
                        />
                      ))}
                  </View>

                  {/* Note Input */}
                  <View style={dynamicStyles.modalFieldGroup}>
                    <Text style={dynamicStyles.modalFieldLabel}>NOTES (OPTIONAL)</Text>
                    <TextInput
                      value={editNote}
                      onChangeText={setEditNote}
                      placeholder="Add any extra detail..."
                      placeholderTextColor={colors.textMuted}
                      mode="outlined"
                      outlineColor={colors.border}
                      activeOutlineColor={editType === 'lent' ? colors.lent : colors.borrowed}
                      textColor={colors.textPrimary}
                      style={dynamicStyles.modalTextInput}
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={dynamicStyles.modalActionButtonsRow}>
                    <TouchableOpacity
                      onPress={() => setEditBorrowItem(null)}
                      style={dynamicStyles.modalCancelBtn}
                    >
                      <Text style={dynamicStyles.modalCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TactileButton
                      onPress={handleSaveEditBorrow}
                      disabled={isSubmittingEdit}
                      style={[
                        dynamicStyles.modalSubmitBtn,
                        { backgroundColor: editType === 'lent' ? colors.lent : colors.borrowed },
                      ]}
                    >
                      {isSubmittingEdit ? (
                        <ActivityIndicator size="small" color={colors.textInverse} />
                      ) : (
                        <Text style={dynamicStyles.modalSubmitBtnText}>Save Changes</Text>
                      )}
                    </TactileButton>
                  </View>
                </KeyboardAwareScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

// =========================================================================
// STYLESHEET WITH FULL DYNAMIC THEME SUPPORT
// =========================================================================
const getStyles = (colors: ThemeColors, accentHex: string) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: SPACING.md,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginRight: SPACING.sm,
    },
    headerTitleCol: {
      flex: 1,
      justifyContent: 'center',
    },
    headerBackBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appTitle: {
      color: accentHex,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
    },
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: accentHex,
      flexShrink: 0,
    },
    headerAddBtnText: {
      color: colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    scrollContent: {
      padding: SPACING.lg,
    },
    summarySection: {
      marginBottom: SPACING.lg,
    },
    summaryCardsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    metricCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderRadius: 12,
      padding: SPACING.md,
    },
    metricCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.xs,
    },
    metricBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    metricBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    metricCountText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    metricAmount: {
      fontSize: 20,
      fontWeight: '800',
      marginVertical: 4,
    },
    metricSubtext: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    netPositionCapsule: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 10,
      borderWidth: 1,
    },
    netPositionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    netPositionLabel: {
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    netPositionValue: {
      fontSize: 14,
      fontWeight: '800',
    },
    searchFilterContainer: {
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    searchInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: SPACING.md,
      height: 42,
    },
    searchIcon: {
      marginRight: SPACING.xs,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      backgroundColor: 'transparent',
      height: 40,
    },
    searchClearBtn: {
      padding: 4,
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingVertical: 2,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
    },
    filterChipText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    filterCountBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    filterCountBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    borrowCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    borrowCardSettled: {
      opacity: 0.75,
      backgroundColor: colors.surfaceLight,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.xs,
    },
    avatarAndName: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
      marginRight: SPACING.sm,
    },
    personAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personAvatarText: {
      fontSize: 18,
      fontWeight: '800',
    },
    nameMetaColumn: {
      flex: 1,
    },
    personNameText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 3,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    directionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
    },
    directionBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
    },
    statusBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    cardAmountWrapper: {
      alignItems: 'flex-end',
    },
    cardAmountText: {
      fontSize: 16,
      fontWeight: '800',
    },
    cardAmountSettled: {
      color: colors.textMuted,
      textDecorationLine: 'line-through',
    },
    cardDateText: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    cardDetailsBox: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 8,
      padding: SPACING.sm,
      marginTop: SPACING.xs,
      marginBottom: SPACING.sm,
      gap: 4,
    },
    sourceInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sourceInfoText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
      flex: 1,
    },
    cardNoteText: {
      fontSize: 11,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
    cardActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
    },
    viewTxBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    viewTxBtnText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    cardRightActionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    deleteBtn: {
      padding: 6,
    },
    settleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: 8,
    },
    settleBtnText: {
      color: colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    reopenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    reopenBtnText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    emptyStateContainer: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: SPACING.xl,
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: SPACING.lg,
    },
    emptyActionRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    emptyAddBtn: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: 10,
      borderRadius: 8,
    },
    emptyAddBtnText: {
      color: colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingTop: SPACING.lg,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    modalSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalScrollContent: {
      padding: SPACING.lg,
      paddingBottom: SPACING.xl * 2,
    },
    directionToggleRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    directionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    directionBtnTextCol: {
      flex: 1,
    },
    directionBtnTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    directionBtnSub: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 1,
    },
    modalFieldGroup: {
      marginBottom: SPACING.md,
    },
    modalFieldLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    modalTextInput: {
      backgroundColor: colors.surfaceLight,
      fontSize: 14,
    },
    dateSelectorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
    },
    dateIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.sm,
    },
    dateTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    dateSelectedText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    dateChangeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      backgroundColor: colors.surface,
    },
    dateChangeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    datePickerModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    datePickerModalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.lg,
    },
    datePickerModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
      paddingBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    datePickerModalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    datePickerModalDoneText: {
      fontSize: 15,
      fontWeight: '700',
    },
    moneySourceSection: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    moneySourceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    moneySourceTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: 0.8,
    },
    moneySourceSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      maxWidth: 240,
    },
    accountsList: {
      marginTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: SPACING.sm,
    },
    selectAccountLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    accountsPillsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingBottom: SPACING.xs,
    },
    accountCardPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: SPACING.md,
      paddingVertical: 8,
      minWidth: 130,
    },
    accountCardPillInfo: {
      flex: 1,
    },
    accountCardPillName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    accountCardPillBal: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 1,
    },
    impactNoticePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 8,
      padding: SPACING.sm,
      marginTop: SPACING.sm,
    },
    impactNoticeText: {
      fontSize: 11,
      fontWeight: '600',
      flex: 1,
    },
    modalActionButtonsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    modalCancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    modalSubmitBtn: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSubmitBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverse,
    },
    settleTargetCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    settleTargetInfo: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    settleTargetName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    settleTargetSub: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    settleTargetAmount: {
      fontSize: 18,
      fontWeight: '800',
    },
    settleModeRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    settleModeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    settleModeBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    settleNoticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: `${accentHex}14`,
      borderColor: `${accentHex}33`,
      borderWidth: 1,
      borderRadius: 8,
      padding: SPACING.sm,
      marginTop: SPACING.sm,
    },
    settleNoticeText: {
      fontSize: 11,
      fontWeight: '600',
      color: accentHex,
      flex: 1,
    },
    deleteDialogCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: SPACING.xl,
      marginHorizontal: SPACING.xl,
      alignSelf: 'center',
      width: '88%',
      alignItems: 'center',
    },
    deleteDialogIconCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: `${colors.alert}1A`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    deleteDialogTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
    },
    deleteDialogMessage: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: SPACING.lg,
    },
    deleteLinkedOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceLight,
      padding: SPACING.md,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.lg,
      width: '100%',
    },
    deleteLinkedOptionText: {
      fontSize: 12,
      color: colors.textPrimary,
      fontWeight: '500',
      flex: 1,
    },
    deleteDialogActionsRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      width: '100%',
    },
    deleteDialogCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    deleteDialogCancelBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    deleteDialogConfirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.alert,
    },
    deleteDialogConfirmBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    editBtn: {
      padding: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      marginRight: 6,
    },
    smartSection: {
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    smartSectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    smartHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    smartSectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: accentHex,
      letterSpacing: 0.8,
    },
    smartBadgeCount: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      backgroundColor: colors.surfaceLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    smartGroupCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${accentHex}33`,
      padding: SPACING.md,
      gap: 10,
    },
    smartGroupTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    smartGroupName: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    smartBothBadge: {
      backgroundColor: `${colors.income}1A`,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: `${colors.income}44`,
    },
    smartBothBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.income,
    },
    smartSameBadge: {
      backgroundColor: `${accentHex}1A`,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: `${accentHex}44`,
    },
    smartSameBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: accentHex,
    },
    smartActionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: SPACING.md,
    },
    smartAmountsCol: {
      flex: 1,
    },
    smartDetailText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    smartNetText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 2,
    },
    smartActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
    },
    smartActionBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    suggestionsContainer: {
      marginTop: 6,
    },
    suggestionsTitle: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    suggestionsRow: {
      gap: 6,
      paddingVertical: 2,
    },
    personChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      gap: 5,
    },
    personChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    chipOpenBadge: {
      backgroundColor: colors.surface,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOpenBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.textMuted,
    },
    modalNoticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${accentHex}14`,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${accentHex}33`,
      padding: 8,
      marginTop: 6,
    },
    modalNoticeText: {
      fontSize: 11,
      color: colors.textPrimary,
      flex: 1,
      lineHeight: 15,
    },
  });
