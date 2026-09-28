// src/components/UpdatePromptModal.tsx
// Modal prompting the user to download and install a new APK update when available

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../theme/useAppTheme';
import { AppReleaseInfo } from '../services/versionService';
import { SPACING, TYPOGRAPHY } from '../theme/tokens';

const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
};

interface UpdatePromptModalProps {
  visible: boolean;
  release: AppReleaseInfo | null;
  currentVersion: string;
  isMandatory?: boolean;
  onDismiss: () => void;
}

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  release,
  currentVersion,
  isMandatory = false,
  onDismiss,
}) => {
  const { colors, accent } = useAppTheme();
  const styles = React.useMemo(() => getStyles(colors, accent.hex), [colors, accent.hex]);

  if (!release) return null;

  const handleDownload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (release.download_url) {
      const supported = await Linking.canOpenURL(release.download_url).catch(() => false);
      if (supported) {
        await Linking.openURL(release.download_url).catch(() => {});
      } else {
        await Linking.openURL(release.download_url).catch(() => {});
      }
    }
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isMandatory ? () => {} : handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header Icon & Title */}
          <View style={styles.headerRow}>
            <View style={[styles.iconBadge, { backgroundColor: accent.hex + '18' }]}>
              <Ionicons
                name={isMandatory ? 'warning-outline' : 'sparkles-outline'}
                size={24}
                color={isMandatory ? colors.warning : accent.hex}
              />
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>
                {isMandatory ? 'Important Update Required' : 'Update Available'}
              </Text>
              <Text style={styles.subtitle}>
                {release.title || `Expense Tracker v${release.version}`}
              </Text>
            </View>
          </View>

          {/* Version Transition Pills */}
          <View style={styles.versionPillRow}>
            <View style={[styles.versionPill, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={[styles.versionPillLabel, { color: colors.textSecondary }]}>
                Current: v{currentVersion}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
            <View style={[styles.versionPill, { backgroundColor: accent.hex + '22', borderColor: accent.hex, borderWidth: 1 }]}>
              <Text style={[styles.versionPillLabel, { color: accent.hex, fontWeight: '700' }]}>
                New: v{release.version}
              </Text>
            </View>
          </View>

          {/* Release Notes / Changelog */}
          <View style={styles.changelogBox}>
            <Text style={styles.changelogHeader}>What&apos;s New:</Text>
            <ScrollView
              style={styles.changelogScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.changelogText}>
                {release.release_notes || 'Performance improvements and bug fixes.'}
              </Text>
            </ScrollView>
          </View>

          {isMandatory && (
            <View style={styles.mandatoryWarningBox}>
              <Ionicons name="information-circle" size={15} color={colors.warning} />
              <Text style={styles.mandatoryWarningText}>
                This release contains critical fixes and is required to continue using the app.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: accent.hex }]}
              onPress={handleDownload}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.onPrimary} />
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                Download APK Update
              </Text>
            </TouchableOpacity>

            {!isMandatory && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleDismiss}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                  Later
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any, accentHex: string) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.xl,
      ...Platform.select({
        android: { elevation: 8 },
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
        },
      }),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    versionPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    versionPill: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: RADIUS.sm,
    },
    versionPillLabel: {
      fontSize: 12,
      ...TYPOGRAPHY.tabularText,
    },
    changelogBox: {
      backgroundColor: colors.surfaceLight,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      maxHeight: 180,
      marginBottom: SPACING.md,
    },
    changelogHeader: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    changelogScroll: {
      maxHeight: 140,
    },
    changelogText: {
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    mandatoryWarningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${colors.warning}15`,
      borderRadius: RADIUS.sm,
      padding: SPACING.sm,
      marginBottom: SPACING.md,
    },
    mandatoryWarningText: {
      flex: 1,
      fontSize: 11,
      color: colors.warning,
      lineHeight: 15,
    },
    actionsContainer: {
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: RADIUS.md,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryButton: {
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '500',
    },
  });
