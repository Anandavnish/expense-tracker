// src/theme/useAppTheme.ts
import { useSettingsStore } from '../store/settingsStore';

export const useAppTheme = () => {
  const {
    themeMode,
    effectiveTheme,
    isDark,
    colors,
    accent,
    setThemeMode,
    setAccent,
  } = useSettingsStore();

  return {
    themeMode,
    effectiveTheme,
    isDark,
    colors,
    accent,
    setThemeMode,
    setAccent,
  };
};
