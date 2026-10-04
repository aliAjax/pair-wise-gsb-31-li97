import { onMounted, onUnmounted } from 'vue';

import { STORAGE_KEYS, storage } from '@/utils/storage';

/**
 * 监听其他窗口对物品 / 交换 / 冲突数据的写入。
 * 两个窗口同时打开交换管理页时，一个窗口处理后另一个窗口立即刷新版本，
 * 再点处理就会带着旧版本走到冲突分支，而不是静默覆盖新结果。
 */
export const useStorageSync = (onChange: () => void | Promise<void>) => {
  let unsubscribe: (() => void) | undefined;
  const keys = [
    STORAGE_KEYS.items,
    STORAGE_KEYS.exchanges,
    STORAGE_KEYS.exchangeConflicts,
  ];

  onMounted(() => {
    unsubscribe = storage.subscribe(keys, () => {
      void onChange();
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });
};
