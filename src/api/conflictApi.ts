import type { ExchangeConflictReason } from '@/constants/exchange';
import { ExchangeStatus } from '@/constants/exchange';
import type { ExchangeConflict } from '@/models/exchange';

import { storage, STORAGE_KEYS } from '@/utils/storage';

export interface ConflictDraft {
  exchange_id: string;
  operator_user_id: string;
  attempted_status: ExchangeStatus;
  reason: ExchangeConflictReason;
  expected_exchange_version: number;
  current_exchange_version: number;
  expected_from_item_version: number;
  current_from_item_version: number;
  expected_to_item_version: number;
  current_to_item_version: number;
  message: string;
}

/** 冲突记录只追加，不允许修改或覆盖，保证旧页面的处理不会冲掉新结果 */
export const conflictApi = {
  async list(): Promise<ExchangeConflict[]> {
    return storage.get<ExchangeConflict[]>(STORAGE_KEYS.exchangeConflicts, []);
  },

  async append(draft: ConflictDraft): Promise<ExchangeConflict> {
    const conflicts = await this.list();
    const conflict: ExchangeConflict = {
      ...draft,
      id: storage.createId('conflict'),
      created_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.exchangeConflicts, [conflict, ...conflicts]);
    return conflict;
  },

  async remove(id: string): Promise<void> {
    const conflicts = await this.list();
    await storage.set(
      STORAGE_KEYS.exchangeConflicts,
      conflicts.filter((item) => item.id !== id),
    );
  },
};
