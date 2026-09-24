// app/src/store/settingsStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface AccentColor {
  name: string;
  value: string;
  muted: string;
}

export const ACCENT_PALETTE: AccentColor[] = [
  { name: 'Emerald', value: '#00D09C', muted: '#00D09C1A' },
  { name: 'Cyan', value: '#06B6D4', muted: '#06B6D41A' },
  { name: 'Amber', value: '#F59E0B', muted: '#F59E0B1A' },
  { name: 'Rose', value: '#F43F5E', muted: '#F43F5E1A' },
  { name: 'Blue', value: '#3B82F6', muted: '#3B82F61A' },
  { name: 'Violet', value: '#8B5CF6', muted: '#8B5CF61A' },
];

const THEME_STORAGE_KEY = '@finance_tracker_theme_mode';
const ACCENT_STORAGE_KEY = '@finance_tracker_accent_color';

interface SettingsState {
  themeMode: ThemeMode;
  accent: AccentColor;
  loadSettings: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAccent: (accent: AccentColor) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: 'dark',
  accent: ACCENT_PALETTE[0],

  loadSettings: async () => {
    try {
      const [savedTheme, savedAccent] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(ACCENT_STORAGE_KEY),
      ]);

      if (savedTheme && ['dark', 'light', 'system'].includes(savedTheme)) {
        set({ themeMode: savedTheme as ThemeMode });
      }

      if (savedAccent) {
        const found = ACCENT_PALETTE.find((a) => a.value === savedAccent);
        if (found) {
          set({ accent: found });
        }
      }
    } catch {
      // Default to dark and emerald on read error
    }
  },

  setThemeMode: async (mode: ThemeMode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  },

  setAccent: async (accent: AccentColor) => {
    set({ accent });
    await AsyncStorage.setItem(ACCENT_STORAGE_KEY, accent.value).catch(() => {});
  },
}));
