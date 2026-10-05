// src/components/UpdatePromptModal.tsx
// Seamless In-App Direct APK Downloader & Installer with live progress,
// instant package installer invocation, and browser fallback

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
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

type UpdateStatus = 'idle' | 'downloading' | 'installing' | 'ready' | 'error';

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  visible,
  release,
  currentVersion,
  isMandatory = false,
  onDismiss,
}) => {
  const { colors, accent } = useAppTheme();
  const styles = useMemo(() => getStyles(colors, accent.hex), [colors, accent.hex]);

  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [bytesWritten, setBytesWritten] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
  const localApkUriRef = useRef<string | null>(null);

  // Reset internal state whenever modal opens with a new release
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setStatus('idle');
      setProgress(0);
      setBytesWritten(0);
      setBytesTotal(0);
      setErrorMessage(null);
    } else {
      // If modal is dismissed while downloading, safely abort
      if (downloadResumableRef.current) {
        downloadResumableRef.current.cancelAsync().catch(() => {});
        downloadResumableRef.current = null;
      }
    }
  }, [visible, release?.version]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!release) return null;

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const openInstallPermissionSettings = async () => {
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
        {
          data: 'package:com.expensetracker.app',
        }
      );
    } catch {
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.APPLICATION_DETAILS_SETTINGS',
          {
            data: 'package:com.expensetracker.app',
          }
        );
      } catch {
        Linking.openSettings().catch(() => {});
      }
    }
  };

  const triggerPackageInstaller = async (fileUri: string) => {
    if (Platform.OS !== 'android') return;
    try {
      setStatus('installing');
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      // 1 = FLAG_GRANT_READ_URI_PERMISSION, 268435456 = FLAG_ACTIVITY_NEW_TASK (0x10000000)
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: 'application/vnd.android.package-archive',
        flags: 1 | 268435456,
      });
      setStatus('ready');
    } catch (err: any) {
      console.warn('[UpdatePromptModal] Package installer invocation failed:', err);
      setStatus('ready');
      Alert.alert(
        'Permission Required',
        'Android requires permission to install updates directly. Please enable "Allow from this source" in settings, then tap "Install Update Now".',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => openInstallPermissionSettings(),
          },
          {
            text: 'Open in Browser',
            onPress: () => handleBrowserFallback(),
          },
        ]
      );
    }
  };

  const handleStartDownload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // iOS or Web fallback: open browser
    if (Platform.OS !== 'android') {
      if (release.download_url) {
        Linking.openURL(release.download_url).catch(() => {});
      }
      return;
    }

    try {
      setStatus('downloading');
      setProgress(0);
      setBytesWritten(0);
      setBytesTotal(0);
      setErrorMessage(null);

      const filename = `ExpenseTracker_v${release.version || 'latest'}.apk`;
      const localPath = `${FileSystem.cacheDirectory}${filename}`;
      localApkUriRef.current = localPath;

      // Clean up previous downloaded artifact if present
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});

      const downloadResumable = FileSystem.createDownloadResumable(
        release.download_url,
        localPath,
        {},
        (downloadProgress) => {
          if (downloadProgress.totalBytesExpectedToWrite > 0) {
            const fraction =
              downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setProgress(Math.min(Math.max(fraction, 0), 1));
            setBytesWritten(downloadProgress.totalBytesWritten);
            setBytesTotal(downloadProgress.totalBytesExpectedToWrite);
          }
        }
      );

      downloadResumableRef.current = downloadResumable;
      const downloadResult = await downloadResumable.downloadAsync();

      if (!downloadResult || !downloadResult.uri) {
        throw new Error('Download did not return a valid file URI.');
      }

      // Download succeeded!
      setStatus('ready');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await triggerPackageInstaller(downloadResult.uri);
    } catch (err: any) {
      console.warn('[UpdatePromptModal] Download error:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Download failed. Check internet connection and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const handleCancelDownload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (downloadResumableRef.current) {
      await downloadResumableRef.current.cancelAsync().catch(() => {});
      downloadResumableRef.current = null;
    }
    if (localApkUriRef.current) {
      await FileSystem.deleteAsync(localApkUriRef.current, { idempotent: true }).catch(() => {});
    }
    setStatus('idle');
    setProgress(0);
  };

  const handleBrowserFallback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (release.download_url) {
      Linking.openURL(release.download_url).catch(() => {});
    }
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (downloadResumableRef.current) {
      downloadResumableRef.current.cancelAsync().catch(() => {});
      downloadResumableRef.current = null;
    }
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
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor:
                    status === 'error'
                      ? colors.alert + '20'
                      : status === 'ready'
                      ? colors.success + '20'
                      : isMandatory
                      ? colors.warning + '20'
                      : accent.hex + '18',
                },
              ]}
            >
              <Ionicons
                name={
                  status === 'error'
                    ? 'alert-circle-outline'
                    : status === 'ready'
                    ? 'checkmark-circle-outline'
                    : status === 'downloading'
                    ? 'cloud-download-outline'
                    : isMandatory
                    ? 'warning-outline'
                    : 'sparkles-outline'
                }
                size={24}
                color={
                  status === 'error'
                    ? colors.alert
                    : status === 'ready'
                    ? colors.success
                    : isMandatory
                    ? colors.warning
                    : accent.hex
                }
              />
            </View>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>
                {status === 'downloading'
                  ? 'Downloading Update...'
                  : status === 'installing'
                  ? 'Opening Installer...'
                  : status === 'ready'
                  ? 'Update Ready to Install'
                  : status === 'error'
                  ? 'Download Error'
                  : isMandatory
                  ? 'Important Update Required'
                  : 'Update Available'}
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
            <View
              style={[
                styles.versionPill,
                {
                  backgroundColor: accent.hex + '22',
                  borderColor: accent.hex,
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.versionPillLabel, { color: accent.hex, fontWeight: '700' }]}>
                New: v{release.version}
              </Text>
            </View>
          </View>

          {/* Downloading Progress Bar View */}
          {status === 'downloading' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeaderRow}>
                <Text style={[styles.progressStatusText, { color: colors.textPrimary }]}>
                  Downloading APK ({Math.round(progress * 100)}%)
                </Text>
                <Text style={[styles.progressBytesText, { color: colors.textSecondary }]}>
                  {formatBytes(bytesWritten)} / {formatBytes(bytesTotal)}
                </Text>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: accent.hex,
                      width: `${Math.round(progress * 100)}%`,
                    },
                  ]}
                />
              </View>

              <Text style={[styles.progressHint, { color: colors.textMuted }]}>
                The update will automatically launch Android&apos;s installer once finished.
              </Text>
            </View>
          )}

          {/* Ready / Installing View */}
          {(status === 'ready' || status === 'installing') && (
            <View style={[styles.readyBox, { backgroundColor: colors.surfaceVariant }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.readyBoxText, { color: colors.textPrimary }]}>
                  {status === 'installing'
                    ? 'Please confirm installation in the system package installer dialog.'
                    : 'APK downloaded. Tap below if the installer dialog did not open automatically.'}
                </Text>
                {Platform.OS === 'android' && (
                  <TouchableOpacity
                    onPress={openInstallPermissionSettings}
                    style={{ marginTop: 6 }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={{ fontSize: 11, color: accent.hex, fontWeight: '600', textDecorationLine: 'underline' }}>
                      Need to enable &quot;Install unknown apps&quot;? Tap here
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Error View */}
          {status === 'error' && (
            <View style={[styles.errorBox, { backgroundColor: colors.alert + '15' }]}>
              <Ionicons name="alert-circle" size={18} color={colors.alert} />
              <Text style={[styles.errorBoxText, { color: colors.alert }]}>
                {errorMessage || 'Failed to download update. Check connection and retry.'}
              </Text>
            </View>
          )}

          {/* Release Notes / Changelog (visible in idle state) */}
          {status === 'idle' && (
            <View style={styles.changelogBox}>
              <Text style={styles.changelogHeader}>What&apos;s New:</Text>
              <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.changelogText}>
                  {release.release_notes || 'Performance improvements, APK size reduction, and bug fixes.'}
                </Text>
              </ScrollView>
            </View>
          )}

          {isMandatory && status === 'idle' && (
            <View style={styles.mandatoryWarningBox}>
              <Ionicons name="information-circle" size={15} color={colors.warning} />
              <Text style={styles.mandatoryWarningText}>
                This release contains critical fixes and is required to continue using the app.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {status === 'idle' && (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: accent.hex }]}
                  onPress={handleStartDownload}
                  activeOpacity={0.8}
                >
                  <Ionicons name="download-outline" size={18} color={colors.onPrimary} />
                  <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                    Direct In-App Update
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
              </>
            )}

            {status === 'downloading' && (
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={handleCancelDownload}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                  Cancel Download
                </Text>
              </TouchableOpacity>
            )}

            {(status === 'ready' || status === 'installing') && (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.success }]}
                  onPress={() => {
                    if (localApkUriRef.current) {
                      triggerPackageInstaller(localApkUriRef.current);
                    } else {
                      handleStartDownload();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>
                    Install Update Now
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleBrowserFallback}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
                    Download via Browser Instead
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {status === 'error' && (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: accent.hex }]}
                  onPress={handleStartDownload}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={18} color={colors.onPrimary} />
                  <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                    Retry Download
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleBrowserFallback}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                    Download via Browser
                  </Text>
                </TouchableOpacity>
              </>
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
    progressContainer: {
      backgroundColor: colors.surfaceLight,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    progressHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    progressStatusText: {
      fontSize: 13,
      fontWeight: '600',
    },
    progressBytesText: {
      fontSize: 12,
      ...TYPOGRAPHY.tabularText,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      marginVertical: SPACING.xs,
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressHint: {
      fontSize: 11,
      marginTop: 4,
      lineHeight: 15,
    },
    readyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    readyBoxText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    errorBoxText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
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
    cancelButton: {
      height: 44,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
