// app/src/components/CategoryDonutChart.tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
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
  strokeWidth = 20,
}) => {
  const { colors } = useSettingsStore();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Filter to categories that actually have positive spending
  const activeSlices = useMemo(() => {
    return data
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  // Compute strokeDasharray and strokeDashoffset for each slice
  const sliceAngles = useMemo(() => {
    if (totalAmount <= 0 || activeSlices.length === 0) return [];

    let accumulatedPercentage = 0;
    return activeSlices.map((item) => {
      const percentage = item.amount / totalAmount;
      const strokeDasharray = `${circumference * percentage} ${circumference * (1 - percentage)}`;
      // Rotate starting from top (-90 degrees)
      const strokeDashoffset = -circumference * accumulatedPercentage;
      accumulatedPercentage += percentage;
      return {
        ...item,
        percentage: percentage * 100,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [activeSlices, totalAmount, circumference]);

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
            {sliceAngles.map((slice) => (
              <Circle
                key={slice.category}
                cx={center}
                cy={center}
                r={radius}
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            ))}
          </G>
        </Svg>

        {/* Center Total Summary */}
        <View style={[StyleSheet.absoluteFill, styles.centerLabelContainer]}>
          <Text style={[styles.centerSubLabel, { color: colors.textMuted }]}>TOTAL EXPENSES</Text>
          <Text style={[styles.centerHeroAmount, TYPOGRAPHY.tabularText, { color: colors.textPrimary }]}>
            ₹{totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={[styles.centerCategoriesCount, { color: colors.textSecondary }]}>
            {activeSlices.length} {activeSlices.length === 1 ? 'category' : 'categories'}
          </Text>
        </View>
      </View>

      {/* Mini Legend Row below the Donut */}
      <View style={styles.legendContainer}>
        {sliceAngles.slice(0, 4).map((slice) => (
          <View key={slice.category} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]} numberOfLines={1}>
              {slice.category} ({slice.percentage.toFixed(0)}%)
            </Text>
          </View>
        ))}
        {sliceAngles.length > 4 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>
              +{sliceAngles.length - 4} more
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
    paddingVertical: SPACING.sm,
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
  emptyHintText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: SPACING.sm,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
