/* eslint-disable */
// 交换占用 + 版本冲突流程的本地集成测试运行器。
// 用法：node scripts/run-flow-test.cjs（需要 devDependency fake-indexeddb）
const esbuild = require('esbuild');
const path = require('path');

const mem = new Map();
const localStorageShim = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
globalThis.localStorage = localStorageShim;
const windowShim = { addEventListener: () => {}, removeEventListener: () => {} };
globalThis.window = windowShim;
globalThis.crypto = require('crypto').webcrypto;
const { IDBFactory } = require('fake-indexeddb');
globalThis.indexedDB = new IDBFactory();

const root = path.resolve(__dirname, '..');
const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'reswap-flow.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  alias: { '@': path.join(root, 'src') },
});
if (result.errors.length) {
  console.error(result.errors);
  process.exit(1);
}
new Function(
  'require',
  'indexedDB',
  'localStorage',
  'window',
  'crypto',
  result.outputFiles[0].text,
)(require, globalThis.indexedDB, localStorageShim, windowShim, globalThis.crypto);
