
---

## 实测：Nemotron 到底能不能用（2026-10-04）

拿到 Nebius $25 额度后跑的对比，同一段输入、同一套 prompt：

| 模型 | 耗时 | 判断质量 |
|---|---|---|
| `gpt-5.6-luna`（OpenAI） | 5–8 秒 | 稳 |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | **32–40 秒** | 两次都漏了「明天打疫苗」这件时效性最强的 |
| `nvidia/nemotron-3-super-120b-a12b` | 11.9 秒 | **把「明天带孩子打疫苗」放进了「今天不做」** |

结论：
- 格式和三条硬规矩（三件、有一件给自己、不打鸡血）**都守得住**
- 但「哪件最要紧」这个判断差一截，而这个产品里判断就是全部
- Nano 40 秒一轮，当开发期的便宜模型也不划算——调 prompt 等不了

所以这 $25 大概率用不上。但不白跑：
1. 纠正了一个模型 id：文档上拼出来的 `nvidia/nvidia-nemotron-3-nano-30b-a3b`
   实际是 `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`（大小写不同）
2. **供应商无关那一层真的验证过了** —— `PROVIDER=nebius` 一行切过去就能跑。
   万一 OpenAI 那边出问题，这是一条现成的后路。

Nebius Token Factory 上实际可用的 Nemotron（25 个模型里）：
```
nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
nvidia/Nemotron-3_5-Lightning
nvidia/nemotron-3-super-120b-a12b
nvidia/Nemotron-3-Ultra-550b-a55b
```

### 横评结果：最后选了 MiniMax-M3

Nebius Token Factory 上有 90+ 个模型，Nemotron 只是其中一家
（它只是 Nebius 那个比赛的硬性要求，而我们投的是 Amazon，不绑模型）。

同一段输入、同一套 prompt：

| 模型 | 耗时 | 判断 |
|---|---|---|
| **MiniMaxAI/MiniMax-M3** | **1.2–2.4 秒** | ✅ 「明天打疫苗提前出门 · 今天先想好几点走」——抓住了今天该做的是准备 |
| `zai-org/GLM-5.3-Flash` | 67 秒 | ✅ 判断最好，forHer 那条写成「不为了买东西，楼下转一圈就行」，自己说出了我们教了两轮的规矩。但太慢 |
| `openai/gpt-oss-120b` | 4.4 秒 | ❌ 疫苗丢进「今天不做」，且只排两件 |
| `deepseek-ai/DeepSeek-V4.1-Flash` | 14.9 秒 | ❌ 疫苗丢进「今天不做」 |
| `moonshotai/Kimi-K3` | 23 秒 | ❌ 同上 |
| `Qwen/Qwen3.5-397B-A17B` | 33.7 秒 | ⚠️ 保住了疫苗，但备注退化成「明天一早 打疫苗 · 明天」，还把时间写进 label |
| Nemotron Nano 30B | 32–40 秒 | ❌ 两次都漏了疫苗 |
| Nemotron Super 120B | 11.9 秒 | ❌ 疫苗丢进「今天不做」 |
| `gpt-5.6-luna`（原主力） | 5–8 秒 | ✅ 稳 |

**MiniMax-M3 比原主力快四倍，而且花的是 Nebius 的钱。**
一次调用约 1600 token，$25 够跑一万次以上。

所以：**主力 nebius/MiniMax-M3，兜底 openai/gpt-5.6-luna**，自动切换。
已实测：故意弄坏 Nebius key → 401 → 自动走 OpenAI → 用户无感。
