<script setup lang="ts">
import { ref } from "vue";
import { getCurrentInstance, nextTick } from "vue";
import { onShow } from "@dcloudio/uni-app";
import api, { BASE_URL, clearAll, getToken } from "../../api/client";
import { useUserStore } from "../../stores/user";

const loading = ref(true);
const error = ref("");
const profile = ref<any>(null);
const assessment = ref<any>(null);
const cultivationOpen = ref("");
const exporting = ref(false);
const deleting = ref(false);
const loggingOut = ref(false);

const levelClass: Record<string, string> = {
  线索: "badge-level1",
  初步: "badge-level2",
  较充分: "badge-level3",
};

// 证据不足的维度（measured=false / value=null）不显示分数，只显示「待验证」
function dimMeasured(d: any): boolean {
  return !!d.measured && d.value !== null && d.value !== undefined;
}

// 实际做了多少次任务：优先用提交数（含 AI 辅助），没有提交记录时退回去重的任务数
function taskTimes(c: any): number {
  return c.submission_count || c.task_count || 0;
}

async function refresh() {
  error.value = "";
  try {
    await useUserStore().ensureLogin();
    profile.value = await api.get("/api/profile");
    try {
      assessment.value = await api.get("/api/assessment/latest");
    } catch {
      assessment.value = null;
    }
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onShow(refresh);

function openIndustry(code: string) {
  uni.navigateTo({ url: `/pages/industry/industry?code=${code}` });
}

function goAssessmentResult() {
  uni.navigateTo({ url: "/pages/assessment-result/assessment-result" });
}

function goExploreTab() {
  uni.switchTab({ url: "/pages/explore/explore" });
}

function goBoundary() {
  uni.navigateTo({ url: "/pages/science-boundary/science-boundary" });
}

/* ============ 五维画像分享卡片（canvas 绘制，H5 / mp-weixin 双端） ============ */
// 设计语言沿用全局：奶油底 + 深藏青描边 + 糖果色块。坐标按 340×680 逻辑尺寸绘制，
// 展示时用 transform 缩放适配屏幕；导出时按 2 倍尺寸出图。
const instance = getCurrentInstance();
const showCard = ref(false);
const cardReady = ref(false);
const drawing = ref(false);
const showNickname = ref(false); // 分享卡片默认脱敏，昵称需用户手动勾选
const saveLabel = ref("保存到相册");
// #ifdef H5
saveLabel.value = "预览图片（长按保存）";
// #endif

const SC = {
  W: 340,
  H: 680,
  ink: "#191B2B",
  ink70: "rgba(25,27,43,0.72)",
  ink50: "rgba(25,27,43,0.5)",
  card: "#FFFEF8",
  bg: "#FFFDF6",
  yellow: "#FFE467",
  cyan: "#38C8F5",
  cyanSoft: "#E3F6FE",
  mintSoft: "#EAFBF3",
  lineSoft: "rgba(25,27,43,0.15)",
};

/** 旧版 CanvasContext 没有 roundRect，用二次曲线拼圆角矩形。 */
function rr(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function scPill(ctx: any, x: number, y: number, text: string, bg: string, fontSize = 13) {
  const w = text.length * fontSize + 18;
  const h = fontSize + 12;
  rr(ctx, x, y, w, h, h / 2);
  ctx.setFillStyle(bg);
  ctx.fill();
  ctx.setStrokeStyle(SC.ink);
  ctx.setLineWidth(1.5);
  ctx.stroke();
  ctx.setFillStyle(SC.ink);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.setTextAlign("left");
  ctx.setTextBaseline("middle");
  ctx.fillText(text, x + 9, y + h / 2);
  ctx.setTextBaseline("alphabetic");
  return w;
}

function openShareCard() {
  showCard.value = true;
  cardReady.value = false;
  nextTick(() => drawShareCard());
}

function closeShareCard() {
  showCard.value = false;
}

function drawShareCard() {
  const profileData = profile.value;
  if (!profileData) return;
  const ctx = uni.createCanvasContext("profileShareCard", instance?.proxy as any);

  // 背景 + 卡片
  ctx.setFillStyle(SC.bg);
  ctx.fillRect(0, 0, SC.W, SC.H);
  rr(ctx, 10, 10, SC.W - 20, SC.H - 20, 24);
  ctx.setFillStyle(SC.card);
  ctx.fill();
  ctx.setStrokeStyle(SC.ink);
  ctx.setLineWidth(3);
  ctx.stroke();

  // Logo：黄底「潜」字贴纸 + 标题
  rr(ctx, 32, 34, 42, 42, 12);
  ctx.setFillStyle(SC.yellow);
  ctx.fill();
  ctx.setStrokeStyle(SC.ink);
  ctx.setLineWidth(2);
  ctx.stroke();
  ctx.setFillStyle(SC.ink);
  ctx.font = "bold 24px sans-serif";
  ctx.setTextAlign("center");
  ctx.fillText("潜", 53, 63);
  ctx.setTextAlign("left");
  ctx.font = "bold 21px sans-serif";
  ctx.fillText("天赋实验室", 88, 54);
  ctx.setFillStyle(SC.ink70);
  ctx.font = "12px sans-serif";
  ctx.fillText("五维优势画像 · 4 周行为验证", 88, 74);

  // 昵称（可脱敏）+ 日期
  const nickname = (useUserStore().nickname || "").trim().slice(0, 12);
  const who = showNickname.value && nickname ? nickname : "一位探索者";
  ctx.setFillStyle(SC.ink70);
  ctx.font = "13px sans-serif";
  ctx.fillText(`探索者：${who}`, 32, 100);
  ctx.setTextAlign("right");
  ctx.setFillStyle(SC.ink50);
  ctx.font = "11px sans-serif";
  ctx.fillText(new Date().toISOString().slice(0, 10), SC.W - 32, 100);
  ctx.setTextAlign("left");

  // 每个方向：方向徽章 + 证据等级 + 五维条
  const clues = (profileData.clues || []).slice(0, 3);
  let y = 116;
  for (const c of clues) {
    const name = (c.direction_name || "").slice(0, 8);
    const nameW = scPill(ctx, 32, y, name, SC.yellow);
    const levelBg = c.evidence_level === "较充分" ? SC.mintSoft : c.evidence_level === "初步" ? SC.cyanSoft : "#FFFFFF";
    scPill(ctx, 32 + nameW + 10, y, `证据:${c.evidence_level || "线索"}`, levelBg, 11);
    let dy = y + 32;
    for (const d of c.dimensions || []) {
      ctx.setFillStyle(SC.ink70);
      ctx.font = "11px sans-serif";
      ctx.fillText((d.label || "").slice(0, 6), 36, dy + 9);
      const tx = 106;
      const tw = 152;
      rr(ctx, tx, dy, tw, 10, 5);
      ctx.setFillStyle("#FFFFFF");
      ctx.fill();
      ctx.setStrokeStyle(SC.ink);
      ctx.setLineWidth(1);
      ctx.stroke();
      const measured = !!d.measured && d.value !== null && d.value !== undefined;
      if (measured) {
        const fw = Math.max(4, (tw - 4) * (Math.round(d.value) / 100));
        rr(ctx, tx + 2, dy + 2, fw, 6, 3);
        ctx.setFillStyle(SC.cyan);
        ctx.fill();
        ctx.setTextAlign("right");
        ctx.setFillStyle(SC.ink);
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`${Math.round(d.value)}%`, SC.W - 32, dy + 10);
        ctx.setTextAlign("left");
      } else {
        ctx.setTextAlign("right");
        ctx.setFillStyle(SC.ink50);
        ctx.font = "11px sans-serif";
        ctx.fillText("待验证", SC.W - 32, dy + 10);
        ctx.setTextAlign("left");
      }
      dy += 21;
    }
    y = dy + 14;
  }

  // 底部：虚线分隔 + 口号 + 合规一行
  const fy = SC.H - 92;
  ctx.setStrokeStyle(SC.lineSoft);
  ctx.setLineWidth(2);
  for (let x = 32; x < SC.W - 32; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, fy);
    ctx.lineTo(Math.min(x + 4, SC.W - 32), fy);
    ctx.stroke();
  }
  ctx.setTextAlign("center");
  ctx.setFillStyle(SC.ink);
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("只和自己比 · 用真实任务验证天赋线索", SC.W / 2, fy + 26);
  ctx.setFillStyle(SC.ink50);
  ctx.font = "9px sans-serif";
  ctx.fillText("结论为当下行为倾向 · 会变化 · 可重测 · 不构成医疗或心理咨询建议", SC.W / 2, fy + 46);
  ctx.fillText("天赋实验室 · 小潜陪你验证", SC.W / 2, fy + 64);
  ctx.setTextAlign("left");

  ctx.draw(false, () => {
    cardReady.value = true;
  });
}

function toggleNickname() {
  showNickname.value = !showNickname.value;
  cardReady.value = false;
  nextTick(() => drawShareCard());
}

/** 导出卡片：小程序直接存相册（失败退回预览）；H5 走预览由用户长按/右键保存。 */
function saveCard() {
  if (drawing.value || !cardReady.value) return;
  drawing.value = true;
  uni.canvasToTempFilePath(
    {
      canvasId: "profileShareCard",
      width: SC.W,
      height: SC.H,
      destWidth: SC.W * 2,
      destHeight: SC.H * 2,
      success: (res: any) => {
        const filePath = res.tempFilePath || (res.tempFilePaths && res.tempFilePaths[0]);
        if (!filePath) {
          drawing.value = false;
          uni.showToast({ title: "生成图片失败", icon: "none" });
          return;
        }
        // #ifdef MP-WEIXIN
        uni.saveImageToPhotosAlbum({
          filePath,
          success: () => uni.showToast({ title: "已保存到相册", icon: "success" }),
          fail: () => uni.previewImage({ urls: [filePath] }),
          complete: () => {
            drawing.value = false;
          },
        });
        // #endif
        // #ifndef MP-WEIXIN
        uni.previewImage({
          urls: [filePath],
          complete: () => {
            drawing.value = false;
          },
        });
        // #endif
      },
      fail: (err: any) => {
        drawing.value = false;
        uni.showToast({ title: (err && err.errMsg) || "生成图片失败", icon: "none" });
      },
    } as any,
    instance?.proxy as any
  );
}

/** 导出我的数据：H5 触发下载；小程序把 JSON 复制到剪贴板。 */
function exportMyData() {
  if (exporting.value) return;
  exporting.value = true;
  const finish = () => {
    exporting.value = false;
  };
  // #ifdef H5
  fetch(`${BASE_URL}/api/me/export`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`导出失败（${res.status}）`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "potential-lab-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })
    .catch((e: Error) => {
      uni.showToast({ title: e.message || "导出失败", icon: "none", duration: 3000 });
    })
    .finally(finish);
  // #endif
  // #ifndef H5
  uni.request({
    url: `${BASE_URL}/api/me/export`,
    method: "GET",
    header: { Authorization: `Bearer ${getToken()}` },
    timeout: 30000,
    success: (res) => {
      if (res.statusCode !== 200) {
        uni.showToast({ title: `导出失败（${res.statusCode}）`, icon: "none", duration: 3000 });
        return;
      }
      const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      uni.setClipboardData({
        data: text,
        success: () => uni.showToast({ title: "已复制到剪贴板", icon: "none" }),
      });
    },
    fail: (err) => {
      uni.showToast({ title: err.errMsg || "网络错误", icon: "none", duration: 3000 });
    },
    complete: finish,
  });
  // #endif
}

/** 退出登录：撤销服务端会话（失败忽略，会话可能已过期）→ 清空本地凭证 → 回到欢迎页。 */
async function logoutAccount() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await api.post("/api/auth/logout");
  } catch {
    // 忽略：会话可能已过期（401 时 client 已顺手清过凭证）或网络异常，本地照常清理
  }
  useUserStore().signOut();
  clearAll();
  loggingOut.value = false;
  uni.reLaunch({ url: "/pages/welcome/welcome" });
}

/** 注销账号：两次确认（第二次含「不可逆」）→ 删除 → 清空本地 → 回到欢迎页。 */
function deleteAccount() {
  uni.showModal({
    title: "注销账号",
    content: "将删除你的全部数据：任务记录、作品、报告和订单。确定要继续吗？",
    success: (first) => {
      if (!first.confirm) return;
      uni.showModal({
        title: "最终确认",
        content: "注销操作不可逆：所有数据将被彻底删除、无法找回。仍要注销吗？",
        confirmText: "仍要注销",
        confirmColor: "#c0392b",
        success: (second) => {
          if (!second.confirm) return;
          deleting.value = true;
          api
            .post("/api/me/delete")
            .then(() => {
              useUserStore().signOut();
              clearAll();
              uni.clearStorageSync();
              uni.showToast({ title: "账号已注销", icon: "none" });
              setTimeout(() => uni.reLaunch({ url: "/pages/welcome/welcome" }), 600);
            })
            .catch((e: any) => {
              uni.showToast({ title: e.message || "注销失败，请稍后再试", icon: "none", duration: 3000 });
            })
            .finally(() => {
              deleting.value = false;
            });
        },
      });
    },
  });
}
</script>

<template>
  <view>
    <view v-if="loading" class="empty-box"><text class="faint">加载中…</text></view>
    <view v-else-if="error" class="error-tip">{{ error }}</view>

    <view v-else-if="!profile.clues.length" class="card empty-box">
      <text class="empty-emoji">📊</text>
      <view class="empty-title">画像还没有数据</view>
      <text class="muted">完成探测访谈并开始 4 周周期后，这里会呈现五维画像和天赋组合建议。</text>
      <button class="btn-ghost" style="margin-top: 30rpx" @click="goAssessmentResult">先做 48 题行业潜力测评 ›</button>
      <button class="btn" style="margin-top: 20rpx" @click="goExploreTab">去探测</button>
    </view>

    <view v-else>
      <view class="hero">
        <text class="hero-emoji">📊</text>
        <view class="hero-title">优势画像 · 第 {{ profile.cycle_week }} 周</view>
        <text class="hero-sub">以下全部只和你自己比——不比名次，只看证据和变化。</text>
      </view>

      <!-- 五维画像分享卡片入口 -->
      <view class="card card-flat" style="margin-top: -6rpx">
        <button class="btn-ghost" style="width: 100%" @click="openShareCard">🖼 生成我的五维画像卡片（可保存/分享）</button>
      </view>

      <!-- 行业潜力概览 -->
      <view v-if="assessment" class="card">
        <view class="row-between">
          <view class="card-title">行业潜力 TOP3</view>
          <text class="brand-text" style="font-size: 24rpx" @click="goAssessmentResult">看完整报告 ›</text>
        </view>
        <view
          v-for="ind in assessment.industries.slice(0, 3)"
          :key="ind.code"
          style="margin-top: 22rpx"
          @click="openIndustry(ind.code)"
        >
          <view class="row-between">
            <view>
              <text class="badge" :class="ind.rank === 1 ? 'badge-gold' : ind.rank === 2 ? 'badge-silver' : 'badge-bronze'">
                {{ ind.rank === 1 ? "🥇 TOP1" : ind.rank === 2 ? "🥈 TOP2" : "🥉 TOP3" }}
              </text>
              <text style="font-size: 28rpx; font-weight: 600">{{ ind.name }}</text>
            </view>
            <text class="score-big" style="font-size: 40rpx">{{ ind.score }}</text>
          </view>
          <view class="bar-track" style="margin-top: 8rpx">
            <view class="bar-fill" :style="{ width: ind.score + '%' }" />
          </view>
        </view>
      </view>
      <view v-else class="card">
        <text class="eyebrow">行业潜力</text>
        <view class="card-title" style="margin-bottom: 10rpx">想知道自己适合哪些行业？</view>
        <text class="muted">48 题行业潜力测评：测 12 个行业匹配度、短板训练路径和头部收入行情。</text>
        <button class="btn-ghost" style="margin-top: 20rpx" @click="goAssessmentResult">去做行业潜力测评 →</button>
      </view>

      <!-- 方向画像 -->
      <view v-for="c in profile.clues" :key="c.clue_id" class="card">
        <view style="margin-bottom: 10rpx">
          <text class="badge badge-task">{{ c.direction_name }}</text>
          <text class="badge" :class="levelClass[c.evidence_level] || 'badge-level1'">证据：{{ c.evidence_level }}</text>
          <text
            v-if="c.evaluation_kind === 'mock'"
            class="badge badge-mock"
            title="分数来自模拟评价，非真实模型"
          >模拟评价</text>
          <text v-else-if="c.evaluation_kind === 'real'" class="badge badge-real" title="分数来自真实 AI 模型评价">真实模型评价</text>
        </view>
        <view class="card-title">{{ c.statement }}</view>
        <view style="margin: 12rpx 0 24rpx">
          <text class="muted">{{ c.evidence_detail }} · 任务 {{ taskTimes(c) }} 次 · 独立完成 {{ c.independent_count }} 次 · 读者反馈 {{ c.reader_feedback_count }} 条</text>
        </view>

        <view v-for="d in c.dimensions" :key="d.key" style="margin-bottom: 22rpx">
          <view class="row-between" style="margin-bottom: 8rpx">
            <text style="font-size: 26rpx; font-weight: 600">{{ d.label }}</text>
            <text v-if="dimMeasured(d)" class="muted">{{ d.value }}%</text>
            <text v-else class="badge badge-pending">待验证</text>
          </view>
          <view v-if="dimMeasured(d)" class="bar-track">
            <view class="bar-fill" :style="{ width: d.value + '%' }" />
          </view>
          <text class="faint" style="font-size: 22rpx">{{ d.detail }}</text>
        </view>

        <!-- 培养路径 -->
        <view v-if="c.cultivation.length">
          <text class="why-toggle" @click="cultivationOpen = cultivationOpen === c.clue_id ? '' : c.clue_id">
            {{ cultivationOpen === c.clue_id ? "收起培养路径 ↑" : "验证后怎么培养？查看培养路径 ↓" }}
          </text>
          <block v-if="cultivationOpen === c.clue_id">
            <view v-for="(stage, i) in c.cultivation" :key="i" class="week-card">
              <text class="week-badge">{{ stage.stage }}</text>
              <text v-for="(a, j) in stage.actions" :key="j" class="activity-line">{{ j + 1 }}. {{ a }}</text>
              <text class="faint" style="display: block; margin-top: 8rpx">⏱ {{ stage.budget }}</text>
            </view>
            <view style="margin-top: 14rpx">
              <text style="font-weight: 700; font-size: 25rpx">🌱 日常保养（每周 2-3 次 × 15 分钟）</text>
              <text v-for="(p, i) in c.everyday_practice" :key="i" class="activity-line">· {{ p }}</text>
            </view>
          </block>
        </view>
      </view>

      <!-- 组合建议 -->
      <view v-if="profile.combinations.length" class="card">
        <text class="eyebrow">组合建议</text>
        <view class="card-title" style="margin-bottom: 14rpx">天赋组合成能力</view>
        <text class="muted">单点方向组合起来，才是能走远的能力。</text>
        <view v-for="(combo, i) in profile.combinations" :key="i" style="margin-top: 26rpx">
          <view style="font-weight: 700; font-size: 28rpx">{{ combo.abilities }}</view>
          <view style="margin: 10rpx 0">
            <text
              v-for="p in combo.paths"
              :key="p"
              class="badge badge-experience"
              style="margin-top: 8rpx"
            >{{ p }}</text>
          </view>
          <text class="muted">{{ combo.why }}</text>
          <view class="suggest-line">怎么开始：{{ combo.how_to_start }}</view>
        </view>
        <view v-if="profile.reading" class="quote-box" style="margin-top: 24rpx">
          <view style="display: flex; justify-content: flex-end; margin-bottom: 6rpx">
            <ai-badge />
          </view>
          <text style="font-size: 24rpx; color: #43465c">{{ profile.reading }}</text>
        </view>
      </view>

      <view class="card">
        <text class="faint">{{ profile.note }}</text>
        <text class="why-toggle" style="margin-top: 14rpx" @click="goBoundary">🧭 科学边界：这些结论能说明什么、不能说明什么 →</text>
        <text class="faint" style="display: block; margin-top: 10rpx">版本 v0.4.0</text>
      </view>
    </view>

    <!-- 数据生命周期：导出 / 注销 -->
    <view v-if="!loading && !error" class="card">
      <text class="eyebrow">数据与隐私</text>
      <text class="muted" style="display: block">你的数据仅用于生成你自己的报告；可随时导出或彻底删除。</text>
      <button class="btn-ghost" style="margin-top: 24rpx" :disabled="exporting" @click="exportMyData">
        {{ exporting ? "正在导出…" : "导出我的数据 ↓" }}
      </button>
      <button class="btn-ghost" style="margin-top: 16rpx" :disabled="loggingOut" @click="logoutAccount">
        {{ loggingOut ? "正在退出…" : "退出登录" }}
      </button>
      <button
        class="btn-ghost"
        style="margin-top: 16rpx; color: #c0392b; border-color: #f0c6c0"
        :disabled="deleting"
        @click="deleteAccount"
      >
        注销账号
      </button>
    </view>

    <!-- 五维画像分享卡片（canvas 绘制，展示层缩小适配屏幕，导出按 2 倍尺寸） -->
    <view v-if="showCard" class="sc-mask" @click="closeShareCard">
      <view class="sc-body" @click.stop>
        <view class="sc-canvas-wrap">
          <canvas
            id="profileShareCard"
            canvas-id="profileShareCard"
            class="sc-canvas"
            style="width: 340px; height: 680px"
          />
        </view>
        <view class="sc-check" @click="toggleNickname">
          <text style="font-size: 34rpx">{{ showNickname ? "☑" : "☐" }}</text>
          <text class="sc-check-label">卡片显示我的昵称（关闭则显示「一位探索者」，不包含真实姓名等信息）</text>
        </view>
        <view style="display: flex; gap: 16rpx; width: 100%; box-sizing: border-box; padding: 0 24rpx 24rpx">
          <button class="btn" style="flex: 1" :disabled="drawing || !cardReady" @click="saveCard">
            {{ drawing ? "生成中…" : saveLabel }}
          </button>
          <button class="btn-ghost" style="flex: 0 0 140rpx" @click="closeShareCard">关闭</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.sc-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(25, 27, 43, 0.55);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-body {
  background: #fffef8;
  border: 4rpx solid #191b2b;
  border-radius: 36rpx;
  box-shadow: 12rpx 12rpx 0 #ffe467;
  max-height: 94vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 24rpx;
}
/* 画布按 340×680 绘制，展示缩放到 0.72 适配手机屏幕；导出仍取原始 buffer */
.sc-canvas-wrap {
  width: 245px;
  height: 490px;
  overflow: hidden;
}
.sc-canvas {
  transform: scale(0.72);
  transform-origin: top left;
  background: #fffdf6;
}
.sc-check {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 24rpx;
}
.sc-check-label {
  font-size: 22rpx;
  color: rgba(25, 27, 43, 0.5);
  flex: 1;
  line-height: 1.5;
}
</style>
