#!/usr/bin/env node
/**
 * Today 的本地服务。
 *
 * 过渡实现，形状和最终的 AWS 版本一致：
 *   手机 POST /braindump → agent → 存当天 + 更新记忆
 *   电视 GET  /turn      → 取 Today 这次开口（一句话 + 卡片）
 *   电视 POST /toggle    → 勾选回写
 *        GET  /memory    → Today 记着什么
 *
 * 换成 API Gateway + Lambda + Bedrock + DynamoDB 时这几个端点不变。
 *
 *   node server/index.mjs
 */
import {createServer} from 'node:http';
import {readFileSync, writeFileSync, existsSync, mkdirSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMessages, buildGreeting} from '../src/agent/prompt.js';
import {converseJSON, DEFAULT_MODEL as BEDROCK_DEFAULT} from './bedrock.mjs';
import {merge as mergeMem, forDisplay, count as memCount, EMPTY as EMPTY_MEM} from '../src/agent/memory.js';
import * as Proj from '../src/agent/projects.js';
import * as Ppl from '../src/agent/people.js';
import * as Wx from '../src/agent/weather.js';
import * as Web from '../src/agent/search.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/**
 * 数据目录。默认 .data，可以用 TODAY_DATA 换一个。
 *
 * 做公开素材（落地页截图、demo 视频）时必须换：
 * 截图里的内容本身就是家庭数据，跟有没有拍到房间是两回事。
 * 演示跑在虚构档案上，她日常那份一个字节都不碰。
 */
const DATA = process.env.TODAY_DATA
  ? (process.env.TODAY_DATA.startsWith('/')
      ? process.env.TODAY_DATA
      : join(ROOT, process.env.TODAY_DATA))
  : join(ROOT, '.data');
const DAYS = join(DATA, 'days');
const MEM_FILE = join(DATA, 'memory.json');
const PROJ_FILE = join(DATA, 'projects.json');
const STEP_FILE = join(DATA, 'step.json');
const PREFS_FILE = join(DATA, 'prefs.json');
const PEOPLE_FILE = join(DATA, 'people.json');
const PORT = Number(process.env.PORT || 8910);

for (const d of [DATA, DAYS]) if (!existsSync(d)) mkdirSync(d, {recursive: true});

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROVIDERS = {
  // Bedrock 不走 OpenAI 兼容接口，单独一条路径（server/bedrock.mjs）。
  // 凭证按 AWS 默认链解析，不用 apiKey 字段。
  bedrock: {bedrock: true, model: BEDROCK_DEFAULT},
  // 主力。实测 1.2–2.4 秒，比 gpt-5.6-luna 快四倍，判断不差。
  nebius: {baseUrl: 'https://api.tokenfactory.nebius.com/v1', model: 'MiniMaxAI/MiniMax-M3', key: 'NEBIUS_API_KEY'},
  openai: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', key: 'OPENAI_API_KEY'},
  dashscope: {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', key: 'DASHSCOPE_API_KEY'},
};

/**
 * 主力 + 兜底。
 *
 * 主力挂了（限流、欠费、服务抖动）不该让她对着一个报错的屏幕，
 * 所以自动切到下一家。供应商无关那层就是为这个存在的——
 * 实测三家都能跑同一套 prompt，这不是架构美学，是一条真的后路。
 */
const CHAIN = (process.env.PROVIDER ? [process.env.PROVIDER] : ['nebius', 'openai'])
  .filter(n => PROVIDERS[n]);
const P = PROVIDERS[CHAIN[0]];
const MODEL = process.env.MODEL || P.model;

const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
const dayFile = k => join(DAYS, `${k}.json`);

const readJSON = (f, fallback) => {
  try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback; }
  catch { return fallback; }
};
const writeJSON = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2));

/**
 * 读记忆。旧文件是扁平的五类，迁进维度。
 * 迁移时给一个三十天前的 at —— 旧数据本来就该先被确认一遍再用。
 */
/** 推着走的事。独立于某一天存——不然跨天就断了。 */
/**
 * 她挑的语言。null = 没挑过，跟设备走。
 *
 * 存在服务端而不是各屏自己记：她在手机上按一下，电视跟着变。
 * 录 demo 要全程英文的时候，这是唯一不用重装 APK 的开关。
 */
const loadPrefs = () => readJSON(PREFS_FILE, {lang: null, place: null});
const savePrefs = p => writeJSON(PREFS_FILE, p);
/** 她挑过就听她的，没挑过才看请求里带的那个。 */
const langOf = asked => loadPrefs().lang ?? (asked === 'zh' ? 'zh' : 'en');

const loadPeople = () => readJSON(PEOPLE_FILE, Ppl.EMPTY);
const savePeople = v => writeJSON(PEOPLE_FILE, v);

const loadProjects = () => readJSON(PROJ_FILE, Proj.EMPTY);
const saveProjects = p => writeJSON(PROJ_FILE, p);

function loadMemory() {
  const m = readJSON(MEM_FILE, null);
  if (!m) return EMPTY_MEM;
  if (m.facts) return m;
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  const map = {
    people: '家里人', rhythms: '一天的样子',
    carrying: '一直推着的', hers: '她自己', notes: '要紧的叮嘱',
  };
  const facts = {};
  for (const [k, dim] of Object.entries(map)) {
    const list = (m[k] ?? []).map(v =>
      typeof v === 'string' ? v : `${v.name} — ${v.who}`);
    if (list.length) facts[dim] = list.map(text => ({text, at: old}));
  }
  const out = {facts, updatedAt: m.updatedAt || old};
  writeJSON(MEM_FILE, out);
  return out;
}

/**
 * 一天的文件现在存的是整条对话，不是一次 turn。
 *   messages: [{who:'today'|'her', text, cards?, at}]
 * 对话是最外层——卡片是 Today 说出来的一种消息，不是另一个区域。
 */
const loadDay = (k = dayKey()) => {
  const d = readJSON(dayFile(k), null);
  if (!d) return null;
  // 兼容早期只存一次 turn 的文件
  if (!d.messages) return {date: d.date, threads: [], messages: d.say || d.cards?.length
    ? [{who: 'today', text: d.say ?? '', cards: d.cards ?? [], at: d.at}] : []};
  return {threads: [], ...d};
};
const saveDay = d => writeJSON(dayFile(dayKey()), d);
const appendMessage = m => {
  const d = loadDay() ?? {date: dayKey(), messages: []};
  d.messages.push({...m, at: new Date().toISOString()});
  saveDay(d);
  return d;
};
/** 当天最后一次带任务卡的消息——打勾和统计都认它。 */
const latestTasks = (d = loadDay()) => {
  for (let i = (d?.messages?.length ?? 0) - 1; i >= 0; i--) {
    const c = d.messages[i].cards?.find(x => x.type === 'tasks');
    if (c) return {msg: d.messages[i], card: c};
  }
  return null;
};

/** 昨天没做完的。拿来判断什么该放下，不是用来追责。 */
function carryOver() {
  const y = new Date(Date.now() - 86400000);
  const t = latestTasks(loadDay(dayKey(y)));
  return (t?.card.items ?? []).filter(i => !i.done).map(i => i.label);
}

/**
 * 模型不总是听话。超过三件截断，缺字段补默认值。
 *
 * done 的处理是关键：她在和 Today 商量这张卡时，模型可能忘记带回 done。
 * 已有 id 的事项一律以服务端记的 done 为准，除非模型明确把它设成了 true——
 * 她说「做完了」要生效，但模型的疏忽不该把她打过的勾抹掉。
 */
function toTurn(v, prev) {
  const o = v ?? {};
  const was = new Map((prev?.focus ?? []).map(t => [t.id, t]));
  const tasks = (Array.isArray(o.focus) ? o.focus : []).slice(0, 3).map((t, i) => {
    const id = String(t?.id ?? i + 1);
    const old = was.get(id);
    return {
      id,
      label: String(t?.label ?? '').trim(),
      note: t?.note ? String(t.note).trim() : undefined,
      forHer: t?.forHer === true,
      done: t?.done === true || (old?.done === true && t?.done !== false),
    };
  }).filter(t => t.label);

  const later = (Array.isArray(o.later) ? o.later : [])
    .map(String).map(s => s.trim()).filter(Boolean).slice(0, 8);

  const cards = [];
  // 它替她写的那段话，直接可用——放最前面，她多半是为它来的
  if (typeof o.draft === 'string' && o.draft.trim()) {
    cards.push({type: 'draft', text: o.draft.trim()});
  }
  if (tasks.length) cards.push({type: 'tasks', items: tasks});
  if (later.length) cards.push({type: 'later', items: later});

  return {turn: {say: typeof o.say === 'string' ? o.say : '', cards}, remember: o.remember ?? {}};
}

/**
 * 比较前后两张卡，算出改了什么。
 * 返回的是给人看的短语，不是 diff 结构——界面上只有一行字的位置。
 */
function diffPlan(before, cards) {
  const after = cards.find(c => c.type === 'tasks')?.items ?? [];
  const laterAfter = cards.find(c => c.type === 'later')?.items ?? [];
  if (!before) return after.length ? {added: after.map(t => t.label)} : null;

  const was = new Map(before.focus.map(t => [t.id, t]));
  const now = new Map(after.map(t => [t.id, t]));
  const out = {added: [], done: [], moved: [], kept: []};

  for (const t of after) {
    const o = was.get(t.id);
    if (!o) out.added.push(t.label);
    else if (t.done && !o.done) out.done.push(t.label);
  }
  for (const t of before.focus) {
    if (!now.has(t.id)) out.moved.push(t.label);
  }
  const laterWas = new Set(before.later ?? []);
  for (const l of laterAfter) {
    if (!laterWas.has(l) && !out.moved.includes(l)) out.kept.push(l);
  }
  return Object.values(out).some(a => a.length) ? out : null;
}

/** 今天已经排好的那张卡，喂回给模型让它改而不是重排。 */
function currentPlan() {
  const t = latestTasks();
  const later = [...(loadDay()?.messages ?? [])].reverse()
    .flatMap(m => m.cards ?? []).find(c => c.type === 'later');
  if (!t && !later) return undefined;
  return {focus: t?.card.items ?? [], later: later?.items ?? []};
}

/** 向一家供应商要一次 JSON。 */
/**
 * 采样怎么设。
 *
 * 温度本来就压到 0.4 了，但 **top_p 一直没设**，默认 1.0——
 * 温度只是把分布压扁，top_p 才决定还从多长的尾巴里取。尾巴全开，
 * 就会偶尔蹦出一句「我挑了几个」然后什么都没列。
 *
 * 所以按活儿分三档：
 *   talk  她看见的那段话。要稳，但不能平——这个产品的温度在文字里。
 *   open  开场白。一天一句，天天一样会像个报时器，留一点余地。
 *   pick  只负责把查回来的东西填进表。这是抽取，不是写作，越死越好。
 */
const DIAL = {
  talk: {temperature: 0.4, top_p: 0.88},
  open: {temperature: 0.7, top_p: 0.95},
  pick: {temperature: 0.2, top_p: 0.6},
};

async function callOne(name, messages, dial = DIAL.talk) {
  const p = PROVIDERS[name];
  const model = name === CHAIN[0] ? MODEL : p.model;
  if (p.bedrock) return converseJSON(messages, {model, ...dial});

  const apiKey = process.env[p.key];
  if (!apiKey) throw new Error(`缺少 ${p.key}`);
  const r = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      messages,
      // 新一代推理模型只接受默认采样参数，给了会报错
      ...(/^(gpt-[56]|o[0-9])/.test(model) ? {} : dial),
      response_format: {type: 'json_object'},
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const raw = (await r.json()).choices?.[0]?.message?.content ?? '';
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}

/** 调一次模型，拿回 JSON。主力挂了自动切下一家。 */
const hasCJK = v =>
  /[\u4e00-\u9fff]/.test(typeof v === 'string' ? v : JSON.stringify(v ?? ''));

/**
 * 要英文就得真是英文。
 *
 * 记忆整本是中文，提示词里写三遍「reply in English」也按不住——
 * 中文语料会把它拽回去。所以英文这一路多走一步：
 * 回来带汉字就把它自己那份answer摆回去，再要一次。
 *
 * 只在英文时多花这一次。中文是她平时用的，不该为了 demo 慢一倍。
 */
async function callJSONIn(messages, lang, dial) {
  const r = await callJSON(messages, dial);
  if (lang !== 'en' || !hasCJK(r)) return r;
  console.warn('  要英文却回了中文，重来一次');
  try {
    // 加在最后一条 user 的末尾，不另起一轮。
    // 试过补一轮对话（assistant + user），两次都还是中文——
    // 它顺着上文的中文继续说，新的一轮压不过整本中文的记忆。
    const again = await callJSON(
      messages.map((m, i) =>
        i === messages.length - 1
          ? {...m, content:
              m.content +
              '\n\nIMPORTANT: write your entire JSON answer in English. ' +
              'Every field — say, card labels, notes, later items, project titles and steps. ' +
              'What you remember is written in Chinese; translate the meaning into English ' +
              'and do not copy any Chinese characters into your answer.'}
          : m,
      ),
    );
    return hasCJK(again) ? r : again;   // 再不行就认了，有话总比空着强
  } catch {
    return r;
  }
}

async function callJSON(messages, dial) {
  let last;
  for (const name of CHAIN) {
    try {
      return await callOne(name, messages, dial);
    } catch (e) {
      last = e;
      if (name !== CHAIN[CHAIN.length - 1]) {
        console.warn(`  ${name} 不行（${String(e.message).slice(0, 80)}），换下一家`);
      }
    }
  }
  throw last;
}

/** 今天还没打勾的。 */
function openItems() {
  const t = latestTasks();
  return (t?.card.items ?? []).filter(i => !i.done).map(i => i.label);
}

async function ask(braindump, lang, mode) {
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});
  const current = currentPlan();
  const messages = buildMessages({
    braindump, now, lang, mode, current,
    memory: loadMemory(), projects: loadProjects(), people: loadPeople(),
    place: loadPrefs().place, carryOver: carryOver(),
  });
  let raw = await callJSONIn(messages, lang);

  /**
   * 它说要查一下。
   *
   * 不走 function calling：那套东西 Nebius / OpenAI / Bedrock 三家格式都不一样，
   * 兜底链一换供应商就碎。一个 JSON 字段到处都认，和 projects 里的 ask 同一个套路。
   *
   * **只给一轮。** 查回来之后不再理会新的 need——
   * 网页上写一句「你还需要查 X」就能让它一直查下去，那是别人在用她的额度。
   */
  if (raw?.need && Web.available()) {
    const found = await Web.search(String(raw.need), {place: loadPrefs().place});
    console.log(`  查了「${String(raw.need).slice(0, 40)}」→ ${found.length} 条`);
    const block = found.length
      ? Web.render(found, lang === 'zh')
      : lang === 'zh'
        ? '没查到。老实告诉她你查不了这个，别编。'
        : 'Nothing came back. Tell her plainly you could not look it up. Do not invent.';
    raw = await callJSONIn(
      [
        ...messages,
        {role: 'assistant', content: JSON.stringify(raw)},
        {role: 'user', content: block},
      ],
      lang,
    );
    delete raw?.need;   // 一轮就是一轮

    /**
     * 查过了就必须有那张表。
     *
     * 模型把判断写得很好的时候，常常就把 guide 字段忘了——一段漂亮的话，
     * 没有「几点、多少钱」。而她真要用的恰恰是后者。
     * 提示词写得再清楚也只是提高概率，所以这里补一刀：只问那张表，别的不要。
     * 只在真查过、而且它确实没给的时候才多这一次。
     */
    if (found.length && !raw?.guide?.options?.length) {
      const title =
        raw?.guide?.for ||
        raw?.projects?.find(p => p.title)?.title ||
        (lang === 'zh' ? '这件事' : 'this');
      try {
        const only = await callJSONIn(
          [
            ...messages,
            {role: 'assistant', content: JSON.stringify(raw)},
            {role: 'user', content:
              block + '\n\n' + (lang === 'zh'
                ? `只输出这一个 JSON，别的字段一个都不要：\n` +
                  `{"guide":{"for":"${title}","options":[{"name":"…","facts":[{"k":"时间","v":"短"},` +
                  `{"k":"价位","v":"短"}],"note":"一句","source":"域名"}]}}\n` +
                  `值最多五六个词。不知道的那一项不要列，不要编。最多三个方案。`
                : `Output only this one JSON object and no other fields:\n` +
                  `{"guide":{"for":"${title}","options":[{"name":"…","facts":[{"k":"When","v":"short"},` +
                  `{"k":"Cost","v":"short"}],"note":"one line","source":"domain"}]}}\n` +
                  `Values are five or six words at most. Leave out what you don't know; ` +
                  `never invent. Three options at most.`)},
          ],
          lang,
          DIAL.pick,
        );
        if (only?.guide?.options?.length) raw.guide = only.guide;
      } catch {
        // 补不上就算了：那段话本身还在，不该因为少一张表就整轮失败
      }
    }
  }
  return {
    ...toTurn(raw, current),
    projects: Array.isArray(raw?.projects) ? raw.projects : [],
    people: Array.isArray(raw?.people) ? raw.people : [],
    guide: raw?.guide?.for ? raw.guide : null,
  };
}

/**
 * Today 先开口。
 *
 * 这是「AI 主导第一层沟通」的地方：她打开页面的那一刻，
 * Today 已经基于它记得的东西说了一句只有它能说的话——
 * 而不是一行写死的「我在听」。
 */
/**
 * 每天开场时端一步出来。
 *
 * 「接」真正发生在这里：她不用记「保险我进行到哪了」，
 * 今天打开页面，下一步自己就在卡上了。
 * 每件事每天只端一步——端过就记一笔，当天不再端同一件。
 */
/**
 * 它建了一件事、附了一句要问的话，但那句话常常只写进了 projects，
 * 没写进它对她说的话——她就永远看不到这个问题，这件事也就永远拆不开。
 * 所以这里兜一道：这一轮新冒出来的待问，必须出现在它说的话里。
 */
function ensureAsk(say, before, after) {
  const was = new Set((before?.items ?? []).filter(p => p.asked).map(p => p.id));
  const fresh = (after?.items ?? []).find(p => p.asked && !p.done && !was.has(p.id));
  if (!fresh) return say;
  const q = fresh.asked.trim();
  if (!q || (say ?? '').includes(q)) return say;
  return [say?.trim(), q].filter(Boolean).join(' ');
}

/**
 * 今天的天气。
 *
 * 电视五秒轮询一次，不能每次都去敲人家的接口——缓存半小时。
 * 取不到就返回 null，那一行干脆不出现：这块屏上少一行，
 * 比挂一个过期或错的温度好。
 */
const WX_OK = 30 * 60 * 1000;   // 拿到了就存半小时
const WX_BAD = 2 * 60 * 1000;   // 没拿到就先别再敲了，歇两分钟

let wxCache = {at: 0, key: '', data: null};
async function weather() {
  const place = loadPrefs().place;
  if (!place?.lat) return null;
  const key = `${place.lat},${place.lon}`;
  const age = Date.now() - wxCache.at;
  if (wxCache.key === key && age < (wxCache.data ? WX_OK : WX_BAD)) return wxCache.data;
  try {
    const data = await Wx.fetchWeather(place);
    // 失败也要记一笔。不记的话：电视五秒轮一次，每次都重新去打，
    // 一分钟十二发，很快被限流，然后就再也好不了了——
    // 一次网络抖动变成永久性的坏。
    wxCache = {at: Date.now(), key, data: data ?? null};
    return data ?? null;
  } catch {
    wxCache = {at: Date.now(), key, data: wxCache.key === key ? wxCache.data : null};
    return wxCache.data;
  }
}

/**
 * 今天这一步，一天只挑一次，然后一整天不变。
 *
 * 电视和手机都会调 /greet。advanceOne 是会落账的——谁先调谁拿到，
 * 后调的那块屏就整天什么都看不见。所以挑完存下来，
 * 今天之内谁来问都是同一步。
 */
async function todayStep(lang) {
  const k = dayKey();
  const cached = readJSON(STEP_FILE, null);
  const sameDay = cached?.date === k;
  if (sameDay && cached.lang === lang) return cached.step ?? null;

  // 换了语言不能重挑一步——advanceOne 是会落账的。
  // 所以当天挑出来的原文留着，换语言只是换一层皮。
  const raw = sameDay ? (cached.raw ?? null) : advanceOne();
  const step = raw && lang === 'en' && hasCJK(raw) ? await englishStep(raw) : raw;
  writeJSON(STEP_FILE, {date: k, lang, step, raw});
  return step;
}

/**
 * 她平时用中文，录 demo 时按了 EN——这一步是半年前用中文记下的。
 * 她的记录不动（那是她的东西），只把端到屏幕上的这一份翻过去。
 * 一天一次，缓存在 step.json 里。
 */
async function englishStep(step) {
  try {
    const r = await callJSON([
      {role: 'system', content:
        'Translate this one task from Chinese into natural, plain English. ' +
        'Keep it as short as the original. Keep people\'s names as written. ' +
        'Reply with JSON only: {"project":"...","text":"...","note":"..."} ' +
        '(omit "note" if there is none).'},
      {role: 'user', content: JSON.stringify({
        project: step.project, text: step.text, note: step.note ?? undefined,
      })},
    ]);
    if (!r?.text || hasCJK(r)) return step;
    return {...step, project: r.project || step.project, text: r.text, note: r.note || undefined};
  } catch {
    return step;   // 翻不了就给原文，总比这一步不出现强
  }
}

function advanceOne() {
  const store = loadProjects();
  const p = Proj.pickForToday(store.items);
  if (!p) return null;
  const step = Proj.nextStep(p);
  if (!step) return null;
  saveProjects(Proj.markMoved(store, p.id));
  return {project: p.title, forHer: p.forHer === true, text: step.text, note: step.note};
}

async function greet(lang) {
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});
  const open = openItems();

  // 守要在接之前算。接会把 offers 加一，先接再守的话
  // 今天刚端出去的那件会立刻被算成「卡住了」，开场白就说重了。
  const stuck = Proj.neglected(loadProjects().items);

  // 接：今天替她推的那一步。一天只挑一次，之后一整天不变，
  // 电视和手机看到的是同一步。刷新页面不会把她的事往前拱。
  const step = await todayStep(lang);

  // 今天已经端出去的那件不用再提一遍，说两次就成了催。
  const watch = stuck.filter(p => p.title !== step?.project).map(p => p.title);

  const r = await callJSONIn(
    buildGreeting({
      now, lang, memory: loadMemory(), people: loadPeople(),
      open, left: open.length, step, watch, weather: await weather(),
    }),
    lang,
    DIAL.open,
  );
  let say = typeof r?.say === 'string' ? r.say.trim() : '';
  // 模型偶尔不守长度。这句在屏幕上是最大的一行，太长会吃掉半屏，
  // 所以超限就截到第一个句读为止——宁可短，不要满屏。
  //
  // 上限看它实际说的是哪种话，不看我们要的是哪种。记忆是中文的时候，
  // 问它要英文它也常常回中文——按 90 去量一句中文，等于没量。
  const cjk = /[\u4e00-\u9fff]/.test(say);
  const LIMIT = cjk ? 20 : 90;
  if (say.length > LIMIT) {
    const cut = say.slice(0, LIMIT + 8).match(/^[\s\S]*?[。，；,;.]/);
    // 句读也跟着它实际说的话走，别给中文句子补一个英文句点
    say = (cut ? cut[0] : say.slice(0, LIMIT)).replace(/[，,；;]$/, cjk ? '。' : '.');
  }
  // step 单独给出去，不塞进 say——say 只有一行，塞进去就两件事了。
  // 电视端把它当一张卡放，手机端也一样。
  return {say, step: step ?? null, watch};
}

/**
 * 记忆卡。她得看得见 Today 记住了什么，才谈得上信任，也才能纠正。
 * 带「多久以前」和是否已旧——时间是这张卡最要紧的一列。
 */
/** 安全那一类排最前。电视只放得下三条，这一类排在后面等于永远不出现。 */
const SAFETY = '要紧的叮嘱';

function memoryCard(m) {
  const groups = forDisplay(m);
  const items = groups.flatMap(g =>
    g.items.map(i => ({
      id: `${g.key}:${i.text}`,
      dim: g.key,
      text: i.text,
      days: i.days,
      stale: i.stale,
    })),
  );
  // 这块屏在厨房里也看得见，而厨房那一眼要的就是这一类：
  // 过敏、吃药、医生交代过的话。它按维度顺序排在最后，
  // 电视 slice(0,3) 一刀切下去，正好把最该看见的切掉。
  items.sort((a, b) => Number(b.dim === SAFETY) - Number(a.dim === SAFETY));
  return items.length ? {type: 'memory', items, groups} : null;
}

const json = (res, code, obj) => {
  res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise(ok => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => ok(b));
});
const readRaw = req => new Promise(ok => {
  const cs = []; req.on('data', c => cs.push(c)); req.on('end', () => ok(Buffer.concat(cs)));
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  /**
   * 外层那张讲故事的静态页。
   *
   * 放在 doc/site/ 而不是这儿，是为了它能原样丢到任何静态托管上——
   * 评委点的是一个链接，不该依赖这台笔记本开着。
   * 这里只是顺手也发一份，好让「登录 → 进 app」那条路在本地是通的。
   */
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const f = join(ROOT, '..', 'doc', 'site', 'index.html');
    if (existsSync(f)) {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      return res.end(readFileSync(f));
    }
  }
  if (url.pathname.startsWith('/shots/')) {
    const name = url.pathname.slice('/shots/'.length);
    const f = join(ROOT, '..', 'doc', 'site', 'shots', name);
    if (/^[\w.-]+\.png$/.test(name) && existsSync(f)) {
      res.writeHead(200, {'Content-Type': 'image/png', 'Cache-Control': 'max-age=60'});
      return res.end(readFileSync(f));
    }
    return json(res, 404, {error: 'no such shot'});
  }

  /**
   * 电视端的网页版。评委大概率没有 Fire TV——一个网址就能看见这块屏。
   * 和 APK 吃的是同一个 /turn，所以两边不会说的不是一回事。
   */
  if (url.pathname === '/tv') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(readFileSync(join(HERE, 'tv.html')));
  }

  if (url.pathname === '/app' || url.pathname === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(readFileSync(join(HERE, 'phone.html')));
  }

  // Today 的形象
  if (/^\/today-[a-z0-9-]+\.png$/.test(url.pathname)) {
    const f = join(ROOT, 'assets/today', url.pathname.slice(1));
    if (!existsSync(f)) return json(res, 404, {error: 'no such figure'});
    // 用文件 mtime 做 ETag：形象换了浏览器立刻拿到新的，
    // 没换则走 304。开发期一天的强缓存会让人以为代码没生效。
    const tag = `"${statSync(f).mtimeMs}"`;
    if (req.headers['if-none-match'] === tag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      ETag: tag,
    });
    return res.end(readFileSync(f));
  }

  /**
   * 手机录的音 → 文字。
   *
   * 不走系统键盘的听写键：实测很多手机根本没有那个键（要在设置里
   * 单独开启），把产品押在一个大多数人没开的系统开关上是错的。
   * 所以页面自己录，这里转写。
   *
   * 代价是 getUserMedia 需要安全上下文——iOS Safari 只在 HTTPS 下
   * 给麦克风权限。所以这个端点必须配合 HTTPS 隧道才有意义。
   */
  if (url.pathname === '/transcribe' && req.method === 'POST') {
    try {
      const audio = await readRaw(req);
      if (!audio.length) return json(res, 400, {error: '没收到音频'});
      const mime = req.headers['content-type'] || 'audio/webm';
      // iOS Safari 录出来是 audio/mp4，安卓是 audio/webm，扩展名要对上
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';

      const fd = new FormData();
      fd.append('file', new Blob([audio], {type: mime}), `say.${ext}`);
      fd.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`},
        body: fd,
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const {text} = await r.json();
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 听到 ${audio.length / 1024 | 0}KB → ${String(text).slice(0, 40)}…`);
      return json(res, 200, {text: String(text ?? '').trim()});
    } catch (e) {
      console.error('转写失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  if (url.pathname === '/braindump' && req.method === 'POST') {
    try {
      const {braindump, lang, mode} = JSON.parse(await readBody(req));
      if (!braindump?.trim()) return json(res, 400, {error: '空的'});
      const L = langOf(lang);
      const M = ['note', 'write'].includes(mode) ? mode : undefined;

      // 她说的话也进对话流——这是一条对话，不是一次查询
      appendMessage({who: 'her', text: braindump.trim(), mode: M});

      const before = currentPlan();
      const {turn, remember, projects, people, guide} = await ask(braindump, L, M);
      const mem = mergeMem(loadMemory(), remember);
      writeJSON(MEM_FILE, mem);
      if (people.length) savePeople(Ppl.apply(loadPeople(), people));
      if (projects.length || guide) {
        const prev = loadProjects();
        const next = Proj.apply(prev, projects, guide);
        saveProjects(next);
        turn.say = ensureAsk(turn.say, prev, next);
      }
      // 这一轮到底改了什么。界面上那行提示要说得出内容，
      // 不能只说「更新了」——那等于没说。
      const day = appendMessage({
        who: 'today', text: turn.say, cards: turn.cards,
        changed: diffPlan(before, turn.cards),
      });

      const n = turn.cards.find(c => c.type === 'tasks')?.items.length ?? 0;
      const kept = memCount(mem);
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 排了 ${n} 件 · 记着 ${kept} 条`);
      return json(res, 200, day);
    } catch (e) {
      console.error('失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  // 整条对话。手机端按对话渲染，这是最外层。
  if (url.pathname === '/day') {
    const d = loadDay() ?? {date: dayKey(), messages: []};
    return json(res, 200, {...d, memory: memoryCard(loadMemory())});
  }

  // 电视要的：最后一次开口 + 它记着什么。电视不是对话面，是一眼看见的那块。
  if (url.pathname === '/turn') {
    const d = loadDay();
    const last = [...(d?.messages ?? [])].reverse().find(m => m.who === 'today');
    const t = latestTasks(d);
    const cards = [];
    if (t) cards.push(t.card);
    const later = [...(d?.messages ?? [])].reverse()
      .flatMap(m => m.cards ?? []).find(c => c.type === 'later');
    if (later) cards.push(later);
    const mc = memoryCard(loadMemory());
    if (mc) cards.push(mc);
    // 语言跟着这块屏的内容一起下发，电视不用再多问一个接口。
    // 今天这一步也在这儿给——「接」是四个能力里最能说明它在替她办事的那个，
    // 只在手机上看得见等于白做：整天开着的是这块屏。
    const lang = langOf(null);

    // 按进去才看得见的那一层。
    //
    // 电视上平时只给今天这一步——「绝对不要把整个拆解一次倒给她」。
    // 但她拿遥控器按进某一件事，那是她开的口，不是我们倒给她的。
    // 和「她问了就答」是同一条线：推送与索取的区别，不是信息多少的区别。
    //
    // 仍然不给数字。步骤带勾，但没有「2/4」——那个一出现就成了看板。
    const DAY = 86400000;
    const projects = loadProjects().items
      .filter(p => !p.done)
      .map(p => ({
        id: p.id,
        title: p.title,
        forHer: p.forHer === true,
        waited: p.at ? Math.floor((Date.now() - new Date(p.at).getTime()) / DAY) : null,
        asked: p.asked ?? null,
        steps: (p.steps ?? []).map(st => ({
          text: st.text, note: st.note ?? null, done: !!st.done,
        })),
        // 她查回来的那张表。按进去才看得见，和拆解一样。
        guide: p.guide ?? null,
      }));

    // 「今天不做」这一栏是模型给的，它不一定把在推的事都写进去。
    // 但电视上只有这一栏能按进去——有内容的东西够不着，等于没有。
    // 所以把项目并进来，有指南/有拆解的排前面。
    const laterCard = cards.find(c => c.type === 'later');
    // 去重要宽一点。模型每轮的措辞不一样——「Insurance for Coco」和
    // 「insurance for Coco」、「See the dentist」和「her dentist」会并排站着，
    // 镜头里就是一团脏。去掉标点大小写再比，互相包含的也算同一件。
    const key = t => String(t).toLowerCase().replace(/[\s'’·,.，。、:：-]/g, '');
    const seen = (laterCard?.items ?? []).map(key).filter(Boolean);
    const dup = t => seen.some(k => k === key(t) || k.includes(key(t)) || key(t).includes(k));
    const extra = projects
      .filter(p => !dup(p.title))
      .sort((a, b) => Number(!!b.guide) - Number(!!a.guide))
      .map(p => p.title);
    if (extra.length) {
      if (laterCard) laterCard.items = [...extra, ...laterCard.items];
      else cards.push({type: 'later', items: extra});
    }

    return json(res, 200, {
      say: last?.text ?? '',
      cards,
      lang: loadPrefs().lang,
      step: (await todayStep(lang)) ?? null,
      projects,
      weather: await weather(),
    });
  }

  // Today 先开口。手机页一打开就调这个。
  if (url.pathname === '/greet') {
    try {
      const lang = langOf(url.searchParams.get('lang'));
      return json(res, 200, await greet(lang));
    } catch (e) {
      // 开场白拿不到不该挡住她说话——退回空串，页面自己有兜底
      console.error('开场失败：', e.message);
      return json(res, 200, {say: ''});
    }
  }

  // 对外地址。隧道地址每次重启会变，所以不写死在 app 里，由服务端告知。
  if (url.pathname === '/where') {
    return json(res, 200, {url: process.env.PUBLIC_URL || ''});
  }

  /**
   * 开一段新对话。
   *
   * 当前这段收进 threads，messages 清空——卡片不动，
   * 因为「今天要做的事」不随对话段落重置。
   * 她不需要永远看着历史，但历史不能丢。
   */
  if (url.pathname === '/new' && req.method === 'POST') {
    const d = loadDay() ?? {date: dayKey(), threads: [], messages: []};
    if (d.messages.length) {
      d.threads.push({at: d.messages[0].at, messages: d.messages});
      d.messages = [];
      saveDay(d);
    }
    return json(res, 200, {...d, memory: memoryCard(loadMemory())});
  }

  /** 今天之前那几段对话的目录，只给首句和时间——列表不需要全文。 */
  /**
   * 聊过的。
   *
   * 原来只读当天那一个文件，于是过了半夜，前一天说过的话就彻底看不见了。
   * 记忆和在推的事都跨天，唯独对话到零点归零——对一块一直在墙上的屏来说
   * 这才是怪事。现在往回翻最近几天。
   */
  if (url.pathname === '/threads') {
    const days = 14;
    const out = [];
    for (let i = 0; i < days; i++) {
      const k = dayKey(new Date(Date.now() - i * 86400000));
      const d = loadDay(k);
      for (const [j, t] of (d?.threads ?? []).entries()) {
        out.push({
          day: k,
          i: j,
          at: t.at,
          first: t.messages.find(m => m.who === 'her')?.text
              ?? t.messages[0]?.text ?? '',
          n: t.messages.length,
        });
      }
    }
    // 新的在前。同一天里也是后说的在前。
    out.sort((a, b) => String(b.at ?? b.day).localeCompare(String(a.at ?? a.day)));
    return json(res, 200, {threads: out.slice(0, 40)});
  }

  /** 取某一段历史对话的全文。 */
  if (url.pathname === '/thread') {
    const i = Number(url.searchParams.get('i'));
    const k = url.searchParams.get('day') || dayKey();
    const t = loadDay(k)?.threads?.[i];
    if (!t) return json(res, 404, {error: 'no such thread'});
    return json(res, 200, {messages: t.messages, day: k});
  }

  /** 她在推着的事。界面上看得见「下一步」，但看不见进度条。 */
  if (url.pathname === '/projects') {
    const store = loadProjects();
    return json(res, 200, {
      items: store.items.filter(p => !p.done).map(p => ({
        id: p.id, title: p.title, forHer: p.forHer === true,
        next: Proj.nextStep(p)?.text ?? null,
        nextNote: Proj.nextStep(p)?.note ?? null,
        asked: p.asked ?? null,
        waited: p.at ? Math.floor((Date.now() - new Date(p.at).getTime()) / 86400000) : null,
        // 手机上也看得见整理好的那份。两块屏是同一份内容，不是一个简版一个详版。
        steps: (p.steps ?? []).map(st => ({text: st.text, note: st.note ?? null, done: !!st.done})),
        guide: p.guide ?? null,
      })),
    });
  }

  /** 今天该推进的那一步。开场时调一次。 */
  if (url.pathname === '/advance' && req.method === 'POST') {
    return json(res, 200, (await todayStep(langOf(url.searchParams.get('lang')))) ?? {});
  }

  /**
   * 中文还是英文。她在手机上按，电视跟着变。
   * lang: 'zh' | 'en' | null（null = 还给设备，自己判）
   */
  if (url.pathname === '/prefs' && req.method === 'POST') {
    const {lang} = JSON.parse((await readBody(req)) || '{}');
    const next = lang === 'zh' || lang === 'en' ? lang : null;
    savePrefs({lang: next});
    // 别删 step.json：今天这一步已经落过账了，删了就再也挑不出来
    //（lastMoved 是今天，dueToday 直接不认），这一天就空着。
    // 换语言只换那层皮，todayStep 自己会按语言重翻一次。
    // 开场白本来每次都重新生成，不用管。
    console.log(`[语言] ${next ?? '跟设备'}`);
    return json(res, 200, {lang: next});
  }
  if (url.pathname === '/prefs') return json(res, 200, loadPrefs());

  /**
   * 家里人的档案。低频变化，所以可以直接改，不用跟它商量。
   * POST 的 body 就是一组 op（和模型用的是同一套），这样界面和模型走同一条路。
   */
  if (url.pathname === '/people' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const ops = Array.isArray(body) ? body : Array.isArray(body.ops) ? body.ops : [body];
    const next = Ppl.apply(loadPeople(), ops);
    savePeople(next);
    return json(res, 200, {people: Ppl.forDisplay(next, langOf(body.lang) === 'zh')});
  }
  if (url.pathname === '/people') {
    const zh = langOf(url.searchParams.get('lang')) === 'zh';
    return json(res, 200, {
      people: Ppl.forDisplay(loadPeople(), zh),
      // 角色表由这边给，省得两处各写一份然后慢慢走散
      roles: Ppl.ROLES.map(r => ({key: r.key, icon: r.icon, label: zh ? r.zh : r.en})),
    });
  }

  /**
   * 她在哪儿。只到城市一级——一块客厅里的屏不需要知道她在哪条街。
   * 低频变化，所以和语言一样存服务端，手机设一次，电视跟着变。
   */
  if (url.pathname === '/place' && req.method === 'POST') {
    const {name} = JSON.parse((await readBody(req)) || '{}');
    const prefs = loadPrefs();
    if (!name?.trim()) {
      savePrefs({...prefs, place: null});
      wxCache = {at: 0, key: '', data: null};
      return json(res, 200, {place: null});
    }
    try {
      const place = await Wx.locate(name.trim());
      if (!place) return json(res, 404, {error: '找不到这个地方'});
      savePrefs({...prefs, place});
      wxCache = {at: 0, key: '', data: null};
      console.log(`[位置] ${place.name}`);
      return json(res, 200, {place, weather: await weather()});
    } catch (e) {
      return json(res, 502, {error: String(e.message || e)});
    }
  }
  if (url.pathname === '/place') {
    return json(res, 200, {place: loadPrefs().place, weather: await weather()});
  }

  if (url.pathname === '/memory') return json(res, 200, loadMemory());

  if (url.pathname === '/toggle' && req.method === 'POST') {
    const {id} = JSON.parse((await readBody(req)) || '{}');
    const d = loadDay();
    const t = latestTasks(d);
    if (!t) return json(res, 404, {error: '今天还没有计划'});
    t.card.items = t.card.items.map(i => (i.id === id ? {...i, done: !i.done} : i));
    saveDay(d);
    return json(res, 200, d);
  }

  json(res, 404, {error: 'not found'});
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nToday 本地服务  ·  ${CHAIN[0]} / ${MODEL}` +
    (CHAIN.length > 1 ? `  （兜底：${CHAIN.slice(1).join(' → ')}）` : ''));
  console.log(`  记着 ${memCount(loadMemory())} 条`);
  for (const n of CHAIN) {
    const p = PROVIDERS[n];
    if (p.bedrock) {
      if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE)
        console.log(`  ⚠️  ${n}：没找到 AWS 凭证`);
    } else if (!process.env[p.key]) {
      console.log(`  ⚠️  ${n}：缺 ${p.key}`);
    }
  }
  console.log(`  手机：http://192.168.1.243:${PORT}\n`);
});
