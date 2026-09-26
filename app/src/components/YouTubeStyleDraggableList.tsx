import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING } from '../theme/tokens';

interface DraggableRowItemProps<T> {
  item: T;
  index: number;
  isDraggingThis: boolean;
  panY: Animated.Value;
  scaleAnim: Animated.Value;
  shiftAnim: Animated.Value;
  itemHeight: number;
  gap: number;
  accentColor: string;
  holdDurationMs?: number;
  renderContent: (item: T, isDragging: boolean) => React.ReactNode;
  renderActions?: (item: T, isDragging: boolean) => React.ReactNode;
  onDragStart: (index: number) => void;
  onDragMove: (dy: number) => void;
  onDragRelease: () => void;
}

function DraggableRowItem<T>(props: DraggableRowItemProps<T>) {
  const {
    item,
    index,
    isDraggingThis,
    panY,
    scaleAnim,
    shiftAnim,
    itemHeight,
    gap,
    accentColor,
    holdDurationMs = 120,
    renderContent,
    renderActions,
  } = props;

  const propsRef = useRef(props);
  propsRef.current = props;

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActivatedRef = useRef(false);

  // Stable PanResponder attached strictly to the dual horizontal bar (=) handle
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        isActivatedRef.current = false;
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
        }

        // Hold for 1 second (1000ms) before elevation and haptics to get ready to move
        holdTimerRef.current = setTimeout(() => {
          isActivatedRef.current = true;
          propsRef.current.onDragStart(propsRef.current.index);
        }, propsRef.current.holdDurationMs || 1000);
      },
      onPanResponderMove: (_, gestureState) => {
        // If finger moves more than touch slop before 1s hold expires, cancel the hold
        if (!isActivatedRef.current) {
          if (Math.abs(gestureState.dy) > 10 || Math.abs(gestureState.dx) > 10) {
            if (holdTimerRef.current) {
              clearTimeout(holdTimerRef.current);
              holdTimerRef.current = null;
            }
          }
          return;
        }

        propsRef.current.onDragMove(gestureState.dy);
      },
      onPanResponderRelease: () => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        if (isActivatedRef.current) {
          propsRef.current.onDragRelease();
        }
        isActivatedRef.current = false;
      },
      onPanResponderTerminate: () => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        if (isActivatedRef.current) {
          propsRef.current.onDragRelease();
        }
        isActivatedRef.current = false;
      },
    })
  ).current;

  const translateY = isDraggingThis ? panY : (shiftAnim || 0);
  const scale = isDraggingThis ? scaleAnim : 1.0;
  const zIndex = isDraggingThis ? 9999 : 1;

  return (
    <Animated.View
      style={[
        styles.itemCard,
        {
          height: itemHeight,
          marginBottom: gap,
          transform: [{ translateY }, { scale }],
          zIndex,
          elevation: isDraggingThis ? 24 : 0,
          borderColor: isDraggingThis ? accentColor : COLORS.border,
          backgroundColor: isDraggingThis ? COLORS.surfaceLight : COLORS.surface,
          shadowColor: isDraggingThis ? '#000' : 'transparent',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDraggingThis ? 0.45 : 0,
          shadowRadius: 12,
        },
      ]}
    >
      {/* YouTube-Style Dual Horizontal Bar Handle (=) */}
      <View
        style={styles.dragHandleTouchArea}
        {...panResponder.panHandlers}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <View
          style={[
            styles.dualBar,
            isDraggingThis && { backgroundColor: accentColor },
          ]}
        />
        <View
          style={[
            styles.dualBar,
            isDraggingThis && { backgroundColor: accentColor },
          ]}
        />
      </View>

      {/* Item Content (Badge, Title, Subtitle/Balance) */}
      <View style={styles.itemContentArea}>
        {renderContent(item, isDraggingThis)}
      </View>

      {/* Actions (Edit, Delete) - Strictly outside pan handler */}
      {renderActions && (
        <View style={styles.itemActionsArea}>
          {renderActions(item, isDraggingThis)}
        </View>
      )}
    </Animated.View>
  );
}

export interface YouTubeStyleDraggableListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  onReorder: (newData: T[]) => void | Promise<void>;
  renderContent: (item: T, isDragging: boolean) => React.ReactNode;
  renderActions?: (item: T, isDragging: boolean) => React.ReactNode;
  itemHeight?: number;
  gap?: number;
  accentColor?: string;
  holdDurationMs?: number;
  contentContainerStyle?: any;
  onDragBegin?: () => void;
  onDragEnd?: () => void;
}

export function YouTubeStyleDraggableList<T>({
  data,
  keyExtractor,
  onReorder,
  renderContent,
  renderActions,
  itemHeight = 64,
  gap = 8,
  accentColor = COLORS.accent,
  holdDurationMs = 1000,
  contentContainerStyle,
  onDragBegin,
  onDragEnd,
}: YouTubeStyleDraggableListProps<T>) {
  const rowHeight = itemHeight + gap;

  // Track active dragging item
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);

  // Animated values for dragged item
  const panY = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Animated values for other items shifting
  const shiftAnims = useRef<Animated.Value[]>([]).current;

  // Synchronize shiftAnims array with data length
  if (shiftAnims.length !== data.length) {
    while (shiftAnims.length < data.length) {
      shiftAnims.push(new Animated.Value(0));
    }
    while (shiftAnims.length > data.length) {
      shiftAnims.pop();
    }
  }

  // Helper to update other items' spring shifts based on hover index
  const updateShifts = (dragIdx: number, hoverIdx: number) => {
    data.forEach((_, idx) => {
      if (idx === dragIdx) return;

      let targetOffset = 0;
      if (dragIdx < hoverIdx) {
        // Dragging down: items between dragIdx + 1 and hoverIdx shift UP
        if (idx > dragIdx && idx <= hoverIdx) {
          targetOffset = -rowHeight;
        }
      } else if (dragIdx > hoverIdx) {
        // Dragging up: items between hoverIdx and dragIdx - 1 shift DOWN
        if (idx >= hoverIdx && idx < dragIdx) {
          targetOffset = rowHeight;
        }
      }

      Animated.spring(shiftAnims[idx], {
        toValue: targetOffset,
        useNativeDriver: true,
        tension: 140,
        friction: 12,
      }).start();
    });
  };

  // Reset all shift animations
  const resetShifts = () => {
    shiftAnims.forEach((anim) => {
      Animated.spring(anim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 140,
        friction: 12,
      }).start();
    });
  };

  const handleDragStart = (index: number) => {
    activeIndexRef.current = index;
    hoverIndexRef.current = index;
    setDraggingIndex(index);
    onDragBegin?.();

    // YouTube-style medium haptic bump on lift
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    panY.setValue(0);
    Animated.spring(scaleAnim, {
      toValue: 1.03,
      useNativeDriver: true,
      tension: 150,
      friction: 8,
    }).start();
  };

  const handleDragMove = (dy: number) => {
    const startIdx = activeIndexRef.current;
    if (startIdx === null) return;

    panY.setValue(dy);

    const rawHover = startIdx + Math.round(dy / rowHeight);
    const clampedHover = Math.max(0, Math.min(data.length - 1, rawHover));

    if (clampedHover !== hoverIndexRef.current) {
      hoverIndexRef.current = clampedHover;
      // Light selection tick when passing each item slot
      Haptics.selectionAsync().catch(() => {});
      updateShifts(startIdx, clampedHover);
    }
  };

  const handleDragRelease = () => {
    const startIdx = activeIndexRef.current;
    if (startIdx === null) {
      setDraggingIndex(null);
      onDragEnd?.();
      return;
    }

    const hoverIdx = hoverIndexRef.current ?? startIdx;
    const snapTargetY = (hoverIdx - startIdx) * rowHeight;

    // Smoothly snap card to target slot
    Animated.parallel([
      Animated.spring(panY, {
        toValue: snapTargetY,
        useNativeDriver: true,
        tension: 140,
        friction: 12,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1.0,
        useNativeDriver: true,
        tension: 140,
        friction: 10,
      }),
    ]).start(() => {
      // Light tactile tap upon drop
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      if (startIdx !== hoverIdx) {
        const reordered = [...data];
        const [moved] = reordered.splice(startIdx, 1);
        reordered.splice(hoverIdx, 0, moved);
        onReorder(reordered);
      }

      panY.setValue(0);
      resetShifts();
      activeIndexRef.current = null;
      hoverIndexRef.current = null;
      setDraggingIndex(null);
      onDragEnd?.();
    });
  };

  return (
    <View style={[styles.listContainer, contentContainerStyle]}>
      {data.map((item, idx) => {
        const key = keyExtractor(item);
        const isDraggingThis = draggingIndex === idx;

        return (
          <DraggableRowItem<T>
            key={key}
            item={item}
            index={idx}
            isDraggingThis={isDraggingThis}
            panY={panY}
            scaleAnim={scaleAnim}
            shiftAnim={shiftAnims[idx] || new Animated.Value(0)}
            itemHeight={itemHeight}
            gap={gap}
            accentColor={accentColor}
            renderContent={renderContent}
            renderActions={renderActions}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragRelease={handleDragRelease}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    width: '100%',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  dragHandleTouchArea: {
    width: 36,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dualBar: {
    width: 18,
    height: 2.2,
    borderRadius: 1.5,
    backgroundColor: COLORS.textMuted,
  },
  itemContentArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemActionsArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
