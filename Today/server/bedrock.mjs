/**
 * AWS Bedrock 适配层。
 *
 * 其余供应商（OpenAI、Nebius、DashScope）都走 OpenAI 兼容接口，
 * 一个 baseUrl + apiKey + model 就够了。Bedrock 不是，它有自己的
 * Converse API 和 SigV4 签名，所以单独一层。
 *
 * 用官方 SDK 而不是手写 SigV4：签名错了很难从错误信息看出来，
 * 而这段代码在拿到 AWS 凭证之前没法真正验证。
 *
 * 两个和 OpenAI 不一样的地方，调用方不用关心，这里抹平：
 *
 * 1) 没有 response_format: json_object。
 *    Claude 的做法是预填一个 '{' 让它只能接着写 JSON，
 *    拼回去之后交给同一个解析器。
 *
 * 2) system 不是 messages 里的一条，是单独的 system 数组。
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * 新的 Claude 模型在 Bedrock 上必须走跨区推理配置（inference profile），
 * 也就是带 us. / eu. / global. 前缀的 id，直接用裸模型 id 会报
 * 「on-demand throughput isn't supported」。
 */
export const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

let client = null;
function getClient(region) {
  if (!client) {
    // 凭证按 AWS 默认链解析：环境变量 → ~/.aws/credentials → IAM 角色
    client = new BedrockRuntimeClient({region});
  }
  return client;
}

/**
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @returns {Promise<unknown>} 解析好的 JSON
 */
export async function converseJSON(messages, opts = {}) {
  const region = opts.region || process.env.AWS_REGION || 'us-east-1';
  const modelId = opts.model || process.env.BEDROCK_MODEL || DEFAULT_MODEL;

  const system = messages
    .filter(m => m.role === 'system')
    .map(m => ({text: m.content}));

  const turns = messages
    .filter(m => m.role !== 'system')
    .map(m => ({role: m.role, content: [{text: m.content}]}));

  // 预填一个 '{'：Converse 没有 JSON 模式，这样模型只能接着写 JSON
  turns.push({role: 'assistant', content: [{text: '{'}]});

  const out = await getClient(region).send(
    new ConverseCommand({
      modelId,
      system,
      messages: turns,
      inferenceConfig: {maxTokens: 1200, temperature: 0.4},
    }),
  );

  const text = out?.output?.message?.content?.map(c => c.text).join('') ?? '';
  // 预填的 '{' 不在返回里，补回去
  const body = '{' + text;
  const end = body.lastIndexOf('}');
  if (end < 0) throw new Error('Bedrock 返回里找不到完整 JSON');
  return JSON.parse(body.slice(0, end + 1));
}
