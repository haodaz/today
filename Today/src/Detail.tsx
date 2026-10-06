import React from 'react';
import {Image, Modal, StyleSheet, Text, View} from 'react-native';
import {palettes, type Daypart, type, space, safe} from './theme';
import type {Lang} from './i18n';
import {iconFor, isHers, needsCards} from './agent/guide';

const TIGER = require('../assets/today/today-tiger.png');

export type DetailProject = {
  id: string;
  title: string;
  forHer: boolean;
  waited: number | null;
  asked: string | null;
  steps: {text: string; note: string | null; done: boolean}[];
  guide?: {
    options: {name: string; facts: {k: string; v: string}[]; note?: string; source?: string}[];
    at: string;
  } | null;
};

export type DetailPayload = {
  title: string;
  note?: string | null;
  forHer?: boolean;
  project?: DetailProject | null;
  /** 记忆里和这件事沾边的几条。 */
  notes?: string[];
};

type Props = {
  payload: DetailPayload | null;
  daypart: Daypart;
  lang: Lang;
  onClose: () => void;
};

const T = {
  zh: {
    steps: '这件事是这么拆的',
    today: '今天这一步',
    done: '已经做掉的',
    waited: (d: number) => `搁了 ${d} 天`,
    asked: '我问过你，还没答',
    remembered: '我还记着',
    when: '什么时候做',
    close: '按返回键收起',
    guide: '我替你查到的',
    checked: '查过了，出门前再确认一次时间和价格',
    nothing: '这件事我只记着这一句。',
    hers: '这是你自己的事',
  },
  en: {
    steps: 'How this breaks down',
    today: "Today's step",
    done: 'Already done',
    waited: (d: number) => `Waiting ${d} days`,
    asked: "I asked you this, and you haven't said",
    remembered: 'I also remember',
    when: 'When it fits',
    close: 'Press back to close',
    guide: 'What I found for you',
    checked: 'Looked up — check times and prices again before you set out',
    nothing: "This is all I'm holding on this one.",
    hers: 'This one is yours',
  },
} as const;

/**
 * 按进去的那一层。
 *
 * 平时电视上只给今天这一步——整个拆解一次倒给她，就是把一件事变成四件
 * 压在她眼前。但她拿遥控器按进来，那是她开的口。推送和索取是两回事，
 * 这条线和「她问了就答」是同一条。
 *
 * 仍然没有数字。步骤带勾，但不写「2/4」，不画进度条——那玩意儿一出现，
 * 这块屏就从「我替你记着」变成「你还欠四分之二」。
 *
 * 全屏不是因为内容多，是因为三米外看。半屏的字到沙发上就没了。
 */
export function Detail({payload, daypart, lang, onClose}: Props) {
  const p = palettes[daypart];
  const x = T[lang];
  if (!payload) return null;

  const proj = payload.project;
  const next = proj?.steps.find(st => !st.done) ?? null;
  const done = proj?.steps.filter(st => st.done) ?? [];
  const rest = proj?.steps.filter(st => !st.done && st !== next) ?? [];
  const accent = payload.forHer || proj?.forHer ? p.warm : p.accent;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.root, {backgroundColor: p.sky[1]}]}>
        <View style={s.page}>
          {/* 左：这是什么事，以及它在你这儿放了多久 */}
          <View style={s.left}>
            <Image source={TIGER} style={s.tiger} resizeMode="contain" />
            <Text style={[s.title, {color: p.text}]} numberOfLines={4}>
              {payload.title}
            </Text>
            <View style={s.tags}>
              {payload.forHer || proj?.forHer ? (
                <Text style={[s.tag, {color: p.warm, borderColor: p.warm}]}>{x.hers}</Text>
              ) : null}
              {proj?.waited != null && proj.waited > 0 ? (
                <Text style={[s.tag, {color: p.textFaint, borderColor: p.border}]}>
                  {x.waited(proj.waited)}
                </Text>
              ) : null}
            </View>
            <Text style={[s.close, {color: p.textFaint}]}>{x.close}</Text>
          </View>

          {/* 右：它到底是怎么回事 */}
          <View style={s.right}>
            {next ? (
              <View style={[s.now, {borderLeftColor: accent}]}>
                <Text style={[s.head, {color: accent}]}>{x.today}</Text>
                <Text style={[s.nowText, {color: p.text}]} numberOfLines={2}>
                  {next.text}
                </Text>
                {next.note ? (
                  <Text style={[s.nowNote, {color: p.textFaint}]} numberOfLines={1}>
                    {next.note}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {proj?.asked && !next ? (
              <View style={[s.now, {borderLeftColor: accent}]}>
                <Text style={[s.head, {color: accent}]}>{x.asked}</Text>
                <Text style={[s.nowText, {color: p.text}]} numberOfLines={2}>
                  {proj.asked}
                </Text>
              </View>
            ) : null}

            {/* 查回来整理成的一张表。
                三米外看，所以是 key: value，不是段落——她要的是「几点、多少钱」
                这种一眼能对上的东西。判断不在这儿，在它跟她说的那段话里；
                这张表和那段话是同一件事的两种呈现，不是简版和详版。 */}
            {proj?.guide?.options.length ? (
              <View style={s.block}>
                <Text style={[s.head, {color: p.textSoft}]}>{x.guide}</Text>
                {proj.guide.options.slice(0, 3).map((o, i) => (
                  <View
                    key={i}
                    style={[
                      s.opt,
                      // 多个方案才给框。三米外，三段一模一样的字是一堵墙，
                      // 眼睛没有落点；一个方案的时候加框反而多余。
                      needsCards(proj.guide?.options) && {
                        backgroundColor: p.surface,
                        borderColor: p.border,
                        borderWidth: 1,
                        borderRadius: 14,
                        paddingHorizontal: space.md,
                        paddingVertical: space.sm,
                      },
                    ]}>
                    <Text style={[s.optName, {color: p.text}]} numberOfLines={1}>
                      {o.name}
                    </Text>
                    <View style={s.facts}>
                      {o.facts.slice(0, 4).map((f, j) => {
                        const ic = iconFor(f.k);
                        const mine = isHers(f.k);
                        return (
                          <Text
                            key={j}
                            style={[s.fact, {color: mine ? p.warm : p.text}]}
                            numberOfLines={1}>
                            {ic ? <Text style={s.ico}>{ic} </Text> : null}
                            <Text style={{color: mine ? p.warm : p.textFaint}}>
                              {f.k}{' '}
                            </Text>
                            {f.v}
                          </Text>
                        );
                      })}
                    </View>
                    {o.note ? (
                      <Text style={[s.optNote, {color: p.textFaint}]} numberOfLines={2}>
                        {o.note}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text style={[s.optNote, {color: p.textFaint, marginTop: space.xs}]}>
                  {x.checked}
                </Text>
              </View>
            ) : null}

            {rest.length ? (
              <View style={s.block}>
                <Text style={[s.head, {color: p.textSoft}]}>{x.steps}</Text>
                {rest.slice(0, 4).map((st, i) => (
                  <Text
                    key={i}
                    style={[s.line, {color: p.textSoft}]}
                    numberOfLines={1}>
                    {`·  ${st.text}`}
                  </Text>
                ))}
              </View>
            ) : null}

            {done.length ? (
              <View style={s.block}>
                <Text style={[s.head, {color: p.textFaint}]}>{x.done}</Text>
                {done.slice(0, 3).map((st, i) => (
                  <Text
                    key={i}
                    style={[s.line, s.struck, {color: p.textFaint}]}
                    numberOfLines={1}>
                    {`✓  ${st.text}`}
                  </Text>
                ))}
              </View>
            ) : null}

            {payload.note && !proj ? (
              <View style={s.block}>
                <Text style={[s.head, {color: p.textSoft}]}>{x.when}</Text>
                <Text style={[s.line, {color: p.text}]}>{payload.note}</Text>
              </View>
            ) : null}

            {payload.notes?.length ? (
              <View style={s.block}>
                <Text style={[s.head, {color: p.textFaint}]}>{x.remembered}</Text>
                {payload.notes.slice(0, 3).map((n, i) => (
                  <Text key={i} style={[s.line, {color: p.textFaint}]} numberOfLines={1}>
                    {n}
                  </Text>
                ))}
              </View>
            ) : null}

            {!proj && !payload.note && !payload.notes?.length ? (
              <Text style={[s.line, {color: p.textFaint}]}>{x.nothing}</Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {flex: 1},
  page: {flex: 1, flexDirection: 'row', paddingHorizontal: safe.h, paddingVertical: safe.v},
  left: {width: '38%', paddingRight: space.lg, paddingTop: space.sm},
  tiger: {width: 54, height: 74, marginBottom: space.sm},
  title: {fontSize: type.greeting, fontWeight: '300', lineHeight: 32},
  tags: {flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md},
  tag: {
    fontSize: type.meta, borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden',
  },
  close: {fontSize: type.meta, marginTop: space.lg},
  // 顶部对齐。内容多少不定，居中的话少的时候飘在半空，多的时候上下都溢。
  right: {flex: 1, paddingTop: space.sm},
  now: {paddingLeft: space.md, borderLeftWidth: 3, borderRadius: 1, marginBottom: space.md},
  nowText: {fontSize: type.task, lineHeight: 26, marginTop: 1},
  nowNote: {fontSize: type.meta, marginTop: 3},
  block: {marginBottom: space.md, paddingHorizontal: space.xs},
  head: {fontSize: type.meta, letterSpacing: 1, marginBottom: space.xs},
  line: {fontSize: type.meta + 2, lineHeight: 21},
  struck: {textDecorationLine: 'line-through'},
  opt: {marginBottom: space.sm},
  ico: {fontSize: type.meta},
  optName: {fontSize: type.meta + 4, fontWeight: '600'},
  // 事实横着排，一眼扫完。竖着列会把一屏吃光，而这屏还要放拆解。
  facts: {flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: 2},
  fact: {fontSize: type.meta + 1, lineHeight: 19},
  optNote: {fontSize: type.meta, lineHeight: 17, marginTop: 2},
});
