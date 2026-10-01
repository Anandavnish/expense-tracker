// app/src/components/CategoryDonutChart.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  GestureResponderEvent,
} from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';
import { TYPOGRAPHY, SPACING } from '../theme/tokens';

export interface CategoryChartItem {
  category: string;
  amount: number;
  color: string;
}

interface CategoryDonutChartProps {
  data: CategoryChartItem[];
  totalAmount: number;
  size?: number;
  strokeWidth?: number;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  data,
  totalAmount,
  size = 170,
  strokeWidth = 22,
}) => {
  const { colors } = useSettingsStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Filter to categories that actually have positive spending
  const activeSlices = useMemo(() => {
    return data
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  // Compute strokeDasharray, strokeDashoffset, and angular coverage for each slice
  const sliceAngles = useMemo(() => {
    if (totalAmount <= 0 || activeSlices.length === 0) return [];

    let accumulatedFraction = 0;
    return activeSlices.map((item) => {
      const fraction = item.amount / totalAmount;
      const strokeDasharray = `${circumference * fraction} ${circumference * (1 - fraction)}`;
      const strokeDashoffset = -circumference * accumulatedFraction;

      // Angular coverage normalized to 0 - 360deg starting from 12 o'clock (top) clockwise
      const startDegNorm = accumulatedFraction * 360;
      const endDegNorm = (accumulatedFraction + fraction) * 360;

      accumulatedFraction += fraction;
      return {
        ...item,
        percentage: fraction * 100,
        strokeDasharray,
        strokeDashoffset,
        startDegNorm,
        endDegNorm,
      };
    });
  }, [activeSlices, totalAmount, circumference]);

  const selectedSlice = useMemo(() => {
    if (!selectedCategory) return null;
    return sliceAngles.find((s) => s.category === selectedCategory) || null;
  }, [selectedCategory, sliceAngles]);

  const handleSelectSlice = (cat: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selectedCategory === cat) {
      setSelectedCategory(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    setSelectedCategory(cat);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSelectedCategory(null);
    }, 3500);
  };

  /**
   * Angle-based touch handler on the entire donut area.
   */
  const handleDonutTouch = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const dx = locationX - center;
    const dy = locationY - center;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Inner and outer boundaries of the touchable donut ring
    const minR = Math.max(10, radius - strokeWidth - 10);
    const maxR = radius + strokeWidth + 15;

    if (dist < minR) {
      // Tap in center hub clears selection
      if (selectedCategory) {
        setSelectedCategory(null);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
      return;
    }

    if (dist > maxR) {
      return;
    }

    // Calculate angle in degrees from -180 to 180
    const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    // Normalize so that 12 o'clock (-90deg) is 0deg clockwise:
    const touchAngleNorm = (rawDeg + 90 + 360) % 360;

    // Find which slice contains this angle
    const matched = sliceAngles.find(
      (s) => touchAngleNorm >= s.startDegNorm && touchAngleNorm <= s.endDegNorm
    );

    if (matched) {
      handleSelectSlice(matched.category);
    }
  };

  if (totalAmount <= 0 || activeSlices.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={colors.surfaceLight}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.centerLabelContainer]}>
            <Text style={[styles.centerSubLabel, { color: colors.textMuted }]}>TOTAL SPENT</Text>
            <Text style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textSecondary }]}>
              ₹0
            </Text>
          </View>
        </View>
        <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
          No category expenses recorded this month
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Donut Ring Canvas with Geometry-Based Touch Responder */}
      <View
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleDonutTouch}
      >
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {/* Background Track */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={colors.surfaceLight}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Active Slices */}
            {sliceAngles.map((slice) => {
              const isSelected = selectedCategory === slice.category;
              return (
                <Circle
                  key={slice.category}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  opacity={selectedCategory && !isSelected ? 0.35 : 1}
                />
              );
            })}
          </G>
        </Svg>

        {/* Center Total Summary / Selected Slice Hub */}
        <View
          style={[StyleSheet.absoluteFill, styles.centerLabelContainer]}
          pointerEvents="none"
        >
          {selectedSlice ? (
            <>
              <Text
                style={[styles.centerSubLabel, { color: selectedSlice.color, fontWeight: '700' }]}
                numberOfLines={1}
              >
                {selectedSlice.category.toUpperCase()}
              </Text>
              <Text
                style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textPrimary }]}
              >
                ₹{selectedSlice.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.centerCategoriesCount, { color: selectedSlice.color, fontWeight: '700' }]}>
                {selectedSlice.percentage.toFixed(1)}% of total
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.centerSubLabel, { color: colors.textMuted }]}>TOTAL SPENT</Text>
              <Text
                style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textPrimary }]}
              >
                ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.centerCategoriesCount, { color: colors.textSecondary }]}>
                {activeSlices.length} {activeSlices.length === 1 ? 'category' : 'categories'}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Interactive Legend Chips below the Donut */}
      <View style={styles.legendContainer}>
        {sliceAngles.slice(0, 5).map((slice) => {
          const isSelected = selectedCategory === slice.category;
          return (
            <TouchableOpacity
              key={slice.category}
              onPress={() => handleSelectSlice(slice.category)}
              activeOpacity={0.7}
              style={[
                styles.legendItem,
                isSelected && {
                  backgroundColor: slice.color + '1A',
                  borderColor: slice.color,
                  borderWidth: 1,
                },
              ]}
            >
              <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
              <Text
                style={[
                  styles.legendText,
                  { color: isSelected ? slice.color : colors.textSecondary },
                  isSelected && { fontWeight: '700' },
                ]}
              >
                {slice.category} • {slice.percentage.toFixed(0)}%
              </Text>
            </TouchableOpacity>
          );
        })}
        {sliceAngles.length > 5 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>
              +{sliceAngles.length - 5} more
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  centerLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSubLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  centerHeroAmount: {
    fontSize: 17,
    fontWeight: '800',
  },
  centerCategoriesCount: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyHintText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: SPACING.sm,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 11,
  },
});
