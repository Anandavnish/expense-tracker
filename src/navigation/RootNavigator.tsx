// src/navigation/RootNavigator.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import { useFinanceStore } from '../store/financeStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { COLORS } from '../theme/tokens';

export const RootNavigator = () => {
  const { session, user, isLoading, initializeAuth } = useAuthStore();
  const {
    loadCachedData,
    fetchInitialData,
    subscribeRealtime,
    unsubscribeRealtime,
  } = useFinanceStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (user) {
      // 1. Load cached state immediately (optimistic UI rendering)
      loadCachedData();

      // 2. Fetch fresh initial data from Supabase
      fetchInitialData(user.id);

      // 3. Subscribe to Supabase Realtime channel
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
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? <MainTabs /> : <AuthStack />}
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
