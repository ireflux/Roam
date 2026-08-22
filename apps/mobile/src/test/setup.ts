/**
 * Node 环境单测的全局 stub：store/services 不直接 import expo，
 * 但 crypto.randomUUID 在 node 20+ 原生可用，无需处理。
 */
process.env.EXPO_PUBLIC_API_BASE_URL = "";
