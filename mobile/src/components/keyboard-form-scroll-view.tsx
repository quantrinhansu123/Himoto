import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, type ScrollViewInstance, type ScrollViewProps } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { KeyboardScrollContext } from './form-fields';

/** Also responds to resize layouts: older Android IMEs do not emit keyboard events with adjustResize. */
export function KeyboardFormScrollView({ children, onScroll, onLayout, ref: forwardedRef, ...props }: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const scroll = useRef<ScrollViewInstance>(null), offset = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerHeight = useHeaderHeight();
  useImperativeHandle(forwardedRef, () => scroll.current!);
  const reveal = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input || !scroll.current) return;
      scroll.current.measureInWindow((_x, top, _width, height) => {
        input.measureInWindow((_inputX, y, _inputWidth, inputHeight) => {
          const keyboardTop = Keyboard.metrics()?.screenY ?? Number.POSITIVE_INFINITY;
          const bottom = Math.min(top + height, keyboardTop) - 24;
          if (height > 0 && y + inputHeight > bottom) scroll.current?.scrollTo({ y: Math.max(0, offset.current + y + inputHeight - bottom), animated: true });
        });
      });
    }, 100);
  }, []);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', reveal);
    return () => { subscription.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [reveal]);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
    <KeyboardScrollContext.Provider value={reveal}>
      <ScrollView {...props} ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={false} scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }} onLayout={event => { onLayout?.(event); reveal(); }}>
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  </KeyboardAvoidingView>;
}
