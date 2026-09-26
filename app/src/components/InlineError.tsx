// src/components/InlineError.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme/tokens';

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
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={18} color={COLORS.alert} style={styles.icon} />
      <Text style={styles.text}>{message}</Text>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismissBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.alertMuted,
    borderColor: COLORS.alert,
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
    color: COLORS.alert,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: SPACING.sm,
  },
  dismissBtn: {
    padding: SPACING.xs,
  },
  dismissText: {
    color: COLORS.alert,
    fontSize: 14,
    fontWeight: '700',
  },
});
