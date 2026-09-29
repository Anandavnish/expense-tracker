import React, { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator } from 'react-native-paper';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  createNavigationContainerRef,
  CommonActions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useShareIntent } from 'expo-share-intent';
import { useAuthStore } from '../store/authStore';
import { useFinanceStore } from '../store/financeStore';
import { useSettingsStore } from '../store/settingsStore';
import { useMerchantRulesStore } from '../store/merchantRulesStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { BorrowsScreen } from '../screens/main/BorrowsScreen';
import { AddTransactionScreen } from '../screens/main/AddTransactionScreen';
import { AccountDetailScreen } from '../screens/main/AccountDetailScreen';
import { TransactionDetailScreen } from '../screens/main/TransactionDetailScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { extractTextFromImage } from '../services/ocrService';
import {
  parseTransaction,
  parseTransactionWithPipeline,
} from '../services/transactionParser';
import {
  checkForAppUpdate,
  AppReleaseInfo,
  CURRENT_APP_VERSION,
} from '../services/versionService';
import { UpdatePromptModal } from '../components/UpdatePromptModal';

// Configure in-app notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const navigationRef = createNavigationContainerRef<any>();

const AppStack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { session, user, isLoading, initializeAuth } = useAuthStore();
  const { loadSettings, accent, effectiveTheme, colors, hasGeminiApiKey } = useSettingsStore();
  const {
    loadCachedData,
    fetchInitialData,
    subscribeRealtime,
    unsubscribeRealtime,
  } = useFinanceStore();

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: Platform.OS === 'web',
  });

  // App Release / APK Update State
  const [availableUpdate, setAvailableUpdate] = React.useState<AppReleaseInfo | null>(null);
  const [isUpdateMandatory, setIsUpdateMandatory] = React.useState(false);
  const [showUpdateModal, setShowUpdateModal] = React.useState(false);

  // Queue navigation if NavigationContainer is not yet mounted/ready
  const pendingNavRef = React.useRef<{ screen: string; params: any } | null>(null);

  const navigateOrQueue = useCallback((screen: string, params: any) => {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.navigate({ name: screen, params }));
      setTimeout(() => {
        if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== screen) {
          navigationRef.dispatch(CommonActions.navigate({ name: screen, params }));
        }
      }, 120);
    } else {
      pendingNavRef.current = { screen, params };
    }
  }, []);

  // Surface shared transactions: safely posts a tappable notification if backgrounded
  // (compliant with Android 10+ Background Activity Launch restrictions), or directly navigates if active
  const surfaceSharedTransaction = useCallback(
    async (navParams: any, summaryTitle: string, summaryBody: string) => {
      const isBackgrounded = AppState.currentState !== 'active';

      if (isBackgrounded) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: summaryTitle,
              body: summaryBody,
              data: {
                screen: 'AddTransaction',
                params: navParams,
              },
            },
            trigger: null,
          });
        } catch (e) {
          console.warn('[RootNavigator] Failed to schedule notification:', e);
        }
      } else {
        navigateOrQueue('AddTransaction', navParams);
      }
    },
    [navigateOrQueue]
  );

  // Listen for user taps on the transaction notification to route cleanly from background
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.screen === 'AddTransaction') {
        navigateOrQueue('AddTransaction', data.params);
      }
    });

    return () => {
      sub.remove();
    };
  }, [navigateOrQueue]);

  // Check for app releases / APK updates on launch
  useEffect(() => {
    let isMounted = true;
    const checkUpdates = async () => {
      try {
        const result = await checkForAppUpdate();
        if (isMounted && result.hasUpdate && result.release) {
          setAvailableUpdate(result.release);
          setIsUpdateMandatory(result.isMandatory);
          setShowUpdateModal(true);
        }
      } catch {
        // Graceful error handling
      }
    };
    checkUpdates();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    initializeAuth();
    loadSettings();
  }, [initializeAuth, loadSettings]);

  useEffect(() => {
    if (user) {
      loadCachedData(user.id);
      fetchInitialData(user.id);
      subscribeRealtime(user.id);
    } else {
      unsubscribeRealtime();
    }

    return () => {
      unsubscribeRealtime();
    };
  }, [user, loadCachedData, fetchInitialData, subscribeRealtime, unsubscribeRealtime]);

  const processSharedImage = useCallback(
    async (uri: string) => {
      let keyAvailable = hasGeminiApiKey;
      if (!keyAvailable) {
        try {
          const localKey = await AsyncStorage.getItem('@gemini_byok_api_key');
          if (localKey && localKey.trim()) {
            keyAvailable = true;
          }
        } catch {
          // ignore
        }
      }

      // If active in foreground, immediately show analyzing state
      if (AppState.currentState === 'active') {
        navigateOrQueue('AddTransaction', {
          imageUri: uri,
          prefillSource: 'screenshot',
          isAnalyzing: true,
          scanMessage: 'Reading receipt with on-device OCR...',
        });
      }

      try {
        const { accounts, categories } = useFinanceStore.getState();
        const { rules, recordGeminiRule } = useMerchantRulesStore.getState();

        // 1. Run on-device OCR via expo-mlkit-ocr
        const ocrRes = await extractTextFromImage(uri);

        // 2. Run shared extraction & rule classification pipeline
        const parsed = await parseTransactionWithPipeline(
          {
            rawText: ocrRes.text,
            ocrBlocks: ocrRes.blocks,
            userAccounts: accounts,
            availableCategories: categories,
            learnedRules: rules,
          },
          {
            imageUri: uri,
            enableGeminiEscalation: keyAvailable,
            onTeachRule: (m, c, t) => recordGeminiRule(m, c, t),
          }
        );

        const parsedMerchant = parsed.merchant !== 'Unknown' ? parsed.merchant : undefined;

        const navParams = {
          imageUri: uri,
          prefillAmount: parsed.amount !== null ? parsed.amount : undefined,
          prefillNote: parsedMerchant || undefined,
          parsedMerchant,
          prefillPersonName:
            parsed.suggestedType === 'borrow_given' || parsed.suggestedType === 'borrow_taken'
              ? parsed.merchant !== 'Unknown'
                ? parsed.merchant
                : undefined
              : undefined,
          prefillType: parsed.suggestedType,
          prefillCategory: parsed.suggestedCategory,
          prefillDate: parsed.date || undefined,
          accountId: parsed.matchedAccountId,
          prefillSource: 'screenshot',
          isAnalyzing: false,
          scanMessage: parsed.isCategoryLearned
            ? `Matched learned rule: ${parsed.merchant} ➔ ${parsed.suggestedCategory}`
            : parsed.amount !== null
            ? `Extracted ₹${parsed.amount} for ${parsed.merchant} (${parsed.suggestedCategory})`
            : 'Screenshot parsed! Review details and save.',
        };

        const title = parsed.amount !== null ? `Receipt Parsed: ₹${parsed.amount}` : 'Receipt Ready';
        const body = parsedMerchant
          ? `${parsedMerchant} (${parsed.suggestedCategory}) — Tap to review and save`
          : 'Receipt scanned — Tap to review and save';

        surfaceSharedTransaction(navParams, title, body);
      } catch {
        if (AppState.currentState === 'active') {
          navigateOrQueue('AddTransaction', {
            imageUri: uri,
            isAnalyzing: false,
            scanError: "Couldn't read that screenshot — enter it manually",
          });
        }
      }
    },
    [hasGeminiApiKey, navigateOrQueue, surfaceSharedTransaction]
  );

  const processSharedText = useCallback(
    async (rawText: string) => {
      const { accounts, categories } = useFinanceStore.getState();
      const { rules, recordGeminiRule } = useMerchantRulesStore.getState();

      let keyAvailable = hasGeminiApiKey;
      if (!keyAvailable) {
        try {
          const localKey = await AsyncStorage.getItem('@gemini_byok_api_key');
          if (localKey && localKey.trim()) {
            keyAvailable = true;
          }
        } catch {
          // ignore
        }
      }

      // 1. Instant deterministic parsing & exact learned rule matching first (0ms, offline)
      const parsed = parseTransaction({
        rawText,
        userAccounts: accounts,
        availableCategories: categories,
        learnedRules: rules,
      });

      const parsedMerchant = parsed.merchant !== 'Unknown' ? parsed.merchant : undefined;

      const navParams: any = {
        prefillAmount: parsed.amount !== null ? parsed.amount : undefined,
        prefillNote:
          parsedMerchant || (rawText.length > 80 ? rawText.substring(0, 77) + '...' : rawText),
        parsedMerchant,
        prefillType: parsed.suggestedType,
        prefillCategory: parsed.suggestedCategory,
        prefillDate: parsed.date || undefined,
        accountId: parsed.matchedAccountId,
        prefillSource: 'sms',
        scanMessage: parsed.isCategoryLearned
          ? `Matched learned rule: ${parsed.merchant} ➔ ${parsed.suggestedCategory}`
          : parsed.amount !== null
          ? `Extracted ₹${parsed.amount} for ${parsed.merchant} (${parsed.suggestedCategory})`
          : 'Message received! Review details and save.',
      };

      const title = parsed.amount !== null ? `Expense Detected: ₹${parsed.amount}` : 'New Transaction Shared';
      const body = parsedMerchant
        ? `${parsedMerchant} (${parsed.suggestedCategory}) — Tap to review and save`
        : 'Receipt/SMS shared — Tap to review details and save';

      surfaceSharedTransaction(navParams, title, body);

      // 2. If Gemini escalation is needed (unrecognized merchant or low confidence amount),
      // refine in background without blocking the user
      if (keyAvailable && (parsed.needsGeminiAmount || parsed.needsGeminiMerchant)) {
        parseTransactionWithPipeline(
          {
            rawText,
            userAccounts: accounts,
            availableCategories: categories,
            learnedRules: rules,
          },
          {
            enableGeminiEscalation: true,
            onTeachRule: (m, c, t) => recordGeminiRule(m, c, t),
          }
        )
          .then((refined) => {
            if (navigationRef.isReady()) {
              const refinedMerchant = refined.merchant !== 'Unknown' ? refined.merchant : undefined;
              navigationRef.dispatch(
                CommonActions.navigate({
                  name: 'AddTransaction',
                  params: {
                    prefillAmount: refined.amount !== null ? refined.amount : undefined,
                    prefillNote: refinedMerchant,
                    parsedMerchant: refinedMerchant,
                    prefillType: refined.suggestedType,
                    prefillCategory: refined.suggestedCategory,
                    prefillDate: refined.date || undefined,
                    prefillSource: 'sms',
                    scanMessage: refined.isCategoryLearned
                      ? `Matched learned rule: ${refined.merchant} ➔ ${refined.suggestedCategory}`
                      : `Gemini AI identified: ${refined.merchant} (${refined.suggestedCategory})`,
                  },
                })
              );
            }
          })
          .catch(() => {});
      }
    },
    [hasGeminiApiKey, surfaceSharedTransaction]
  );

  // Handle incoming shared screenshot / receipt or SMS text from external apps
  useEffect(() => {
    if (hasShareIntent && session) {
      if (shareIntent?.files && shareIntent.files.length > 0) {
        const file = shareIntent.files[0];
        const imagePath = file.path;
        resetShareIntent();

        if (imagePath) {
          processSharedImage(imagePath);
        }
      } else if (shareIntent?.text && shareIntent.text.trim()) {
        const textToProcess = shareIntent.text.trim();
        resetShareIntent();
        processSharedText(textToProcess);
      }
    }
  }, [hasShareIntent, shareIntent, session, resetShareIntent, processSharedImage, processSharedText]);

  const appNavTheme = useMemo(() => {
    const baseNavTheme = effectiveTheme === 'light' ? DefaultTheme : DarkTheme;
    return {
      ...baseNavTheme,
      colors: {
        ...baseNavTheme.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        primary: accent.hex,
      },
    };
  }, [effectiveTheme, colors, accent.hex]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={accent.hex} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={appNavTheme}
      onReady={() => {
        if (pendingNavRef.current) {
          const { screen, params } = pendingNavRef.current;
          pendingNavRef.current = null;
          const attempt = (delay: number) => {
            setTimeout(() => {
              if (navigationRef.isReady()) {
                navigationRef.dispatch(CommonActions.navigate({ name: screen, params }));
                setTimeout(() => {
                  if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name !== screen) {
                    navigationRef.dispatch(CommonActions.navigate({ name: screen, params }));
                  }
                }, 120);
              }
            }, delay);
          };
          attempt(60);
          attempt(250);
        }
      }}
    >
      {session ? (
        <AppStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animationDuration: 220,
          }}
        >
          <AppStack.Screen name="MainTabs" component={MainTabs} />
          <AppStack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <AppStack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <AppStack.Screen
            name="Borrows"
            component={BorrowsScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <AppStack.Screen
            name="AddTransaction"
            component={AddTransactionScreen}
            options={{ animation: 'slide_from_bottom' }}
          />
          <AppStack.Screen
            name="AccountDetail"
            component={AccountDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <AppStack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </AppStack.Navigator>
      ) : (
        <AuthStack />
      )}
      <UpdatePromptModal
        visible={showUpdateModal}
        release={availableUpdate}
        currentVersion={CURRENT_APP_VERSION}
        isMandatory={isUpdateMandatory}
        onDismiss={() => setShowUpdateModal(false)}
      />
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
