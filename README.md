# Hearth

**一块留给妈妈的屏幕。**

客厅里那台电视，一整天大部分时间是黑的。打开它，它要么卖你东西，要么给你一条看不完的信息流。

Hearth 把它变成别的：一块全天亮着的、安静的屏，帮你把一天理顺。

- 抬头看一眼就知道现在几点、今天剩什么
- 遥控器上下选，中间键打勾
- 一个温柔的 agent 总控：不是提醒你还差多少，是替你把一天压成能做完的几件
- **不卖货，不推信息流，不做让你多看一眼的设计**

为 [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/) 的 Fire TV 赛道而做。

---

## 为什么是电视

「闺蜜机」在中国是成立的品类——一块立起来的大屏，陪着你做家务、看菜谱、过日子。它卖五百美元。

但多数家里已经有一块更大的屏了，而且一天里大部分时间闲着。

Hearth 不要你买硬件。

## 它不做什么

这部分和它做什么一样重要，写在这里是为了将来有人想加功能时能回来看一眼：

- 不推荐内容
- 不接购物
- 不做通知红点、连续打卡、未完成计数这类让你焦虑的机制
- 不在晚上把屏幕拉到最亮

## 技术

| | |
|---|---|
| 平台 | Fire OS 8（Android 11 / API 30），实机 Toshiba 50C350NU |
| 框架 | Expo SDK 57 + [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) 0.86.3 |
| TV 配置 | [`@react-native-tvos/config-tv`](https://www.npmjs.com/package/@react-native-tvos/config-tv)，注入 `LEANBACK_LAUNCHER` / `touchscreen required=false` / `software.leanback` |
| 常亮 | `expo-keep-awake`（防止系统屏保盖掉） |

### 两个为电视而做的设计决定

**1. 背景随一天的光线走。**
这块屏幕全天开着。固定一块高亮浅色面板从早亮到晚，既刺眼也费电。所以背景分四个时段：清晨偏冷、白天中性、傍晚转暖、入夜整块沉下来。这不是「深色模式」开关，是一天的光线变化。见 [`src/theme.ts`](Hearth/src/theme.ts)。

**2. 焦点必须三米外看得见。**
电视没有触屏，只有遥控器方向键。沙发离屏幕三米，手机上那种细微的描边变化等于没有。所以聚焦时整行放大、描边变主色、投影浮起。见 [`src/TaskRow.tsx`](Hearth/src/TaskRow.tsx)。

## 跑起来

```bash
cd Hearth
npm install
source ./env.sh
./release.sh     # 出自包含的 APK
./install.sh     # 连 Fire TV 并安装
```

需要在 Fire TV 上先开：**设置 → My Fire TV → Developer Options → ADB Debugging + Apps from Unknown Sources**。

## 许可

MIT，见 [LICENSE](LICENSE)。
