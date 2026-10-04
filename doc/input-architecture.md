# 输入方式：为什么是手机，不是遥控器

> 2026-10-04 查证。结论来自 Amazon 官方文档，不是推测。

## 一、遥控器麦克风：封死的

| 方案 | 结论 | 来源 |
|---|---|---|
| 第三方 app 读遥控器麦克风 | **不可能**。麦克风键固定给 Alexa，不暴露给应用 | Fire TV 开发者文档 |
| `android.speech.SpeechRecognizer` | **不可用**。Fire OS 没有 Google Play Services | 同上 |
| `RECORD_AUDIO` + USB / 蓝牙外置麦 | 有已知问题，Fire TV 3 代起多人反馈失败 | XDA 社区 |
| Video Skills Kit (VSK) | 只能做预定义指令：打开 app、播放、暂停、快进、换台 | 官方 |
| Media Session API | 只能做播放控制 | 官方 |
| In-App Voice Scrolling | 只能把语音映射成方向键，且**需要 Amazon 后台人工开通** | 官方 |

官方原话：apps **cannot capture arbitrary free-form speech or dictation**。

遥控器打字也不现实：26 个字母排成网格，方向键逐个点选，输一句话约两分钟。

## 二、所以：手机说话，电视显示

这不是绕过限制的权宜之计，是更对的分工。

> 送完孩子走回家的路上，她对着手机说一段话。
> 推门进来，电视上已经是今天了。

- **手机**是输入面。系统自带听写（iOS 中文听写极准），不用自己做 ASR，不用申请麦克风权限，不用处理口音和噪声。
- **电视**是环境面。全天亮着，抬头一眼就看见，遥控器打勾。

她不需要站在电视前规划一天——那本来就不是电视该干的事。

对应 Fire TV 赛道官方优先主题里的 **multi-modal UX**。

## 三、链路

```
手机网页（一个按钮，调系统听写）
      │  POST /braindump
      ▼
API Gateway → Lambda
      │
      ▼
AWS Bedrock（agent：一段话 → 今天的三件事）
      │
      ▼
DynamoDB（当天的 plan + 勾选状态）
      ▲
      │  GET /plan 轮询
Fire TV app
```

配对用二维码：电视上显示一个码，手机扫一下绑定。**不登录、不注册账号**——
这块屏是给一个很累的人用的，不该先要求她想一个密码。

## 四、为什么全链路放 AWS

除了它本来就合适，还有一条实际理由：

> **AWS Builder mini challenge**：用上 Bedrock / AgentCore / SageMaker
> → **+$5,000 现金 + $5,000 AWS credits**

一个项目最多可叠加「一个赛道奖 + 一个 mini challenge」，所以这是和 Fire TV 赛道奖并行的、不冲突的第二笔。

已于 2026-10-04 提交 $150 AWS 额度申请（5 个工作日处理）。

## 五、降级方案

如果提交前 AWS 这条没跑通，电视端可以退回「读本地 JSON」：
`client.ts` 已经是供应商无关的，plan 的形状固定，换数据来源不动界面。
录 demo 时手机那一端仍可演示，只是后端换成本地服务。

这条退路要保留到最后，不要把自己逼到只有一个方案能跑。
