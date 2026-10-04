import { ItemCondition, ItemStatus, ITEM_INITIAL_VERSION } from '@/constants/item';
import type { Item, ItemDraft } from '@/models/item';

import { ItemVersionConflictError } from './errors';
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
    // 已被种子交换请求预占，列表/详情/交换记录看到的是同一个“占用中”状态
    status: ItemStatus.RESERVED,
    version: 2,
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
    version: ITEM_INITIAL_VERSION,
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
    // 已被种子交换请求预占，列表/详情/交换记录看到的是同一个“占用中”状态
    status: ItemStatus.RESERVED,
    version: 2,
    location: '上海 · 徐汇',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'item_box',
    user_id: 'user_me',
    title: '桌面收纳盒三件套',
    description: '木色，几乎全新，可换数码配件、露营小物。',
    category: '家居',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    version: ITEM_INITIAL_VERSION,
    location: '上海 · 徐汇',
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
    location: '杭州 · 西湖',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
  },
];

/** 旧版本数据没有 version 字段，读出来时补齐为初始版本 */
const normalize = (item: Item): Item => ({
  ...item,
  version: typeof item.version === 'number' ? item.version : ITEM_INITIAL_VERSION,
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
      version: draft.version ?? ITEM_INITIAL_VERSION,
      created_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.items, [nextItem, ...items]);
    return nextItem;
  },

  async update(id: string, patch: Partial<Item>): Promise<Item> {
    const items = await this.list();
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error('物品不存在');
    const nextItem = { ...current, ...patch };
    await storage.set(
      STORAGE_KEYS.items,
      items.map((item) => (item.id === id ? nextItem : item)),
    );
    return nextItem;
  },

  /**
   * 带版本的占用状态写入（compare-and-set）。
   * 仅当当前版本等于 expectedVersion 时才写入并把版本 +1；
   * 版本已前进说明别的窗口/请求先改过物品，抛冲突，由交换层记录。
   * 即使目标状态与当前状态相同（如同意交换后仍占用）也会推进版本，
   * 这样旧页面携带的快照必然过期，不会漏掉处理结果的变化。
   * expectedVersion 省略时不校验版本（下架等单物品操作使用）。
   */
  async compareAndSetStatus(
    id: string,
    status: ItemStatus,
    expectedVersion?: number,
  ): Promise<Item> {
    const items = await this.list();
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error('物品不存在');
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new ItemVersionConflictError(
        `物品「${current.title}」的状态已被其他操作更新（版本 ${expectedVersion} → ${current.version}）`,
        expectedVersion,
        current.version,
      );
    }
    if (current.status === status && expectedVersion === undefined) return current;
    const nextItem: Item = { ...current, status, version: current.version + 1 };
    await storage.set(
      STORAGE_KEYS.items,
      items.map((item) => (item.id === id ? nextItem : item)),
    );
    return nextItem;
  },

  /** 不校验版本的状态写入（下架等），版本同样前进以通知旧页面 */
  async setStatus(id: string, status: ItemStatus): Promise<Item> {
    return this.compareAndSetStatus(id, status);
  },
};
