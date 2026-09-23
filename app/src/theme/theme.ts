// src/theme/theme.ts
import { MD3DarkTheme, configureFonts } from 'react-native-paper';
import { COLORS } from './tokens';

export const paperTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.accent,
    onPrimary: COLORS.textInverse,
    primaryContainer: COLORS.accentMuted,
    onPrimaryContainer: COLORS.accent,
    
    background: COLORS.background,
    onBackground: COLORS.textPrimary,
    
    surface: COLORS.surface,
    onSurface: COLORS.textPrimary,
    surfaceVariant: COLORS.surfaceLight,
    onSurfaceVariant: COLORS.textSecondary,
    
    outline: COLORS.border,
    outlineVariant: COLORS.border,
    
    error: COLORS.alert,
    onError: '#FFFFFF',
    errorContainer: COLORS.alertMuted,
    onErrorContainer: COLORS.alert,
  },
  roundness: 8,
};
