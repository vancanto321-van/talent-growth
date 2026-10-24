<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const loading = ref(true);
const error = ref("");
const boundary = ref<any>(null);

onLoad(async () => {
  try {
    await useUserStore().ensureLogin();
    const data = await api.get("/api/methodology");
    boundary.value = data.science_boundary || null;
    if (!boundary.value) throw new Error("内容暂不可用");
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function goMethodology() {
  uni.navigateTo({ url: "/pages/methodology/methodology" });
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else>
      <view class="hero hero-mint">
        <text class="hero-emoji">🧭</text>
        <view class="hero-title">科学边界</view>
        <text class="hero-sub">{{ boundary.intro }}</text>
      </view>

      <!-- 能说明什么 -->
      <view class="card card-mint">
        <text class="eyebrow">✅ 能说明什么</text>
        <view v-for="(item, i) in boundary.can_show" :key="i" class="b-line">
          <text class="b-dot b-dot-mint">{{ i + 1 }}</text>
          <text class="b-text">{{ item }}</text>
        </view>
      </view>

      <!-- 不能说明什么 -->
      <view class="card card-pink">
        <text class="eyebrow">🚫 不能说明什么</text>
        <view v-for="(item, i) in boundary.cannot_show" :key="i" class="b-line">
          <text class="b-dot b-dot-pink">{{ i + 1 }}</text>
          <text class="b-text">{{ item }}</text>
        </view>
      </view>

      <!-- 底线声明 -->
      <view class="card">
        <text class="eyebrow">一句话底线</text>
        <text class="muted">{{ boundary.disclaimer }}</text>
        <text class="why-toggle" style="margin-top: 20rpx" @click="goMethodology">
          📖 想看每个问题为什么这么问？查看完整测评方法论与参考文献 →
        </text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.b-line {
  display: flex;
  align-items: flex-start;
  margin-top: 16rpx;
}
.b-dot {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  line-height: 38rpx;
  text-align: center;
  border: 3rpx solid #191b2b;
  border-radius: 50%;
  font-size: 22rpx;
  font-weight: 800;
  margin-right: 16rpx;
  margin-top: 4rpx;
}
.b-dot-mint {
  background: #eafbf3;
}
.b-dot-pink {
  background: #fde9f6;
}
.b-text {
  flex: 1;
  font-size: 25rpx;
  color: rgba(25, 27, 43, 0.72);
  line-height: 1.7;
}
</style>
