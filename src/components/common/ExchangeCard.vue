<template>
  <article class="exchange-card">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>v{{ exchange.version }} · {{ formatDate(exchange.updated_at) }}</small>
    </header>
    <div class="exchange-card__items">
      <div>
        <span>拿出</span>
        <strong>{{ fromItem?.title ?? '未知物品' }}</strong>
        <span v-if="fromItem" class="status-pill" :class="statusToneClass(fromItem.status)">
          {{ formatItemStatus(fromItem.status) }}
        </span>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
        <span v-if="toItem" class="status-pill" :class="statusToneClass(toItem.status)">
          {{ formatItemStatus(toItem.status) }}
        </span>
      </div>
    </div>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>

    <div v-if="failedAction" class="exchange-card__alert exchange-card__alert--failed">
      <span>保存失败：{{ failedAction.reason }}（{{ formatExchangeAction(failedAction.action) }}，基于 v{{ failedAction.expectedVersion }}）</span>
      <button type="button" @click="$emit('retry', exchange.id)">重试</button>
    </div>

    <ul v-if="exchange.conflicts.length" class="exchange-card__conflicts">
      <li v-for="(conflict, index) in exchange.conflicts" :key="index">
        冲突：尝试「{{ formatExchangeAction(conflict.action) }}」时版本已从 v{{ conflict.expected_version }} 前进到
        v{{ conflict.actual_version }}，未覆盖新结果 · {{ formatDate(conflict.at) }}
      </li>
    </ul>

    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <button v-if="exchange.status === ExchangeStatus.PENDING" type="button" @click="$emit('accept', exchange.id)">
          同意
        </button>
        <button v-if="exchange.status === ExchangeStatus.PENDING" type="button" @click="$emit('reject', exchange.id)">
          拒绝
        </button>
        <button v-if="exchange.status === ExchangeStatus.ACCEPTED" type="button" @click="$emit('complete', exchange.id)">
          完成
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange, FailedExchangeAction } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatExchangeAction,
  formatExchangeStatus,
  formatItemStatus,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
  failedAction?: FailedExchangeAction;
}>();

defineEmits<{
  accept: [id: string];
  reject: [id: string];
  complete: [id: string];
  retry: [id: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const canOperate = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    (authStore.currentUser?.id === props.exchange.from_user_id && props.exchange.status === ExchangeStatus.ACCEPTED),
);
</script>
