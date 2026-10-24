"""Pydantic 模型：请求/响应 + AI 输出强校验 schema。

AI 的所有结构化输出必须通过这里的校验才算数；校验失败重试一次，
仍失败则降级（任务回到"待自评"），流程永不中断。
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------- 认证 ----------
class MockLoginRequest(BaseModel):
    nickname: str = "体验用户"
    age_band: str = ""


class WxLoginRequest(BaseModel):
    code: str
    nickname: str = ""
    age_band: str = ""


class TokenResponse(BaseModel):
    token: str
    user_id: int
    nickname: str
    is_new: bool
    auth_method: str = "mock"  # mock | wechat（前端据此决定过期后如何恢复）
    expires_at: Optional[str] = None


# ---------- 探测访谈 ----------
class InterviewQuestion(BaseModel):
    code: str
    category: str
    text: str
    hint: str = ""
    why: str = ""  # 为什么这么问（行为事件访谈等方法说明）


class InterviewAnswer(BaseModel):
    code: str
    text: str = Field(min_length=0, max_length=2000)


class InterviewFinishRequest(BaseModel):
    answers: list[InterviewAnswer] = Field(min_length=1)


class ClueOut(BaseModel):
    id: int
    direction_code: str
    direction_name: str
    statement: str
    evidence: str
    based_on: list[str] = []
    status: str


# ---------- 周期 ----------
class CycleStartRequest(BaseModel):
    clue_ids: list[int] = Field(min_length=1, max_length=3)


class CycleOut(BaseModel):
    id: int
    weeks: int
    started_at: str
    clue_ids: list[int] = []
    status: str


# ---------- 任务 ----------
class TaskTemplateOut(BaseModel):
    code: str
    direction_code: str
    direction_name: str
    stage: str
    title: str
    description: str
    steps: list[str]
    rubric: list[dict]
    est_minutes: int
    difficulty: int


class FromTemplateRequest(BaseModel):
    template_code: str = Field(min_length=1, max_length=64)
    clue_id: Optional[int] = None


class TaskInstanceOut(BaseModel):
    id: int
    template: Optional[TaskTemplateOut] = None
    mode: str
    status: str
    is_retention: bool
    scheduled_for: Optional[str] = None
    time_spent_min: Optional[int] = None
    self_investment: Optional[int] = None
    self_willingness: Optional[int] = None
    self_feeling: Optional[str] = None
    needs_evaluation: bool = False  # submitted 且无有效 AI 评估 → 待评价


class TaskSubmitRequest(BaseModel):
    text_content: str = Field(min_length=1, max_length=8000)
    mode: Literal["independent", "ai_assisted"] = "independent"
    time_spent_min: int = Field(ge=1, le=600)
    difficulty_feedback: int = Field(ge=1, le=5)


class EvaluationOut(BaseModel):
    id: int
    source: str
    scores: list[dict]
    evidence_quotes: list[str] = []
    overall_comment: str = ""
    suggestions: list[str] = []
    degraded: bool = False  # AI 不可用时的降级标记
    ai_model: str = ""  # 产出模型标识（如 mock / glm:glm-4-flash）；source=reader 时为空


class EvalFeedbackRequest(BaseModel):
    evaluation_id: int
    comment: str = Field(min_length=2, max_length=500)


class SelfReviewRequest(BaseModel):
    investment: int = Field(ge=1, le=5)
    willingness: int = Field(ge=1, le=5)
    feeling: str = Field(default="", max_length=2000)


class ReaderFeedbackRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


# ---------- 计划 ----------
class PlanItem(BaseModel):
    kind: Literal["task", "retention", "experience", "reflect"]
    title: str
    detail: str = ""
    template_code: Optional[str] = None
    done: bool = False
    checkin: Optional[dict] = None  # 打卡记录（用时/感受），打卡后回显给用户


class PlanOut(BaseModel):
    id: int
    week_index: int
    week_start: str
    focus_direction: str
    focus_direction_name: str
    items: list[PlanItem]
    ai_note: str = ""


class CheckinRequest(BaseModel):
    plan_id: int
    item_index: int = Field(ge=0)
    minutes: int = Field(ge=0, le=600)
    feeling: str = Field(default="", max_length=1000)


# ---------- 画像 ----------
class DimensionOut(BaseModel):
    key: str
    label: str
    value: Optional[float] = None  # 未测量时为 None（前端显示"待验证"，不展示 0 分）
    measured: bool = True
    detail: str  # 人话解释，只和自己比


class ClueProfileOut(BaseModel):
    clue_id: int
    direction_code: str
    direction_name: str
    statement: str
    evidence_level: Literal["线索", "初步", "较充分"]
    evidence_detail: str
    dimensions: list[DimensionOut]
    task_count: int
    submission_count: int = 0
    independent_count: int
    reader_feedback_count: int
    evaluation_kind: str = "none"  # none | mock | real
    cultivation: list[dict] = []  # 培养路径（打基础→日常练习→进阶→组合放大）
    everyday_practice: list[str] = []  # 轻量日常练习


class CombinationOut(BaseModel):
    abilities: str
    paths: list[str]
    why: str
    how_to_start: str


class ProfileOut(BaseModel):
    cycle_week: Optional[int] = None
    clues: list[ClueProfileOut]
    combinations: list[CombinationOut]
    reading: str = ""  # AI 生成的组合解读（可为空）
    note: str


# ---------- AI 输出 schema（强校验） ----------
class AIClue(BaseModel):
    direction_code: str
    statement: str = Field(min_length=4, max_length=80)
    evidence: str = Field(min_length=4, max_length=500)
    based_on: list[str] = Field(default_factory=list, max_length=5)


class AIClueExtraction(BaseModel):
    clues: list[AIClue] = Field(min_length=1, max_length=6)


class AIDimensionScore(BaseModel):
    dimension: str
    score: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=300)


class AITaskEvaluation(BaseModel):
    scores: list[AIDimensionScore] = Field(min_length=2, max_length=6)
    evidence_quotes: list[str] = Field(default_factory=list, max_length=5)
    overall_comment: str = Field(default="", max_length=800)
    suggestions: list[str] = Field(default_factory=list, max_length=5)


class AIPlanNote(BaseModel):
    note: str = Field(min_length=2, max_length=500)


class AICombinationReading(BaseModel):
    reading: str = Field(min_length=2, max_length=800)


# ---------- 行业潜力测评 ----------
class AssessmentOption(BaseModel):
    value: int
    label: str


class AssessmentQuestion(BaseModel):
    code: str
    trait: str
    text: str
    reverse: bool = False
    why: str = ""  # 为什么这么问


class AssessmentQuestionsOut(BaseModel):
    count: int
    options: list[AssessmentOption]
    items: list[AssessmentQuestion]


class AssessmentSubmitRequest(BaseModel):
    answers: dict[str, int] = Field(min_length=1)


class AssessmentTraitScore(BaseModel):
    code: str
    name: str
    description: str
    score: float
    improve: list[str] = []  # 短板提升建议（来自特质定义）


class AssessmentStrengthGap(BaseModel):
    trait: str
    name: str
    score: float


class AssessmentIndustryScore(BaseModel):
    rank: int
    code: str
    name: str
    tagline: str
    score: float
    income_top: str = ""
    strengths: list[AssessmentStrengthGap] = []
    gaps: list[AssessmentStrengthGap] = []
    gap_advice: str = ""


class AssessmentResultOut(BaseModel):
    id: int
    version: str
    created_at: str
    trait_scores: list[AssessmentTraitScore]
    industries: list[AssessmentIndustryScore]
    note: str


class IndustryListItem(BaseModel):
    code: str
    name: str
    tagline: str


class TrainingStage(BaseModel):
    stage: str
    duration: str
    actions: list[str]
    checkpoint: str


class IndustryDetailOut(BaseModel):
    code: str
    name: str
    tagline: str
    description: str
    weights: dict[str, float]
    trait_names: dict[str, str]
    training_path: list[TrainingStage]
    income: dict
    requirements: list[str] = []  # 门槛与资质
    self_checks: list[str]
    direction_codes: list[str]
    my_score: Optional[float] = None  # 做过测评时附带
    my_breakdown: Optional[dict] = None


# ---------- 儿童版测评 ----------
class ChildFormOut(BaseModel):
    code: str
    label: str
    target: str
    intro: str


class ChildQuestionsOut(BaseModel):
    forms: list[ChildFormOut]
    options: list[AssessmentOption]
    count: int
    items: list[AssessmentQuestion]
    declaration: str


class ChildSubmitRequest(BaseModel):
    form: Literal["parent", "self"]
    child_age_band: str = Field(default="", max_length=16)
    child_nickname: str = Field(default="", max_length=32)
    parent_confirmed: bool = False  # 家长版必须由监护人勾选
    answers: dict[str, int] = Field(min_length=1)


class ChildTeaserOut(BaseModel):
    type_trait: str = ""
    type_name: str
    type_tagline: str
    top_traits: list[dict]  # [{name, score}] 前 2


class ChildResultOut(BaseModel):
    id: int
    form: str
    child_nickname: str
    child_age_band: str
    created_at: str
    locked: bool
    teaser: ChildTeaserOut
    mi_scores: list[dict] = []
    grit_score: Optional[int] = None
    mindset_score: Optional[int] = None
    type_content: Optional[dict] = None
    attitude_advice: list[dict] = []
    declaration: str = ""
    plan_locked: bool = True
    price_cents: int = 0


class ChildPlanOut(BaseModel):
    trait: str
    type_name: str
    headline: str
    locked: bool
    principles: list[str] = []
    weekly_plan: list[dict] = []
    pitfalls: list[str] = []
    resources: list[str] = []
    subscription_active: bool = False
    price_cents: int = 0


# ---------- 计费 ----------
class OrderOut(BaseModel):
    id: int
    product_code: str
    product_name: str
    amount_cents: int
    status: str
    out_trade_no: str
    expires_at: Optional[str] = None
    mock_pay_available: bool


class PricingItem(BaseModel):
    code: str
    name: str
    price_cents: int
    price_label: str
    desc: str


class EntitlementOut(BaseModel):
    child_assessment_unlocked: bool
    subscription_active_until: Optional[str] = None
    cycle_report_unlocked: bool = False


# ---------- 周期结业报告 ----------
class CycleVerdictOut(BaseModel):
    clue_id: int
    direction_code: str
    direction_name: str
    statement: str
    verdict: str
    emoji: str
    preview_reading: str = ""  # 免费层：每方向 1 句解读（程序生成）
    quotes: list[str] = []  # 免费层：≤2 条用户原话证据
    reasons: list[str]  # 付费内容：完整判定依据
    evidence_level: str
    evidence_detail: str
    current: Optional[float] = None  # 无独立完成评估时为 None（待验证）
    task_count: int
    unverified: list[str]  # 付费内容：未验证清单


class CycleReportOut(BaseModel):
    id: int
    cycle_id: int
    finished_at: str
    locked: bool
    price_cents: int = 0
    verdicts: list[CycleVerdictOut] = []
    next: dict = {}
    summary: str = ""
    suggested_clue_ids: list[int] = []
