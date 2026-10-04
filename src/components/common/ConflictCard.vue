<template>
  <article class="exchange-card conflict-card">
    <header>
      <span class="status-pill status-conflict">版本冲突</span>
      <small>{{ formatDate(conflict.created_at) }}</small>
    </header>
    <p>
      <strong>{{ formatConflictReason(conflict.reason) }}</strong>
      ：尝试把交换处理为「{{ formatExchangeStatus(conflict.attempted_status) }}」时，
      打开页面时的版本已经落后。
    </p>
    <dl class="conflict-card__versions">
      <div>
        <dt>交换记录</dt>
        <dd>
          页面版本 v{{ conflict.expected_exchange_version }} → 当前 v{{ conflict.current_exchange_version }}
        </dd>
      </div>
      <div>
        <dt>拿出物品</dt>
        <dd>
          页面版本 v{{ conflict.expected_from_item_version }} → 当前 v{{ conflict.current_from_item_version }}
        </dd>
      </div>
      <div>
        <dt>换取物品</dt>
        <dd>
          页面版本 v{{ conflict.expected_to_item_version }} → 当前 v{{ conflict.current_to_item_version }}
        </dd>
      </div>
    </dl>
    <footer>
      <span>{{ conflict.message }}</span>
      <div class="exchange-card__actions">
        <button type="button" @click="$emit('refresh')">刷新为最新结果</button>
        <button type="button" @click="$emit('dismiss', conflict.id)">清除记录</button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { ExchangeConflict } from '@/models/exchange';
import {
  formatConflictReason,
  formatDate,
  formatExchangeStatus,
} from '@/utils/formatters';

defineProps<{
  conflict: ExchangeConflict;
}>();

defineEmits<{
  refresh: [];
  dismiss: [id: string];
}>();
</script>
