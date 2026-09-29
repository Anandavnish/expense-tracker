import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SPACING } from '../../theme/tokens';
import { TactileButton } from '../../components/TactileButton';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

interface LoginScreenProps {
  navigation: any;
}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const { signIn, signInWithGoogle, isLoading, error, clearError } = useAuthStore();

  const handleSignIn = async () => {
    if (!email || !password) return;
    await signIn(email, password);
  };

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        extraScrollHeight={60}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>FINANCE ARCHITECTURE</Text>
          </View>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>
            Sign in with your Google account to access your financial tracker
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={COLORS.alert} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {/* Primary Action: Google Sign In Hero Button */}
          <TactileButton
            onPress={() => {
              clearError();
              signInWithGoogle();
            }}
            disabled={isLoading}
            style={styles.googleHeroBtn}
          >
            {isLoading && !showEmailLogin ? (
              <ActivityIndicator color={COLORS.textInverse} size="small" />
            ) : (
              <View style={styles.btnRow}>
                <Ionicons name="logo-google" size={18} color={COLORS.textInverse} />
                <Text style={styles.googleHeroBtnText}>Continue with Google</Text>
              </View>
            )}
          </TactileButton>

          {/* Secondary Email Login Toggle */}
          <View style={styles.toggleRowContainer}>
            <TouchableOpacity
              onPress={() => {
                clearError();
                setShowEmailLogin((prev) => !prev);
              }}
              style={styles.toggleEmailBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.toggleEmailBtnText}>
                {showEmailLogin ? 'Hide Email Sign In' : 'Already set a password? Sign in with Email'}
              </Text>
              <Ionicons
                name={showEmailLogin ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Collapsible Email & Password Section */}
          {showEmailLogin && (
            <View style={styles.emailLoginForm}>
              <TextInput
                label="Email"
                value={email}
                onChangeText={(text) => {
                  clearError();
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
                label="Password"
                value={password}
                onChangeText={(text) => {
                  clearError();
                  setPassword(text);
                }}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
                secureTextEntry
                mode="outlined"
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.accent}
                textColor={COLORS.textPrimary}
                style={styles.input}
              />

              <TactileButton
                onPress={handleSignIn}
                disabled={isLoading || !email || !password}
                style={styles.submitBtn}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.textInverse} size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Sign In with Email</Text>
                )}
              </TactileButton>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
  },
  form: {
    gap: SPACING.md,
  },
  googleHeroBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleHeroBtnText: {
    color: COLORS.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toggleRowContainer: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  toggleEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
  },
  toggleEmailBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  emailLoginForm: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
  },
  submitBtn: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  submitBtnText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
