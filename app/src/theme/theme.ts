// src/theme/theme.ts
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors } from './tokens';

export const getPaperTheme = (
  effectiveTheme: 'dark' | 'light',
  themeColors?: ThemeColors
) => {
  const isDark = effectiveTheme === 'dark';
  const colors: ThemeColors =
    themeColors || (isDark ? DARK_COLORS : LIGHT_COLORS);
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      onPrimary: colors.onPrimary,
      primaryContainer: colors.primaryContainer,
      onPrimaryContainer: colors.onPrimaryContainer,

      background: colors.background,
      onBackground: colors.onBackground,

      surface: colors.surface,
      onSurface: colors.onSurface,
      surfaceVariant: colors.surfaceVariant,
      onSurfaceVariant: colors.onSurfaceVariant,

      outline: colors.outline,
      outlineVariant: colors.outlineVariant,

      inverseSurface: colors.inverseSurface,
      inverseOnSurface: colors.inverseOnSurface,
      inversePrimary: colors.inversePrimary,

      // Semantic financial error mapping
      error: colors.expense,
      onError: colors.onExpense,
      errorContainer: colors.expenseMuted,
      onErrorContainer: colors.expense,
    },
    roundness: 8,
  };
};

export const paperTheme = getPaperTheme('dark');
