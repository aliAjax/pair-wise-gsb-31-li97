import { ItemCondition, ItemStatus } from '@/constants/item';
import { EXCHANGE_FLOW_MESSAGES } from '@/constants/messages';
import type { Item, ItemDraft } from '@/models/item';

import { storage, STORAGE_KEYS } from '@/utils/storage';

const seedItems: Item[] = [
  {
    id: 'item_camera',
    user_id: 'user_lin',
    title: '富士拍立得 Mini 旧机',
    description: '成色干净，附一包相纸，想换小型蓝牙音箱或桌面灯。',
    category: '数码',
    condition: ItemCondition.GOOD,
    images: [],
    status: ItemStatus.LOCKED,
    version: 2,
    locked_by: 'exchange_seed',
    location: '杭州 · 西湖',
    created_at: new Date().toISOString(),
  },
  {
    id: 'item_books',
    user_id: 'user_chen',
    title: '设计与产品书 6 本',
    description: '搬家清书柜，适合产品/视觉入门，接受换绿植、咖啡器具。',
    category: '书籍',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    version: 1,
    locked_by: null,
    location: '苏州 · 工业园',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'item_chair',
    user_id: 'user_me',
    title: '可折叠露营椅',
    description: '去年买的，露营两次，有轻微使用痕迹，想换收纳盒。',
    category: '运动',
    condition: ItemCondition.GOOD,
    images: [],
    status: ItemStatus.LOCKED,
    version: 2,
    locked_by: 'exchange_seed',
    location: '上海 · 徐汇',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'item_keyboard',
    user_id: 'user_chen',
    title: '青轴机械键盘',
    description: '换轴练手闲置，手感正常，想换桌面收纳或一盆好养的绿植。',
    category: '数码',
    condition: ItemCondition.GOOD,
    images: [],
    status: ItemStatus.AVAILABLE,
    version: 1,
    locked_by: null,
    location: '苏州 · 工业园',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: 'item_lamp',
    user_id: 'user_lin',
    title: '木质小夜灯',
    description: '暖光，适合床头。已完成交换，保留记录用于状态展示。',
    category: '家居',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.EXCHANGED,
    version: 3,
    locked_by: null,
    location: '杭州 · 西湖',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
  },
];

/** 兼容旧数据：缺少版本/预占字段时补默认值 */
const normalize = (item: Item): Item => ({
  ...item,
  version: item.version ?? 1,
  locked_by: item.locked_by ?? null,
});

export const itemApi = {
  async list(): Promise<Item[]> {
    const items = await storage.get<Item[]>(STORAGE_KEYS.items, []);
    if (items.length) return items.map(normalize);
    await storage.set(STORAGE_KEYS.items, seedItems);
    return seedItems;
  },

  async detail(id: string): Promise<Item | undefined> {
    const items = await this.list();
    return items.find((item) => item.id === id);
  },

  async create(draft: ItemDraft): Promise<Item> {
    const items = await this.list();
    const nextItem: Item = {
      ...draft,
      id: storage.createId('item'),
      status: draft.status ?? ItemStatus.AVAILABLE,
      version: 1,
      locked_by: null,
      created_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.items, [nextItem, ...items]);
    return nextItem;
  },

  async update(id: string, patch: Partial<Item>): Promise<Item> {
    const items = await this.list();
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error('物品不存在');
    const nextItem: Item = { ...current, ...patch, id, version: current.version + 1 };
    await storage.set(
      STORAGE_KEYS.items,
      items.map((item) => (item.id === id ? nextItem : item)),
    );
    return nextItem;
  },

  async setStatus(id: string, status: ItemStatus): Promise<Item> {
    return this.update(id, { status });
  },

  /** 发起交换时预占：仅可交换物品可被锁定，否则视为已被他人抢占 */
  async lockForExchange(id: string, exchangeId: string): Promise<Item> {
    const current = await this.detail(id);
    if (!current) throw new Error('物品不存在');
    if (current.status !== ItemStatus.AVAILABLE) {
      throw new Error(EXCHANGE_FLOW_MESSAGES.itemLocked);
    }
    return this.update(id, { status: ItemStatus.LOCKED, locked_by: exchangeId });
  },

  /** 拒绝/取消时释放预占，物品回到可交换 */
  async releaseLock(id: string, exchangeId: string): Promise<Item | undefined> {
    const current = await this.detail(id);
    if (!current || current.status !== ItemStatus.LOCKED || current.locked_by !== exchangeId) {
      return current;
    }
    return this.update(id, { status: ItemStatus.AVAILABLE, locked_by: null });
  },
};
