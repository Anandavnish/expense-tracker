import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useMerchantRulesStore } from '../../store/merchantRulesStore';
import {
  useSettingsStore,
  isWallpaperThemeSupported,
  ThemeMode,
} from '../../store/settingsStore';
import {
  SPACING,
  ThemeStyleId,
} from '../../theme/tokens';
import { TransactionType } from '../../types/database';
import { filterTransactionsForCsv } from '../../services/csvExport';
import { exportTransactionsStatement } from '../../services/statementExport';
import { TactileButton } from '../../components/TactileButton';
import { BankLogo } from '../../components/BankLogo';
import { useKeyboard } from '../../hooks/useKeyboard';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import * as Haptics from 'expo-haptics';
import { validateGeminiApiKey } from '../../services/geminiService';
import {
  checkForAppUpdate,
  AppReleaseInfo,
  CURRENT_APP_VERSION,
  CURRENT_VERSION_CODE,
} from '../../services/versionService';
import { UpdatePromptModal } from '../../components/UpdatePromptModal';

interface SettingsScreenProps {
  navigation: any;
  route?: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuthStore();
  const {
    themeMode,
    themeStyle,
    effectiveTheme,
    colors,
    setThemeMode,
    setThemeStyle,
    geminiApiKey,
    hasGeminiApiKey,
    saveGeminiApiKey,
    removeGeminiApiKey,
    fetchGeminiApiKey,
    showAiOverviewOnDashboard,
    setShowAiOverviewOnDashboard,
  } = useSettingsStore();

  const { transactions, accounts, categories } = useFinanceStore();
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const byokScrollRef = useRef<ScrollView>(null);

  // Gemini BYOK Modal & Key State
  const [byokModalVisible, setByokModalVisible] = useState(false);
  const [byokKeyInput, setByokKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSavingByokKey, setIsSavingByokKey] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);
  const [byokSuccessMsg, setByokSuccessMsg] = useState<string | null>(null);

  // Auto-handle openGeminiKey route param (e.g. navigated from Profile Screen)
  const [prevOpenGeminiKeyParam, setPrevOpenGeminiKeyParam] = useState(route?.params?.openGeminiKey);
  if (route?.params?.openGeminiKey && route.params.openGeminiKey !== prevOpenGeminiKeyParam) {
    setPrevOpenGeminiKeyParam(route.params.openGeminiKey);
    setByokKeyInput(geminiApiKey || '');
    setByokError(null);
    setByokSuccessMsg(null);
    setByokModalVisible(true);
  }

  useEffect(() => {
    if (route?.params?.openGeminiKey) {
      if (!geminiApiKey && user?.id) {
        fetchGeminiApiKey(user.id).catch(() => {});
      }
      navigation.setParams({ openGeminiKey: undefined });
    }
  }, [route?.params?.openGeminiKey, geminiApiKey, user?.id, fetchGeminiApiKey, navigation]);

  // App Release / In-App Update State
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<AppReleaseInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Learned Rules & Merchants State
  const { rules, updateRuleCategory, deleteRule } = useMerchantRulesStore();
  const [learnedRulesModalVisible, setLearnedRulesModalVisible] = useState(false);
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');
  const [editingRuleMerchant, setEditingRuleMerchant] = useState<string | null>(null);

  const filteredRules = useMemo(() => {
    if (!ruleSearchQuery.trim()) return rules;
    const q = ruleSearchQuery.trim().toLowerCase();
    return rules.filter(
      (r) =>
        r.merchant_name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [rules, ruleSearchQuery]);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const result = await checkForAppUpdate();
      setIsCheckingUpdates(false);
      if (result.hasUpdate && result.release) {
        setUpdateRelease(result.release);
        setShowUpdateModal(true);
      } else if (result.error) {
        Alert.alert('Update Check', result.error, [{ text: 'OK' }]);
      } else {
        Alert.alert(
          'Up to Date',
          `You are using the latest version of Expense Tracker (v${CURRENT_APP_VERSION}, Build ${CURRENT_VERSION_CODE}). No updates available.`,
          [{ text: 'OK' }]
        );
      }
    } catch {
      setIsCheckingUpdates(false);
      Alert.alert('Update Check', 'Could not reach update server. Please check your internet connection.');
    }
  };

  const openByokModal = () => {
    setByokKeyInput(geminiApiKey || '');
    setByokError(null);
    setByokSuccessMsg(null);
    setByokModalVisible(true);
    if (!geminiApiKey && user?.id) {
      fetchGeminiApiKey(user.id).catch(() => {});
    }
  };

  const handlePasteByokKey = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.trim()) {
        setByokKeyInput(text.trim());
        setByokError(null);
        setTimeout(() => {
          byokScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveByokKey = async () => {
    const cleanedKey = byokKeyInput.trim().replace(/^["']|["']$/g, '');
    if (!cleanedKey) {
      setByokError('Please enter or paste your Gemini API key');
      return;
    }
    try {
      setIsSavingByokKey(true);
      setByokError(null);
      setByokSuccessMsg('Verifying key with Google Gemini...');

      // 1. Verify key directly with Google Gemini
      const val = await validateGeminiApiKey(cleanedKey);
      if (!val.valid) {
        setByokError(val.error || 'Invalid API key. Please check your key at aistudio.google.com');
        setByokSuccessMsg(null);
        setIsSavingByokKey(false);
        return;
      }

      // 2. Save key to database profile & store
      const res = await saveGeminiApiKey(cleanedKey, user?.id);
      if (res.success) {
        setByokSuccessMsg(`Verified! Connected to Gemini (${val.model || 'Flash'})`);
        setTimeout(() => {
          setByokModalVisible(false);
        }, 1200);
      } else {
        setByokError(res.error || 'Failed to save key');
        setByokSuccessMsg(null);
      }
    } catch (err: any) {
      setByokError(err?.message || 'Failed to save key');
      setByokSuccessMsg(null);
    } finally {
      setIsSavingByokKey(false);
    }
  };

  const handleRemoveByokKey = () => {
    Alert.alert(
      'Remove Gemini Key',
      'Are you sure you want to remove your API key? Screenshot OCR scanning and AI spending summaries will be disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSavingByokKey(true);
              const res = await removeGeminiApiKey(user?.id);
              if (res.success) {
                setByokKeyInput('');
                setByokSuccessMsg('Gemini API key removed.');
                setTimeout(() => {
                  setByokModalVisible(false);
                }, 1000);
              } else {
                setByokError(res.error || 'Failed to remove key');
              }
            } catch (err: any) {
              setByokError(err?.message || 'Failed to remove key');
            } finally {
              setIsSavingByokKey(false);
            }
          },
        },
      ]
    );
  };

  // CSV Export Modal & Filter States
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [csvDatePreset, setCsvDatePreset] = useState<'all' | 'this_month' | 'this_year' | 'last_30_days' | 'custom'>('all');
  const [csvCustomFrom, setCsvCustomFrom] = useState('');
  const [csvCustomTo, setCsvCustomTo] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);
  const [csvSelectedAccountId, setCsvSelectedAccountId] = useState<string | null>(null);
  const [csvSelectedTypes, setCsvSelectedTypes] = useState<TransactionType[]>([]);
  const [csvSelectedCategories, setCsvSelectedCategories] = useState<string[]>([]);
  const [isExportingStatement, setIsExportingStatement] = useState(false);

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      map[acc.id] = acc.name;
    });
    return map;
  }, [accounts]);

  const matchingCsvTransactions = useMemo(() => {
    return filterTransactionsForCsv({
      datePreset: csvDatePreset,
      customFrom: csvCustomFrom || undefined,
      customTo: csvCustomTo || undefined,
      selectedAccountId: csvSelectedAccountId,
      selectedTypes: csvSelectedTypes,
      selectedCategories: csvSelectedCategories,
      transactions,
      accountMap,
    });
  }, [
    csvDatePreset,
    csvCustomFrom,
    csvCustomTo,
    csvSelectedAccountId,
    csvSelectedTypes,
    csvSelectedCategories,
    transactions,
    accountMap,
  ]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickerTarget(null);
    }
    if (event.type === 'set' && selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const formatted = `${year}-${month}-${day}`;
      if (datePickerTarget === 'from') {
        setCsvCustomFrom(formatted);
      } else if (datePickerTarget === 'to') {
        setCsvCustomTo(formatted);
      }
    }
  };

  const performStatementExport = async (method: 'save' | 'share') => {
    if (matchingCsvTransactions.length === 0) {
      Alert.alert('No Data', 'No transactions match your selected filter criteria.');
      return;
    }
    try {
      setIsExportingStatement(true);

      const dateFilterLabel =
        csvDatePreset === 'custom' && csvCustomFrom && csvCustomTo
          ? `${csvCustomFrom} to ${csvCustomTo}`
          : csvDatePreset === 'all'
          ? 'All Time'
          : csvDatePreset === 'this_month'
          ? 'This Month'
          : csvDatePreset === 'this_year'
          ? 'This Year'
          : csvDatePreset === 'last_30_days'
          ? 'Last 30 Days'
          : 'Filtered Range';

      const accountFilterLabel = csvSelectedAccountId
        ? accountMap[csvSelectedAccountId] || 'Selected Account'
        : 'All Accounts';

      const typeFilterLabel =
        csvSelectedTypes.length === 0 || csvSelectedTypes.length === 4
          ? 'All Types'
          : csvSelectedTypes.map((t) => t.toUpperCase()).join(', ');

      const catLabel =
        csvSelectedCategories.length === 0
          ? 'All Categories'
          : csvSelectedCategories.length === 1
          ? csvSelectedCategories[0]
          : `${csvSelectedCategories.length} Categories`;

      const result = await exportTransactionsStatement({
        userEmail: user?.email || 'Account Holder',
        userId: user?.id,
        dateFilterLabel,
        accountFilterLabel,
        typeFilterLabel,
        categoriesFilterLabel: catLabel,
        transactions: matchingCsvTransactions,
        accountMap,
        method,
      });

      if (!result.success && result.error) {
        Alert.alert('Export Error', result.error);
      } else if (result.success) {
        setCsvModalVisible(false);
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to generate PDF statement');
    } finally {
      setIsExportingStatement(false);
    }
  };

  const handleDownloadStatement = () => {
    if (matchingCsvTransactions.length === 0) {
      Alert.alert('No Data', 'No transactions match your selected filter criteria.');
      return;
    }
    Alert.alert(
      'Export Statement',
      `Export ${matchingCsvTransactions.length} filtered transaction${matchingCsvTransactions.length === 1 ? '' : 's'} as PDF:`,
      [
        {
          text: 'Save as PDF (Direct)',
          onPress: () => performStatementExport('save'),
        },
        {
          text: 'Share via Apps',
          onPress: () => performStatementExport('share'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const isDynamicSupported = isWallpaperThemeSupported();

  const handleSelectThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const handleSelectThemeStyle = (styleId: ThemeStyleId) => {
    setThemeStyle(styleId);
  };

  const styleOptions: {
    id: ThemeStyleId;
    name: string;
    description: string;
    brandColor: string;
    isDynamic?: boolean;
  }[] = [
    {
      id: 'precision_obsidian',
      name: 'Precision Obsidian',
      description: 'Indigo brand (#6366F1 / #4F46E5) • Warm near-black base',
      brandColor: effectiveTheme === 'dark' ? '#6366F1' : '#4F46E5',
    },
    {
      id: 'warm_executive',
      name: 'Warm Executive',
      description: 'Copper brand (#D97757 / #A85C32) • Umber & warm paper',
      brandColor: effectiveTheme === 'dark' ? '#D97757' : '#A85C32',
    },
    {
      id: 'swiss_minimal',
      name: 'Swiss Minimal',
      description: 'Monochrome ink brand • Financial colors only',
      brandColor: effectiveTheme === 'dark' ? '#F4F4F5' : '#18181B',
    },
    {
      id: 'system_wallpaper',
      name: 'Match wallpaper (Android 12+)',
      description: isDynamicSupported
        ? 'Dynamic Material You wallpaper color integration'
        : 'Material You dynamic theme (Auto-falls back to Precision Obsidian on this device)',
      brandColor: colors.primary,
      isDynamic: true,
    },
  ];

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerLeftSpacer} />
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account & Profile Link Card */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT & PROFILE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Manage</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.primary} />
            </View>
          </View>
          <View style={styles.accountRow}>
            <View style={[styles.avatar, { borderColor: colors.primary, backgroundColor: colors.surfaceVariant }]}>
              {isGuest ? (
                <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
              ) : (
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </Text>
              )}
            </View>
            <View style={styles.accountDetails}>
              <Text style={[styles.accountEmail, { color: colors.textPrimary }]}>
                {isGuest ? 'Guest Explorer' : user?.email}
              </Text>
              <Text style={[styles.accountIdText, { color: colors.textMuted }]}>
                {isGuest ? 'Tap to backup data or set up cloud sync' : 'View security, password & sync status'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Appearance - Theme Mode (Dark / Light / System) */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE MODE</Text>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Switch between full dark and light mode variants for any selected style.
          </Text>
          <View style={styles.segmentedRow}>
            {(['dark', 'light', 'system'] as const).map((mode) => {
              const active = themeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleSelectThemeMode(mode)}
                  style={[
                    styles.segmentBtn,
                    { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                    active && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      { color: colors.textSecondary },
                      active && { color: colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {mode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Appearance - Multi-Style Theme Engine */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>THEME SYSTEM</Text>
            <View style={[styles.tagBadge, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.tagBadgeText, { color: colors.primary }]}>MD3 PALETTES</Text>
            </View>
          </View>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Select a tailored design system. Every style preserves strictly locked financial semantic tokens.
          </Text>

          <View style={styles.stylesList}>
            {styleOptions.map((opt) => {
              const active = themeStyle === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleSelectThemeStyle(opt.id)}
                  style={[
                    styles.styleCard,
                    {
                      backgroundColor: colors.surfaceVariant,
                      borderColor: active ? colors.primary : colors.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={styles.styleCardHeader}>
                    <View style={styles.styleNameRow}>
                      <View
                        style={[
                          styles.radioCircle,
                          { borderColor: active ? colors.primary : colors.border },
                          active && { backgroundColor: colors.primary },
                        ]}
                      >
                        {active && <View style={[styles.radioDot, { backgroundColor: colors.onPrimary }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleBadgeRow}>
                          <Text
                            style={[
                              styles.styleTitle,
                              { color: colors.textPrimary },
                              active && { color: colors.primary, fontWeight: '800' },
                            ]}
                          >
                            {opt.name}
                          </Text>
                          {opt.isDynamic && !isDynamicSupported && (
                            <View
                              style={[
                                styles.fallbackBadge,
                                { backgroundColor: colors.surface, borderColor: colors.border },
                              ]}
                            >
                              <Text style={[styles.fallbackBadgeText, { color: colors.textMuted }]}>
                                AUTO-FALLBACK
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.styleDescription, { color: colors.textMuted }]}>
                          {opt.description}
                        </Text>
                      </View>
                    </View>

                    {/* Preview Swatch Pill */}
                    <View style={styles.swatchPreviewContainer}>
                      <View
                        style={[
                          styles.brandSwatchCircle,
                          {
                            backgroundColor: opt.brandColor,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {active && (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={opt.id === 'swiss_minimal' && effectiveTheme === 'dark' ? '#09090B' : '#FFFFFF'}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>


        {/* Features & Integrations */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FEATURES & INTEGRATIONS</Text>

          {/* Gemini AI Key (BYOK) */}
          <TouchableOpacity
            onPress={openByokModal}
            style={styles.placeholderRow}
            activeOpacity={0.7}
          >
            <View style={styles.placeholderTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>
                  Gemini AI Key (BYOK)
                </Text>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                {hasGeminiApiKey
                  ? 'Key configured • Screenshot OCR & AI Overview active'
                  : 'Add your free Gemini API key to unlock AI features'}
              </Text>
            </View>
            <View
              style={[
                styles.actionBadge,
                hasGeminiApiKey
                  ? { backgroundColor: colors.incomeMuted, borderColor: colors.income }
                  : { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
              ]}
            >
              <Ionicons
                name={hasGeminiApiKey ? 'checkmark-circle' : 'key-outline'}
                size={12}
                color={hasGeminiApiKey ? colors.income : colors.primary}
                style={{ marginRight: 3 }}
              />
              <Text
                style={[
                  styles.actionBadgeText,
                  { color: hasGeminiApiKey ? colors.income : colors.primary },
                ]}
              >
                {hasGeminiApiKey ? 'ACTIVE' : 'SET UP'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Toggle: Show AI Spending Overview on Dashboard */}
          <View style={[styles.placeholderRow, { paddingTop: SPACING.md }]}>
            <View style={styles.placeholderTextCol}>
              <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>
                Show AI Overview on Dashboard
              </Text>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                Display on-demand monthly spending analysis card
              </Text>
            </View>
            <Switch
              value={showAiOverviewOnDashboard}
              onValueChange={(val) => setShowAiOverviewOnDashboard(val)}
              trackColor={{ false: colors.border, true: colors.primary + '88' }}
              thumbColor={showAiOverviewOnDashboard ? colors.primary : colors.textMuted}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Download Statement (PDF) - LIVE with Custom Range Filter Modal */}
          <TouchableOpacity
            onPress={() => setCsvModalVisible(true)}
            style={styles.placeholderRow}
            activeOpacity={0.7}
          >
            <View style={styles.placeholderTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>Download Statement (PDF)</Text>
                <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                Custom date range (any month/year), accounts, types & categories
              </Text>
            </View>
            <View style={[styles.actionBadge, { backgroundColor: colors.primaryContainer, borderColor: colors.primary }]}>
              <Ionicons name="download-outline" size={12} color={colors.primary} style={{ marginRight: 3 }} />
              <Text style={[styles.actionBadgeText, { color: colors.primary }]}>STATEMENT</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Smart Rules & Learned Merchants */}
          <TouchableOpacity
            onPress={() => setLearnedRulesModalVisible(true)}
            style={styles.placeholderRow}
            activeOpacity={0.7}
          >
            <View style={styles.placeholderTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>
                  Learned Merchants & Rules
                </Text>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                {rules.length === 0
                  ? 'No learned rules yet (learns automatically from SMS & receipts)'
                  : `${rules.length} vendor${rules.length === 1 ? '' : 's'} learned • View & edit`}
              </Text>
            </View>
            <View style={[styles.actionBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <Text style={[styles.actionBadgeText, { color: colors.textSecondary }]}>VIEW</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* App Updates & Version Check */}
          <TouchableOpacity
            onPress={handleCheckForUpdates}
            style={styles.placeholderRow}
            activeOpacity={0.7}
            disabled={isCheckingUpdates}
          >
            <View style={styles.placeholderTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>App Updates</Text>
                <Ionicons name="cloud-download-outline" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                {isCheckingUpdates
                  ? 'Checking for latest release...'
                  : `Version ${CURRENT_APP_VERSION} (Build ${CURRENT_VERSION_CODE})`}
              </Text>
            </View>
            <View style={[styles.actionBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              {isCheckingUpdates ? (
                <ActivityIndicator size={12} color={colors.primary} />
              ) : (
                <>
                  <Text style={[styles.actionBadgeText, { color: colors.textSecondary }]}>CHECK</Text>
                  <Ionicons name="refresh-outline" size={12} color={colors.textSecondary} style={{ marginLeft: 3 }} />
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Profile & Security Navigation Action */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          style={[styles.signOutBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
          activeOpacity={0.7}
        >
          <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.signOutBtnText, { color: colors.textSecondary }]}>Account, Security & Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionFooter}>
          Expense Tracker v{CURRENT_APP_VERSION} (Build {CURRENT_VERSION_CODE}) • Material Design 3 Architecture
        </Text>
      </ScrollView>

      {/* CSV Filter & Export Modal */}
      <Modal
        visible={csvModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCsvModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Download Statement (PDF)</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {matchingCsvTransactions.length} transaction{matchingCsvTransactions.length === 1 ? '' : 's'} matching filter
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCsvModalVisible(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceVariant }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {/* 1. Date Range Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>DATE RANGE</Text>
                <View style={styles.chipsRow}>
                  {[
                    { key: 'all', label: 'All Time' },
                    { key: 'this_month', label: 'This Month' },
                    { key: 'this_year', label: 'This Year' },
                    { key: 'last_30_days', label: 'Last 30 Days' },
                    { key: 'custom', label: 'Custom Range' },
                  ].map((p) => {
                    const active = csvDatePreset === p.key;
                    return (
                      <TouchableOpacity
                        key={p.key}
                        onPress={() => setCsvDatePreset(p.key as any)}
                        style={[
                          styles.filterChip,
                          { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                          active && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            { color: colors.textSecondary },
                            active && { color: colors.onPrimary, fontWeight: '700' },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Date Pickers without month restriction */}
                {csvDatePreset === 'custom' && (
                  <View style={styles.customDateRow}>
                    <TouchableOpacity
                      onPress={() => setDatePickerTarget('from')}
                      style={[styles.customDateCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={[styles.customDateLabel, { color: colors.textMuted }]}>FROM</Text>
                        <Text style={[styles.customDateValue, { color: colors.textPrimary }]}>
                          {csvCustomFrom || 'Select start date'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setDatePickerTarget('to')}
                      style={[styles.customDateCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                    >
                      <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                      <View style={{ marginLeft: 6 }}>
                        <Text style={[styles.customDateLabel, { color: colors.textMuted }]}>TO</Text>
                        <Text style={[styles.customDateValue, { color: colors.textPrimary }]}>
                          {csvCustomTo || 'Select end date'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 2. Money Source Account Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>MONEY SOURCE / ACCOUNT</Text>
                <View style={styles.chipsRow}>
                  <TouchableOpacity
                    onPress={() => setCsvSelectedAccountId(null)}
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                      csvSelectedAccountId === null && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: colors.textSecondary },
                        csvSelectedAccountId === null && { color: colors.onPrimary, fontWeight: '700' },
                      ]}
                    >
                      All Accounts
                    </Text>
                  </TouchableOpacity>

                  {accounts.map((acc) => {
                    const active = csvSelectedAccountId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        onPress={() => setCsvSelectedAccountId(active ? null : acc.id)}
                        style={[
                          styles.filterChip,
                          { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                          active && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <BankLogo account={acc} size={16} style={{ marginRight: 6 }} />
                        <Text
                          style={[
                            styles.filterChipText,
                            { color: colors.textSecondary },
                            active && { color: colors.onPrimary, fontWeight: '700' },
                          ]}
                        >
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 3. Transaction Types Filter */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>TRANSACTION TYPE</Text>
                <View style={styles.chipsRow}>
                  {[
                    { key: 'expense', label: 'Expenses' },
                    { key: 'income', label: 'Income' },
                    { key: 'borrow_given', label: 'Lent' },
                    { key: 'borrow_taken', label: 'Borrowed' },
                  ].map((t) => {
                    const active = csvSelectedTypes.includes(t.key as TransactionType);
                    return (
                      <TouchableOpacity
                        key={t.key}
                        onPress={() => {
                          if (active) {
                            setCsvSelectedTypes(csvSelectedTypes.filter((x) => x !== t.key));
                          } else {
                            setCsvSelectedTypes([...csvSelectedTypes, t.key as TransactionType]);
                          }
                        }}
                        style={[
                          styles.filterChip,
                          { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                          active && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            { color: colors.textSecondary },
                            active && { color: colors.onPrimary, fontWeight: '700' },
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* 4. Categories Filter */}
              {categories.length > 0 && (
                <View style={styles.filterSection}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>CATEGORIES</Text>
                    {csvSelectedCategories.length > 0 && (
                      <TouchableOpacity onPress={() => setCsvSelectedCategories([])}>
                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>Clear all</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.chipsRow}>
                    {categories.map((cat) => {
                      const active = csvSelectedCategories.includes(cat);
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => {
                            if (active) {
                              setCsvSelectedCategories(csvSelectedCategories.filter((c) => c !== cat));
                            } else {
                              setCsvSelectedCategories([...csvSelectedCategories, cat]);
                            }
                          }}
                          style={[
                            styles.filterChip,
                            { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                            active && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              { color: colors.textSecondary },
                              active && { color: colors.onPrimary, fontWeight: '700' },
                            ]}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Action Bar */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TactileButton
                onPress={handleDownloadStatement}
                disabled={isExportingStatement || matchingCsvTransactions.length === 0}
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: matchingCsvTransactions.length === 0 ? colors.surfaceVariant : colors.primary,
                  },
                ]}
              >
                {isExportingStatement ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="download-outline" size={16} color={colors.onPrimary} />
                    <Text style={[styles.exportBtnText, { color: colors.onPrimary }]}>
                      Download Statement ({matchingCsvTransactions.length} Record{matchingCsvTransactions.length === 1 ? '' : 's'})
                    </Text>
                  </View>
                )}
              </TactileButton>
            </View>
          </View>
        </View>

        {/* Date Picker Component */}
        {datePickerTarget && (
          <DateTimePicker
            value={new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
        )}
      </Modal>

      {/* Gemini AI Key (BYOK) Modal */}
      <Modal
        visible={byokModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setByokModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.modalBackdrop,
            { paddingBottom: isKeyboardVisible ? Math.min(keyboardHeight, 350) : 0 },
          ]}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                maxHeight: isKeyboardVisible ? '98%' : '90%',
              },
            ]}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Gemini AI Key (BYOK)</Text>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  Bring Your Own Key for OCR scanning & AI summaries
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setByokModalVisible(false)}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceVariant }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              ref={byokScrollRef}
              extraScrollHeight={Platform.OS === 'android' ? 80 : 40}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Plain-Language Explanation */}
              <View style={[styles.byokExplainCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
                  <Text style={[styles.byokExplainTitle, { color: colors.textPrimary }]}>Private & Free</Text>
                </View>
                <Text style={[styles.byokExplainText, { color: colors.textSecondary }]}>
                  Add your own free Gemini API key to unlock screenshot scanning and AI spending summaries. Your key is private to your account. Transaction text is sent to Google's Gemini API using your key to process it.
                </Text>
              </View>

              {/* Step-by-Step Instructions */}
              <View style={[styles.byokStepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>HOW TO GET A FREE KEY</Text>
                  <TouchableOpacity
                    onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}
                    style={[styles.openLinkBtn, { borderColor: colors.primary }]}
                  >
                    <Text style={[styles.openLinkText, { color: colors.primary }]}>Open AI Studio</Text>
                    <Ionicons name="open-outline" size={12} color={colors.primary} style={{ marginLeft: 3 }} />
                  </TouchableOpacity>
                </View>

                {[
                  { step: '1', text: 'Go to aistudio.google.com/apikey' },
                  { step: '2', text: 'Sign in with any Google account' },
                  { step: '3', text: 'Tap Create API key' },
                  { step: '4', text: 'Copy it' },
                  { step: '5', text: 'Paste below' },
                ].map((item) => (
                  <View key={item.step} style={styles.byokStepRow}>
                    <View style={[styles.byokStepNum, { backgroundColor: colors.primaryContainer }]}>
                      <Text style={[styles.byokStepNumText, { color: colors.primary }]}>{item.step}</Text>
                    </View>
                    <Text style={[styles.byokStepText, { color: colors.textPrimary }]}>{item.text}</Text>
                  </View>
                ))}
              </View>

              {/* Masked Password-Style Input Card */}
              <View style={[styles.byokInputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>ENTER GEMINI API KEY</Text>
                  <TouchableOpacity
                    onPress={handlePasteByokKey}
                    style={[styles.byokPasteBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                  >
                    <Ionicons name="clipboard-outline" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={[styles.byokPasteText, { color: colors.primary }]}>Paste</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.byokInputWrapper, { backgroundColor: colors.surfaceVariant, borderColor: byokError ? colors.alert : colors.border }]}>
                  <Ionicons name="key-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    value={byokKeyInput}
                    onChangeText={(val) => {
                      setByokKeyInput(val);
                      if (byokError) setByokError(null);
                    }}
                    onFocus={() => {
                      setTimeout(() => {
                        byokScrollRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                    placeholder="Paste Gemini key here (AIzaSy...)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.byokInput, { color: colors.textPrimary }]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowApiKey(!showApiKey)}
                    style={{ padding: 6 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showApiKey ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {byokError && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.alert} />
                    <Text style={{ fontSize: 12, color: colors.alert }}>{byokError}</Text>
                  </View>
                )}

                {byokSuccessMsg && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.income} />
                    <Text style={{ fontSize: 12, color: colors.income, fontWeight: '600' }}>{byokSuccessMsg}</Text>
                  </View>
                )}
              </View>
            </KeyboardAwareScrollView>

            {/* Modal Bottom Action Bar */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border, gap: 10 }]}>
              <TactileButton
                onPress={handleSaveByokKey}
                disabled={isSavingByokKey}
                style={[styles.exportBtn, { backgroundColor: colors.primary }]}
              >
                {isSavingByokKey ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="save-outline" size={16} color={colors.onPrimary} />
                    <Text style={[styles.exportBtnText, { color: colors.onPrimary }]}>
                      {hasGeminiApiKey ? 'Update API Key' : 'Save API Key'}
                    </Text>
                  </View>
                )}
              </TactileButton>

              {hasGeminiApiKey && (
                <TouchableOpacity
                  onPress={handleRemoveByokKey}
                  disabled={isSavingByokKey}
                  style={[styles.removeKeyBtn, { borderColor: colors.alert }]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.alert} style={{ marginRight: 6 }} />
                  <Text style={[styles.removeKeyBtnText, { color: colors.alert }]}>Remove Key from Profile</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* In-App Update Prompt Modal */}
      <UpdatePromptModal
        visible={showUpdateModal}
        release={updateRelease}
        currentVersion={CURRENT_APP_VERSION}
        onDismiss={() => setShowUpdateModal(false)}
      />

      {/* Learned Rules & Merchants Modal */}
      <Modal
        visible={learnedRulesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setLearnedRulesModalVisible(false);
          setEditingRuleMerchant(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '85%' }]}>
            <View style={[styles.modalHeaderRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Learned Merchants</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {rules.length} vendor{rules.length === 1 ? '' : 's'} learned • Adapts to your manual edits
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLearnedRulesModalVisible(false);
                  setEditingRuleMerchant(null);
                }}
                style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceVariant }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.surfaceVariant,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  height: 38,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  value={ruleSearchQuery}
                  onChangeText={setRuleSearchQuery}
                  placeholder="Search learned vendors or categories..."
                  placeholderTextColor={colors.textMuted}
                  style={{ flex: 1, color: colors.textPrimary, fontSize: 13, paddingVertical: 0 }}
                />
                {ruleSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setRuleSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: SPACING.md }} showsVerticalScrollIndicator={false}>
              {filteredRules.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles-outline" size={36} color={colors.textMuted} />
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 12 }}>
                    {ruleSearchQuery ? 'No matching vendors' : 'No learned rules yet'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, maxWidth: 260 }}>
                    {ruleSearchQuery
                      ? 'Try another search term.'
                      : 'As you receive SMS alerts or scan receipts and save transactions, the app will automatically learn and list your vendors here.'}
                  </Text>
                </View>
              ) : (
                filteredRules.map((rule) => {
                  const isEditing = editingRuleMerchant === rule.merchant_name;
                  return (
                    <View
                      key={rule.merchant_name}
                      style={{
                        backgroundColor: colors.surfaceVariant,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        padding: SPACING.md,
                        marginBottom: SPACING.sm,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>
                              {rule.merchant_name}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                                borderRadius: 4,
                                backgroundColor: rule.source === 'user_manual' ? colors.primaryContainer : colors.surface,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: '800',
                                  color: rule.source === 'user_manual' ? colors.primary : colors.textMuted,
                                }}
                              >
                                {rule.source === 'user_manual' ? 'USER' : 'AI'}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                            Used {rule.usage_count || 1} time{(rule.usage_count || 1) === 1 ? '' : 's'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => setEditingRuleMerchant(isEditing ? null : rule.merchant_name)}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: colors.surface,
                              borderWidth: 1,
                              borderColor: colors.primary,
                            }}
                          >
                            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                              {rule.category} ▾
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Delete Rule',
                                `Forget learned category for "${rule.merchant_name}"?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: () => deleteRule(rule.merchant_name),
                                  },
                                ]
                              );
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.alert} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Category change selector grid */}
                      {isEditing && (
                        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
                            REASSIGN CATEGORY
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {categories.map((cat) => {
                              const active = rule.category.toLowerCase() === cat.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={cat}
                                  onPress={() => {
                                    updateRuleCategory(rule.merchant_name, cat);
                                    setEditingRuleMerchant(null);
                                  }}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 6,
                                    backgroundColor: active ? colors.primary : colors.surface,
                                    borderWidth: 1,
                                    borderColor: active ? colors.primary : colors.border,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: active ? '700' : '500',
                                      color: active ? colors.onPrimary : colors.textSecondary,
                                    }}
                                  >
                                    {cat}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerLeftSpacer: {
    width: 48,
  },
  headerRightSpacer: {
    width: 48,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionSub: {
    fontSize: 12,
    marginBottom: SPACING.md,
    lineHeight: 17,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  accountDetails: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
  },
  accountIdText: {
    fontSize: 11,
    marginTop: 2,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stylesList: {
    gap: SPACING.sm,
  },
  styleCard: {
    borderRadius: 10,
    padding: SPACING.md,
  },
  styleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  styleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  fallbackBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  fallbackBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  styleDescription: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  swatchPreviewContainer: {
    marginLeft: SPACING.xs,
  },
  brandSwatchCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semanticPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 2,
  },
  semanticBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  semanticDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  semanticBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  placeholderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  placeholderTextCol: {
    flex: 1,
    marginRight: SPACING.xs,
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  placeholderSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  soonBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  filterSection: {
    gap: SPACING.xs,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  customDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  customDateCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  customDateLabel: {
    fontSize: 9,
    fontWeight: '700',
  },
  customDateValue: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  modalFooter: {
    padding: SPACING.lg,
    borderTopWidth: 1,
  },
  exportBtn: {
    paddingVertical: SPACING.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: SPACING.xs,
  },
  signOutBtn: {
    paddingVertical: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  byokExplainCard: {
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  byokExplainTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  byokExplainText: {
    fontSize: 12,
    lineHeight: 18,
  },
  byokStepCard: {
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  openLinkText: {
    fontSize: 11,
    fontWeight: '700',
  },
  byokStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  byokStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  byokStepNumText: {
    fontSize: 11,
    fontWeight: '800',
  },
  byokStepText: {
    fontSize: 13,
    fontWeight: '500',
  },
  byokInputCard: {
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  byokPasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  byokPasteText: {
    fontSize: 11,
    fontWeight: '700',
  },
  byokInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  byokInput: {
    flex: 1,
    height: 46,
    fontSize: 13,
    paddingVertical: 0,
  },
  removeKeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  removeKeyBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  versionFooter: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
