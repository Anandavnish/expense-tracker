import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFinanceStore } from '../store/financeStore';
import { useSettingsStore } from '../store/settingsStore';
import { SPACING, ThemeColors } from '../theme/tokens';
import { TactileButton } from './TactileButton';

interface MonthUnlockModalProps {
  visible: boolean;
  month: string; // 'YYYY-MM'
  onClose: () => void;
  onUnlockSuccess?: () => void;
}

const generateRandom4DigitCode = (): string => {
  const num = Math.floor(1000 + Math.random() * 9000);
  return String(num);
};

export const MonthUnlockModal: React.FC<MonthUnlockModalProps> = ({
  visible,
  month,
  onClose,
  onUnlockSuccess,
}) => {
  const { accent, colors } = useSettingsStore();
  const styles = useMemo(() => getStyles(colors, accent.hex), [colors, accent.hex]);
  const { unlockMonth } = useFinanceStore();

  const [challengeCode, setChallengeCode] = useState(() => generateRandom4DigitCode());
  const [enteredCode, setEnteredCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  // Regenerate challenge when modal opens or month changes
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        setChallengeCode(generateRandom4DigitCode());
        setEnteredCode('');
        setErrorMessage(null);
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible, month]);

  const monthLabel = useMemo(() => {
    try {
      const [yearStr, monthStr] = month.split('-');
      const d = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return month;
    }
  }, [month]);

  const handleRefreshCode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setChallengeCode(generateRandom4DigitCode());
    setEnteredCode('');
    setErrorMessage(null);
  };

  const handleVerify = () => {
    if (enteredCode === challengeCode) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      unlockMonth(month, 30);
      onUnlockSuccess?.();
      onClose();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setErrorMessage('Incorrect 4-digit code. Please enter the number shown above.');
      setEnteredCode('');
      inputRef.current?.focus();
    }
  };

  const handleCodeChange = (text: string) => {
    const sanitized = text.replace(/[^0-9]/g, '').slice(0, 4);
    setEnteredCode(sanitized);
    setErrorMessage(null);

    // Auto verify when 4 digits typed
    if (sanitized.length === 4) {
      if (sanitized === challengeCode) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        unlockMonth(month, 30);
        onUnlockSuccess?.();
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setErrorMessage('Incorrect code. Please re-enter the 4-digit number.');
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <TouchableOpacity style={styles.outsideOverlay} activeOpacity={1} onPress={onClose} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Header Icon & Title */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={24} color={accent.hex} />
              </View>
              <Text style={styles.title}>Unlock {monthLabel}</Text>
              <Text style={styles.subtitle}>
                Past months are locked to protect historical records. Type the 4-digit security code below to unlock editing for 30 minutes.
              </Text>
            </View>

            {/* Random Challenge Box */}
            <View style={styles.challengeBox}>
              <View style={styles.challengeLabelRow}>
                <Text style={styles.challengeHintText}>SECURITY VERIFICATION CODE</Text>
                <TouchableOpacity
                  onPress={handleRefreshCode}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.refreshBtn}
                >
                  <Ionicons name="refresh" size={14} color={accent.hex} />
                  <Text style={styles.refreshBtnText}>New Code</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.codeRow}>
                {challengeCode.split('').map((digit, idx) => (
                  <View key={idx} style={styles.digitBadge}>
                    <Text style={styles.digitText}>{digit}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* User Input Section */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>ENTER THE 4 DIGITS ABOVE</Text>
              <TextInput
                ref={inputRef}
                value={enteredCode}
                onChangeText={handleCodeChange}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.pinInput,
                  errorMessage ? styles.pinInputError : null,
                  enteredCode.length === 4 && enteredCode === challengeCode ? styles.pinInputSuccess : null,
                ]}
                selectionColor={accent.hex}
              />

              {errorMessage ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={14} color={colors.alert} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : (
                <Text style={styles.helperText}>
                  Unlocks for 30 mins with an auto-relock countdown timer.
                </Text>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TactileButton
                onPress={handleVerify}
                disabled={enteredCode.length !== 4}
                style={[
                  styles.unlockBtn,
                  enteredCode.length === 4
                    ? { backgroundColor: accent.hex }
                    : { backgroundColor: colors.border, opacity: 0.6 },
                ]}
              >
                <Ionicons name="lock-open-outline" size={16} color={colors.textInverse} style={{ marginRight: 6 }} />
                <Text style={styles.unlockBtnText}>Unlock Month</Text>
              </TactileButton>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

function getStyles(colors: ThemeColors, accentHex: string) {
  return StyleSheet.create({
    keyboardContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
    },
    outsideOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xl,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderColor: colors.border,
      borderWidth: 1,
      padding: SPACING.xl,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 16,
    },
    header: {
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: accentHex + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
      borderColor: accentHex + '33',
      borderWidth: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.5,
      textAlign: 'center',
      marginBottom: SPACING.xs,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
      paddingHorizontal: SPACING.xs,
    },
    challengeBox: {
      backgroundColor: colors.surfaceLight,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    challengeLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    challengeHintText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    refreshBtnText: {
      color: accentHex,
      fontSize: 11,
      fontWeight: '700',
    },
    codeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 6,
    },
    digitBadge: {
      width: 44,
      height: 48,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderColor: accentHex + '55',
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    digitText: {
      color: accentHex,
      fontSize: 26,
      fontWeight: '900',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    inputContainer: {
      marginBottom: SPACING.lg,
    },
    inputLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: SPACING.xs,
    },
    pinInput: {
      backgroundColor: colors.surfaceLight,
      borderColor: colors.border,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      paddingHorizontal: SPACING.md,
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: 12,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    pinInputError: {
      borderColor: colors.alert,
      backgroundColor: colors.alert + '10',
    },
    pinInputSuccess: {
      borderColor: accentHex,
      backgroundColor: accentHex + '10',
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
    },
    errorText: {
      color: colors.alert,
      fontSize: 11,
      fontWeight: '600',
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 6,
      textAlign: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      borderColor: colors.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    unlockBtn: {
      flex: 1.4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 8,
    },
    unlockBtnText: {
      color: colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
  });
}
