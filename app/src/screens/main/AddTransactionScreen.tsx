import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, getCurrentMonthString } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, TYPOGRAPHY, ThemeColors } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { BankLogo } from '../../components/BankLogo';
import { TransactionType, TransactionSource } from '../../types/database';
import { extractTextFromImage } from '../../services/ocrService';
import { parseTransactionWithPipeline, normalizeAndMatchCategory } from '../../services/transactionParser';
import { useMerchantRulesStore } from '../../store/merchantRulesStore';

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
  const { accent, colors, effectiveTheme, hasGeminiApiKey } = useSettingsStore();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const {
    accounts,
    categories,
    addTransactionOptimistic,
    addBorrowWithTransactionOptimistic,
    isMonthLocked,
  } = useFinanceStore();

  const scrollViewRef = useRef<ScrollView>(null);

  const today = useMemo(() => new Date(), []);
  const params = route?.params;
  const initialMonth = params?.initialMonth;
  const currentMonthStr = useMemo(() => getCurrentMonthString(), []);
  const isPastMonthMode = Boolean(initialMonth && initialMonth < currentMonthStr);

  const initialMonthLastDay = useMemo(() => {
    if (!initialMonth) return 28;
    const [y, m] = initialMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [initialMonth]);

  const minDate = useMemo(() => {
    if (isPastMonthMode && initialMonth) {
      const [y, m] = initialMonth.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date(today.getFullYear() - 1, 0, 1);
  }, [isPastMonthMode, initialMonth, today]);

  const maxDate = useMemo(() => {
    if (isPastMonthMode && initialMonth) {
      const [y, m] = initialMonth.split('-').map(Number);
      return new Date(y, m - 1, initialMonthLastDay, 23, 59, 59);
    }
    return new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  }, [isPastMonthMode, initialMonth, initialMonthLastDay, today]);

  const [type, setType] = useState<TransactionType>(params?.prefillType || 'expense');
  const [amount, setAmount] = useState(
    params?.prefillAmount !== undefined && params?.prefillAmount !== null
      ? String(params.prefillAmount)
      : ''
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    params?.accountId || accounts[0]?.id || ''
  );
  const [category, setCategory] = useState(() => {
    if (params?.prefillCategory) {
      return normalizeAndMatchCategory(params.prefillCategory, categories).category;
    }
    return categories[0] || 'Food';
  });
  const [note, setNote] = useState(
    params?.prefillNote !== undefined && params?.prefillNote !== null
      ? String(params.prefillNote)
      : ''
  );
  const [personName, setPersonName] = useState(
    params?.prefillPersonName !== undefined && params?.prefillPersonName !== null
      ? String(params.prefillPersonName)
      : ''
  );
  const [date, setDate] = useState(() => {
    if (params?.prefillDate) return String(params.prefillDate);
    if (params?.initialMonth) {
      const [yStr, mStr] = params.initialMonth.split('-').map(Number);
      const lastDay = new Date(yStr, mStr, 0).getDate();
      return `${params.initialMonth}-${String(lastDay).padStart(2, '0')}`;
    }
    return formatLocalDate(new Date());
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // OCR and Screenshot states
  const [source, setSource] = useState<TransactionSource>(params?.prefillSource || 'manual');
  const [isScanning, setIsScanning] = useState(Boolean(params?.isAnalyzing));
  const [scanToast, setScanToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(() => {
    if (params?.scanMessage) return { type: 'success', message: params.scanMessage };
    if (params?.scanError) return { type: 'error', message: params.scanError };
    return null;
  });

  // User interaction tracking (prevents late Gemini AI results from overwriting what user is actively typing)
  const [amountTouched, setAmountTouched] = useState(false);
  const [noteTouched, setNoteTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [typeTouched, setTypeTouched] = useState(false);
  const [parsedMerchant, setParsedMerchant] = useState<string | undefined>(params?.parsedMerchant);

  // Automatically add newly detected category if it doesn't exist
  React.useEffect(() => {
    if (params?.prefillCategory) {
      const match = normalizeAndMatchCategory(params.prefillCategory, categories);
      if (match.isNew) {
        useFinanceStore.getState().addCategory(match.category);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adjust state during render if route.params changes after initial mount (React recommended pattern)
  const [prevParams, setPrevParams] = useState(params);
  if (params && params !== prevParams) {
    setPrevParams(params);
    if (params.parsedMerchant) {
      setParsedMerchant(params.parsedMerchant);
    }
    // Only update fields the user has NOT actively touched
    if (!amountTouched && params.prefillAmount !== undefined && params.prefillAmount !== null) {
      setAmount(String(params.prefillAmount));
    }
    if (!noteTouched && params.prefillNote !== undefined && params.prefillNote !== null) {
      setNote(String(params.prefillNote));
    }
    if (params.prefillPersonName !== undefined && params.prefillPersonName !== null) {
      setPersonName(String(params.prefillPersonName));
    }
    if (!typeTouched && params.prefillType !== undefined && params.prefillType !== null) {
      setType(params.prefillType);
    }
    if (!categoryTouched && params.prefillCategory !== undefined && params.prefillCategory !== null) {
      const match = normalizeAndMatchCategory(params.prefillCategory, categories);
      if (match.isNew) {
        useFinanceStore.getState().addCategory(match.category);
      }
      setCategory(match.category);
    }
    if (params.accountId) {
      setSelectedAccountId(params.accountId);
    }
    if (params.isAnalyzing !== undefined) {
      setIsScanning(Boolean(params.isAnalyzing));
    }
    if (params.prefillDate !== undefined && params.prefillDate !== null) {
      setDate(params.prefillDate);
    }
    if (params.prefillSource !== undefined && params.prefillSource !== null) {
      setSource(params.prefillSource);
    }
    if (params.scanMessage) {
      setScanToast({ type: 'success', message: params.scanMessage });
    }
    if (params.scanError) {
      setScanToast({ type: 'error', message: params.scanError });
    }
  }

  const handlePickAndScanImage = async () => {
    try {
      // 1. Open image picker from device gallery
      const pickRes = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (pickRes.canceled || !pickRes.assets || pickRes.assets.length === 0) {
        return;
      }

      const asset = pickRes.assets[0];
      const imageUri = asset.uri;
      const base64 = asset.base64;
      setIsScanning(true);
      setScanToast({ type: 'info', message: 'Reading receipt with on-device OCR...' });

      // 2. Perform on-device text & bounding box extraction via expo-mlkit-ocr
      const ocrRes = await extractTextFromImage(imageUri);

      // 3. Run shared transactionParser pipeline (deterministic extraction first, rules lookup, selective Gemini escalation)
      const { rules, recordGeminiRule } = useMerchantRulesStore.getState();
      const parsed = await parseTransactionWithPipeline(
        {
          rawText: ocrRes.text,
          ocrBlocks: ocrRes.blocks,
          userAccounts: accounts,
          availableCategories: categories,
          learnedRules: rules,
        },
        {
          imageUri,
          base64: base64 || undefined,
          mimeType: asset.mimeType || undefined,
          enableGeminiEscalation: hasGeminiApiKey,
          onTeachRule: (m, c, t) => recordGeminiRule(m, c, t),
        }
      );

      setIsScanning(false);

      if (parsed.amount === null && (parsed.merchant === 'Unknown' || !parsed.merchant)) {
        setScanToast({
          type: 'error',
          message: "Couldn't read financial details from that screenshot — enter it manually",
        });
        return;
      }

      // 4. Pre-fill form values for user review
      if (parsed.amount !== null && !amountTouched) {
        setAmount(String(parsed.amount));
      }
      if (parsed.suggestedType && !typeTouched) {
        setType(parsed.suggestedType);
        if (parsed.suggestedType === 'borrow_given' || parsed.suggestedType === 'borrow_taken') {
          setPersonName(parsed.merchant !== 'Unknown' ? parsed.merchant : '');
        }
      }
      if (parsed.merchant && parsed.merchant !== 'Unknown') {
        if (!noteTouched) {
          setNote(parsed.merchant);
        }
        setParsedMerchant(parsed.merchant);
      }
      if (parsed.suggestedCategory && !categoryTouched) {
        const match = normalizeAndMatchCategory(parsed.suggestedCategory, categories);
        if (match.isNew) {
          useFinanceStore.getState().addCategory(match.category);
        }
        setCategory(match.category);
      }
      if (parsed.date) {
        const [yStr, mStr] = parsed.date.split('-');
        if (
          parseInt(yStr, 10) === today.getFullYear() &&
          parseInt(mStr, 10) === today.getMonth() + 1
        ) {
          setDate(parsed.date);
        }
      }
      if (parsed.matchedAccountId) {
        setSelectedAccountId(parsed.matchedAccountId);
      }
      setSource('screenshot');

      // 5. User-facing feedback toast
      if (parsed.isCategoryLearned) {
        setScanToast({
          type: 'success',
          message: `Matched learned rule: ${parsed.merchant} ➔ ${parsed.suggestedCategory}`,
        });
      } else if (parsed.amount !== null && parsed.merchant !== 'Unknown') {
        setScanToast({
          type: 'success',
          message: `Extracted ₹${parsed.amount} for ${parsed.merchant} (${parsed.suggestedCategory})`,
        });
      } else if (parsed.amount !== null) {
        setScanToast({
          type: 'success',
          message: `Extracted ₹${parsed.amount}! Review category and save.`,
        });
      } else {
        setScanToast({
          type: 'info',
          message: 'Screenshot parsed! Please verify amount and tap Save.',
        });
      }
    } catch (err: any) {
      setIsScanning(false);
      setScanToast({
        type: 'error',
        message: err?.message || "Couldn't read that screenshot — enter it manually",
      });
    }
  };

  const effectiveAccountId = selectedAccountId || route?.params?.accountId || accounts[0]?.id || '';
  const selectedAccount = accounts.find((a) => a.id === effectiveAccountId);
  const isCreditCard = selectedAccount?.type === 'credit_card';

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      const formatted = formatLocalDate(selectedDate);
      const chosenMonth = formatted.substring(0, 7);
      if (isMonthLocked(chosenMonth)) {
        const dObj = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        const lockedName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        setFormError(`${lockedName} is locked. Unlock it from the Dashboard to log past entries.`);
      } else {
        setFormError(null);
      }
      setDate(formatted);
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
    let list: string[];
    if (isCreditCard && type === 'income') list = CREDIT_CARD_INCOME_CATEGORIES;
    else if (type === 'expense') list = categories;
    else if (type === 'income') list = INCOME_CATEGORIES;
    else list = BORROW_CATEGORIES;

    if (category && !list.some((c) => c.toLowerCase() === category.toLowerCase())) {
      return [category, ...list];
    }
    return list;
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

    // Validate that transaction date does not belong to a locked month
    const txMonth = date.substring(0, 7);
    if (isMonthLocked(txMonth)) {
      const [yStr, mStr] = txMonth.split('-');
      const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1);
      const lockedName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      setFormError(
        `${lockedName} is currently locked. Please unlock it from the Dashboard before logging transactions for this month.`
      );
      return;
    }

    setFormError(null);

    if (type === 'borrow_given' || type === 'borrow_taken') {
      addBorrowWithTransactionOptimistic({
        user_id: user.id,
        person_name: personName.trim(),
        amount: numAmount,
        type: type === 'borrow_taken' ? 'borrowed' : 'lent',
        date,
        account_id: effectiveAccountId,
        note: note.trim() || null,
      });
    } else {
      addTransactionOptimistic({
        user_id: user.id,
        account_id: effectiveAccountId,
        type,
        amount: numAmount,
        category,
        note: note.trim() || null,
        date,
        source,
      });
    }

    // 2b. Record learned rule ONLY if transaction originated from SMS or screenshot,
    // and key the rule on parsedMerchant (NOT the user-edited free text note!)
    if ((source === 'sms' || source === 'screenshot') && parsedMerchant) {
      useMerchantRulesStore.getState().recordUserRule(parsedMerchant, category, type);
    }

    // 3. Reset form and navigate back immediately (non-blocking)
    setAmount('');
    setNote('');
    setPersonName('');
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Dashboard' });
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
        <TouchableOpacity
          onPress={handlePickAndScanImage}
          disabled={isScanning}
          style={[
            styles.headerScanBtn,
            { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
          ]}
          activeOpacity={0.7}
        >
          {isScanning ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="scan-outline" size={14} color={colors.primary} />
              <Text style={[styles.headerScanText, { color: colors.primary }]}>Scan</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        extraScrollHeight={60}
      >
        {/* Scan Status Toast Banner */}
        {scanToast && (
          <View
            style={[
              styles.scanToastCard,
              {
                backgroundColor:
                  scanToast.type === 'error'
                    ? colors.alertMuted
                    : scanToast.type === 'success'
                    ? colors.incomeMuted
                    : colors.primaryContainer,
                borderColor:
                  scanToast.type === 'error'
                    ? colors.alert
                    : scanToast.type === 'success'
                    ? colors.income
                    : colors.primary,
              },
            ]}
          >
            <Ionicons
              name={
                scanToast.type === 'error'
                  ? 'alert-circle'
                  : scanToast.type === 'success'
                  ? 'checkmark-circle'
                  : 'information-circle'
              }
              size={16}
              color={
                scanToast.type === 'error'
                  ? colors.alert
                  : scanToast.type === 'success'
                  ? colors.income
                  : colors.primary
              }
            />
            <Text
              style={[
                styles.scanToastText,
                {
                  color:
                    scanToast.type === 'error'
                      ? colors.alert
                      : scanToast.type === 'success'
                      ? colors.income
                      : colors.primary,
                },
              ]}
            >
              {scanToast.message}
            </Text>
            <TouchableOpacity onPress={() => setScanToast(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name="close"
                size={14}
                color={
                  scanToast.type === 'error'
                    ? colors.alert
                    : scanToast.type === 'success'
                    ? colors.income
                    : colors.primary
                }
              />
            </TouchableOpacity>
          </View>
        )}

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
                  onPress={() => {
                    handleTypeChange(item.key);
                    setTypeTouched(true);
                  }}
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
                setAmountTouched(true);
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
                    <BankLogo account={acc} size={30} />

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
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 300, animated: true });
                  }, 120);
                }}
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
                const active = category.toLowerCase() === cat.toLowerCase();
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      setCategory(cat);
                      setCategoryTouched(true);
                    }}
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

          {/* 5. Date & Calendar Picker */}
          <View style={styles.section}>
            <View style={styles.dateHeader}>
              <Text style={styles.sectionLabel}>TRANSACTION DATE</Text>
              <View style={styles.quickDateRow}>
                {isPastMonthMode && initialMonth ? (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        setDate(`${initialMonth}-01`);
                        setFormError(null);
                      }}
                      style={[
                        styles.quickDateBtn,
                        date === `${initialMonth}-01` && {
                          backgroundColor: accent.hex + '22',
                          borderColor: accent.hex,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickDateText,
                          { color: date === `${initialMonth}-01` ? accent.hex : colors.textSecondary },
                        ]}
                      >
                        1st
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setDate(`${initialMonth}-15`);
                        setFormError(null);
                      }}
                      style={[
                        styles.quickDateBtn,
                        date === `${initialMonth}-15` && {
                          backgroundColor: accent.hex + '22',
                          borderColor: accent.hex,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickDateText,
                          { color: date === `${initialMonth}-15` ? accent.hex : colors.textSecondary },
                        ]}
                      >
                        15th
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setDate(`${initialMonth}-${String(initialMonthLastDay).padStart(2, '0')}`);
                        setFormError(null);
                      }}
                      style={[
                        styles.quickDateBtn,
                        date === `${initialMonth}-${String(initialMonthLastDay).padStart(2, '0')}` && {
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
                              date === `${initialMonth}-${String(initialMonthLastDay).padStart(2, '0')}`
                                ? accent.hex
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        Month End
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
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
                  </>
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
                  {isMonthLocked(date.substring(0, 7))
                    ? '🔒 Month Locked (Unlock on Dashboard)'
                    : formattedDateLabel}
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
                          Select Date
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
              onChangeText={(val) => {
                setNote(val);
                setNoteTouched(true);
              }}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
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
        </KeyboardAwareScrollView>
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
    headerScanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
    },
    headerScanText: {
      fontSize: 12,
      fontWeight: '700',
    },
    ocrBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: SPACING.md,
      gap: 12,
    },
    ocrIconBadge: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ocrBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
    ocrBannerSub: {
      fontSize: 11,
      marginTop: 2,
    },
    aiBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
    },
    aiBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    scanToastCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: SPACING.md,
      gap: 8,
    },
    scanToastText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
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
