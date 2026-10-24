<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useUserStore } from "./stores/user";

onLaunch(() => {
  // 启动即静默登录：通道由 VITE_AUTH_MODE 决定（mock / wechat / auto，见 stores/user.ts.ensureLogin）
  useUserStore().ensureLogin().catch((e) => {
    console.warn("自动登录失败：", e.message);
  });
});
</script>
<style>
/* ============================================================
   设计系统：柔和糖果色新粗野主义（Soft Neo-Brutalism）
   奶油底 + 深藏青描边 + 实色偏移硬阴影 + 漫画贴纸感
   主色：青蓝 #38C8F5 · 黄 #FFE467 · 粉 #F45BC3 · 薄荷 #7EDDB7
   ============================================================ */

page {
  --ink: #191b2b;
  --ink-70: rgba(25, 27, 43, 0.72);
  --ink-50: rgba(25, 27, 43, 0.5);
  --card: #fffef8;
  --bg: #fffdf6;
  --yellow: #ffe467;
  --yellow-soft: #fff3c4;
  --cyan: #38c8f5;
  --cyan-soft: #e3f6fe;
  --pink: #f45bc3;
  --pink-soft: #fde9f6;
  --mint: #7eddb7;
  --mint-soft: #eafbf3;
  --line-soft: #e8e2cf;

  background: var(--bg);
  background-image: radial-gradient(rgba(25, 27, 43, 0.045) 5rpx, transparent 5rpx);
  background-size: 56rpx 56rpx;
  color: var(--ink);
  font-size: 28rpx;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

.card {
  background: var(--card);
  border: 4rpx solid var(--ink);
  border-radius: 40rpx;
  padding: 30rpx;
  margin: 24rpx;
  box-shadow: 10rpx 10rpx 0 var(--yellow);
}
.card-cyan { box-shadow: 10rpx 10rpx 0 var(--cyan); }
.card-pink { box-shadow: 10rpx 10rpx 0 var(--pink); }
.card-mint { box-shadow: 10rpx 10rpx 0 var(--mint); }
.card-tight { padding: 24rpx; }
.card-flat { box-shadow: none; }

.eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 3rpx;
  color: var(--ink-50);
  font-weight: 700;
  margin-bottom: 8rpx;
}
.card-title {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.4;
}
.h-big { font-size: 46rpx; font-weight: 800; color: var(--ink); }
.title-shadow { text-shadow: 5rpx 5rpx 0 var(--yellow); }
.muted { color: var(--ink-70); font-size: 25rpx; line-height: 1.7; }
.faint { color: var(--ink-50); font-size: 22rpx; line-height: 1.7; }
.brand-text {
  color: var(--ink);
  font-weight: 800;
  text-decoration: underline;
  text-decoration-color: var(--yellow);
  text-decoration-thickness: 8rpx;
  text-underline-offset: 6rpx;
}
.score-big {
  font-size: 64rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1;
  text-shadow: 4rpx 4rpx 0 var(--yellow);
}
.divider {
  height: 4rpx;
  background: var(--ink);
  opacity: 0.12;
  border-radius: 4rpx;
  margin: 24rpx 0;
}

.hero {
  margin: 24rpx;
  padding: 38rpx 34rpx;
  border: 4rpx solid var(--ink);
  border-radius: 44rpx;
  background: linear-gradient(180deg, var(--yellow-soft) 0%, #fffef6 90%);
  color: var(--ink);
  box-shadow: 12rpx 12rpx 0 var(--yellow);
  position: relative;
  overflow: hidden;
}
.hero-teal {
  background: linear-gradient(180deg, var(--cyan-soft) 0%, #fffef6 90%);
  box-shadow: 12rpx 12rpx 0 var(--cyan);
}
.hero-pink {
  background: linear-gradient(180deg, var(--pink-soft) 0%, #fffef6 90%);
  box-shadow: 12rpx 12rpx 0 var(--pink);
}
.hero-mint {
  background: linear-gradient(180deg, var(--mint-soft) 0%, #fffef6 90%);
  box-shadow: 12rpx 12rpx 0 var(--mint);
}
.hero .hero-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96rpx;
  height: 96rpx;
  background: var(--card);
  border: 4rpx solid var(--ink);
  border-radius: 28rpx;
  box-shadow: 6rpx 6rpx 0 var(--ink);
  font-size: 52rpx;
  margin-bottom: 18rpx;
  text-align: center;
}
.hero .hero-title {
  font-size: 44rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.3;
  text-shadow: 5rpx 5rpx 0 rgba(255, 228, 103, 0.9);
}
.hero .hero-sub {
  color: var(--ink-70);
  font-size: 25rpx;
  margin-top: 12rpx;
  display: block;
  line-height: 1.7;
}
.hero .hero-chip {
  display: inline-block;
  background: var(--card);
  border: 3rpx solid var(--ink);
  border-radius: 999rpx;
  padding: 2rpx 18rpx;
  font-size: 22rpx;
  margin: 12rpx 10rpx 0 0;
  color: var(--ink);
  font-weight: 600;
}

.btn {
  background: var(--yellow);
  color: var(--ink);
  border: 4rpx solid var(--ink);
  border-radius: 24rpx;
  font-size: 30rpx;
  font-weight: 800;
  padding: 16rpx 40rpx;
  box-shadow: 8rpx 8rpx 0 var(--ink);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.btn::after { border: none; }
.btn[disabled] {
  background: #efece0;
  color: var(--ink-50);
  border-color: #c9c4b2;
  box-shadow: 6rpx 6rpx 0 #c9c4b2;
}
button.btn:active {
  transform: translate(8rpx, 8rpx);
  box-shadow: 0 0 0 var(--ink);
}
.btn-ghost {
  background: var(--card);
  color: var(--ink);
  border: 4rpx solid var(--ink);
  border-radius: 24rpx;
  font-size: 30rpx;
  font-weight: 700;
  padding: 14rpx 40rpx;
  box-shadow: 8rpx 8rpx 0 var(--line-soft);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.btn-ghost::after { border: none; }
.btn-ghost:active {
  transform: translate(6rpx, 6rpx);
  box-shadow: 0 0 0 var(--line-soft);
}

.badge {
  display: inline-block;
  font-size: 22rpx;
  padding: 2rpx 18rpx;
  border: 3rpx solid var(--ink);
  border-radius: 999rpx;
  margin-right: 10rpx;
  font-weight: 700;
  line-height: 1.7;
  background: var(--card);
  color: var(--ink);
}
.badge-task { background: var(--yellow); }
.badge-experience { background: var(--cyan-soft); }
.badge-retention { background: var(--pink-soft); }
.badge-reflect { background: var(--mint-soft); }
.badge-level1 { background: #ffffff; }
.badge-level2 { background: var(--cyan-soft); }
.badge-level3 { background: var(--mint-soft); }
.badge-gold { background: var(--yellow); }
.badge-silver { background: #eef1f6; }
.badge-bronze { background: var(--pink-soft); }
/* 评价来源标注：mock=灰描边（模拟分数，不当已验证能力展示）；real=绿描边 */
.badge-mock { background: #ffffff; color: var(--ink-50); border-color: #b9bcc9; }
.badge-real { background: #ffffff; color: #1f8a5a; border-color: var(--mint); }
.sticker { transform: rotate(-2deg); }
.sticker-r { transform: rotate(1.5deg); }

.bar-track {
  background: #ffffff;
  border: 3rpx solid var(--ink);
  height: 22rpx;
  border-radius: 999rpx;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--cyan);
  border-radius: 999rpx;
  transition: width 0.4s ease;
}
.bar-fill-warm { background: var(--yellow); }
.bar-fill-teal { background: var(--mint); }

.opt-pill {
  flex: 1;
  text-align: center;
  padding: 14rpx 4rpx;
  border-radius: 18rpx;
  background: #ffffff;
  color: var(--ink-70);
  border: 3rpx solid #d5d7e2;
  font-weight: 400;
}
.opt-active {
  background: #ffffff;
  color: var(--ink);
  border: 4rpx solid var(--ink);
  font-weight: 800;
}

.empty-box { text-align: center; padding: 110rpx 70rpx; }
.empty-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 140rpx;
  height: 140rpx;
  background: var(--yellow-soft);
  border: 4rpx solid var(--ink);
  border-radius: 40rpx;
  box-shadow: 8rpx 8rpx 0 var(--yellow);
  font-size: 76rpx;
  margin-bottom: 28rpx;
}
.empty-title { font-size: 38rpx; font-weight: 800; margin-bottom: 16rpx; color: var(--ink); }
.error-tip {
  margin: 24rpx;
  padding: 24rpx;
  background: var(--pink-soft);
  color: var(--ink);
  border: 4rpx solid var(--ink);
  border-radius: 24rpx;
  box-shadow: 8rpx 8rpx 0 var(--pink);
  font-size: 25rpx;
}

.tl-item { display: flex; margin-bottom: 28rpx; }
.tl-rail {
  width: 64rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tl-dot {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--yellow);
  border: 4rpx solid var(--ink);
  color: var(--ink);
  font-size: 24rpx;
  font-weight: 800;
  text-align: center;
  line-height: 46rpx;
  flex-shrink: 0;
}
.tl-line {
  width: 4rpx;
  flex: 1;
  background: var(--ink);
  opacity: 0.15;
  margin-top: 8rpx;
  border-radius: 4rpx;
}
.tl-body { flex: 1; padding-bottom: 8rpx; }

.tier {
  display: flex;
  align-items: flex-start;
  background: #ffffff;
  border: 3rpx solid var(--ink);
  border-radius: 20rpx;
  padding: 18rpx 22rpx;
  margin-bottom: 14rpx;
}
.tier-tag {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  padding: 4rpx 18rpx;
  border-radius: 999rpx;
  border: 3rpx solid var(--ink);
  margin-right: 16rpx;
  margin-top: 2rpx;
  background: var(--card);
}

.week-card {
  background: var(--card);
  border: 4rpx solid var(--ink);
  border-radius: 24rpx;
  padding: 24rpx;
  margin-top: 20rpx;
  box-shadow: 8rpx 8rpx 0 var(--mint);
}
.week-badge {
  display: inline-block;
  background: var(--mint);
  border: 3rpx solid var(--ink);
  color: var(--ink);
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 22rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}
.activity-line {
  display: block;
  font-size: 25rpx;
  margin-top: 10rpx;
  color: var(--ink);
  line-height: 1.7;
}
.tip-line {
  display: block;
  font-size: 24rpx;
  color: var(--ink);
  background: var(--mint-soft);
  border: 3rpx solid var(--mint);
  border-radius: 14rpx;
  padding: 12rpx 16rpx;
  margin-top: 12rpx;
}
.warn-line {
  display: block;
  font-size: 24rpx;
  color: var(--ink);
  background: var(--pink-soft);
  border: 3rpx solid var(--pink);
  border-radius: 14rpx;
  padding: 12rpx 16rpx;
  margin-top: 10rpx;
}

.score-row { margin-bottom: 20rpx; }
.score-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}
.score-num { font-weight: 800; color: var(--ink); }

.icon-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 84rpx;
  height: 84rpx;
  border: 4rpx solid var(--ink);
  border-radius: 24rpx;
  font-size: 44rpx;
  flex-shrink: 0;
  background: var(--yellow-soft);
}
.tile-yellow { background: var(--yellow-soft); }
.tile-cyan { background: var(--cyan-soft); }
.tile-pink { background: var(--pink-soft); }
.tile-mint { background: var(--mint-soft); }

.row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chip-glass {
  display: inline-block;
  background: var(--card);
  border: 3rpx solid var(--ink);
  border-radius: 999rpx;
  padding: 4rpx 20rpx;
  font-size: 22rpx;
  color: var(--ink);
  font-weight: 600;
  margin: 8rpx 10rpx 0 0;
}
.quote-box {
  background: #ffffff;
  border: 3rpx dashed var(--ink);
  border-radius: 18rpx;
  padding: 20rpx;
  margin: 12rpx 0;
}
.suggest-line {
  display: block;
  font-size: 24rpx;
  color: var(--ink);
  background: var(--yellow-soft);
  border: 3rpx solid var(--ink);
  border-radius: 14rpx;
  padding: 12rpx 16rpx;
  margin-top: 10rpx;
  line-height: 1.7;
}

.ach-grid { display: flex; flex-wrap: wrap; }
.ach-item {
  width: 25%;
  box-sizing: border-box;
  text-align: center;
  padding: 14rpx 6rpx;
  border-radius: 16rpx;
}
.ach-locked { opacity: 0.4; }
.ach-emoji { font-size: 44rpx; display: block; }
.ach-name {
  display: block;
  font-size: 22rpx;
  font-weight: 700;
  margin-top: 6rpx;
  color: var(--ink);
}
.ach-desc {
  display: block;
  font-size: 18rpx;
  color: var(--ink-50);
  margin-top: 2rpx;
  line-height: 1.4;
}

.celebrate-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: rgba(25, 27, 43, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.celebrate-card {
  background: var(--card);
  border: 5rpx solid var(--ink);
  border-radius: 40rpx;
  padding: 50rpx 64rpx;
  text-align: center;
  box-shadow: 14rpx 14rpx 0 var(--yellow);
  animation: celebrate-pop 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
.celebrate-emoji {
  font-size: 100rpx;
  display: block;
  animation: celebrate-bounce 0.8s ease infinite alternate;
}
.celebrate-title {
  font-size: 36rpx;
  font-weight: 800;
  display: block;
  margin-top: 14rpx;
  color: var(--ink);
}
.celebrate-xp {
  display: inline-block;
  color: var(--ink);
  background: var(--yellow);
  border: 3rpx solid var(--ink);
  border-radius: 999rpx;
  font-weight: 800;
  font-size: 36rpx;
  margin-top: 14rpx;
  padding: 6rpx 30rpx;
}
.celebrate-sub {
  display: block;
  color: var(--ink-70);
  font-size: 24rpx;
  margin-top: 14rpx;
}
.confetti {
  position: fixed;
  font-size: 44rpx;
  animation: celebrate-fall 1.8s ease-in forwards;
  z-index: 10000;
}
@keyframes celebrate-pop {
  0% { transform: scale(0.5) rotate(-3deg); opacity: 0; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes celebrate-bounce {
  0% { transform: translateY(0) scale(1); }
  100% { transform: translateY(-14rpx) scale(1.1); }
}
@keyframes celebrate-fall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(70vh) rotate(300deg); opacity: 0; }
}

.why-toggle {
  display: block;
  font-size: 22rpx;
  color: var(--ink);
  margin-top: 10rpx;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--yellow);
  text-decoration-thickness: 6rpx;
  text-underline-offset: 5rpx;
}
.why-text {
  display: block;
  font-size: 22rpx;
  color: var(--ink-70);
  background: #ffffff;
  border: 3rpx dashed var(--ink);
  border-radius: 14rpx;
  padding: 14rpx 18rpx;
  margin-top: 10rpx;
  line-height: 1.7;
}

.m-section { margin-bottom: 8rpx; }
.m-block { margin-top: 16rpx; }
.m-block-heading {
  font-size: 27rpx;
  font-weight: 800;
  color: var(--ink);
  display: block;
  margin-bottom: 6rpx;
}
.m-block-body {
  font-size: 24rpx;
  color: var(--ink-70);
  line-height: 1.75;
  display: block;
}
.m-reference {
  display: block;
  font-size: 22rpx;
  color: var(--ink-70);
  line-height: 1.7;
  margin-top: 8rpx;
  padding-left: 16rpx;
}

/* #ifdef H5 */
html,
body,
uni-app {
  background: #fffdf6 !important;
}
@media (min-width: 768px) {
  uni-page-body {
    max-width: 520px;
    margin: 0 auto;
  }
}
/* #endif */
</style>
