import { ItemStatus } from './item';

export enum ExchangeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

/** 请求保存状态：保存失败的请求会保留原因并允许重试，不会直接丢弃 */
export enum ExchangeSaveState {
  NORMAL = 'normal',
  FAILED = 'failed',
}

/** 乐观锁版本冲突的原因分类，会原样写入冲突记录 */
export enum ExchangeConflictReason {
  ITEM_VERSION_STALE = 'item_version_stale',
  EXCHANGE_VERSION_STALE = 'exchange_version_stale',
}

export const EXCHANGE_STATUS_OPTIONS = [
  { label: '待确认', value: ExchangeStatus.PENDING },
  { label: '已同意', value: ExchangeStatus.ACCEPTED },
  { label: '已拒绝', value: ExchangeStatus.REJECTED },
  { label: '已完成', value: ExchangeStatus.COMPLETED },
];

export const EXCHANGE_ACTION_FLOW: Record<ExchangeStatus, ExchangeStatus[]> = {
  [ExchangeStatus.PENDING]: [ExchangeStatus.ACCEPTED, ExchangeStatus.REJECTED],
  [ExchangeStatus.ACCEPTED]: [ExchangeStatus.COMPLETED],
  [ExchangeStatus.REJECTED]: [],
  [ExchangeStatus.COMPLETED]: [],
};

/**
 * 各处理动作下双方物品的目标占用状态。
 * 同意交换时仍保持占用中，但物品版本会随处理结果前进；
 * 未列出的动作沿用物品当前状态，版本同样前进，使旧页面快照失效。
 */
export const EXCHANGE_ITEM_FLOW: Partial<
  Record<ExchangeStatus, Partial<Record<'from' | 'to', ItemStatus>>>
> = {
  [ExchangeStatus.REJECTED]: { from: ItemStatus.AVAILABLE, to: ItemStatus.AVAILABLE },
  [ExchangeStatus.COMPLETED]: { from: ItemStatus.EXCHANGED, to: ItemStatus.EXCHANGED },
};

export const EXCHANGE_STORAGE_HINTS = {
  statusKey: 'reswap:exchanges',
  statusTouchedBy: ['models/exchange.ts', 'stores/exchangeStore.ts', 'components/common/ExchangeCard.vue'],
};
