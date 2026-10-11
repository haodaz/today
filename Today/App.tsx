import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Image, findNodeHandle, Pressable, SafeAreaView, StatusBar, StyleSheet, Text,
  View, useTVEventHandler, useWindowDimensions,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useKeepAwake} from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';
import {TaskRow} from './src/TaskRow';
import {Detail, type DetailPayload} from './src/Detail';
import {daypartOf, palettes, POSE_ASPECT, poseOf, safe, sceneOf, space, type} from './src/theme';
import {clockOf, dateLineOf, detectLang, t} from './src/i18n';
import {hint as wxHint, line as wxLine} from './src/agent/weather';
import type {Card, Turn} from './src/agent/types';

/**
 * 电视和服务在同一个局域网，所以它自己走内网——不绕公网，断网也不影响。
 * 但二维码必须给公网地址：手机要能在外面用，而且页面内录音需要 HTTPS
 * （iOS Safari 只在安全上下文下给麦克风权限）。
 * 隧道地址每次重启会变，所以不写死，向服务端要。
 *
 * 内网地址也不写死了——见 src/api.ts：路由器重启换个号就能自己找回来，
 * 不用重新打包。
 */
import {apiNow, DEFAULT_API, forgetApi, resolveApi} from './src/api';

/**
 * 左边那扇窗有多宽。960 dp 宽的屏，四成给窗——景色要有地方，
 * 右边家里的事也不必拉满一整排，留白是给眼睛的。和网页版 #scene 一样。
 */
const SCENE_W = 392;

/** 二维码边长。1080p 的电视上这个尺寸隔几米也扫得动。 */
const QR = 160;

const EMPTY: Turn = {say: '', cards: []};

/** 捧心的小老虎。它捧着的就是她交给它的事。 */
const TIGER = require('./assets/today/today-tiger.png');

/**
 * 一段话里能放上大屏的那一点点。
 *
 * 取头一两句，断在句读上。电视不是用来读长文的——那段完整的话在手机上，
 * 查回来的事实表按右键就能看。所以这里宁可少给，也不要留一个半截的词。
 */
function glance(say: string, max = 108): string {
  const t = (say ?? '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf('。'), cut.lastIndexOf('. '),
    cut.lastIndexOf('！'), cut.lastIndexOf('? '), cut.lastIndexOf('？'),
  );
  if (end > max * 0.4) return cut.slice(0, end + 1).trim();
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

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
  const {height} = useWindowDimensions();

  /** 焦点停在哪一件事上。右键要开谁的详情，全靠它。 */
  const [focus, setFocus] = useState<DetailPayload | null>(null);
  const [open, setOpen] = useState<DetailPayload | null>(null);

  const [now, setNow] = useState(new Date());
  const [turn, setTurn] = useState<Turn>(EMPTY);
  /** 手机要扫的地址。拿不到公网地址就退回内网，至少在家里能用。 */
  const [scanUrl, setScanUrl] = useState(DEFAULT_API);
  /** 服务的内网地址。找到之前先用默认的，找到了就换过来。 */
  const [api, setApi] = useState(DEFAULT_API);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(clock);
  }, []);

  // 开机先把服务找出来。默认地址通的话这一步几十毫秒就过了。
  useEffect(() => {
    let alive = true;
    resolveApi().then(url => alive && setApi(url));
    return () => { alive = false; };
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
    // 连着取不到就说明地址变了（路由器重启换了号），重新去找一遍。
    // 一次两次不算——网络抖一下很正常，不该为此扫整个网段。
    let misses = 0;
    const pull = async () => {
      try {
        const r = await fetch(`${apiNow()}/turn`);
        if (!r.ok) return;
        const next = (await r.json()) as Turn;
        if (!alive) return;
        misses = 0;
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
        if (++misses === 4 && alive) {
          forgetApi();
          resolveApi().then(url => alive && setApi(url));
        }
      }
    };
    pull();
    fetch(`${apiNow()}/where`)
      .then(r => r.json())
      .then(d => d?.url && alive && setScanUrl(d.url))
      .catch(() => {});
    const id = setInterval(pull, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // 跟着 api 走：找到新地址之后立刻从头拉一次，不用再等五秒。
  }, [api]);

  const daypart = daypartOf(now);
  const p = palettes[daypart];

  /**
   * 窗景。从服务端取，这样换画不用重新打包。
   * 取不到（服务端没这张、网断了）就记下这个地址不再试，退回底下那层渐变——
   * 一块屏宁可朴素，也不能留一个破图标在客厅里。
   */
  const artUrl = `${api}/art/${sceneOf(daypart, turn.weather?.kind)}.jpg`;

  /**
   * 这一行说的是谁。只认名字——「Sign Stelle's conference form」里有 Stelle，就是她。
   * 「给你自己的」那种不挂头像：那件已经有杏色那道边了，再挂一张脸是重复。
   * 不猜：名字没出现就不挂，宁可空着也不挂错人。
   */
  const family = turn.family ?? [];
  const whoIn = (label: string) => {
    const hit = family.find(f =>
      new RegExp(`\\b${f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(label),
    );
    return hit
      ? {uri: `${api}/art/avatar-${hit.avatar}.jpg`, color: hit.color, name: hit.name}
      : undefined;
  };
  const [artBad, setArtBad] = useState<string | null>(null);
  const showArt = artBad !== artUrl;

  // 老虎跟着窗外换姿势。取不到就是原来那只——它本来就在包里。
  const pose = poseOf(daypart, turn.weather?.kind);
  const poseUrl = pose ? `${api}/art/tiger-${pose}.png` : null;
  const [poseBad, setPoseBad] = useState<string | null>(null);
  const usePose = pose && poseUrl && poseBad !== poseUrl ? pose : null;

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
    !!(
      d.project?.steps.length ||
      d.project?.asked ||
      d.project?.guide?.options.length ||   // 只有一张查回来的表也算有内容
      d.notes?.length
    );
  const left = items.filter(i => !i.done).length;
  // 右栏空着时会改摆「还在推着的」，那时候左边别把同样的三行再列一遍。
  const carrying = items.length === 0 && (turn.projects?.length ?? 0) > 0;
  const laterShown = (() => {
    const all = later?.type === 'later' ? later.items : [];
    if (!carrying) return all;
    const shown = new Set(
      (turn.projects ?? []).slice(0, 3).map(q => q.title.trim().toLowerCase()),
    );
    return all.filter(l => !shown.has(String(l).trim().toLowerCase()));
  })();

  /** 家里人那一排。标题行右边，不占额外高度；垫一块底，压在窗框上也读得清。 */
  const faces = family.length ? (
    <View style={[s.faces, {backgroundColor: p.surface, borderColor: p.border}]}>
      {family.slice(0, 6).map(f => (
        <View key={f.name} style={s.fam}>
          <Image
            source={{uri: `${api}/art/avatar-${f.avatar}.jpg`}}
            style={[s.face, {borderColor: f.color}]}
          />
          <Text style={[s.famName, {color: p.textSoft}]}>{f.name}</Text>
        </View>
      ))}
    </View>
  ) : null;

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
      await fetch(`${apiNow()}/toggle`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
      });
    } catch {
      // 回写失败也不回滚：下次轮询会把真相带回来
    }
  };

  /**
   * 左右两区。
   *
   * 左边是一扇窗：时辰、天气、在哪儿，都在这里面；老虎也住在里面，
   * 它说的那句话做成一个小气泡跟着它——话是它说的，就跟着它。
   * 右边是家里的事：谁、今天这一步、今天的事、还在推的、记着的。
   *
   * 以前整块屏铺一张画、所有字压在上面，景色被盖住了，字也难读。
   * 现在各占各的地方：景色完整露出来，字落在干净的底上。
   */
  const winH = height;
  const artW = Math.round(winH * 16 / 9);
  // 窗在画的右半边。往右对齐，窄条里露出来的就是窗和窗台（和网页版 background-position 一样）。
  // 不对齐到最右：画里雨天那把伞靠在窗框右边，露出来会和老虎手里那把撞在一起。
  const artLeft = -Math.round((artW - SCENE_W) * 0.62);
  const bigH = 178;
  const bigW = Math.round(bigH * (usePose ? POSE_ASPECT[usePose] : 413 / 572));

  return (
    <LinearGradient
      colors={p.sky}
      locations={[0, 0.52, 1]}
      start={{x: 0.15, y: 0}}
      end={{x: 0.85, y: 1}}
      style={s.root}>
      <SafeAreaView style={s.root}>
      <StatusBar hidden />
      <View style={s.zones}>
        {/* ── 左：一扇窗 ── */}
        <View style={[s.scene, {width: SCENE_W, backgroundColor: p.sky[1]}]}>
          {showArt ? (
            <Image
              source={{uri: artUrl}}
              style={{position: 'absolute', top: 0, height: winH, width: artW, left: artLeft}}
              resizeMode="cover"
              onError={() => setArtBad(artUrl)}
            />
          ) : null}
          {/* 上面压一点墙色给时钟，下面压一点给气泡；中间整块留给窗 */}
          <LinearGradient
            colors={[p.veil[0], p.veil[1], p.veil[2], 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', p.veil[2]]}
            locations={[0, 0.33, 0.42, 0.52, 0.64, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={s.sceneTop}>
            <Text style={[s.clock, {color: p.text}]}>{clockOf(now)}</Text>
            <Text style={[s.date, {color: p.textSoft}]}>{dateLineOf(now, lang)}</Text>
            {/* 天气。只给一行：几度到几度。下面那句只在真会改变她出门动作时才有
                （带伞、加衣服），晴天二十度它自己会闭嘴。 */}
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
          </View>
          <View style={s.sceneBottom}>
            <Image
              source={usePose ? {uri: poseUrl!} : TIGER}
              style={{width: bigW, height: bigH}}
              resizeMode="contain"
              onError={() => poseUrl && setPoseBad(poseUrl)}
            />
            {/* 它说的话。电视不是用来读长文的——只取开头一两句，完整的在手机上。
                五行封顶：模型输出的长度不可控，界面不能指望它守规矩。 */}
            <View style={[s.bubble, {backgroundColor: p.surface, borderColor: p.border, shadowColor: p.shadow}]}>
              <Text style={[s.say, {color: p.text}]} numberOfLines={5}>
                {glance(turn.say) || x.empty}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 右：家里的事 ── */}
        <View style={s.family}>
          {faces ? <View style={s.facesRow}>{faces}</View> : null}

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
                  who={task.forHer ? undefined : whoIn(task.label)}
                />
              ))}

            </>
          ) : projects.length ? (
            /* 今天还没理，但手上并不是空的。
               早上第一眼只给一块二维码，等于把昨天推着的事全藏起来了，
               而那恰恰是她起床时最该看见的东西。所以先把在推的摆出来，
               二维码缩到底下——扫码是一次性的动作，不该占着整块屏。 */
            <>
              <View style={s.cardHead}>
                <Text style={[s.section, {color: p.textSoft}]}>{x.carrying}</Text>
              </View>
              {projects.slice(0, 3).map((q, i) => (
                <TaskRow
                  key={q.id}
                  label={q.title}
                  note={q.steps.find(st => !st.done)?.text ?? q.asked ?? undefined}
                  done={false}
                  forHer={q.forHer}
                  daypart={daypart}
                  autoFocus={i === 0}
                  onToggle={() => setOpen(detailFor(q.title))}
                  onFocusIn={() => setFocus(detailFor(q.title))}
                  hasMore={hasDepth(detailFor(q.title))}
                  noTick
                  who={q.forHer ? undefined : whoIn(q.title)}
                />
              ))}
              <View style={[s.tuck, {backgroundColor: p.surface, borderColor: p.border}]}>
                <View style={[s.qrSmall, {backgroundColor: '#FFFFFF'}]}>
                  <QRCode value={scanUrl} size={52} color="#1C1D1C" backgroundColor="#FFFFFF" />
                </View>
                <Text style={[s.smallItem, {color: p.textFaint, flex: 1}]}>
                  {x.scanHint}
                </Text>
              </View>
            </>
          ) : (
            // 真的什么都没有的时候才给整块二维码。
            // 不写「暂无数据」——扫一下就能说话，
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

          {/* 今天不做。标题和条目并成一行，竖排：电视上上下键移动、右键按进去。
              右栏已经在摆「还在推着的」时，同一件事不再列一遍（laterShown 去过重）。 */}
          {later?.type === 'later' && laterShown.length ? (
            <View style={s.laterBlock}>
              <Text style={[s.smallHead, s.laterHead, {color: p.textFaint}]}>
                {x.notToday}
              </Text>
              <View style={s.laterList}>
                {laterShown.slice(0, 3).map((l, i) => (
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
            </View>
          ) : null}

          {/* Today 记着的。她得看得见它记住了什么，才谈得上信任。 */}
          {items.length > 0 ? (
            memory?.type === 'memory' ? (
              <View style={[s.memBlock, {backgroundColor: p.surface, borderColor: p.border}]}>
                <Text style={[s.smallHead, {color: p.textFaint}]}>{x.iRemember}</Text>
                {/* 右区一屏就这么高：卡片满三张的时候只留两行 */}
                {memory.items.slice(0, items.length >= 3 ? 2 : 3).map(m => (
                  <Text key={m.id} style={[s.smallItem, {color: p.textFaint}]} numberOfLines={1}>
                    {m.text}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={[s.footer, {color: p.textFaint}]}>{x.remoteHint}</Text>
            )
          ) : null}
        </View>
      </View>

      {/* 按进去的那一层。平时不在，她按右键才铺开。 */}
      <Detail
        payload={open}
        art={showArt ? artUrl : undefined}
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
  zones: {flex: 1, flexDirection: 'row'},
  scene: {overflow: 'hidden'},
  sceneTop: {position: 'absolute', left: safe.h, top: safe.v, right: 24},
  sceneBottom: {position: 'absolute', left: 28, right: 22, bottom: 14,
    flexDirection: 'row', alignItems: 'flex-end'},
  // 气泡：它说的话。尾巴朝左下，指着老虎
  bubble: {flex: 1, marginLeft: space.sm, marginBottom: 96, paddingVertical: 9, paddingHorizontal: 13,
    borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1,
    shadowOpacity: 1, shadowRadius: 18, shadowOffset: {width: 0, height: 6}, elevation: 4},
  family: {flex: 1, paddingTop: 20, paddingBottom: 24, paddingLeft: 34, paddingRight: safe.h},
  facesRow: {flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6},
  clock: {
    fontSize: type.clock,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: type.clock * 1.05,
  },
  date: {fontSize: type.section, marginTop: space.xs, letterSpacing: 0.5},
  wx: {marginTop: space.xs},
  wxLine: {fontSize: type.section, letterSpacing: 0.3},
  wxHint: {fontSize: type.meta, marginTop: 1},
  say: {fontSize: 16, lineHeight: 22},
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
  laterBlock: {flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xs,
    paddingHorizontal: space.xs},
  laterHead: {marginRight: space.md, marginBottom: 0, lineHeight: 18},
  laterList: {flex: 1},
  memBlock: {marginTop: space.md, paddingVertical: space.sm, paddingHorizontal: space.md,
    borderRadius: 12, borderWidth: 1},
  smallHead: {fontSize: type.meta, marginBottom: space.xs, letterSpacing: 1},
  smallItem: {fontSize: type.meta, lineHeight: 18},
  // 右栏的高度不可控（卡片数 + 记忆条数），居中会上下同时溢出。
  // 顶部对齐 + 内容自行收缩。
  right: {paddingVertical: space.xs},
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: space.md,
    borderRadius: 999,
    borderWidth: 1,
  },
  fam: {flexDirection: 'row', alignItems: 'center', marginLeft: space.sm},
  face: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginRight: 4},
  famName: {fontSize: type.meta},
  section: {fontSize: type.section, fontWeight: '600', letterSpacing: 1},
  count: {fontSize: type.meta},
  footer: {fontSize: type.meta, marginTop: space.md, paddingHorizontal: space.xs},
  empty: {alignItems: 'center', justifyContent: 'center'},
  // 二维码必须有白底和留白才扫得动，哪怕整页背景是暖色或夜间深色
  qrFrame: {padding: space.md, borderRadius: 20},
  // 二维码缩到底下：扫码是一次性动作，不该占着整块屏
  // 和「我记着的」一样垫一块底：窗台和盆栽就在它后面，字压上去读不出来
  tuck: {flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs,
    padding: 6, paddingRight: space.lg, borderRadius: 14, borderWidth: 1},
  qrSmall: {padding: 5, borderRadius: 9},
  scanHint: {fontSize: type.section, marginTop: space.md, textAlign: 'center'},
});
