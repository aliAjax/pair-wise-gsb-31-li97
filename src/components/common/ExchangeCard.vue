<template>
  <article class="exchange-card" :class="{ 'exchange-card--failed': isFailed }">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>{{ formatDate(exchange.updated_at) }}</small>
    </header>

    <div v-if="isFailed" class="exchange-card__failure">
      <strong>这条请求上次保存失败（第 {{ exchange.retry_count + 1 }} 次尝试）</strong>
      <p>原因：{{ exchange.last_error || '未知原因' }}</p>
      <p class="exchange-card__failure-hint">请求内容与双方物品尚未被改动，可直接重试或放弃。</p>
      <div class="exchange-card__actions">
        <button type="button" @click="$emit('retry', exchange.id)">重试保存</button>
        <button type="button" @click="$emit('discard', exchange.id)">放弃请求</button>
      </div>
    </div>

    <template v-else>
      <div class="exchange-card__items">
        <div>
          <span>拿出</span>
          <strong>{{ fromItem?.title ?? '未知物品' }}</strong>
          <em v-if="fromItem" class="occupancy-tag" :class="statusToneClass(fromItem.status)">
            {{ formatItemStatus(fromItem.status) }} · v{{ fromItem.version }}
          </em>
        </div>
        <div>
          <span>换取</span>
          <strong>{{ toItem?.title ?? '未知物品' }}</strong>
          <em v-if="toItem" class="occupancy-tag" :class="statusToneClass(toItem.status)">
            {{ formatItemStatus(toItem.status) }} · v{{ toItem.version }}
          </em>
        </div>
      </div>
      <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>
      <footer>
        <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
        <small class="exchange-card__version">记录版本 v{{ exchange.version }}</small>
        <div v-if="canOperate" class="exchange-card__actions">
          <button
            v-if="exchange.status === ExchangeStatus.PENDING"
            type="button"
            @click="$emit('accept', operation)"
          >
            同意
          </button>
          <button
            v-if="exchange.status === ExchangeStatus.PENDING"
            type="button"
            @click="$emit('reject', operation)"
          >
            拒绝
          </button>
          <button
            v-if="exchange.status === ExchangeStatus.ACCEPTED"
            type="button"
            @click="$emit('complete', operation)"
          >
            完成
          </button>
        </div>
      </footer>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { ExchangeSaveState, ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeVersionToken } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatExchangeStatus,
  formatItemStatus,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

export interface ExchangeOperation {
  id: string;
  token: ExchangeVersionToken;
  operatorUserId: string;
}

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
}>();

defineEmits<{
  accept: [operation: ExchangeOperation];
  reject: [operation: ExchangeOperation];
  complete: [operation: ExchangeOperation];
  retry: [id: string];
  discard: [id: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const isFailed = computed(() => props.exchange.save_state === ExchangeSaveState.FAILED);
const canOperate = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    (authStore.currentUser?.id === props.exchange.from_user_id && props.exchange.status === ExchangeStatus.ACCEPTED),
);

// 操作载荷带上“打开页面时渲染出来”的版本；页面在其他窗口写入后会整体刷新
const operation = computed<ExchangeOperation>(() => ({
  id: props.exchange.id,
  token: {
    exchangeVersion: props.exchange.version,
    fromItemVersion: props.exchange.from_item_version,
    toItemVersion: props.exchange.to_item_version,
  },
  operatorUserId: authStore.currentUser?.id ?? 'unknown',
}));
</script>
