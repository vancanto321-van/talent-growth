<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow, onShareAppMessage } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const loading = ref(true);
const error = ref("");
const cycle = ref<any>(null);
const items = ref<any[]>([]);
const gam = ref<any>(null);

const typeLabel: Record<string, string> = {
  task: "主方向任务",
  experience: "新方向体验",
  retention: "保持性重测",
  reflect: "周回顾",
};
const typeClass: Record<string, string> = {
  task: "badge-task",
  experience: "badge-experience",
  retention: "badge-retention",
  reflect: "badge-reflect",
};

async function refresh() {
  // 首次启动：先看引导页
  if (!uni.getStorageSync("pl_onboarded")) {
    uni.redirectTo({ url: "/pages/welcome/welcome" });
    return;
  }
  error.value = "";
  try {
    await useUserStore().ensureLogin();
    const res: any = await api.get("/api/tasks/today");
    cycle.value = res.cycle;
    items.value = res.items || [];
    try {
      gam.value = await api.get("/api/gamification/me");
    } catch {
      gam.value = null;
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// 当前等级内的 XP 进度百分比
const levelPercent = computed(() => {
  if (!gam.value) return 0;
  const { xp, next_level_xp, level_xp } = gam.value;
  if (!next_level_xp) return 100;
  return Math.min(100, Math.round(((xp - level_xp) / (next_level_xp - level_xp)) * 100));
});

onShow(refresh);

// 小程序分享：分享文案带用户进度（裂变入口）
onShareAppMessage(() => ({
  title: gam.value
    ? `我在天赋实验室连续探索了 ${gam.value.streak_days} 天，来测测你的潜能`
    : "天赋实验室：问卷给方向，任务给答案",
  path: "/pages/index/index",
}));

async function openItem(item: any) {
  if (item.type === "reflect") {
    uni.switchTab({ url: "/pages/plan/plan" });
    return;
  }
  try {
    if (!item.template?.code) {
      uni.showToast({ title: "任务内容加载失败，请稍后再试", icon: "none" });
      return;
    }
    let instanceId = item.task_instance_id;
    if (!instanceId) {
      const inst: any = await api.post("/api/tasks/from-template", {
        template_code: item.template.code,
      });
      instanceId = inst.id;
    }
    uni.navigateTo({ url: `/pages/task/task?id=${instanceId}` });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none" });
  }
}

function goExplore() {
  uni.switchTab({ url: "/pages/explore/explore" });
}

function goAssessment() {
  uni.navigateTo({ url: "/pages/assessment/assessment" });
}

function goChild() {
  uni.navigateTo({ url: "/pages/child-assessment/child-assessment" });
}

function goMethodology() {
  uni.navigateTo({ url: "/pages/methodology/methodology" });
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box">
      <text class="faint">加载中…</text>
    </view>

    <view v-else-if="error" class="error-tip">
      {{ error }}
      <button class="btn-ghost" style="margin-top: 16rpx" @click="refresh">点击重试</button>
    </view>

    <view v-else-if="!cycle">
      <view class="hero">
        <text class="hero-emoji">🧪</text>
        <view class="hero-title">欢迎来到天赋实验室</view>
        <text class="hero-sub">问卷给方向，任务给答案。每份结论都附带证据、可以回溯——先从下面任选一种方式开始。</text>
      </view>

      <view class="card" @click="goExplore">
        <view class="row-between">
          <view>
            <text class="eyebrow">推荐首选</text>
            <view class="card-title">💬 AI 访谈（6 个问题）</view>
          </view>
          <text class="score-big" style="font-size: 44rpx">→</text>
        </view>
        <view style="margin-top: 10rpx">
          <text class="muted">从你的真实经历里找出 2-4 条方向线索，选 3 个开启 4 周验证周期。</text>
        </view>
      </view>

      <view class="card" @click="goAssessment">
        <view class="row-between">
          <view>
            <text class="eyebrow">标准问卷</text>
            <view class="card-title">🧪 行业潜力测评（48 题）</view>
          </view>
          <text class="score-big" style="font-size: 44rpx">→</text>
        </view>
        <view style="margin-top: 10rpx">
          <text class="muted">12 个行业匹配度排行 + 短板训练路径 + 头部收入行情。</text>
        </view>
      </view>

      <view class="card" @click="goChild">
        <view class="row-between">
          <view>
            <text class="eyebrow">给家长</text>
            <view class="card-title">🌈 儿童版观察问卷（3-12 岁）</view>
          </view>
          <text class="score-big" style="font-size: 44rpx">→</text>
        </view>
        <view style="margin-top: 10rpx">
          <text class="muted">8 类潜能观察 + 类型判定 + 月度培养方案。</text>
        </view>
      </view>

      <view class="card card-flat" @click="goMethodology">
        <text class="why-toggle" style="margin-top: 0">📖 每个问题为什么这么问？查看测评方法论 →</text>
      </view>
    </view>

    <view v-else>
      <view class="hero">
        <view class="row-between" style="align-items: flex-start">
          <view style="flex: 1">
            <text class="hero-emoji">🎯</text>
            <view class="hero-title">第 {{ cycle.week_index }} / {{ cycle.weeks }} 周</view>
            <text class="hero-sub">今天有 {{ items.length }} 件事可以做，做完一件是一件。</text>
          </view>
          <view v-if="gam" style="text-align: center; flex-shrink: 0; margin-left: 16rpx">
            <text style="font-size: 60rpx; display: block">🔥</text>
            <text style="font-size: 40rpx; font-weight: 800; color: #fff; display: block; line-height: 1.2">{{ gam.streak_days }}</text>
            <text style="font-size: 20rpx; color: rgba(255,255,255,0.85)">连续探索</text>
          </view>
        </view>
        <view v-if="gam" style="margin-top: 22rpx">
          <view class="row-between" style="margin-bottom: 10rpx">
            <text class="chip-glass">⚡ LV.{{ gam.level }} {{ gam.level_name }}</text>
            <text class="chip-glass">{{ gam.daily_done ? "✅ 今日达标" : `今日 ${gam.today_xp}/${gam.daily_goal} XP` }}</text>
          </view>
          <view class="bar-track" style="background: rgba(255,255,255,0.25)">
            <view class="bar-fill" style="background: #ffffff" :style="{ width: levelPercent + '%' }" />
          </view>
          <text class="hero-sub" v-if="gam.next_level_xp">
            距「下一级」还差 {{ gam.next_level_xp - gam.xp }} XP —— 每完成一次任务都会累积
          </text>
        </view>
      </view>

      <!-- 连击告急横幅（遗忘临界点：昨天动了、今天还没动） -->
      <view v-if="gam && gam.streak_at_risk" class="card" style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 2rpx solid #fdba74">
        <view class="row-between">
          <view style="flex: 1">
            <text style="font-weight: 700; color: #c2410c">🔥 连击告急</text>
            <text class="muted" style="display: block; margin-top: 4rpx">
              你的 {{ gam.streak_days }} 天连击还差今天一步——完成任意一件事就能保住。
            </text>
          </view>
          <text style="font-size: 56rpx; flex-shrink: 0; margin-left: 12rpx">⏳</text>
        </view>
      </view>

      <!-- 吉祥物 -->
      <view v-if="gam" class="card" style="display: flex; align-items: flex-start">
        <text style="font-size: 64rpx; margin-right: 20rpx; flex-shrink: 0">{{ gam.mascot.emoji }}</text>
        <view style="flex: 1">
          <text class="eyebrow">{{ gam.mascot.name }}说</text>
          <text style="font-size: 26rpx; color: #43465c">{{ gam.mascot.line }}</text>
        </view>
      </view>

      <view v-if="items.length === 0" class="card empty-box">
        <text class="empty-emoji">🍵</text>
        <view class="empty-title">今日任务都完成啦</view>
        <text class="muted">休息一下，或者去「画像」看看这周的变化。</text>
      </view>

      <view v-for="(item, idx) in items" :key="idx" class="card">
        <view style="margin-bottom: 14rpx">
          <text class="badge" :class="typeClass[item.type] || 'badge-task'">{{ typeLabel[item.type] || item.type }}</text>
          <text class="badge badge-level1">+{{ item.type === "retention" ? 30 : item.type === "reflect" ? 10 : 20 }} XP</text>
        </view>
        <view class="card-title">{{ item.title }}</view>
        <view style="margin: 14rpx 0 20rpx">
          <text class="muted">{{ item.detail }}</text>
        </view>
        <button class="btn-ghost" @click="openItem(item)">
          {{ item.type === "reflect" ? "去打卡 +" + 10 : "去完成 +" + 20 }} XP →
        </button>
      </view>

      <!-- 成就墙 -->
      <view v-if="gam" class="card">
        <text class="eyebrow">成就</text>
        <view class="card-title" style="margin-bottom: 20rpx">成就墙</view>
        <view class="ach-grid">
          <view v-for="a in gam.achievements" :key="a.code" class="ach-item" :class="a.unlocked ? '' : 'ach-locked'">
            <text class="ach-emoji">{{ a.unlocked ? a.emoji : "🔒" }}</text>
            <text class="ach-name">{{ a.name }}</text>
            <text class="ach-desc">{{ a.desc }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
