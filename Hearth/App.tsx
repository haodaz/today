import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useKeepAwake} from 'expo-keep-awake';
import {TaskRow} from './src/TaskRow';
import {daypartOf, palettes, safe, space, type} from './src/theme';

/** 按时段换一句话。不励志、不打鸡血、不提醒你还差多少。 */
const GREETINGS: Record<string, string> = {
  dawn: '早。今天不用全做完。',
  day: '在就好。',
  dusk: '天暗下来了。',
  night: '今天到这儿就行。',
};

type Task = {id: string; label: string; note?: string; done: boolean};

export default function App() {
  // 这块屏幕要全天亮着，不能让系统屏保把它盖掉
  useKeepAwake();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const daypart = daypartOf(now);
  const p = palettes[daypart];

  // 占位数据。下一步接 agent：由它把一天压成这三件。
  const [tasks, setTasks] = useState<Task[]>([
    {id: '1', label: '把明天的书包收好', note: '睡前', done: false},
    {id: '2', label: '把洗衣机那桶晾了', done: true},
    {id: '3', label: '坐十分钟，什么都不干', note: '这件也算数', done: false},
  ]);

  const toggle = (id: string) =>
    setTasks(ts => ts.map(t => (t.id === id ? {...t, done: !t.done} : t)));

  const {hhmm, dateLine} = useMemo(() => {
    const hh = now.getHours();
    const mm = now.getMinutes().toString().padStart(2, '0');
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
      now.getDay()
    ];
    return {
      hhmm: `${h12}:${mm}`,
      dateLine: `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${week}`,
    };
  }, [now]);

  const left = tasks.filter(t => !t.done).length;

  return (
    <SafeAreaView style={[s.root, {backgroundColor: p.bg}]}>
      <StatusBar hidden />
      <View style={s.page}>
        {/* 左栏：时间。抬头一眼就看见，不用找。 */}
        <View style={s.left}>
          <Text style={[s.clock, {color: p.text}]}>{hhmm}</Text>
          <Text style={[s.date, {color: p.textSoft}]}>{dateLine}</Text>
          <View style={[s.rule, {backgroundColor: p.border}]} />
          <Text style={[s.greeting, {color: p.textSoft}]}>
            {GREETINGS[daypart]}
          </Text>
        </View>

        {/* 右栏：今天的三件事 */}
        <View style={s.right}>
          <View style={s.sectionHead}>
            <Text style={[s.section, {color: p.textSoft}]}>今天</Text>
            <Text style={[s.count, {color: p.textFaint}]}>
              {left === 0 ? '都做完了' : `还剩 ${left} 件`}
            </Text>
          </View>

          {tasks.map((t, i) => (
            <TaskRow
              key={t.id}
              label={t.label}
              note={t.note}
              done={t.done}
              daypart={daypart}
              autoFocus={i === 0}
              onToggle={() => toggle(t.id)}
            />
          ))}

          <Text style={[s.footer, {color: p.textFaint}]}>
            按遥控器上下选，中间键打勾
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {flex: 1},
  page: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: safe.h,
    paddingVertical: safe.v,
  },
  left: {width: '38%', justifyContent: 'center', paddingRight: space.xl},
  clock: {
    fontSize: type.clock,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: type.clock * 1.05,
  },
  date: {fontSize: type.section, marginTop: space.xs, letterSpacing: 0.5},
  rule: {height: 1, width: 72, marginVertical: space.lg},
  greeting: {fontSize: type.greeting, fontWeight: '300', lineHeight: 58},
  right: {flex: 1, justifyContent: 'center'},
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  section: {fontSize: type.section, fontWeight: '600', letterSpacing: 1},
  count: {fontSize: type.meta},
  footer: {fontSize: type.meta, marginTop: space.md, paddingHorizontal: space.xs},
});
