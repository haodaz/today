import React, {useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {palettes, type Daypart, type, space} from './theme';

type Props = {
  label: string;
  note?: string;
  done: boolean;
  /** 这件是给她自己的。整个产品里唯一需要被保护的字段。 */
  forHer?: boolean;
  daypart: Daypart;
  autoFocus?: boolean;
  onToggle: () => void;
};

/**
 * 一件事。
 *
 * 电视上没有触屏，只有遥控器的方向键。所以这里只有两个状态要做对：
 * 聚焦（当前停在哪一行）和完成（打没打勾）。
 * 聚焦必须一眼看得见——沙发离屏幕三米，细微的描边变化等于没有。
 */
export function TaskRow({
  label,
  note,
  done,
  forHer,
  daypart,
  autoFocus,
  onToggle,
}: Props) {
  const p = palettes[daypart];
  const [focused, setFocused] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;

  const animate = (to: number) =>
    Animated.spring(lift, {
      toValue: to,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();

  const scale = lift.interpolate({inputRange: [0, 1], outputRange: [1, 1.025]});

  return (
    <Animated.View style={{transform: [{scale}]}}>
      <Pressable
        hasTVPreferredFocus={autoFocus}
        onFocus={() => {
          setFocused(true);
          animate(1);
        }}
        onBlur={() => {
          setFocused(false);
          animate(0);
        }}
        onPress={onToggle}
        style={[
          s.row,
          {
            backgroundColor: focused ? p.surfaceFocused : p.surface,
            borderColor: focused ? p.accent : p.border,
            borderWidth: focused ? 3 : 1,
            shadowColor: '#000',
            shadowOpacity: focused ? 0.1 : 0,
            shadowRadius: focused ? 24 : 0,
            shadowOffset: {width: 0, height: focused ? 8 : 0},
            elevation: focused ? 8 : 0,
          },
        ]}>
        {/* 「给她自己的」只用一道暖色边标出来。
            不加徽章、不写「这件是给你的」——说出来就变成施舍了。 */}
        {forHer ? (
          <View style={[s.herEdge, {backgroundColor: p.accent}]} />
        ) : null}

        <View
          style={[
            s.box,
            {
              borderColor: done ? p.accent : p.border,
              backgroundColor: done ? p.accent : 'transparent',
            },
          ]}>
          {done ? <Text style={s.tick}>✓</Text> : null}
        </View>

        <View style={s.textCol}>
          <Text
            style={[
              s.label,
              {
                color: done ? p.done : p.text,
                textDecorationLine: done ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={1}>
            {label}
          </Text>
          {note ? (
            <Text style={[s.note, {color: p.textFaint}]} numberOfLines={1}>
              {note}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 18,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  herEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  box: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  tick: {color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 30},
  textCol: {flex: 1},
  label: {fontSize: type.task, fontWeight: '500', letterSpacing: 0.2},
  note: {fontSize: type.meta, marginTop: 4},
});
