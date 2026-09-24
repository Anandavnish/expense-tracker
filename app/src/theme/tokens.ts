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

export const DEFAULT_ACCENT = '#00D09C';
export const DEFAULT_ACCENT_MUTED = '#00D09C1A';

export const COLORS = {
  // Pure deep slate tones - no purple gradients
  background: '#0B1120',
  backgroundSecondary: '#0F172A',
  surface: '#1E293B',
  surfaceLight: '#27354A',
  border: '#334155',
  borderFocus: '#00D09C',
  
  // Single crisp accent color (default emerald)
  accent: DEFAULT_ACCENT,
  accentMuted: DEFAULT_ACCENT_MUTED,
  
  // Semantic status colors
  alert: '#FF5A5F',         // Red/Coral for expense/over-budget
  alertMuted: '#FF5A5F1A',
  warning: '#F59E0B',
  warningMuted: '#F59E0B1A',
  
  // High-contrast clean typography
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0B1120',
} as const;

export const TYPOGRAPHY: {
  heroNumber: TextStyle;
  tabularText: TextStyle;
} = {
  // Hero numbers use tabular figures and bold weights
  heroNumber: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tabularText: {
    fontVariant: ['tabular-nums'],
  },
};
