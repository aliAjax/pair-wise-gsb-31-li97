import type { ExchangeConflictReason, ExchangeSaveState } from '@/constants/exchange';
import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  status: ExchangeStatus;
  message: string;
  /** 交换记录自身的版本：每次处理结果落定后前进，防止旧页面覆盖新结果 */
  version: number;
  /** 发起预占成功后双方物品当时的版本，处理时携带打开页面看到的版本做比对 */
  from_item_version: number;
  to_item_version: number;
  /** 保存状态：normal 正常请求；failed 保存失败后保留的请求，可重试 */
  save_state: ExchangeSaveState;
  /** 最近一次保存失败的原因 */
  last_error: string;
  /** 保存失败后的重试次数 */
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<
  Exchange,
  | 'id'
  | 'status'
  | 'version'
  | 'from_item_version'
  | 'to_item_version'
  | 'save_state'
  | 'last_error'
  | 'retry_count'
  | 'created_at'
  | 'updated_at'
> & {
  status?: ExchangeStatus;
  version?: number;
  from_item_version?: number;
  to_item_version?: number;
  save_state?: ExchangeSaveState;
  last_error?: string;
  retry_count?: number;
};

/** 处理交换时携带的版本快照，来自打开页面时渲染的数据 */
export interface ExchangeVersionToken {
  exchangeVersion: number;
  fromItemVersion: number;
  toItemVersion: number;
}

/** 版本冲突时写入的冲突记录，冲突操作不能覆盖已经前进的新结果 */
export interface ExchangeConflict {
  id: string;
  exchange_id: string;
  operator_user_id: string;
  attempted_status: ExchangeStatus;
  reason: ExchangeConflictReason;
  /** 打开页面时携带的版本 */
  expected_exchange_version: number;
  current_exchange_version: number;
  expected_from_item_version: number;
  current_from_item_version: number;
  expected_to_item_version: number;
  current_to_item_version: number;
  message: string;
  created_at: string;
}
