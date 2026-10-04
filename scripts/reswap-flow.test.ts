import assert from 'node:assert';

import { conflictApi } from '@/api/conflictApi';
import { ExchangeConflictError } from '@/api/errors';
import { exchangeApi } from '@/api/exchangeApi';
import { itemApi } from '@/api/itemApi';
import { ExchangeStatus } from '@/constants/exchange';
import { ItemCondition, ItemStatus } from '@/constants/item';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const reset = async () => {
  await Promise.all(Object.values(STORAGE_KEYS).map((key) => storage.remove(key)));
};

const tokenOf = (exchange: Awaited<ReturnType<typeof exchangeApi.list>>[number]) => ({
  exchangeVersion: exchange.version,
  fromItemVersion: exchange.from_item_version,
  toItemVersion: exchange.to_item_version,
});

const main = async () => {
  await reset();

  // 1. 种子数据：pending 交换把双方物品预占
  const seedExchanges = await exchangeApi.list();
  const seed = seedExchanges.find((item) => item.id === 'exchange_seed')!;
  const chair = await itemApi.detail(seed.from_item_id);
  const camera = await itemApi.detail(seed.to_item_id);
  assert.equal(chair?.status, ItemStatus.RESERVED, 'seed from-item reserved');
  assert.equal(camera?.status, ItemStatus.RESERVED, 'seed to-item reserved');

  // 2. 发起新交换：预占双方物品，记录带上预占后的版本
  const created = await exchangeApi.create({
    from_user_id: 'user_me',
    to_user_id: 'user_chen',
    from_item_id: 'item_box',
    to_item_id: 'item_books',
    status: ExchangeStatus.PENDING,
    message: '收纳盒换书',
  });
  assert.equal(created.save_state, 'normal', 'create saved normally');
  assert.equal(created.from_item_version, 2, 'snapshot version captured after reserve');
  const box = await itemApi.detail('item_box');
  assert.equal(box?.status, ItemStatus.RESERVED, 'my item reserved');
  assert.equal(box?.version, 2, 'my item version bumped');

  // 3. 保存失败的请求会保留：目标物品被别的流程预占时发起，己方物品回滚，请求留作 failed
  const tempMine = await itemApi.create({
    user_id: 'user_me',
    title: '临时交换物',
    description: '用于验证保存失败后保留与重试',
    category: '其他',
    condition: ItemCondition.NEW,
    images: [],
    location: '上海',
  });
  const tempTarget = await itemApi.create({
    user_id: 'user_lin',
    title: '临时目标物',
    description: '先被外部预占',
    category: '其他',
    condition: ItemCondition.NEW,
    images: [],
    location: '杭州',
  });
  await itemApi.compareAndSetStatus(tempTarget.id, ItemStatus.RESERVED, tempTarget.version);
  const failed = await exchangeApi.create({
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: tempMine.id,
    to_item_id: tempTarget.id,
    status: ExchangeStatus.PENDING,
    message: '可能保存失败的请求',
  });
  assert.equal(failed.save_state, 'failed', 'failed create retained');
  assert.ok(failed.last_error.length > 0, 'failure reason retained');
  assert.equal(failed.from_item_version, 0, 'failed exchange does not claim item versions');
  // 己方预占已回滚
  const mineAfterFailed = await itemApi.detail(tempMine.id);
  assert.equal(mineAfterFailed?.status, ItemStatus.AVAILABLE, 'from-item rolled back after failure');

  // 4. 占用未解除时重试仍失败并保留原因；释放后重试成功并转为正常请求
  const retryBlocked = await exchangeApi.retryFailed(failed.id);
  assert.equal(retryBlocked.ok, false, 'retry still fails while occupied');
  assert.equal(retryBlocked.exchange.save_state, 'failed', 'still failed after blocked retry');
  assert.equal(retryBlocked.exchange.retry_count, 1, 'retry count incremented');

  // 目标物品释放后重试成功，双方物品重新预占
  await itemApi.compareAndSetStatus(tempTarget.id, ItemStatus.AVAILABLE, (await itemApi.detail(tempTarget.id))!.version);
  const retryOk = await exchangeApi.retryFailed(failed.id);
  if (!retryOk.ok) console.log('RETRY FAIL REASON:', retryOk.reason, retryOk.exchange.last_error);
  assert.equal(retryOk.ok, true, 'retry succeeds once items are free');
  assert.equal(retryOk.exchange.save_state, 'normal', 'retained request becomes normal');
  const mineAfterRetry = await itemApi.detail(tempMine.id);
  assert.equal(mineAfterRetry?.status, ItemStatus.RESERVED, 'items re-reserved on successful retry');

  // 放弃这笔重试成功的请求：拒绝它释放占用，后续冲突测试只关注 created
  await exchangeApi.transition(failed.id, ExchangeStatus.REJECTED, tokenOf(retryOk.exchange), 'user_lin');

  // 5. 两个窗口同时确认同一条 pending：A 先确认，B 拿旧 token 再确认
  const token = tokenOf(created);
  const a = await exchangeApi.transition(created.id, ExchangeStatus.ACCEPTED, token, 'user_chen');
  assert.equal(a.status, ExchangeStatus.ACCEPTED, 'window A accept ok');
  assert.equal(a.version, 2, 'exchange version advanced to 2');
  const boxAfterA = await itemApi.detail('item_box');
  assert.equal(boxAfterA?.version, 3, 'item version advanced on accept');

  let conflictHit: unknown;
  try {
    await exchangeApi.transition(created.id, ExchangeStatus.ACCEPTED, token, 'user_chen');
  } catch (error) {
    conflictHit = error;
  }
  assert.ok(conflictHit instanceof ExchangeConflictError, 'window B throws ExchangeConflictError');
  const conflicts = await conflictApi.list();
  assert.equal(conflicts.length, 1, 'one conflict record persisted');
  assert.equal(conflicts[0].reason, 'exchange_version_stale', 'reason is exchange version stale');
  assert.equal(conflicts[0].expected_exchange_version, 1, 'expected version recorded');
  assert.equal(conflicts[0].current_exchange_version, 2, 'current version recorded');
  assert.equal(conflicts[0].attempted_status, ExchangeStatus.ACCEPTED, 'attempted status recorded');

  // 6. B 看到新结果后用新 token 完成交换
  const latest = (await exchangeApi.list()).find((item) => item.id === created.id)!;
  const done = await exchangeApi.transition(created.id, ExchangeStatus.COMPLETED, tokenOf(latest), 'user_me');
  assert.equal(done.status, ExchangeStatus.COMPLETED, 'completion after refresh succeeds');
  const boxDone = await itemApi.detail('item_box');
  const booksDone = await itemApi.detail('item_books');
  assert.equal(boxDone?.status, ItemStatus.EXCHANGED, 'from item exchanged');
  assert.equal(booksDone?.status, ItemStatus.EXCHANGED, 'to item exchanged');

  // 7. 物品版本单独前进（对方窗口先处理了另一条请求）也会留下 item 版本冲突
  const freshSeed = (await exchangeApi.list()).find((item) => item.id === 'exchange_seed')!;
  const staleSeedToken = tokenOf(freshSeed);
  // 外部直接改动其中一件物品的占用版本，模拟另一流程抢先写入
  await itemApi.setStatus(freshSeed.from_item_id, ItemStatus.AVAILABLE);
  let itemConflict: unknown;
  try {
    await exchangeApi.transition(
      'exchange_seed',
      ExchangeStatus.REJECTED,
      staleSeedToken,
      'user_lin',
    );
  } catch (error) {
    itemConflict = error;
  }
  assert.ok(itemConflict instanceof ExchangeConflictError, 'stale item version conflicts');
  const allConflicts = await conflictApi.list();
  assert.equal(allConflicts.length, 2, 'second conflict appended');
  assert.equal(allConflicts[0].reason, 'item_version_stale', 'item stale reason recorded');
  // 冲突后原结果没有被覆盖
  const untouched = (await exchangeApi.list()).find((item) => item.id === 'exchange_seed')!;
  assert.equal(untouched.status, ExchangeStatus.PENDING, 'stale operation did not overwrite result');
  assert.equal(untouched.version, freshSeed.version, 'exchange version untouched by conflict');

  console.log('ALL RESWAP FLOW TESTS PASSED');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
