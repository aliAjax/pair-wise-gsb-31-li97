<template>
  <section class="page exchanges-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">交换管理</p>
        <h1>让每一次交换都有状态</h1>
      </div>
    </div>

    <div v-if="exchangeStore.failedCreates.length" class="failed-creates">
      <div v-for="failed in exchangeStore.failedCreates" :key="failed.id" class="failed-creates__row">
        <span>发起保存失败：{{ failed.reason }}</span>
        <button type="button" @click="retryCreate(failed.id)">重试</button>
        <button type="button" @click="exchangeStore.discardFailedCreate(failed.id)">放弃</button>
      </div>
    </div>

    <div class="stats-row">
      <span>全部 {{ stats.total }}</span>
      <span>待确认 {{ stats.pending }}</span>
      <span>已同意 {{ stats.accepted }}</span>
      <span>已完成 {{ stats.completed }}</span>
    </div>

    <div class="segmented">
      <button :class="{ active: tab === 'sent' }" type="button" @click="tab = 'sent'">我发起的</button>
      <button :class="{ active: tab === 'received' }" type="button" @click="tab = 'received'">我收到的</button>
      <select v-model="exchangeStore.statusFilter">
        <option value="all">全部状态</option>
        <option v-for="option in EXCHANGE_STATUS_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <div v-if="visibleExchanges.length" class="exchange-list">
      <ExchangeCard
        v-for="exchange in visibleExchanges"
        :key="exchange.id"
        :exchange="exchange"
        :items="itemStore.items"
        :users="authStore.users"
        :failed-action="exchangeStore.failedActions[exchange.id]"
        @accept="(id) => act(id, ExchangeStatus.ACCEPTED)"
        @reject="(id) => act(id, ExchangeStatus.REJECTED)"
        @complete="(id) => act(id, ExchangeStatus.COMPLETED)"
        @retry="retryAction"
      />
    </div>
    <EmptyState
      v-else
      title="暂无交换请求"
      :description="PAGE_MESSAGES.exchangeEmpty"
      mark="换"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

import EmptyState from '@/components/common/EmptyState.vue';
import ExchangeCard from '@/components/common/ExchangeCard.vue';
import { EXCHANGE_STATUS_OPTIONS, ExchangeStatus } from '@/constants/exchange';
import { PAGE_MESSAGES } from '@/constants/messages';
import { useExchangeStats } from '@/hooks/useExchangeStats';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';

const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();
const tab = ref<'sent' | 'received'>('sent');

/** 打开页面时看到的版本快照：处理请求必须带它，版本前进则落冲突记录 */
const versionSnapshot = reactive<Record<string, number>>({});

const captureSnapshot = () => {
  exchangeStore.exchanges.forEach((exchange) => {
    versionSnapshot[exchange.id] = exchange.version;
  });
};

onMounted(async () => {
  await exchangeStore.hydrate();
  captureSnapshot();
});

const mine = computed(() => {
  if (!authStore.currentUser) return [];
  const list = tab.value === 'sent' ? exchangeStore.sent(authStore.currentUser.id) : exchangeStore.received(authStore.currentUser.id);
  return exchangeStore.statusFilter === 'all'
    ? list
    : list.filter((item) => item.status === exchangeStore.statusFilter);
});
const visibleExchanges = computed(() => mine.value);
const stats = useExchangeStats(() => exchangeStore.exchanges);

const act = async (id: string, status: ExchangeStatus) => {
  const expectedVersion = versionSnapshot[id] ?? exchangeStore.exchanges.find((item) => item.id === id)?.version ?? 1;
  const result =
    status === ExchangeStatus.ACCEPTED
      ? await exchangeStore.accept(id, expectedVersion)
      : status === ExchangeStatus.REJECTED
        ? await exchangeStore.reject(id, expectedVersion)
        : await exchangeStore.complete(id, expectedVersion);
  // 成功或冲突后，页面已看到最新结果，快照随之前进；其他窗口的旧快照仍会触发冲突
  if (result.version !== undefined) {
    versionSnapshot[id] = result.version;
  }
  await itemStore.hydrate();
};

const retryAction = async (id: string) => {
  const result = await exchangeStore.retry(id);
  if (result.version !== undefined) {
    versionSnapshot[id] = result.version;
  }
  await itemStore.hydrate();
};

const retryCreate = async (failedId: string) => {
  await exchangeStore.retryCreate(failedId);
  await itemStore.hydrate();
  captureSnapshot();
};
</script>
