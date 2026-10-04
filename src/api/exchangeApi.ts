import { EXCHANGE_ACTION_FLOW, ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { EXCHANGE_FLOW_MESSAGES } from '@/constants/messages';
import type { Exchange, ExchangeConflict, ExchangeDraft } from '@/models/exchange';

import { itemApi } from './itemApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

/** 版本冲突错误：页面打开时的版本已落后，操作不得覆盖新结果 */
export class VersionConflictError extends Error {
  code = 'VERSION_CONFLICT' as const;
  actualVersion: number;

  constructor(actualVersion: number) {
    super(EXCHANGE_FLOW_MESSAGES.versionConflict);
    this.actualVersion = actualVersion;
  }
}

const seedExchanges: Exchange[] = [
  {
    id: 'exchange_seed',
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    status: ExchangeStatus.PENDING,
    version: 1,
    conflicts: [],
    message: '露营椅换拍立得，可以同城当面交换。',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

/** 兼容旧数据：缺少版本/冲突字段时补默认值 */
const normalize = (exchange: Exchange): Exchange => ({
  ...exchange,
  version: exchange.version ?? 1,
  conflicts: exchange.conflicts ?? [],
});

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const exchanges = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
    if (exchanges.length) return exchanges.map(normalize);
    await storage.set(STORAGE_KEYS.exchanges, seedExchanges);
    return seedExchanges;
  },

  /** 发起交换：先占位双方物品，再落交换记录；任一步失败都会回滚预占 */
  async create(draft: ExchangeDraft): Promise<Exchange> {
    const exchanges = await this.list();
    const fromItem = await itemApi.detail(draft.from_item_id);
    const targetItem = await itemApi.detail(draft.to_item_id);
    if (!fromItem || fromItem.status !== ItemStatus.AVAILABLE) {
      throw new Error(EXCHANGE_FLOW_MESSAGES.itemLocked);
    }
    if (!targetItem || targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error(EXCHANGE_FLOW_MESSAGES.targetNotAvailable);
    }
    const nextExchange: Exchange = {
      ...draft,
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      version: 1,
      conflicts: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const locked: string[] = [];
    try {
      await itemApi.lockForExchange(draft.from_item_id, nextExchange.id);
      locked.push(draft.from_item_id);
      await itemApi.lockForExchange(draft.to_item_id, nextExchange.id);
      locked.push(draft.to_item_id);
      await storage.set(STORAGE_KEYS.exchanges, [nextExchange, ...exchanges]);
    } catch (error) {
      await Promise.all(locked.map((itemId) => itemApi.releaseLock(itemId, nextExchange.id)));
      throw error;
    }
    return nextExchange;
  },

  /**
   * 处理交换请求：必须带上打开页面时的版本号。
   * 版本已前进 → 追加冲突记录并抛 VersionConflictError，不覆盖新结果。
   */
  async transition(id: string, status: ExchangeStatus, expectedVersion: number): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');

    if (current.version !== expectedVersion) {
      const conflict: ExchangeConflict = {
        action: status,
        expected_version: expectedVersion,
        actual_version: current.version,
        reason: EXCHANGE_FLOW_MESSAGES.versionConflict,
        at: new Date().toISOString(),
      };
      const withConflict: Exchange = { ...current, conflicts: [...current.conflicts, conflict] };
      await storage.set(
        STORAGE_KEYS.exchanges,
        exchanges.map((item) => (item.id === id ? withConflict : item)),
      );
      throw new VersionConflictError(current.version);
    }

    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }

    const nextExchange: Exchange = {
      ...current,
      status,
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    };

    if (status === ExchangeStatus.REJECTED) {
      await itemApi.releaseLock(current.from_item_id, id);
      await itemApi.releaseLock(current.to_item_id, id);
    }
    if (status === ExchangeStatus.COMPLETED) {
      await itemApi.update(current.from_item_id, { status: ItemStatus.EXCHANGED, locked_by: null });
      await itemApi.update(current.to_item_id, { status: ItemStatus.EXCHANGED, locked_by: null });
    }
    await storage.set(
      STORAGE_KEYS.exchanges,
      exchanges.map((item) => (item.id === id ? nextExchange : item)),
    );
    return nextExchange;
  },
};
