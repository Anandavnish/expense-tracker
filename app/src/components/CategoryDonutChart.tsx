// app/src/components/CategoryDonutChart.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  GestureResponderEvent,
} from 'react-native';
import Svg, { G, Circle, Path } from 'react-native-svg';
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
      const midDegNorm = startDegNorm + (fraction * 360) / 2;

      // Convert to standard cartesian coordinates (0 at 3 o'clock, 90 at 6 o'clock, etc.)
      const cartesianDeg = midDegNorm - 90;
      const cartesianRad = (cartesianDeg * Math.PI) / 180;

      // Point on the outer rim of the slice
      const rOuter = radius + strokeWidth / 2 + 1;
      const sliceArcX = center + rOuter * Math.cos(cartesianRad);
      const sliceArcY = center + rOuter * Math.sin(cartesianRad);

      accumulatedFraction += fraction;
      return {
        ...item,
        percentage: fraction * 100,
        strokeDasharray,
        strokeDashoffset,
        startDegNorm,
        endDegNorm,
        midDegNorm,
        sliceArcX,
        sliceArcY,
      };
    });
  }, [activeSlices, totalAmount, circumference, radius, strokeWidth, center]);

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
   * Completely circumvents Android SVG stroke touch-target bugs!
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
      {/* 1. Outside Floating Callout Card (Visible above the chart so fingers never block the values) */}
      <View style={styles.topCalloutSlot}>
        {selectedSlice ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedCategory(null)}
            style={[
              styles.floatingCalloutCard,
              {
                backgroundColor: colors.surfaceLight,
                borderColor: selectedSlice.color,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.activeCategoryDot, { backgroundColor: selectedSlice.color }]} />
              <Text
                style={[styles.activeCategoryText, { color: selectedSlice.color }]}
                numberOfLines={1}
              >
                {selectedSlice.category}
              </Text>
            </View>
            <View style={styles.calloutValuesRow}>
              <Text
                style={[
                  styles.calloutHeroAmount,
                  TYPOGRAPHY.tabularText,
                  { color: colors.textPrimary },
                ]}
              >
                ₹{selectedSlice.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <View style={[styles.percentBadge, { backgroundColor: selectedSlice.color + '1A' }]}>
                <Text style={[styles.calloutPercent, { color: selectedSlice.color }]}>
                  {selectedSlice.percentage.toFixed(1)}%
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.tapHintText, { color: colors.textMuted }]}>
            Tap any ring slice or category below
          </Text>
        )}
      </View>

      {/* 2. Donut Ring Canvas with Geometry-Based Touch Responder */}
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

          {/* Bent Elbow Leader Line (Arrow) pointing from top edge to the tapped slice outer edge */}
          {selectedSlice && (
            <G>
              {/* Elbow path: from top center down to bend, then to slice outer edge */}
              <Path
                d={`M ${center} 4 L ${center} ${Math.min(selectedSlice.sliceArcY, 40)} L ${selectedSlice.sliceArcX.toFixed(1)} ${selectedSlice.sliceArcY.toFixed(1)}`}
                stroke={selectedSlice.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Glowing anchor dot on the selected slice arc */}
              <Circle
                cx={selectedSlice.sliceArcX}
                cy={selectedSlice.sliceArcY}
                r={4}
                fill={selectedSlice.color}
              />
            </G>
          )}
        </Svg>

        {/* Center Total Summary Hub */}
        <View
          style={[StyleSheet.absoluteFill, styles.centerLabelContainer]}
          pointerEvents="none"
        >
          <Text style={[styles.centerSubLabel, { color: colors.textMuted }]}>TOTAL EXPENSES</Text>
          <Text style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textPrimary }]}>
            ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={[styles.centerCategoriesCount, { color: colors.textSecondary }]}>
            {activeSlices.length} {activeSlices.length === 1 ? 'category' : 'categories'}
          </Text>
        </View>
      </View>

      {/* 3. Interactive Legend Chips below the Donut */}
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
                  { color: isSelected ? slice.color : colors.textSecondary, fontWeight: isSelected ? '700' : '500' },
                ]}
                numberOfLines={1}
              >
                {slice.category} ({slice.percentage.toFixed(0)}%)
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
  topCalloutSlot: {
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  tapHintText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  floatingCalloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  activeCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeCategoryText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  calloutValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calloutHeroAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  percentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  calloutPercent: {
    fontSize: 11,
    fontWeight: '700',
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
