<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const loading = ref(true);
const error = ref("");
const data = ref<any>(null);

onLoad(async () => {
  try {
    await useUserStore().ensureLogin();
    data.value = await api.get("/api/methodology");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function goBoundary() {
  uni.navigateTo({ url: "/pages/science-boundary/science-boundary" });
}

</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else>
      <view class="hero hero-teal">
        <text class="hero-emoji">📖</text>
        <view class="hero-title">测评方法论</view>
        <text class="hero-sub">每一个问题为什么这么问、分数怎么算、边界在哪里——全部公开。</text>
      </view>

      <view class="card card-flat">
        <text class="why-toggle" style="margin-top: 0" @click="goBoundary">🧭 先看「科学边界」：我们的结论能说明什么、不能说明什么 →</text>
      </view>

      <view v-for="sec in data.sections" :key="sec.id" class="card m-section">
        <text class="eyebrow">{{ sec.icon }} {{ sec.title }}</text>
        <text class="m-block-body" style="margin-top: 6rpx">{{ sec.intro }}</text>
        <view v-for="(b, i) in sec.blocks" :key="i" class="m-block">
          <text class="m-block-heading">{{ b.heading }}</text>
          <text class="m-block-body">{{ b.body }}</text>
        </view>
      </view>

      <view class="card">
        <text class="eyebrow">参考文献</text>
        <text v-for="(r, i) in data.references" :key="i" class="m-reference">[{{ i + 1 }}] {{ r }}</text>
      </view>
    </view>
  </view>
</template>
