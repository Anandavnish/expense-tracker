// src/screens/main/SettingsScreen.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useAuthStore } from '../../store/authStore';
import {
  useSettingsStore,
  ACCENT_PALETTE,
  ThemeMode,
  AccentColor,
} from '../../store/settingsStore';
import { COLORS, SPACING } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { user, signOut } = useAuthStore();
  const { themeMode, accent, setThemeMode, setAccent } = useSettingsStore();

  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const handleSelectAccent = (color: AccentColor) => {
    setAccent(color);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={[styles.backText, { color: accent.value }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Info */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.accountRow}>
            <View style={[styles.avatar, { borderColor: accent.value }]}>
              <Text style={[styles.avatarText, { color: accent.value }]}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.accountDetails}>
              <Text style={styles.accountEmail}>{user?.email}</Text>
              <Text style={styles.accountIdText}>ID: {user?.id?.substring(0, 16)}...</Text>
            </View>
          </View>
        </View>

        {/* Appearance - Theme Mode */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>THEME</Text>
          <View style={styles.segmentedRow}>
            {(['dark', 'light', 'system'] as const).map((mode) => {
              const active = themeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleSelectTheme(mode)}
                  style={[
                    styles.segmentBtn,
                    active && {
                      borderColor: accent.value,
                      backgroundColor: COLORS.surfaceLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      active && { color: accent.value, fontWeight: '700' },
                    ]}
                  >
                    {mode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Appearance - Accent Palette Picker */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ACCENT COLOR</Text>
          <Text style={styles.sectionSub}>
            Updates highlights, active tabs, and primary action buttons across the app.
          </Text>

          <View style={styles.paletteGrid}>
            {ACCENT_PALETTE.map((color) => {
              const active = accent.value === color.value;
              return (
                <TouchableOpacity
                  key={color.name}
                  onPress={() => handleSelectAccent(color)}
                  style={[
                    styles.swatchItem,
                    active && { borderColor: color.value, borderWidth: 2 },
                  ]}
                >
                  <View
                    style={[styles.colorCircle, { backgroundColor: color.value }]}
                  >
                    {active && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.swatchName,
                      active && { color: color.value, fontWeight: '700' },
                    ]}
                  >
                    {color.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Future Features Placeholders */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>FEATURES & INTEGRATIONS</Text>

          <View style={styles.placeholderRow}>
            <View>
              <Text style={styles.placeholderTitle}>AI Overview (BYOK)</Text>
              <Text style={styles.placeholderSub}>
                Bring Your Own Key for Gemini financial summaries
              </Text>
            </View>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>COMING SOON</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.placeholderRow}>
            <View>
              <Text style={styles.placeholderTitle}>Export Data (CSV)</Text>
              <Text style={styles.placeholderSub}>
                Export transaction and budget history
              </Text>
            </View>
            <View style={styles.soonBadge}>
              <Text style={styles.soonBadgeText}>COMING SOON</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.placeholderRow}>
            <View>
              <Text style={styles.placeholderTitle}>Manage Categories</Text>
              <Text style={styles.placeholderSub}>
                Custom categories available via Dashboard settings
              </Text>
            </View>
            <View style={[styles.soonBadge, { backgroundColor: accent.muted }]}>
              <Text style={[styles.soonBadgeText, { color: accent.value }]}>
                AVAILABLE
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TactileButton onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TactileButton>

        <Text style={styles.versionFooter}>
          Finance Tracker v1.0.0 • Offline First Architecture
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerRightSpacer: {
    width: 48,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  sectionSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: SPACING.md,
    lineHeight: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  accountDetails: {
    flex: 1,
  },
  accountEmail: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  accountIdText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  segmentBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  swatchItem: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceLight,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  checkMark: {
    color: '#0B1120',
    fontSize: 14,
    fontWeight: '900',
  },
  swatchName: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  placeholderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  placeholderTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  soonBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  soonBadgeText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  signOutBtn: {
    paddingVertical: SPACING.md,
    borderRadius: 8,
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  signOutBtnText: {
    color: COLORS.alert,
    fontSize: 14,
    fontWeight: '700',
  },
  versionFooter: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
