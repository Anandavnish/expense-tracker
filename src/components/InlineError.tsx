// src/components/InlineError.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../theme/tokens';

interface InlineErrorProps {
  message: string | null;
  onDismiss: () => void;
}

export const InlineError: React.FC<InlineErrorProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
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
