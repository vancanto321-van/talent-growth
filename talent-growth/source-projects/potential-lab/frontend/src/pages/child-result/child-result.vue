<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import api from "../../api/client";

const resultId = ref(0);
const loading = ref(true);
const paying = ref(false);
const error = ref("");
const result = ref<any>(null);
const plan = ref<any>(null);
const planLoading = ref(false);

const TYPE_EMOJI: Record<string, string> = {
  linguistic: "📖",
  logical: "🕵️",
  spatial: "🏗️",
  musical: "🎵",
  bodily: "⚽",
  interpersonal: "🤝",
  intrapersonal: "🤔",
  naturalist: "🌿",
};

const typeEmoji = computed(() => TYPE_EMOJI[result.value?.teaser?.type_trait] || "🌟");

onShareAppMessage(() => ({
  title: result.value?.teaser?.type_name
    ? `我家孩子的潜能类型是「${result.value.teaser.type_name}」，来看看你家的是什么`
    : "48 题读懂孩子的 8 类潜能，还有月度培养方案",
  path: "/pages/child-assessment/child-assessment",
}));

onLoad(async (query: any) => {
  resultId.value = Number(query?.id || 0);
  try {
    result.value = await api.get(`/api/child/result/${resultId.value}`);
    if (!result.value.locked && result.value.type_content) {
      loadPlan(result.value.type_content.trait);
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function loadPlan(trait: string) {
  planLoading.value = true;
  try {
    plan.value = await api.get(`/api/child/plan?trait=${trait}`);
  } catch (e: any) {
    plan.value = null;
  } finally {
    planLoading.value = false;
  }
}

// 开发期：下单 + 模拟支付；正式环境替换为 wx.requestPayment（见 docs/compliance.md）
async function unlockReport() {
  paying.value = true;
  try {
    const order: any = await api.post("/api/billing/orders", { product_code: "child_assessment", scope_id: resultId.value });
    await api.post(`/api/billing/orders/${order.id}/mock-pay`);
    result.value = await api.get(`/api/child/result/${resultId.value}`);
    if (result.value.type_content) loadPlan(result.value.type_content.trait);
    uni.showToast({ title: "已解锁（开发环境模拟支付）", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    paying.value = false;
  }
}

async function subscribePlan() {
  paying.value = true;
  try {
    const order: any = await api.post("/api/billing/orders", { product_code: "child_plan_monthly" });
    await api.post(`/api/billing/orders/${order.id}/mock-pay`);
    result.value.plan_locked = false;
    await loadPlan(result.value.type_content.trait);
    uni.showToast({ title: "已订阅（开发环境模拟支付）", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    paying.value = false;
  }
}

function yuan(cents: number) {
  return `¥${cents / 100}`;
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else-if="result">
      <!-- 类型头部 -->
      <view class="hero hero-warm">
        <text class="hero-emoji">{{ typeEmoji }}</text>
        <text class="eyebrow" style="color: rgba(255,255,255,0.85); margin-bottom: 4rpx">
          {{ result.child_nickname }} · {{ result.child_age_band }} · {{ result.form === "parent" ? "家长观察版" : "儿童自答版" }}
        </text>
        <view class="hero-title" style="font-size: 48rpx">{{ result.teaser.type_name }}</view>
        <text class="hero-sub">{{ result.teaser.type_tagline }}</text>
        <view style="margin-top: 14rpx">
          <text v-for="t in result.teaser.top_traits" :key="t.name" class="chip-glass">{{ t.name }} {{ t.score }}</text>
        </view>
      </view>

      <!-- 付费墙：完整报告 -->
      <view v-if="result.locked" class="card">
        <text class="eyebrow">完整报告</text>
        <view class="card-title" style="margin: 6rpx 0 12rpx">解锁完整报告（{{ yuan(result.price_cents) }} / 次）</view>
        <text class="muted">
          包含：8 个维度完整得分 · 类型深度解读（日常表现/培养总则/避坑提醒/资源建议）· 学习态度专项建议（毅力/思维模式）
        </text>
        <button class="btn btn-warm" style="margin-top: 22rpx" :disabled="paying" @click="unlockReport">
          解锁完整报告 →
        </button>
        <text class="faint" style="display: block; margin-top: 12rpx; font-size: 22rpx">
          开发环境为模拟支付；正式版接入微信支付。付费前请确认是监护人本人操作。
          未成年人账号设有单日 ¥50 / 单月 ¥100 的付费上限，超限时将无法下单。
        </text>
      </view>

      <!-- 完整报告 -->
      <block v-else>
        <view class="card">
          <text class="eyebrow">潜能档案</text>
          <view class="card-title" style="margin-bottom: 18rpx">八个维度得分</view>
          <view v-for="t in result.mi_scores" :key="t.code" style="margin-bottom: 16rpx">
            <view class="row-between" style="margin-bottom: 6rpx">
              <text style="font-size: 26rpx; font-weight: 600">{{ TYPE_EMOJI[t.code] || "" }} {{ t.name }}</text>
              <text class="muted">{{ t.score }}</text>
            </view>
            <view class="bar-track">
              <view class="bar-fill bar-fill-warm" :style="{ width: t.score + '%' }" />
            </view>
          </view>
        </view>

        <view v-if="result.attitude_advice.length" class="card">
          <text class="eyebrow">学习态度</text>
          <view class="card-title" style="margin-bottom: 12rpx">专项建议</view>
          <view v-for="a in result.attitude_advice" :key="a.key" style="margin-bottom: 14rpx">
            <text class="badge badge-experience">{{ a.label }}</text>
            <text style="font-size: 26rpx; color: #43465c"> {{ a.text }}</text>
          </view>
        </view>

        <view v-if="result.type_content" class="card">
          <text class="eyebrow">深度解读</text>
          <view class="card-title" style="margin: 6rpx 0 12rpx">
            {{ typeEmoji }} {{ result.type_content.type_name }}
          </view>
          <text class="muted">{{ result.type_content.headline }}</text>
          <view style="margin-top: 18rpx">
            <text style="font-weight: 700">🌟 日常表现</text>
            <text v-for="(s, i) in result.type_content.signature" :key="i" class="activity-line">· {{ s }}</text>
          </view>
          <view style="margin-top: 18rpx">
            <text style="font-weight: 700">🧭 培养总则</text>
            <text v-for="(s, i) in result.type_content.principles" :key="i" class="activity-line">· {{ s }}</text>
          </view>
        </view>

        <!-- 月度培养方案 -->
        <view class="card">
          <text class="eyebrow">月度培养方案</text>
          <view class="row-between" style="margin: 6rpx 0 12rpx">
            <view class="card-title">本月怎么带 TA 玩</view>
            <text v-if="plan && !plan.locked" class="badge badge-level3">已订阅</text>
          </view>

          <view v-if="planLoading" class="muted">加载中…</view>

          <block v-else-if="plan">
            <text class="muted">{{ plan.headline }}</text>

            <block v-if="!plan.locked">
              <view style="margin-top: 16rpx">
                <text style="font-weight: 700">🧭 培养总则</text>
                <text v-for="(p, i) in plan.principles" :key="i" class="activity-line">· {{ p }}</text>
              </view>
              <view v-for="(w, i) in plan.weekly_plan" :key="i" class="week-card">
                <text class="week-badge">{{ w.week }} · {{ w.theme }}</text>
                <text v-for="(a, j) in w.activities" :key="j" class="activity-line">{{ j + 1 }}. {{ a }}</text>
                <view class="tip-line">👨‍👩‍👧 家长要点：{{ w.parent_tip }}</view>
              </view>
              <view style="margin-top: 20rpx">
                <text style="font-weight: 700">⚠️ 避坑提醒</text>
                <text v-for="(p, i) in plan.pitfalls" :key="i" class="warn-line">· {{ p }}</text>
              </view>
              <view style="margin-top: 16rpx">
                <text style="font-weight: 700">🎒 资源建议</text>
                <text v-for="(r, i) in plan.resources" :key="i" class="activity-line">· {{ r }}</text>
              </view>
            </block>

            <block v-else>
              <view class="week-card" style="margin-top: 16rpx">
                <text class="week-badge">第 1 周预告 · {{ plan.weekly_plan[0]?.theme }}</text>
                <text class="activity-line">{{ plan.weekly_plan[0]?.activities[0] }}</text>
              </view>
              <view style="margin-top: 16rpx">
                <text class="muted">订阅后解锁：全部 4 周计划（每周主题 + 3 个活动 + 家长要点）、避坑提醒、资源清单，每月更新主题。</text>
              </view>
              <button class="btn btn-warm" style="margin-top: 18rpx" :disabled="paying" @click="subscribePlan">
                {{ yuan(plan.price_cents) }} / 月 · 解锁全部培养方案 →
              </button>
              <text class="faint" style="display: block; margin-top: 12rpx; font-size: 22rpx">
                付费前请确认是监护人本人操作；未成年人账号设有单日 ¥50 / 单月 ¥100 付费上限。
              </text>
            </block>
          </block>
        </view>
      </block>

      <view class="card">
        <text class="faint" style="font-size: 22rpx">{{ result.declaration }}</text>
      </view>
    </view>
  </view>
</template>
