// app/src/store/settingsStore.ts
import { create } from 'zustand';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors } from '../theme/tokens';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface AccentColor {
  name: string;
  hex: string;
  muted: string;
}

export const ACCENT_PALETTE: AccentColor[] = [
  { name: 'Emerald', hex: '#10B981', muted: '#10B9811A' },
  { name: 'Gold', hex: '#E5B869', muted: '#E5B8691A' },
  { name: 'Cobalt', hex: '#3B82F6', muted: '#3B82F61A' },
  { name: 'Rose', hex: '#F43F5E', muted: '#F43F5E1A' },
  { name: 'Amber', hex: '#F59E0B', muted: '#F59E0B1A' },
  { name: 'Violet', hex: '#8B5CF6', muted: '#8B5CF61A' },
];

const THEME_STORAGE_KEY = '@finance_tracker_theme_mode';
const ACCENT_STORAGE_KEY = '@finance_tracker_accent_color';

const getSystemScheme = (): 'dark' | 'light' => {
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
};

const resolveEffectiveTheme = (mode: ThemeMode): 'dark' | 'light' => {
  if (mode === 'system') return getSystemScheme();
  return mode;
};

interface SettingsState {
  themeMode: ThemeMode;
  effectiveTheme: 'dark' | 'light';
  isDark: boolean;
  colors: ThemeColors;
  accent: AccentColor;
  loadSettings: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAccent: (accent: AccentColor) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Listen for real-time system appearance changes
  Appearance.addChangeListener(({ colorScheme }) => {
    const { themeMode } = get();
    if (themeMode === 'system') {
      const effective = colorScheme === 'light' ? 'light' : 'dark';
      set({
        effectiveTheme: effective,
        isDark: effective === 'dark',
        colors: effective === 'light' ? LIGHT_COLORS : DARK_COLORS,
      });
    }
  });

  const initialEffective: 'dark' | 'light' = 'dark';

  return {
    themeMode: 'dark',
    effectiveTheme: initialEffective,
    isDark: true,
    colors: DARK_COLORS,
    accent: ACCENT_PALETTE[0],

    loadSettings: async () => {
      try {
        const [savedTheme, savedAccent] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(ACCENT_STORAGE_KEY),
        ]);

        let mode: ThemeMode = 'dark';
        if (savedTheme && ['dark', 'light', 'system'].includes(savedTheme)) {
          mode = savedTheme as ThemeMode;
        }

        const effective = resolveEffectiveTheme(mode);

        let accentColor = ACCENT_PALETTE[0];
        if (savedAccent) {
          const found = ACCENT_PALETTE.find((a) => a.hex === savedAccent);
          if (found) {
            accentColor = found;
          }
        }

        set({
          themeMode: mode,
          effectiveTheme: effective,
          isDark: effective === 'dark',
          colors: effective === 'light' ? LIGHT_COLORS : DARK_COLORS,
          accent: accentColor,
        });
      } catch {
        // Fallback to dark
      }
    },

    setThemeMode: async (mode: ThemeMode) => {
      const effective = resolveEffectiveTheme(mode);
      set({
        themeMode: mode,
        effectiveTheme: effective,
        isDark: effective === 'dark',
        colors: effective === 'light' ? LIGHT_COLORS : DARK_COLORS,
      });
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
    },

    setAccent: async (accent: AccentColor) => {
      set({ accent });
      await AsyncStorage.setItem(ACCENT_STORAGE_KEY, accent.hex).catch(() => {});
    },
  };
});
