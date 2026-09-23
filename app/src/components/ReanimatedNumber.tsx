// src/components/ReanimatedNumber.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Text, TextStyle, StyleProp, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../theme/tokens';

interface ReanimatedNumberProps {
  value: number;
  prefix?: string;
  style?: StyleProp<TextStyle>;
  decimals?: number;
}

export const ReanimatedNumber: React.FC<ReanimatedNumberProps> = ({
  value,
  prefix = '₹',
  style,
  decimals = 2,
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const animRef = useRef<number | null>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    prevValueRef.current = value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const duration = 240; // Under 250ms as specified
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Snappy cubic ease-out
      const easeOutProgress = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * easeOutProgress;

      setDisplayValue(current);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [value]);

  const formatted = displayValue.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <Text style={[styles.number, TYPOGRAPHY.heroNumber, style]}>
      {prefix}{formatted}
    </Text>
  );
};

const styles = StyleSheet.create({
  number: {
    color: COLORS.textPrimary,
  },
});
