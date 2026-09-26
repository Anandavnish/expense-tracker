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

export const COLORS = {
  // Real-world matte obsidian & carbon luxury palette
  background: '#0C0D11',
  backgroundSecondary: '#13141A',
  surface: '#17181F',
  surfaceLight: '#20222B',
  border: '#282A36',
  borderFocus: '#10B981',
  
  // Refined organic fintech accent (authentic emerald sage)
  accent: DEFAULT_ACCENT,
  accentMuted: DEFAULT_ACCENT_MUTED,
  
  // Semantic status colors
  alert: '#EF4444',         // Refined crimson for expense/over-budget
  alertMuted: '#EF44441A',
  warning: '#F59E0B',
  warningMuted: '#F59E0B1A',
  
  // High-contrast clean typography
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0C0D11',
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
