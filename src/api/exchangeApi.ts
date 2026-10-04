import {
  EXCHANGE_ACTION_FLOW,
  EXCHANGE_ITEM_FLOW,
  ExchangeConflictReason,
  ExchangeSaveState,
  ExchangeStatus,
} from '@/constants/exchange';
import { ITEM_INITIAL_VERSION, ItemStatus } from '@/constants/item';
import type { Exchange, ExchangeDraft, ExchangeVersionToken } from '@/models/exchange';

import { conflictApi, type ConflictDraft } from './conflictApi';
import { ItemVersionConflictError, ExchangeConflictError } from './errors';
import { itemApi } from './itemApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const seedExchanges: Exchange[] = [
  {
    id: 'exchange_seed',
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    status: ExchangeStatus.PENDING,
    message: '露营椅换拍立得，可以同城当面交换。',
    version: 1,
    from_item_version: 2,
    to_item_version: 2,
    save_state: ExchangeSaveState.NORMAL,
    last_error: '',
    retry_count: 0,
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

/** 补齐旧数据缺失的版本与保存状态字段 */
const normalizeExchange = (exchange: Exchange): Exchange => ({
  ...exchange,
  version: typeof exchange.version === 'number' ? exchange.version : ITEM_INITIAL_VERSION,
  from_item_version: exchange.from_item_version ?? ITEM_INITIAL_VERSION,
  to_item_version: exchange.to_item_version ?? ITEM_INITIAL_VERSION,
  save_state: exchange.save_state ?? ExchangeSaveState.NORMAL,
  last_error: exchange.last_error ?? '',
  retry_count: exchange.retry_count ?? 0,
});

/**
 * 同窗口内串行化交换写入。两个处理动作即使几乎同时点下，
 * 也按拿到版本的先后顺序排队，后一个看到的是已前进的版本。
 */
let writeQueue: Promise<unknown> = Promise.resolve();
const withLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
};

export interface RetryResult {
  ok: boolean;
  exchange: Exchange;
  reason?: string;
}

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const stored = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
    if (!stored.length) {
      await storage.set(STORAGE_KEYS.exchanges, seedExchanges);
    }
    const exchanges = stored.length ? stored.map(normalizeExchange) : seedExchanges;
    // 迁移/种子补齐占用，返回与物品版本一致的快照，避免刚读完就拿旧版本操作
    return this.reconcileOccupation(exchanges);
  },

  /**
   * 迁移旧数据：待确认/已同意的正常请求对应的物品若仍是可交换，
   * 补做预占，保证物品列表、详情、交换记录看到同一个占用状态。
   * 返回迁移后的交换快照（其物品版本字段与最新物品一致）。
   */
  async reconcileOccupation(exchanges: Exchange[]): Promise<Exchange[]> {
    const active = exchanges.filter(
      (item) =>
        item.save_state !== ExchangeSaveState.FAILED &&
        (item.status === ExchangeStatus.PENDING || item.status === ExchangeStatus.ACCEPTED),
    );
    if (!active.length) return exchanges;
    const items = await itemApi.list();
    let itemDirty = false;
    const nextItems = [...items];
    const reserve = (itemId: string) => {
      const index = nextItems.findIndex((item) => item.id === itemId);
      const current = nextItems[index];
      if (current && current.status === ItemStatus.AVAILABLE) {
        nextItems[index] = { ...current, status: ItemStatus.RESERVED, version: current.version + 1 };
        itemDirty = true;
      }
      return nextItems[index];
    };
    const nextExchanges = exchanges.map((exchange) => {
      if (!active.includes(exchange)) return exchange;
      const fromItem = reserve(exchange.from_item_id);
      const toItem = reserve(exchange.to_item_id);
      if (
        fromItem &&
        toItem &&
        (exchange.from_item_version !== fromItem.version || exchange.to_item_version !== toItem.version)
      ) {
        return { ...exchange, from_item_version: fromItem.version, to_item_version: toItem.version };
      }
      return exchange;
    });
    const exchangeDirty = nextExchanges.some((item, index) => item !== exchanges[index]);
    if (itemDirty) await storage.set(STORAGE_KEYS.items, nextItems);
    if (exchangeDirty) await storage.set(STORAGE_KEYS.exchanges, nextExchanges);
    return nextExchanges;
  },

  /**
   * 发起交换：预占双方物品，成功后才落交换记录。
   * 任一物品不可预占或保存失败，都保留一条 failed 请求和原因，允许重试。
   */
  async create(draft: ExchangeDraft): Promise<Exchange> {
    return withLock(async () => {
      // list 可能迁移旧数据并推进物品/交换版本，以它返回的快照为准继续写入
      const exchanges = await this.list();
      const failedExchange: Exchange = {
        ...draft,
        id: storage.createId('exchange'),
        status: ExchangeStatus.PENDING,
        version: ITEM_INITIAL_VERSION,
        from_item_version: 0,
        to_item_version: 0,
        save_state: ExchangeSaveState.FAILED,
        last_error: '',
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const persistFailed = async (reason: string): Promise<Exchange> => {
        const latest = await this.list();
        const next = { ...failedExchange, last_error: reason };
        await storage.set(STORAGE_KEYS.exchanges, [next, ...latest.filter((item) => item.id !== next.id)]);
        return next;
      };

      try {
        const [fromItem, toItem] = await Promise.all([
          itemApi.detail(draft.from_item_id),
          itemApi.detail(draft.to_item_id),
        ]);
        if (!fromItem) throw new Error('我的物品不存在或已被删除');
        if (!toItem) throw new Error('目标物品不存在或已被删除');
        if (draft.from_item_id === draft.to_item_id) throw new Error('不能用同一件物品发起交换');
        if (fromItem.status !== ItemStatus.AVAILABLE) throw new Error('我的物品当前不是可交换状态');
        if (toItem.status !== ItemStatus.AVAILABLE) throw new Error('目标物品已被其他交换请求预占');

        const reservedFrom = await itemApi.compareAndSetStatus(
          fromItem.id,
          ItemStatus.RESERVED,
          fromItem.version,
        );
        try {
          const reservedTo = await itemApi.compareAndSetStatus(toItem.id, ItemStatus.RESERVED, toItem.version);
          const nextExchange: Exchange = {
            ...failedExchange,
            version: ITEM_INITIAL_VERSION,
            from_item_version: reservedFrom.version,
            to_item_version: reservedTo.version,
            save_state: ExchangeSaveState.NORMAL,
            last_error: '',
          };
          const latest = await this.list();
          await storage.set(
            STORAGE_KEYS.exchanges,
            [nextExchange, ...latest.filter((item) => item.id !== nextExchange.id)],
          );
          return nextExchange;
        } catch (error) {
          // 预占目标失败，回滚先预占的己方物品，避免物品被幽灵占用
          await itemApi.setStatus(fromItem.id, ItemStatus.AVAILABLE);
          throw error;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : '交换请求保存失败';
        return persistFailed(reason);
      }
    });
  },

  /** 重试保存失败的请求：重新尝试预占，成功则转回正常请求 */
  async retryFailed(id: string): Promise<RetryResult> {
    return withLock(async () => {
      const exchanges = await this.list();
      const current = exchanges.find((item) => item.id === id);
      if (!current) throw new Error('交换请求不存在');
      if (current.save_state !== ExchangeSaveState.FAILED) return { ok: true, exchange: current };

      const persist = async (reason?: string): Promise<RetryResult> => {
        const updated: Exchange = reason
          ? { ...current, retry_count: current.retry_count + 1, last_error: reason, updated_at: new Date().toISOString() }
          : {
              ...current,
              from_item_version: reservedVersions.from,
              to_item_version: reservedVersions.to,
              save_state: ExchangeSaveState.NORMAL,
              last_error: '',
              retry_count: current.retry_count + 1,
              updated_at: new Date().toISOString(),
            };
        await storage.set(
          STORAGE_KEYS.exchanges,
          exchanges.map((item) => (item.id === id ? updated : item)),
        );
        return { ok: !reason, exchange: updated, reason };
      };
      const reservedVersions = { from: current.from_item_version, to: current.to_item_version };

      try {
        const [fromItem, toItem] = await Promise.all([
          itemApi.detail(current.from_item_id),
          itemApi.detail(current.to_item_id),
        ]);
        if (!fromItem) throw new Error('我的物品不存在或已被删除');
        if (!toItem) throw new Error('目标物品不存在或已被删除');
        if (fromItem.status !== ItemStatus.AVAILABLE) throw new Error('我的物品当前不是可交换状态');
        if (toItem.status !== ItemStatus.AVAILABLE) throw new Error('目标物品已被其他交换请求预占或下架');

        const reservedFrom = await itemApi.compareAndSetStatus(
          fromItem.id,
          ItemStatus.RESERVED,
          fromItem.version,
        );
        try {
          const reservedTo = await itemApi.compareAndSetStatus(toItem.id, ItemStatus.RESERVED, toItem.version);
          reservedVersions.from = reservedFrom.version;
          reservedVersions.to = reservedTo.version;
          return await persist();
        } catch (error) {
          await itemApi.setStatus(fromItem.id, ItemStatus.AVAILABLE);
          throw error;
        }
      } catch (error) {
        return persist(error instanceof Error ? error.message : '交换请求保存失败');
      }
    });
  },

  /** 放弃保存失败的请求（本来就没有预占物品，直接删除） */
  async discardFailed(id: string): Promise<void> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (current?.save_state === ExchangeSaveState.FAILED) {
      await storage.set(
        STORAGE_KEYS.exchanges,
        exchanges.filter((item) => item.id !== id),
      );
    }
  },

  /**
   * 处理交换（同意/拒绝/完成），必须携带打开页面时的版本。
   * 交换记录版本或物品版本已前进，就追加一条冲突记录并抛错，绝不覆盖新结果。
   */
  async transition(
    id: string,
    status: ExchangeStatus,
    token: ExchangeVersionToken,
    operatorUserId: string,
  ): Promise<Exchange> {
    return withLock(async () => {
      const exchanges = await this.list();
      const current = exchanges.find((item) => item.id === id);
      if (!current) throw new Error('交换请求不存在');
      if (current.save_state === ExchangeSaveState.FAILED) {
        throw new Error('这条请求上次保存失败，请先重试或放弃');
      }

      const [fromItem, toItem] = await Promise.all([
        itemApi.detail(current.from_item_id),
        itemApi.detail(current.to_item_id),
      ]);

      const buildConflictDraft = (reason: ExchangeConflictReason, message: string): ConflictDraft => ({
        exchange_id: id,
        operator_user_id: operatorUserId,
        attempted_status: status,
        reason,
        expected_exchange_version: token.exchangeVersion,
        current_exchange_version: current.version,
        expected_from_item_version: token.fromItemVersion,
        current_from_item_version: fromItem?.version ?? 0,
        expected_to_item_version: token.toItemVersion,
        current_to_item_version: toItem?.version ?? 0,
        message,
      });

      const raiseConflict = async (
        reason: ExchangeConflictReason,
        message: string,
      ): Promise<never> => {
        const conflict = await conflictApi.append(buildConflictDraft(reason, message));
        throw new ExchangeConflictError(reason, conflict, message);
      };

      // 版本校验优先：旧页面即使点的是“已失效”的按钮，也只留冲突而不是报状态错误
      // 交换记录本身已被另一个窗口推进：只留冲突，不覆盖新结果
      if (current.version !== token.exchangeVersion) {
        await raiseConflict(
          ExchangeConflictReason.EXCHANGE_VERSION_STALE,
          `交换记录版本已前进（${token.exchangeVersion} → ${current.version}），当前结果为「${current.status}」`,
        );
      }
      if (!fromItem || !toItem) {
        throw new Error('交换关联的物品已不存在，无法处理');
      }
      // 物品占用版本已被其他交换流程推进：同样只留冲突
      if (fromItem.version !== token.fromItemVersion || toItem.version !== token.toItemVersion) {
        await raiseConflict(
          ExchangeConflictReason.ITEM_VERSION_STALE,
          `物品占用状态已更新（对方窗口或其他交换已先行处理），请刷新后查看最新结果`,
        );
      }
      // 版本一致时才校验业务状态机
      if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
        throw new Error('当前状态不允许该操作');
      }

      const target = EXCHANGE_ITEM_FLOW[status];
      let nextFrom = fromItem;
      let nextTo = toItem;
      try {
        // 每次处理都推进双方物品版本：同意保持占用、拒绝释放、完成转已交换
        nextFrom = await itemApi.compareAndSetStatus(
          fromItem.id,
          target?.from ?? fromItem.status,
          fromItem.version,
        );
        nextTo = await itemApi.compareAndSetStatus(
          toItem.id,
          target?.to ?? toItem.status,
          toItem.version,
        );
      } catch (error) {
        if (error instanceof ItemVersionConflictError) {
          await raiseConflict(ExchangeConflictReason.ITEM_VERSION_STALE, error.message);
        }
        throw error;
      }

      const nextExchange: Exchange = {
        ...current,
        status,
        version: current.version + 1,
        from_item_version: nextFrom.version,
        to_item_version: nextTo.version,
        updated_at: new Date().toISOString(),
      };
      await storage.set(
        STORAGE_KEYS.exchanges,
        exchanges.map((item) => (item.id === id ? nextExchange : item)),
      );
      return nextExchange;
    });
  },
};
