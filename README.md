# ReSwap 二手闲置物品交换平台

```bash
pnpm install
pnpm dev
```

访问地址：`http://localhost:18415`

## 项目介绍

ReSwap 是一个纯前端以物换物 Web 应用。用户可以本地模拟登录、发布闲置物品、浏览他人物品、发起交换请求，并在浏览器内管理交换记录。

## 主要功能

- 首页瀑布流浏览、分类筛选、关键词搜索，列表同时展示「可交换」和「占用中」物品。
- 物品详情、物主资料、选择自己的物品发起交换；发起时双方物品立即预占为「占用中」。
- 发布物品，支持本地 base64 图片上传、分类和成色选择。
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成。
- **带版本的占位流程**：处理交换时携带打开页面时的版本（交换记录版本 + 双方物品版本）；版本已前进时只追加冲突记录，绝不覆盖新结果。
- **保存失败保留与重试**：预占或保存失败的请求以 failed 状态保留原因，可重试或放弃。
- 多窗口占用状态同步：一个窗口处理后，其他窗口通过 storage 事件刷新到最新占用版本。
- 个人中心，编辑资料、上传头像、查看我发布的物品。
- 主题切换、全局错误处理和 Vant 提示。

## 启动与构建

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

流程测试（占用、版本冲突、保存失败重试）：

```bash
npm run test:flow
```

生产部署：执行 `pnpm build` 后，将 `dist/` 目录交给 Nginx 或任意静态文件服务器托管。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI | Vant + Tailwind CSS |
| 持久化 | localStorage + IndexedDB（idb-keyval） |
| 工具库 | dayjs、lodash-es |

## 项目目录结构

```text
src/
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts, conflictApi.ts, errors.ts
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts：独立数据模型
├── types/            # 共享类型补充
├── components/common/# ItemCard, CategoryFilter, ConflictCard, ExchangeCard 等
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts, useStorageSync.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css
scripts/              # reswap-flow.test.ts 流程测试与 run-flow-test.cjs 运行器
```

## 版本化占位与冲突处理流程

1. **发起预占**：`exchangeApi.create` 先对双方物品做带版本的 compare-and-set 写入（`available → reserved`，物品 `version +1`），成功后才落交换记录，并把预占后的双方物品版本快照到交换记录上。
2. **打开页面携带版本**：`ExchangeCard` 渲染时生成 `{ exchangeVersion, fromItemVersion, toItemVersion }` 版本令牌，同意/拒绝/完成都携带这个“打开页面时看到”的版本。
3. **冲突只追加不覆盖**：处理时交换记录版本或物品版本已前进（另一个窗口先处理），`exchangeApi.transition` 向 `reswap:exchange-conflicts` 追加一条 `ExchangeConflict` 记录并抛 `ExchangeConflictError`，当前物品和交换结果保持不动。
4. **保存失败可重试**：预占失败、目标已被占用等情况下，请求以 `save_state = failed` 保留并记录 `last_error`/`retry_count`，可重试（重新预占）或放弃；己方已预占的物品会回滚，不会幽灵占用。
5. **状态一致展示**：物品列表、详情、`ExchangeCard`、个人中心都读取同一份带版本的物品数据；多窗口通过 `storage` 事件（`useStorageSync`）即时刷新。
6. **结果落定**：同意保持占用并推进版本，拒绝释放回可交换，完成转为已交换；同窗口写入由串行锁排队，避免两个处理动作互相覆盖。

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB，并提供跨窗口 `storage` 事件订阅。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理。
- 首次启动会写入演示用户、物品和交换请求（种子交换已把双方物品置为占用中）。
- 旧数据迁移：缺少 `version` 的物品/交换记录读入时补齐版本；历史待确认交换对应的可交换物品会自动补做预占。
- 交换相关存储键：`reswap:exchanges`（请求，含保存失败请求）、`reswap:exchange-conflicts`（版本冲突记录，只追加）。

## 横切关注点

- 主题切换：`stores/themeStore.ts`、`constants/themes.ts`、`utils/themeUtils.ts`、`App.vue`、`components/common/CategoryFilter.vue`、`components/common/UserBrief.vue`、`components/common/ItemCard.vue`。
- 全局错误处理/提示：`utils/message.ts`、`components/common/GlobalErrorBoundary.tsx`、`stores/authStore.ts`、`stores/itemStore.ts`、`stores/exchangeStore.ts`、`components/common/ImageUploader.vue`。

## 枚举出现位置清单

### ItemStatus

定义位置：`src/constants/item.ts`

出现位置：

- `src/models/item.ts`
- `src/constants/messages.ts`
- `src/api/itemApi.ts`
- `src/api/exchangeApi.ts`
- `src/stores/itemStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/components/common/ItemCard.vue`
- `src/pages/Home.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Publish.vue`
- `src/pages/Profile.vue`

### ExchangeStatus

定义位置：`src/constants/exchange.ts`

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/api/conflictApi.ts`
- `src/api/errors.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/components/common/ConflictCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`
- `scripts/reswap-flow.test.ts`

## 分层与高耦合约束

本项目保留提示词要求的“严禁合并职责到单一文件”：模型、常量、API、store、页面、组件、hooks、utils 均独立拆分。

同时保留“屎山代码设计要求”的低内聚高耦合特征：

- `utils/formatters.ts` 同时负责日期、物品状态、交换状态、成色、信用等级文本。
- `constants/messages.ts` 同时包含页面提示、表单校验、日志式文案和状态文案。
- `ItemStatus` 与 `ExchangeStatus` 被模型、API、store、组件、页面、router guards、formatters 多处引用。
- `utils/storage.ts` 是存储入口，但全应用 API 和 store 都依赖它的 key 与数据结构。

例如新增 `ItemStatus.BOOKED` 时，应至少修改：`src/constants/item.ts`、`src/models/item.ts`、`src/api/itemApi.ts`、`src/api/exchangeApi.ts`、`src/stores/itemStore.ts`、`src/router/guards.ts`、`src/utils/formatters.ts`、`src/constants/messages.ts`、`src/components/common/ItemCard.vue`、`src/pages/Home.vue`、`src/pages/ItemDetail.vue`、`src/pages/Publish.vue`、`src/pages/Profile.vue` 等文件。

## 环境变量

当前项目无必需环境变量。

## License

MIT
