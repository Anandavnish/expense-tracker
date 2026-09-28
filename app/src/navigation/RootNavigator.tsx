import React, { useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator } from 'react-native-paper';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { parseReceiptWithGemini } from '../services/geminiService';
import { parseBankingSms } from '../services/smsParser';
import {
  checkForAppUpdate,
  AppReleaseInfo,
  CURRENT_APP_VERSION,
} from '../services/versionService';
import { UpdatePromptModal } from '../components/UpdatePromptModal';

export const navigationRef = createNavigationContainerRef<any>();

const AppStack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { session, user, isGuest, isLoading, initializeAuth } = useAuthStore();
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
      navigationRef.navigate(screen, params);
    } else {
      pendingNavRef.current = { screen, params };
    }
  }, []);

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

      if (!keyAvailable) {
        // Immediately navigate to AddTransaction on the go, with informative note
        navigateOrQueue('AddTransaction', {
          imageUri: uri,
          prefillSource: 'screenshot',
          scanError: 'Set up Gemini key in Settings for AI screenshot reading, or enter details manually.',
        });
        return;
      }

      // Immediately navigate with active analyzing state so user sees screen open on the go!
      navigateOrQueue('AddTransaction', {
        imageUri: uri,
        prefillSource: 'screenshot',
        isAnalyzing: true,
        scanMessage: 'Analyzing screenshot with Gemini AI...',
      });

      try {
        const { categories } = useFinanceStore.getState();
        const geminiRes = await parseReceiptWithGemini({ imageUri: uri, availableCategories: categories });
        if (geminiRes.success && geminiRes.data) {
          const parsed = geminiRes.data;
          if (parsed.merchant_or_person && parsed.merchant_or_person !== 'Unknown') {
            useMerchantRulesStore.getState().recordGeminiRule(
              parsed.merchant_or_person,
              parsed.suggested_category,
              parsed.suggested_type
            );
          }
          navigateOrQueue('AddTransaction', {
            imageUri: uri,
            prefillAmount: parsed.amount,
            prefillNote: parsed.merchant_or_person,
            parsedMerchant: parsed.merchant_or_person !== 'Unknown' ? parsed.merchant_or_person : undefined,
            prefillPersonName:
              parsed.suggested_type === 'borrow_given' || parsed.suggested_type === 'borrow_taken'
                ? parsed.merchant_or_person
                : undefined,
            prefillType: parsed.suggested_type,
            prefillCategory: parsed.suggested_category,
            prefillDate: parsed.date_if_present || undefined,
            prefillSource: 'screenshot',
            isAnalyzing: false,
            scanMessage: 'Screenshot parsed from share! Review details and save.',
          });
        } else {
          navigateOrQueue('AddTransaction', {
            imageUri: uri,
            isAnalyzing: false,
            scanError: geminiRes.message || "Couldn't read that screenshot — enter it manually",
          });
        }
      } catch {
        navigateOrQueue('AddTransaction', {
          imageUri: uri,
          isAnalyzing: false,
          scanError: "Couldn't read that screenshot — enter it manually",
        });
      }
    },
    [hasGeminiApiKey, navigateOrQueue]
  );

  const processSharedText = useCallback(
    async (rawText: string) => {
      const { accounts, categories } = useFinanceStore.getState();
      const { rules } = useMerchantRulesStore.getState();

      // 1. Instant offline banking & UPI parsing (0ms, exact learned rule matching first)
      const parsedSms = parseBankingSms(rawText, accounts, categories, rules);
      const parsedMerchant = parsedSms.merchant_or_person !== 'Unknown' ? parsedSms.merchant_or_person : undefined;

      const navParams: any = {
        prefillAmount: parsedSms.amount !== null ? parsedSms.amount : undefined,
        prefillNote:
          parsedSms.merchant_or_person !== 'Unknown'
            ? parsedSms.merchant_or_person
            : rawText.length > 80
            ? rawText.substring(0, 77) + '...'
            : rawText,
        parsedMerchant,
        prefillType: parsedSms.suggested_type,
        prefillCategory: parsedSms.suggested_category,
        prefillDate: parsedSms.date_if_present || undefined,
        accountId: parsedSms.matched_account_id,
        prefillSource: 'sms',
        scanMessage: parsedSms.is_learned
          ? `Matched learned rule: ${parsedSms.merchant_or_person} ➔ ${parsedSms.suggested_category}`
          : parsedSms.amount
          ? `Extracted ₹${parsedSms.amount} for ${parsedSms.merchant_or_person} (${parsedSms.suggested_category})`
          : 'Message received! Review details and save.',
      };

      // Immediately open AddTransaction screen on the go!
      navigateOrQueue('AddTransaction', navParams);

      // 2. If confidence is NOT high (unfamiliar merchant or ambiguous format) and Gemini key is configured,
      // refine in background without blocking the user
      if (hasGeminiApiKey && parsedSms.confidence !== 'high') {
        parseReceiptWithGemini({ text: rawText, availableCategories: categories })
          .then((geminiRes) => {
            if (geminiRes.success && geminiRes.data && navigationRef.isReady()) {
              const geminiData = geminiRes.data;

              // Save learned rule from Gemini (precedence rule in store prevents overwriting user_manual)
              if (geminiData.merchant_or_person && geminiData.merchant_or_person !== 'Unknown') {
                useMerchantRulesStore.getState().recordGeminiRule(
                  geminiData.merchant_or_person,
                  geminiData.suggested_category,
                  geminiData.suggested_type
                );
              }

              navigationRef.navigate('AddTransaction', {
                prefillAmount: geminiData.amount !== null ? geminiData.amount : undefined,
                prefillNote: geminiData.merchant_or_person,
                parsedMerchant: geminiData.merchant_or_person,
                prefillType: geminiData.suggested_type,
                prefillCategory: geminiData.suggested_category,
                prefillDate: geminiData.date_if_present || undefined,
                prefillSource: 'sms',
                scanMessage: `Gemini AI identified: ${geminiData.merchant_or_person} (${geminiData.suggested_category})`,
              });
            }
          })
          .catch(() => {});
      }
    },
    [hasGeminiApiKey, navigateOrQueue]
  );

  // Handle incoming shared screenshot / receipt or SMS text from external apps
  useEffect(() => {
    if (hasShareIntent && (session || isGuest)) {
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
  }, [hasShareIntent, shareIntent, session, isGuest, resetShareIntent, processSharedImage, processSharedText]);

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
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate(screen, params);
            }
          }, 60);
        }
      }}
    >
      {session || isGuest ? (
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
