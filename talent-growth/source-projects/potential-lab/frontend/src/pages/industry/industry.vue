<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShow, onShareAppMessage } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const code = ref("");
const loading = ref(true);
const error = ref("");
const detail = ref<any>(null);

// 自查任务勾选（本地记录）
const checks = ref<boolean[]>([false, false, false]);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    await useUserStore().ensureLogin();
    detail.value = await api.get(`/api/assessment/industries/${code.value}`);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onShareAppMessage(() => ({
  title: detail.value ? `${detail.value.name}的潜力自测、训练路径和收入行情` : "行业潜力自测",
  path: `/pages/industry/industry?code=${code.value}`,
}));

onLoad((query: any) => {
  code.value = query?.code || "";
});

onShow(() => {
  if (code.value) load();
});

function traitName(t: string): string {
  return detail.value?.trait_names?.[t] || t;
}

async function toClues() {
  try {
    const res: any = await api.post(`/api/assessment/industries/${code.value}/to-clues`);
    uni.showModal({
      title: "已生成验证线索",
      content: res.message,
      showCancel: false, confirmText: "确定", cancelText: "取消",
      success: () => uni.switchTab({ url: "/pages/explore/explore" }),
    });
  } catch (e: any) {
    uni.showModal({ title: "这个方向先自查", content: e.message, showCancel: false });
  }
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else-if="detail">
      <!-- 头部 -->
      <view class="hero">
        <text class="hero-emoji">🏢</text>
        <view class="row-between">
          <view class="hero-title">{{ detail.name }}</view>
          <view v-if="detail.my_score !== null && detail.my_score !== undefined" style="text-align: right">
            <text class="score-big" style="color: #ffffff; font-size: 56rpx">{{ detail.my_score }}</text>
            <text style="font-size: 22rpx; color: rgba(255,255,255,0.8)"> /100 潜力参照</text>
          </view>
        </view>
        <text class="hero-sub">{{ detail.tagline }}。{{ detail.description }}</text>
        <view v-if="detail.my_breakdown" style="margin-top: 14rpx">
          <text v-for="s in detail.my_breakdown.strengths" :key="s.trait" class="chip-glass">💪 优势：{{ s.name }} {{ s.score }}</text>
          <text v-for="g in detail.my_breakdown.gaps" :key="g.trait" class="chip-glass">📌 短板：{{ g.name }} {{ g.score }}</text>
          <text v-if="detail.my_breakdown.gap_advice" class="hero-sub">{{ detail.my_breakdown.gap_advice }}</text>
        </view>
      </view>

      <!-- 行业看重的特质 -->
      <view class="card">
        <text class="eyebrow">潜力构成</text>
        <view class="card-title" style="margin-bottom: 16rpx">这个行业看什么</view>
        <view v-for="(w, t) in detail.weights" :key="t" style="margin-bottom: 16rpx">
          <view class="row-between">
            <text style="font-size: 26rpx; font-weight: 600">{{ traitName(String(t)) }}</text>
            <text class="muted">权重 {{ Math.round(Number(w) * 100) }}%</text>
          </view>
          <view class="bar-track" style="margin-top: 6rpx">
            <view class="bar-fill bar-fill-teal" :style="{ width: w * 100 * 2.5 + '%' }" />
          </view>
        </view>
      </view>

      <!-- 门槛与资质 -->
      <view v-if="detail.requirements?.length" class="card">
        <text class="eyebrow">入行须知</text>
        <view class="card-title" style="margin-bottom: 14rpx">门槛与资质</view>
        <view v-for="(r, i) in detail.requirements" :key="i" class="activity-line" style="font-size: 26rpx">
          {{ r.startsWith("硬门槛") ? "🚫" : r.startsWith("建议") ? "💡" : "·" }} {{ r }}
        </view>
      </view>

      <!-- 培训路径：时间线 -->
      <view class="card">
        <text class="eyebrow">成长路线</text>
        <view class="card-title" style="margin-bottom: 24rpx">怎么训练自己（四步路线）</view>
        <view v-for="(stage, i) in detail.training_path" :key="i" class="tl-item">
          <view class="tl-rail">
            <view class="tl-dot">{{ i + 1 }}</view>
            <view v-if="i < detail.training_path.length - 1" class="tl-line" />
          </view>
          <view class="tl-body">
            <view style="margin-bottom: 6rpx">
              <text class="badge badge-task">{{ stage.stage }}</text>
              <text class="faint">{{ stage.duration }}</text>
            </view>
            <text v-for="(a, j) in stage.actions" :key="j" class="activity-line">· {{ a }}</text>
            <view class="tip-line">✓ 过关标准：{{ stage.checkpoint }}</view>
          </view>
        </view>
      </view>

      <!-- 收入行情 -->
      <view class="card">
        <text class="eyebrow">收入行情</text>
        <view class="card-title" style="margin-bottom: 16rpx">年收入参考（万元）</view>
        <view class="tier">
          <text class="tier-tag" style="background: #F7F5EC; color: #6B6F85">入行</text>
          <text style="font-size: 26rpx">{{ detail.income.entry }}</text>
        </view>
        <view class="tier">
          <text class="tier-tag" style="background: #E3F6FE; color: #0F766E">成熟</text>
          <text style="font-size: 26rpx">{{ detail.income.mid }}</text>
        </view>
        <view class="tier" style="background: linear-gradient(135deg, #fef3c7, #fde9d2)">
          <text class="tier-tag" style="background: linear-gradient(135deg, #FFE467, #F45BC3); color: #ffffff">头部</text>
          <text style="font-size: 26rpx; font-weight: 600">{{ detail.income.top }}</text>
        </view>
        <view class="warn-line">⚠ {{ detail.income.note }}</view>
        <text class="faint" style="font-size: 22rpx; margin-top: 10rpx; display: block">
          「头部」指最好的市场行情下的赢家水平，不是典型收入；数据为参考值，上线前会标注统计口径与时间。
        </text>
      </view>

      <!-- 自查任务 -->
      <view class="card">
        <text class="eyebrow">先别急着投入</text>
        <view class="card-title" style="margin-bottom: 10rpx">3 天就能做完的自查任务</view>
        <text class="muted">比问卷更可信的第一步：做完再决定要不要投入。</text>
        <view
          v-for="(c, i) in detail.self_checks"
          :key="i"
          style="display: flex; align-items: flex-start; margin-top: 20rpx"
          @click="checks[i] = !checks[i]"
        >
          <text style="margin-right: 14rpx; font-size: 30rpx">{{ checks[i] ? "✅" : "⬜" }}</text>
          <text style="font-size: 26rpx; flex: 1" :style="checks[i] ? 'color:#a8adc0' : ''">{{ c }}</text>
        </view>
      </view>

      <!-- 转验证 -->
      <view class="card">
        <button class="btn" @click="toClues">
          {{ detail.direction_codes.length ? "把潜力分转成验证线索，用任务验证 →" : "了解线上验证任务" }}
        </button>
        <text class="faint" style="display: block; margin-top: 14rpx">
          测评分数只是参照。真正的答案来自：小任务试一试 + 别人给你的真实反馈。
        </text>
      </view>
    </view>
  </view>
</template>
