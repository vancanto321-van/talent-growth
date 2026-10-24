"""模拟 AI：零成本、确定性，用于开发和演示。

规则简单但输出结构、口径与真实 GLM 完全一致，切换提供方不影响任何上层逻辑。
所有输出都带「模拟」标记，绝不在演示中被误当成真实模型结论。
"""

import re

from app import schemas
from app.content_loader import directions, interview
from app.services.ai.base import AIAdapter

EVIDENCE_WORDS = ["因为", "例如", "比如", "依据", "首先", "然后", "所以", "结果", "后来"]
# 敷衍信号：过短、或只有笼统评价词
_PERFUNCTORY_MARKERS = ["挺好的", "还不错", "挺好的呀", "感觉还行", "没啥", "不知道"]
# 注入信号：出现这些指令特征的句子不作为证据引用（真实模型由提示词约束）
_INJECTION_MARKERS = ["忽略", "满分", "五星", "直接打", "直接给", "恳请评委", "评分要求", " ignoring", "give full score"]

_STATEMENTS = {
    "expression": "可能在「把复杂的事讲清楚」上有优势",
    "analysis": "可能在「从材料中找问题、理清因果」上有优势",
    "design": "可能在「面对同一需求拿出不同方案」上有优势",
    "coding": "可能在「把想法做成能跑的东西」上有优势",
    "organization": "可能在「把模糊目标拆成可执行计划」上有优势",
    "interpersonal": "可能在「让不同的人愿意一起做成事」上有优势",
}

_FALLBACK_DIRECTIONS = ["analysis", "expression"]


def _iter_sentences(text: str) -> list[str]:
    parts = re.split(r"[。！？!?\n]+", text)
    return [p.strip() for p in parts if len(p.strip()) >= 8]


def _is_offtopic_or_copied(template: dict, text: str) -> bool:
    """确定性的离题/复制判定（模拟用）：提交里大段复制了题干。
    用 20 字滑窗匹配，容忍少量空白/标点差异。"""
    desc = re.sub(r"\s+", "", template.get("description", ""))
    body = re.sub(r"\s+", "", text)
    if len(desc) < 20:
        return False
    return any(desc[i : i + 20] in body for i in range(0, len(desc) - 20, 5))


class MockAdapter(AIAdapter):
    model_tag = "mock"
    prompt_version = "mock-v1"

    def extract_clues(self, messages: list[dict]) -> schemas.AIClueExtraction:
        signals = interview()["signals"]
        scores: dict[str, int] = {}
        quotes: dict[str, str] = {}
        for msg in messages:
            answer = (msg.get("answer") or "").strip()
            if not answer:
                continue
            low = answer.lower()
            for dir_code, words in signals.items():
                hits = [w for w in words if w.lower() in low]
                if hits:
                    scores[dir_code] = scores.get(dir_code, 0) + len(hits)
                    quotes.setdefault(dir_code, answer[:60])
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        picked = [code for code, _ in ranked[:4]]

        if not picked:
            # 访谈信号不足：诚实说明，并推荐两个上手最快的方向做体验
            picked = _FALLBACK_DIRECTIONS
            clues = [
                schemas.AIClue(
                    direction_code=code,
                    statement=_STATEMENTS[code] + "（待验证）",
                    evidence="访谈回答里没有出现明显的方向信号。这两类任务上手最快、覆盖面广，建议先通过任务体验再判断。",
                    based_on=[(m.get("answer") or "")[:60] for m in messages if (m.get("answer") or "").strip()][:1],
                )
                for code in picked
            ]
        else:
            clues = []
            for code in picked:
                d = directions()[code]
                clues.append(
                    schemas.AIClue(
                        direction_code=code,
                        statement=_STATEMENTS[code],
                        evidence=(
                            f"你在访谈里提到了与「{d['name']}」相关的经历（例如：“{quotes[code]}…”）。"
                            "以上来自你的自述，只能作为线索，需要通过实践任务验证。"
                        ),
                        based_on=[quotes[code]],
                    )
                )
        return schemas.AIClueExtraction(clues=clues)

    def evaluate_submission(self, template: dict, submission_text: str, mode: str) -> schemas.AITaskEvaluation:
        text = submission_text.strip()
        copied = _is_offtopic_or_copied(template, text)
        # 评分（确定性规则）：敷衍/复制题干诚实打低分，不再人为抬高下限。
        # 抗注入：含指令特征的句子不参与长度与依据词统计（仿佛模型"无视"了它）。
        all_sentences = _iter_sentences(text)
        clean_sentences = [
            s for s in all_sentences if not any(m in s for m in _INJECTION_MARKERS)
        ]
        clean_text = "".join(clean_sentences)
        base = 3
        if len(clean_text) > 150:
            base += 1
        if any(w in clean_text for w in EVIDENCE_WORDS):
            base += 1
        if len(clean_text) < 40 or copied or any(m in text for m in _PERFUNCTORY_MARKERS):
            base = 2
        if template["difficulty"] >= 3 and len(clean_text) < 100:
            base = min(base, 3)
        base = max(1, min(5, base))

        comments = {
            1: "（模拟）未提交有效内容。",
            2: "（模拟）内容偏薄或离题，缺少具体的事和依据，对照任务步骤补充。",
            3: "（模拟）基本达标，但关键判断还缺具体例子或证据支撑。",
            4: "（模拟）有具体内容、结构清楚，离高水平只差细节打磨。",
            5: "（模拟）具体、有条理、有反思，达到了任务要求的较高水准。",
        }
        scores = [
            schemas.AIDimensionScore(dimension=r["dimension"], score=base, comment=comments[base])
            for r in template["rubric"]
        ]
        # 证据摘取：优先带依据特征词的句子，注入指令句一律排除
        candidates = [
            s
            for s in clean_sentences
            if any(w in s for w in EVIDENCE_WORDS)
        ]
        if not candidates:
            candidates = clean_sentences
        evidence = sorted(candidates, key=len, reverse=True)[:2]
        avg = round(sum(s.score for s in scores) / len(scores), 1)
        mode_note = "独立完成" if mode == "independent" else "借助了 AI 辅助（成绩单独统计）"
        return schemas.AITaskEvaluation(
            scores=scores,
            evidence_quotes=[s[:80] for s in evidence],
            overall_comment=(
                f"【模拟评分】按《{template['title']}》的标准：整体 {avg}/5，本次为{mode_note}。"
                "评估依据全部来自你提交的文本，可在任务记录里回看。"
            ),
            suggestions=[
                f"针对「{r['dimension']}」：对照任务步骤，补充一个更具体的例子或证据。"
                for r in template["rubric"][:3]
            ],
        )

    def plan_note(self, week_index: int, direction_name: str) -> str:
        return (
            f"【模拟建议】第 {week_index} 周主攻「{direction_name}」。"
            "完成任务时留意：哪一步最费劲、哪一步最顺，写进周回顾。"
            "如果两次任务都觉得轻松，下周我会把难度往上提一档。"
        )

    def combination_reading(self, combos: list[dict], direction_names: list[str]) -> str:
        if not combos:
            return "（模拟解读）当前方向还没有形成组合，先把每个方向的入门任务做完，组合建议会随验证结果更新。"
        parts = []
        for c in combos[:3]:
            parts.append(f"「{'×'.join(c['directions'])}」→ {c['abilities']}（如：{c['paths'][0]}）。{c['how_to_start']}")
        return "【模拟解读】" + " ".join(parts)

    def cycle_summary(self, digest: dict) -> str:
        verdicts = digest.get("verdicts", [])
        go = [v for v in verdicts if v["verdict"] in ("继续投入", "继续验证")]
        pause = [v for v in verdicts if v["verdict"] in ("暂停验证", "换法再试")]
        parts = [f"【模拟总结】这 4 周你一共验证了 {len(verdicts)} 个方向。"]
        if go:
            parts.append(f"「{'、'.join(v['direction_name'] for v in go)}」出现了值得继续的信号，建议下一阶段集中投入。")
        if pause:
            parts.append(f"「{'、'.join(v['direction_name'] for v in pause)}」信号不足——这不是否定你，只是这个周期里证据还不够。")
        parts.append("记住：报告只回答『下一步验证什么』，真正的答案来自继续做事和收集反馈。")
        return " ".join(parts)
