// App.tsx
import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import * as SystemUI from 'expo-system-ui';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getPaperTheme } from './src/theme/theme';
import { useSettingsStore } from './src/store/settingsStore';

export default function App() {
  const { effectiveTheme, colors, accent } = useSettingsStore();

  useEffect(() => {
    // Set native Android/iOS system window background to match active theme
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const activePaperTheme = useMemo(
    () => getPaperTheme(effectiveTheme, accent.hex),
    [effectiveTheme, accent.hex]
  );

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <PaperProvider theme={activePaperTheme}>
        <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
