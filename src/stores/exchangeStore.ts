import { defineStore } from 'pinia';

import { conflictApi } from '@/api/conflictApi';
import { ExchangeConflictError } from '@/api/errors';
import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeSaveState, ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeConflict, ExchangeDraft, ExchangeVersionToken } from '@/models/exchange';
import { useItemStore } from '@/stores/itemStore';
import { message } from '@/utils/message';

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    conflicts: [] as ExchangeConflict[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
  }),
  getters: {
    // 保存失败的请求只算在“我发起的”里，不混入对方的收件箱
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) =>
      state.exchanges.filter(
        (item) => item.to_user_id === userId && item.save_state === ExchangeSaveState.NORMAL,
      ),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        // exchangeApi.list 可能迁移预占并推进物品版本，物品数据随后一起刷新
        this.exchanges = await exchangeApi.list();
        this.conflicts = await conflictApi.list();
        await useItemStore().hydrate();
      } finally {
        this.loading = false;
      }
    },

    /** 物品与交换记录一起刷新，保证列表、详情、记录显示同一个占用状态 */
    async refreshAll() {
      await this.hydrate();
    },

    async create(draft: ExchangeDraft) {
      const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
      await this.refreshAll();
      if (exchange.save_state === ExchangeSaveState.FAILED) {
        message(`交换请求保存失败，已保留请求和原因，可重试：${exchange.last_error}`, 'error');
        return exchange;
      }
      message('交换请求已发出，双方物品已预占', 'success');
      return exchange;
    },

    async retry(id: string) {
      const result = await exchangeApi.retryFailed(id);
      await this.refreshAll();
      if (result.ok) {
        message('已重新发起交换，双方物品完成预占', 'success');
      } else {
        message(`重试仍未成功，请求已保留：${result.reason}`, 'error');
      }
      return result;
    },

    async discardFailed(id: string) {
      await exchangeApi.discardFailed(id);
      await this.refreshAll();
      message('已放弃这条未保存成功的请求', 'success');
    },

    async accept(id: string, token: ExchangeVersionToken, operatorUserId: string) {
      await this.runTransition(id, ExchangeStatus.ACCEPTED, token, '已同意交换', operatorUserId);
    },
    async reject(id: string, token: ExchangeVersionToken, operatorUserId: string) {
      await this.runTransition(id, ExchangeStatus.REJECTED, token, '已拒绝交换，物品占用已释放', operatorUserId);
    },
    async complete(id: string, token: ExchangeVersionToken, operatorUserId: string) {
      await this.runTransition(id, ExchangeStatus.COMPLETED, token, '交换已完成，双方物品状态已更新', operatorUserId);
    },

    async runTransition(
      id: string,
      status: ExchangeStatus,
      token: ExchangeVersionToken,
      successText: string,
      operatorUserId: string,
    ) {
      try {
        await exchangeApi.transition(id, status, token, operatorUserId);
        await this.refreshAll();
        message(successText, 'success');
        return true;
      } catch (error) {
        // 版本已前进：冲突记录已由 API 落库，这里只刷新，不覆盖新结果
        await this.refreshAll();
        if (error instanceof ExchangeConflictError) {
          message(`操作未生效：${error.message}（已留下冲突记录）`, 'error');
          return false;
        }
        message(error instanceof Error ? error.message : '操作失败', 'error');
        return false;
      }
    },

    async dismissConflict(id: string) {
      await conflictApi.remove(id);
      this.conflicts = await conflictApi.list();
    },
  },
});
