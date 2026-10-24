import { defineStore } from "pinia";
import api, {
  applySession,
  clearAll,
  effectiveAuthMode,
  getToken,
  isSessionExpired,
  setAuthMethod,
  setSessionExpiresAt,
  setToken,
  wxSilentLogin,
} from "../api/client";

// 模块级共享：并发的 ensureLogin 调用共用同一个进行中的登录 Promise，
// 避免"第二个调用没等到 token 就放行"的 401 竞态。
let loginPromise: Promise<void> | null = null;

/** 用户会话。登录通道由 VITE_AUTH_MODE 决定（见 api/client.ts 的 effectiveAuthMode）：
 * - mock：POST /api/auth/mock-login（开发态，后端 ALLOW_MOCK_AUTH=false 时 403）；
 * - wechat（或 auto + 微信小程序）：uni.login 拿 code → POST /api/auth/wx-login，
 *   任何失败都直接抛错，绝不回退 mock（生产模式不得静默创建模拟身份）；
 * - auto + 其他平台（H5 无法 wx.login）：走 mock。
 */
export const useUserStore = defineStore("user", {
  state: () => ({
    token: getToken(),
    nickname: uni.getStorageSync("pl_nickname") || "",
    /** 最近一次登录失败原因（index/explore 等页 error 分支据此浮出）。 */
    loginError: "",
  }),
  actions: {
    ensureLogin(): Promise<void> {
      // 会话已过期：先清空本地凭证，再重新走登录流程
      if (this.token && isSessionExpired()) {
        this.signOut();
      }
      if (this.token) return Promise.resolve();
      if (!loginPromise) {
        loginPromise = (async () => {
          this.loginError = "";
          try {
            if (effectiveAuthMode() === "wechat") {
              // 正式通道：wx.login code 换签名会话（token/方式/到期时间在 wxSilentLogin 内统一落库）
              const res = await wxSilentLogin();
              this.token = res.token;
              this.nickname = res.nickname || "";
            } else {
              const res: any = await api.post("/api/auth/mock-login", { nickname: "体验用户" });
              this.token = res.token;
              this.nickname = res.nickname || "";
              setToken(res.token);
              // 记录登录方式与会话到期时间：401 自愈时据此决定静默重登（mock）还是续期（wechat）
              setAuthMethod(res.auth_method || "mock");
              setSessionExpiresAt(res.expires_at);
              uni.setStorageSync("pl_nickname", this.nickname);
            }
          } catch (e: any) {
            this.loginError = e?.message || "登录失败，请稍后再试";
            throw e;
          }
        })().finally(() => {
          loginPromise = null;
        });
      }
      return loginPromise;
    },
    /** 退出/注销：清空内存态与本地全部凭证。 */
    signOut() {
      clearAll();
      this.token = "";
      this.nickname = "";
      this.loginError = "";
    },
  },
});
