import { ItemCondition, ItemStatus } from '@/constants/item';

export interface Item {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition;
  images: string[];
  status: ItemStatus;
  /** 占用版本号：每次预占/释放/确认交换都会前进，处理请求时据此做乐观锁校验 */
  version: number;
  location: string;
  created_at: string;
}

export type ItemDraft = Omit<Item, 'id' | 'status' | 'version' | 'created_at'> & {
  status?: ItemStatus;
  version?: number;
};
