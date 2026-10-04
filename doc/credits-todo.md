
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
