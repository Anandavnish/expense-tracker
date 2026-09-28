import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../store/authStore';
import { useFinanceStore } from '../../store/financeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { TactileButton } from '../../components/TactileButton';
import { SPACING } from '../../theme/tokens';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

interface ProfileScreenProps {
  navigation: any;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, isGuest, setPassword, deleteAccount, signOut, signInWithGoogle } = useAuthStore();
  const { colors, accent, hasGeminiApiKey } = useSettingsStore();
  const { syncStatus, lastSyncedAt, triggerCloudSync } = useFinanceStore();

  // Password setting state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Syncing state
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Detect provider
  const isGoogleUser =
    user?.app_metadata?.provider === 'google' ||
    user?.identities?.some((id: any) => id.provider === 'google');

  const handleCopyId = async () => {
    if (user?.id) {
      await Clipboard.setStringAsync(user.id);
      Alert.alert('Copied', 'User ID copied to clipboard');
    }
  };

  const handleSavePassword = async () => {
    setPasswordFeedback(null);
    if (!newPassword || newPassword.length < 6) {
      setPasswordFeedback({ text: 'Password must be at least 6 characters', isError: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ text: 'Passwords do not match', isError: true });
      return;
    }

    try {
      setIsUpdatingPassword(true);
      const res = await setPassword(newPassword);
      if (res.success) {
        setPasswordFeedback({
          text: 'Password successfully saved! You can now sign in using your email and this password.',
          isError: false,
        });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordFeedback({ text: res.error || 'Failed to update password', isError: true });
      }
    } catch (err: any) {
      setPasswordFeedback({ text: err?.message || 'Failed to update password', isError: true });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncingNow(true);
    try {
      const res = await triggerCloudSync();
      if (!res.success && res.error) {
        Alert.alert('Sync Notice', res.error);
      }
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleSignOut = () => {
    if (isGuest) {
      Alert.alert(
        'Exit Guest Mode',
        'Your transactions and accounts are saved locally on this device. When you sign in with Google or Email later, your local records will be automatically merged into your cloud account.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out to Login Screen',
            style: 'destructive',
            onPress: () => signOut(),
          },
        ]
      );
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Data',
      'Are you completely sure? This will permanently delete your account, cloud database records, and clear all local device caches. This action CANNOT be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingAccount(true);
              const res = await deleteAccount();
              if (!res.success && res.error) {
                Alert.alert('Delete Error', res.error);
              }
            } catch (err: any) {
              Alert.alert('Delete Error', err?.message || 'Failed to delete account');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const formatLastSync = () => {
    if (!lastSyncedAt) return 'Local device only';
    try {
      const d = new Date(lastSyncedAt);
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Recently';
    }
  };

  const displayName = isGuest
    ? 'Guest Explorer'
    : user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const initialLetter = isGuest
    ? 'G'
    : (user?.email?.charAt(0) || displayName.charAt(0) || 'U').toUpperCase();

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={accent.hex} />
          <Text style={[styles.backText, { color: accent.hex }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profile & Account</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('MainTabs', { screen: 'Settings' })}
          style={styles.settingsIconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. User Identity Hero Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.identityRow}>
            <View style={[styles.avatarCircle, { borderColor: accent.hex, backgroundColor: colors.surfaceVariant }]}>
              {isGuest ? (
                <Ionicons name="person-circle-outline" size={38} color={accent.hex} />
              ) : (
                <Text style={[styles.avatarText, { color: accent.hex }]}>{initialLetter}</Text>
              )}
            </View>
            <View style={styles.identityTextCol}>
              <Text style={[styles.identityName, { color: colors.textPrimary }]}>{displayName}</Text>
              <Text style={[styles.identityEmail, { color: colors.textSecondary }]}>
                {isGuest ? 'Offline Local Storage' : user?.email}
              </Text>

              <View style={styles.badgeRow}>
                {isGuest ? (
                  <View style={[styles.statusBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                    <Ionicons name="cloud-offline-outline" size={11} color={colors.textMuted} />
                    <Text style={[styles.statusBadgeText, { color: colors.textSecondary }]}>GUEST MODE</Text>
                  </View>
                ) : isGoogleUser ? (
                  <View style={[styles.statusBadge, { backgroundColor: colors.primaryContainer, borderColor: colors.primary }]}>
                    <Ionicons name="logo-google" size={11} color={colors.primary} />
                    <Text style={[styles.statusBadgeText, { color: colors.primary }]}>GOOGLE SIGN-IN</Text>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, { backgroundColor: colors.primaryContainer, borderColor: colors.primary }]}>
                    <Ionicons name="mail-outline" size={11} color={colors.primary} />
                    <Text style={[styles.statusBadgeText, { color: colors.primary }]}>EMAIL ACCOUNT</Text>
                  </View>
                )}

                {!isGuest && user?.id && (
                  <TouchableOpacity
                    onPress={handleCopyId}
                    style={[styles.statusBadge, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="copy-outline" size={10} color={colors.textMuted} />
                    <Text style={[styles.statusBadgeText, { color: colors.textMuted }]}>
                      ID: {user.id.substring(0, 8)}...
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* 2. Guest Upgrade Banner (Shown ONLY for Guest Mode) */}
        {isGuest && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: accent.hex }]}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="cloud-upload-outline" size={16} color={accent.hex} />
                <Text style={[styles.cardHeaderTitle, { color: colors.textPrimary }]}>
                  Save Data to Cloud Account
                </Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              You are currently using Expense Tracker offline as a guest. Sign in with Google or Email at any time to automatically migrate and sync all your current local accounts, transactions, and budgets to the cloud!
            </Text>

            <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
              <TactileButton
                onPress={() => signInWithGoogle()}
                style={[styles.primaryActionBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="logo-google" size={16} color={colors.textPrimary} />
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>
                    Continue with Google
                  </Text>
                </View>
              </TactileButton>

              <TactileButton
                onPress={() => signOut()}
                style={[styles.primaryActionBtn, { backgroundColor: accent.hex, borderColor: accent.hex }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
                  <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                    Sign In or Create Account with Email
                  </Text>
                </View>
              </TactileButton>
            </View>
          </View>
        )}

        {/* 3. Set Custom Password (for Google or authenticated users) */}
        {!isGuest && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="key-outline" size={16} color={accent.hex} />
                <Text style={[styles.cardHeaderTitle, { color: colors.textPrimary }]}>
                  {isGoogleUser ? 'Set Email Login Password' : 'Change Password'}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              {isGoogleUser
                ? 'You logged in with Google. Set a custom password here so you can log in directly using either Google or your email & password in the future.'
                : 'Update your account password for secure email & password login.'}
            </Text>

            {passwordFeedback && (
              <View
                style={[
                  styles.feedbackBox,
                  {
                    backgroundColor: passwordFeedback.isError ? colors.alertMuted : colors.incomeMuted,
                    borderColor: passwordFeedback.isError ? colors.alert : colors.income,
                  },
                ]}
              >
                <Ionicons
                  name={passwordFeedback.isError ? 'alert-circle' : 'checkmark-circle'}
                  size={15}
                  color={passwordFeedback.isError ? colors.alert : colors.income}
                />
                <Text
                  style={[
                    styles.feedbackText,
                    { color: passwordFeedback.isError ? colors.alert : colors.income },
                  ]}
                >
                  {passwordFeedback.text}
                </Text>
              </View>
            )}

            <View style={styles.passwordForm}>
              <TextInput
                label="New Password (min 6 characters)"
                value={newPassword}
                onChangeText={(t) => {
                  setPasswordFeedback(null);
                  setNewPassword(t);
                }}
                secureTextEntry={!showPassword}
                mode="outlined"
                outlineColor={colors.border}
                activeOutlineColor={accent.hex}
                textColor={colors.textPrimary}
                style={[styles.input, { backgroundColor: colors.surfaceVariant }]}
                right={
                  <TextInput.Icon
                    icon={showPassword ? 'eye-off' : 'eye'}
                    color={colors.textMuted}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />

              <TextInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={(t) => {
                  setPasswordFeedback(null);
                  setConfirmPassword(t);
                }}
                secureTextEntry={!showPassword}
                mode="outlined"
                outlineColor={colors.border}
                activeOutlineColor={accent.hex}
                textColor={colors.textPrimary}
                style={[styles.input, { backgroundColor: colors.surfaceVariant }]}
              />

              <TactileButton
                onPress={handleSavePassword}
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                style={[
                  styles.savePasswordBtn,
                  { backgroundColor: accent.hex, opacity: !newPassword || !confirmPassword ? 0.6 : 1 },
                ]}
              >
                {isUpdatingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.savePasswordBtnText}>
                    {isGoogleUser ? 'Set Password for Email Login' : 'Update Password'}
                  </Text>
                )}
              </TactileButton>
            </View>
          </View>
        )}

        {/* 4. Cloud Sync & Multi-Device State */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sync-outline" size={16} color={accent.hex} />
              <Text style={[styles.cardHeaderTitle, { color: colors.textPrimary }]}>Cloud Sync & Backup</Text>
            </View>
            <View
              style={[
                styles.syncBadge,
                syncStatus === 'synced'
                  ? { backgroundColor: colors.incomeMuted, borderColor: colors.income }
                  : syncStatus === 'syncing'
                  ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                  : syncStatus === 'error'
                  ? { backgroundColor: colors.alertMuted, borderColor: colors.alert }
                  : { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.syncDot,
                  {
                    backgroundColor:
                      syncStatus === 'synced'
                        ? colors.income
                        : syncStatus === 'syncing'
                        ? colors.primary
                        : syncStatus === 'error'
                        ? colors.alert
                        : colors.textMuted,
                  },
                ]}
              />
              <Text
                style={[
                  styles.syncBadgeText,
                  {
                    color:
                      syncStatus === 'synced'
                        ? colors.income
                        : syncStatus === 'syncing'
                        ? colors.primary
                        : syncStatus === 'error'
                        ? colors.alert
                        : colors.textSecondary,
                  },
                ]}
              >
                {syncStatus === 'synced'
                  ? 'SYNCED'
                  : syncStatus === 'syncing'
                  ? 'SYNCING...'
                  : syncStatus === 'error'
                  ? 'SYNC ERROR'
                  : 'IDLE'}
              </Text>
            </View>
          </View>

          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            {isGuest
              ? 'Local cache is active. All your finances are stored safely in high-speed device storage.'
              : 'Offline-first database architecture. All transactions write to device cache instantly and synchronize to Supabase cloud in the background.'}
          </Text>

          <View style={[styles.syncMetaBox, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <View style={styles.syncMetaRow}>
              <Text style={[styles.syncMetaLabel, { color: colors.textMuted }]}>Last Synced:</Text>
              <Text style={[styles.syncMetaValue, { color: colors.textPrimary }]}>
                {formatLastSync()}
              </Text>
            </View>
            <View style={styles.syncMetaRow}>
              <Text style={[styles.syncMetaLabel, { color: colors.textMuted }]}>Device Engine:</Text>
              <Text style={[styles.syncMetaValue, { color: colors.textPrimary }]}>
                AsyncStorage Cache v2 + Supabase
              </Text>
            </View>
          </View>

          <TactileButton
            onPress={handleManualSync}
            disabled={isSyncingNow || syncStatus === 'syncing'}
            style={[
              styles.manualSyncBtn,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
          >
            {isSyncingNow ? (
              <ActivityIndicator size="small" color={accent.hex} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="refresh-outline" size={15} color={accent.hex} />
                <Text style={[styles.manualSyncBtnText, { color: accent.hex }]}>
                  {isGuest ? 'Verify Local Cache' : 'Sync with Cloud Now'}
                </Text>
              </View>
            )}
          </TactileButton>
        </View>

        {/* 5. Google Gemini AI Privacy & Guest Support */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles-outline" size={16} color={accent.hex} />
              <Text style={[styles.cardHeaderTitle, { color: colors.textPrimary }]}>
                Gemini AI on This Device
              </Text>
            </View>
            <View
              style={[
                styles.syncBadge,
                hasGeminiApiKey
                  ? { backgroundColor: colors.incomeMuted, borderColor: colors.income }
                  : { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.syncBadgeText,
                  { color: hasGeminiApiKey ? colors.income : colors.textMuted },
                ]}
              >
                {hasGeminiApiKey ? 'ACTIVE (BYOK)' : 'NOT CONFIGURED'}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
            Gemini AI uses a Bring-Your-Own-Key (BYOK) architecture. Monthly financial totals are aggregated entirely on your device and sent directly to Google AI Studio. This means AI features (OCR receipt parsing & spending summaries) work completely privately in both Guest mode and Cloud mode!
          </Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'Settings' })}
            style={[styles.geminiSettingsLink, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.geminiSettingsLinkText, { color: accent.hex }]}>
              {hasGeminiApiKey ? 'Manage AI Key in Settings' : 'Add Free Gemini Key in Settings'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={accent.hex} />
          </TouchableOpacity>
        </View>

        {/* 6. Account Lifecycle / Danger Zone */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.alert + '44' }]}>
          <Text style={[styles.sectionLabel, { color: colors.alert }]}>ACCOUNT ACTIONS</Text>

          {/* Sign Out Button */}
          <TactileButton
            onPress={handleSignOut}
            style={[
              styles.dangerActionBtn,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.textPrimary} />
            <Text style={[styles.dangerActionBtnText, { color: colors.textPrimary }]}>
              {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
            </Text>
          </TactileButton>

          {/* Delete Account */}
          <TactileButton
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
            style={[
              styles.dangerActionBtn,
              { backgroundColor: colors.alertMuted, borderColor: colors.alert, marginTop: SPACING.sm },
            ]}
          >
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color={colors.alert} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="trash-outline" size={16} color={colors.alert} />
                <Text style={[styles.dangerActionBtnText, { color: colors.alert, fontWeight: '700' }]}>
                  {isGuest ? 'Clear Local Data' : 'Delete Account & Clear Cloud Data'}
                </Text>
              </View>
            )}
          </TactileButton>
        </View>

        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          Expense Tracker • Built with offline-first local cache & Supabase
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    height: 52,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  settingsIconBtn: {
    padding: 6,
  },
  scrollContent: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
  },
  identityTextCol: {
    flex: 1,
  },
  identityName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  identityEmail: {
    fontSize: 13,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  primaryActionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  passwordForm: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  input: {
    fontSize: 14,
  },
  savePasswordBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  savePasswordBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  feedbackText: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  syncMetaBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACING.md,
    marginTop: SPACING.md,
    gap: 6,
  },
  syncMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncMetaLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  syncMetaValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  manualSyncBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  manualSyncBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  geminiSettingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: SPACING.md,
  },
  geminiSettingsLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  dangerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  dangerActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: SPACING.sm,
  },
});
