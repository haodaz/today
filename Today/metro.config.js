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
config.resolver.blockList = [new RegExp(`^${nested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*$`)];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
};

module.exports = config;
