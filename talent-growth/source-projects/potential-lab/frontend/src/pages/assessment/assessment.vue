<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const PAGE_SIZE = 6;

const loading = ref(true);
const error = ref("");
const count = ref(0);
const options = ref<any[]>([]);
const items = ref<any[]>([]);
const page = ref(0);
const answers = ref<Record<string, number>>({});
const submitting = ref(false);
const hadPrevious = ref(false);
const expandedWhy = ref("");

const pageCount = computed(() => Math.ceil(count.value / PAGE_SIZE) || 0);
const pageItems = computed(() => items.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));
const answeredCount = computed(() => Object.keys(answers.value).length);
const pageAllAnswered = computed(() => pageItems.value.every((it) => answers.value[it.code]));

onLoad(async () => {
  try {
    await useUserStore().ensureLogin();
    const data: any = await api.get("/api/assessment/questions");
    items.value = data.items;
    options.value = data.options;
    count.value = data.count;
    const latest: any = await api.get("/api/assessment/latest");
    hadPrevious.value = !!latest;
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function pick(item: any, value: number) {
  answers.value = { ...answers.value, [item.code]: value };
}

function prev() {
  if (page.value > 0) page.value -= 1;
}

function next() {
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
  if (submitting.value) return;
  submitting.value = true;
  try {
    const result: any = await api.post("/api/assessment/submit", { answers: answers.value });
    uni.setStorageSync("pl_assessment_latest", result);
    uni.redirectTo({ url: "/pages/assessment-result/assessment-result" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    submitting.value = false;
  }
}

function goMethodology() {
  uni.navigateTo({ url: "/pages/methodology/methodology" });
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="muted">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else>
      <view class="hero">
        <text class="hero-emoji">🧪</text>
        <view class="hero-title">48 题 · 约 5 分钟</view>
        <text class="hero-sub">
          按第一印象作答，没有对错。结果会给出 12 个行业的潜力参照、短板训练路径和收入行情。
        </text>
        <view class="bar-track" style="margin-top: 20rpx; background: rgba(255,255,255,0.25)">
          <view class="bar-fill" style="background: #ffffff" :style="{ width: (answeredCount / count) * 100 + '%' }" />
        </view>
        <text class="hero-sub">已答 {{ answeredCount }} / {{ count }}{{ hadPrevious ? " · 你做过测评，重新提交会覆盖最新结果" : "" }}</text>
      </view>

      <view v-for="it in pageItems" :key="it.code" class="card">
        <view style="margin-bottom: 16rpx">
          <text style="font-size: 28rpx; font-weight: 600">{{ it.text }}</text>
          <text v-if="it.reverse" class="faint">（反着说的一句话，注意理解）</text>
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

      <view class="card" style="display: flex; gap: 16rpx">
        <button v-if="page > 0" class="btn-ghost" style="flex: 1" @click="prev">上一页</button>
        <button class="btn" style="flex: 2" :disabled="submitting" @click="next">
          {{ page < pageCount - 1 ? `下一页（${page + 2}/${pageCount}）` : submitting ? "正在计算…" : "提交并查看行业潜力" }}
        </button>
      </view>

      <view class="card">
        <text class="faint">本问卷为自编中文题；结果定位为「潜力参照」，不是天赋判定。</text>
        <text class="why-toggle" style="margin-top: 12rpx" @click="goMethodology">📖 查看完整测评方法论与参考文献 →</text>
      </view>
    </view>
  </view>
</template>

