"""计分与画像：分数只在这里算，模型不参与。

统计口径（防夸大设计，重要）：
  - 模板去重：同一任务的多次提交只取最好成绩计入证据——重复刷同一题不会增加证据；
  - 独立口径：当前表现/学习进步只统计「独立完成」的成绩，AI 辅助成绩单独可见但不混合，
    避免"借助 AI 的进步"被当作能力进步；
  - 同阶段配对：进步 = 同一阶段内不同任务变体（入门A→入门B）的成绩差；
    跨难度（入门 vs 进阶）不直接相减宣称进步——任务难度不同，差值不说明能力变化；
  - 未测量 = 待验证：证据不足的维度显式标注"待验证"，不展示 0 分或默认中间分。

证据等级（硬规则）：
  线索   不同任务 < 2 个
  初步   ≥2 个且已有评估
  较充分 ≥3 个，且至少 1 个独立完成成绩 ≥4 分，且至少 1 个任务有真实读者反馈
         （同时列出仍未验证的事项——较充分 ≠ 完全体）
"""

from sqlalchemy.orm import Session

from app.content_loader import directions
from app.content_loader import combinations as load_combinations
from app.models import Clue, Evaluation, TaskInstance

_STAGE_ORDER = ["intro", "advanced", "transfer"]


def _eval_avg(evaluation: Evaluation) -> float:
    if not evaluation or not evaluation.scores:
        return 0.0
    return sum(s.get("score", 0) for s in evaluation.scores) / len(evaluation.scores)


def _template_stage(template_code: str) -> str | None:
    from app.content_loader import task_templates

    tpl = task_templates().get(template_code)
    return tpl["stage"] if tpl else None


def clue_stats(db: Session, clue: Clue) -> dict:
    instances = (
        db.query(TaskInstance)
        .filter(TaskInstance.clue_id == clue.id, TaskInstance.status.in_(["submitted", "evaluated"]))
        .order_by(TaskInstance.submitted_at)
        .all()
    )
    by_id = {i.id: i for i in instances}
    evals = (
        db.query(Evaluation)
        .filter(Evaluation.task_instance_id.in_(by_id.keys()))
        .all()
        if by_id
        else []
    )
    ai_by_instance: dict[int, list[float]] = {}
    ai_models: set[str] = set()
    reader_instance_ids: set[int] = set()
    for e in evals:
        if e.source == "ai" and not getattr(e, "superseded", False):
            ai_by_instance.setdefault(e.task_instance_id, []).append(_eval_avg(e))
            model = getattr(e, "ai_model", "") or ""
            ai_models.add(model if model else "unknown")
        elif e.source == "reader":
            reader_instance_ids.add(e.task_instance_id)
    # 评价来源：只要有任一真实模型评估，即按真实口径；否则若全为 mock 则标注模拟
    if any(not m.startswith("mock") for m in ai_models if m != "unknown"):
        eval_kind = "real"
    elif ai_models:
        eval_kind = "mock"
    else:
        eval_kind = None

    # 模板去重：每个任务模板只保留最好成绩（防重复刷题增加证据）
    best_per_template: dict[str, dict] = {}
    best_independent: dict[str, float] = {}
    willingness: list[int] = []
    retention_scores: list[float] = []
    submission_order: list[str] = []
    seen: set[str] = set()

    for i in instances:
        if i.self_willingness:
            willingness.append(i.self_willingness)
        scores = ai_by_instance.get(i.id, [])
        if i.is_retention:
            if scores:
                retention_scores.append(sum(scores) / len(scores))
            continue
        if i.template_code not in seen:
            seen.add(i.template_code)
            submission_order.append(i.template_code)
        if not scores:
            continue
        avg = sum(scores) / len(scores)
        slot = best_per_template.get(i.template_code)
        if slot is None or avg > slot["score"]:
            best_per_template[i.template_code] = {
                "score": avg,
                "mode": i.mode,
            }
        if i.mode == "independent":
            best_independent[i.template_code] = max(best_independent.get(i.template_code, 0), avg)

    # 独立口径的有序成绩（按模板首次提交顺序）
    independent_ordered = [
        best_independent[c] for c in submission_order if c in best_independent
    ]
    # 同阶段独立成绩序列（进步配对用）
    stage_independent: dict[str, list[float]] = {}
    for c in submission_order:
        stage = _template_stage(c)
        if stage and c in best_independent:
            stage_independent.setdefault(stage, []).append(best_independent[c])

    # 有读者反馈的不同任务数
    reader_templates = {
        i.template_code
        for i in instances
        if i.id in reader_instance_ids and not i.is_retention
    }

    return {
        "task_count": len(seen),  # 不同任务数（去重）
        "submission_count": len(instances),
        "evaluated_any": len(best_per_template) > 0,  # 是否有任何已评估任务
        "independent_ordered": independent_ordered,
        "independent_best": max(independent_ordered) if independent_ordered else None,
        "independent_count": len(independent_ordered),
        "reader_count": len(reader_templates),
        "retention_scores": retention_scores,
        "stage_independent": stage_independent,
        "willingness_avg": sum(willingness) / len(willingness) if willingness else None,
        "eval_kind": eval_kind,
    }


def evidence_level(stats: dict) -> tuple[str, str]:
    n = stats["task_count"]
    if n < 2:
        return "线索", f"已完成 {n} 个不同任务（规则：≥2 个才能到「初步」）"
    has_eval = stats["evaluated_any"]
    if (
        n >= 3
        and stats["independent_best"] is not None
        and stats["independent_best"] >= 4
        and stats["reader_count"] >= 1
    ):
        detail = (
            f"{n} 个不同任务，独立完成最好成绩 {stats['independent_best']:.1f}/5，"
            f"{stats['reader_count']} 个任务有真实读者反馈"
        )
        if stats.get("eval_kind") == "mock":
            detail += "。注意：任务分数来自模拟评价，非真实模型"
        # 较充分 ≠ 完全体：仍要列出未验证事项
        gaps_after = []
        if not stats["retention_scores"]:
            gaps_after.append("迁移重测仍未完成，保持性还未验证")
        if not stats["stage_independent"].get("transfer"):
            gaps_after.append("还没有正式完成过迁移阶段任务")
        if gaps_after:
            detail += "；仍未验证：" + "、".join(gaps_after)
        return "较充分", detail
    gaps = []
    if stats["independent_best"] is None or stats["independent_best"] < 4:
        gaps.append("独立完成成绩未到 4 分")
    if stats["reader_count"] < 1:
        gaps.append("还没有真实读者的反馈")
    if n < 3:
        gaps.append("任务数不足 3 个")
    return "初步", f"{n} 个不同任务；距「较充分」还差：{'、'.join(gaps) or '更多数据'}"


def _dim(value: float | None, detail: str, measured: bool = True) -> dict:
    if not measured or value is None:
        return {"value": None, "detail": detail, "measured": False}
    return {
        "value": round(max(0.0, min(100.0, value)), 1),
        "detail": detail,
        "measured": True,
    }


def five_dimensions(stats: dict) -> list[dict]:
    dims = []
    ind = stats["independent_ordered"]

    mock_tag = "[模拟评价] " if stats.get("eval_kind") == "mock" else ""

    # 当前表现：最近一次「独立完成」成绩（AI 辅助不计入能力信号）
    if ind:
        latest = ind[-1]
        avg = sum(ind) / len(ind)
        dims.append(
            {
                "key": "current",
                "label": "当前表现",
                **_dim(
                    latest / 5 * 100,
                    mock_tag + f"该方向独立完成的最好成绩 {latest:.1f}/5（每任务取最好成绩，防刷题虚高）；"
                    f"独立完成均分 {avg:.1f}/5（{len(ind)} 个任务）。AI 辅助的成绩不计入此维度",
                ),
            }
        )
    else:
        dims.append(
            {
                "key": "current",
                "label": "当前表现",
                **_dim(None, "还没有独立完成的评估。可以先独立（不用 AI）做一次任务，或到任务记录里查看 AI 辅助成绩"),
                "measured": False,
            }
        )

    # 学习进步：同阶段内不同任务变体的独立成绩差（同难度口径）
    paired = None
    for stage in _STAGE_ORDER:
        seq = stats["stage_independent"].get(stage, [])
        if len(seq) >= 2:
            paired = (seq[0], seq[-1], stage)
            break
    if paired:
        first, later, stage = paired
        delta = later - first
        label = "上升" if delta > 0.3 else ("持平" if delta >= -0.3 else "回落")
        stage_name = {"intro": "入门", "advanced": "进阶", "transfer": "迁移"}[stage]
        dims.append(
            {
                "key": "progress",
                "label": "学习进步",
                **_dim(
                    (delta + 2) / 4 * 100,
                    mock_tag + f"同阶段（{stage_name}）第二次独立完成 {later:.1f} 对比第一次 {first:.1f}（{label}）。"
                    "相近难度下的改善只是『值得继续』的证据，不代表先天因素",
                ),
            }
        )
    else:
        dims.append(
            {
                "key": "progress",
                "label": "学习进步",
                **_dim(
                    None,
                    "同一阶段独立完成两个不同任务后才能比较（跨难度任务不直接相减，避免把难度变化误读为进步）",
                ),
                "measured": False,
            }
        )

    # 迁移保持：重测成绩 vs 独立基线
    if stats["retention_scores"] and ind:
        baseline = sum(ind) / len(ind)
        r = sum(stats["retention_scores"]) / len(stats["retention_scores"])
        kept = r / baseline if baseline else 0
        label = "保持住了" if kept >= 0.9 else ("部分保持" if kept >= 0.7 else "遗忘明显")
        dims.append(
            {
                "key": "retention",
                "label": "迁移与保持",
                **_dim(
                    min(1.0, kept) * 100,
                    f"迁移重测均分 {r:.1f}，为独立完成基线的 {kept * 100:.0f}%（{label}）",
                ),
            }
        )
    else:
        dims.append(
            {
                "key": "retention",
                "label": "迁移与保持",
                **_dim(None, "完成迁移任务或 7 天重测后解锁——隔几天换个题目还会做，才算真的会"),
                "measured": False,
            }
        )

    # 持续意愿
    if stats["willingness_avg"] is not None:
        w = stats["willingness_avg"]
        dims.append(
            {
                "key": "willingness",
                "label": "持续意愿",
                **_dim(
                    w / 5 * 100,
                    f"自评『还想继续练』均分 {w:.1f}/5——新鲜感过去后的意愿比开始的兴奋更说明问题",
                ),
            }
        )
    else:
        dims.append(
            {
                "key": "willingness",
                "label": "持续意愿",
                **_dim(None, "完成任务后做一次自评即可解锁"),
                "measured": False,
            }
        )

    # 证据充分度（始终可测：它描述的是数据量本身）
    level, detail = evidence_level(stats)
    level_value = {"线索": 30, "初步": 60, "较充分": 90}[level]
    dims.append(
        {
            "key": "evidence",
            "label": "证据充分度",
            **_dim(level_value, f"{level}。{detail}"),
        }
    )
    return dims


def match_combinations(direction_codes: list[str]) -> list[dict]:
    active = set(direction_codes)
    matched = []
    for c in load_combinations():
        if set(c["directions"]) <= active:
            matched.append(c)
    return matched


def build_clue_profile(db: Session, clue: Clue) -> dict:
    stats = clue_stats(db, clue)
    level, detail = evidence_level(stats)
    d = directions().get(clue.direction_code)
    name = d["name"] if d else clue.direction_code
    return {
        "clue_id": clue.id,
        "direction_code": clue.direction_code,
        "direction_name": name,
        "statement": clue.statement,
        "evidence_level": level,
        "evidence_detail": detail,
        "dimensions": five_dimensions(stats),
        "task_count": stats["task_count"],
        "submission_count": stats["submission_count"],
        "independent_count": stats["independent_count"],
        "reader_feedback_count": stats["reader_count"],
        "evaluation_kind": stats.get("eval_kind") or "none",
        "cultivation": (d or {}).get("cultivation", []),
        "everyday_practice": (d or {}).get("everyday_practice", []),
    }
