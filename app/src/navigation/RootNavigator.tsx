// src/navigation/RootNavigator.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
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
import { COLORS } from '../theme/tokens';

const AppStack = createNativeStackNavigator();

const appNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.background,
    card: COLORS.surface,
    text: COLORS.textPrimary,
    border: COLORS.border,
    primary: COLORS.accent,
  },
};

export const RootNavigator = () => {
  const { session, user, isLoading, initializeAuth } = useAuthStore();
  const { loadSettings, accent } = useSettingsStore();
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accent.hex || COLORS.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appNavTheme}>
      {session ? (
        <AppStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
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
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
