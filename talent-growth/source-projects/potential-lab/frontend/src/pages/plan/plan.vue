<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import api from "../../api/client";
import { useUserStore } from "../../stores/user";

const loading = ref(true);
const error = ref("");
const notFound = ref(false);
const plan = ref<any>(null);

const kindLabel: Record<string, string> = {
  task: "主方向任务",
  experience: "新方向体验",
  reflect: "周回顾",
};
const kindClass: Record<string, string> = {
  task: "badge-task",
  experience: "badge-experience",
  reflect: "badge-reflect",
};
function goExplore() {
  uni.switchTab({ url: "/pages/explore/explore" });
}
const kindEmoji: Record<string, string> = {
  task: "🎯",
  experience: "🌱",
  reflect: "📝",
};

// 打卡表单状态
const checkinFor = ref(-1);
const minutes = ref("30");
const feeling = ref("");

async function refresh() {
  error.value = "";
  notFound.value = false;
  try {
    await useUserStore().ensureLogin();
    plan.value = await api.get("/api/plans/current");
  } catch (e: any) {
    if (e.statusCode === 404 || String(e.message).includes("探索周期")) notFound.value = true;
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onShow(refresh);

function openCheckin(idx: number) {
  checkinFor.value = idx;
  feeling.value = "";
}

const checkinBusy = ref(false);
async function doCheckin() {
  if (checkinBusy.value) return;
  checkinBusy.value = true;
  try {
    const res: any = await api.post("/api/plans/checkin", {
      plan_id: plan.value.id,
      item_index: checkinFor.value,
      minutes: Number(minutes.value) || 0,
      feeling: feeling.value,
    });
    plan.value = res.plan;
      checkinFor.value = -1;
      celebrate(res.reward);
      offerReminder();
    } catch (e: any) {
      uni.showToast({ title: e.message, icon: "none" });
    } finally {
      checkinBusy.value = false;
    }
}

// 打卡完成后顺势邀请订阅每周提醒（最佳实践：在完成有价值动作后请求订阅，而非首次进入）
let reminderOffered = false;
async function offerReminder() {
  if (reminderOffered) return;
  try {
    const st: any = await api.get("/api/reminders/status");
    if (!st.available || st.subscribed) return;
    reminderOffered = true;
    const go = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: "开启每周提醒",
        content: "每周一早 8 点提醒你查看本周计划，最多每周一条，可随时关闭。",
        confirmText: "开启提醒",
        cancelText: "下次再说",
        success: (r: any) => resolve(!!r.confirm),
        fail: () => resolve(false),
      });
    });
    if (!go) return;
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [st.template_id],
      complete: () => {
        api.post("/api/reminders/subscribe", { kind: "weekly_plan", template_id: st.template_id }).catch(() => {});
      },
    });
    // #endif
    // #ifndef MP-WEIXIN
    await api.post("/api/reminders/subscribe", { kind: "weekly_plan", template_id: st.template_id });
    uni.showToast({ title: "已订阅提醒", icon: "success" });
    // #endif
  } catch {
    /* 提醒订阅失败不影响主流程 */
  }
}

// 多邻国式完成庆祝
const celebration = ref<{ show: boolean; xp: number; title: string; sub: string }>({
  show: false,
  xp: 0,
  title: "",
  sub: "",
});
const CONFETTI = ["🎉", "✨", "⭐", "🎊", "💫", "🌟"];
function celebrate(reward: any) {
  if (!reward) return;
  const firstAch = reward.new_achievements?.[0];
  celebration.value = {
    show: true,
    xp: reward.xp_awarded,
    title: reward.level_up ? "升级啦！" : firstAch ? `解锁成就「${firstAch.name}」` : "打卡成功！",
    sub: reward.level_up
      ? `现在是 LV.${reward.level} ${reward.level_name}`
      : `🔥 连续探索 ${reward.streak_days} 天 · 继续保持`,
  };
  setTimeout(() => (celebration.value.show = false), 2400);
}

async function regenerate() {
  try {
    plan.value = await api.post("/api/plans/regenerate");
    uni.showToast({ title: "已重新生成", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none" });
  }
}

async function finishCycle() {
  const confirm = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "结业并生成报告",
      content: "结业后本周期结束，报告会给出每个方向的判定和下期建议。确定结业？",
      confirmText: "确定", cancelText: "取消",
      success: (r: any) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirm) return;
  try {
    const report: any = await api.post("/api/cycles/finish");
    uni.redirectTo({ url: `/pages/cycle-report/cycle-report?cycle=${report.cycle_id}` });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  }
}
</script>

<template>
  <view>
    <!-- 庆祝浮层 -->
    <view v-if="celebration.show" class="celebrate-mask">
      <text
        v-for="(c, i) in CONFETTI"
        :key="'c' + i"
        class="confetti"
        :style="{ left: 8 + i * 15 + '%', animationDelay: i * 0.12 + 's' }"
      >{{ c }}</text>
      <view class="celebrate-card">
        <text class="celebrate-emoji">🎉</text>
        <text class="celebrate-title">{{ celebration.title }}</text>
        <text class="celebrate-xp">+{{ celebration.xp }} XP</text>
        <text class="celebrate-sub">{{ celebration.sub }}</text>
      </view>
    </view>

    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else-if="notFound" class="card empty-box">
      <text class="empty-emoji">🗓️</text>
      <view class="empty-title">还没有计划</view>
      <text class="muted">完成探测访谈并开启 4 周周期后，每周会自动生成一份可执行计划。</text>
      <button class="btn" style="margin-top: 30rpx" @click="goExplore">去探测</button>
    </view>

    <view v-else>
      <view class="hero hero-warm">
        <text class="hero-emoji">🗓️</text>
        <view class="hero-title">第 {{ plan.week_index }} 周 · 主攻「{{ plan.focus_direction_name }}」</view>
        <text class="hero-sub">按周推进：完成打卡，让每一步都算数。</text>
      </view>

      <view v-if="plan.ai_note" class="card">
        <view class="row-between" style="margin-bottom: 8rpx">
          <text class="eyebrow" style="margin-bottom: 0">本周教练建议</text>
          <ai-badge />
        </view>
        <text style="font-size: 26rpx; color: #43465c">{{ plan.ai_note }}</text>
      </view>

      <view v-for="(item, idx) in plan.items" :key="idx" class="card">
        <view style="margin-bottom: 10rpx">
          <text class="badge" :class="kindClass[item.kind] || 'badge-task'">{{ kindEmoji[item.kind] || "" }} {{ kindLabel[item.kind] || item.kind }}</text>
          <text v-if="item.done" class="badge badge-level3">✓ 已完成</text>
        </view>
        <view class="card-title">{{ item.title }}</view>
        <view style="margin: 12rpx 0 20rpx">
          <text class="muted">{{ item.detail }}</text>
        </view>

        <button v-if="!item.done" class="btn-ghost" @click="openCheckin(idx)">打卡完成 ✓</button>
        <view v-else class="tip-line">
          用时 {{ item.checkin?.minutes || 0 }} 分钟{{ item.checkin?.feeling ? " · " + item.checkin.feeling : "" }}
        </view>

        <view v-if="checkinFor === idx" style="margin-top: 20rpx; background: #f4f5fa; border-radius: 20rpx; padding: 24rpx">
          <view class="row-between" style="margin-bottom: 14rpx">
            <text>用时（分钟）</text>
            <input
              v-model="minutes"
              type="number"
              style="background: #ffffff; border-radius: 14rpx; padding: 10rpx 20rpx; width: 170rpx; text-align: center"
            />
          </view>
          <textarea
            v-model="feeling"
            placeholder="一句感受：哪一步最顺/最费劲？（可留空）"
            :maxlength="500"
            style="width: 100%; height: 130rpx; background: #ffffff; border-radius: 16rpx; padding: 18rpx; box-sizing: border-box"
          />
          <view style="display: flex; gap: 16rpx; margin-top: 18rpx">
            <button class="btn" style="flex: 1" :disabled="checkinBusy" @click="doCheckin">确认打卡</button>
            <button class="btn-ghost" style="flex: 0 0 150rpx" @click="checkinFor = -1">取消</button>
          </view>
        </view>
      </view>

      <view class="card">
        <button class="btn-ghost" style="margin-bottom: 16rpx" @click="regenerate">🔄 本周计划不合适？重新生成</button>
        <button class="btn" @click="finishCycle">🎓 生成 4 周结业报告</button>
        <text class="faint" style="display: block; margin-top: 12rpx">
          结业会汇总本周期全部证据：每个方向「继续/冲刺/暂停」的判定、未验证清单和下期建议。
        </text>
      </view>
    </view>
  </view>
</template>
