import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  ViewStyle,
  Platform,
} from 'react-native';
import { useKeyboard } from '../hooks/useKeyboard';

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  extraScrollHeight?: number;
}

export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  (
    {
      children,
      contentContainerStyle,
      extraScrollHeight = 40,
      keyboardShouldPersistTaps = 'handled',
      ...restProps
    },
    ref
  ) => {
    const internalScrollRef = useRef<ScrollView>(null);
    const { keyboardHeight, isKeyboardVisible } = useKeyboard();

    useImperativeHandle(ref, () => internalScrollRef.current as ScrollView);

    // Compute dynamic bottom padding when the keyboard is open
    const flattenedContentStyle = StyleSheet.flatten(contentContainerStyle) as ViewStyle || {};
    const basePaddingBottom =
      typeof flattenedContentStyle.paddingBottom === 'number'
        ? flattenedContentStyle.paddingBottom
        : 20;

    const dynamicPaddingBottom = isKeyboardVisible
      ? basePaddingBottom + keyboardHeight + extraScrollHeight
      : basePaddingBottom;

    return (
      <ScrollView
        ref={internalScrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: dynamicPaddingBottom },
        ]}
        {...restProps}
      >
        {children}
      </ScrollView>
    );
  }
);

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
