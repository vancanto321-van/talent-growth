<script setup lang="ts">
import { ref } from "vue";

const current = ref(0);

const slides = [
  {
    emoji: "🧪",
    title: "天赋实验室",
    sub: "发现 → 验证 → 培养",
    body: "问卷给方向，任务给答案。每一份结论都附带证据、可以回溯——我们不做算命式的天赋测试。",
  },
  {
    emoji: "🧭",
    title: "三种打开方式",
    sub: "",
    body: "💬 AI 访谈：6 个问题，从你的真实经历里找方向线索\n🧪 行业潜力测评：48 题测 12 个行业匹配度、训练路径与收入行情\n🌈 儿童版：家长观察问卷 + 8 类型月度培养方案",
  },
  {
    emoji: "📊",
    title: "证据优先，不算命",
    sub: "",
    body: "不输出「天赋 92 分」。五维画像（表现/进步/保持/意愿/证据）只和你自己比；\n进步是继续探索的证据，不是天赋的证明。",
  },
  {
    emoji: "🔥",
    title: "把坚持变愉快",
    sub: "",
    body: "连续探索天数、XP 等级、成就墙，吉祥物小潜陪你走完每个 4 周周期。\n\n🔒 数据仅自己可见；儿童测评请由监护人操作。",
  },
];

function next() {
  if (current.value < slides.length - 1) current.value += 1;
  else finish();
}

function finish() {
  uni.setStorageSync("pl_onboarded", "1");
  uni.switchTab({ url: "/pages/index/index" });
}

function onSwiperChange(e: any) {
  current.value = e.detail.current;
}
</script>

<template>
  <view class="welcome">
    <text class="skip" @click="finish">跳过</text>

    <swiper class="swiper" :current="current" @change="onSwiperChange">
      <swiper-item v-for="(s, i) in slides" :key="i">
        <view class="slide">
          <view class="slide-emoji-box"><text class="slide-emoji">{{ s.emoji }}</text></view>
          <view class="slide-title">{{ s.title }}</view>
          <text v-if="s.sub" class="slide-sub">{{ s.sub }}</text>
          <text class="slide-body">{{ s.body }}</text>
        </view>
      </swiper-item>
    </swiper>

    <view class="dots">
      <view
        v-for="(s, i) in slides"
        :key="i"
        class="dot"
        :class="current === i ? 'dot-active' : ''"
      />
    </view>

    <button class="btn" style="margin: 30rpx 60rpx" @click="next">
      {{ current < slides.length - 1 ? "下一页" : "开始使用 →" }}
    </button>
  </view>
</template>

<style>
.welcome {
  min-height: 100vh;
  padding-top: 40rpx;
  background: linear-gradient(180deg, #fff3c4 0%, #fffdf6 45%);
  display: flex;
  flex-direction: column;
}
.slide-emoji-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 180rpx;
  height: 180rpx;
  background: #fffef8;
  border: 5rpx solid #191b2b;
  border-radius: 56rpx;
  box-shadow: 12rpx 12rpx 0 #38c8f5;
  margin-bottom: 44rpx;
}
.skip {
  align-self: flex-end;
  margin: 30rpx 40rpx 0;
  color: #9aa0b4;
  font-size: 26rpx;
  z-index: 10;
}
.swiper {
  height: 1000rpx;
}
.slide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 80rpx;
  text-align: center;
}
.slide-emoji {
  font-size: 100rpx;
}
.slide-title {
  font-size: 52rpx;
  font-weight: 800;
  color: #191b2b;
  margin-bottom: 14rpx;
  text-shadow: 5rpx 5rpx 0 #ffe467;
}
.slide-sub {
  font-size: 30rpx;
  color: #0f766e;
  font-weight: 700;
  margin-bottom: 20rpx;
}
.slide-body {
  font-size: 27rpx;
  color: #6b6f85;
  line-height: 1.9;
  white-space: pre-line;
}
.dots {
  display: flex;
  justify-content: center;
  margin-bottom: 20rpx;
}
.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #e8e2cf;
  border: 2rpx solid #191b2b;
  margin: 0 8rpx;
}
.dot-active {
  width: 40rpx;
  border-radius: 999rpx;
  background: #ffe467;
}
</style>
