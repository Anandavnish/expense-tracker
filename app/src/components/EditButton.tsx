// src/components/EditButton.tsx
import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  GestureResponderEvent,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

export interface EditButtonProps {
  onPress?: (event?: GestureResponderEvent) => void;
  size?: number;
  iconSize?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
  activeOpacity?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Standardized Edit Button used throughout the application.
 * Matches the Feather edit SVG outline icon in a rounded square container.
 */
export const EditButton: React.FC<EditButtonProps> = ({
  onPress,
  size = 30,
  iconSize,
  color,
  backgroundColor,
  borderColor,
  borderWidth = 1,
  borderRadius,
  style,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  activeOpacity = 0.7,
  disabled = false,
  accessibilityLabel = 'Edit',
}) => {
  const { colors, accent } = useAppTheme();

  const effectiveIconSize = iconSize ?? Math.max(12, Math.round(size * 0.48));
  const effectiveColor = color ?? accent.hex;
  const effectiveBg =
    backgroundColor ??
    (colors.surfaceLight ? `${colors.surfaceLight}` : `${effectiveColor}15`);
  const effectiveBorder = borderColor ?? `${effectiveColor}30`;
  const effectiveRadius = borderRadius ?? Math.round(size * 0.28);

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: effectiveRadius,
    backgroundColor: effectiveBg,
    borderColor: effectiveBorder,
    borderWidth,
    justifyContent: 'center',
    alignItems: 'center',
  };

  if (!onPress) {
    return (
      <View style={[styles.base, containerStyle, style]}>
        <Feather name="edit" size={effectiveIconSize} color={effectiveColor} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={(e) => {
        e?.stopPropagation?.();
        onPress(e);
      }}
      disabled={disabled}
      activeOpacity={activeOpacity}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, containerStyle, style]}
    >
      <Feather name="edit" size={effectiveIconSize} color={effectiveColor} />
    </TouchableOpacity>
  );
};

export interface EditIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Standalone Feather Edit Icon matching the exact SVG path:
 * <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
 * <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
 */
export const EditIcon: React.FC<EditIconProps> = ({ size = 16, color, style }) => {
  const { accent } = useAppTheme();
  return (
    <Feather
      name="edit"
      size={size}
      color={color ?? accent.hex}
      style={style}
    />
  );
};

export default EditButton;

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
