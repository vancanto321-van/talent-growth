<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import api from "../../api/client";

const loading = ref(true);
const error = ref("");
const result = ref<any>(null);

// 最低分的两项特质 → 给"短板怎么补"建议
const weakTraits = computed(() => (result.value?.trait_scores || []).slice(-2).filter((t: any) => t.improve?.length));

onShareAppMessage(() => ({
  title: result.value?.trait_scores?.length
    ? "我测出了 12 项特质画像，最强的你可能想不到"
    : "48 题测 12 个行业潜力，来试试",
  path: "/pages/assessment/assessment",
}));

onLoad(async () => {
  try {
    const cached = uni.getStorageSync("pl_assessment_latest");
    if (cached && cached.id) {
      result.value = cached;
    } else {
      result.value = await api.get("/api/assessment/latest");
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function openIndustry(code: string) {
  uni.navigateTo({ url: `/pages/industry/industry?code=${code}` });
}

function goAssessment() {
  uni.redirectTo({ url: "/pages/assessment/assessment" });
}

</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="muted">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>
    <view v-else-if="!result" class="card empty-box">
      <text class="empty-emoji">🧪</text>
      <view class="empty-title">还没有测评结果</view>
      <button class="btn" style="margin-top: 30rpx" @click="goAssessment">
        去做 48 题测评
      </button>
    </view>

    <view v-else>
      <view class="hero">
        <text class="hero-emoji">🏅</text>
        <view class="hero-title">你的行业潜力画像</view>
        <text class="hero-sub">{{ result.note }}</text>
      </view>

      <!-- 特质画像 -->
      <view class="card">
        <text class="eyebrow">特质档案</text>
        <view class="card-title" style="margin-bottom: 18rpx">你的 12 项特质</view>
        <view v-for="t in result.trait_scores" :key="t.code" style="margin-bottom: 18rpx">
          <view class="row-between" style="margin-bottom: 6rpx">
            <text style="font-size: 26rpx; font-weight: 600">{{ t.name }}</text>
            <text class="muted">{{ t.score }}</text>
          </view>
          <view class="bar-track">
            <view class="bar-fill" :style="{ width: t.score + '%' }" />
          </view>
          <text class="faint" style="font-size: 22rpx">{{ t.description }}</text>
        </view>

        <!-- 短板提升建议 -->
        <block v-if="weakTraits.length">
          <view class="divider" />
          <text class="eyebrow">短板怎么补</text>
          <view v-for="t in weakTraits" :key="'w' + t.code" style="margin-top: 14rpx">
            <text class="badge badge-level1">{{ t.name }} {{ t.score }}</text>
            <text v-for="(tip, i) in t.improve" :key="i" class="activity-line">· {{ tip }}</text>
          </view>
          <text class="faint" style="display: block; margin-top: 12rpx; font-size: 22rpx">
            特质更像习惯，不是天赋——按上面的动作练 4 周，重测就能看到变化。
          </text>
        </block>
      </view>

      <!-- 行业排行 -->
      <view class="hero hero-teal">
        <text class="hero-emoji">🏆</text>
        <view class="hero-title">12 个行业潜力排行</view>
        <text class="hero-sub">点开任一行业看：短板怎么训练、行情收入多少。</text>
      </view>

      <view
        v-for="(ind, i) in result.industries"
        :key="ind.code"
        class="card"
        :style="i < 3 ? 'border: 3rpx solid #191B2B' : ''"
        @click="openIndustry(ind.code)"
      >
        <view class="row-between" style="margin-bottom: 10rpx">
          <view>
            <text class="badge" :class="ind.rank === 1 ? 'badge-gold' : ind.rank === 2 ? 'badge-silver' : ind.rank === 3 ? 'badge-bronze' : 'badge-level1'">
              {{ ind.rank <= 3 ? ["🥇", "🥈", "🥉"][ind.rank - 1] + " TOP" + ind.rank : "第 " + ind.rank + " 名" }}
            </text>
            <text style="font-weight: 700; font-size: 30rpx">{{ ind.name }}</text>
          </view>
          <text class="score-big">{{ ind.score }}</text>
        </view>
        <view class="bar-track" style="margin-bottom: 12rpx">
          <view class="bar-fill" :style="{ width: ind.score + '%' }" />
        </view>
        <text class="muted">{{ ind.tagline }}</text>
        <view style="margin-top: 12rpx">
          <text v-for="s in ind.strengths" :key="s.trait" class="badge badge-level3">{{ s.name }} {{ s.score }}</text>
          <text v-for="g in ind.gaps" :key="g.trait" class="badge badge-level1">{{ g.name }} {{ g.score }}</text>
        </view>
        <view v-if="ind.gap_advice" class="suggest-line" style="margin-top: 12rpx">🎯 {{ ind.gap_advice }}</view>
        <view style="margin-top: 12rpx">
          <text class="muted">💰 头部行情：{{ ind.income_top }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
