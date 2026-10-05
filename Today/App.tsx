import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Image, findNodeHandle, Pressable, SafeAreaView, StatusBar, StyleSheet, Text,
  View, useTVEventHandler,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useKeepAwake} from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import {TaskRow} from './src/TaskRow';
import {Detail, type DetailPayload} from './src/Detail';
import {daypartOf, palettes, safe, space, type} from './src/theme';
import {clockOf, dateLineOf, detectLang, t} from './src/i18n';
import {hint as wxHint, line as wxLine} from './src/agent/weather';
import type {Card, Turn} from './src/agent/types';

/**
 * 电视和服务在同一个局域网，所以它自己走内网——不绕公网，断网也不影响。
 * 但二维码必须给公网地址：手机要能在外面用，而且页面内录音需要 HTTPS
 * （iOS Safari 只在安全上下文下给麦克风权限）。
 * 隧道地址每次重启会变，所以不写死，向服务端要。
 */
const API = 'http://192.168.1.243:8910';

/** 二维码边长。1080p 的电视上这个尺寸隔几米也扫得动。 */
const QR = 160;

const EMPTY: Turn = {say: '', cards: []};

/** 捧心的小老虎。它捧着的就是她交给它的事。 */
const TIGER = require('./assets/today/today-tiger.png');

/**
 * 「今天不做」里的一行。
 *
 * 和任务行同样的问题：右键是用来按进去的，但焦点引擎会先把焦点挪走，
 * 处理器读到的就是下一件事。所以这里也把向右钉死在自己身上。
 */
function LaterRow({
  label, accent, faint, show, onFocusIn, onOpen,
}: {
  label: string;
  accent: string;
  faint: string;
  show: boolean;
  onFocusIn: () => void;
  onOpen: () => void;
}) {
  const box = useRef<View | null>(null);
  const [self, setSelf] = useState<number | null>(null);
  useEffect(() => {
    const h = findNodeHandle(box.current);
    if (h != null) setSelf(h);
  }, []);
  return (
    <Pressable
      ref={box}
      nextFocusRight={self ?? undefined}
      onFocus={onFocusIn}
      onPress={onOpen}>
      {({focused}) => (
        <Text
          style={[s.smallItem, {color: focused ? accent : faint}]}
          numberOfLines={1}>
          {focused && show ? `${label}  \u203a` : label}
        </Text>
      )}
    </Pressable>
  );
}

export default function App() {
  // 这块屏幕要全天亮着，不能让系统屏保把它盖掉
  useKeepAwake();

  const deviceLang = useMemo(detectLang, []);
  // 语言跟着内容走：Today 说中文时界面也该是中文，
  // 否则「I also remember」底下跟着一串中文，像两个人在说话
  const [lang, setLang] = useState(deviceLang);
  const x = t(lang);

  /** 焦点停在哪一件事上。右键要开谁的详情，全靠它。 */
  const [focus, setFocus] = useState<DetailPayload | null>(null);
  const [open, setOpen] = useState<DetailPayload | null>(null);

  const [now, setNow] = useState(new Date());
  const [turn, setTurn] = useState<Turn>(EMPTY);
  /** 手机要扫的地址。拿不到公网地址就退回内网，至少在家里能用。 */
  const [scanUrl, setScanUrl] = useState(API);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(clock);
  }, []);

  /**
   * 右方向键按进一件事。
   *
   * 中间键是打勾，不能抢。列表是竖的，右边本来没东西，所以右键空着——
   * 而且在 Android TV 上「往右钻进去」是惯例，不用教。
   * 收起走返回键，Modal 的 onRequestClose 已经接住了。
   */
  useTVEventHandler(evt => {
    if (evt?.eventType === 'right' && focus && !open && hasDepth(focus)) setOpen(focus);
  });

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
        if (!alive) return;
        setTurn(next);
        const body =
          next.say +
          next.cards.flatMap(c =>
            c.type === 'tasks' ? c.items.map(i => i.label) :
            c.type === 'later' ? c.items :
            c.type === 'memory' ? c.items.map(i => i.text) : [c.text],
          ).join('');
        // 她在手机上挑过就听她的；没挑过才看内容猜。
        // 录 demo 要全程英文时，这是唯一不用重装 APK 的开关。
        if (next.lang === 'zh' || next.lang === 'en') setLang(next.lang);
        else if (/[\u4e00-\u9fa5]/.test(body)) setLang('zh');
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
  const step = turn.step;

  /**
   * 一行字对应到哪件在推的事。
   *
   * 模型写的标题和卡片上的字不会完全一样（「给Coco办保险」/「保险」），
   * 所以去掉标点空格之后互相包含就算对上。对不上也没关系——
   * 那就是一件普通的事，详情里给它的时机和归属就够了。
   */
  const projects = turn.projects ?? [];
  const tidy = (v: string) => v.replace(/[\s·,.，。、:：]/g, '').toLowerCase();
  const detailFor = (label: string, note?: string, forHer?: boolean): DetailPayload => {
    const a = tidy(label);
    const hit =
      projects.find(q => tidy(q.title) === a) ??
      projects.find(q => tidy(q.title).includes(a) || a.includes(tidy(q.title))) ??
      null;
    return {title: label, note: note ?? null, forHer: forHer ?? hit?.forHer, project: hit};
  };

  /**
   * 这一行按进去有没有东西。
   *
   * 只有时机那一句的，不算——那句在行上已经写着了，再铺一整屏去放它
   * 是在许一个空的承诺。箭头只出现在真有内容的行上，于是箭头本身就是说明。
   */
  const hasDepth = (d: DetailPayload) =>
    !!(d.project?.steps.length || d.project?.asked || d.notes?.length);
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
    <LinearGradient
      colors={p.sky}
      locations={[0, 0.52, 1]}
      start={{x: 0.15, y: 0}}
      end={{x: 0.85, y: 1}}
      style={s.root}>
      <SafeAreaView style={s.root}>
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

          {/* 天气。酒店大堂那块板子上第一样东西就是它，出门前那一眼要的也是它。
              只给一行：几度到几度。下面那句提示只在真会改变她出门动作时才有
              （要带伞、要加衣服），晴天二十度它自己会闭嘴。 */}
          {turn.weather ? (
            <View style={s.wx}>
              <Text style={[s.wxLine, {color: p.textSoft}]}>
                {wxLine(turn.weather, lang === 'zh')}
              </Text>
              {wxHint(turn.weather, lang === 'zh') ? (
                <Text style={[s.wxHint, {color: p.warm}]} numberOfLines={1}>
                  {wxHint(turn.weather, lang === 'zh')}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={[s.rule, {backgroundColor: p.border}]} />

          {/* Today 本人。它说的话紧跟在它下面——
              这块屏上最重要的不是清单，是有人在替你记着。 */}
          <View style={s.voice}>
            <Image source={TIGER} style={s.tiger} resizeMode="contain" />
            {/* 四行封顶。模型输出的长度不可控，界面不能指望它守规矩——
                溢出会把下面的内容顶出屏幕。 */}
            <Text style={[s.say, {color: p.text}]} numberOfLines={3}>
              {turn.say || x.empty}
            </Text>
          </View>

          {/* 「接」：今天替她推的那一步。
              一天一步，拆出来的其余几步收着不给看——
              她能看见「保险 2/4」的那一刻，这就成了又一个要维护的看板。
              放左栏是因为这是 Today 自己在办的事，和它说的话是一回事；
              右栏那边高度不可控，加东西会把卡片顶出屏幕。 */}
          {step?.text ? (
            <View
              style={[
                s.stepBlock,
                {borderLeftColor: step.forHer ? p.warm : p.accent},
              ]}>
              <Text style={[s.smallHead, {color: step.forHer ? p.warm : p.accent}]}>
                {step.forHer ? x.oneStepHers : x.oneStep}
              </Text>
              <Text style={[s.stepText, {color: p.text}]} numberOfLines={2}>
                {step.text}
              </Text>
              {step.note ? (
                <Text style={[s.stepNote, {color: p.textFaint}]} numberOfLines={1}>
                  {step.note}
                </Text>
              ) : null}
            </View>
          ) : null}

          {later?.type === 'later' ? (
            <View style={s.laterBlock}>
              <Text style={[s.smallHead, {color: p.textFaint}]}>
                {x.notToday}
              </Text>
              {/* 三条，不是四条——上面那一步要地方，而「今天不做」
                  是这块屏上最不紧要的一块。 */}
              {/* 这几条多半就是在推的大事。它们在这儿看着最不起眼，
                  但按进去是内容最多的——所以也要能聚焦。 */}
              {later.items.slice(0, 3).map((l, i) => (
                <LaterRow
                  key={i}
                  label={l}
                  accent={p.accent}
                  faint={p.textFaint}
                  show={hasDepth(detailFor(l))}
                  onFocusIn={() => setFocus(detailFor(l))}
                  onOpen={() => {
                    const d = detailFor(l);
                    if (hasDepth(d)) setOpen(d);
                  }}
                />
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
                  onFocusIn={() =>
                    setFocus(detailFor(task.label, task.note, task.forHer))
                  }
                  hasMore={hasDepth(detailFor(task.label, task.note, task.forHer))}
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

      {/* 按进去的那一层。平时不在，她按右键才铺开。 */}
      <Detail
        payload={open}
        daypart={daypart}
        lang={lang}
        onClose={() => setOpen(null)}
      />
      </SafeAreaView>
    </LinearGradient>
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
  rule: {height: 1, width: 44, marginVertical: space.sm},
  wx: {marginTop: space.xs},
  wxLine: {fontSize: type.section, letterSpacing: 0.3},
  wxHint: {fontSize: type.meta, marginTop: 1},
  // 老虎在话的上面，不在旁边——并排会把文字挤窄，一句话从三行变五行，
  // 整列就撑出屏幕了。而且先看见它、再听见它说话，顺序也对。
  voice: {alignItems: 'flex-start'},
  // 不要太大。它是陪着的，不是主角；主角是她今天要过的日子。
  tiger: {width: 62, height: 86, marginBottom: space.xs},
  say: {flexShrink: 1, fontSize: type.greeting, fontWeight: '300', lineHeight: 34},
  // 左边一道竖线，三米外也看得出这是一块独立的东西，
  // 而且比加标题框省垂直空间——左栏只剩八十来 dp。
  stepBlock: {
    marginTop: space.sm,
    paddingLeft: space.md,
    borderLeftWidth: 3,
    borderRadius: 1,
  },
  stepText: {fontSize: type.task, lineHeight: 26, marginTop: 1},
  stepNote: {fontSize: type.meta, marginTop: 3},
  laterBlock: {marginTop: space.sm, paddingBottom: space.xs},
  memBlock: {marginTop: space.md, paddingHorizontal: space.xs},
  smallHead: {fontSize: type.meta, marginBottom: space.xs, letterSpacing: 1},
  smallItem: {fontSize: type.meta, lineHeight: 18},
  // 右栏的高度不可控（卡片数 + 记忆条数），居中会上下同时溢出。
  // 顶部对齐 + 内容自行收缩。
  right: {flex: 1, justifyContent: 'center', paddingVertical: space.xs},
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
  qrFrame: {padding: space.md, borderRadius: 20},
  scanHint: {fontSize: type.section, marginTop: space.md, textAlign: 'center'},
});
