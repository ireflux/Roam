const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
// pnpm workspace 根目录：monorepo 内共享包（@roam/core 等）从这里解析
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 监听 workspace 源码包变更（热更新 @roam/core）
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 源码 TS 包直接进 transformer（无构建产物）
config.transformer.allowOptionalDependencies = true;

module.exports = config;
