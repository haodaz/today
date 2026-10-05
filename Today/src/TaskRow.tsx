import React, {useEffect, useRef, useState} from 'react';
import {
  Animated, findNodeHandle, Pressable, StyleSheet, Text, View,
} from 'react-native';
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
  /** 焦点停在这一行了。上层要知道，右键按下去才知道该开谁的详情。 */
  onFocusIn?: () => void;
  /** 按进去真有东西。没有就不画箭头——不许诺一个空屏。 */
  hasMore?: boolean;
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
  onFocusIn,
  hasMore,
}: Props) {
  const p = palettes[daypart];
  const [focused, setFocused] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;

  /**
   * 把「向右」钉死在自己身上。
   *
   * 右键是用来按进详情的，但系统的焦点引擎不管这个——它先把焦点挪走，
   * 我的按键处理器再读到的就已经是下一件事了。试过一次：焦点明明停在
   * 「保险」上，按右键开出来的是「看牙」。
   *
   * 所以让这一行的「右邻居」就是它自己。焦点不动，按键才轮得到我处理。
   */
  const box = useRef<View | null>(null);
  const [self, setSelf] = useState<number | null>(null);
  useEffect(() => {
    const h = findNodeHandle(box.current);
    if (h != null) setSelf(h);
  }, []);

  const animate = (to: number) =>
    Animated.spring(lift, {
      toValue: to,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();

  const scale = lift.interpolate({inputRange: [0, 1], outputRange: [1, 1.022]});

  return (
    <Animated.View style={{transform: [{scale}]}}>
      <Pressable
        ref={box}
        nextFocusRight={self ?? undefined}
        hasTVPreferredFocus={autoFocus}
        onFocus={() => {
          setFocused(true);
          animate(1);
          onFocusIn?.();
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
            borderWidth: focused ? 2 : 1,
            shadowColor: p.shadow,
            shadowOpacity: focused ? 1 : 0.55,
            shadowRadius: focused ? 28 : 14,
            shadowOffset: {width: 0, height: focused ? 10 : 4},
            elevation: focused ? 10 : 2,
          },
        ]}>
        {/* 「给她自己的」只用一道杏色边标出来。
            冷色系里唯一的暖色标记，一眼认得出，又不用写字——
            说出来就变成施舍了。 */}
        {forHer ? (
          <View style={[s.herEdge, {backgroundColor: p.warm}]} />
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

        {/* 只在聚焦时浮出来。告诉她这一行还能往里按，
            而且不用写一行说明——箭头自己会说。 */}
        {focused && hasMore ? (
          <Text style={[s.into, {color: p.accent}]}>›</Text>
        ) : null}
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
    borderRadius: 16,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  herEdge: {position: 'absolute', left: 0, top: 0, bottom: 0, width: 4},
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  into: {fontSize: 30, lineHeight: 30, marginLeft: space.sm, fontWeight: '300'},
  tick: {color: '#FFFFFF', fontSize: 16, fontWeight: '700', lineHeight: 18},
  textCol: {flex: 1},
  label: {fontSize: type.task, fontWeight: '500', letterSpacing: 0.2},
  note: {fontSize: type.meta, marginTop: 4},
});
