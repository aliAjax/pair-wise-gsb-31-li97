import { ExchangeStatus } from '@/constants/exchange';

/** 版本冲突记录：处理交换请求时携带的版本已过期，操作被拒绝并留痕 */
export interface ExchangeConflict {
  /** 当时想执行的目标状态（同意/拒绝/完成） */
  action: ExchangeStatus;
  /** 打开页面时看到的版本 */
  expected_version: number;
  /** 存储里已前进到的版本 */
  actual_version: number;
  reason: string;
  at: string;
}

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  status: ExchangeStatus;
  /** 乐观锁版本号：每次状态流转 +1，处理请求时必须带上打开页面时的版本 */
  version: number;
  /** 历史冲突记录，只追加不覆盖 */
  conflicts: ExchangeConflict[];
  message: string;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<Exchange, 'id' | 'status' | 'created_at' | 'updated_at' | 'version' | 'conflicts'> & {
  status?: ExchangeStatus;
};

/** 保存失败后暂存的待重试动作（保留请求与失败原因） */
export interface FailedExchangeAction {
  exchangeId: string;
  action: ExchangeStatus;
  expectedVersion: number;
  reason: string;
  at: string;
}

/** 保存失败后暂存的待重试发起草稿 */
export interface FailedExchangeDraft {
  id: string;
  draft: ExchangeDraft;
  reason: string;
  at: string;
}
