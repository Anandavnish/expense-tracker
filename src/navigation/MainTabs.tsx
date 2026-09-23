// src/navigation/MainTabs.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { AddTransactionScreen } from '../screens/main/AddTransactionScreen';
import { BudgetsScreen } from '../screens/main/BudgetsScreen';
import { BorrowsScreen } from '../screens/main/BorrowsScreen';
import { COLORS, SPACING } from '../theme/tokens';

export type MainTabsParamList = {
  Dashboard: undefined;
  AddTransaction: undefined;
  Budgets: undefined;
  Borrows: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: SPACING.xs,
          paddingTop: SPACING.xs,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{
          tabBarLabel: 'Add',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>➕</Text>,
        }}
      />
      <Tab.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{
          tabBarLabel: 'Budgets',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🎯</Text>,
        }}
      />
      <Tab.Screen
        name="Borrows"
        component={BorrowsScreen}
        options={{
          tabBarLabel: 'Borrows',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🤝</Text>,
        }}
      />
    </Tab.Navigator>
  );
};
