import { defineStore } from 'pinia';

import { exchangeApi, VersionConflictError } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import { EXCHANGE_FLOW_MESSAGES } from '@/constants/messages';
import type {
  Exchange,
  ExchangeDraft,
  FailedExchangeAction,
  FailedExchangeDraft,
} from '@/models/exchange';
import { message } from '@/utils/message';

export interface ExchangeActResult {
  ok: boolean;
  conflict?: boolean;
  /** 成功或冲突后存储里的最新版本，页面用它刷新打开时的版本快照 */
  version?: number;
}

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
    /** 保存失败待重试的处理动作（按交换 id 保留请求与原因） */
    failedActions: {} as Record<string, FailedExchangeAction>,
    /** 保存失败待重试的发起草稿 */
    failedCreates: [] as FailedExchangeDraft[],
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.exchanges = await exchangeApi.list();
      } finally {
        this.loading = false;
      }
    },
    async create(draft: ExchangeDraft) {
      try {
        const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
        this.exchanges = await exchangeApi.list();
        message(EXCHANGE_FLOW_MESSAGES.created, 'success');
        return exchange;
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知原因';
        this.failedCreates.push({
          id: `failed_${Date.now()}`,
          draft: { ...draft },
          reason,
          at: new Date().toISOString(),
        });
        message(EXCHANGE_FLOW_MESSAGES.saveFailed(reason), 'error');
        return null;
      }
    },
    /** 重试保存失败的发起请求，成功后移除暂存草稿 */
    async retryCreate(failedId: string) {
      const failed = this.failedCreates.find((item) => item.id === failedId);
      if (!failed) return null;
      try {
        const exchange = await exchangeApi.create({ ...failed.draft, status: ExchangeStatus.PENDING });
        this.failedCreates = this.failedCreates.filter((item) => item.id !== failedId);
        this.exchanges = await exchangeApi.list();
        message(EXCHANGE_FLOW_MESSAGES.retryDone, 'success');
        return exchange;
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知原因';
        failed.reason = reason;
        failed.at = new Date().toISOString();
        message(EXCHANGE_FLOW_MESSAGES.saveFailed(reason), 'error');
        return null;
      }
    },
    discardFailedCreate(failedId: string) {
      this.failedCreates = this.failedCreates.filter((item) => item.id !== failedId);
    },
    async act(id: string, status: ExchangeStatus, expectedVersion: number): Promise<ExchangeActResult> {
      try {
        const updated = await exchangeApi.transition(id, status, expectedVersion);
        this.exchanges = await exchangeApi.list();
        delete this.failedActions[id];
        if (status === ExchangeStatus.ACCEPTED) message(EXCHANGE_FLOW_MESSAGES.accepted, 'success');
        if (status === ExchangeStatus.REJECTED) message(EXCHANGE_FLOW_MESSAGES.rejected, 'success');
        if (status === ExchangeStatus.COMPLETED) message(EXCHANGE_FLOW_MESSAGES.completed, 'success');
        return { ok: true, version: updated.version };
      } catch (error) {
        this.exchanges = await exchangeApi.list();
        if (error instanceof VersionConflictError) {
          message(EXCHANGE_FLOW_MESSAGES.versionConflict, 'error');
          return { ok: false, conflict: true, version: error.actualVersion };
        }
        const reason = error instanceof Error ? error.message : '未知原因';
        this.failedActions[id] = {
          exchangeId: id,
          action: status,
          expectedVersion,
          reason,
          at: new Date().toISOString(),
        };
        message(EXCHANGE_FLOW_MESSAGES.saveFailed(reason), 'error');
        return { ok: false };
      }
    },
    async accept(id: string, expectedVersion: number) {
      return this.act(id, ExchangeStatus.ACCEPTED, expectedVersion);
    },
    async reject(id: string, expectedVersion: number) {
      return this.act(id, ExchangeStatus.REJECTED, expectedVersion);
    },
    async complete(id: string, expectedVersion: number) {
      return this.act(id, ExchangeStatus.COMPLETED, expectedVersion);
    },
    /** 保存失败后按原请求与原因重试 */
    async retry(id: string): Promise<ExchangeActResult> {
      const failed = this.failedActions[id];
      if (!failed) return { ok: false };
      return this.act(id, failed.action, failed.expectedVersion);
    },
  },
});
