// app/src/store/settingsStore.ts
import { create } from 'zustand';
import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isDynamicThemeSupported,
  Material3Theme,
} from '@pchmn/expo-material3-theme';
import {
  ThemeColors,
  ThemeStyleId,
  THEME_STYLES,
  PRECISION_OBSIDIAN_DARK,
  PRECISION_OBSIDIAN_LIGHT,
  buildThemeTokens,
} from '../theme/tokens';
import { supabase } from '../services/supabase';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface AccentColor {
  name: string;
  hex: string;
  muted: string;
}

// Kept for backward compatibility
export const ACCENT_PALETTE: AccentColor[] = [
  { name: 'Precision Obsidian', hex: '#6366F1', muted: '#25254B' },
  { name: 'Warm Executive', hex: '#D97757', muted: '#38231B' },
  { name: 'Swiss Minimal', hex: '#F4F4F5', muted: '#27272A' },
  { name: 'Match Wallpaper', hex: '#A8C7FA', muted: '#004A77' },
];

const THEME_MODE_STORAGE_KEY = '@finance_tracker_theme_mode';
const THEME_STYLE_STORAGE_KEY = '@finance_tracker_theme_style';
const SHOW_AI_OVERVIEW_STORAGE_KEY = '@finance_tracker_show_ai_overview';

const getSystemScheme = (): 'dark' | 'light' => {
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? 'light' : 'dark';
};

const resolveEffectiveTheme = (mode: ThemeMode): 'dark' | 'light' => {
  if (mode === 'system') return getSystemScheme();
  return mode;
};

// Check if Android 12+ wallpaper dynamic theme is available on this device
export const isWallpaperThemeSupported = (): boolean => {
  return (
    isDynamicThemeSupported &&
    Platform.OS === 'android' &&
    Number(Platform.Version) >= 31
  );
};

export const resolveThemeColors = (
  styleId: ThemeStyleId,
  effectiveMode: 'dark' | 'light',
  material3Theme?: Material3Theme | null
): ThemeColors => {
  if (styleId === 'system_wallpaper') {
    // Check if dynamic theme is supported and active
    if (isWallpaperThemeSupported() && material3Theme) {
      const scheme = material3Theme[effectiveMode];
      if (scheme) {
        return buildThemeTokens(effectiveMode, {
          primary: scheme.primary,
          onPrimary: scheme.onPrimary,
          primaryContainer: scheme.primaryContainer,
          onPrimaryContainer: scheme.onPrimaryContainer,

          background: scheme.background,
          onBackground: scheme.onBackground,

          surface: scheme.surface,
          onSurface: scheme.onSurface,
          surfaceVariant: scheme.surfaceVariant,
          onSurfaceVariant: scheme.onSurfaceVariant,
          surfaceElevated: scheme.surfaceContainerHigh || scheme.surfaceVariant,

          outline: scheme.outline,
          outlineVariant: scheme.outlineVariant,

          inverseSurface: scheme.inverseSurface,
          inverseOnSurface: scheme.inverseOnSurface,
          inversePrimary: scheme.inversePrimary,
        });
      }
    }
    // Fall back to "Precision Obsidian" automatically on devices below Android 12 or on iOS
    return effectiveMode === 'dark'
      ? PRECISION_OBSIDIAN_DARK
      : PRECISION_OBSIDIAN_LIGHT;
  }

  const config = THEME_STYLES[styleId] || THEME_STYLES.precision_obsidian;
  return effectiveMode === 'dark' ? config.dark : config.light;
};

interface SettingsState {
  themeMode: ThemeMode;
  themeStyle: ThemeStyleId;
  effectiveTheme: 'dark' | 'light';
  isDark: boolean;
  colors: ThemeColors;
  accent: AccentColor;
  material3Theme: Material3Theme | null;
  geminiApiKey: string | null;
  hasGeminiApiKey: boolean;
  isLoadingGeminiKey: boolean;
  showAiOverviewOnDashboard: boolean;

  loadSettings: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setThemeStyle: (style: ThemeStyleId) => Promise<void>;
  setMaterial3Theme: (m3Theme: Material3Theme) => void;
  setAccent: (accent: AccentColor) => Promise<void>;
  setShowAiOverviewOnDashboard: (show: boolean) => Promise<void>;
  fetchGeminiApiKey: (userId?: string) => Promise<string | null>;
  saveGeminiApiKey: (key: string, userId?: string) => Promise<{ success: boolean; error?: string }>;
  removeGeminiApiKey: (userId?: string) => Promise<{ success: boolean; error?: string }>;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Listen for real-time system appearance changes
  Appearance.addChangeListener(({ colorScheme }) => {
    const { themeMode, themeStyle, material3Theme } = get();
    if (themeMode === 'system') {
      const effective = colorScheme === 'light' ? 'light' : 'dark';
      const resolvedColors = resolveThemeColors(
        themeStyle,
        effective,
        material3Theme
      );
      set({
        effectiveTheme: effective,
        isDark: effective === 'dark',
        colors: resolvedColors,
        accent: {
          name: THEME_STYLES[themeStyle]?.name || 'Theme',
          hex: resolvedColors.primary,
          muted: resolvedColors.primaryContainer,
        },
      });
    }
  });

  const initialColors = PRECISION_OBSIDIAN_DARK;

  return {
    themeMode: 'dark',
    themeStyle: 'precision_obsidian',
    effectiveTheme: 'dark',
    isDark: true,
    colors: initialColors,
    accent: {
      name: THEME_STYLES.precision_obsidian.name,
      hex: initialColors.primary,
      muted: initialColors.primaryContainer,
    },
    material3Theme: null,
    geminiApiKey: null,
    hasGeminiApiKey: false,
    isLoadingGeminiKey: false,
    showAiOverviewOnDashboard: true,

    loadSettings: async () => {
      try {
        const [savedMode, savedStyle, savedShowAi] = await Promise.all([
          AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
          AsyncStorage.getItem(THEME_STYLE_STORAGE_KEY),
          AsyncStorage.getItem(SHOW_AI_OVERVIEW_STORAGE_KEY),
        ]);

        let mode: ThemeMode = 'dark';
        if (savedMode && ['dark', 'light', 'system'].includes(savedMode)) {
          mode = savedMode as ThemeMode;
        }

        let style: ThemeStyleId = 'precision_obsidian';
        if (
          savedStyle &&
          [
            'precision_obsidian',
            'warm_executive',
            'swiss_minimal',
            'system_wallpaper',
          ].includes(savedStyle)
        ) {
          style = savedStyle as ThemeStyleId;
        }

        const effective = resolveEffectiveTheme(mode);
        const resolvedColors = resolveThemeColors(
          style,
          effective,
          get().material3Theme
        );

        const showAi = savedShowAi !== null ? savedShowAi === 'true' : true;

        set({
          themeMode: mode,
          themeStyle: style,
          effectiveTheme: effective,
          isDark: effective === 'dark',
          colors: resolvedColors,
          showAiOverviewOnDashboard: showAi,
          accent: {
            name: THEME_STYLES[style]?.name || 'Theme',
            hex: resolvedColors.primary,
            muted: resolvedColors.primaryContainer,
          },
        });

        // Fetch Gemini BYOK key in background
        get().fetchGeminiApiKey().catch(() => {});
      } catch {
        // Fallback to defaults
      }
    },

    setShowAiOverviewOnDashboard: async (show: boolean) => {
      set({ showAiOverviewOnDashboard: show });
      await AsyncStorage.setItem(SHOW_AI_OVERVIEW_STORAGE_KEY, String(show)).catch(() => {});
    },

    setThemeMode: async (mode: ThemeMode) => {
      const { themeStyle, material3Theme } = get();
      const effective = resolveEffectiveTheme(mode);
      const resolvedColors = resolveThemeColors(
        themeStyle,
        effective,
        material3Theme
      );

      set({
        themeMode: mode,
        effectiveTheme: effective,
        isDark: effective === 'dark',
        colors: resolvedColors,
        accent: {
          name: THEME_STYLES[themeStyle]?.name || 'Theme',
          hex: resolvedColors.primary,
          muted: resolvedColors.primaryContainer,
        },
      });

      await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode).catch(() => {});
    },

    setThemeStyle: async (style: ThemeStyleId) => {
      const { effectiveTheme, material3Theme } = get();
      const resolvedColors = resolveThemeColors(
        style,
        effectiveTheme,
        material3Theme
      );

      set({
        themeStyle: style,
        colors: resolvedColors,
        accent: {
          name: THEME_STYLES[style]?.name || 'Theme',
          hex: resolvedColors.primary,
          muted: resolvedColors.primaryContainer,
        },
      });

      await AsyncStorage.setItem(THEME_STYLE_STORAGE_KEY, style).catch(() => {});
    },

    setMaterial3Theme: (m3Theme: Material3Theme) => {
      const { themeStyle, effectiveTheme } = get();
      const resolvedColors = resolveThemeColors(
        themeStyle,
        effectiveTheme,
        m3Theme
      );

      set({
        material3Theme: m3Theme,
        colors: resolvedColors,
        accent: {
          name: THEME_STYLES[themeStyle]?.name || 'Theme',
          hex: resolvedColors.primary,
          muted: resolvedColors.primaryContainer,
        },
      });
    },

    setAccent: async (accent: AccentColor) => {
      set({ accent });
    },

    fetchGeminiApiKey: async (userId?: string) => {
      try {
        set({ isLoadingGeminiKey: true });
        let uid = userId;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id;
        }
        if (!uid) {
          set({ isLoadingGeminiKey: false, geminiApiKey: null, hasGeminiApiKey: false });
          return null;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('gemini_api_key')
          .eq('id', uid)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.warn('[settingsStore] Error fetching gemini_api_key:', error.message);
        }

        const key = data?.gemini_api_key || null;
        set({
          geminiApiKey: key,
          hasGeminiApiKey: !!(key && key.trim()),
          isLoadingGeminiKey: false,
        });
        return key;
      } catch {
        set({ isLoadingGeminiKey: false });
        return null;
      }
    },

    saveGeminiApiKey: async (key: string, userId?: string) => {
      try {
        set({ isLoadingGeminiKey: true });
        let uid = userId;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id;
        }
        if (!uid) {
          set({ isLoadingGeminiKey: false });
          return { success: false, error: 'User is not authenticated' };
        }

        const trimmed = key.trim();
        const { data, error } = await supabase
          .from('profiles')
          .update({
            gemini_api_key: trimmed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', uid)
          .select('id');

        if (error) {
          set({ isLoadingGeminiKey: false });
          return { success: false, error: error.message };
        }

        // Fallback for rare case where profile row was not yet seeded
        if (!data || data.length === 0) {
          const { error: insertErr } = await supabase
            .from('profiles')
            .insert({
              id: uid,
              gemini_api_key: trimmed,
              updated_at: new Date().toISOString(),
            });
          if (insertErr) {
            set({ isLoadingGeminiKey: false });
            return { success: false, error: insertErr.message };
          }
        }

        set({
          geminiApiKey: trimmed,
          hasGeminiApiKey: !!trimmed,
          isLoadingGeminiKey: false,
        });
        return { success: true };
      } catch (err: any) {
        set({ isLoadingGeminiKey: false });
        return { success: false, error: err?.message || 'Failed to save Gemini key' };
      }
    },

    removeGeminiApiKey: async (userId?: string) => {
      try {
        set({ isLoadingGeminiKey: true });
        let uid = userId;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id;
        }
        if (!uid) {
          set({ isLoadingGeminiKey: false });
          return { success: false, error: 'User is not authenticated' };
        }

        const { error } = await supabase
          .from('profiles')
          .update({
            gemini_api_key: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', uid);

        if (error) {
          set({ isLoadingGeminiKey: false });
          return { success: false, error: error.message };
        }

        set({
          geminiApiKey: null,
          hasGeminiApiKey: false,
          isLoadingGeminiKey: false,
        });
        return { success: true };
      } catch (err: any) {
        set({ isLoadingGeminiKey: false });
        return { success: false, error: err?.message || 'Failed to remove Gemini key' };
      }
    },
  };
});
