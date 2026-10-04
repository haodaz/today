import React, {useEffect, useMemo, useState} from 'react';
import {Image, SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';
import {useKeepAwake} from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import {TaskRow} from './src/TaskRow';
import {daypartOf, palettes, safe, space, type} from './src/theme';
import {clockOf, dateLineOf, detectLang, t} from './src/i18n';
import type {Card, Turn} from './src/agent/types';

/**
 * 电视和服务在同一个局域网，所以它自己走内网——不绕公网，断网也不影响。
 * 但二维码必须给公网地址：手机要能在外面用，而且页面内录音需要 HTTPS
 * （iOS Safari 只在安全上下文下给麦克风权限）。
 * 隧道地址每次重启会变，所以不写死，向服务端要。
 */
const API = 'http://192.168.1.243:8910';

/** 二维码边长。1080p 的电视上这个尺寸隔几米也扫得动。 */
const QR = 260;

const EMPTY: Turn = {say: '', cards: []};

/** 捧心的小老虎。它捧着的就是她交给它的事。 */
const TIGER = require('./assets/today/today-holding.png');

export default function App() {
  // 这块屏幕要全天亮着，不能让系统屏保把它盖掉
  useKeepAwake();

  const lang = useMemo(detectLang, []);
  const x = t(lang);

  const [now, setNow] = useState(new Date());
  const [turn, setTurn] = useState<Turn>(EMPTY);
  /** 手机要扫的地址。拿不到公网地址就退回内网，至少在家里能用。 */
  const [scanUrl, setScanUrl] = useState(API);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(clock);
  }, []);

  // 手机那边说完话，这边自己就变。
  // 轮询而不是推送：这块屏整天开着，五秒一次的代价可以忽略，
  // 换来的是没有连接状态要维护——断网恢复后自己就好了。
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch(`${API}/turn`);
        if (!r.ok) return;
        const next = (await r.json()) as Turn;
        if (alive) setTurn(next);
      } catch {
        // 取不到就维持现状。不在屏幕上报错——
        // 一块陪着你的屏不该因为网络抖动就报警。
      }
    };
    pull();
    fetch(`${API}/where`)
      .then(r => r.json())
      .then(d => d?.url && alive && setScanUrl(d.url))
      .catch(() => {});
    const id = setInterval(pull, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const daypart = daypartOf(now);
  const p = palettes[daypart];

  const tasks = turn.cards.find(c => c.type === 'tasks');
  const later = turn.cards.find(c => c.type === 'later');
  const memory = turn.cards.find(c => c.type === 'memory');
  const items = tasks?.type === 'tasks' ? tasks.items : [];
  const left = items.filter(i => !i.done).length;

  const toggle = async (id: string) => {
    // 先改本地，让按下去是即时的；再回写
    setTurn(cur => ({
      ...cur,
      cards: cur.cards.map(c =>
        c.type === 'tasks'
          ? {
              ...c,
              items: c.items.map(i =>
                i.id === id ? {...i, done: !i.done} : i,
              ),
            }
          : c,
      ) as Card[],
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

  return (
    <SafeAreaView style={[s.root, {backgroundColor: p.bg}]}>
      <StatusBar hidden />
      <View style={s.page}>
        {/* 左栏：时间，和 Today 说的话。
            它说的话是第一人称，所以给它最大的字号——
            这块屏上最重要的不是清单，是有人在替你记着。 */}
        <View style={s.left}>
          <Text style={[s.clock, {color: p.text}]}>{clockOf(now)}</Text>
          <Text style={[s.date, {color: p.textSoft}]}>
            {dateLineOf(now, lang)}
          </Text>
          <View style={[s.rule, {backgroundColor: p.border}]} />

          {/* Today 本人。它说的话紧跟在它下面——
              这块屏上最重要的不是清单，是有人在替你记着。 */}
          <View style={s.voice}>
            <Image source={TIGER} style={s.tiger} resizeMode="contain" />
            <Text style={[s.say, {color: p.text}]}>{turn.say || x.empty}</Text>
          </View>

          {later?.type === 'later' ? (
            <View style={s.laterBlock}>
              <Text style={[s.smallHead, {color: p.textFaint}]}>
                {x.notToday}
              </Text>
              {later.items.slice(0, 4).map((l, i) => (
                <Text
                  key={i}
                  style={[s.smallItem, {color: p.textFaint}]}
                  numberOfLines={1}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {/* 右栏：卡片。结构化的东西走卡片，不塞进对话里让人去读。 */}
        <View style={s.right}>
          {items.length > 0 ? (
            <>
              <View style={s.cardHead}>
                <Text style={[s.section, {color: p.textSoft}]}>{x.today}</Text>
                <Text style={[s.count, {color: p.textFaint}]}>
                  {left === 0 ? x.allDone : x.leftN(left)}
                </Text>
              </View>

              {items.map((task, i) => (
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

              {/* Today 记着的。她得看得见它记住了什么，才谈得上信任。 */}
              {memory?.type === 'memory' ? (
                <View style={s.memBlock}>
                  <Text style={[s.smallHead, {color: p.textFaint}]}>
                    {x.iRemember}
                  </Text>
                  {memory.items.slice(0, 3).map(m => (
                    <Text
                      key={m.id}
                      style={[s.smallItem, {color: p.textFaint}]}
                      numberOfLines={1}>
                      {m.text}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={[s.footer, {color: p.textFaint}]}>
                  {x.remoteHint}
                </Text>
              )}
            </>
          ) : (
            // 空的时候不写「暂无数据」。
            // 一块二维码，扫一下就能说话——
            // 没人该在手机上手敲一串 IP 地址，尤其是一个很累的人。
            <View style={s.empty}>
              <View style={[s.qrFrame, {backgroundColor: '#FFFFFF'}]}>
                <QRCode
                  value={scanUrl}
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
  // 内容比容器高时，居中会上下同时溢出——时间会被切掉顶。
  // 改成顶部对齐，并给整列留出余量。
  // 那句话是模型生成的，长度不可控，所以左栏不能靠固定间距硬凑。
  // say 设成可伸缩，长了自己占空间，短了把「今天不做」往上收。
  left: {width: '38%', paddingRight: space.lg, paddingTop: space.sm},
  clock: {
    fontSize: type.clock,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: type.clock * 1.05,
  },
  date: {fontSize: type.section, marginTop: space.xs, letterSpacing: 0.5},
  rule: {height: 1, width: 72, marginVertical: space.sm},
  // 老虎在话的上面，不在旁边——并排会把文字挤窄，一句话从三行变五行，
  // 整列就撑出屏幕了。而且先看见它、再听见它说话，顺序也对。
  voice: {alignItems: 'flex-start'},
  // 不要太大。它是陪着的，不是主角；主角是她今天要过的日子。
  tiger: {width: 84, height: 80, marginBottom: space.xs},
  say: {flexShrink: 1, fontSize: type.greeting, fontWeight: '300', lineHeight: 52},
  laterBlock: {marginTop: space.md, paddingBottom: space.sm},
  memBlock: {marginTop: space.lg, paddingHorizontal: space.xs},
  smallHead: {fontSize: type.meta, marginBottom: space.xs, letterSpacing: 1},
  smallItem: {fontSize: type.meta, lineHeight: 30},
  right: {flex: 1, justifyContent: 'center'},
  cardHead: {
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
