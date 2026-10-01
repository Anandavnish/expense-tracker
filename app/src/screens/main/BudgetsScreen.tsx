import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  BackHandler,
  Platform,
  UIManager,
  LayoutAnimation,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar, TextInput, ActivityIndicator } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme/tokens';
import { InlineError } from '../../components/InlineError';
import { TactileButton } from '../../components/TactileButton';
import { ReanimatedNumber } from '../../components/ReanimatedNumber';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { EditButton, EditIcon } from '../../components/EditButton';
import { getCategoryIcon, getCategoryColor } from '../../utils/categoryIcons';
import { supabase } from '../../services/supabase';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BudgetsScreenProps {
  route?: {
    params?: {
      editCategory?: string;
      currentLimit?: string;
    };
  };
}

interface FetchedMeta {
  source: 'current' | 'previous' | 'draft';
  month?: string;
  amount?: number;
}

export const BudgetsScreen: React.FC<BudgetsScreenProps> = ({ route }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { accent, colors } = useSettingsStore();
  const {
    budgets,
    budgetSummaries,
    categories,
    transactions,
    selectedMonth,
    setBudgetOptimistic,
    deleteBudgetOptimistic,
    inlineError,
    setInlineError,
    isMonthLocked,
  } = useFinanceStore();

  const isLocked = isMonthLocked(selectedMonth);

  const scrollViewRef = useRef<ScrollView>(null);
  const draftLimits = useRef<Record<string, string>>({});
  const fetchRequestId = useRef(0);

  const initialCategory =
    route?.params?.editCategory !== undefined ? route.params.editCategory : 'Overall Budget';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [prevParamCategory, setPrevParamCategory] = useState(route?.params?.editCategory);
  const [limitAmount, setLimitAmount] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFetchingLimit, setIsFetchingLimit] = useState(false);
  const [fetchedMeta, setFetchedMeta] = useState<FetchedMeta | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);
  const [isDeletingBudget, setIsDeletingBudget] = useState(false);

  // Auto-handle edit params from route during render (avoids setState in effect)
  if (route?.params?.editCategory !== prevParamCategory) {
    setPrevParamCategory(route?.params?.editCategory);
    if (route?.params?.editCategory !== undefined) {
      const cat = route.params.editCategory;
      setSelectedCategory(cat);
      setShowForm(true);
      if (route.params.currentLimit) {
        setLimitAmount(String(route.params.currentLimit));
        setFetchedMeta({
          source: 'current',
          month: selectedMonth,
          amount: Number(route.params.currentLimit),
        });
      }
    }
  }

  const overallSummary = useMemo(
    () => budgetSummaries.find((b) => b.category === null),
    [budgetSummaries]
  );
  const categorySummaries = useMemo(
    () => budgetSummaries.filter((b) => b.category !== null && b.category !== 'Credit Card Payment'),
    [budgetSummaries]
  );

  // Calculate live spending totals for this period (excluding credit card payment settlements)
  const totalExpensesThisMonth = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'expense' && t.category !== 'Credit Card Payment' && t.date.startsWith(selectedMonth))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions, selectedMonth]);

  const totalBudgetLimit = useMemo(() => {
    if (overallSummary && Number(overallSummary.monthly_limit) > 0) {
      return Number(overallSummary.monthly_limit);
    }
    // Sum of category budgets if no overall budget
    const catSum = categorySummaries.reduce(
      (sum, b) => sum + Number(b.monthly_limit || 0),
      0
    );
    return catSum;
  }, [overallSummary, categorySummaries]);

  const totalSpent = useMemo(() => {
    return totalExpensesThisMonth;
  }, [totalExpensesThisMonth]);

  const overallPct = useMemo(() => {
    if (totalBudgetLimit <= 0) return 0;
    return Math.round((totalSpent / totalBudgetLimit) * 100);
  }, [totalSpent, totalBudgetLimit]);

  // Days remaining in the selected period
  const daysLeftInPeriod = useMemo(() => {
    const parts = selectedMonth.split('-');
    if (parts.length !== 2) return null;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const now = new Date();
    const isCurrentMonth =
      now.getFullYear() === year && now.getMonth() + 1 === month;
    if (!isCurrentMonth) return null;
    const totalDays = new Date(year, month, 0).getDate();
    return Math.max(0, totalDays - now.getDate());
  }, [selectedMonth]);

  const dailySafeAllowance = useMemo(() => {
    if (daysLeftInPeriod === null || daysLeftInPeriod <= 0) return null;
    const remaining = totalBudgetLimit - totalSpent;
    if (remaining <= 0) return 0;
    return Math.round(remaining / daysLeftInPeriod);
  }, [daysLeftInPeriod, totalBudgetLimit, totalSpent]);

  // Calculate live spend for selected category
  const selectedCategorySpend = useMemo(() => {
    const target = selectedCategory === 'Overall Budget' ? null : selectedCategory;
    return transactions
      .filter((t) => {
        if (t.type !== 'expense') return false;
        if (t.category === 'Credit Card Payment') return false;
        if (!t.date.startsWith(selectedMonth)) return false;
        if (target === null) return true;
        return t.category.toLowerCase() === target.toLowerCase();
      })
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions, selectedMonth, selectedCategory]);

  const isEditingExisting = useMemo(() => {
    const target = selectedCategory === 'Overall Budget' ? null : selectedCategory;
    const existing = budgetSummaries.find((b) => b.category === target);
    return !!existing && Number(existing.monthly_limit) > 0;
  }, [selectedCategory, budgetSummaries]);

  // Auto-fetch limit when selecting a category (overall or specific)
  const fetchLimitForCategory = useCallback(
    async (cat: string) => {
      const target = cat === 'Overall Budget' ? null : cat;

      // 1. Session draft check
      if (draftLimits.current[cat] && draftLimits.current[cat].trim() !== '') {
        const amt = draftLimits.current[cat].trim();
        setLimitAmount(amt);
        setFetchedMeta({ source: 'draft', amount: Number(amt) });
        return;
      }

      // 2. Current month summary check
      const currentSummary = budgetSummaries.find((b) => b.category === target);
      if (currentSummary && Number(currentSummary.monthly_limit) > 0) {
        setLimitAmount(String(currentSummary.monthly_limit));
        setFetchedMeta({
          source: 'current',
          month: selectedMonth,
          amount: Number(currentSummary.monthly_limit),
        });
        return;
      }

      // 3. Current month budget check
      const currentBudget = budgets.find((b) => b.category === target);
      if (currentBudget && Number(currentBudget.monthly_limit) > 0) {
        setLimitAmount(String(currentBudget.monthly_limit));
        setFetchedMeta({
          source: 'current',
          month: selectedMonth,
          amount: Number(currentBudget.monthly_limit),
        });
        return;
      }

      // 4. Remote Supabase lookup for previous month's limit across history
      if (!user) {
        setLimitAmount('');
        setFetchedMeta(null);
        return;
      }

      const reqId = ++fetchRequestId.current;
      setIsFetchingLimit(true);

      try {
        let query = supabase
          .from('budgets')
          .select('monthly_limit, month')
          .eq('user_id', user.id);

        if (target === null) {
          query = query.is('category', null);
        } else {
          query = query.eq('category', target);
        }

        const { data, error } = await query
          .order('month', { ascending: false })
          .limit(1);

        if (reqId !== fetchRequestId.current) return; // Stale request

        if (!error && data && data.length > 0 && Number(data[0].monthly_limit) > 0) {
          const prevAmt = String(data[0].monthly_limit);
          setLimitAmount(prevAmt);
          setFetchedMeta({
            source: 'previous',
            month: data[0].month,
            amount: Number(data[0].monthly_limit),
          });
        } else {
          setLimitAmount('');
          setFetchedMeta(null);
        }
      } catch {
        if (reqId === fetchRequestId.current) {
          setLimitAmount('');
          setFetchedMeta(null);
        }
      } finally {
        if (reqId === fetchRequestId.current) {
          setIsFetchingLimit(false);
        }
      }
    },
    [budgetSummaries, budgets, user, selectedMonth]
  );

  // Category switch handler
  const handleSelectCategory = useCallback(
    (cat: string) => {
      Haptics.selectionAsync().catch(() => {});

      // Preserve current text in draft for old category
      if (selectedCategory && limitAmount.trim() !== '') {
        draftLimits.current[selectedCategory] = limitAmount.trim();
      }

      setSelectedCategory(cat);
      setFormError(null);
      fetchLimitForCategory(cat);
    },
    [selectedCategory, limitAmount, fetchLimitForCategory]
  );

  // Smooth form open
  const handleOpenForm = useCallback(
    (targetCat?: string) => {
      if (isLocked) {
        Alert.alert(
          'Period Locked',
          `The budget for ${selectedMonth} is locked (View Only). To adjust budgets for this period, unlock it from the Dashboard.`
        );
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowForm(true);
      setFormError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const catToSelect = targetCat || selectedCategory || 'Overall Budget';
      setSelectedCategory(catToSelect);
      fetchLimitForCategory(catToSelect);

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 60);
    },
    [isLocked, selectedMonth, selectedCategory, fetchLimitForCategory]
  );

  // Smooth form close (Cancel / collapse)
  const handleCloseForm = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm(false);
    setFormError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  // Back button handling:
  // 1. Android hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showForm) {
          handleCloseForm();
          return true; // Intercept: collapses edit limit form instead of exiting!
        }
        return false;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );
      return () => subscription.remove();
    }, [showForm, handleCloseForm])
  );

  // 2. Navigation beforeRemove listener (e.g., gesture or header pop)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (showForm) {
        e.preventDefault();
        handleCloseForm();
      }
    });
    return unsubscribe;
  }, [navigation, showForm, handleCloseForm]);

  // Handle route params async fetch if limit wasn't provided
  useEffect(() => {
    if (route?.params?.editCategory !== undefined && !route?.params?.currentLimit) {
      const cat = route.params.editCategory;
      const timer = setTimeout(() => {
        fetchLimitForCategory(cat);
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [route?.params?.editCategory, route?.params?.currentLimit, fetchLimitForCategory]);

  const handleHeaderBack = () => {
    if (showForm) {
      handleCloseForm();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handlePresetSelect = (preset: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLimitAmount(String(preset));
    setFetchedMeta(null);
  };

  const handleIncrementLimit = (increment: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const current = parseFloat(limitAmount) || 0;
    const nextVal = Math.max(0, current + increment);
    setLimitAmount(String(nextVal));
    setFetchedMeta(null);
  };

  const handleSaveBudget = async () => {
    if (!user) return;
    const numLimit = parseFloat(limitAmount);
    if (isNaN(numLimit) || numLimit <= 0) {
      setFormError('Please enter a valid monthly limit (e.g. 5000)');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    setFormError(null);
    const categoryToSave =
      selectedCategory === 'Overall Budget' ? null : selectedCategory;

    // Cache updated value in draft
    draftLimits.current[selectedCategory] = String(numLimit);

    // Smooth UI close with success haptic
    handleCloseForm();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    await setBudgetOptimistic({
      user_id: user.id,
      category: categoryToSave,
      monthly_limit: numLimit,
      month: selectedMonth,
    });
  };

  const promptDeleteBudget = (categoryName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBudgetToDelete(categoryName);
  };

  const handleConfirmDeleteBudget = async () => {
    if (!budgetToDelete || !user) return;
    setIsDeletingBudget(true);

    const catTarget = budgetToDelete === 'Overall Budget' ? null : budgetToDelete;
    const existing = budgetSummaries.find(
      (b) => b.category === catTarget && b.month === selectedMonth
    );

    const deletedCategory = budgetToDelete;

    if (existing) {
      await deleteBudgetOptimistic(existing.budget_id, catTarget, selectedMonth, user.id);
    }

    delete draftLimits.current[deletedCategory];

    if (selectedCategory === deletedCategory) {
      setLimitAmount('');
      setFetchedMeta(null);
      handleCloseForm();
    }

    setIsDeletingBudget(false);
    setBudgetToDelete(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleClearFormData = () => {
    setLimitAmount('');
    setFetchedMeta(null);
    delete draftLimits.current[selectedCategory];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const getStatusColor = (pct: number) => {
    if (pct >= 100) return colors.alert;
    if (pct >= 80) return colors.warning;
    return accent.hex;
  };

  const activeCategoryIcon = useMemo(() => {
    return getCategoryIcon(selectedCategory);
  }, [selectedCategory]);

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Top Header */}
      <View
        style={[
          styles.topHeader,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          {(navigation.canGoBack() || showForm) && (
            <TouchableOpacity
              onPress={handleHeaderBack}
              style={[
                styles.headerBackBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceLight,
                },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-back"
                size={18}
                color={showForm ? accent.hex : colors.textPrimary}
              />
            </TouchableOpacity>
          )}
          <View>
            <Text style={[styles.appTitle, { color: accent.hex }]}>BUDGETS</Text>
            <Text style={[styles.monthText, { color: colors.textPrimary }]}>
              Current Period: {selectedMonth}
            </Text>
          </View>
        </View>

        {isLocked ? (
          <View style={styles.lockedHeaderBadge}>
            <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
            <Text style={styles.lockedHeaderText}>LOCKED</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              if (showForm) {
                handleCloseForm();
              } else {
                handleOpenForm();
              }
            }}
            style={[
              styles.addBudgetBtn,
              {
                backgroundColor: showForm ? colors.surfaceLight : accent.muted,
                borderColor: showForm ? colors.border : accent.hex,
              },
            ]}
            activeOpacity={0.8}
          >
            <Ionicons
              name={showForm ? 'close' : 'add'}
              size={14}
              color={showForm ? colors.textSecondary : accent.hex}
            />
            <Text
              style={[
                styles.addBudgetText,
                { color: showForm ? colors.textSecondary : accent.hex },
              ]}
            >
              {showForm ? 'Cancel' : 'Set Budget'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <InlineError message={inlineError} onDismiss={() => setInlineError(null)} />

      <KeyboardAwareScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        extraScrollHeight={80}
        showsVerticalScrollIndicator={false}
      >
        {/* Alive Budget Overview Cockpit */}
        <View
          style={[
            styles.cockpitCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cockpitTopRow}>
            <View style={styles.cockpitLeftHeader}>
              <View
                style={[
                  styles.cockpitIconBubble,
                  { backgroundColor: accent.muted },
                ]}
              >
                <Ionicons name="sparkles" size={16} color={accent.hex} />
              </View>
              <View>
                <Text style={[styles.cockpitSubtitle, { color: colors.textMuted }]}>
                  MONTHLY BUDGET HEALTH
                </Text>
                <Text style={[styles.cockpitTitle, { color: colors.textPrimary }]}>
                  {totalBudgetLimit > 0
                    ? `₹${totalSpent.toLocaleString('en-IN')} of ₹${totalBudgetLimit.toLocaleString('en-IN')}`
                    : 'No limits set yet'}
                </Text>
              </View>
            </View>

            {totalBudgetLimit > 0 && (
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      overallPct >= 100
                        ? colors.alertMuted
                        : overallPct >= 80
                        ? colors.warningMuted
                        : accent.muted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        overallPct >= 100
                          ? colors.alert
                          : overallPct >= 80
                          ? colors.warning
                          : accent.hex,
                    },
                  ]}
                >
                  {overallPct >= 100
                    ? 'Over Budget'
                    : overallPct >= 80
                    ? 'Approaching Limit'
                    : 'On Track'}
                </Text>
              </View>
            )}
          </View>

          {totalBudgetLimit > 0 && (
            <>
              <ProgressBar
                progress={Math.min(overallPct / 100, 1)}
                color={getStatusColor(overallPct)}
                style={styles.cockpitProgressBar}
              />

              <View style={styles.cockpitMetricsRow}>
                <View>
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                    REMAINING
                  </Text>
                  <Text
                    style={[
                      styles.metricValue,
                      TYPOGRAPHY.tabularText,
                      {
                        color:
                          totalBudgetLimit - totalSpent >= 0
                            ? accent.hex
                            : colors.alert,
                      },
                    ]}
                  >
                    {totalBudgetLimit - totalSpent >= 0 ? '₹' : '-₹'}
                    {Math.abs(totalBudgetLimit - totalSpent).toLocaleString('en-IN')}
                  </Text>
                </View>

                {daysLeftInPeriod !== null && (
                  <View style={styles.metricRight}>
                    <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                      SAFE DAILY PACE
                    </Text>
                    <Text
                      style={[
                        styles.metricValue,
                        TYPOGRAPHY.tabularText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {dailySafeAllowance !== null ? `₹${dailySafeAllowance}/day` : '—'}
                    </Text>
                    <Text style={[styles.daysLeftSub, { color: colors.textMuted }]}>
                      {daysLeftInPeriod} days remaining
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Set Budget Form (Collapsible with Smooth Animation) */}
        {showForm && (
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: colors.surface,
                borderColor: accent.hex,
              },
            ]}
          >
            {/* Form Header with Close Button */}
            <View style={styles.formCardHeader}>
              <View style={styles.formCardHeaderLeft}>
                {isEditingExisting ? (
                  <EditIcon size={16} color={accent.hex} />
                ) : (
                  <Ionicons name="options-outline" size={16} color={accent.hex} />
                )}
                <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
                  {isEditingExisting ? 'EDIT MONTHLY LIMIT' : 'SET MONTHLY LIMIT'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCloseForm}
                style={[
                  styles.formCloseBtn,
                  { backgroundColor: colors.surfaceLight, borderColor: colors.border },
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {formError ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: colors.alertMuted,
                    borderColor: colors.alert,
                  },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={15} color={colors.alert} />
                <Text style={[styles.errorText, { color: colors.alert }]}>
                  {formError}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              SELECT BUDGET TARGET
            </Text>

            {/* Primary Overall Option */}
            <TouchableOpacity
              onPress={() => handleSelectCategory('Overall Budget')}
              style={[
                styles.overallCategoryPill,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor:
                    selectedCategory === 'Overall Budget'
                      ? accent.hex
                      : colors.border,
                },
                selectedCategory === 'Overall Budget' && {
                  backgroundColor: accent.muted,
                },
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.catPillLeft}>
                <Ionicons
                  name="pie-chart-outline"
                  size={17}
                  color={
                    selectedCategory === 'Overall Budget'
                      ? accent.hex
                      : colors.textSecondary
                  }
                />
                <View>
                  <Text
                    style={[
                      styles.overallCategoryText,
                      { color: colors.textPrimary },
                      selectedCategory === 'Overall Budget' && {
                        color: accent.hex,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    Overall Monthly Budget
                  </Text>
                  <Text style={[styles.overallCategorySub, { color: colors.textMuted }]}>
                    Limits all combined categories
                  </Text>
                </View>
              </View>
              {selectedCategory === 'Overall Budget' && (
                <Ionicons name="checkmark-circle" size={18} color={accent.hex} />
              )}
            </TouchableOpacity>

            {/* Wrapping Grid of Categories */}
            <View style={styles.categoriesGrid}>
              {categories.filter((c) => c !== 'Credit Card Payment').map((cat) => {
                const active = selectedCategory === cat;
                const iconName = getCategoryIcon(cat);
                const colorToken = getCategoryColor(cat, undefined, accent.hex);

                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => handleSelectCategory(cat)}
                    style={[
                      styles.categoryGridPill,
                      {
                        backgroundColor: active
                          ? colorToken.bg
                          : colors.surfaceLight,
                        borderColor: active ? accent.hex : colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={iconName}
                      size={14}
                      color={active ? accent.hex : colorToken.text}
                    />
                    <Text
                      style={[
                        styles.categoryGridPillText,
                        { color: active ? accent.hex : colors.textPrimary },
                        active && { fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {cat}
                    </Text>
                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={13}
                        color={accent.hex}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Dynamic Category Spending Insights (Alive Feature) */}
            <View
              style={[
                styles.liveInsightBox,
                {
                  backgroundColor: colors.surfaceLight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.insightHeaderRow}>
                <View style={styles.insightTitleLeft}>
                  <Ionicons name={activeCategoryIcon} size={15} color={accent.hex} />
                  <Text style={[styles.insightTitleText, { color: colors.textPrimary }]}>
                    {selectedCategory} Insights
                  </Text>
                </View>
                <Text style={[styles.insightSpendValue, { color: colors.textPrimary }]}>
                  Spent: ₹{selectedCategorySpend.toLocaleString('en-IN')}
                </Text>
              </View>

              {limitAmount !== '' && parseFloat(limitAmount) > 0 && (
                <View style={styles.insightPreviewRow}>
                  <Text style={[styles.insightSubText, { color: colors.textMuted }]}>
                    {parseFloat(limitAmount) >= selectedCategorySpend
                      ? `₹${(parseFloat(limitAmount) - selectedCategorySpend).toLocaleString('en-IN')} headroom remaining`
                      : `⚠️ Currently over limit by ₹${(selectedCategorySpend - parseFloat(limitAmount)).toLocaleString('en-IN')}`}
                  </Text>
                  <Text style={[styles.insightPctText, { color: accent.hex }]}>
                    {Math.round((selectedCategorySpend / parseFloat(limitAmount)) * 100)}%
                  </Text>
                </View>
              )}
            </View>

            {/* Limit Input & Auto-Fetch Indicators */}
            <View style={styles.limitInputHeader}>
              <View style={styles.limitLabelWithCap}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  MONTHLY LIMIT (₹)
                </Text>
              </View>

              {/* Auto-Fetch Status Indicator */}
              {isFetchingLimit ? (
                <View style={styles.fetchStatusRow}>
                  <ActivityIndicator size={12} color={accent.hex} />
                  <Text style={[styles.fetchStatusText, { color: accent.hex }]}>
                    Fetching previous limit...
                  </Text>
                </View>
              ) : fetchedMeta ? (
                <View style={styles.fetchStatusRow}>
                  <Ionicons
                    name={
                      fetchedMeta.source === 'current'
                        ? 'checkmark-done-circle'
                        : fetchedMeta.source === 'previous'
                        ? 'sparkles'
                        : 'create'
                    }
                    size={13}
                    color={accent.hex}
                  />
                  <Text style={[styles.fetchStatusText, { color: accent.hex }]}>
                    {fetchedMeta.source === 'current'
                      ? 'Current active limit'
                      : fetchedMeta.source === 'previous'
                      ? `Auto-filled from ${fetchedMeta.month}`
                      : 'Restored draft'}
                  </Text>
                </View>
              ) : null}
            </View>

            <TextInput
              value={limitAmount}
              onChangeText={(text) => {
                setLimitAmount(text);
                setFetchedMeta(null);
              }}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ y: 550, animated: true });
                }, 100);
              }}
              placeholder="e.g. 5000"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              mode="outlined"
              outlineColor={colors.border}
              activeOutlineColor={accent.hex}
              textColor={colors.textPrimary}
              style={[
                styles.limitInput,
                { backgroundColor: colors.surfaceLight },
              ]}
              left={
                <TextInput.Affix
                  text="₹"
                  textStyle={{ color: accent.hex, fontWeight: '700' }}
                />
              }
              right={
                limitAmount !== '' ? (
                  <TextInput.Icon
                    icon="close-circle"
                    color={colors.textMuted}
                    onPress={() => {
                      setLimitAmount('');
                      setFetchedMeta(null);
                    }}
                  />
                ) : undefined
              }
            />

            {/* Quick Amount Suggestion Chips */}
            <View style={styles.presetsWrapper}>
              <Text style={[styles.presetsLabel, { color: colors.textMuted }]}>
                QUICK PRESETS:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetsScroll}
              >
                {(selectedCategory === 'Overall Budget'
                  ? [10000, 20000, 30000, 50000]
                  : [1000, 2500, 5000, 10000]
                ).map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => handlePresetSelect(preset)}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: colors.surfaceLight,
                        borderColor:
                          limitAmount === String(preset)
                            ? accent.hex
                            : colors.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        {
                          color:
                            limitAmount === String(preset)
                              ? accent.hex
                              : colors.textPrimary,
                        },
                      ]}
                    >
                      ₹{preset.toLocaleString('en-IN')}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  onPress={() => handleIncrementLimit(500)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetChipText, { color: accent.hex }]}>
                    +₹500
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleIncrementLimit(1000)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: colors.surfaceLight,
                      borderColor: colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetChipText, { color: accent.hex }]}>
                    +₹1,000
                  </Text>
                </TouchableOpacity>

                {selectedCategorySpend > 0 && (
                  <TouchableOpacity
                    onPress={() =>
                      handlePresetSelect(Math.ceil(selectedCategorySpend / 100) * 100)
                    }
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: accent.muted,
                        borderColor: accent.hex,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.presetChipText, { color: accent.hex }]}>
                      Match Spent (₹
                      {Math.ceil(selectedCategorySpend / 100) * 100})
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* Form Actions: Cancel + Delete/Clear + Save Budget */}
            <View style={styles.formActionsRow}>
              <TouchableOpacity
                onPress={handleCloseForm}
                style={[
                  styles.cancelBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceLight,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              {isEditingExisting ? (
                <TouchableOpacity
                  onPress={() => promptDeleteBudget(selectedCategory)}
                  style={[
                    styles.deleteFormBtn,
                    {
                      borderColor: colors.alert + '45',
                      backgroundColor: colors.alertMuted,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.alert} />
                  <Text style={[styles.deleteFormBtnText, { color: colors.alert }]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              ) : limitAmount !== '' ? (
                <TouchableOpacity
                  onPress={handleClearFormData}
                  style={[
                    styles.clearFormBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceLight,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="backspace-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.clearFormBtnText, { color: colors.textSecondary }]}>
                    Clear
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TactileButton
                onPress={handleSaveBudget}
                style={[styles.saveBudgetBtn, { backgroundColor: accent.hex }]}
              >
                <Text style={[styles.saveBudgetBtnText, { color: colors.textInverse }]}>
                  {isEditingExisting ? 'Update Budget' : 'Save Budget'}
                </Text>
              </TactileButton>
            </View>
          </View>
        )}

        {/* 1. Overall Monthly Budget Card */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            OVERALL MONTHLY SPEND
          </Text>
        </View>

        {overallSummary ? (
          <TouchableOpacity
            onPress={() => handleOpenForm('Overall Budget')}
            style={[
              styles.budgetCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitleRow}>
                <View
                  style={[
                    styles.cardHeaderIconCircle,
                    { backgroundColor: accent.muted },
                  ]}
                >
                  <Ionicons name="pie-chart" size={17} color={accent.hex} />
                </View>
                <View style={styles.cardHeaderTitleTextCol}>
                  <Text
                    style={[styles.budgetCardName, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    Overall Budget
                  </Text>
                </View>
              </View>
              <View style={styles.cardHeaderRight}>
                <Text
                  style={[
                    styles.pctBadgeText,
                    TYPOGRAPHY.tabularText,
                    {
                      color: getStatusColor(
                        Number(overallSummary.spent_percentage)
                      ),
                    },
                  ]}
                >
                  {Math.round(Number(overallSummary.spent_percentage))}%
                </Text>
                <View style={styles.cardActionsCluster}>
                  <EditButton
                    size={26}
                    iconSize={13}
                    onPress={() => handleOpenForm('Overall Budget')}
                  />
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      promptDeleteBudget('Overall Budget');
                    }}
                    style={[
                      styles.cardDeletePill,
                      {
                        borderColor: colors.alert + '40',
                        backgroundColor: colors.alertMuted,
                      },
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={12} color={colors.alert} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.numbersRow}>
              <View>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  SPENT
                </Text>
                <ReanimatedNumber
                  value={Number(overallSummary.spent)}
                  style={[styles.spentNumber, { color: colors.textPrimary }]}
                  decimals={0}
                />
              </View>
              <View style={styles.rightAlign}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  LIMIT
                </Text>
                <ReanimatedNumber
                  value={Number(overallSummary.monthly_limit)}
                  style={[styles.limitNumber, { color: colors.textSecondary }]}
                  decimals={0}
                />
              </View>
            </View>

            <ProgressBar
              progress={Math.min(
                Number(overallSummary.spent_percentage) / 100,
                1
              )}
              color={getStatusColor(Number(overallSummary.spent_percentage))}
              style={styles.progressBar}
            />

            <View style={styles.footerRow}>
              <Text style={[styles.remainingLabel, { color: colors.textSecondary }]}>
                Remaining Budget
              </Text>
              <Text
                style={[
                  styles.remainingValue,
                  TYPOGRAPHY.tabularText,
                  {
                    color:
                      Number(overallSummary.remaining) >= 0
                        ? accent.hex
                        : colors.alert,
                  },
                ]}
              >
                {Number(overallSummary.remaining) >= 0 ? '₹' : '-₹'}
                {Math.abs(Number(overallSummary.remaining)).toLocaleString('en-IN')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => handleOpenForm('Overall Budget')}
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: accent.muted },
              ]}
            >
              <Ionicons name="pie-chart-outline" size={24} color={accent.hex} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No overall budget configured
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Tap to set an overall monthly spending limit for {selectedMonth}.
            </Text>
            <View
              style={[
                styles.emptyActionPill,
                { backgroundColor: accent.muted, borderColor: accent.hex },
              ]}
            >
              <Text style={[styles.emptyActionText, { color: accent.hex }]}>
                + Set Monthly Limit
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 2. Category Budgets Section */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.lg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            CATEGORY BREAKDOWN
          </Text>
          <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
            {categorySummaries.length} active
          </Text>
        </View>

        {categorySummaries.length > 0 ? (
          categorySummaries.map((catSummary) => {
            const pct = Math.min(Number(catSummary.spent_percentage) / 100, 1);
            const color = getStatusColor(Number(catSummary.spent_percentage));
            const catName = catSummary.category || '';
            const iconName = getCategoryIcon(catName);
            const colorToken = getCategoryColor(catName, undefined, accent.hex);

            return (
              <TouchableOpacity
                key={catSummary.budget_id}
                onPress={() => handleOpenForm(catName)}
                style={[
                  styles.catBudgetCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.catTitleLeft}>
                    <View
                      style={[
                        styles.catIconBubble,
                        { backgroundColor: colorToken.bg },
                      ]}
                    >
                      <Ionicons name={iconName} size={15} color={colorToken.text} />
                    </View>
                    <View style={styles.catTitleTextCol}>
                      <Text
                        style={[styles.categoryName, { color: colors.textPrimary }]}
                        numberOfLines={2}
                      >
                        {catSummary.category}
                      </Text>
                      <Text
                        style={[styles.categorySub, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        ₹{Number(catSummary.spent).toLocaleString('en-IN')} of ₹
                        {Number(catSummary.monthly_limit).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardHeaderRight}>
                    <Text
                      style={[
                        styles.categoryPct,
                        TYPOGRAPHY.tabularText,
                        { color },
                      ]}
                    >
                      {Math.round(Number(catSummary.spent_percentage))}%
                    </Text>
                    <View style={styles.cardActionsCluster}>
                      <EditButton
                        size={26}
                        iconSize={13}
                        onPress={() => handleOpenForm(catName)}
                      />
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          promptDeleteBudget(catName);
                        }}
                        style={[
                          styles.cardDeletePill,
                          {
                            borderColor: colors.alert + '40',
                            backgroundColor: colors.alertMuted,
                          },
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={11} color={colors.alert} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <ProgressBar
                  progress={pct}
                  color={color}
                  style={styles.catProgressBar}
                />

                <View style={styles.catFooter}>
                  <Text style={[styles.catRemainingLabel, { color: colors.textMuted }]}>
                    {Number(catSummary.remaining) >= 0 ? 'Remaining' : 'Over Limit'}
                  </Text>
                  <Text
                    style={[
                      styles.catRemaining,
                      TYPOGRAPHY.tabularText,
                      {
                        color:
                          Number(catSummary.remaining) >= 0
                            ? accent.hex
                            : colors.alert,
                      },
                    ]}
                  >
                    {Number(catSummary.remaining) >= 0 ? '₹' : '-₹'}
                    {Math.abs(Number(catSummary.remaining)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <TouchableOpacity
            onPress={() => handleOpenForm(categories[0] || 'Food & Dining')}
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surfaceLight },
              ]}
            >
              <Ionicons name="pricetags-outline" size={24} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No category limits configured
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Set limits for Food & Dining, Shopping, Travel, and more.
            </Text>
            <View
              style={[
                styles.emptyActionPill,
                { backgroundColor: accent.muted, borderColor: accent.hex },
              ]}
            >
              <Text style={[styles.emptyActionText, { color: accent.hex }]}>
                + Set Category Limit
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollView>

      {/* Delete Budget Confirmation Modal */}
      <Modal
        visible={!!budgetToDelete}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isDeletingBudget && setBudgetToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.deleteModalContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.deleteIconBubble, { backgroundColor: colors.alertMuted }]}>
              <Ionicons name="trash-outline" size={26} color={colors.alert} />
            </View>
            <Text style={[styles.deleteModalTitle, { color: colors.textPrimary }]}>
              Delete Budget?
            </Text>
            <Text style={[styles.deleteModalDescription, { color: colors.textSecondary }]}>
              Are you sure you want to remove the monthly spending limit for{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {budgetToDelete}
              </Text>
              ? This will clear the budget card for {selectedMonth}.
            </Text>
            <View style={styles.deleteModalActionsRow}>
              <TouchableOpacity
                onPress={() => setBudgetToDelete(null)}
                disabled={isDeletingBudget}
                style={[
                  styles.deleteModalCancelBtn,
                  { borderColor: colors.border, backgroundColor: colors.surfaceLight },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.deleteModalCancelText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmDeleteBudget}
                disabled={isDeletingBudget}
                style={[styles.deleteModalConfirmBtn, { backgroundColor: colors.alert }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.deleteModalConfirmText, { color: colors.textInverse }]}>
                  {isDeletingBudget ? 'Deleting...' : 'Delete Budget'}
                </Text>
              </TouchableOpacity>
            </View>
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  monthText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addBudgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  addBudgetText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lockedHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedHeaderText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  cockpitCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cockpitTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  cockpitLeftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cockpitIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cockpitSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cockpitTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cockpitProgressBar: {
    height: 8,
    borderRadius: 4,
    marginVertical: SPACING.sm,
  },
  cockpitMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: SPACING.xs,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricCenter: {
    alignItems: 'center',
  },
  metricRight: {
    alignItems: 'flex-end',
  },
  daysLeftSub: {
    fontSize: 11,
    marginTop: 2,
  },
  formCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  formCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  formCloseBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  overallCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.sm,
  },
  catPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  overallCategoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  overallCategorySub: {
    fontSize: 10,
    marginTop: 1,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  categoryGridPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryGridPillText: {
    fontSize: 12,
  },
  liveInsightBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  insightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  insightTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  insightTitleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  insightSpendValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  insightPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  insightSubText: {
    fontSize: 11,
  },
  insightPctText: {
    fontSize: 11,
    fontWeight: '700',
  },
  limitInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  limitLabelWithCap: {
    flexDirection: 'column',
  },
  fetchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  fetchStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  limitInput: {
    marginBottom: SPACING.sm,
    fontSize: 18,
    fontWeight: '700',
  },
  presetsWrapper: {
    marginBottom: SPACING.md,
  },
  presetsLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  presetsScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  formActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBudgetBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBudgetBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontSize: 11,
  },
  budgetCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardHeaderTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginRight: SPACING.xs,
    minWidth: 0,
  },
  cardHeaderTitleTextCol: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  budgetCardName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 0,
  },
  pctBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  cardEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  cardEditPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  spentNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  rightAlign: {
    alignItems: 'flex-end',
  },
  limitNumber: {
    fontSize: 20,
    fontWeight: '700',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginVertical: SPACING.xs,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  remainingLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  remainingValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  catBudgetCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  catTitleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginRight: SPACING.xs,
    minWidth: 0,
  },
  catTitleTextCol: {
    flex: 1,
    minWidth: 0,
  },
  catIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  categorySub: {
    fontSize: 11,
    marginTop: 1,
  },
  categoryPct: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  catProgressBar: {
    height: 6,
    borderRadius: 3,
    marginVertical: SPACING.xs,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catRemainingLabel: {
    fontSize: 11,
  },
  catRemaining: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  emptyActionPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardActionsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardDeletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  deleteFormBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
  },
  deleteFormBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  clearFormBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
  },
  clearFormBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  deleteModalContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  deleteIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  deleteModalDescription: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  deleteModalActionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
