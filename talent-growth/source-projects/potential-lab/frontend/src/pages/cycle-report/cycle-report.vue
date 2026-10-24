<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import api from "../../api/client";

const cycleId = ref(0);
const loading = ref(true);
const paying = ref(false);
const error = ref("");
const report = ref<any>(null);

const verdictEmoji: Record<string, string> = {
  继续投入: "🚀",
  继续验证: "🌱",
  冲刺一下: "🧩",
  换法再试: "🔧",
  暂停验证: "⏸️",
  还没开始: "💤",
};

onShareAppMessage(() => ({
  title: "我用 4 周验证了自己的潜力方向，报告给你看",
  path: "/pages/index/index",
}));

onLoad(async (query: any) => {
  cycleId.value = Number(query?.cycle || 0);
  try {
    report.value = await api.get(`/api/cycles/report/${cycleId.value}`);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

async function unlock() {
  paying.value = true;
  try {
    const order: any = await api.post("/api/billing/orders", { product_code: "cycle_report", scope_id: cycleId.value });
    await api.post(`/api/billing/orders/${order.id}/mock-pay`);
    report.value = await api.get(`/api/cycles/report/${cycleId.value}`);
    uni.showToast({ title: "已解锁（开发环境模拟支付）", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    paying.value = false;
  }
}

async function startNextCycle() {
  try {
    await api.post("/api/cycles/start", {
      clue_ids: (report.value?.suggested_clue_ids || []).slice(0, 3),
    });
    uni.showToast({ title: "新一轮 4 周周期开始", icon: "success" });
    setTimeout(() => uni.switchTab({ url: "/pages/index/index" }), 800);
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
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

    <view v-else-if="report">
      <view class="hero">
        <text class="hero-emoji">🎓</text>
        <view class="hero-title">4 周结业报告</view>
        <text class="hero-sub">这个周期验证了 {{ report.verdicts.length }} 个方向。以下是证据给出的答案——不是算命，是下一步的路标。</text>
      </view>

      <!-- 判定卡 -->
      <view v-for="v in report.verdicts" :key="v.clue_id" class="card">
        <view class="row-between" style="margin-bottom: 10rpx">
          <text class="badge badge-task">{{ v.direction_name }}</text>
          <text style="font-size: 30rpx; font-weight: 800">{{ v.emoji }} {{ v.verdict }}</text>
        </view>
        <view class="card-title">{{ v.statement }}</view>
        <view style="margin: 12rpx 0">
          <text class="badge" :class="v.evidence_level === '较充分' ? 'badge-level3' : v.evidence_level === '初步' ? 'badge-level2' : 'badge-level1'">
            证据：{{ v.evidence_level }}
          </text>
          <text class="faint">完成 {{ v.task_count }} 次任务 ·</text>
          <text v-if="v.current !== null && v.current !== undefined" class="faint"> 表现分 {{ v.current }}</text>
          <text v-else class="badge badge-pending">表现分：待验证</text>
        </view>

        <block v-if="!report.locked">
          <view class="quote-box">
            <text v-for="(r, i) in v.reasons" :key="i" style="display: block; font-size: 24rpx; color: #43465c">· {{ r }}</text>
          </view>
          <view v-if="v.unverified.length" style="margin-top: 12rpx">
            <text class="eyebrow">还没验证的</text>
            <text v-for="(u, i) in v.unverified" :key="i" class="warn-line">· {{ u }}</text>
          </view>
        </block>
        <block v-else>
          <!-- 免费层：1 句解读 + 你的原话证据 -->
          <view v-if="v.preview_reading" class="suggest-line">{{ v.preview_reading }}</view>
          <view v-if="v.quotes && v.quotes.length" class="quote-box" style="margin-top: 12rpx">
            <text class="eyebrow" style="margin-bottom: 4rpx">你的原话</text>
            <text v-for="(qt, i) in v.quotes" :key="i" style="display: block; font-size: 24rpx; color: #43465c">“{{ qt }}”</text>
          </view>
        </block>
      </view>

      <!-- 付费墙 -->
      <view v-if="report.locked" class="card">
        <text class="eyebrow">深度报告</text>
        <view class="card-title" style="margin: 6rpx 0 12rpx">解锁完整结业报告（{{ yuan(report.price_cents) }}）</view>
        <view style="margin-bottom: 14rpx">
          <text class="badge badge-level3">✓ 免费已含：画像 + 每方向 1 句解读 + 你的原话证据</text>
        </view>
        <text class="muted">
          付费解锁：每个方向的判定依据 · 未验证清单（缺什么证据一目了然）· 下期计划建议 · AI 总结
        </text>
        <button class="btn" style="margin-top: 22rpx" :disabled="paying" @click="unlock">解锁完整报告 →</button>
      </view>

      <block v-else>
        <!-- AI 总结 -->
        <view v-if="report.summary" class="card">
          <view class="row-between" style="margin-bottom: 8rpx">
            <text class="eyebrow" style="margin-bottom: 0">小潜的总结</text>
            <ai-badge />
          </view>
          <view style="display: flex; align-items: flex-start; margin-top: 8rpx">
            <text style="font-size: 56rpx; margin-right: 18rpx">🦉</text>
            <text style="font-size: 26rpx; color: #43465c; flex: 1">{{ report.summary }}</text>
          </view>
        </view>

        <!-- 下期建议 -->
        <view class="card" v-if="report.next && report.next.text">
          <text class="eyebrow">下一阶段</text>
          <view class="card-title" style="margin: 6rpx 0 10rpx">怎么走</view>
          <text style="font-size: 26rpx; color: #43465c">{{ report.next.text }}</text>
          <button class="btn" style="margin-top: 22rpx" :disabled="paying" @click="startNextCycle">
            沿用推荐线索，开启新一轮 →
          </button>
          <text class="faint" style="display: block; margin-top: 12rpx">
            也可以去「探测」重新访谈，找全新的方向。
          </text>
        </view>
      </block>

      <view class="card">
        <text class="faint" style="font-size: 22rpx">
          报告由程序按证据规则生成，每个结论都能在任务记录里找到出处。结业不是终点——能力是验证和练习出来的。
        </text>
      </view>
    </view>
  </view>
</template>
