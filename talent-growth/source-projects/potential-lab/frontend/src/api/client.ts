/** 后端 API 访问层：统一 base URL、token、错误处理。
 *
 * - H5 开发态直连本地后端（后端已开 CORS）；
 * - 微信开发者工具里需勾选「不校验合法域名」（manifest 里 urlCheck 已关）；
 * - 上线时把 VITE_API_BASE 换成已备案的 HTTPS 域名。
 */

// vite 环境变量（frontend/.env 可覆盖）
export const BASE_URL: string = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

// 登录模式：mock（开发模拟登录）| wechat（正式微信登录）| auto（缺省：mp-weixin 走微信，其余走 mock）
export type AuthMode = "mock" | "wechat" | "auto";
const RAW_AUTH_MODE = String(import.meta.env.VITE_AUTH_MODE || "auto").trim();
export const AUTH_MODE: AuthMode = (["mock", "wechat", "auto"] as AuthMode[]).includes(
  RAW_AUTH_MODE as AuthMode
)
  ? (RAW_AUTH_MODE as AuthMode)
  : "auto";

/** 是否微信小程序平台（条件编译，构建期固化）。 */
let isMpWeixin = false;
// #ifdef MP-WEIXIN
isMpWeixin = true;
// #endif
export const IS_MP_WEIXIN: boolean = isMpWeixin;

/** 实际生效的登录通道。auto：mp-weixin 走微信流程，其他平台（H5 无法 wx.login）走 mock。 */
export function effectiveAuthMode(): "mock" | "wechat" {
  if (AUTH_MODE === "wechat") return "wechat";
  if (AUTH_MODE === "mock") return "mock";
  return IS_MP_WEIXIN ? "wechat" : "mock";
}

const TOKEN_KEY = "pl_token";
const AUTH_METHOD_KEY = "pl_auth_method";
const NICKNAME_KEY = "pl_nickname";
const SESSION_EXPIRES_KEY = "pl_session_expires_at";

export function getToken(): string {
  return uni.getStorageSync(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function clearToken() {
  uni.removeStorageSync(TOKEN_KEY);
}

/** 登录方式：mock（过期可静默重登）| wechat（过期必须重新走微信登录，绝不能静默换成 mock 身份）。 */
export function getAuthMethod(): string {
  return uni.getStorageSync(AUTH_METHOD_KEY) || "mock";
}

export function setAuthMethod(method: string) {
  uni.setStorageSync(AUTH_METHOD_KEY, method || "mock");
}

/** 清空全部本地凭证（token / 登录方式 / 昵称 / 会话到期时间）。 */
export function clearAll() {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(AUTH_METHOD_KEY);
  uni.removeStorageSync(NICKNAME_KEY);
  uni.removeStorageSync(SESSION_EXPIRES_KEY);
}

/** 登录成功后统一落库：token / 登录方式 / 会话到期时间 / 昵称。 */
export function applySession(data: {
  token: string;
  auth_method?: string;
  nickname?: string;
  expires_at?: string | null;
}) {
  setToken(data.token);
  setAuthMethod(data.auth_method || "mock");
  setSessionExpiresAt(data.expires_at);
  uni.setStorageSync(NICKNAME_KEY, data.nickname || "");
}

/** 记录会话到期时间（后端签发的 ISO 时间串）。 */
export function setSessionExpiresAt(expiresAt?: string | null) {
  if (expiresAt) uni.setStorageSync(SESSION_EXPIRES_KEY, expiresAt);
}

export function getSessionExpiresAt(): string {
  return uni.getStorageSync(SESSION_EXPIRES_KEY) || "";
}

/** 本地会话是否已过有效期（无过期时间视为未过期，交由后端 401 兜底）。 */
export function isSessionExpired(): boolean {
  const exp = getSessionExpiresAt();
  if (!exp) return false;
  const ts = Date.parse(exp);
  return !Number.isNaN(ts) && Date.now() >= ts;
}

interface ApiResponse<T = any> {
  code: number;
  data: T;
  errorMessage: string;
}

function rawRequest(method: "GET" | "POST", path: string, body?: Record<string, any>, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + path,
      method: method as any,
      data: body as any,
      timeout: 30000,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => resolve(res),
      fail: (err) => reject(new Error(err.errMsg || "网络错误")),
    });
  });
}

/** 微信静默登录：uni.login 取 code → POST /api/auth/wx-login 换签名会话并落库。
 * 任何失败（未配置 AppID / code 无效 / 网络异常）都 reject，绝不回退 mock-login。 */
export function wxSilentLogin(): Promise<any> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: (res: any) => {
        const code = res?.code;
        if (!code) {
          reject(new Error("微信登录失败：未获取到 code"));
          return;
        }
        rawRequest("POST", "/api/auth/wx-login", { code })
          .then((res2) => {
            if (res2.statusCode === 200 && res2.data?.token) {
              applySession(res2.data);
              resolve(res2.data);
            } else {
              const detail = res2.data?.detail || `微信登录失败（${res2.statusCode}）`;
              reject(
                new RequestError(
                  typeof detail === "string" ? detail : JSON.stringify(detail),
                  res2.statusCode
                )
              );
            }
          })
          .catch((err: any) => reject(err instanceof Error ? err : new Error(String(err))));
      },
      fail: (err: any) => reject(new Error(err?.errMsg || "微信登录失败，请稍后再试")),
    });
  });
}

// 并发请求同时 401 时共用同一次 wx.login→wx-login 续期，避免重复换 code
let wechatRenewal: Promise<string> | null = null;

/** wechat 会话过期后的无感续期（不是降级）：mp 平台静默重跑一次微信登录，返回新 token。 */
export function renewWechatSession(): Promise<string> {
  if (!wechatRenewal) {
    wechatRenewal = wxSilentLogin()
      .then((data) => data.token as string)
      .finally(() => {
        wechatRenewal = null;
      });
  }
  return wechatRenewal;
}

export function request<T = any>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, any>
): Promise<T> {
  const attempt = (token: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      uni.request({
        url: BASE_URL + path,
        method: method as any,
        data: body as any,
        timeout: 30000,
        header: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data as T);
          } else {
            const detail = (res.data as any)?.detail || `请求失败（${res.statusCode}）`;
            reject(
              new RequestError(
                typeof detail === "string" ? detail : JSON.stringify(detail),
                res.statusCode
              )
            );
          }
        },
        fail: (err) => {
          reject(
            new RequestError(
              `无法连接服务（${err.errMsg}）。请确认后端已启动：cd backend && uv run uvicorn app.main:app --port 8000`,
              0
            )
          );
        },
      });
    });

  const token = getToken();
  return attempt(token).catch(async (err) => {
    if (err instanceof RequestError && err.statusCode === 401 && token) {
      // 401 自愈（只对带过旧 token 的请求生效）：
      // - mock 会话：静默重新 mock-login 并重试一次（开发态；后端关闭 mock 时 403，走统一清凭证）。
      // - wechat 会话（mp 平台）：静默重跑 wx.login→wx-login 无感续期一次并重试——
      //   这是续期而非降级，请求不会写进 mock 身份；失败则清空凭证、抛友好错误。
      if (getAuthMethod() === "mock") {
        clearToken();
        const res = await rawRequest("POST", "/api/auth/mock-login", { nickname: "体验用户" });
        if (res.statusCode === 200 && res.data?.token) {
          applySession(res.data);
          return attempt(res.data.token);
        }
      } else if (getAuthMethod() === "wechat") {
        // #ifdef MP-WEIXIN
        try {
          const newToken = await renewWechatSession();
          return attempt(newToken);
        } catch {
          // 续期失败（未配置 AppID / code 失效 / 网络异常）：按会话过期处理
        }
        // #endif
      }
      clearAll();
      throw new RequestError("登录已过期，请重新登录", 401);
    }
    throw err;
  });
}

export class RequestError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: Record<string, any>) => request<T>("POST", path, body),
};

export default api;
