// src/theme/tokens.ts
// Strict design tokens for Personal Finance Tracker
import { TextStyle } from 'react-native';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const DEFAULT_ACCENT = '#10B981';
export const DEFAULT_ACCENT_MUTED = '#10B9811A';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceLight: string;
  surfaceElevated: string;
  border: string;
  borderSubtle: string;
  borderFocus: string;
  
  accent: string;
  accentMuted: string;
  
  alert: string;
  alertMuted: string;
  warning: string;
  warningMuted: string;
  success: string;
  successMuted: string;
  
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
}

export const DARK_COLORS: ThemeColors = {
  background: '#0C0D11',
  backgroundSecondary: '#13141B',
  surface: '#181A22',
  surfaceLight: '#222530',
  surfaceElevated: '#2A2D3A',
  border: '#282A36',
  borderSubtle: '#1E202B',
  borderFocus: '#10B981',
  
  accent: DEFAULT_ACCENT,
  accentMuted: DEFAULT_ACCENT_MUTED,
  
  // Refined soft rose for debt/errors (avoiding screaming neon red)
  alert: '#F43F5E',
  alertMuted: '#F43F5E1A',
  warning: '#F59E0B',
  warningMuted: '#F59E0B1A',
  success: '#10B981',
  successMuted: '#10B9811A',
  
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#FFFFFF', // Crisp white on dark or accent buttons
};

export const LIGHT_COLORS: ThemeColors = {
  background: '#F8FAFC',
  backgroundSecondary: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceLight: '#F1F5F9',
  surfaceElevated: '#E2E8F0',
  border: '#E2E8F0',
  borderSubtle: '#EEF2F6',
  borderFocus: '#059669',
  
  accent: '#059669',
  accentMuted: '#0596691A',
  
  alert: '#E11D48',
  alertMuted: '#E11D4814',
  warning: '#D97706',
  warningMuted: '#D9770614',
  success: '#059669',
  successMuted: '#05966914',
  
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
};

// Default export for backward compatibility
export const COLORS: ThemeColors = DARK_COLORS;

export const TYPOGRAPHY: {
  heroNumber: TextStyle;
  tabularText: TextStyle;
} = {
  heroNumber: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tabularText: {
    fontVariant: ['tabular-nums'],
  },
};
