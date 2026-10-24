"""保持性重测调度（简化 FSRS 思想）：

入门或进阶任务评估通过后，7 天后自动安排一次"迁移任务"重测——
换一个陌生题目、隔一段时间再做，检验能力是否真的保持。
调度规则是程序写死的；将来数据多了可以换成完整 FSRS 参数化调度。
"""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.content_loader import task_templates
from app.models import Clue, TaskInstance

RETENTION_DELAY_DAYS = 7


def templates_for_direction(direction_code: str) -> dict[str, dict]:
    out = {}
    for t in task_templates().values():
        if t["direction_code"] == direction_code:
            out.setdefault(t["stage"], []).append(t)
    return out


def next_task_for_direction(direction_code: str, done_codes: list[str]) -> dict | None:
    """按「第 1 轮：入门A→进阶A→迁移A；第 2 轮：入门B→进阶B→迁移B」的顺序
    取第一个没做过的任务；全部做完后循环返回迁移任务（与最近一次不同，保持新鲜感）。"""
    by_stage = templates_for_direction(direction_code)
    done = set(done_codes)
    max_variants = max((len(v) for v in by_stage.values()), default=0)
    for variant in range(max_variants):
        for stage in ("intro", "advanced", "transfer"):
            group = by_stage.get(stage, [])
            if variant < len(group) and group[variant]["code"] not in done:
                return group[variant]
    transfers = by_stage.get("transfer", [])
    if not transfers:
        return None
    if done_codes:
        for t in transfers:
            if t["code"] != done_codes[-1]:
                return t
    return transfers[0]


def retention_template_for(clue_direction: str, avoid_code: str | None) -> dict | None:
    """保持性重测模板：优先选一个与周期内做过的迁移任务不同的变体。"""
    transfers = templates_for_direction(clue_direction).get("transfer", [])
    if not transfers:
        return None
    for t in transfers:
        if t["code"] != avoid_code:
            return t
    return transfers[0]


def schedule_retention_if_due(db: Session, clue: Clue, instance: TaskInstance) -> TaskInstance | None:
    """入门/进阶任务评估后，若无在途重测，则安排 7 天后的迁移重测。"""
    if instance.is_retention or instance.clue_id is None:
        return None
    stage = _stage_of(instance.template_code)
    if stage not in ("intro", "advanced"):
        return None
    exists = (
        db.query(TaskInstance)
        .filter(
            TaskInstance.clue_id == clue.id,
            TaskInstance.is_retention.is_(True),
            # 只挡"在途/未到期"的重测：已 evaluated 的不算，进阶任务评估后应能再排新一轮
            TaskInstance.status.in_(["assigned", "in_progress"]),
        )
        .first()
    )
    if exists:
        return None
    by_stage = templates_for_direction(clue.direction_code)
    # 重测优先换一个没做过的迁移变体，其次用当前任务的"下一个"迁移任务
    transfer = None
    for t in by_stage.get("transfer", []):
        if t["code"] != instance.template_code:
            transfer = t
            break
    transfer = transfer or by_stage.get("transfer", [None])[0]
    if not transfer:
        return None
    retention = TaskInstance(
        user_id=clue.user_id,
        clue_id=clue.id,
        template_code=transfer["code"],
        mode="independent",
        status="assigned",
        is_retention=True,
        retention_kind="delayed",
        scheduled_for=instance.submitted_at + timedelta(days=RETENTION_DELAY_DAYS)
        if instance.submitted_at
        else None,
    )
    db.add(retention)
    db.flush()
    return retention


def _stage_of(template_code: str) -> str | None:
    tpl = task_templates().get(template_code)
    return tpl["stage"] if tpl else None
