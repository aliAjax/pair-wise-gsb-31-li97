<template>
  <section class="page exchanges-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">交换管理</p>
        <h1>让每一次交换都有状态</h1>
      </div>
    </div>

    <div class="stats-row">
      <span>全部 {{ stats.total }}</span>
      <span>待确认 {{ stats.pending }}</span>
      <span>已同意 {{ stats.accepted }}</span>
      <span>已完成 {{ stats.completed }}</span>
      <span v-if="stats.failed" class="stats-failed">保存失败 {{ stats.failed }}</span>
      <span v-if="exchangeStore.conflicts.length" class="stats-conflict">
        冲突 {{ exchangeStore.conflicts.length }}
      </span>
    </div>

    <div class="segmented">
      <button :class="{ active: tab === 'sent' }" type="button" @click="tab = 'sent'">我发起的</button>
      <button :class="{ active: tab === 'received' }" type="button" @click="tab = 'received'">我收到的</button>
      <button :class="{ active: tab === 'conflicts' }" type="button" @click="tab = 'conflicts'">
        冲突记录{{ exchangeStore.conflicts.length ? `（${exchangeStore.conflicts.length}）` : '' }}
      </button>
      <select v-if="tab !== 'conflicts'" v-model="exchangeStore.statusFilter">
        <option value="all">全部状态</option>
        <option v-for="option in EXCHANGE_STATUS_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <template v-if="tab === 'conflicts'">
      <div v-if="myConflicts.length" class="exchange-list">
        <ConflictCard
          v-for="conflict in myConflicts"
          :key="conflict.id"
          :conflict="conflict"
          @refresh="exchangeStore.refreshAll"
          @dismiss="exchangeStore.dismissConflict"
        />
      </div>
      <EmptyState
        v-else
        title="暂无冲突记录"
        :description="PAGE_MESSAGES.conflictEmpty"
        mark="盾"
      />
    </template>

    <template v-else>
      <div v-if="visibleExchanges.length" class="exchange-list">
        <ExchangeCard
          v-for="exchange in visibleExchanges"
          :key="exchange.id"
          :exchange="exchange"
          :items="itemStore.items"
          :users="authStore.users"
          @accept="handleAccept"
          @reject="handleReject"
          @complete="handleComplete"
          @retry="exchangeStore.retry"
          @discard="exchangeStore.discardFailed"
        />
      </div>
      <EmptyState
        v-else
        title="暂无交换请求"
        :description="PAGE_MESSAGES.exchangeEmpty"
        mark="换"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import ConflictCard from '@/components/common/ConflictCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ExchangeCard, { type ExchangeOperation } from '@/components/common/ExchangeCard.vue';
import { EXCHANGE_STATUS_OPTIONS } from '@/constants/exchange';
import { PAGE_MESSAGES } from '@/constants/messages';
import { useExchangeStats } from '@/hooks/useExchangeStats';
import { useStorageSync } from '@/hooks/useStorageSync';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';

const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();
const tab = ref<'sent' | 'received' | 'conflicts'>('sent');

const mine = computed(() => {
  if (!authStore.currentUser) return [];
  const list =
    tab.value === 'sent'
      ? exchangeStore.sent(authStore.currentUser.id)
      : exchangeStore.received(authStore.currentUser.id);
  return exchangeStore.statusFilter === 'all'
    ? list
    : list.filter((item) => item.status === exchangeStore.statusFilter);
});
const visibleExchanges = computed(() => mine.value);
const stats = useExchangeStats(() => exchangeStore.exchanges);

// 冲突记录按关联请求是否与当前用户相关来过滤
const myConflicts = computed(() => {
  if (!authStore.currentUser) return [];
  const userId = authStore.currentUser.id;
  return exchangeStore.conflicts.filter((conflict) => {
    const related = exchangeStore.exchanges.find((item) => item.id === conflict.exchange_id);
    return (
      conflict.operator_user_id === userId ||
      related?.from_user_id === userId ||
      related?.to_user_id === userId
    );
  });
});

const handleAccept = ({ id, token, operatorUserId }: ExchangeOperation) =>
  exchangeStore.accept(id, token, operatorUserId);
const handleReject = ({ id, token, operatorUserId }: ExchangeOperation) =>
  exchangeStore.reject(id, token, operatorUserId);
const handleComplete = ({ id, token, operatorUserId }: ExchangeOperation) =>
  exchangeStore.complete(id, token, operatorUserId);

// 另一个窗口先处理时，本窗口立即拉取最新版本，旧按钮点击会进入冲突分支而非覆盖
useStorageSync(() => exchangeStore.refreshAll());
</script>
