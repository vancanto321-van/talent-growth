<script setup lang="ts">
// AI 生成内容显式标识（《人工智能生成合成内容标识办法》/ GB 45438-2025）。
// 点击徽标展开完整提示；所有展示 AI 产出的区块都应挂载本组件。
// model：产出模型标识（如 glm:glm-4-flash）；mock 前缀为开发期模拟数据。
import { computed, ref } from "vue";

const props = defineProps<{ model?: string }>();

const isMock = computed(() => !props.model || props.model.startsWith("mock"));
const chipText = computed(() => (isMock.value ? "⚡ 模拟生成（演示数据）" : `⚡ AI 生成 · ${props.model}`));

const open = ref(false);
</script>

<template>
  <view class="ai-badge" @click="open = !open">
    <text class="ai-badge-chip" :class="{ 'ai-badge-mock': isMock }">{{ chipText }}</text>
    <view v-if="open" class="ai-badge-note">
      <template v-if="isMock">本段内容为开发环境的模拟生成数据，仅供演示流程，不代表真实 AI 评价。</template>
      <template v-else>本段内容由人工智能（{{ model }}）生成，仅供参考：请结合你的自评与真实读者反馈判断，不构成专业结论。</template>
    </view>
  </view>
</template>

<style scoped>
.ai-badge {
  display: inline-block;
  vertical-align: middle;
}

.ai-badge-chip {
  display: inline-block;
  background: var(--yellow-soft);
  border: 3rpx solid var(--ink);
  border-radius: 999rpx;
  padding: 4rpx 18rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: 1rpx;
}

.ai-badge-mock {
  background: var(--cyan-soft);
}

.ai-badge-note {
  margin-top: 10rpx;
  background: var(--card);
  border: 3rpx dashed var(--ink-50);
  border-radius: 16rpx;
  padding: 14rpx 18rpx;
  font-size: 22rpx;
  line-height: 1.7;
  color: var(--ink-70);
}
</style>
