"""AI 适配器接口。模型只做四件事：访谈抽取、作品初评、计划建议、组合解读。

原则：所有结构化输出在适配器内部完成 Pydantic 强校验；失败抛 AIError，
调用方据此降级——流程永远不因 AI 不可用而中断。
"""

from app import schemas
from app.config import Settings


class AIError(Exception):
    """AI 调用失败或输出不可用。调用方应降级处理，而不是让请求失败。"""


class AIAdapter:
    def extract_clues(self, messages: list[dict]) -> schemas.AIClueExtraction:
        """从访谈记录抽取候选天赋线索（必须带依据和引用原话）。"""
        raise NotImplementedError

    def evaluate_submission(self, template: dict, submission_text: str, mode: str) -> schemas.AITaskEvaluation:
        """按任务 rubric 给作品打结构化初评。"""
        raise NotImplementedError

    def plan_note(self, week_index: int, direction_name: str) -> str:
        """周计划附言（一段建议文字，不参与计划结构计算）。"""
        raise NotImplementedError

    def combination_reading(self, combos: list[dict], direction_names: list[str]) -> str:
        """根据命中的组合图谱给一段个性化解读。"""
        raise NotImplementedError

    def cycle_summary(self, report_digest: dict) -> str:
        """结业报告的一段总结措辞（结构化结论由程序给出，模型只做表达）。"""
        return ""


def get_ai(settings: Settings | None = None) -> AIAdapter:
    from app.config import settings as default_settings

    s = settings or default_settings
    if s.ai_provider == "glm":
        from app.services.ai.glm import GLMAdapter

        return GLMAdapter(s)
    from app.services.ai.mock import MockAdapter

    return MockAdapter()
