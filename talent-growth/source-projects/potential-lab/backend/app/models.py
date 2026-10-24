"""数据模型。原则：用户的每一份结论（线索/画像/建议）都能追溯到原始记录。

方向库与任务模板不建表——它们是版本化的种子内容（content/*.yaml），
业务表只引用其 code。这样内容迭代不改数据结构，历史记录始终可解释。
"""

from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Integer, String, Text

from app.database import Base
from app.utils import utcnow


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    open_id = Column(String(128), unique=True, nullable=True)  # 微信 code2session 后回填
    nickname = Column(String(64), default="")
    age_band = Column(String(32), default="")  # 未成年/18-25/26-35/36-45/46+/不愿透露
    created_at = Column(DateTime, default=utcnow)
    # 会话撤销：此时间点之前签发的所有会话令牌一律失效（登出/安全重置）
    token_invalid_before = Column(DateTime, nullable=True)
    auth_method = Column(String(16), default="")  # mock | wechat（记录注册来源）


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    status = Column(String(16), default="finished")  # finished（MVP 一次提交全部答案）
    messages = Column(JSON, default=list)  # [{code, category, question, answer}]
    extraction = Column(JSON, nullable=True)  # AI 抽取的原始结果，留档可追溯
    created_at = Column(DateTime, default=utcnow)


class ExplorationCycle(Base):
    """一个 4 周探索周期：从活跃线索里选最多 3 个方向，反复实践验证。"""

    __tablename__ = "exploration_cycles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    status = Column(String(16), default="active")  # active | finished
    weeks = Column(Integer, default=4)
    started_at = Column(DateTime, default=utcnow)
    finished_at = Column(DateTime, nullable=True)


class Clue(Base):
    """候选天赋线索。状态只有三档，永远附带依据，不做先天归因。"""

    __tablename__ = "clues"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    session_id = Column(Integer, nullable=True)
    cycle_id = Column(Integer, nullable=True)
    direction_code = Column(String(32), index=True)
    statement = Column(Text)  # 如：可能擅长解释复杂问题
    evidence = Column(Text)  # AI 给出的依据说明
    based_on = Column(JSON, default=list)  # 引用的访谈原话
    status = Column(String(16), default="candidate")  # candidate | active | archived
    created_at = Column(DateTime, default=utcnow)


class TaskInstance(Base):
    __tablename__ = "task_instances"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    clue_id = Column(Integer, index=True)
    template_code = Column(String(64))
    mode = Column(String(16), default="independent")  # independent | ai_assisted（分开统计）
    status = Column(String(16), default="assigned")  # assigned | in_progress | submitted | evaluated
    is_retention = Column(Boolean, default=False)  # 保持性重测（隔几天再做/迁移任务）
    retention_kind = Column(String(16), nullable=True)  # delayed | transfer
    scheduled_for = Column(DateTime, nullable=True)  # 重测到期时间
    started_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    time_spent_min = Column(Integer, nullable=True)
    difficulty_feedback = Column(Integer, nullable=True)  # 1-5，主观难度
    # 自评（看到 AI 初评后填写）
    self_investment = Column(Integer, nullable=True)  # 1-5 投入度
    self_willingness = Column(Integer, nullable=True)  # 1-5 新鲜感过后还想练的程度
    self_feeling = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True)
    task_instance_id = Column(Integer, index=True)
    text_content = Column(Text, default="")
    image_paths = Column(JSON, default=list)  # 本地开发存路径；上线接对象存储
    created_at = Column(DateTime, default=utcnow)


class Evaluation(Base):
    """评估三来源：ai（固定 rubric 初评）/ reader（真实读者反馈）。

    可追溯：ai_model + prompt_version 记录"谁、用哪版提示词"评的；
    superseded 标记被重新评估取代的旧 AI 评估（保留留档，不计入画像与展示）。
    自评存在 TaskInstance 的 self_* 字段上。
    """

    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True)
    task_instance_id = Column(Integer, index=True)
    source = Column(String(16))  # ai | reader
    scores = Column(JSON, default=list)  # [{dimension, score(1-5), comment}]
    evidence_quotes = Column(JSON, default=list)  # 从作品里摘的依据
    overall_comment = Column(Text, default="")
    suggestions = Column(JSON, default=list)
    superseded = Column(Boolean, default=False)  # 被 re-evaluate 取代的旧 AI 初评
    ai_model = Column(String(64), default="")  # 如 "mock" / "glm:glm-4-flash"
    prompt_version = Column(String(32), default="")  # 提示词/规则版本
    created_at = Column(DateTime, default=utcnow)


class WeeklyPlan(Base):
    """周计划：主方向任务 + 新方向体验 + 周回顾；保持性重测到期自动插入。"""

    __tablename__ = "weekly_plans"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    cycle_id = Column(Integer)
    week_index = Column(Integer)  # 周期内的第几周（1-4）
    week_start = Column(Date, default=date.today)
    focus_direction = Column(String(32))
    items = Column(JSON, default=list)
    ai_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class Checkin(Base):
    """打卡流水：与计划项的 JSON 快照并存，便于日后按时间统计持续意愿。"""

    __tablename__ = "checkins"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    plan_id = Column(Integer, index=True)
    item_index = Column(Integer)
    minutes = Column(Integer, default=0)
    feeling = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)


class AssessmentResult(Base):
    """行业潜力测评结果：保留原始答案，得分可复算、可追溯。"""

    __tablename__ = "assessment_results"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    answers = Column(JSON)  # {item_code: 1-5 原始作答}
    trait_scores = Column(JSON)  # {trait_code: 0-100}
    industry_scores = Column(JSON)  # [{code, score}] 已排序
    item_count = Column(Integer)
    version = Column(String(8), default="v1")  # 题库版本，题目更新后旧结果可解释
    created_at = Column(DateTime, default=utcnow)


class ChildAssessmentResult(Base):
    """儿童版测评结果：观察维度分 + 毅力/思维模式态度分 + 类型归属。"""

    __tablename__ = "child_assessment_results"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    form = Column(String(16))  # parent | self
    child_age_band = Column(String(16), default="")
    child_nickname = Column(String(32), default="")
    answers = Column(JSON)
    mi_scores = Column(JSON)  # {trait_code: 0-100}，8 个观察维度
    grit_score = Column(Integer, default=0)  # 0-100
    mindset_score = Column(Integer, default=0)  # 0-100
    type_trait = Column(String(32))  # 最高维度 = 当前类型
    version = Column(String(8), default="v1")
    created_at = Column(DateTime, default=utcnow)


class Order(Base):
    """订单：开发期 mock 支付；正式环境由微信支付回调改状态（见 services/billing.py）。"""

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    product_code = Column(String(32))  # child_assessment | child_plan_monthly | cycle_report
    scope_id = Column(Integer, nullable=True)  # 按次商品锁定的对象（如某份测评结果/某个周期）
    amount_cents = Column(Integer)
    status = Column(String(16), default="created")  # created | paid
    provider = Column(String(16), default="mock")
    out_trade_no = Column(String(64), unique=True)  # 商户订单号，正式支付对接时复用
    created_at = Column(DateTime, default=utcnow)
    paid_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # 月度订阅的到期时间；单次购买为空


class XPEvent(Base):
    """经验值流水：每一次奖励都可追溯（做什么动作、加了多少分）。"""

    __tablename__ = "xp_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    code = Column(String(32))  # task_submit / self_review / reader_feedback / checkin / cycle_start
    xp = Column(Integer)
    created_at = Column(DateTime, default=utcnow)


class GamificationState(Base):
    """游戏化状态：XP 总值 + 连续探索天数（按自然日计算）。"""

    __tablename__ = "gamification_states"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, unique=True, index=True)
    xp = Column(Integer, default=0)
    streak_days = Column(Integer, default=0)
    last_active_date = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=utcnow)


class AchievementUnlock(Base):
    """成就解锁记录。"""

    __tablename__ = "achievement_unlocks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    code = Column(String(32), index=True)
    created_at = Column(DateTime, default=utcnow)


class CycleReport(Base):
    """4 周结业报告：周期结束时生成快照，结论可追溯到任务与评估记录。"""

    __tablename__ = "cycle_reports"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    cycle_id = Column(Integer, index=True)
    payload = Column(JSON)  # 报告完整内容（判定/依据/未验证清单/下期建议）
    ai_summary = Column(Text, default="")
    version = Column(String(8), default="v1")
    created_at = Column(DateTime, default=utcnow)


class EvalFeedback(Base):
    """用户对 AI 评价的纠错反馈（评价有误？入口），供运营复核与提示词改进。"""

    __tablename__ = "eval_feedbacks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    evaluation_id = Column(Integer, index=True)
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)


class PushSubscription(Base):
    """订阅提醒意向：用户在小程序内同意接收某类提醒后记录。
    正式推送由定时任务按模板 ID 通过微信接口下发（见 docs/compliance.md）。"""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True)
    kind = Column(String(32))  # weekly_plan | streak_rescue
    template_id = Column(String(64))
    created_at = Column(DateTime, default=utcnow)
