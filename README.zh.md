# Today

**陪着你过好今天，就是过好每一天。**

客厅里那台电视，一整天大部分时间是黑的。打开它，它要么卖你东西，要么给你一条看不完的信息流。

Today 把它变成别的：一块全天亮着的、安静的屏，陪一位妈妈把今天过完。

- 抬头看一眼就知道现在几点、今天还剩什么
- 遥控器上下选，中间键打勾
- 一个温柔的 agent 总控：不提醒你还差多少，只把一天压成能做完的几件
- **不卖货，不推信息流，不做让你多看一眼的设计**

为 [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) 的 Fire TV 赛道而做。

---

## 它怎么用

她对着**手机**说一段话——乱的、重复的、带情绪的都行。
到家推门进来，**电视上已经是今天了**。

她不需要站在电视前规划一天。那本来就不是电视该干的事。
手机是输入面（系统听写最准），电视是环境面（抬头一眼就看见）。

详见 [doc/input-architecture.md](doc/input-architecture.md) —— 里面记了为什么不是遥控器语音（Fire TV 第三方 app 拿不到麦克风，官方文档明确不支持自由口述）。

## 它不做什么

这部分和它做什么一样重要，写在这里是为了将来有人想加功能时能回来看一眼：

- 不推荐内容
- 不接购物
- 不做通知红点、连续打卡、未完成计数这类让人焦虑的机制
- 不在晚上把屏幕拉到最亮

## agent 的三条规矩

写在 [`src/agent/prompt.js`](Today/src/agent/prompt.js) 里，一大半是「不许做什么」：

1. **最多三件，剩下的明确说「今天不做」。** 让人放心的不是清空列表，是知道什么被允许放下。
2. **三件里必须有一件是给她自己的**，而且**必须独立成立**——不许写成「买菜时顺便走走」。去掉那件家务它还得在。
3. **不打鸡血，不计数，不说教，不推荐任何商品。** 不提她落下多少。

第 2 条是实测加上去的：模型第一版把「出门走十分钟」挂在了「买牛奶和洗衣液」后面。那不是模型的错——真实世界里这件事本来就是这么发生的。所以要写死。

## 技术

| | |
|---|---|
| 平台 | Fire OS 8（Android 11 / API 30），实机 Toshiba 50C350NU |
| 框架 | Expo SDK 57 + [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) 0.86.3 |
| TV 配置 | [`@react-native-tvos/config-tv`](https://www.npmjs.com/package/@react-native-tvos/config-tv)，注入 `LEANBACK_LAUNCHER` / `touchscreen required=false` / `software.leanback` |
| 常亮 | `expo-keep-awake` |
| agent | 供应商无关（OpenAI 兼容），提交版走 AWS Bedrock |

### 两个为电视而做的设计决定

**1. 背景随一天的光线走。**
这块屏幕全天开着。固定一块高亮浅色面板从早亮到晚，既刺眼也费电。所以背景分四个时段：清晨偏冷、白天中性、傍晚转暖、入夜整块沉下来。这不是「深色模式」开关，是一天的光线变化。见 [`src/theme.ts`](Today/src/theme.ts)。

**2. 焦点必须三米外看得见。**
电视没有触屏，只有遥控器方向键。沙发离屏幕三米，手机上那种细微的描边变化等于没有。所以聚焦时整行放大、描边变主色、投影浮起。见 [`src/TaskRow.tsx`](Today/src/TaskRow.tsx)。

## 跑起来

```bash
cd Today
npm install
source ./env.sh
./release.sh     # 出自包含的 APK
./install.sh     # 连 Fire TV 并安装
```

需要在 Fire TV 上先开发者模式：**设置 → My Fire TV → About → 光标停在设备名上，中间键连按 7 下**，返回后 **Developer Options** 才会出现，进去打开 **ADB Debugging**。

调 agent 的 prompt 不用重编 APK：

```bash
PROVIDER=openai node scripts/plan.mjs "你想试的一段话"
```

## 许可

MIT，见 [LICENSE](LICENSE)。
