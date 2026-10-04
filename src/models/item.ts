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
  /** 乐观锁版本号：每次状态/内容变更 +1，交换流程据此判断页面数据是否过期 */
  version: number;
  /** 预占该物品的交换请求 id，仅 status 为 locked 时有值 */
  locked_by: string | null;
  location: string;
  created_at: string;
}

export type ItemDraft = Omit<Item, 'id' | 'status' | 'created_at' | 'version' | 'locked_by'> & {
  status?: ItemStatus;
};
