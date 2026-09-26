import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SPACING } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';

interface SignUpScreenProps {
  navigation: any;
}

export const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { signUp, isLoading, error, clearError } = useAuthStore();

  const handleSignUp = async () => {
    if (!email || !password) return;
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }
    setValidationError(null);
    await signUp(email, password);
  };

  const displayError = validationError || error;

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? undefined : 'padding'}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>NEW ACCOUNT</Text>
            </View>
            <Text style={styles.title}>Sign Up</Text>
            <Text style={styles.subtitle}>
              Create your account to start tracking accounts, budgets, and borrows
            </Text>
          </View>

          {displayError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <TextInput
              label="Email"
              value={email}
              onChangeText={(text) => {
                clearError();
                setValidationError(null);
                setEmail(text);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <TextInput
              label="Password (min 6 chars)"
              value={password}
              onChangeText={(text) => {
                clearError();
                setValidationError(null);
                setPassword(text);
              }}
              secureTextEntry
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <TextInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(text) => {
                clearError();
                setValidationError(null);
                setConfirmPassword(text);
              }}
              secureTextEntry
              mode="outlined"
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.accent}
              textColor={COLORS.textPrimary}
              style={styles.input}
            />

            <TactileButton
              onPress={handleSignUp}
              disabled={isLoading || !email || !password || !confirmPassword}
              style={styles.submitBtn}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.textInverse} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Create Account</Text>
              )}
            </TactileButton>

            <TactileButton
              onPress={() => {
                clearError();
                navigation.navigate('Login');
              }}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>
                Already have an account? <Text style={styles.linkText}>Sign In</Text>
              </Text>
            </TactileButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: SPACING.sm,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  tagText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
    borderWidth: 1,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorText: {
    color: COLORS.alert,
    fontSize: 13,
  },
  form: {
    gap: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.surface,
  },
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  submitBtnText: {
    color: COLORS.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
