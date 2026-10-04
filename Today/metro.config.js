const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

/**
 * react-native 被别名到 react-native-tvos，但 @react-native/* 那几个工具包
 * 仍然声明依赖真正的 react-native@0.86.3，npm 会把它嵌装到
 * node_modules/react-native/node_modules/react-native。
 *
 * 两份 react-native 同时进 bundle 会产生两个 view config 注册表：
 * 一份注册了 RCTText，另一份查不到，启动即崩
 * （Invariant Violation: View config getter callback for component `RCTText`
 *  must be a function (received `undefined`)）。
 *
 * 这里把嵌套那份从打包范围里屏蔽掉，解析会向上落到唯一的 tvos 那份。
 */
const nested = path.resolve(__dirname, 'node_modules/react-native/node_modules/react-native');
const nestedRe = new RegExp(`^${nested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*$`);

// 追加，不是替换。Expo 的默认 blockList 排除了 android/app/build、.expo/types 等，
// 直接赋值会把它们放回打包范围——Metro 会去扫构建产物，慢且可能打包进垃圾。
config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), nestedRe];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

module.exports = config;
