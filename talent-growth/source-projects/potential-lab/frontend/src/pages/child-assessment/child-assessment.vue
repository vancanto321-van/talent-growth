<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const PAGE_SIZE = 6;

const loading = ref(true);
const error = ref("");
const forms = ref<any[]>([]);
const options = ref<any[]>([]);
const declaration = ref("");
const form = ref("");
const childNickname = ref("");
const childAgeBand = ref("");

const items = ref<any[]>([]);
const page = ref(0);
const answers = ref<Record<string, number>>({});
const submitting = ref(false);
const expandedWhy = ref("");
const parentConfirmed = ref(false); // 家长观察版：提交前必须由监护人勾选

const pageCount = computed(() => Math.ceil(items.value.length / PAGE_SIZE) || 0);
const pageItems = computed(() => items.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));
const answeredCount = computed(() => Object.keys(answers.value).length);
const pageAllAnswered = computed(() => pageItems.value.every((it: any) => answers.value[it.code]));
const formMeta = computed(() => forms.value.find((f) => f.code === form.value));

onLoad(async () => {
  try {
    await useUserStore().ensureLogin();
    const parent: any = await api.get("/api/child/questions?form=parent");
    forms.value = parent.forms;
    options.value = parent.options;
    declaration.value = parent.declaration;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function chooseForm(code: string) {
  form.value = code;
  parentConfirmed.value = false;
  loadItems();
}

function goMethodology() {
  uni.navigateTo({ url: "/pages/methodology/methodology" });
}

async function loadItems() {
  loading.value = true;
  try {
    const data: any = await api.get(`/api/child/questions?form=${form.value}`);
    items.value = data.items;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function pick(item: any, value: number) {
  answers.value = { ...answers.value, [item.code]: value };
}

function prev() {
  if (page.value > 0) page.value -= 1;
}

function next() {
  if (!childNickname.value.trim()) {
    uni.showToast({ title: "先给孩子起个称呼（小名）", icon: "none" });
    return;
  }
  if (!childAgeBand.value) {
    uni.showToast({ title: "选一下孩子的年龄段", icon: "none" });
    return;
  }
  if (!pageAllAnswered.value) {
    uni.showToast({ title: "这一页还有题没答", icon: "none" });
    return;
  }
  if (page.value < pageCount.value - 1) {
    page.value += 1;
  } else {
    submitAll();
  }
}

async function submitAll() {
  if (form.value === "parent" && !parentConfirmed.value) {
    uni.showToast({ title: "请先确认您是孩子的监护人", icon: "none" });
    return;
  }
  submitting.value = true;
  try {
    const result: any = await api.post("/api/child/submit", {
      form: form.value,
      child_age_band: childAgeBand.value,
      child_nickname: childNickname.value.trim(),
      parent_confirmed: parentConfirmed.value,
      answers: answers.value,
    });
    uni.redirectTo({ url: `/pages/child-result/child-result?id=${result.id}` });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <!-- 选择版本 -->
    <view v-else-if="!form">
      <view class="hero hero-warm">
        <text class="hero-emoji">🌈</text>
        <view class="hero-title">孩子的潜能观察问卷</view>
        <text class="hero-sub">48 题 · 约 5 分钟。八个观察维度参照哈佛大学加德纳教授的多元智能理论，自编中文观察题。结果把孩子分成 8 个类型，配 4 周月度培养方案。</text>
      </view>

      <view
        v-for="f in forms"
        :key="f.code"
        class="card"
        @click="chooseForm(f.code)"
      >
        <view class="row-between">
          <view>
            <text class="eyebrow">{{ f.code === "parent" ? "3-6 岁" : "7-12 岁" }}</text>
            <view class="card-title">{{ f.code === "parent" ? "👪 家长观察版" : "🧒 儿童自答版" }}</view>
          </view>
          <text class="score-big" style="font-size: 40rpx">→</text>
        </view>
        <view style="margin: 10rpx 0">
          <text class="muted">{{ f.target }}</text>
        </view>
        <text class="faint">{{ f.intro }}</text>
      </view>

      <view class="card">
        <text class="eyebrow">说明</text>
        <text class="faint">{{ declaration }}</text>
        <text class="why-toggle" style="margin-top: 12rpx" @click="goMethodology">📖 查看儿童测评方法论与参考文献 →</text>
      </view>
    </view>

    <!-- 基本信息 + 答题 -->
    <view v-else>
      <view class="hero hero-warm">
        <text class="hero-emoji">✏️</text>
        <view class="hero-title">{{ formMeta?.label }}</view>
        <view style="display: flex; gap: 14rpx; align-items: center; margin-top: 16rpx">
          <input
            v-model="childNickname"
            placeholder="孩子的小名"
            :maxlength="12"
            style="flex: 1; background: rgba(255,255,255,0.2); border-radius: 999rpx; padding: 12rpx 26rpx; color: #ffffff"
            placeholder-style="color:rgba(255,255,255,0.7)"
          />
        </view>
        <view style="display: flex; gap: 12rpx; margin-top: 14rpx">
          <text
            v-for="band in ['3-6 岁', '7-9 岁', '10-12 岁']"
            :key="band"
            class="chip-glass"
            :style="childAgeBand === band ? 'background: #ffffff; color: #F45BC3; font-weight: 700' : ''"
            @click="childAgeBand = band"
          >{{ band }}</text>
        </view>
        <view class="bar-track" style="margin-top: 18rpx; background: rgba(255,255,255,0.25)">
          <view class="bar-fill" style="background: #ffffff" :style="{ width: (answeredCount / items.length) * 100 + '%' }" />
        </view>
        <text class="hero-sub">已答 {{ answeredCount }} / {{ items.length }}</text>
      </view>

      <view v-for="it in pageItems" :key="it.code" class="card">
        <view style="margin-bottom: 16rpx">
          <text style="font-size: 28rpx; font-weight: 600">{{ it.text }}</text>
          <text class="why-toggle" @click="expandedWhy = expandedWhy === it.code ? '' : it.code">
            {{ expandedWhy === it.code ? "收起 ↑" : "为什么这么问？ ↓" }}
          </text>
          <text v-if="expandedWhy === it.code && it.why" class="why-text">{{ it.why }}</text>
        </view>
        <view style="display: flex; gap: 10rpx">
          <view
            v-for="opt in options"
            :key="opt.value"
            class="opt-pill"
            :class="answers[it.code] === opt.value ? 'opt-active' : ''"
            @click="pick(it, opt.value)"
          >
            <text style="font-size: 22rpx">{{ opt.label }}</text>
          </view>
        </view>
      </view>

      <!-- 监护人确认（家长观察版，提交前必勾） -->
      <view
        v-if="form === 'parent' && page === pageCount - 1"
        class="card card-tight"
        style="display: flex; align-items: center; gap: 14rpx"
        @click="parentConfirmed = !parentConfirmed"
      >
        <text
          :style="parentConfirmed
            ? 'flex-shrink: 0; width: 42rpx; height: 42rpx; line-height: 38rpx; text-align: center; font-size: 26rpx; font-weight: 800; color: #191b2b; background: #ffe467; border: 3rpx solid #191b2b; border-radius: 12rpx'
            : 'flex-shrink: 0; width: 42rpx; height: 42rpx; line-height: 38rpx; text-align: center; font-size: 26rpx; color: transparent; background: #ffffff; border: 3rpx solid #d5d7e2; border-radius: 12rpx'"
        >✓</text>
        <text style="font-size: 24rpx; line-height: 1.6">我确认我是孩子的监护人，已如实观察作答</text>
      </view>

      <view class="card" style="display: flex; gap: 16rpx">
        <button v-if="page > 0" class="btn-ghost" style="flex: 1" @click="prev">上一页</button>
        <button class="btn btn-warm" style="flex: 2" :disabled="submitting" @click="next">
          {{ page < pageCount - 1 ? `下一页（${page + 2}/${pageCount}）` : submitting ? "正在生成…" : "生成孩子的类型报告" }}
        </button>
      </view>
    </view>
  </view>
</template>
