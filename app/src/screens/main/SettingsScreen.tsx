import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import {
  useSettingsStore,
  isWallpaperThemeSupported,
  ThemeMode,
} from '../../store/settingsStore';
import {
  SPACING,
  ThemeStyleId,
  LOCKED_FINANCIAL_TOKENS,
} from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuthStore();
  const {
    themeMode,
    themeStyle,
    effectiveTheme,
    colors,
    setThemeMode,
    setThemeStyle,
  } = useSettingsStore();

  const isDynamicSupported = isWallpaperThemeSupported();

  const handleSelectThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const handleSelectThemeStyle = (styleId: ThemeStyleId) => {
    setThemeStyle(styleId);
  };

  const styleOptions: {
    id: ThemeStyleId;
    name: string;
    description: string;
    brandColor: string;
    isDynamic?: boolean;
  }[] = [
    {
      id: 'precision_obsidian',
      name: 'Precision Obsidian',
      description: 'Indigo brand (#6366F1 / #4F46E5) • Warm near-black base',
      brandColor: effectiveTheme === 'dark' ? '#6366F1' : '#4F46E5',
    },
    {
      id: 'warm_executive',
      name: 'Warm Executive',
      description: 'Copper brand (#D97757 / #A85C32) • Umber & warm paper',
      brandColor: effectiveTheme === 'dark' ? '#D97757' : '#A85C32',
    },
    {
      id: 'swiss_minimal',
      name: 'Swiss Minimal',
      description: 'Monochrome ink brand • Financial colors only',
      brandColor: effectiveTheme === 'dark' ? '#F4F4F5' : '#18181B',
    },
    {
      id: 'system_wallpaper',
      name: 'Match wallpaper (Android 12+)',
      description: isDynamicSupported
        ? 'Dynamic Material You wallpaper color integration'
        : 'Material You dynamic theme (Auto-falls back to Precision Obsidian on this device)',
      brandColor: colors.primary,
      isDynamic: true,
    },
  ];

  const financialTokens = LOCKED_FINANCIAL_TOKENS[effectiveTheme];

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Info */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
          <View style={styles.accountRow}>
            <View style={[styles.avatar, { borderColor: colors.primary, backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.accountDetails}>
              <Text style={[styles.accountEmail, { color: colors.textPrimary }]}>{user?.email}</Text>
              <Text style={[styles.accountIdText, { color: colors.textMuted }]}>
                ID: {user?.id?.substring(0, 16)}...
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance - Theme Mode (Dark / Light / System) */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE MODE</Text>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Switch between full dark and light mode variants for any selected style.
          </Text>
          <View style={styles.segmentedRow}>
            {(['dark', 'light', 'system'] as const).map((mode) => {
              const active = themeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => handleSelectThemeMode(mode)}
                  style={[
                    styles.segmentBtn,
                    { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                    active && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      { color: colors.textSecondary },
                      active && { color: colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {mode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Appearance - Multi-Style Theme Engine */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>THEME SYSTEM</Text>
            <View style={[styles.tagBadge, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.tagBadgeText, { color: colors.primary }]}>MD3 PALETTES</Text>
            </View>
          </View>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Select a tailored design system. Every style preserves strictly locked financial semantic tokens.
          </Text>

          <View style={styles.stylesList}>
            {styleOptions.map((opt) => {
              const active = themeStyle === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleSelectThemeStyle(opt.id)}
                  style={[
                    styles.styleCard,
                    {
                      backgroundColor: colors.surfaceVariant,
                      borderColor: active ? colors.primary : colors.border,
                      borderWidth: active ? 2 : 1,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={styles.styleCardHeader}>
                    <View style={styles.styleNameRow}>
                      <View
                        style={[
                          styles.radioCircle,
                          { borderColor: active ? colors.primary : colors.border },
                          active && { backgroundColor: colors.primary },
                        ]}
                      >
                        {active && <View style={[styles.radioDot, { backgroundColor: colors.onPrimary }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleBadgeRow}>
                          <Text
                            style={[
                              styles.styleTitle,
                              { color: colors.textPrimary },
                              active && { color: colors.primary, fontWeight: '800' },
                            ]}
                          >
                            {opt.name}
                          </Text>
                          {opt.isDynamic && !isDynamicSupported && (
                            <View
                              style={[
                                styles.fallbackBadge,
                                { backgroundColor: colors.surface, borderColor: colors.border },
                              ]}
                            >
                              <Text style={[styles.fallbackBadgeText, { color: colors.textMuted }]}>
                                AUTO-FALLBACK
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.styleDescription, { color: colors.textMuted }]}>
                          {opt.description}
                        </Text>
                      </View>
                    </View>

                    {/* Preview Swatch Pill */}
                    <View style={styles.swatchPreviewContainer}>
                      <View
                        style={[
                          styles.brandSwatchCircle,
                          {
                            backgroundColor: opt.brandColor,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {active && (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color={opt.id === 'swiss_minimal' && effectiveTheme === 'dark' ? '#09090B' : '#FFFFFF'}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Locked Financial Semantic Tokens Rule Explanation */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOCKED SEMANTIC TOKENS</Text>
            <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
          </View>
          <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
            Income, Expense, Lent, and Borrowed colors are strictly locked. They remain independent of brand/accent themes or dynamic wallpaper colors to preserve immediate financial recognition.
          </Text>

          <View style={styles.semanticPillsRow}>
            <View style={[styles.semanticBadge, { backgroundColor: financialTokens.incomeMuted, borderColor: financialTokens.income }]}>
              <View style={[styles.semanticDot, { backgroundColor: financialTokens.income }]} />
              <Text style={[styles.semanticBadgeText, { color: financialTokens.income }]}>Income (+₹)</Text>
            </View>
            <View style={[styles.semanticBadge, { backgroundColor: financialTokens.expenseMuted, borderColor: financialTokens.expense }]}>
              <View style={[styles.semanticDot, { backgroundColor: financialTokens.expense }]} />
              <Text style={[styles.semanticBadgeText, { color: financialTokens.expense }]}>Expense (−₹)</Text>
            </View>
            <View style={[styles.semanticBadge, { backgroundColor: financialTokens.lentMuted, borderColor: financialTokens.lent }]}>
              <View style={[styles.semanticDot, { backgroundColor: financialTokens.lent }]} />
              <Text style={[styles.semanticBadgeText, { color: financialTokens.lent }]}>Lent (+₹)</Text>
            </View>
            <View style={[styles.semanticBadge, { backgroundColor: financialTokens.borrowedMuted, borderColor: financialTokens.borrowed }]}>
              <View style={[styles.semanticDot, { backgroundColor: financialTokens.borrowed }]} />
              <Text style={[styles.semanticBadgeText, { color: financialTokens.borrowed }]}>Borrowed (−₹)</Text>
            </View>
          </View>
        </View>

        {/* Future Features Placeholders */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FEATURES & INTEGRATIONS</Text>

          <View style={styles.placeholderRow}>
            <View>
              <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>AI Overview (BYOK)</Text>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                Bring Your Own Key for Gemini financial summaries
              </Text>
            </View>
            <View style={[styles.soonBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <Text style={[styles.soonBadgeText, { color: colors.textMuted }]}>COMING SOON</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.placeholderRow}>
            <View>
              <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>Export Data (CSV)</Text>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                Export transaction and budget history
              </Text>
            </View>
            <View style={[styles.soonBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <Text style={[styles.soonBadgeText, { color: colors.textMuted }]}>COMING SOON</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.placeholderRow}>
            <View>
              <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>Manage Categories</Text>
              <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
                Custom categories available via Dashboard settings
              </Text>
            </View>
            <View style={[styles.soonBadge, { backgroundColor: colors.primaryContainer, borderColor: colors.border }]}>
              <Text style={[styles.soonBadgeText, { color: colors.primary }]}>
                AVAILABLE
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out Button */}
        <TactileButton
          onPress={signOut}
          style={[styles.signOutBtn, { backgroundColor: colors.alertMuted, borderColor: colors.alert }]}
        >
          <Text style={[styles.signOutBtnText, { color: colors.alert }]}>Sign Out</Text>
        </TactileButton>

        <Text style={styles.versionFooter}>
          Finance Tracker v1.0.0 • Material Design 3 Architecture
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
  headerTitle: {
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
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionSub: {
    fontSize: 12,
    marginBottom: SPACING.md,
    lineHeight: 17,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  accountDetails: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '700',
  },
  accountIdText: {
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
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stylesList: {
    gap: SPACING.sm,
  },
  styleCard: {
    borderRadius: 10,
    padding: SPACING.md,
  },
  styleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  styleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  fallbackBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  fallbackBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  styleDescription: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  swatchPreviewContainer: {
    marginLeft: SPACING.xs,
  },
  brandSwatchCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semanticPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: 2,
  },
  semanticBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  semanticDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  semanticBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  placeholderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  placeholderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  soonBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  soonBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: SPACING.xs,
  },
  signOutBtn: {
    paddingVertical: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  versionFooter: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
