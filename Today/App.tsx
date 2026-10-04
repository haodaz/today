import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useKeepAwake} from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import {TaskRow} from './src/TaskRow';
import {daypartOf, palettes, safe, space, type} from './src/theme';
import {clockOf, dateLineOf, detectLang, t} from './src/i18n';
import type {Plan} from './src/agent/types';

/** 本机局域网地址。上线后换成公网域名。 */
const API = 'http://192.168.1.243:8910';

const EMPTY: Plan = {greeting: '', focus: [], later: []};

/** 二维码边长。1080p 的电视上这个尺寸隔几米也扫得动。 */
const QR = 260;

export default function App() {
  // 这块屏幕要全天亮着，不能让系统屏保把它盖掉
  useKeepAwake();

  const lang = useMemo(detectLang, []);
  const x = t(lang);

  const [now, setNow] = useState(new Date());
  const [plan, setPlan] = useState<Plan>(EMPTY);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(clock);
  }, []);

  // 手机那边说完话，这边自己就变了。
  // 轮询而不是推送：这块屏整天开着，五秒一次的代价可以忽略，
  // 换来的是没有连接状态要维护——断网恢复后自己就好了。
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(`${API}/plan`);
        if (!r.ok) return;
        const p = (await r.json()) as Plan;
        if (alive) setPlan(p);
      } catch {
        // 取不到就维持现状。不在屏幕上显示错误——
        // 一块陪着你的屏不该因为网络抖动就报警。
      }
    };
    pull();
    const id = setInterval(pull, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const daypart = daypartOf(now);
  const p = palettes[daypart];

  const toggle = async (id: string) => {
    // 先改本地，让按下去是即时的；再回写
    setPlan(pl => ({
      ...pl,
      focus: pl.focus.map(task =>
        task.id === id ? {...task, done: !task.done} : task,
      ),
    }));
    try {
      await fetch(`${API}/toggle`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
      });
    } catch {
      // 回写失败也不回滚：下次轮询会把真相带回来
    }
  };

  const left = plan.focus.filter(task => !task.done).length;
  const hasPlan = plan.focus.length > 0;

  return (
    <SafeAreaView style={[s.root, {backgroundColor: p.bg}]}>
      <StatusBar hidden />
      <View style={s.page}>
        {/* 左栏：时间和一句话。抬头一眼就看见，不用找。 */}
        <View style={s.left}>
          <Text style={[s.clock, {color: p.text}]}>{clockOf(now)}</Text>
          <Text style={[s.date, {color: p.textSoft}]}>
            {dateLineOf(now, lang)}
          </Text>
          <View style={[s.rule, {backgroundColor: p.border}]} />
          <Text style={[s.greeting, {color: p.textSoft}]}>
            {plan.greeting || x.empty}
          </Text>

          {/* 今天不做的事。
              列出来而不是藏起来——让人放心的不是清空列表，
              是知道什么被允许放下。所以它不可聚焦，也没有勾选框。 */}
          {plan.later.length > 0 ? (
            <View style={s.laterBlock}>
              <Text style={[s.laterHead, {color: p.textFaint}]}>
                {x.notToday}
              </Text>
              {plan.later.slice(0, 4).map((l, i) => (
                <Text
                  key={i}
                  style={[s.laterItem, {color: p.textFaint}]}
                  numberOfLines={1}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {/* 右栏：今天真正要做的几件 */}
        <View style={s.right}>
          {hasPlan ? (
            <>
              <View style={s.sectionHead}>
                <Text style={[s.section, {color: p.textSoft}]}>{x.today}</Text>
                <Text style={[s.count, {color: p.textFaint}]}>
                  {left === 0 ? x.allDone : x.leftN(left)}
                </Text>
              </View>

              {plan.focus.map((task, i) => (
                <TaskRow
                  key={task.id}
                  label={task.label}
                  note={task.note}
                  done={task.done}
                  forHer={task.forHer}
                  daypart={daypart}
                  autoFocus={i === 0}
                  onToggle={() => toggle(task.id)}
                />
              ))}

              <Text style={[s.footer, {color: p.textFaint}]}>
                {x.remoteHint}
              </Text>
            </>
          ) : (
            // 空的时候不写「暂无数据」。
            // 一块二维码，扫一下就能说话——
            // 没人该在手机上手敲一串 IP 地址，尤其是一个很累的人。
            <View style={s.empty}>
              <View style={[s.qrFrame, {backgroundColor: '#FFFFFF'}]}>
                <QRCode
                  value={API}
                  size={QR}
                  color="#1C1D1C"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={[s.scanHint, {color: p.textFaint}]}>
                {x.scanHint}
              </Text>
            </View>
          )}
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
  left: {width: '38%', justifyContent: 'center', paddingRight: space.lg},
  clock: {
    fontSize: type.clock,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: type.clock * 1.05,
  },
  date: {fontSize: type.section, marginTop: space.xs, letterSpacing: 0.5},
  rule: {height: 1, width: 72, marginVertical: space.md},
  greeting: {fontSize: type.greeting, fontWeight: '300', lineHeight: 56},
  laterBlock: {marginTop: space.xl},
  laterHead: {fontSize: type.meta, marginBottom: space.xs, letterSpacing: 1},
  laterItem: {fontSize: type.meta, lineHeight: 30},
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
  empty: {alignItems: 'center', justifyContent: 'center'},
  // 二维码必须有白底和留白才扫得动，哪怕整页背景是暖色或夜间深色
  qrFrame: {padding: space.md, borderRadius: 16},
  scanHint: {fontSize: type.section, marginTop: space.md, textAlign: 'center'},
});
