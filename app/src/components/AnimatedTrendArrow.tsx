// app/src/components/AnimatedTrendArrow.tsx
import React, { useEffect, useCallback } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface AnimatedTrendArrowProps {
  direction: 'up' | 'down' | 'neutral';
  color?: string;
  size?: number;
  onPress?: () => void;
  triggerKey?: string | number;
}

const LINE_LENGTH = 38;
const ARROW_LENGTH = 18;

export const AnimatedTrendArrow: React.FC<AnimatedTrendArrowProps> = ({
  direction,
  color = '#10B981',
  size = 22,
  onPress,
  triggerKey,
}) => {
  const lineProgress = useSharedValue(0);
  const arrowProgress = useSharedValue(0);
  const containerScale = useSharedValue(1);

  const playAnimation = useCallback(() => {
    cancelAnimation(lineProgress);
    cancelAnimation(arrowProgress);
    cancelAnimation(containerScale);

    lineProgress.value = 0;
    arrowProgress.value = 0;
    containerScale.value = 0.95;

    // Draw main line stroke from tail to tip
    lineProgress.value = withTiming(
      1,
      {
        duration: 520,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          // Micro bounce punch when arrowhead completes
          containerScale.value = withSequence(
            withTiming(1.15, { duration: 120 }),
            withSpring(1, { damping: 10, stiffness: 220 })
          );
        }
      }
    );

    // Arrowhead starts drawing smoothly as line reaches destination
    arrowProgress.value = withDelay(
      340,
      withTiming(1, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [lineProgress, arrowProgress, containerScale]);

  useEffect(() => {
    playAnimation();
  }, [triggerKey, direction, playAnimation]);

  const animatedLineProps = useAnimatedProps(() => {
    const offset = (1 - lineProgress.value) * LINE_LENGTH;
    return {
      strokeDashoffset: offset,
    };
  });

  const animatedArrowProps = useAnimatedProps(() => {
    const offset = (1 - arrowProgress.value) * ARROW_LENGTH;
    return {
      strokeDashoffset: offset,
    };
  });

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: containerScale.value }],
    };
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    playAnimation();
    if (onPress) {
      onPress();
    }
  };

  // Paths designed on 32x32 viewBox matching the stock trend zig-zag shape
  let lineD = '';
  let arrowD = '';

  if (direction === 'down') {
    // Starts high-left, dips down, bounces up slightly, plunges down-right
    lineD = 'M 4 8 L 12 18 L 18 12 L 27 21';
    // Down-right arrowhead
    arrowD = 'M 19 21 L 27 21 L 27 13';
  } else if (direction === 'up') {
    // Starts low-left, rises up, dips slightly, shoots up-right
    lineD = 'M 4 24 L 12 14 L 18 20 L 27 11';
    // Up-right arrowhead
    arrowD = 'M 19 11 L 27 11 L 27 19';
  } else {
    // Neutral: gentle wave ending in horizontal arrow
    lineD = 'M 4 16 L 12 13 L 18 19 L 26 16';
    arrowD = 'M 20 10 L 26 16 L 20 22';
  }

  const content = (
    <Animated.View style={[styles.container, animatedContainerStyle, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
      >
        {/* Animated Line Stem */}
        <AnimatedPath
          d={lineD}
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${LINE_LENGTH} ${LINE_LENGTH}`}
          animatedProps={animatedLineProps}
        />
        {/* Animated Arrowhead */}
        <AnimatedPath
          d={arrowD}
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${ARROW_LENGTH} ${ARROW_LENGTH}`}
          animatedProps={animatedArrowProps}
        />
      </Svg>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
