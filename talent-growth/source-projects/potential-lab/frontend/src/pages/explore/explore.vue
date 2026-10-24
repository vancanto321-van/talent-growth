<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import api, { getToken } from "../../api/client";
import { useUserStore } from "../../stores/user";

const step = ref<"intro" | "chat" | "result">("intro");
const questions = ref<any[]>([]);
const current = ref(0);
const answer = ref("");
const answers = ref<{ code: string; text: string }[]>([]);
const clues = ref<any[]>([]);
const selected = ref<number[]>([]);
const submitting = ref(false);
const error = ref("");
const activeCycle = ref<any>(null);
const expandedWhy = ref("");

const q = computed(() => questions.value[current.value] || null);
// 进度条：按题号推进；中断续答的草稿持久化在本地存储（H5/小程序双端可用）
const DRAFT_KEY = "pl_interview_draft";
// 草稿绑定登录会话（token 指纹）：同机换账号时指纹不符即弃用，避免读到他人原话
function draftSess(): string {
  const t = getToken() || "";
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return String(h);
}
const progressPercent = computed(() =>
  questions.value.length ? Math.round((current.value / questions.value.length) * 100) : 0,
);
const remainingSteps = computed(() => Math.max(0, questions.value.length - current.value - 1));
// 每题约 1 分钟（写具体经历需要想一想），至少 1 分钟
const estMinutes = computed(() => Math.max(1, remainingSteps.value + 1));

function saveDraft() {
  try {
    uni.setStorageSync(DRAFT_KEY, { answers: answers.value, current: current.value, sess: draftSess() });
  } catch (e) {
    // 存储不可用（隐私模式/空间不足）只损失续答能力，不打断作答流程
  }
}

function clearDraft() {
  try {
    uni.removeStorageSync(DRAFT_KEY);
  } catch (e) {}
}

function resetInterviewState() {
  answers.value = [];
  clues.value = [];
  selected.value = [];
  current.value = 0;
  answer.value = "";
}

onShow(async () => {
  try {
    await useUserStore().ensureLogin();
    activeCycle.value = await api.get("/api/cycles/current");
    // tabBar 页常驻：已有周期时重置访谈状态，避免卡在上次的"结果"步骤
    if (activeCycle.value && step.value !== "intro") {
      step.value = "intro";
      resetInterviewState();
    }
  } catch (e: any) {
    error.value = e.message;
  }
});

async function start() {
  error.value = "";
  try {
    questions.value = await api.get("/api/explore/questions");
    step.value = "chat";
    // 中断续答：有草稿则询问是否接着上次的进度作答
    const draft = uni.getStorageSync(DRAFT_KEY) as any;
    if (draft && Array.isArray(draft.answers) && draft.answers.length > 0) {
      if (draft.sess !== draftSess()) {
        // 指纹不符＝同机其他账号的草稿，不提示、直接丢弃
        clearDraft();
        return;
      }
      const valid = draft.answers.filter((a: any) => questions.value.some((qq) => qq.code === a.code));
      const at = Number.isInteger(draft.current) ? Math.min(Math.max(draft.current, 0), questions.value.length - 1) : 0;
      if (valid.length === 0 && at === 0) {
        clearDraft();
        return;
      }
      uni.showModal({
        title: "继续上次的访谈？",
        content: `已答 ${valid.length}/${questions.value.length} 题，可从第 ${at + 1} 题接着写。`,
        confirmText: "继续作答",
        cancelText: "重新开始",
        success: (res) => {
          if (res.confirm) {
            answers.value = valid;
            current.value = at;
            const prev = answers.value.find((a) => a.code === questions.value[current.value].code);
            answer.value = prev ? prev.text : "";
          } else {
            clearDraft();
          }
        },
      });
    }
  } catch (e: any) {
    error.value = e.message;
  }
}

function goPrev() {
  if (current.value <= 0) return;
  current.value -= 1;
  const prev = answers.value.find((a) => a.code === questions.value[current.value].code);
  answer.value = prev ? prev.text : "";
  saveDraft();
}

function restartInterview() {
  uni.showModal({
    title: "清空重答",
    content: "将清空本次已写的全部回答，从头开始。",
    success: (res) => {
      if (!res.confirm) return;
      resetInterviewState();
      clearDraft();
    },
  });
}

function next() {
  const qCode = q.value.code;
  const existing = answers.value.findIndex((a) => a.code === qCode);
  const value = answer.value.trim();
  if (existing >= 0) answers.value[existing] = { code: qCode, text: value };
  else answers.value.push({ code: qCode, text: value });

  answer.value = "";
  if (current.value < questions.value.length - 1) {
    current.value += 1;
    const prev = answers.value.find((a) => a.code === questions.value[current.value].code);
    if (prev) answer.value = prev.text;
    saveDraft();
  } else {
    finish();
  }
}

function skip() {
  answer.value = "";
  if (current.value < questions.value.length - 1) {
    current.value += 1;
    const prev = answers.value.find((a) => a.code === questions.value[current.value].code);
    if (prev) answer.value = prev.text;
    saveDraft();
  } else {
    finish();
  }
}

async function finish() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = "";
  try {
    clues.value = await api.post("/api/explore/finish", { answers: answers.value });
    clearDraft(); // 已成功生成线索，草稿完成使命
    selected.value = clues.value.slice(0, 3).map((c: any) => c.id);
    step.value = "result";
  } catch (e: any) {
    error.value = e.message;
    // 停在最后一题，让用户可以改答案重试
  } finally {
    submitting.value = false;
  }
}

function toggle(id: number) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else if (selected.value.length < 3) selected.value.push(id);
  else uni.showToast({ title: "一个周期最多验证 3 个方向", icon: "none" });
}

async function startCycle() {
  if (selected.value.length === 0) return;
  submitting.value = true;
  error.value = "";
  try {
    await api.post("/api/cycles/start", { clue_ids: selected.value });
    uni.showToast({ title: "4 周探索周期开始", icon: "success" });
    setTimeout(() => uni.switchTab({ url: "/pages/index/index" }), 800);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

function goToday() {
  uni.switchTab({ url: "/pages/index/index" });
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

function goBoundary() {
  uni.navigateTo({ url: "/pages/science-boundary/science-boundary" });
}
</script>

<template>
  <view>
    <view v-if="error" class="error-tip">{{ error }}</view>

    <!-- 简介 -->
    <view v-if="step === 'intro'">
      <view class="hero hero-teal">
        <text class="hero-emoji">🧭</text>
        <view class="hero-title">找到值得验证的方向</view>
        <text class="hero-sub">两种方式：AI 访谈（从真实经历找线索），或 48 题问卷（测 12 个行业潜力）。</text>
      </view>

      <view class="card">
        <text class="eyebrow">方式一 · AI 访谈</text>
        <view class="card-title">一次 6 个问题的对话</view>
        <view style="margin: 14rpx 0">
          <text class="muted">
            我不会给你打「天赋分」。我会问你具体做过的事，从中找出 2-4 条
            「值得验证的方向线索」，每条都附上依据；然后你挑最多 3 条，
            用 4 周的小任务真正试一试。
          </text>
        </view>
        <view class="tip-line" style="margin-top: 0">全程约 6 分钟 · 中途退出不怕丢，进度会自动保存</view>
        <button class="btn" style="margin-top: 20rpx" @click="start">开始访谈</button>
      </view>

      <view class="card">
        <text class="eyebrow">方式二 · 标准问卷</text>
        <view class="card-title">行业潜力测评（48 题）</view>
        <view style="margin: 14rpx 0 20rpx">
          <text class="muted">测 12 个行业匹配度、短板训练路径和头部收入行情。</text>
        </view>
        <button class="btn-ghost" @click="goAssessment">去做行业潜力测评 →</button>
      </view>

      <view class="card">
        <text class="eyebrow">给家长</text>
        <view class="card-title">儿童版 · 潜能观察问卷</view>
        <view style="margin: 14rpx 0 20rpx">
          <text class="muted">3-12 岁孩子的 8 类潜能观察，配套月度培养方案。</text>
        </view>
        <button class="btn-ghost" @click="goChild">儿童版测评 →</button>
      </view>

      <view class="card card-flat">
        <text class="why-toggle" style="margin-top: 0" @click="goMethodology">📖 每个问题为什么这么问？查看测评方法论与参考文献 →</text>
        <text class="why-toggle" @click="goBoundary">🧭 结论能说明什么、不能说明什么？查看科学边界 →</text>
      </view>

      <view v-if="activeCycle" class="card">
        <button class="btn-warm btn" @click="goToday">已有进行中的周期，去今日任务 →</button>
      </view>
    </view>

    <!-- 访谈 -->
    <view v-if="step === 'chat'" class="card">
      <view class="row-between">
        <text class="eyebrow" style="margin-bottom: 0">第 {{ current + 1 }} / {{ questions.length }} 题 · {{ q?.category }}</text>
        <text class="faint">还剩 {{ remainingSteps }} 步 · 约 {{ estMinutes }} 分钟</text>
      </view>
      <view class="bar-track" style="margin: 12rpx 0 4rpx">
        <view class="bar-fill" :style="{ width: progressPercent + '%' }" />
      </view>
      <view class="card-title" style="margin: 14rpx 0 8rpx">{{ q?.text }}</view>
      <text class="why-toggle" @click="expandedWhy = expandedWhy === q?.code ? '' : q?.code">
        {{ expandedWhy === q?.code ? "收起 ↑" : "为什么这么问？ ↓" }}
      </text>
      <text v-if="expandedWhy === q?.code && q?.why" class="why-text">{{ q.why }}</text>
      <textarea
        v-model="answer"
        :placeholder="q?.hint || '想到什么写什么'"
        :maxlength="2000"
        style="width: 100%; height: 240rpx; background: #f4f5fa; border-radius: 20rpx; padding: 22rpx; box-sizing: border-box; font-size: 28rpx; margin-top: 16rpx"
      />
      <view style="display: flex; gap: 16rpx; margin-top: 26rpx">
        <button v-if="current > 0" class="btn-ghost" style="flex: 0 0 140rpx" :disabled="submitting" @click="goPrev">上一题</button>
        <button class="btn" style="flex: 1" :disabled="submitting" @click="next">
          {{ current < questions.length - 1 ? "下一题" : submitting ? "正在分析…" : "生成我的线索" }}
        </button>
        <button class="btn-ghost" style="flex: 0 0 130rpx" :disabled="submitting" @click="skip">跳过</button>
      </view>
      <text class="why-toggle" style="text-align: center; margin-top: 18rpx" @click="restartInterview">清空重答</text>
    </view>

    <!-- 结果 -->
    <view v-if="step === 'result'">
      <view class="hero hero-teal">
        <text class="hero-emoji">✨</text>
        <view class="hero-title">你的候选方向线索</view>
        <text class="hero-sub">来自你的自述，只是线索。勾选最多 3 个，开启 4 周验证周期。</text>
        <view style="margin-top: 14rpx; text-align: left">
          <ai-badge />
        </view>
      </view>
      <view
        v-for="c in clues"
        :key="c.id"
        class="card"
        :style="selected.includes(c.id) ? 'border: 3rpx solid #191B2B' : ''"
        @click="toggle(c.id)"
      >
        <view style="margin-bottom: 10rpx">
          <text class="badge badge-task">{{ c.direction_name }}</text>
          <text class="badge" :class="selected.includes(c.id) ? 'badge-level3' : 'badge-level1'">
            {{ selected.includes(c.id) ? "✓ 已选" : "点击选择" }}
          </text>
        </view>
        <view class="card-title">{{ c.statement }}</view>
        <view style="margin-top: 14rpx">
          <text class="muted">{{ c.evidence }}</text>
        </view>
      </view>
      <view class="card">
        <button class="btn" :disabled="selected.length === 0 || submitting" @click="startCycle">
          开始 4 周验证周期（已选 {{ selected.length }}/3）
        </button>
      </view>
    </view>
  </view>
</template>
