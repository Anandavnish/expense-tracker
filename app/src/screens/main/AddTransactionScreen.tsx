import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native-paper';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore, getCurrentMonthString, parseBorrowDetails } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SPACING, TYPOGRAPHY, ThemeColors } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { BankLogo } from '../../components/BankLogo';
import { TransactionType, TransactionSource } from '../../types/database';
import { extractTextFromImage } from '../../services/ocrService';
import {
  parseTransactionWithPipeline,
  normalizeAndMatchCategory,
  normalizeDateToIso,
  matchAccountToSource,
} from '../../services/transactionParser';
import { parseReceiptWithGemini } from '../../services/geminiService';
import { useMerchantRulesStore } from '../../store/merchantRulesStore';
import { MonthUnlockModal } from '../../components/MonthUnlockModal';
import { getCategoryIcon, POPULAR_CATEGORY_TEMPLATES } from '../../utils/categoryIcons';
import { buildPersonLedgers } from '../../utils/personLedger';

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
    transactions,
    borrows,
    addCategory,
    addTransactionOptimistic,
    addBorrowWithTransactionOptimistic,
    addPaidByFriendExpenseOptimistic,
    isMonthLocked,
  } = useFinanceStore();

  const [isPaidByFriend, setIsPaidByFriend] = useState(false);
  const [friendPaidName, setFriendPaidName] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const friendSuggestions = useMemo(() => {
    const names = new Set<string>();
    borrows.forEach((b) => {
      const { displayName } = parseBorrowDetails(b);
      if (displayName && displayName !== 'Borrow' && displayName !== 'Unknown') {
        names.add(displayName);
      }
    });
    return Array.from(names).slice(0, 5);
  }, [borrows]);

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
  // Zero defaulting: never auto-assign Cash or accounts[0]
  const [selectedAccountId, setSelectedAccountId] = useState(params?.accountId || '');
  const [category, setCategory] = useState(() => {
    if (params?.prefillCategory && params.prefillCategory.toLowerCase() !== 'uncategorized') {
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
    if (params?.prefillDate) {
      const normalized = normalizeDateToIso(String(params.prefillDate));
      if (normalized) return normalized;
    }
    if (params?.initialMonth) {
      const [yStr, mStr] = params.initialMonth.split('-').map(Number);
      const lastDay = new Date(yStr, mStr, 0).getDate();
      return `${params.initialMonth}-${String(lastDay).padStart(2, '0')}`;
    }
    return formatLocalDate(new Date());
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const personLedgers = useMemo(() => {
    return buildPersonLedgers(borrows, transactions, accounts);
  }, [borrows, transactions, accounts]);

  const borrowPersonSuggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return personLedgers.slice(0, 6);
    return personLedgers.filter((p) => p.personName.toLowerCase().includes(q)).slice(0, 6);
  }, [personLedgers, personName]);

  const matchedBorrowLedger = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return null;
    return personLedgers.find((p) => p.personName.toLowerCase() === q) || null;
  }, [personLedgers, personName]);

  const projectedBorrowNet = useMemo(() => {
    if (!matchedBorrowLedger) return null;
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) return matchedBorrowLedger.netBalance;

    if (type === 'borrow_given') {
      return matchedBorrowLedger.netBalance + numAmt;
    } else {
      return matchedBorrowLedger.netBalance - numAmt;
    }
  }, [matchedBorrowLedger, amount, type]);

  // Month-lock redirect state and unlock modal
  const [lockedMonthRedirect, setLockedMonthRedirect] = useState<{
    originalDate: string;
    lockedMonth: string;
    bannerText: string;
  } | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // OCR and Screenshot states
  const [source, setSource] = useState<TransactionSource>(params?.prefillSource || 'manual');
  const [isScanning, setIsScanning] = useState(Boolean(params?.isAnalyzing));
  const [extractedText, setExtractedText] = useState<string>(params?.prefillRawText || '');
  const [scannedImageUri, setScannedImageUri] = useState<string | null>(params?.imageUri || null);
  const [scannedBase64, setScannedBase64] = useState<string | null>(null);
  const [scannedMimeType, setScannedMimeType] = useState<string | undefined>(undefined);
  const [isAiFormatting, setIsAiFormatting] = useState(false);
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

  // Helper to validate and enforce locked month redirect
  const applyPrefillDate = (rawDateStr: string) => {
    if (!rawDateStr) return;
    const normalized = normalizeDateToIso(rawDateStr) || formatLocalDate(today);
    const txMonth = normalized.substring(0, 7);
    if (isMonthLocked(txMonth)) {
      const [yStr, mStr] = txMonth.split('-');
      const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1);
      const lockedName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let formattedRaw = normalized;
      try {
        formattedRaw = new Date(normalized + 'T12:00:00').toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        // ignore
      }
      // Write record to current active month
      setDate(formatLocalDate(today));
      setLockedMonthRedirect({
        originalDate: normalized,
        lockedMonth: txMonth,
        bannerText: `This looks like it's from ${formattedRaw} — ${lockedName} is locked. Logged to this month instead.`,
      });
    } else {
      setDate(normalized);
      setLockedMonthRedirect(null);
    }
  };

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

  // Boundary 3: Reactive state binding for route params
  const lastParamsRef = useRef<string>('');
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!params) return;

    const paramSignature = JSON.stringify({
      amount: params.prefillAmount,
      note: params.prefillNote,
      category: params.prefillCategory,
      type: params.prefillType,
      accountId: params.accountId,
      date: params.prefillDate,
      source: params.prefillSource,
      rawText: params.prefillRawText,
      imageUri: params.imageUri,
      isAnalyzing: params.isAnalyzing,
      tier: params.resolutionTier,
      stamp: params.dispatchTimestamp || params.scanMessage,
    });

    if (paramSignature === lastParamsRef.current) return;
    lastParamsRef.current = paramSignature;

    console.log('[Boundary 3: AddTransactionScreen] Received and applying prefill params:', {
      resolutionTier: params.resolutionTier,
      amount: params.prefillAmount,
      note: params.prefillNote,
      category: params.prefillCategory,
      type: params.prefillType,
      date: params.prefillDate,
      accountId: params.accountId,
      isAnalyzing: params.isAnalyzing,
    });

    if (params.parsedMerchant) {
      setParsedMerchant(params.parsedMerchant);
    }

    if (params.prefillRawText) {
      setExtractedText(params.prefillRawText);
    }

    if (params.imageUri) {
      setScannedImageUri(params.imageUri);
    }

    if (params.isAnalyzing !== undefined) {
      setIsScanning(Boolean(params.isAnalyzing));
    }

    if (params.prefillAmount !== undefined && params.prefillAmount !== null) {
      setAmount(String(params.prefillAmount));
      setAmountTouched(false);
    }

    if (params.prefillNote !== undefined && params.prefillNote !== null) {
      setNote(String(params.prefillNote));
      setNoteTouched(false);
    }

    if (params.prefillPersonName !== undefined && params.prefillPersonName !== null) {
      setPersonName(String(params.prefillPersonName));
    }

    if (params.prefillType) {
      setType(params.prefillType);
      setTypeTouched(false);
    }

    if (params.prefillCategory) {
      const match = normalizeAndMatchCategory(params.prefillCategory, categories);
      if (match.isNew) {
        useFinanceStore.getState().addCategory(match.category);
      }
      setCategory(match.category);
      setCategoryTouched(false);
    }

    if (params.accountId) {
      setSelectedAccountId(params.accountId);
    } else {
      // Zero defaulting: never auto-assign Cash or accounts[0]
      setSelectedAccountId('');
    }

    if (params.prefillDate) {
      applyPrefillDate(params.prefillDate);
    }

    if (params.prefillSource) {
      setSource(params.prefillSource);
    }

    if (params.scanMessage) {
      setScanToast({
        type: 'success',
        message: params.scanMessage,
      });
    } else if (params.scanError) {
      setScanToast({ type: 'error', message: params.scanError });
    }

    // Clear pending shared draft now that route params have been applied
    AsyncStorage.removeItem('@pending_shared_transaction_draft_v1').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, categories]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Hardware Back Handler & Cleanup: ensure pending drafts are wiped when closing/backing out
  useEffect(() => {
    const onHardwareBack = () => {
      AsyncStorage.multiRemove([
        '@add_transaction_screen_draft_v1',
        '@pending_shared_transaction_draft_v1',
      ]).catch(() => {});
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('MainTabs', { screen: 'Dashboard' });
      }
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => {
      sub.remove();
      AsyncStorage.removeItem('@pending_shared_transaction_draft_v1').catch(() => {});
    };
  }, [navigation]);

  // Restore pending shared transaction or saved uncommitted draft on mount if params are absent
  useEffect(() => {
    // If route params were passed, they take precedence and draft is cleared above
    if (params && (params.prefillAmount !== undefined || params.prefillNote || params.imageUri || params.prefillRawText)) {
      return;
    }

    const restoreDraft = async () => {
      try {
        // 1. Check for pending shared draft first (e.g. app opened from background/standby after share intent)
        const sharedDraftJson = await AsyncStorage.getItem('@pending_shared_transaction_draft_v1');
        if (sharedDraftJson) {
          const sharedDraft = JSON.parse(sharedDraftJson);
          if (sharedDraft?.navParams && Date.now() - (sharedDraft.timestamp || 0) < 24 * 60 * 60 * 1000) {
            const p = sharedDraft.navParams;
            if (p.parsedMerchant) setParsedMerchant(p.parsedMerchant);
            if (p.prefillRawText) setExtractedText(p.prefillRawText);
            if (p.imageUri) setScannedImageUri(p.imageUri);
            if (p.prefillAmount !== undefined && p.prefillAmount !== null) setAmount(String(p.prefillAmount));
            if (p.prefillNote !== undefined && p.prefillNote !== null) setNote(String(p.prefillNote));
            if (p.prefillPersonName !== undefined && p.prefillPersonName !== null) setPersonName(String(p.prefillPersonName));
            if (p.prefillType) setType(p.prefillType);
            if (p.prefillCategory) {
              const match = normalizeAndMatchCategory(p.prefillCategory, categories);
              setCategory(match.category);
            }
            if (p.accountId) setSelectedAccountId(p.accountId);
            if (p.prefillDate) applyPrefillDate(p.prefillDate);
            if (p.prefillSource) setSource(p.prefillSource);
            if (p.scanMessage) setScanToast({ type: 'success', message: p.scanMessage });
            await AsyncStorage.removeItem('@pending_shared_transaction_draft_v1');
            return;
          }
        }

        // 2. Check for uncommitted user form draft (e.g. killed app or standby mid-fill)
        const formDraftJson = await AsyncStorage.getItem('@add_transaction_screen_draft_v1');
        if (formDraftJson) {
          const formDraft = JSON.parse(formDraftJson);
          // Restore if within last 24 hours
          if (Date.now() - (formDraft.timestamp || 0) < 24 * 60 * 60 * 1000) {
            if (formDraft.amount) setAmount(formDraft.amount);
            if (formDraft.note) setNote(formDraft.note);
            if (formDraft.personName) setPersonName(formDraft.personName);
            if (formDraft.type) setType(formDraft.type);
            if (formDraft.category) setCategory(formDraft.category);
            if (formDraft.selectedAccountId) setSelectedAccountId(formDraft.selectedAccountId);
            if (formDraft.date) setDate(formDraft.date);
            if (formDraft.extractedText) setExtractedText(formDraft.extractedText);
            if (formDraft.source) setSource(formDraft.source);
            if (formDraft.isPaidByFriend) setIsPaidByFriend(formDraft.isPaidByFriend);
            if (formDraft.friendPaidName) setFriendPaidName(formDraft.friendPaidName);
            if (formDraft.scannedImageUri) setScannedImageUri(formDraft.scannedImageUri);
          }
        }
      } catch (e) {
        console.warn('[AddTransactionScreen] Failed to restore draft:', e);
      }
    };

    restoreDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save in-progress draft so background kill or standby never loses entered data
  useEffect(() => {
    if (amount.trim() || note.trim() || extractedText.trim() || personName.trim() || friendPaidName.trim()) {
      const draft = {
        amount,
        note,
        personName,
        type,
        category,
        selectedAccountId,
        date,
        extractedText,
        source,
        isPaidByFriend,
        friendPaidName,
        scannedImageUri,
        timestamp: Date.now(),
      };
      AsyncStorage.setItem('@add_transaction_screen_draft_v1', JSON.stringify(draft)).catch(() => {});
    }
  }, [
    amount,
    note,
    personName,
    type,
    category,
    selectedAccountId,
    date,
    extractedText,
    source,
    isPaidByFriend,
    friendPaidName,
    scannedImageUri,
  ]);

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
      setScannedImageUri(imageUri);
      setScannedBase64(base64 || null);
      setScannedMimeType(asset.mimeType || undefined);
      setIsScanning(true);
      setScanToast({ type: 'info', message: 'Reading receipt with on-device OCR...' });

      // 2. Perform on-device text & bounding box extraction via expo-mlkit-ocr (Boundary 1)
      const ocrRes = await extractTextFromImage(imageUri);
      setExtractedText(ocrRes.text);

      // 3. Run shared transactionParser pipeline (Boundary 2)
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

      console.log('[Boundary 3: AddTransactionScreen] handlePickAndScanImage applying prefill:', {
        resolutionTier: parsed.resolutionTier,
        amount: parsed.amount,
        merchant: parsed.merchant,
        category: parsed.suggestedCategory,
        type: parsed.suggestedType,
        date: parsed.date,
        matchedAccountId: parsed.matchedAccountId,
      });

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

      // Smart note prefill: Income -> counterparty/UPI, Expense -> merchant
      if (parsed.suggestedType === 'income') {
        const smartNote =
          parsed.merchant !== 'Unknown'
            ? parsed.merchant
            : parsed.upiRef
            ? `UPI: ${parsed.upiRef}`
            : '';
        if (!noteTouched && smartNote) {
          setNote(smartNote);
        }
      } else if (parsed.merchant && parsed.merchant !== 'Unknown') {
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
        applyPrefillDate(parsed.date);
      }

      // Zero defaulting: leave unselected if unmatched
      if (parsed.matchedAccountId) {
        setSelectedAccountId(parsed.matchedAccountId);
      } else {
        setSelectedAccountId('');
      }

      setSource('screenshot');

      // 5. User-facing feedback toast with minimal clean summary
      const summaryMsg = parsed.isCategoryLearned
        ? `Matched rule: ${parsed.merchant} ➔ ${parsed.suggestedCategory}`
        : parsed.amount !== null && parsed.suggestedCategory && parsed.suggestedCategory !== 'Uncategorized'
        ? `Extracted ₹${parsed.amount} • ${parsed.suggestedCategory}`
        : parsed.amount !== null && parsed.merchant !== 'Unknown'
        ? `Extracted ₹${parsed.amount} for ${parsed.merchant}`
        : parsed.amount !== null
        ? `Extracted ₹${parsed.amount}`
        : 'Receipt scanned — review details and save';

      setScanToast({
        type: 'success',
        message: summaryMsg,
      });
    } catch (err: any) {
      setIsScanning(false);
      setScanToast({
        type: 'error',
        message: err?.message || "Couldn't read that screenshot — enter it manually",
      });
    }
  };

  const handleFormatWithAi = async () => {
    const textToFormat = extractedText.trim() || note.trim();
    if (!textToFormat && !scannedImageUri && !scannedBase64) {
      setScanToast({
        type: 'info',
        message: 'Scan a receipt or type transaction text in the note first to format with AI',
      });
      return;
    }

    if (!hasGeminiApiKey) {
      setScanToast({
        type: 'error',
        message: 'Set up your Gemini API Key in Settings to use AI formatting',
      });
      return;
    }

    try {
      setIsAiFormatting(true);
      const isVisionMode = Boolean(scannedImageUri || scannedBase64);
      setScanToast({
        type: 'info',
        message: isVisionMode
          ? 'Deep scanning receipt with Gemini Vision...'
          : 'Formatting with Gemini AI...',
      });

      const res = await parseReceiptWithGemini({
        text: textToFormat || undefined,
        imageUri: scannedImageUri || undefined,
        base64: scannedBase64 || undefined,
        mimeType: scannedMimeType || undefined,
        availableCategories: categories,
      });

      setIsAiFormatting(false);

      if (!res.success || !res.data) {
        setScanToast({
          type: 'error',
          message: res.message || 'AI could not format this text — please enter manually',
        });
        return;
      }

      const parsed = res.data;

      // Update form values with AI extracted results
      if (parsed.amount !== null && !isNaN(parsed.amount)) {
        setAmount(String(parsed.amount));
        setAmountTouched(false);
      }

      if (parsed.suggested_type) {
        setType(parsed.suggested_type);
        setTypeTouched(false);
        if (parsed.suggested_type === 'borrow_given' || parsed.suggested_type === 'borrow_taken') {
          setPersonName(parsed.merchant_or_person !== 'Unknown' ? parsed.merchant_or_person : '');
        }
      }

      if (parsed.suggested_type === 'income') {
        const smartNote = parsed.merchant_or_person !== 'Unknown' ? parsed.merchant_or_person : note;
        if (smartNote) {
          setNote(smartNote);
          setNoteTouched(false);
        }
      } else if (parsed.merchant_or_person && parsed.merchant_or_person !== 'Unknown') {
        setNote(parsed.merchant_or_person);
        setParsedMerchant(parsed.merchant_or_person);
        setNoteTouched(false);
      }

      if (parsed.suggested_category) {
        const match = normalizeAndMatchCategory(parsed.suggested_category, categories);
        if (match.isNew) {
          useFinanceStore.getState().addCategory(match.category);
        }
        setCategory(match.category);
        setCategoryTouched(false);
      }

      if (parsed.date_if_present) {
        applyPrefillDate(parsed.date_if_present);
      }

      if (parsed.detected_bank_or_source) {
        const matched = matchAccountToSource(parsed.detected_bank_or_source, accounts);
        if (matched) {
          setSelectedAccountId(matched);
        }
      }

      // Record learned rule if merchant is recognized
      if (
        parsed.merchant_or_person &&
        parsed.merchant_or_person !== 'Unknown' &&
        parsed.suggested_category
      ) {
        useMerchantRulesStore.getState().recordGeminiRule(
          parsed.merchant_or_person,
          parsed.suggested_category,
          parsed.suggested_type || 'expense'
        );
      }

      setScanToast({
        type: 'success',
        message: `✨ AI formatted: ${parsed.merchant_or_person !== 'Unknown' ? parsed.merchant_or_person : 'Transaction'} • ₹${parsed.amount ?? '—'} (${parsed.suggested_category})`,
      });
    } catch (err: any) {
      setIsAiFormatting(false);
      setScanToast({
        type: 'error',
        message: err?.message || 'Error formatting with AI',
      });
    }
  };

  const effectiveAccountId = selectedAccountId;
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
      if (date) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const [y, m, d] = date.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          if (!isNaN(dt.getTime())) return dt;
        }
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return today;
    } catch {
      return today;
    }
  }, [date, today]);

  const formattedDateLabel = useMemo(() => {
    try {
      let dObj: Date;
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, d] = date.split('-').map(Number);
        dObj = new Date(y, m - 1, d);
      } else if (date) {
        dObj = new Date(date);
      } else {
        dObj = today;
      }

      if (isNaN(dObj.getTime())) {
        dObj = today;
      }

      const isToday = formatLocalDate(dObj) === formatLocalDate(today);
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const isYesterday = formatLocalDate(dObj) === formatLocalDate(yesterday);

      const baseStr = dObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      if (isToday) return `${baseStr} • Today`;
      if (isYesterday) return `${baseStr} • Yesterday`;
      return baseStr;
    } catch {
      return formatLocalDate(today);
    }
  }, [date, today]);

  const yesterdayInCurrentMonth = today.getDate() > 1;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType !== 'expense') {
      setIsPaidByFriend(false);
    }
    if (newType === 'expense') {
      if (
        !category ||
        category === 'Credit Card Payment' ||
        BORROW_CATEGORIES.includes(category) ||
        INCOME_CATEGORIES.includes(category)
      ) {
        setCategory(categories[0] || 'Food');
      }
    } else if (newType === 'income') {
      setCategory(isCreditCard ? CREDIT_CARD_INCOME_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    } else {
      setCategory(BORROW_CATEGORIES[0]);
    }
  };

  const getAvailableCategories = () => {
    let list: string[];
    if (isCreditCard && type === 'income') {
      list = CREDIT_CARD_INCOME_CATEGORIES;
    } else if (type === 'expense') {
      const set = new Set<string>();
      const res: string[] = [];
      const add = (c?: string | null) => {
        if (!c) return;
        const clean = c.trim();
        if (!clean || clean === 'Credit Card Payment' || clean.toLowerCase() === 'uncategorized') return;
        const lower = clean.toLowerCase();
        if (!set.has(lower)) {
          set.add(lower);
          res.push(clean);
        }
      };
      categories.forEach(add);
      transactions.forEach((tx) => {
        if (tx.type === 'expense') add(tx.category);
      });
      list = res;
    } else if (type === 'income') {
      list = INCOME_CATEGORIES;
    } else {
      list = BORROW_CATEGORIES;
    }

    list = list.filter((c) => c.toLowerCase() !== 'uncategorized');

    if (category && category.toLowerCase() !== 'uncategorized' && !list.some((c) => c.toLowerCase() === category.toLowerCase())) {
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

    if (type === 'expense' && isPaidByFriend) {
      if (!friendPaidName.trim()) {
        setFormError('Please enter who paid for this expense');
        return;
      }
    } else {
      if (!selectedAccountId) {
        setFormError('Please select a source account to deduct from');
        return;
      }
      if (isCreditCard && type === 'borrow_taken') {
        setFormError('Credit cards cannot be used to receive borrowed money. Please select a Bank or Cash account.');
        return;
      }
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

    if (type === 'expense' && isPaidByFriend) {
      addPaidByFriendExpenseOptimistic({
        user_id: user.id,
        account_id: effectiveAccountId || selectedAccountId || (accounts.length > 0 ? accounts[0].id : null),
        amount: numAmount,
        category,
        friend_name: friendPaidName.trim(),
        date,
        note: note.trim() || null,
      });
    } else if (type === 'borrow_given' || type === 'borrow_taken') {
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

    // 3. Clear drafts and reset form and navigate back immediately (non-blocking)
    AsyncStorage.multiRemove([
      '@add_transaction_screen_draft_v1',
      '@pending_shared_transaction_draft_v1',
    ]).catch(() => {});
    setAmount('');
    setNote('');
    setPersonName('');
    setFriendPaidName('');
    setIsPaidByFriend(false);
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
            onPress={() => {
              AsyncStorage.multiRemove([
                '@add_transaction_screen_draft_v1',
                '@pending_shared_transaction_draft_v1',
              ]).catch(() => {});
              navigation.goBack();
            }}
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
          disabled={isScanning || isAiFormatting}
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
        {/* Persistent Locked Month Redirect Banner with One-Tap Unlock Action */}
        {lockedMonthRedirect && (
          <View style={styles.lockedMonthBanner}>
            <Ionicons name="lock-closed" size={18} color={colors.alert} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedMonthBannerText}>
                {lockedMonthRedirect.bannerText}
              </Text>
              <TouchableOpacity
                onPress={() => setShowUnlockModal(true)}
                style={styles.unlockBannerActionBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.unlockBannerActionText, { color: accent.hex }]}>
                  Unlock Month & Relocate Date
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setLockedMonthRedirect(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

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
            {(Boolean(extractedText) || Boolean(scannedImageUri)) && (
              <TouchableOpacity
                onPress={handleFormatWithAi}
                disabled={isAiFormatting || isScanning}
                style={[
                  styles.aiRefinePill,
                  { backgroundColor: colors.surface, borderColor: colors.primary },
                ]}
                activeOpacity={0.7}
              >
                {isAiFormatting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="sparkles" size={11} color={colors.primary} />
                    <Text style={[styles.aiRefinePillText, { color: colors.primary }]}>
                      {scannedImageUri ? 'Deep AI Scan' : 'Format with AI'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
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
            <Text style={styles.sectionLabel}>
              {isPaidByFriend
                ? 'MONEY SOURCE (DEFAULT ACCOUNT TO SETTLE FROM)'
                : `MONEY SOURCE (DEDUCT FROM)${!selectedAccountId ? ' • Select source' : ''}`}
            </Text>
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

              {type === 'expense' && (
                <TouchableOpacity
                  key="paid_by_friend_source"
                  onPress={() => {
                    setFormError(null);
                    const next = !isPaidByFriend;
                    setIsPaidByFriend(next);
                    if (next && !selectedAccountId && accounts.length > 0) {
                      setSelectedAccountId(accounts[0].id);
                    }
                  }}
                  activeOpacity={0.7}
                  style={[
                    styles.sourceCard,
                    isPaidByFriend && {
                      borderColor: accent.hex,
                      backgroundColor: accent.hex + '14',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.friendSourceBubble,
                      { backgroundColor: isPaidByFriend ? accent.hex : colors.surfaceVariant },
                    ]}
                  >
                    <Ionicons
                      name="people"
                      size={16}
                      color={isPaidByFriend ? '#FFFFFF' : colors.textMuted}
                    />
                  </View>

                  <View style={styles.sourceTextCol}>
                    <Text
                      style={[
                        styles.sourceName,
                        isPaidByFriend && { color: colors.textPrimary, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      Paid by Friend
                    </Text>
                    <Text
                      style={[
                        styles.sourceBalance,
                        isPaidByFriend && { color: accent.hex, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {isPaidByFriend ? 'Active • Debt in Borrows' : 'Tap to enable'}
                    </Text>
                  </View>

                  {isPaidByFriend && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={accent.hex}
                      style={styles.sourceCheckIcon}
                    />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {type === 'expense' && isPaidByFriend && (
              <>
                <View style={styles.friendBoxContainer}>
                  <Text style={styles.friendInputLabel}>WHO PAID FOR THIS?</Text>
                  <TextInput
                    value={friendPaidName}
                    onChangeText={(val) => {
                      setFriendPaidName(val);
                      setFormError(null);
                    }}
                    placeholder="Enter friend or person's name (e.g. Sidd)"
                    placeholderTextColor={colors.textMuted}
                    mode="outlined"
                    outlineColor={colors.border}
                    activeOutlineColor={accent.hex}
                    textColor={colors.textPrimary}
                    style={styles.textInput}
                  />
                  {friendSuggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                      <Text style={styles.suggestionsTitle}>Recent:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {friendSuggestions.map((name) => (
                          <TouchableOpacity
                            key={name}
                            onPress={() => {
                              setFriendPaidName(name);
                              setFormError(null);
                            }}
                            style={[
                              styles.suggestionPill,
                              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                              friendPaidName === name && {
                                borderColor: accent.hex,
                                backgroundColor: accent.muted,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.suggestionPillText,
                                { color: friendPaidName === name ? accent.hex : colors.textPrimary },
                              ]}
                            >
                              {name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.friendInfoCallout}>
                  <Ionicons name="information-circle-outline" size={16} color={accent.hex} style={{ marginTop: 1 }} />
                  <Text style={styles.friendInfoCalloutText}>
                    Won't debit {accounts.find((a) => a.id === effectiveAccountId)?.name || 'this account'} now. An expense and a borrowed debt to {friendPaidName.trim() || 'your friend'} will be recorded. You will choose which account to repay from when settling in the Borrows tab.
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* If borrow, show Person Name input */}
          {(type === 'borrow_given' || type === 'borrow_taken') && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {type === 'borrow_given' ? 'LENT TO (PERSON NAME) *' : 'BORROWED FROM (PERSON NAME) *'}
              </Text>
              <TextInput
                value={personName}
                onChangeText={setPersonName}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 300, animated: true });
                  }, 120);
                }}
                placeholder="e.g. Rahul, Priya, Mom"
                placeholderTextColor={colors.textMuted}
                mode="outlined"
                outlineColor={colors.border}
                activeOutlineColor={accent.hex}
                textColor={colors.textPrimary}
                style={styles.textInput}
              />

              {borrowPersonSuggestions.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 5 }}>
                    EXISTING CONTACTS (TAP TO AUTO-MERGE):
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                    {borrowPersonSuggestions.map((p) => {
                      const isMatch = personName.trim().toLowerCase() === p.personName.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={p.personName}
                          onPress={() => {
                            setPersonName(p.personName);
                            setFormError(null);
                          }}
                          style={[
                            styles.suggestionPill,
                            { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                            isMatch && {
                              borderColor: accent.hex,
                              backgroundColor: accent.muted,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.suggestionPillText,
                              { color: isMatch ? accent.hex : colors.textPrimary },
                            ]}
                          >
                            {p.personName}
                          </Text>
                          {p.netBalance !== 0 && (
                            <View style={{ backgroundColor: colors.surface, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginLeft: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: p.netBalance > 0 ? colors.lent : colors.alert }}>
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

              {matchedBorrowLedger && (
                <View style={styles.friendInfoCallout}>
                  <Ionicons name="git-merge-outline" size={16} color={accent.hex} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.friendInfoCalloutText, { fontWeight: '700', color: accent.hex }]}>
                      Auto-merging into {matchedBorrowLedger.personName}'s ledger
                    </Text>
                    <Text style={styles.friendInfoCalloutText}>
                      Current Net: {matchedBorrowLedger.netBalance >= 0 ? `+₹${matchedBorrowLedger.netBalance.toLocaleString('en-IN')} (Owes you)` : `−₹${Math.abs(matchedBorrowLedger.netBalance).toLocaleString('en-IN')} (You owe)`}
                      {projectedBorrowNet !== null ? `  →  Projected Net: ${projectedBorrowNet >= 0 ? `+₹${projectedBorrowNet.toLocaleString('en-IN')} (Owes you)` : `−₹${Math.abs(projectedBorrowNet).toLocaleString('en-IN')} (You owe)`}` : ''}
                    </Text>
                  </View>
                </View>
              )}
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
                {isMonthLocked(date.substring(0, 7)) ? (
                  <Text style={styles.dateMonthRestrictionHint}>
                    🔒 Month Locked (Unlock on Dashboard)
                  </Text>
                ) : null}
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

        {/* Month Unlock Modal for Locked Month Redirection */}
        {lockedMonthRedirect && (
          <MonthUnlockModal
            visible={showUnlockModal}
            month={lockedMonthRedirect.lockedMonth}
            onClose={() => setShowUnlockModal(false)}
            onUnlockSuccess={() => {
              const orig = lockedMonthRedirect.originalDate;
              setDate(orig);
              setLockedMonthRedirect(null);
              setFormError(null);
              setShowUnlockModal(false);
              setScanToast({
                type: 'success',
                message: `Month unlocked! Transaction date restored to ${orig}.`,
              });
            }}
          />
        )}
        {/* Quick Add Category & Templates Modal */}
        <Modal
          visible={showAddCategoryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAddCategoryModal(false)}
        >
          <View style={styles.addCatModalBackdrop}>
            <View style={styles.addCatModalCard}>
              <View style={styles.addCatModalHeader}>
                <Text style={styles.addCatModalTitle}>Add Category</Text>
                <TouchableOpacity
                  onPress={() => setShowAddCategoryModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.addCatSectionSub}>QUICK TEMPLATES</Text>
              <View style={styles.addCatTemplatesWrap}>
                {POPULAR_CATEGORY_TEMPLATES.map((tmpl) => {
                  const alreadyHas = categories.some((c) => c.toLowerCase() === tmpl.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={tmpl}
                      onPress={() => {
                        addCategory(tmpl);
                        setCategory(tmpl);
                        setCategoryTouched(true);
                        setShowAddCategoryModal(false);
                      }}
                      style={[
                        styles.addCatTemplateChip,
                        alreadyHas && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons
                        name={getCategoryIcon(tmpl)}
                        size={12}
                        color={colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.addCatTemplateText}>
                        {tmpl} {alreadyHas ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.addCatSectionSub, { marginTop: 12 }]}>CUSTOM NAME</Text>
              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="e.g. For friend, College fee..."
                placeholderTextColor={colors.textMuted}
                mode="outlined"
                outlineColor={colors.border}
                activeOutlineColor={accent.hex}
                textColor={colors.textPrimary}
                theme={{ colors: { background: colors.surfaceLight } }}
                style={{ height: 42, fontSize: 13, backgroundColor: colors.surfaceLight }}
              />

              <View style={styles.addCatModalActions}>
                <TouchableOpacity
                  onPress={() => setShowAddCategoryModal(false)}
                  style={styles.addCatCancelBtn}
                >
                  <Text style={styles.addCatCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const trimmed = newCategoryName.trim();
                    if (!trimmed) return;
                    addCategory(trimmed);
                    setCategory(trimmed);
                    setCategoryTouched(true);
                    setNewCategoryName('');
                    setShowAddCategoryModal(false);
                  }}
                  disabled={!newCategoryName.trim()}
                  style={[
                    styles.addCatConfirmBtn,
                    { backgroundColor: accent.hex, opacity: newCategoryName.trim() ? 1 : 0.5 },
                  ]}
                >
                  <Text style={styles.addCatConfirmBtnText}>Add & Select</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    aiRefinePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      marginLeft: 4,
    },
    aiRefinePillText: {
      fontSize: 11,
      fontWeight: '700',
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
    lockedMonthBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.alertMuted || `${colors.alert}15`,
      borderColor: colors.alert,
      borderWidth: 1,
      borderRadius: 10,
      padding: SPACING.md,
      marginBottom: SPACING.md,
      gap: 10,
    },
    lockedMonthBannerText: {
      color: colors.textPrimary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    unlockBannerActionBtn: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    unlockBannerActionText: {
      fontSize: 12,
      fontWeight: '700',
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
    friendSourceBubble: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    friendBoxContainer: {
      marginTop: SPACING.md,
      backgroundColor: colors.surfaceLight,
      padding: SPACING.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    friendInfoCallout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surfaceLight,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: SPACING.sm + 2,
      marginTop: SPACING.sm,
      gap: 8,
    },
    friendInfoCalloutText: {
      flex: 1,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
    },
    friendInputLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 2,
    },
    suggestionsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    suggestionsTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    suggestionPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    suggestionPillText: {
      fontSize: 12,
      fontWeight: '600',
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
    addCatModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg,
    },
    addCatModalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      gap: 8,
    },
    addCatModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    addCatModalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    addCatSectionSub: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.6,
    },
    addCatTemplatesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    addCatTemplateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addCatTemplateText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    addCatModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 8,
    },
    addCatCancelBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addCatCancelBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    addCatConfirmBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 6,
    },
    addCatConfirmBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textInverse,
    },
  });
}
