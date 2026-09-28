// src/theme/tokens.ts
// Centralized Material Design 3 (MD3) Design Tokens for Personal Finance Tracker
import { TextStyle } from 'react-native';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export type ThemeStyleId =
  | 'precision_obsidian'
  | 'warm_executive'
  | 'swiss_minimal'
  | 'system_wallpaper';

export interface ThemeColors {
  // MD3 Core Color Roles
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  background: string;
  onBackground: string;

  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceElevated: string;

  outline: string;
  outlineVariant: string;

  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  shadow: string;
  scrim: string;

  // Semantic Financial Tokens (STRICTLY LOCKED across all theme styles & wallpaper)
  income: string;
  incomeMuted: string;
  onIncome: string;

  expense: string;
  expenseMuted: string;
  onExpense: string;

  lent: string;
  lentMuted: string;
  onLent: string;

  borrowed: string;
  borrowedMuted: string;
  onBorrowed: string;

  // Ergonomic / Backward-Compatibility Aliases
  accent: string;
  accentMuted: string;
  border: string;
  borderSubtle: string;
  borderFocus: string;
  surfaceLight: string;
  backgroundSecondary: string;
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
  logoTileBackground: string;
}

// ---------------------------------------------------------------------------
// LOCKED FINANCIAL SEMANTIC TOKENS
// Income, Expense, Lent, and Borrowed never change between styles or wallpaper.
// ---------------------------------------------------------------------------
export const LOCKED_FINANCIAL_TOKENS = {
  dark: {
    income: '#10B981',
    incomeMuted: '#10B9811A',
    onIncome: '#FFFFFF',

    expense: '#F43F5E',
    expenseMuted: '#F43F5E1A',
    onExpense: '#FFFFFF',

    lent: '#F59E0B',
    lentMuted: '#F59E0B1A',
    onLent: '#FFFFFF',

    borrowed: '#38BDF8',
    borrowedMuted: '#38BDF81A',
    onBorrowed: '#FFFFFF',
  },
  light: {
    income: '#059669',
    incomeMuted: '#0596691A',
    onIncome: '#FFFFFF',

    expense: '#E11D48',
    expenseMuted: '#E11D4814',
    onExpense: '#FFFFFF',

    lent: '#D97706',
    lentMuted: '#D9770614',
    onLent: '#FFFFFF',

    borrowed: '#0284C7',
    borrowedMuted: '#0284C71A',
    onBorrowed: '#FFFFFF',
  },
} as const;

// ---------------------------------------------------------------------------
// HELPER: BUILD COMPLETE THEME TOKENS FROM MD3 BASE + LOCKED FINANCIAL TOKENS
// ---------------------------------------------------------------------------
export interface MD3BaseTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceElevated: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  shadow?: string;
  scrim?: string;
  textMuted?: string;
  logoTileBackground?: string;
}

export function buildThemeTokens(
  mode: 'dark' | 'light',
  base: MD3BaseTokens
): ThemeColors {
  const financial = LOCKED_FINANCIAL_TOKENS[mode];
  const mutedText =
    base.textMuted ||
    (mode === 'dark' ? '#71717A' : '#94A3B8');

  return {
    // MD3 Roles
    primary: base.primary,
    onPrimary: base.onPrimary,
    primaryContainer: base.primaryContainer,
    onPrimaryContainer: base.onPrimaryContainer,

    background: base.background,
    onBackground: base.onBackground,

    surface: base.surface,
    onSurface: base.onSurface,
    surfaceVariant: base.surfaceVariant,
    onSurfaceVariant: base.onSurfaceVariant,
    surfaceElevated: base.surfaceElevated,

    outline: base.outline,
    outlineVariant: base.outlineVariant,

    inverseSurface: base.inverseSurface,
    inverseOnSurface: base.inverseOnSurface,
    inversePrimary: base.inversePrimary,
    shadow: base.shadow || '#000000',
    scrim: base.scrim || '#000000',

    // Locked Financial
    ...financial,

    // Aliases
    accent: base.primary,
    accentMuted: base.primaryContainer,
    border: base.outline,
    borderSubtle: base.outlineVariant,
    borderFocus: base.primary,
    surfaceLight: base.surfaceVariant,
    backgroundSecondary: base.surface,
    alert: financial.expense,
    alertMuted: financial.expenseMuted,
    warning: financial.lent,
    warningMuted: financial.lentMuted,
    success: financial.income,
    successMuted: financial.incomeMuted,
    textPrimary: base.onSurface,
    textSecondary: base.onSurfaceVariant,
    textMuted: mutedText,
    textInverse: base.onPrimary,
    logoTileBackground: base.logoTileBackground || '#FFFFFF',
  };
}

// ---------------------------------------------------------------------------
// 1. "PRECISION OBSIDIAN"
// Indigo brand (#6366F1 dark / #4F46E5 light), warm near-black base (not blue-slate)
// ---------------------------------------------------------------------------
export const PRECISION_OBSIDIAN_DARK: ThemeColors = buildThemeTokens('dark', {
  primary: '#6366F1',
  onPrimary: '#FFFFFF',
  primaryContainer: '#25254B',
  onPrimaryContainer: '#C7D2FE',

  background: '#111113', // Warm near-black, zero blue tint
  onBackground: '#F4F4F5',

  surface: '#18181B', // Warm dark card surface
  onSurface: '#F4F4F5',
  surfaceVariant: '#242429', // Interactive pills/inputs
  onSurfaceVariant: '#A1A1AA',
  surfaceElevated: '#2E2E35', // Elevated dialogs/sheets

  outline: '#2E2E35',
  outlineVariant: '#202025',

  inverseSurface: '#F4F4F5',
  inverseOnSurface: '#18181B',
  inversePrimary: '#818CF8',
  textMuted: '#71717A',
});

export const PRECISION_OBSIDIAN_LIGHT: ThemeColors = buildThemeTokens('light', {
  primary: '#4F46E5',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EEF2FF',
  onPrimaryContainer: '#3730A3',

  background: '#FAF9FB', // Crisp warm white
  onBackground: '#18181B',

  surface: '#FFFFFF',
  onSurface: '#18181B',
  surfaceVariant: '#F1F1F5',
  onSurfaceVariant: '#52525B',
  surfaceElevated: '#E4E4EB',

  outline: '#E2E2E8',
  outlineVariant: '#ECECEF',

  inverseSurface: '#18181B',
  inverseOnSurface: '#FAF9FB',
  inversePrimary: '#C7D2FE',
  textMuted: '#A1A1AA',
});

// ---------------------------------------------------------------------------
// 2. "WARM EXECUTIVE"
// Copper brand (#D97757 dark / #A85C32 light), warm paper light mode, umber dark mode
// ---------------------------------------------------------------------------
export const WARM_EXECUTIVE_DARK: ThemeColors = buildThemeTokens('dark', {
  primary: '#D97757', // Warm Copper
  onPrimary: '#FFFFFF',
  primaryContainer: '#38231B',
  onPrimaryContainer: '#FFDBCF',

  background: '#151311', // Umber dark mode canvas
  onBackground: '#F5EFEB',

  surface: '#1E1A17', // Warm umber card
  onSurface: '#F5EFEB',
  surfaceVariant: '#2C2520', // Umber interactive input
  onSurfaceVariant: '#B7A99F',
  surfaceElevated: '#38302A',

  outline: '#3D342D',
  outlineVariant: '#27211B',

  inverseSurface: '#F5EFEB',
  inverseOnSurface: '#1E1A17',
  inversePrimary: '#EAA68E',
  textMuted: '#7F736A',
});

export const WARM_EXECUTIVE_LIGHT: ThemeColors = buildThemeTokens('light', {
  primary: '#A85C32', // Burnished Copper
  onPrimary: '#FFFFFF',
  primaryContainer: '#FBEDE4',
  onPrimaryContainer: '#5E2E11',

  background: '#F7F4EE', // Warm paper/parchment light mode
  onBackground: '#27221E', // Espresso ink

  surface: '#FFFDF9', // Soft ivory paper card
  onSurface: '#27221E',
  surfaceVariant: '#EFE9DF', // Linen input/pill
  onSurfaceVariant: '#63574F',
  surfaceElevated: '#E3DCCE',

  outline: '#DDD4C5',
  outlineVariant: '#EAE2D5',

  inverseSurface: '#27221E',
  inverseOnSurface: '#FFFDF9',
  inversePrimary: '#FFDBCF',
  textMuted: '#9E9085',
});

// ---------------------------------------------------------------------------
// 3. "SWISS MINIMAL"
// Monochrome ink brand (near-white pill in dark mode, near-black pill in light mode)
// Financial colors are the only color in the whole UI!
// ---------------------------------------------------------------------------
export const SWISS_MINIMAL_DARK: ThemeColors = buildThemeTokens('dark', {
  primary: '#F4F4F5', // Near-white pill in dark mode
  onPrimary: '#09090B', // Near-black ink text on near-white pill
  primaryContainer: '#27272A',
  onPrimaryContainer: '#FAFAFA',

  background: '#09090B', // Pure minimal black
  onBackground: '#FAFAFA',

  surface: '#141416', // Neutral monochrome card
  onSurface: '#FAFAFA',
  surfaceVariant: '#202024',
  onSurfaceVariant: '#A1A1AA',
  surfaceElevated: '#2A2A30',

  outline: '#27272A',
  outlineVariant: '#1B1B1E',

  inverseSurface: '#FAFAFA',
  inverseOnSurface: '#09090B',
  inversePrimary: '#18181B',
  textMuted: '#737373',
});

export const SWISS_MINIMAL_LIGHT: ThemeColors = buildThemeTokens('light', {
  primary: '#18181B', // Near-black pill in light mode
  onPrimary: '#FFFFFF', // Pure white text on near-black pill
  primaryContainer: '#E4E4E7',
  onPrimaryContainer: '#18181B',

  background: '#FFFFFF', // Pure Swiss white canvas
  onBackground: '#09090B',

  surface: '#F8F8F9', // Crisp subtle off-white card
  onSurface: '#09090B',
  surfaceVariant: '#EEEEF0',
  onSurfaceVariant: '#52525B',
  surfaceElevated: '#E2E2E6',

  outline: '#E0E0E4',
  outlineVariant: '#ECECEE',

  inverseSurface: '#09090B',
  inverseOnSurface: '#FAFAFA',
  inversePrimary: '#F4F4F5',
  textMuted: '#8E8E93',
});

// ---------------------------------------------------------------------------
// THEME STYLE METADATA DICTIONARY
// ---------------------------------------------------------------------------
export interface ThemeStyleConfig {
  id: ThemeStyleId;
  name: string;
  tagline: string;
  darkBrandHex: string;
  lightBrandHex: string;
  dark: ThemeColors;
  light: ThemeColors;
}

export const THEME_STYLES: Record<ThemeStyleId, ThemeStyleConfig> = {
  precision_obsidian: {
    id: 'precision_obsidian',
    name: 'Precision Obsidian',
    tagline: 'Indigo brand • Warm near-black base',
    darkBrandHex: '#6366F1',
    lightBrandHex: '#4F46E5',
    dark: PRECISION_OBSIDIAN_DARK,
    light: PRECISION_OBSIDIAN_LIGHT,
  },
  warm_executive: {
    id: 'warm_executive',
    name: 'Warm Executive',
    tagline: 'Copper brand • Umber & warm paper',
    darkBrandHex: '#D97757',
    lightBrandHex: '#A85C32',
    dark: WARM_EXECUTIVE_DARK,
    light: WARM_EXECUTIVE_LIGHT,
  },
  swiss_minimal: {
    id: 'swiss_minimal',
    name: 'Swiss Minimal',
    tagline: 'Monochrome ink • Financial colors only',
    darkBrandHex: '#F4F4F5',
    lightBrandHex: '#18181B',
    dark: SWISS_MINIMAL_DARK,
    light: SWISS_MINIMAL_LIGHT,
  },
  system_wallpaper: {
    id: 'system_wallpaper',
    name: 'Match wallpaper (Android 12+)',
    tagline: 'Material You dynamic wallpaper colors',
    darkBrandHex: '#A8C7FA',
    lightBrandHex: '#0B57D0',
    dark: PRECISION_OBSIDIAN_DARK, // Fallback default
    light: PRECISION_OBSIDIAN_LIGHT, // Fallback default
  },
};

// Default export for backward compatibility
export const DARK_COLORS: ThemeColors = PRECISION_OBSIDIAN_DARK;
export const LIGHT_COLORS: ThemeColors = PRECISION_OBSIDIAN_LIGHT;
export const COLORS: ThemeColors = PRECISION_OBSIDIAN_DARK;
export const DEFAULT_ACCENT = PRECISION_OBSIDIAN_DARK.primary;
export const DEFAULT_ACCENT_MUTED = PRECISION_OBSIDIAN_DARK.primaryContainer;

// ---------------------------------------------------------------------------
// CENTRALIZED CATEGORY DESIGN TOKENS
// Single source of truth: eliminates duplication between categoryIcons.ts & screens
// ---------------------------------------------------------------------------
export interface CategoryToken {
  key: string;
  label: string;
  color: string;
  bg: string;
  text: string;
}

export const CATEGORY_TOKENS: Record<string, CategoryToken> = {
  food: {
    key: 'food',
    label: 'Food & Dining',
    color: '#F97316',
    bg: '#F9731620',
    text: '#FB923C',
  },
  travel: {
    key: 'travel',
    label: 'Travel & Transport',
    color: '#06B6D4',
    bg: '#06B6D420',
    text: '#22D3EE',
  },
  rent: {
    key: 'rent',
    label: 'Rent & Hostel',
    color: '#8B5CF6',
    bg: '#8B5CF620',
    text: '#A78BFA',
  },
  recharge: {
    key: 'recharge',
    label: 'Recharge & Internet',
    color: '#3B82F6',
    bg: '#3B82F620',
    text: '#60A5FA',
  },
  subscriptions: {
    key: 'subscriptions',
    label: 'Subscriptions',
    color: '#EC4899',
    bg: '#EC489920',
    text: '#F472B6',
  },
  education: {
    key: 'education',
    label: 'Books & Study',
    color: '#10B981',
    bg: '#10B98120',
    text: '#34D399',
  },
  shopping: {
    key: 'shopping',
    label: 'Shopping',
    color: '#F43F5E',
    bg: '#F43F5E20',
    text: '#FB7185',
  },
  entertainment: {
    key: 'entertainment',
    label: 'Entertainment',
    color: '#A855F7',
    bg: '#A855F720',
    text: '#C084FC',
  },
  health: {
    key: 'health',
    label: 'Health & Medical',
    color: '#14B8A6',
    bg: '#14B8A620',
    text: '#2DD4BF',
  },
  personalCare: {
    key: 'personalCare',
    label: 'Personal Care',
    color: '#D946EF',
    bg: '#D946EF20',
    text: '#E879F9',
  },
  groceries: {
    key: 'groceries',
    label: 'Groceries',
    color: '#84CC16',
    bg: '#84CC1620',
    text: '#A3E635',
  },
  default: {
    key: 'default',
    label: 'Uncategorized',
    color: '#94A3B8',
    bg: '#64748B20',
    text: '#94A3B8',
  },
};

export const getCategoryToken = (categoryName: string): CategoryToken => {
  const lower = (categoryName || '').toLowerCase();
  if (lower.includes('food') || lower.includes('dining') || lower.includes('eat') || lower.includes('cafe')) {
    return CATEGORY_TOKENS.food;
  }
  if (lower.includes('travel') || lower.includes('transport') || lower.includes('cab') || lower.includes('fuel') || lower.includes('bus')) {
    return CATEGORY_TOKENS.travel;
  }
  if (lower.includes('rent') || lower.includes('hostel') || lower.includes('home') || lower.includes('room')) {
    return CATEGORY_TOKENS.rent;
  }
  if (lower.includes('recharge') || lower.includes('data') || lower.includes('phone') || lower.includes('wifi')) {
    return CATEGORY_TOKENS.recharge;
  }
  if (lower.includes('subscript') || lower.includes('netflix') || lower.includes('spotify') || lower.includes('ott') || lower.includes('stream')) {
    return CATEGORY_TOKENS.subscriptions;
  }
  if (lower.includes('book') || lower.includes('station') || lower.includes('study') || lower.includes('edu')) {
    return CATEGORY_TOKENS.education;
  }
  if (lower.includes('shop') || lower.includes('cloth') || lower.includes('mart') || lower.includes('amazon')) {
    return CATEGORY_TOKENS.shopping;
  }
  if (lower.includes('entertain') || lower.includes('movie') || lower.includes('game') || lower.includes('party')) {
    return CATEGORY_TOKENS.entertainment;
  }
  if (lower.includes('health') || lower.includes('med') || lower.includes('doctor') || lower.includes('gym')) {
    return CATEGORY_TOKENS.health;
  }
  if (lower.includes('care') || lower.includes('salon') || lower.includes('beauty')) {
    return CATEGORY_TOKENS.personalCare;
  }
  if (lower.includes('grocer')) {
    return CATEGORY_TOKENS.groceries;
  }
  return CATEGORY_TOKENS.default;
};

// ---------------------------------------------------------------------------
// CENTRALIZED BANK & CARD PRESET BRAND COLORS
// ---------------------------------------------------------------------------
export const BANK_BRAND_COLORS = {
  sbi: '#1B5E20',
  indiaPost: '#C62828',
  hdfc: '#0D47A1',
  canara: '#00838F',
  pnb: '#AD1457',
  bob: '#E65100',
  custom: '#6366F1',
} as const;

export const CARD_BRAND_COLORS = {
  hdfc: '#0D47A1',
  sbiCard: '#1B5E20',
  icici: '#B71C1C',
  axis: '#880E4F',
  kotak: '#C2185B',
  slice: '#7C3AED',
  oneCard: '#2563EB',
  custom: '#059669',
} as const;

export const CUSTOM_PALETTE_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
] as const;

export const ACCOUNT_TYPE_COLORS = {
  bank: '#3B82F6',
  cash: '#10B981',
  credit_card: '#8B5CF6',
} as const;

// ---------------------------------------------------------------------------
// WCAG ACCESSIBILITY: DYNAMIC HIGH-CONTRAST TEXT RESOLVER
// Computes whether dark or white text is needed for WCAG 2.1 AA compliance
// ---------------------------------------------------------------------------
export function getContrastTextColor(hexColor: string): string {
  let c = (hexColor || '#000000').replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  if (c.length !== 6) {
    return '#FFFFFF';
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);

  const sRGB = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  return luminance > 0.4 ? '#09090B' : '#FFFFFF';
}

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
