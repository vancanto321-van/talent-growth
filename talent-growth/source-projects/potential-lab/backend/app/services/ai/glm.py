"""智谱 GLM 适配器（已在国内完成生成式 AI 算法备案）。

- 统一走 chat/completions，要求模型输出 JSON，Pydantic 强校验；
- 校验失败自动带错误信息重试一次，仍失败抛 AIError，由调用方降级；
- 提示词里附带方向/任务/rubric 的中文口径，评分标准由程序定义、模型只做理解与措辞。
"""

import json
import re

import httpx
from pydantic import ValidationError

from app import schemas
from app.config import Settings
from app.content_loader import directions
from app.services.ai.base import AIAdapter, AIError

_system_base = (
    "你是「天赋实验室」的评估助手。产品原则："
    "1) 天赋只能作为‘线索’提出，必须附带用户自己的经历作为依据，禁止断言先天能力；"
    "2) 评分只针对作品本身与给定 rubric，不得脑补用户没有提供的信息；"
    "3) 所有评估都要引用用户原文作为证据；"
    "4) 严格输出 JSON，不要输出 JSON 以外的任何文字。"
)


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(json)?\s*|\s*```$", "", text, flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("输出中没有找到 JSON 对象")
    return json.loads(text[start : end + 1])


class GLMAdapter(AIAdapter):
    prompt_version = "glm-v1"

    @property
    def model_tag(self) -> str:
        return f"glm:{self._settings.glm_model}"

    def __init__(self, settings: Settings):
        if not settings.glm_api_key:
            raise AIError("AI_PROVIDER=glm 但未配置 GLM_API_KEY（见 backend/.env.example）")
        self._settings = settings

    def _chat_json(self, system: str, user: str, schema: type) -> dict:
        url = f"{self._settings.glm_base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self._settings.glm_api_key}"}
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        last_err: Exception | None = None
        for _ in range(2):  # 首次 + 带校验错误重试一次
            try:
                resp = httpx.post(
                    url,
                    headers=headers,
                    json={
                        "model": self._settings.glm_model,
                        "messages": messages,
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60,
                )
            except httpx.TimeoutException as e:
                raise AIError("GLM 请求超时（60s），请稍后重试") from e
            except httpx.NetworkError as e:
                raise AIError("网络异常，无法连接 GLM 服务") from e
            if resp.status_code == 429:
                raise AIError("GLM 触发限流（429），请稍后重试或降低频率")
            if resp.status_code in (500, 502, 503):
                raise AIError(f"GLM 服务暂不可用（{resp.status_code}），请稍后重试")
            if resp.status_code != 200:
                raise AIError(f"GLM 返回 {resp.status_code}：{resp.text[:200]}")
            data = resp.json()
            self.last_usage = data.get("usage")  # 透出 token 用量供成本记账
            content = data["choices"][0]["message"]["content"]
            try:
                data = _extract_json(content)
                return schema.model_validate(data).model_dump()
            except (ValueError, json.JSONDecodeError, ValidationError) as e:
                last_err = e
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": f"你的输出不符合要求（{e}）。请严格按字段要求重新输出 JSON。",
                    }
                )
        raise AIError(f"GLM 输出无法通过校验：{last_err}")

    def extract_clues(self, messages: list[dict]) -> schemas.AIClueExtraction:
        dir_table = "\n".join(
            f"- {code}: {d['name']}（{d['tagline']}）信号词：{'、'.join(d['signals'][:8])}"
            for code, d in directions().items()
        )
        transcript = "\n".join(
            f"问：{m.get('question', '')}\n答：{m.get('answer', '')}" for m in messages if m.get("answer")
        )
        user = f"""以下是访谈记录。请从中提炼 2-4 条"候选天赋线索"。

方向代码表：
{dir_table}

访谈记录：
{transcript}

要求：
- statement：一句话说"可能擅长什么"（不超过 30 字，不带分数）；
- evidence：说明依据来自哪段回答，并注明"来自自述，需任务验证"；
- based_on：引用用户原话（每条不超过 60 字）；
- direction_code 必须来自方向代码表。

输出 JSON：{{"clues": [{{"direction_code": "...", "statement": "...", "evidence": "...", "based_on": ["..."]}}]}}"""
        data = self._chat_json(_system_base, user, schemas.AIClueExtraction)
        return schemas.AIClueExtraction.model_validate(data)

    def evaluate_submission(self, template: dict, submission_text: str, mode: str) -> schemas.AITaskEvaluation:
        rubric = "\n".join(f"- {r['dimension']}：{r['guide']}" for r in template["rubric"])
        mode_note = "独立完成" if mode == "independent" else "用户声明借助了 AI 辅助，请在评语中注明"
        user = f"""任务：《{template['title']}》
要求：{template['description']}

评分 rubric（各维度 1-5 分）：
{rubric}

用户作品（{mode_note}）：
"""
        user += submission_text
        user += """

输出 JSON：
{"scores": [{"dimension": "维度名（与 rubric 一致）", "score": 1-5 的整数, "comment": "一句话依据"}],
 "evidence_quotes": ["从作品摘出的关键句（原话）"],
 "overall_comment": "整体评价，2-3 句，指出最强和最弱处",
 "suggestions": ["1-3 条具体可执行的改进建议"]}"""
        data = self._chat_json(_system_base, user, schemas.AITaskEvaluation)
        return schemas.AITaskEvaluation.model_validate(data)

    def plan_note(self, week_index: int, direction_name: str) -> str:
        user = f"""用户正在进行第 {week_index} 周的探索周期，本周主攻方向是「{direction_name}」。
写一段 2-3 句的周计划附言：提醒用户记录哪一步最费劲、哪一步最顺；如果连续觉得轻松可以提出加难度。语气务实，禁止夸奖天赋本身。"""
        data = self._chat_json(_system_base, user, schemas.AIPlanNote)
        return data["note"]

    def combination_reading(self, combos: list[dict], direction_names: list[str]) -> str:
        combo_text = "\n".join(
            f"- 组合 {'×'.join(c['directions'])}：{c['abilities']}；路径：{'、'.join(c['paths'])}；{c['why']}"
            for c in combos
        ) or "（暂无命中的组合）"
        user = f"""用户已验证的活跃方向：{'、'.join(direction_names)}。
命中的组合图谱：
{combo_text}

写一段 3-5 句的组合解读：说明这些组合可能通向什么能力/路径，以及下一步先验证什么。禁止输出"你很有天赋"式断言，一切以"值得继续验证"的口吻表述。"""
        data = self._chat_json(_system_base, user, schemas.AICombinationReading)
        return data["reading"]

    def cycle_summary(self, digest: dict) -> str:
        verdict_text = "\n".join(
            f"- {v['direction_name']}（{v['statement']}）：{v['verdict']}。{'；'.join(v['reasons'])}"
            for v in digest.get("verdicts", [])
        )
        user = f"""一位用户完成了 4 周探索周期，程序给出的结构化结论如下：
{verdict_text}

下期建议：{digest.get('next', {}).get('text', '')}

写一段 3-5 句的结业总结：先肯定完成的验证动作，再点出最值得继续的方向和原因，最后提醒未验证的部分。禁止天赋断言，语气务实温和。"""
        data = self._chat_json(_system_base, user, schemas.AIPlanNote)
        return data["note"]
