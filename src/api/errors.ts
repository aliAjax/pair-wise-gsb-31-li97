import type { ExchangeConflictReason } from '@/constants/exchange';
import type { ExchangeConflict } from '@/models/exchange';

/** 物品版本已前进时抛出，携带当前版本供调用方记录冲突 */
export class ItemVersionConflictError extends Error {
  currentVersion: number;
  expectedVersion: number;

  constructor(message: string, expectedVersion: number, currentVersion: number) {
    super(message);
    this.name = 'ItemVersionConflictError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/**
 * 交换处理时的乐观锁冲突（物品版本或交换记录版本已前进）。
 * 冲突记录已由 API 层落库，错误对象里带回记录，调用方不得再覆盖新结果。
 */
export class ExchangeConflictError extends Error {
  reason: ExchangeConflictReason;
  conflict: ExchangeConflict;

  constructor(reason: ExchangeConflictReason, conflict: ExchangeConflict, message: string) {
    super(message);
    this.name = 'ExchangeConflictError';
    this.reason = reason;
    this.conflict = conflict;
  }
}
