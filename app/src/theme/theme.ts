// src/theme/theme.ts
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors } from './tokens';

export const getPaperTheme = (effectiveTheme: 'dark' | 'light', accentHex?: string) => {
  const isDark = effectiveTheme === 'dark';
  const colors: ThemeColors = isDark ? DARK_COLORS : LIGHT_COLORS;
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;
  const primaryColor = accentHex || colors.accent;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: primaryColor,
      onPrimary: colors.textInverse,
      primaryContainer: colors.accentMuted,
      onPrimaryContainer: primaryColor,
      
      background: colors.background,
      onBackground: colors.textPrimary,
      
      surface: colors.surface,
      onSurface: colors.textPrimary,
      surfaceVariant: colors.surfaceLight,
      onSurfaceVariant: colors.textSecondary,
      
      outline: colors.border,
      outlineVariant: colors.borderSubtle,
      
      error: colors.alert,
      onError: '#FFFFFF',
      errorContainer: colors.alertMuted,
      onErrorContainer: colors.alert,
    },
    roundness: 8,
  };
};

export const paperTheme = getPaperTheme('dark');
