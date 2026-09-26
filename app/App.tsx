// App.tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import * as SystemUI from 'expo-system-ui';
import { RootNavigator } from './src/navigation/RootNavigator';
import { paperTheme } from './src/theme/theme';
import { COLORS } from './src/theme/tokens';

export default function App() {
  useEffect(() => {
    // Set native Android/iOS system window background to prevent white flash
    SystemUI.setBackgroundColorAsync(COLORS.background).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: COLORS.background }}>
      <PaperProvider theme={paperTheme}>
        <StatusBar style="light" />
        <RootNavigator />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
