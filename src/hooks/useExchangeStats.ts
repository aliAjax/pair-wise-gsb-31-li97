import { computed } from 'vue';

import { ExchangeSaveState, ExchangeStatus } from '@/constants/exchange';
import type { Exchange } from '@/models/exchange';

/** 保存失败的请求仍是“请求”，但不计入待确认业务统计 */
const isActive = (item: Exchange) => item.save_state !== ExchangeSaveState.FAILED;

export const useExchangeStats = (exchanges: () => Exchange[]) => {
  return computed(() => ({
    total: exchanges().filter(isActive).length,
    pending: exchanges().filter((item) => isActive(item) && item.status === ExchangeStatus.PENDING).length,
    accepted: exchanges().filter((item) => isActive(item) && item.status === ExchangeStatus.ACCEPTED).length,
    rejected: exchanges().filter((item) => isActive(item) && item.status === ExchangeStatus.REJECTED).length,
    completed: exchanges().filter((item) => isActive(item) && item.status === ExchangeStatus.COMPLETED).length,
    failed: exchanges().filter((item) => !isActive(item)).length,
  }));
};
