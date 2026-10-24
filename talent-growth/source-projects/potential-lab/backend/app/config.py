"""应用配置：全部可用环境变量 / .env 覆盖。开发期默认 mock AI + SQLite，零外部依赖。"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "天赋实验室 API"
    database_url: str = "sqlite:///./potential_lab.db"

    # AI 提供方：mock | glm
    ai_provider: str = "mock"
    glm_api_key: str = ""
    glm_model: str = "glm-4-flash"
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"

    # 微信小程序（正式接入时填写）
    wx_appid: str = ""
    wx_secret: str = ""
    # 订阅消息模板 ID（小程序后台申请后填入；留空则前端隐藏订阅入口）
    wx_weekly_reminder_template_id: str = ""
    # 模拟登录开关：上线前必须设为 false（关闭 u<id> 明文 token 与 mock-login 接口）
    allow_mock_auth: bool = True
    # 会话签名密钥（上线必须改为强随机值；更换会使全体会话失效，等同于全员登出）
    secret_key: str = "dev-secret-change-me"
    session_expire_days: int = 30

    # 计费（单位：分）。正式收款需企业主体 + 微信支付商户号（见 docs/compliance.md）
    price_child_assessment_cents: int = 500  # ¥5 / 次完整报告
    price_child_plan_monthly_cents: int = 2900  # ¥29 / 月培养方案
    price_cycle_report_cents: int = 990  # ¥9.9 / 份 4 周结业深度报告
    allow_mock_pay: bool = True  # 上线前必须设为 false
    # 未成年人消费保护（compliance.md 6b）：age_band 标记为未成年用户的服务端付费上限
    minor_daily_pay_limit_cents: int = 5000  # ¥50 / 日
    minor_monthly_pay_limit_cents: int = 10000  # ¥100 / 自然月


settings = Settings()
