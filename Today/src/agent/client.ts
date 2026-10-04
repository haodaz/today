import {buildMessages} from './prompt';
import type {Plan, PlanRequest} from './types';

/**
 * 供应商无关的调用层。
 *
 * 几乎所有厂商都提供 OpenAI 兼容接口（Nebius Token Factory、阿里 DashScope、
 * OpenRouter、本地 vLLM…），所以这里只认 baseUrl + apiKey + model 三件事。
 * 要换供应商只改配置，不改代码。
 *
 * AWS Bedrock 不是 OpenAI 兼容的，需要另一个 adapter——但接上它能拿
 * AWS Builder mini challenge，所以值得单独做，见 bedrock.ts（待建）。
 */
export type Provider = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const PRESETS: Record<string, Omit<Provider, 'apiKey'>> = {
  nebius: {
    baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    model: 'nvidia/nvidia-nemotron-3-nano-30b-a3b',
  },
  dashscope: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4.5',
  },
};

export class PlanError extends Error {}

export async function makePlan(
  req: PlanRequest,
  p: Provider,
  signal?: AbortSignal,
): Promise<Plan> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      messages: buildMessages(req),
      // 排一天的计划不需要发挥，需要稳定
      temperature: 0.4,
      response_format: {type: 'json_object'},
    }),
  });

  if (!res.ok) {
    throw new PlanError(`${res.status} ${await res.text().catch(() => '')}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') throw new PlanError('响应里没有内容');

  return normalize(parseLoose(raw));
}

/** 有些模型会在 JSON 外面裹一层 ```json，或者前后带解释。 */
function parseLoose(s: string): unknown {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new PlanError('响应里找不到 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * 模型不总是听话。这里兜住：
 * 超过三件就截断，done 永远从 false 开始，缺字段补默认值。
 * 宁可少显示，也不要让电视上出现一屏十五件事。
 */
function normalize(v: unknown): Plan {
  const o = (v ?? {}) as Record<string, unknown>;
  const focus = Array.isArray(o.focus) ? o.focus : [];

  return {
    greeting: typeof o.greeting === 'string' ? o.greeting : '',
    focus: focus.slice(0, 3).map((t, i) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return {
        id: String(x.id ?? i + 1),
        label: String(x.label ?? '').trim(),
        note: typeof x.note === 'string' && x.note.trim() ? x.note.trim() : undefined,
        anchor: (['morning', 'midday', 'afternoon', 'evening'] as const).includes(
          x.anchor as never,
        )
          ? (x.anchor as Plan['focus'][number]['anchor'])
          : undefined,
        forHer: x.forHer === true,
        done: false,
      };
    }).filter(t => t.label.length > 0),
    later: (Array.isArray(o.later) ? o.later : [])
      .map(x => String(x).trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}
