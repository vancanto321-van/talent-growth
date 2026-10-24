<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import api from "../../api/client";

const instanceId = ref(0);
const loading = ref(true);
const error = ref("");
const instance = ref<any>(null);
const evaluations = ref<any[]>([]);

// 提交表单
const mode = ref("independent");
const textContent = ref("");
const timeSpent = ref("30");
const difficulty = ref(3);

// 自评 / 读者反馈
const investment = ref(4);
const willingness = ref(4);
const feelingNote = ref("");
const readerRating = ref(5);
const readerComment = ref("");

const tpl = computed(() => instance.value?.template);
const status = computed(() => instance.value?.status || "");
const selfDone = computed(() => !!instance.value?.self_investment);
const aiEval = computed(() => evaluations.value.find((e) => e.source === "ai"));
const readerEvals = computed(() => evaluations.value.filter((e) => e.source === "reader"));
const stageLabel: Record<string, string> = { intro: "入门", advanced: "进阶", transfer: "迁移/保持" };

// 待评价：作品已提交但尚无有效 AI 评估（aiEval 为空或降级），结合后端 needs_evaluation 双保险
const pendingEval = computed(() => {
  if (status.value !== "submitted") return false;
  if (instance.value && instance.value.needs_evaluation === false) return false;
  return !aiEval.value || !!aiEval.value.degraded;
});

// 评价纠错反馈（对 AI 初评的纠错）
const feedbackOpen = ref(false);
const feedbackComment = ref("");
const feedbackSubmitting = ref(false);
const feedbackDoneId = ref(0); // 已提交过反馈的 evaluation id（重新评估出新评价后可再次反馈）

async function submitEvalFeedback() {
  if (feedbackSubmitting.value || !aiEval.value) return;
  const comment = feedbackComment.value.trim();
  if (comment.length < 2 || comment.length > 500) {
    uni.showToast({ title: "请写 2-500 字的问题说明", icon: "none" });
    return;
  }
  feedbackSubmitting.value = true;
  try {
    await api.post(`/api/tasks/${instanceId.value}/eval-feedback`, {
      evaluation_id: aiEval.value.id,
      comment,
    });
    feedbackDoneId.value = aiEval.value.id;
    feedbackOpen.value = false;
    feedbackComment.value = "";
    uni.showToast({ title: "反馈已记录", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  } finally {
    feedbackSubmitting.value = false;
  }
}

onLoad(async (query: any) => {
  instanceId.value = Number(query?.id || 0);
  await refresh();
});

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const res: any = await api.get(`/api/tasks/${instanceId.value}`);
    instance.value = res.instance;
    evaluations.value = res.evaluations || [];
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function start() {
  try {
    instance.value = await api.post(`/api/tasks/${instanceId.value}/start`);
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none" });
  }
}

const submitting = ref(false);
async function submit() {
  if (submitting.value) return;
  if (!textContent.value.trim()) {
    uni.showToast({ title: "先写下你的作品/答案", icon: "none" });
    return;
  }
    submitting.value = true;
    try {
      const res: any = await api.post(`/api/tasks/${instanceId.value}/submit`, {
      text_content: textContent.value,
      mode: mode.value,
      time_spent_min: Number(timeSpent.value) || 1,
      difficulty_feedback: difficulty.value,
    });
      instance.value = res.instance;
      if (res.degraded) {
        uni.showToast({ title: res.evaluation.overall_comment, icon: "none", duration: 3000 });
      } else {
        uni.showToast({ title: "已提交，AI 已给出初评", icon: "success" });
      }
      celebrate(res.reward);
      await refresh();
    } catch (e: any) {
      uni.showToast({ title: e.message, icon: "none", duration: 3000 });
    } finally {
      submitting.value = false;
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
    title: reward.level_up ? "升级啦！" : firstAch ? `解锁成就「${firstAch.name}」` : "干得漂亮！",
    sub: reward.level_up
      ? `现在是 LV.${reward.level} ${reward.level_name}`
      : `🔥 连续探索 ${reward.streak_days} 天 · 继续保持`,
  };
  setTimeout(() => (celebration.value.show = false), 2400);
}

// AI 降级后可手动重新评估
async function reevaluate() {
  try {
    const res: any = await api.post(`/api/tasks/${instanceId.value}/re-evaluate`);
    evaluations.value = evaluations.value.filter((e) => e.source !== "ai");
    evaluations.value.push(res.evaluation);
    instance.value.status = "evaluated";
    instance.value.needs_evaluation = false;
    // 换了新评价，纠错反馈入口回到初始态
    feedbackOpen.value = false;
    feedbackComment.value = "";
    uni.showToast({ title: "AI 已重新评估", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none", duration: 3000 });
  }
}

async function submitSelfReview() {
  try {
    instance.value = await api.post(`/api/tasks/${instanceId.value}/self-review`, {
      investment: investment.value,
      willingness: willingness.value,
      feeling: feelingNote.value,
    });
    uni.showToast({ title: "自评已记录", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none" });
  }
}

async function submitReaderFeedback() {
  try {
    const ev: any = await api.post(`/api/tasks/${instanceId.value}/reader-feedback`, {
      rating: readerRating.value,
      comment: readerComment.value,
    });
    evaluations.value.push(ev);
    readerComment.value = "";
    uni.showToast({ title: "读者反馈已记录", icon: "success" });
  } catch (e: any) {
    uni.showToast({ title: e.message, icon: "none" });
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
    <view v-else-if="error" class="error-tip">
      {{ error }}
      <button class="btn-ghost" style="margin-top: 16rpx" @click="refresh">点击重试</button>
    </view>

    <view v-else-if="instance">
      <!-- 任务卡 -->
      <view v-if="tpl" class="hero">
        <text class="hero-emoji">🎯</text>
        <view class="hero-title">{{ tpl.title }}</view>
        <view style="margin-top: 8rpx">
          <text class="chip-glass">{{ tpl.direction_name }} · {{ stageLabel[tpl.stage] || tpl.stage }}</text>
          <text class="chip-glass">⏱ 约 {{ tpl.est_minutes }} 分钟</text>
          <text class="chip-glass">难度 {{ tpl.difficulty }}/3</text>
        </view>
        <text class="hero-sub" style="margin-top: 16rpx">{{ tpl.description }}</text>
      </view>

      <!-- 步骤 + 口径 -->
      <view v-if="tpl" class="card">
        <text class="eyebrow">怎么做</text>
        <view v-for="(s, i) in tpl.steps" :key="i" class="activity-line">{{ i + 1 }}. {{ s }}</view>
        <view class="divider" />
        <text class="eyebrow">评分口径（AI 和你都用这个标准）</text>
        <view v-for="(r, i) in tpl.rubric" :key="'r' + i" class="activity-line">· {{ r.dimension }}：{{ r.guide }}</view>
      </view>

      <!-- 未开始 -->
      <view v-if="status === 'assigned'" class="card">
        <button class="btn" @click="start">开始任务 →</button>
      </view>

      <!-- 提交表单 -->
      <view v-if="status === 'in_progress'" class="card">
        <text class="eyebrow">提交你的作品</text>
        <view class="card-title" style="margin: 6rpx 0 18rpx">完成后写在这里</view>

        <view style="display: flex; gap: 14rpx; margin-bottom: 18rpx">
          <text :class="mode === 'independent' ? 'opt-pill opt-active' : 'opt-pill'" @click="mode = 'independent'">独立完成</text>
          <text :class="mode === 'ai_assisted' ? 'opt-pill opt-active' : 'opt-pill'" @click="mode = 'ai_assisted'">用了 AI 辅助</text>
        </view>
        <text class="faint" style="display: block; margin-bottom: 14rpx">独立完成和 AI 辅助的成绩会分开统计，请如实选择。</text>

        <textarea
          v-model="textContent"
          placeholder="把你的作品/答案完整写在这里…"
          :maxlength="8000"
          style="width: 100%; height: 320rpx; background: #f4f5fa; border-radius: 20rpx; padding: 22rpx; box-sizing: border-box; font-size: 28rpx"
        />

        <view class="row-between" style="margin-top: 18rpx">
          <text>实际用时（分钟）</text>
          <input
            v-model="timeSpent"
            type="number"
            style="background: #f4f5fa; border-radius: 14rpx; padding: 10rpx 20rpx; width: 170rpx; text-align: center"
          />
        </view>
        <view class="row-between" style="margin-top: 18rpx">
          <text style="flex-shrink: 0; margin-right: 14rpx">主观难度 {{ difficulty }}/5</text>
          <slider :value="difficulty" :min="1" :max="5" show-value activeColor="#191B2B" style="flex: 1" @change="(e: any) => (difficulty = e.detail.value)" />
        </view>

        <button class="btn" style="margin-top: 26rpx" :disabled="submitting" @click="submit">提交并获取 AI 初评 →</button>
      </view>

      <!-- AI 初评 / 待评价 -->
      <view v-if="aiEval || pendingEval" class="card">
        <view class="row-between" style="margin-bottom: 14rpx">
          <view style="display: flex; align-items: center; gap: 12rpx">
            <text v-if="pendingEval" class="badge badge-task sticker" style="font-size: 26rpx; padding: 6rpx 24rpx">⏳ 待评价</text>
            <text v-else class="eyebrow" style="margin-bottom: 0">AI 初评</text>
            <ai-badge :model="aiEval?.ai_model" />
          </view>
          <text
            v-if="status === 'submitted' || status === 'evaluated'"
            class="brand-text"
            style="font-size: 24rpx"
            @click="reevaluate"
          >🔄 重新评估</text>
        </view>
        <view v-if="pendingEval" style="margin-bottom: 6rpx">
          <text style="font-size: 27rpx; font-weight: 700">作品已提交，等待 AI 评价</text>
          <text v-if="aiEval?.degraded && aiEval.overall_comment" class="faint" style="display: block; margin-top: 8rpx">{{ aiEval.overall_comment }}</text>
        </view>
        <block v-if="aiEval && !aiEval.degraded">
          <view v-for="(s, i) in aiEval.scores" :key="i" class="score-row">
            <view class="score-head">
              <text style="font-size: 26rpx; font-weight: 600">{{ s.dimension }}</text>
              <text class="score-num" style="font-size: 34rpx">{{ s.score }}/5</text>
            </view>
            <view class="bar-track">
              <view class="bar-fill" :style="{ width: (s.score / 5) * 100 + '%' }" />
            </view>
            <text class="faint" style="font-size: 22rpx; margin-top: 6rpx; display: block">{{ s.comment }}</text>
          </view>
          <view v-if="aiEval.overall_comment" style="margin: 8rpx 0 12rpx">
            <text style="font-size: 26rpx; color: #43465c">{{ aiEval.overall_comment }}</text>
          </view>
          <view v-if="aiEval.evidence_quotes?.length" class="quote-box">
            <text class="faint">评估依据（你的原话）：</text>
            <text v-for="(q, i) in aiEval.evidence_quotes" :key="i" style="display: block; font-size: 22rpx; color: #6f7488">「{{ q }}」</text>
          </view>
          <view v-for="(s, i) in aiEval.suggestions" :key="'s' + i" class="suggest-line">💡 {{ s }}</view>

          <!-- 评价纠错反馈 -->
          <view style="margin-top: 10rpx">
            <text v-if="feedbackDoneId === aiEval.id" class="faint" style="font-weight: 700">已反馈 ✓</text>
            <block v-else>
              <text class="why-toggle" style="margin-top: 2rpx" @click="feedbackOpen = !feedbackOpen">评价有误？反馈问题 →</text>
              <block v-if="feedbackOpen">
                <textarea
                  v-model="feedbackComment"
                  placeholder="哪里评得不对？（2-500 字，会用于改进评价质量）"
                  :maxlength="500"
                  style="width: 100%; height: 140rpx; background: #f4f5fa; border-radius: 20rpx; padding: 20rpx; box-sizing: border-box; margin-top: 14rpx; font-size: 26rpx"
                />
                <button class="btn-ghost" style="margin-top: 14rpx" :disabled="feedbackSubmitting" @click="submitEvalFeedback">
                  {{ feedbackSubmitting ? "正在提交…" : "提交反馈" }}
                </button>
              </block>
            </block>
          </view>
        </block>
      </view>

      <!-- 自评 -->
      <view v-if="status === 'submitted' || status === 'evaluated'" class="card">
        <text class="eyebrow">你的自评</text>
        <view v-if="selfDone" class="tip-line" style="margin-top: 12rpx">
          投入度 {{ instance.self_investment }}/5 · 还想练 {{ instance.self_willingness }}/5
          <block v-if="instance.self_feeling"> · {{ instance.self_feeling }}</block>
        </view>
        <block v-else>
          <view class="row-between" style="margin-top: 12rpx">
            <text style="flex-shrink: 0; margin-right: 14rpx">投入度 {{ investment }}/5</text>
            <slider :value="investment" :min="1" :max="5" show-value activeColor="#191B2B" style="flex: 1" @change="(e: any) => (investment = e.detail.value)" />
          </view>
          <view class="row-between">
            <text style="flex-shrink: 0; margin-right: 14rpx">还想练 {{ willingness }}/5</text>
            <slider :value="willingness" :min="1" :max="5" show-value activeColor="#191B2B" style="flex: 1" @change="(e: any) => (willingness = e.detail.value)" />
          </view>
          <textarea
            v-model="feelingNote"
            placeholder="哪一步最顺？哪一步卡住？（可留空）"
            :maxlength="2000"
            style="width: 100%; height: 140rpx; background: #f4f5fa; border-radius: 20rpx; padding: 20rpx; box-sizing: border-box; margin-top: 14rpx"
          />
          <button class="btn" style="margin-top: 18rpx" @click="submitSelfReview">保存自评</button>
        </block>
      </view>

      <!-- 读者反馈 -->
      <view v-if="status === 'submitted' || status === 'evaluated'" class="card">
        <text class="eyebrow">真实读者反馈</text>
        <view class="card-title" style="margin: 6rpx 0 10rpx">让一个真实的人读一读</view>
        <text class="muted">
          把作品发给家人/朋友/同事，请他指出没看懂的地方，然后帮他录入。
          有了读者反馈，「证据充分度」才能升到「较充分」。
        </text>
        <view class="row-between" style="margin-top: 18rpx">
          <text style="flex-shrink: 0; margin-right: 14rpx">总体印象 {{ readerRating }}/5</text>
          <slider :value="readerRating" :min="1" :max="5" show-value activeColor="#191B2B" style="flex: 1" @change="(e: any) => (readerRating = e.detail.value)" />
        </view>
        <textarea
          v-model="readerComment"
          placeholder="读者说了什么？（原话最好）"
          :maxlength="2000"
          style="width: 100%; height: 120rpx; background: #f4f5fa; border-radius: 20rpx; padding: 20rpx; box-sizing: border-box; margin-top: 14rpx"
        />
        <button class="btn-ghost" style="margin-top: 18rpx" @click="submitReaderFeedback">录入读者反馈</button>
        <view v-for="(e, i) in readerEvals" :key="i" class="quote-box" style="margin-top: 14rpx">
          <text class="muted">读者 {{ e.scores[0]?.score }}/5：{{ e.overall_comment }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
