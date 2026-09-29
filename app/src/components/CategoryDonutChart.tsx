// app/src/components/CategoryDonutChart.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  size = 180,
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

  // Compute strokeDasharray, strokeDashoffset, and angular geometry for each slice
  const sliceAngles = useMemo(() => {
    if (totalAmount <= 0 || activeSlices.length === 0) return [];

    let accumulatedFraction = 0;
    return activeSlices.map((item) => {
      const fraction = item.amount / totalAmount;
      const strokeDasharray = `${circumference * fraction} ${circumference * (1 - fraction)}`;
      const strokeDashoffset = -circumference * accumulatedFraction;

      // Calculate midpoint angle in degrees (rotated -90deg so 12 o'clock is 0)
      const startDeg = accumulatedFraction * 360 - 90;
      const midDeg = startDeg + (fraction * 360) / 2;
      const midRad = (midDeg * Math.PI) / 180;

      // Coordinate on inner edge of the donut stroke
      const rInner = radius - strokeWidth / 2;
      const x1 = center + rInner * Math.cos(midRad);
      const y1 = center + rInner * Math.sin(midRad);

      // Elbow bend point towards the center hub
      const rBend = radius - strokeWidth - 5;
      const x2 = center + rBend * Math.cos(midRad);
      const y2 = center + rBend * Math.sin(midRad);

      // Horizontal leader leg extending towards center
      const dx = Math.cos(midRad);
      const x3 = x2 - (dx >= 0 ? 10 : -10);
      const y3 = y2;

      accumulatedFraction += fraction;
      return {
        ...item,
        percentage: fraction * 100,
        strokeDasharray,
        strokeDashoffset,
        midDeg,
        midRad,
        x1,
        y1,
        x2,
        y2,
        x3,
        y3,
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
    }, 3000);
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
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
                  onPress={() => handleSelectSlice(slice.category)}
                />
              );
            })}
          </G>

          {/* Bent Elbow Leader Line (Arrow) for Selected Slice */}
          {selectedSlice && (
            <G>
              {/* Leader path from slice inner rim, through bend, to horizontal leg */}
              <Path
                d={`M ${selectedSlice.x1.toFixed(1)} ${selectedSlice.y1.toFixed(1)} L ${selectedSlice.x2.toFixed(1)} ${selectedSlice.y2.toFixed(1)} L ${selectedSlice.x3.toFixed(1)} ${selectedSlice.y3.toFixed(1)}`}
                stroke={selectedSlice.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Anchor dot on slice */}
              <Circle
                cx={selectedSlice.x1}
                cy={selectedSlice.y1}
                r={3}
                fill={selectedSlice.color}
              />
              {/* Terminal indicator dot */}
              <Circle
                cx={selectedSlice.x3}
                cy={selectedSlice.y3}
                r={2}
                fill={selectedSlice.color}
              />
            </G>
          )}
        </Svg>

        {/* Center Total Summary / Interactive Hub */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSelectedCategory(null)}
          style={[StyleSheet.absoluteFill, styles.centerLabelContainer]}
        >
          {selectedSlice ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
              <View style={[styles.activeCategoryBadge, { backgroundColor: selectedSlice.color + '22' }]}>
                <Text style={[styles.activeCategoryText, { color: selectedSlice.color }]} numberOfLines={1}>
                  {selectedSlice.category}
                </Text>
              </View>
              <Text
                style={[
                  styles.centerHeroAmount,
                  TYPOGRAPHY.tabularText,
                  { color: colors.textPrimary, fontSize: 16, marginVertical: 1 },
                ]}
                numberOfLines={1}
              >
                ₹{selectedSlice.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.centerCategoryPercent, { color: selectedSlice.color }]}>
                {selectedSlice.percentage.toFixed(1)}% of total
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.centerSubLabel, { color: colors.textMuted }]}>TOTAL EXPENSES</Text>
              <Text style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textPrimary }]}>
                ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.centerCategoriesCount, { color: colors.textSecondary }]}>
                {activeSlices.length} {activeSlices.length === 1 ? 'category' : 'categories'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Interactive Legend Row below the Donut */}
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
                  backgroundColor: slice.color + '18',
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
    fontSize: 18,
    fontWeight: '800',
  },
  centerCategoriesCount: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  activeCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 2,
  },
  activeCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  centerCategoryPercent: {
    fontSize: 10,
    fontWeight: '700',
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
