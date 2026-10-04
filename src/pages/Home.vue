<template>
  <section class="page home-page">
    <div class="page-heading home-heading">
      <div>
        <p class="eyebrow">本地以物换物</p>
        <h1>把闲置重新放回生活里</h1>
      </div>
      <RouterLink class="primary-link" to="/publish">发布闲置</RouterLink>
    </div>

    <div class="toolbar">
      <van-search v-model="itemStore.keyword" placeholder="搜索物品、描述或地点" />
      <CategoryFilter v-model="itemStore.category" />
    </div>

    <p class="list-note">列表同时展示「可交换」和「占用中」物品；占用中的物品正被交换请求预占，不能再发起新请求。</p>

    <div v-if="itemStore.visibleItems.length" class="waterfall">
      <ItemCard
        v-for="item in itemStore.visibleItems"
        :key="item.id"
        :item="item"
        :owner="ownerOf(item.user_id)"
      />
    </div>
    <EmptyState
      v-else
      mark="空"
      title="没有找到可交换物品"
      :description="PAGE_MESSAGES.homeEmpty"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Search as VanSearch } from 'vant';

import CategoryFilter from '@/components/common/CategoryFilter.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ItemCard from '@/components/common/ItemCard.vue';
import { PAGE_MESSAGES } from '@/constants/messages';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useStorageSync } from '@/hooks/useStorageSync';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';

const itemStore = useItemStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const ownerOf = (userId: string) => authStore.users.find((user) => user.id === userId);
const savedKeyword = useLocalStorage('reswap:last-home-keyword', '');

// 别的窗口预占/处理物品后，首页立即拿到新的占用版本
useStorageSync(() => exchangeStore.refreshAll());

onMounted(() => {
  if (!itemStore.keyword && savedKeyword.value) {
    itemStore.keyword = savedKeyword.value;
  }
});

watch(
  () => itemStore.keyword,
  (value) => {
    savedKeyword.value = value;
  },
);
</script>
