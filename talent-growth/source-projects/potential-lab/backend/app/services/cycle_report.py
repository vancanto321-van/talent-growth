"""4 周结业报告：把一个周期里的全部证据，收敛成"下一步该怎么走"。

判定规则（程序决定，AI 只做措辞）：
  继续投入   较充分证据；或初步证据 + 进步上升 + 意愿在线
  冲刺一下   初步证据但缺外部反馈/缺独立完成——再补一块拼图就能定
  换法再试   有任务数据但进步回落 / 意愿偏低
  暂停验证   数据太少（<2 次）且意愿不明
未验证清单：没有读者反馈 / 没做迁移重测 / 进阶迁移任务未完成 / 从未独立完成
"""

from sqlalchemy.orm import Session

from app.content_loader import directions as load_directions
from app.models import Clue, ExplorationCycle
from app.services.scoring import build_clue_profile, clue_stats


def _verdict(profile: dict, stats: dict) -> tuple[str, str, list[str]]:
    """返回 (verdict, emoji, reasons)。"""
    n = stats["task_count"]
    if n == 0:
        return "还没开始", "💤", ["这个方向还没有完成过任何任务，没有证据可以判断。"]
    if profile["evidence_level"] == "较充分":
        return "继续投入", "🚀", [
            f"独立完成最好成绩 {stats['independent_best']:.1f}/5",
            f"已有 {stats['reader_count']} 条真实读者反馈",
            "证据链完整，值得下一阶段正式投入",
        ]
    if profile["evidence_level"] == "初步":
        dims = {d["key"]: d for d in profile["dimensions"]}
        progress_up = "上升" in dims.get("progress", {}).get("detail", "")
        willing = (stats["willingness_avg"] or 0) >= 3
        if progress_up and willing:
            return "继续验证", "🌱", [
                "后续阶段成绩在上升",
                "你自己还想继续练（意愿在线）",
                "方向对了，但证据还不够厚",
            ]
        if not progress_up and stats["willingness_avg"] is not None and stats["willingness_avg"] < 2.5:
            return "换法再试", "🔧", [
                "后续任务没有看到进步",
                "你自己继续练的意愿偏低",
                "可能是任务难度或方法不匹配，不一定是方向问题",
            ]
        return "冲刺一下", "🧩", [
            "有初步证据，但还差一块拼图",
            *(["还没有真实读者的反馈"] if stats["reader_count"] == 0 else []),
            *(["还没有独立完成的成绩"] if stats["independent_count"] == 0 else []),
        ]
    # 线索
    if (stats["willingness_avg"] or 0) >= 3:
        return "冲刺一下", "🧩", [
            "任务还太少，但你的意愿信号不错",
            "补 1-2 次任务 + 一条读者反馈，就能升到「初步」",
        ]
    return "暂停验证", "⏸️", [
        f"只完成了 {n} 次任务，数据不足",
        "先把它放一放，把周期让给更有信号的方向",
    ]


# 免费层每方向 1 句解读（程序生成，与判定规则同源；付费解锁完整依据与验证明细）
ONE_LINERS = {
    "继续投入": "证据链完整：这个方向的信号经受住了独立完成和真实读者的双重检验，可以正式投入。",
    "继续验证": "成绩在上升、你也想继续——方向大概率是对的，只是证据还需要再加厚。",
    "冲刺一下": "已经有了初步信号：补上缺口（读者反馈或一次独立完成），就能下结论。",
    "换法再试": "信号在回落：先换一种练法或调整任务难度，别急着否定这个方向。",
    "暂停验证": "任务数据还太少，无法判断：先放一放，把周期让给更有信号的方向。",
    "还没开始": "这个方向还没有任务记录：先完成一次任务，它才有资格进入判定。",
}


def one_liner_for(verdict: str) -> str:
    return ONE_LINERS.get(verdict, "任务证据还不足以下结论，先完成几次任务再看。")


def _unverified(stats: dict, done_stages: list[str]) -> list[str]:
    out = []
    if stats["reader_count"] == 0:
        out.append("还没有收集真实读者的反馈")
    if not stats["retention_scores"]:
        out.append("还没做迁移/保持性重测——隔几天再做才算数")
    if "advanced" not in done_stages:
        out.append("进阶任务还没完成")
    if "transfer" not in done_stages:
        out.append("迁移任务还没完成（换一个陌生题目试试）")
    if stats["independent_count"] == 0:
        out.append("还没有独立完成过（全部借助了 AI）")
    return out


def build_report(db: Session, user_id: int, cycle: ExplorationCycle) -> dict:
    clues = db.query(Clue).filter(Clue.cycle_id == cycle.id).all()
    verdicts = []
    for clue in clues:
        profile = build_clue_profile(db, clue)
        stats = clue_stats(db, clue)
        verdict, emoji, reasons = _verdict(profile, stats)
        done_stages = _done_stages(db, clue)
        verdicts.append(
            {
                "clue_id": clue.id,
                "direction_code": clue.direction_code,
                "direction_name": profile["direction_name"],
                "statement": clue.statement,
                "verdict": verdict,
                "emoji": emoji,
                "reasons": reasons,
                "evidence_level": profile["evidence_level"],
                "evidence_detail": profile["evidence_detail"],
                "current": next(
                    (
                        d["value"]
                        for d in profile["dimensions"]
                        if d["key"] == "current" and d.get("measured")
                    ),
                    None,
                ),
                "task_count": stats["task_count"],
                "unverified": _unverified(stats, done_stages),
                "one_liner": one_liner_for(verdict),
                # 免费层原话证据：每方向最多 2 条、每条截断到 60 字
                "quotes": [(q or "")[:60] for q in (clue.based_on or []) if (q or "").strip()][:2],
            }
        )
    # 排序：继续投入 > 继续验证 > 冲刺一下 > 换法再试 > 暂停验证 > 还没开始；同级按表现分
    order = {"继续投入": 0, "继续验证": 1, "冲刺一下": 2, "换法再试": 3, "暂停验证": 4, "还没开始": 5}
    verdicts.sort(key=lambda v: (order.get(v["verdict"], 9), -(v["current"] or 0)))

    go_on = [v for v in verdicts if v["verdict"] in ("继续投入", "继续验证")]
    suggested = [v["clue_id"] for v in (go_on or verdicts[:2])][:2]

    # 新方向建议：从没激活过、也没体验过的方向里轮换一个
    active_codes = {v["direction_code"] for v in verdicts}
    fresh = [code for code in load_directions() if code not in active_codes]
    new_direction = None
    if fresh:
        code = fresh[len(verdicts) % len(fresh)]
        new_direction = {"code": code, "name": load_directions()[code]["name"]}

    return {
        "cycle_id": cycle.id,
        "verdicts": verdicts,
        "next": {
            "suggested_clue_ids": suggested,
            "new_direction": new_direction,
            "text": (
                f"下一阶段建议：把精力集中在「{(go_on or verdicts[:1])[0]['direction_name']}」上，"
                + (f"同时留一个位置给新方向「{new_direction['name']}」体验。" if new_direction else "保持每周一个新方向体验。")
            ),
        },
    }


def _done_stages(db: Session, clue: Clue) -> list[str]:
    from app.content_loader import task_templates
    from app.models import TaskInstance

    instances = (
        db.query(TaskInstance.template_code)
        .filter(
            TaskInstance.clue_id == clue.id,
            TaskInstance.status.in_(["submitted", "evaluated"]),
            TaskInstance.is_retention.is_(False),
        )
        .all()
    )
    stages = []
    for (code,) in instances:
        tpl = task_templates().get(code)
        if tpl:
            stages.append(tpl["stage"])
    return stages
