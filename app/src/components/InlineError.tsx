import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../theme/tokens';
import { useSettingsStore } from '../store/settingsStore';

interface InlineErrorProps {
  message: string | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  onDismiss,
  autoDismissMs = 6000,
}) => {
  const { colors } = useSettingsStore();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.alertMuted, borderColor: colors.alert }]}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.alert} style={styles.icon} />
      <Text style={[styles.text, { color: colors.alert }]}>{message}</Text>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismissBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Text style={[styles.dismissText, { color: colors.alert }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    marginRight: SPACING.xs,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: SPACING.sm,
  },
  dismissBtn: {
    padding: SPACING.xs,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
