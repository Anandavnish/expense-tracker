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
import {
  buildPersonLedgers,
  PersonLedger,
} from '../../utils/personLedger';

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
  const { accent, colors } = useSettingsStore();
  const {
    borrows,
    transactions,
    accounts,
    addBorrowWithTransactionOptimistic,
    updateBorrowWithTransactionOptimistic,
    settlePersonLedgerOptimistic,
    deleteBorrowOptimistic,
    inlineError,
    setInlineError,
  } = useFinanceStore();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'settled' | 'lent' | 'borrowed'>('all');

  // Expanded state for person ledgers
  const [expandedPersons, setExpandedPersons] = useState<Record<string, boolean>>({});

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

  // Edit Modal State (for editing a specific borrow entry)
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

  // Smart Person Settlement Modal State
  const [settlePersonItem, setSettlePersonItem] = useState<PersonLedger | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDirection, setSettleDirection] = useState<'received' | 'paid'>('received');
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

  // Accounts
  const eligibleAccounts = useMemo(() => {
    return accounts.filter((a) => a.type !== 'credit_card');
  }, [accounts]);

  const accountsForAdd = useMemo(() => {
    if (addType === 'lent') return accounts;
    return eligibleAccounts;
  }, [accounts, eligibleAccounts, addType]);

  const accountsForEdit = useMemo(() => {
    if (editType === 'lent') return accounts;
    return eligibleAccounts;
  }, [accounts, eligibleAccounts, editType]);

  // Unified Person Ledgers (Core Auto-Merge Data Source)
  const personLedgers = useMemo(() => {
    return buildPersonLedgers(borrows, transactions, accounts);
  }, [borrows, transactions, accounts]);

  // Executive summary metrics
  const { totalPendingLent, totalPendingBorrowed, pendingContactCount } = useMemo(() => {
    let lent = 0;
    let borrowed = 0;
    let count = 0;
    personLedgers.forEach((p) => {
      if (p.status === 'pending') {
        count += 1;
        if (p.netBalance > 0) {
          lent += p.netBalance;
        } else if (p.netBalance < 0) {
          borrowed += Math.abs(p.netBalance);
        }
      }
    });
    return {
      totalPendingLent: lent,
      totalPendingBorrowed: borrowed,
      pendingContactCount: count,
    };
  }, [personLedgers]);

  const netPending = totalPendingLent - totalPendingBorrowed;

  // Filtered Person Ledgers
  const filteredPersonLedgers = useMemo(() => {
    return personLedgers.filter((p) => {
      if (filter === 'pending' && p.status !== 'pending') return false;
      if (filter === 'settled' && p.status !== 'settled') return false;
      if (filter === 'lent' && p.netBalance <= 0) return false;
      if (filter === 'borrowed' && p.netBalance >= 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.personName.toLowerCase().includes(q);
        const matchesEntry = p.entries.some(
          (e) =>
            (e.note && e.note.toLowerCase().includes(q)) ||
            String(e.amount).includes(q) ||
            (e.accountName && e.accountName.toLowerCase().includes(q))
        );
        if (!matchesName && !matchesEntry) return false;
      }
      return true;
    });
  }, [personLedgers, filter, searchQuery]);

  // Suggestions for Add Modal (existing contacts with balance)
  const personSuggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return personLedgers.slice(0, 6);
    return personLedgers.filter((p) => p.personName.toLowerCase().includes(q)).slice(0, 6);
  }, [personLedgers, personName]);

  const matchedExistingLedger = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return null;
    return personLedgers.find((p) => p.personName.toLowerCase() === q) || null;
  }, [personLedgers, personName]);

  // Projected Net Balance calculation when adding entry to an existing person
  const projectedNet = useMemo(() => {
    if (!matchedExistingLedger) return null;
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) return matchedExistingLedger.netBalance;

    if (addType === 'lent') {
      return matchedExistingLedger.netBalance + numAmt;
    } else {
      return matchedExistingLedger.netBalance - numAmt;
    }
  }, [matchedExistingLedger, amount, addType]);

  // Date formatting
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

  const handleAddDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowAddDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setAddDate(formatLocalDate(selectedDate));
    } else if (event.type === 'dismissed') {
      setShowAddDatePicker(false);
    }
  };

  const handleSettleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowSettleDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      setSettleDate(formatLocalDate(selectedDate));
    } else if (event.type === 'dismissed') {
      setShowSettleDatePicker(false);
    }
  };

  // Toggle card expansion
  const togglePersonExpand = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setExpandedPersons((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // Open Add Modal
  const handleOpenAddModal = (direction: BorrowType = 'lent', prefillName = '') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAddType(direction);
    setPersonName(prefillName);
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

  // Submit Add Borrow
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

  // Open Smart Person Settlement Modal
  const handleOpenPersonSettleModal = (person: PersonLedger) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSettlePersonItem(person);

    // Direction: If netBalance > 0 (they owe me), I receive repayment.
    // If netBalance < 0 (I owe them), I pay repayment.
    const isReceiving = person.netBalance >= 0;
    setSettleDirection(isReceiving ? 'received' : 'paid');

    const outstanding = Math.abs(person.netBalance);
    setSettleAmount(outstanding > 0 ? String(outstanding) : '');
    setSettleMode('with_account');
    setSettleDate(new Date().toISOString().substring(0, 10));
    setShowSettleDatePicker(false);
    setSettleNote('');

    const defaultAcc = eligibleAccounts.find((a) => a.type === 'bank') || eligibleAccounts[0];
    if (defaultAcc) {
      setSettleAccountId(defaultAcc.id);
    }
  };

  // Confirm Smart Person Settlement
  const handleConfirmPersonSettle = async () => {
    if (!settlePersonItem) return;
    if (isSubmittingSettleRef.current) return;
    const numAmt = parseFloat(settleAmount);

    if (isNaN(numAmt) || numAmt <= 0) {
      setInlineError('Please enter a valid settlement amount greater than 0');
      return;
    }

    if (settleMode === 'with_account' && !settleAccountId) {
      setInlineError('Please select an account for the settlement transaction');
      return;
    }

    isSubmittingSettleRef.current = true;
    setIsSubmittingSettle(true);
    try {
      const res = await settlePersonLedgerOptimistic({
        personName: settlePersonItem.personName,
        amount: numAmt,
        direction: settleDirection,
        depositAccountId: settleMode === 'with_account' ? settleAccountId : null,
        date: settleDate,
        note: settleNote.trim() || null,
      });

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSettlePersonItem(null);
      }
    } finally {
      isSubmittingSettleRef.current = false;
      setIsSubmittingSettle(false);
    }
  };

  // Open Edit Modal for a specific borrow entry
  const handleOpenEditBorrow = (borrow: Borrow) => {
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

  // Submit Edit Borrow
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

  // Delete Borrow Entry
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
      {/* 1. Header Bar */}
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
              Unified contact ledgers & auto-netting
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
        {/* 2. Executive Summary Metrics Cards */}
        <View style={dynamicStyles.summaryRow}>
          {/* Lent Out / Owed to You */}
          <View style={[dynamicStyles.summaryCard, { borderLeftColor: colors.lent }]}>
            <View style={dynamicStyles.summaryCardTop}>
              <Text style={dynamicStyles.summaryLabel}>OWED TO YOU (+)</Text>
              <View style={[dynamicStyles.iconBadge, { backgroundColor: colors.lentMuted }]}>
                <Ionicons name="arrow-up-circle" size={14} color={colors.lent} />
              </View>
            </View>
            <Text style={[dynamicStyles.summaryAmount, TYPOGRAPHY.tabularText, { color: colors.lent }]}>
              ₹{totalPendingLent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>

          {/* Borrowed / You Owe */}
          <View style={[dynamicStyles.summaryCard, { borderLeftColor: colors.borrowed }]}>
            <View style={dynamicStyles.summaryCardTop}>
              <Text style={dynamicStyles.summaryLabel}>YOU OWE (−)</Text>
              <View style={[dynamicStyles.iconBadge, { backgroundColor: colors.borrowedMuted }]}>
                <Ionicons name="arrow-down-circle" size={14} color={colors.borrowed} />
              </View>
            </View>
            <Text style={[dynamicStyles.summaryAmount, TYPOGRAPHY.tabularText, { color: colors.borrowed }]}>
              ₹{totalPendingBorrowed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>

          {/* Net Pending Position */}
          <View
            style={[
              dynamicStyles.summaryCard,
              { borderLeftColor: netPending >= 0 ? accent.hex : colors.alert },
            ]}
          >
            <View style={dynamicStyles.summaryCardTop}>
              <Text style={dynamicStyles.summaryLabel}>NET POSITION</Text>
              <View
                style={[
                  dynamicStyles.iconBadge,
                  { backgroundColor: `${netPending >= 0 ? accent.hex : colors.alert}1A` },
                ]}
              >
                <Ionicons
                  name={netPending >= 0 ? 'shield-checkmark' : 'alert-circle'}
                  size={14}
                  color={netPending >= 0 ? accent.hex : colors.alert}
                />
              </View>
            </View>
            <Text
              style={[
                dynamicStyles.summaryAmount,
                TYPOGRAPHY.tabularText,
                { color: netPending >= 0 ? accent.hex : colors.alert },
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
              placeholder="Search person, notes, accounts..."
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
                { id: 'all', label: 'All Contacts', count: personLedgers.length },
                { id: 'pending', label: 'Pending', count: pendingContactCount },
                { id: 'settled', label: 'Settled', count: personLedgers.filter((p) => p.status === 'settled').length },
                { id: 'lent', label: 'Owed to You (+)', count: personLedgers.filter((p) => p.netBalance > 0).length },
                { id: 'borrowed', label: 'You Owe (−)', count: personLedgers.filter((p) => p.netBalance < 0).length },
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

        {/* 4. Unified Person Ledgers List (Person-First View) */}
        {filteredPersonLedgers.length > 0 ? (
          filteredPersonLedgers.map((person) => {
            const isSettled = person.status === 'settled' && person.pendingCount === 0;
            const owesYou = person.netBalance > 0;
            const youOwe = person.netBalance < 0;
            const netThemeColor = owesYou ? colors.lent : youOwe ? colors.borrowed : colors.income;
            const isExpanded = !!expandedPersons[person.personName];

            return (
              <View
                key={person.personName}
                style={[
                  dynamicStyles.personCard,
                  isSettled && dynamicStyles.personCardSettled,
                ]}
              >
                {/* Person Card Header */}
                <TouchableOpacity
                  onPress={() => togglePersonExpand(person.personName)}
                  activeOpacity={0.8}
                  style={dynamicStyles.personCardHeader}
                >
                  <View style={dynamicStyles.personAvatarCol}>
                    <View
                      style={[
                        dynamicStyles.personAvatar,
                        { backgroundColor: isSettled ? colors.surfaceLight : `${person.avatarColor}22` },
                      ]}
                    >
                      <Text
                        style={[
                          dynamicStyles.personAvatarText,
                          { color: isSettled ? colors.textMuted : person.avatarColor },
                        ]}
                      >
                        {person.personName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={dynamicStyles.personInfoCol}>
                    <View style={dynamicStyles.personNameRow}>
                      <Text style={dynamicStyles.personNameText} numberOfLines={1}>
                        {person.personName}
                      </Text>
                      <View
                        style={[
                          dynamicStyles.personStatusTag,
                          {
                            backgroundColor: isSettled
                              ? `${colors.income}1A`
                              : owesYou
                              ? `${colors.lent}1A`
                              : `${colors.borrowed}1A`,
                            borderColor: isSettled
                              ? `${colors.income}44`
                              : owesYou
                              ? `${colors.lent}44`
                              : `${colors.borrowed}44`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            dynamicStyles.personStatusTagText,
                            {
                              color: isSettled ? colors.income : owesYou ? colors.lent : colors.borrowed,
                            },
                          ]}
                        >
                          {isSettled ? 'SETTLED' : owesYou ? 'OWES YOU' : 'YOU OWE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={dynamicStyles.personMetaText}>
                      {person.entries.length} {person.entries.length === 1 ? 'entry' : 'entries'} • Last: {formatDateLabel(person.lastActivityDate)}
                    </Text>
                  </View>

                  {/* Net Amount Right Column */}
                  <View style={dynamicStyles.personAmountCol}>
                    <Text
                      style={[
                        dynamicStyles.personAmountText,
                        TYPOGRAPHY.tabularText,
                        { color: isSettled ? colors.textMuted : netThemeColor },
                      ]}
                    >
                      {owesYou ? '+' : youOwe ? '−' : ''}₹
                      {Math.abs(person.netBalance).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.textMuted}
                      style={{ marginTop: 2, alignSelf: 'flex-end' }}
                    />
                  </View>
                </TouchableOpacity>

                {/* Person Quick Actions Bar */}
                <View style={dynamicStyles.personActionBar}>
                  {!isSettled ? (
                    <TouchableOpacity
                      onPress={() => handleOpenPersonSettleModal(person)}
                      style={[dynamicStyles.actionBtnPrimary, { backgroundColor: accent.hex }]}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-done" size={14} color={colors.textInverse} style={{ marginRight: 4 }} />
                      <Text style={dynamicStyles.actionBtnPrimaryText}>Settle / Repay</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={dynamicStyles.settledBadgeInline}>
                      <Ionicons name="checkmark-circle-outline" size={14} color={colors.income} style={{ marginRight: 4 }} />
                      <Text style={dynamicStyles.settledBadgeInlineText}>All Cleared</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => handleOpenAddModal('lent', person.personName)}
                    style={dynamicStyles.actionBtnSecondary}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={dynamicStyles.actionBtnSecondaryText}>+ Add Entry</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => togglePersonExpand(person.personName)}
                    style={dynamicStyles.historyToggleBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isExpanded ? 'chevron-up-outline' : person.pendingCount > 0 ? 'layers-outline' : 'time-outline'}
                      size={13}
                      color={colors.textMuted}
                      style={{ marginRight: 3 }}
                    />
                    <Text style={dynamicStyles.historyToggleText}>
                      {isExpanded ? 'Hide' : person.pendingCount > 0 ? 'Active Entries' : 'History'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Expandable History Table */}
                {isExpanded && (
                  <View style={dynamicStyles.expandedHistoryBox}>
                    <View style={dynamicStyles.expandedHeaderRow}>
                      <Text style={dynamicStyles.expandedHeaderTitle}>
                        {person.pendingCount > 0 ? 'ACTIVE LEDGER ENTRIES' : 'TRANSACTION HISTORY'}
                      </Text>
                      <Text style={dynamicStyles.expandedHeaderCount}>
                        {person.entries.length} items
                      </Text>
                    </View>

                    {person.entries.map((entry) => {
                      const isEntrySettled = entry.status === 'settled';
                      const isEntryLent = entry.type === 'lent';
                      const isRepayReceived = entry.type === 'repayment_received';
                      const isRepayPaid = entry.type === 'repayment_paid';
                      const isFriendPaid = entry.type === 'paid_by_friend';

                      let typeLabel = 'BORROWED';
                      let typeColor = colors.borrowed;
                      if (isEntryLent) {
                        typeLabel = 'LENT';
                        typeColor = colors.lent;
                      } else if (isRepayReceived) {
                        typeLabel = 'REPAID TO YOU';
                        typeColor = colors.income;
                      } else if (isRepayPaid) {
                        typeLabel = 'REPAID BY YOU';
                        typeColor = colors.income;
                      } else if (isFriendPaid) {
                        typeLabel = 'PAID BY FRIEND';
                        typeColor = colors.warning;
                      }

                      const borrowObj = entry.borrowId
                        ? borrows.find((b) => b.id === entry.borrowId)
                        : null;

                      return (
                        <View
                          key={entry.id}
                          style={[
                            dynamicStyles.timelineEntryRow,
                            isEntrySettled && { opacity: 0.55 },
                          ]}
                        >
                          <View style={dynamicStyles.entryLeftCol}>
                            <View style={dynamicStyles.entryTopSubRow}>
                              <View
                                style={[
                                  dynamicStyles.entryTypeTag,
                                  { backgroundColor: `${typeColor}1A`, borderColor: `${typeColor}44` },
                                ]}
                              >
                                <Text style={[dynamicStyles.entryTypeTagText, { color: typeColor }]}>
                                  {typeLabel}
                                </Text>
                              </View>

                              <View
                                style={[
                                  dynamicStyles.entryTypeTag,
                                  {
                                    backgroundColor: isEntrySettled ? `${colors.income}1A` : `${colors.warning}1A`,
                                    borderColor: isEntrySettled ? `${colors.income}44` : `${colors.warning}44`,
                                    marginLeft: 4,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    dynamicStyles.entryTypeTagText,
                                    { color: isEntrySettled ? colors.income : colors.warning },
                                  ]}
                                >
                                  {isEntrySettled ? 'SETTLED' : 'PENDING'}
                                </Text>
                              </View>

                              <Text style={dynamicStyles.entryDateText}>{entry.date}</Text>
                            </View>

                            {entry.note ? (
                              <Text style={dynamicStyles.entryNoteText} numberOfLines={1}>
                                {entry.note}
                              </Text>
                            ) : null}

                            {entry.accountName && (
                              <Text style={dynamicStyles.entryAccountText}>
                                Account: {entry.accountName}
                              </Text>
                            )}
                          </View>

                          <View style={dynamicStyles.entryRightCol}>
                            <Text
                              style={[
                                dynamicStyles.entryAmountText,
                                TYPOGRAPHY.tabularText,
                                {
                                  color: isEntrySettled
                                    ? colors.textMuted
                                    : entry.direction === '+'
                                    ? colors.lent
                                    : colors.alert,
                                },
                              ]}
                            >
                              {entry.direction}₹
                              {entry.amount.toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </Text>

                            <View style={dynamicStyles.entryActionIcons}>
                              {entry.transactionId ? (
                                <TouchableOpacity
                                  onPress={() =>
                                    navigation.navigate('TransactionDetail', {
                                      transactionId: entry.transactionId,
                                    })
                                  }
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  style={dynamicStyles.miniIconBtn}
                                >
                                  <Ionicons name="open-outline" size={13} color={colors.textSecondary} />
                                </TouchableOpacity>
                              ) : null}

                              {borrowObj && (
                                <>
                                  <TouchableOpacity
                                    onPress={() => handleOpenEditBorrow(borrowObj)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    style={dynamicStyles.miniIconBtn}
                                  >
                                    <Ionicons name="pencil-outline" size={13} color={colors.textSecondary} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setBorrowToDelete(borrowObj)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    style={dynamicStyles.miniIconBtn}
                                  >
                                    <Ionicons name="trash-outline" size={13} color={colors.alert} />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
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
              {searchQuery ? 'No matching contacts or records' : 'No records found'}
            </Text>
            <Text style={dynamicStyles.emptySubtitle}>
              {searchQuery
                ? `No entries matching "${searchQuery}".`
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
      {/* 5. ADD BORROW / LEND MODAL (WITH AUTO-MERGE & PROJECTED NET BALANCE)      */}
      {/* ========================================================================= */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '92%' }]}>
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
              {/* Direction Toggle */}
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

              {/* Person Name Input with Contact Suggestions */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>PERSON NAME *</Text>
                <TextInput
                  value={personName}
                  onChangeText={setPersonName}
                  placeholder="e.g. Rahul, Sneha, Mom"
                  placeholderTextColor={colors.textMuted}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={addType === 'lent' ? colors.lent : colors.borrowed}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />

                {personSuggestions.length > 0 && (
                  <View style={dynamicStyles.suggestionsContainer}>
                    <Text style={dynamicStyles.suggestionsTitle}>
                      EXISTING CONTACTS (TAP TO AUTO-MERGE):
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={dynamicStyles.suggestionsRow}
                    >
                      {personSuggestions.map((p) => {
                        const isMatch =
                          personName.trim().toLowerCase() === p.personName.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={p.personName}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setPersonName(p.personName);
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
                              {p.personName}
                            </Text>
                            {p.netBalance !== 0 && (
                              <View style={dynamicStyles.chipOpenBadge}>
                                <Text style={dynamicStyles.chipOpenBadgeText}>
                                  {p.netBalance > 0 ? `+₹${p.netBalance}` : `-₹${Math.abs(p.netBalance)}`}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Auto-Merge Live Feedback & Projected Net Box */}
                {matchedExistingLedger && (
                  <View style={dynamicStyles.autoMergeCalloutBox}>
                    <View style={dynamicStyles.autoMergeHeaderRow}>
                      <Ionicons name="git-merge-outline" size={15} color={accent.hex} style={{ marginRight: 5 }} />
                      <Text style={dynamicStyles.autoMergeHeaderTitle}>
                        Auto-Merging with {matchedExistingLedger.personName}'s Ledger
                      </Text>
                    </View>
                    <Text style={dynamicStyles.autoMergeBodyText}>
                      Current Net:{' '}
                      <Text style={{ fontWeight: '700', color: matchedExistingLedger.netBalance >= 0 ? colors.lent : colors.borrowed }}>
                        {matchedExistingLedger.netBalance >= 0
                          ? `+₹${matchedExistingLedger.netBalance.toLocaleString('en-IN')} (Owes you)`
                          : `−₹${Math.abs(matchedExistingLedger.netBalance).toLocaleString('en-IN')} (You owe)`}
                      </Text>
                    </Text>
                    {projectedNet !== null && (
                      <Text style={dynamicStyles.autoMergeProjectedText}>
                        Projected Net:{' '}
                        <Text style={{ fontWeight: '800', color: projectedNet >= 0 ? colors.lent : colors.borrowed }}>
                          {projectedNet >= 0
                            ? `+₹${projectedNet.toLocaleString('en-IN')} (Owes you)`
                            : `−₹${Math.abs(projectedNet).toLocaleString('en-IN')} (You owe)`}
                        </Text>
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Amount Input */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>AMOUNT (₹) *</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
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

              {/* Money Source Account Switch */}
              <View style={dynamicStyles.moneySourceSection}>
                <View style={dynamicStyles.moneySourceHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={dynamicStyles.moneySourceTitle}>MONEY SOURCE CONNECTION</Text>
                    <Text style={dynamicStyles.moneySourceSubtitle}>
                      {connectToAccount
                        ? addType === 'lent'
                          ? 'Deducts money from your account balance'
                          : 'Adds money to your account balance'
                        : 'Untracked IOU (leaves bank balances untouched)'}
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
                  <View style={dynamicStyles.accountPickerContainer}>
                    <Text style={dynamicStyles.accountPickerTitle}>SELECT ACCOUNT:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.accountChipsRow}>
                      {accountsForAdd.map((acc) => {
                        const isSelected = selectedAccountId === acc.id;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setSelectedAccountId(acc.id);
                            }}
                            style={[
                              dynamicStyles.accountChip,
                              isSelected && {
                                borderColor: accent.hex,
                                backgroundColor: `${accent.hex}18`,
                              },
                            ]}
                          >
                            <BankLogo account={acc} size={16} style={{ marginRight: 6 }} />
                            <View>
                              <Text
                                style={[
                                  dynamicStyles.accountChipName,
                                  isSelected && { color: accent.hex, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {acc.name}
                              </Text>
                              <Text style={dynamicStyles.accountChipBal}>
                                ₹{Number(acc.current_balance || 0).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Date Field */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>TRANSACTION DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowAddDatePicker(true)}
                  style={dynamicStyles.dateSelectBtn}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={dynamicStyles.dateSelectBtnText}>{formatDateLabel(addDate)}</Text>
                </TouchableOpacity>

                {showAddDatePicker && (
                  <DateTimePicker
                    value={new Date(addDate)}
                    mode="date"
                    display="default"
                    onChange={handleAddDateChange}
                  />
                )}
              </View>

              {/* Note */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>NOTE / PURPOSE (OPTIONAL)</Text>
                <TextInput
                  value={addNote}
                  onChangeText={setAddNote}
                  placeholder="e.g. Dinner split, Uber ride, Rent contribution"
                  placeholderTextColor={colors.textMuted}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>
            </KeyboardAwareScrollView>

            {/* Modal Bottom Actions */}
            <View style={dynamicStyles.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={dynamicStyles.cancelBtn}
              >
                <Text style={dynamicStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                onPress={handleSaveAddBorrow}
                disabled={isSubmittingAdd}
                style={[
                  dynamicStyles.submitBtn,
                  { backgroundColor: addType === 'lent' ? colors.lent : colors.borrowed },
                ]}
              >
                {isSubmittingAdd ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={dynamicStyles.submitBtnText}>
                    Save {addType === 'lent' ? 'Lend Entry' : 'Borrow Entry'}
                  </Text>
                )}
              </TactileButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. SMART PERSON SETTLEMENT MODAL (PARTIAL & FULL REPAYMENT SYNC)         */}
      {/* ========================================================================= */}
      <Modal
        visible={!!settlePersonItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSettlePersonItem(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '90%' }]}>
            <View style={dynamicStyles.modalHeader}>
              <View>
                <Text style={dynamicStyles.modalTitle}>
                  SETTLE DEBT: {settlePersonItem?.personName}
                </Text>
                <Text style={dynamicStyles.modalSubtitle}>
                  Record full or partial repayment with synced account balance
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSettlePersonItem(null)}
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
              {settlePersonItem && (
                <View style={dynamicStyles.settleCurrentCard}>
                  <Text style={dynamicStyles.settleCurrentTitle}>CURRENT OUTSTANDING NET:</Text>
                  <Text
                    style={[
                      dynamicStyles.settleCurrentAmount,
                      TYPOGRAPHY.tabularText,
                      {
                        color:
                          settlePersonItem.netBalance >= 0 ? colors.lent : colors.borrowed,
                      },
                    ]}
                  >
                    {settlePersonItem.netBalance >= 0 ? '+' : '−'}₹
                    {Math.abs(settlePersonItem.netBalance).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                  <Text style={dynamicStyles.settleCurrentSub}>
                    {settlePersonItem.netBalance >= 0
                      ? `${settlePersonItem.personName} owes you this amount`
                      : `You owe ${settlePersonItem.personName} this amount`}
                  </Text>
                </View>
              )}

              {/* Settlement Direction Selector */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>REPAYMENT DIRECTION</Text>
                <View style={dynamicStyles.repayDirectionRow}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSettleDirection('received');
                    }}
                    style={[
                      dynamicStyles.repayDirectionBtn,
                      settleDirection === 'received' && {
                        borderColor: colors.lent,
                        backgroundColor: `${colors.lent}18`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="arrow-down-outline"
                      size={16}
                      color={settleDirection === 'received' ? colors.lent : colors.textMuted}
                    />
                    <Text
                      style={[
                        dynamicStyles.repayDirectionText,
                        settleDirection === 'received' && { color: colors.lent, fontWeight: '700' },
                      ]}
                    >
                      Repayment Received (+)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSettleDirection('paid');
                    }}
                    style={[
                      dynamicStyles.repayDirectionBtn,
                      settleDirection === 'paid' && {
                        borderColor: colors.borrowed,
                        backgroundColor: `${colors.borrowed}18`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="arrow-up-outline"
                      size={16}
                      color={settleDirection === 'paid' ? colors.borrowed : colors.textMuted}
                    />
                    <Text
                      style={[
                        dynamicStyles.repayDirectionText,
                        settleDirection === 'paid' && { color: colors.borrowed, fontWeight: '700' },
                      ]}
                    >
                      Repayment Paid (−)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Settlement Amount */}
              <View style={dynamicStyles.modalFieldGroup}>
                <View style={dynamicStyles.labelWithActionRow}>
                  <Text style={dynamicStyles.modalFieldLabel}>REPAYMENT AMOUNT (₹) *</Text>
                  {settlePersonItem && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSettleAmount(String(Math.abs(settlePersonItem.netBalance)));
                      }}
                    >
                      <Text style={[dynamicStyles.quickChipText, { color: accent.hex }]}>
                        Set Full Balance
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  value={settleAmount}
                  onChangeText={setSettleAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>

              {/* Deposit / Payment Account Picker */}
              <View style={dynamicStyles.moneySourceSection}>
                <View style={dynamicStyles.moneySourceHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={dynamicStyles.moneySourceTitle}>
                      {settleDirection === 'received' ? 'DEPOSIT ACCOUNT' : 'PAYMENT ACCOUNT'}
                    </Text>
                    <Text style={dynamicStyles.moneySourceSubtitle}>
                      {settleMode === 'with_account'
                        ? settleDirection === 'received'
                          ? 'Credits repayment amount to this account'
                          : 'Deducts repayment amount from this account'
                        : 'Untracked / Hand-to-Hand cash'}
                    </Text>
                  </View>

                  <Switch
                    value={settleMode === 'with_account'}
                    onValueChange={(val) => {
                      Haptics.selectionAsync().catch(() => {});
                      setSettleMode(val ? 'with_account' : 'without_account');
                    }}
                    trackColor={{ false: colors.border, true: accent.hex }}
                    thumbColor={colors.surface}
                  />
                </View>

                {settleMode === 'with_account' && (
                  <View style={dynamicStyles.accountPickerContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.accountChipsRow}>
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
                              dynamicStyles.accountChip,
                              isSelected && {
                                borderColor: accent.hex,
                                backgroundColor: `${accent.hex}18`,
                              },
                            ]}
                          >
                            <BankLogo account={acc} size={16} style={{ marginRight: 6 }} />
                            <View>
                              <Text
                                style={[
                                  dynamicStyles.accountChipName,
                                  isSelected && { color: accent.hex, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {acc.name}
                              </Text>
                              <Text style={dynamicStyles.accountChipBal}>
                                ₹{Number(acc.current_balance || 0).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Date */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>SETTLEMENT DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowSettleDatePicker(true)}
                  style={dynamicStyles.dateSelectBtn}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={dynamicStyles.dateSelectBtnText}>{formatDateLabel(settleDate)}</Text>
                </TouchableOpacity>

                {showSettleDatePicker && (
                  <DateTimePicker
                    value={new Date(settleDate)}
                    mode="date"
                    display="default"
                    onChange={handleSettleDateChange}
                  />
                )}
              </View>

              {/* Note */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>REMARK / NOTE (OPTIONAL)</Text>
                <TextInput
                  value={settleNote}
                  onChangeText={setSettleNote}
                  placeholder="e.g. GPay repayment, Cash settlement"
                  placeholderTextColor={colors.textMuted}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>
            </KeyboardAwareScrollView>

            <View style={dynamicStyles.modalFooter}>
              <TouchableOpacity
                onPress={() => setSettlePersonItem(null)}
                style={dynamicStyles.cancelBtn}
              >
                <Text style={dynamicStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                onPress={handleConfirmPersonSettle}
                disabled={isSubmittingSettle}
                style={[dynamicStyles.submitBtn, { backgroundColor: accent.hex }]}
              >
                {isSubmittingSettle ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={dynamicStyles.submitBtnText}>Confirm Settlement</Text>
                )}
              </TactileButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. EDIT BORROW ENTRY MODAL                                                */}
      {/* ========================================================================= */}
      <Modal
        visible={!!editBorrowItem}
        transparent
        animationType="slide"
        onRequestClose={() => setEditBorrowItem(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={[dynamicStyles.modalContainer, { maxHeight: '90%' }]}>
            <View style={dynamicStyles.modalHeader}>
              <View>
                <Text style={dynamicStyles.modalTitle}>EDIT ENTRY</Text>
                <Text style={dynamicStyles.modalSubtitle}>Modify record amount, account or date</Text>
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
              extraScrollHeight={60}
            >
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>PERSON NAME *</Text>
                <TextInput
                  value={editPersonName}
                  onChangeText={setEditPersonName}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>

              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>AMOUNT (₹) *</Text>
                <TextInput
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>

              <View style={dynamicStyles.moneySourceSection}>
                <View style={dynamicStyles.moneySourceHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={dynamicStyles.moneySourceTitle}>CONNECTED MONEY SOURCE</Text>
                    <Text style={dynamicStyles.moneySourceSubtitle}>
                      {editConnectToAccount ? 'Keep synced to account' : 'Untracked IOU'}
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
                  <View style={dynamicStyles.accountPickerContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.accountChipsRow}>
                      {accountsForEdit.map((acc) => {
                        const isSelected = editAccountId === acc.id;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setEditAccountId(acc.id);
                            }}
                            style={[
                              dynamicStyles.accountChip,
                              isSelected && {
                                borderColor: accent.hex,
                                backgroundColor: `${accent.hex}18`,
                              },
                            ]}
                          >
                            <BankLogo account={acc} size={16} style={{ marginRight: 6 }} />
                            <View>
                              <Text
                                style={[
                                  dynamicStyles.accountChipName,
                                  isSelected && { color: accent.hex, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {acc.name}
                              </Text>
                              <Text style={dynamicStyles.accountChipBal}>
                                ₹{Number(acc.current_balance || 0).toLocaleString('en-IN')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Date Field */}
              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>TRANSACTION DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowEditDatePicker(true)}
                  style={dynamicStyles.dateSelectBtn}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                  <Text style={dynamicStyles.dateSelectBtnText}>{formatDateLabel(editDate)}</Text>
                </TouchableOpacity>

                {showEditDatePicker && (
                  <DateTimePicker
                    value={new Date(editDate)}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') setShowEditDatePicker(false);
                      if (event.type === 'set' && selectedDate) {
                        setEditDate(formatLocalDate(selectedDate));
                      } else if (event.type === 'dismissed') {
                        setShowEditDatePicker(false);
                      }
                    }}
                  />
                )}
              </View>

              <View style={dynamicStyles.modalFieldGroup}>
                <Text style={dynamicStyles.modalFieldLabel}>NOTE / PURPOSE</Text>
                <TextInput
                  value={editNote}
                  onChangeText={setEditNote}
                  mode="outlined"
                  outlineColor={colors.border}
                  activeOutlineColor={accent.hex}
                  textColor={colors.textPrimary}
                  style={dynamicStyles.modalTextInput}
                />
              </View>
            </KeyboardAwareScrollView>

            <View style={dynamicStyles.modalFooter}>
              <TouchableOpacity
                onPress={() => setEditBorrowItem(null)}
                style={dynamicStyles.cancelBtn}
              >
                <Text style={dynamicStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                onPress={handleSaveEditBorrow}
                disabled={isSubmittingEdit}
                style={[dynamicStyles.submitBtn, { backgroundColor: accent.hex }]}
              >
                {isSubmittingEdit ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={dynamicStyles.submitBtnText}>Save Changes</Text>
                )}
              </TactileButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. DELETE BORROW CONFIRMATION MODAL                                       */}
      {/* ========================================================================= */}
      <Modal
        visible={!!borrowToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setBorrowToDelete(null)}
      >
        <View style={dynamicStyles.modalBackdrop}>
          <View style={dynamicStyles.deleteDialogCard}>
            <View style={dynamicStyles.deleteIconCircle}>
              <Ionicons name="trash-outline" size={28} color={colors.alert} />
            </View>

            <Text style={dynamicStyles.deleteDialogTitle}>Delete Entry?</Text>
            <Text style={dynamicStyles.deleteDialogDesc}>
              Are you sure you want to delete this borrow entry?
            </Text>

            {borrowToDelete?.linked_transaction_id && (
              <View style={dynamicStyles.deleteOptionRow}>
                <Switch
                  value={deleteLinkedTx}
                  onValueChange={setDeleteLinkedTx}
                  trackColor={{ false: colors.border, true: colors.alert }}
                  thumbColor={colors.surface}
                />
                <Text style={dynamicStyles.deleteOptionText}>
                  Also reverse and remove the connected transaction from your account balance
                </Text>
              </View>
            )}

            <View style={dynamicStyles.deleteActionsRow}>
              <TouchableOpacity
                onPress={() => setBorrowToDelete(null)}
                style={dynamicStyles.deleteCancelBtn}
              >
                <Text style={dynamicStyles.deleteCancelText}>Keep</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmDelete}
                disabled={isDeleting}
                style={dynamicStyles.deleteConfirmBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={dynamicStyles.deleteConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

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
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerBackBtn: {
      padding: 6,
      marginRight: SPACING.sm,
    },
    headerTitleCol: {
      flex: 1,
    },
    appTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: accentHex,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    headerAddBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textInverse,
    },
    scrollContent: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3.5,
      padding: SPACING.sm,
      justifyContent: 'space-between',
    },
    summaryCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    summaryLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
    iconBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryAmount: {
      fontSize: 13,
      fontWeight: '800',
    },
    searchFilterContainer: {
      marginBottom: SPACING.md,
      gap: 10,
    },
    searchInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
    },
    searchIcon: {
      marginRight: 6,
    },
    searchInput: {
      flex: 1,
      height: 40,
      backgroundColor: 'transparent',
      fontSize: 13,
      paddingHorizontal: 0,
    },
    searchClearBtn: {
      padding: 4,
    },
    filterPillsRow: {
      gap: 8,
      paddingVertical: 2,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
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
    personCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.md,
      overflow: 'hidden',
    },
    personCardSettled: {
      opacity: 0.85,
      backgroundColor: colors.surfaceLight,
    },
    personCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
    },
    personAvatarCol: {
      marginRight: SPACING.md,
    },
    personAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personAvatarText: {
      fontSize: 18,
      fontWeight: '800',
    },
    personInfoCol: {
      flex: 1,
    },
    personNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    personNameText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    personStatusTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
    },
    personStatusTagText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    personMetaText: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 3,
    },
    personAmountCol: {
      alignItems: 'flex-end',
      marginLeft: SPACING.sm,
    },
    personAmountText: {
      fontSize: 16,
      fontWeight: '800',
    },
    personActionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
      gap: 8,
    },
    actionBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
    },
    actionBtnPrimaryText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textInverse,
    },
    actionBtnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
    },
    actionBtnSecondaryText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    historyToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 'auto',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 6,
    },
    historyToggleText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    settledBadgeInline: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.income}18`,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    settledBadgeInlineText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.income,
    },
    expandedHistoryBox: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      padding: SPACING.md,
    },
    expandedHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    expandedHeaderTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    expandedHeaderCount: {
      fontSize: 10,
      color: colors.textMuted,
    },
    timelineEntryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 8,
    },
    entryLeftCol: {
      flex: 1,
      paddingRight: 10,
    },
    entryTopSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 3,
    },
    entryTypeTag: {
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
    },
    entryTypeTagText: {
      fontSize: 9,
      fontWeight: '800',
    },
    entryDateText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    entryNoteText: {
      fontSize: 12,
      color: colors.textPrimary,
      marginTop: 2,
    },
    entryAccountText: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
    entryRightCol: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    entryAmountText: {
      fontSize: 14,
      fontWeight: '800',
    },
    entryActionIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    miniIconBtn: {
      padding: 3,
    },
    emptyStateContainer: {
      alignItems: 'center',
      paddingVertical: SPACING.xl * 2,
      paddingHorizontal: SPACING.lg,
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
      marginBottom: 4,
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
      gap: SPACING.md,
    },
    emptyAddBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    emptyAddBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
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
      padding: 6,
    },
    modalScrollContent: {
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    directionToggleRow: {
      flexDirection: 'row',
      gap: 10,
    },
    directionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      gap: 8,
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
      gap: 4,
    },
    modalFieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    modalTextInput: {
      backgroundColor: colors.surface,
      fontSize: 14,
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
    autoMergeCalloutBox: {
      backgroundColor: `${accentHex}12`,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${accentHex}33`,
      padding: 10,
      marginTop: 6,
      gap: 3,
    },
    autoMergeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    autoMergeHeaderTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: accentHex,
    },
    autoMergeBodyText: {
      fontSize: 11,
      color: colors.textPrimary,
    },
    autoMergeProjectedText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 2,
    },
    moneySourceSection: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: 10,
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
      letterSpacing: 0.5,
    },
    moneySourceSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    accountPickerContainer: {
      marginTop: 6,
      gap: 4,
    },
    accountPickerTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
    },
    accountChipsRow: {
      gap: 8,
      paddingVertical: 4,
    },
    accountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
    },
    accountChipName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    accountChipBal: {
      fontSize: 10,
      color: colors.textMuted,
    },
    dateSelectBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateSelectBtnText: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    modalFooter: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    submitBtn: {
      flex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 10,
    },
    submitBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textInverse,
    },
    settleCurrentCard: {
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      alignItems: 'center',
    },
    settleCurrentTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    settleCurrentAmount: {
      fontSize: 22,
      fontWeight: '800',
      marginTop: 4,
    },
    settleCurrentSub: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    repayDirectionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    repayDirectionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    repayDirectionText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    labelWithActionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    quickChipText: {
      fontSize: 11,
      fontWeight: '700',
    },
    deleteDialogCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: SPACING.lg,
      marginHorizontal: SPACING.lg,
      alignItems: 'center',
      alignSelf: 'center',
      width: '88%',
    },
    deleteIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.alertMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.md,
    },
    deleteDialogTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    deleteDialogDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: SPACING.md,
    },
    deleteOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceLight,
      padding: 10,
      borderRadius: 8,
      gap: 8,
      marginBottom: SPACING.md,
    },
    deleteOptionText: {
      flex: 1,
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 15,
    },
    deleteActionsRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    deleteCancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    deleteCancelText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    deleteConfirmBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderRadius: 8,
      backgroundColor: colors.alert,
    },
    deleteConfirmText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
