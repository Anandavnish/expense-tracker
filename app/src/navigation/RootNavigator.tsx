// src/navigation/RootNavigator.tsx
import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useFinanceStore } from '../store/financeStore';
import { useSettingsStore } from '../store/settingsStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { AddTransactionScreen } from '../screens/main/AddTransactionScreen';
import { AccountDetailScreen } from '../screens/main/AccountDetailScreen';
import { TransactionDetailScreen } from '../screens/main/TransactionDetailScreen';

const AppStack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { session, user, isLoading, initializeAuth } = useAuthStore();
  const { loadSettings, accent, effectiveTheme, colors } = useSettingsStore();
  const {
    loadCachedData,
    fetchInitialData,
    subscribeRealtime,
    unsubscribeRealtime,
  } = useFinanceStore();

  useEffect(() => {
    initializeAuth();
    loadSettings();
  }, [initializeAuth, loadSettings]);

  useEffect(() => {
    if (user) {
      loadCachedData();
      fetchInitialData(user.id);
      subscribeRealtime(user.id);
    } else {
      unsubscribeRealtime();
    }

    return () => {
      unsubscribeRealtime();
    };
  }, [user]);

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
    <NavigationContainer theme={appNavTheme}>
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
            name="Settings"
            component={SettingsScreen}
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
