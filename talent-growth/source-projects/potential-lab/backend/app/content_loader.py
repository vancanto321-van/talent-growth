"""种子内容加载：方向库 / 任务模板 / 组合图谱 / 访谈问题。

内容是产品的重要资产，与代码分离、YAML 版本化管理；
启动时一次性载入内存并做完整性校验（code 唯一、外键有效）。
"""

from functools import lru_cache
from pathlib import Path

import yaml

CONTENT_DIR = Path(__file__).resolve().parent.parent / "content"


def _load_yaml(name: str) -> dict:
    with open(CONTENT_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def directions() -> dict[str, dict]:
    raw = _load_yaml("directions.yaml")["directions"]
    return {d["code"]: d for d in raw}


@lru_cache(maxsize=1)
def task_templates() -> dict[str, dict]:
    raw = _load_yaml("tasks.yaml")["tasks"]
    result = {}
    for t in raw:
        if t["code"] in result:
            raise ValueError(f"任务模板 code 重复: {t['code']}")
        if t["direction_code"] not in directions():
            raise ValueError(f"任务 {t['code']} 引用了未知方向 {t['direction_code']}")
        result[t["code"]] = t
    # 每个方向必须覆盖 入门/进阶/迁移 三阶段（每阶段 ≥1 个，支持同阶段多变体）
    from collections import Counter

    for code in directions():
        counter = Counter(
            t["stage"] for t in result.values() if t["direction_code"] == code
        )
        missing = {"intro", "advanced", "transfer"} - set(counter)
        if missing:
            raise ValueError(f"方向 {code} 缺少任务阶段：{missing}")
    return result


@lru_cache(maxsize=1)
def combinations() -> list[dict]:
    return _load_yaml("combinations.yaml")["combinations"]


@lru_cache(maxsize=1)
def interview() -> dict:
    return _load_yaml("interview.yaml")


@lru_cache(maxsize=1)
def assessment() -> dict:
    """行业潜力测评：特质 + 题目。题目特质必须存在、code 唯一。"""
    data = _load_yaml("assessment.yaml")
    trait_codes = {t["code"] for t in data["traits"]}
    seen = set()
    for it in data["items"]:
        if it["code"] in seen:
            raise ValueError(f"测评题目 code 重复: {it['code']}")
        if it["trait"] not in trait_codes:
            raise ValueError(f"题目 {it['code']} 引用了未知特质 {it['trait']}")
        seen.add(it["code"])
    # 每个特质至少 3 题
    counts: dict[str, int] = {}
    for it in data["items"]:
        counts[it["trait"]] = counts.get(it["trait"], 0) + 1
    for t in trait_codes:
        if counts.get(t, 0) < 3:
            raise ValueError(f"特质 {t} 题目不足 3 道")
    return data


@lru_cache(maxsize=1)
def industries() -> dict[str, dict]:
    """行业图谱：权重和为 1、特质存在、关联方向存在、结构完整。"""
    raw = _load_yaml("industries.yaml")["industries"]
    result = {i["code"]: i for i in raw}
    trait_codes = {t["code"] for t in assessment()["traits"]}
    for code, ind in result.items():
        total = sum(ind["weights"].values())
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"行业 {code} 特质权重之和为 {total}，应为 1.0")
        unknown = set(ind["weights"]) - trait_codes
        if unknown:
            raise ValueError(f"行业 {code} 引用了未知特质 {unknown}")
        for d in ind.get("direction_codes") or []:
            if d not in directions():
                raise ValueError(f"行业 {code} 引用了未知方向 {d}")
        if len(ind.get("training_path") or []) != 4:
            raise ValueError(f"行业 {code} 培训路径应为 4 段")
        if len(ind.get("self_checks") or []) < 3:
            raise ValueError(f"行业 {code} 自查任务不足 3 条")
    return result


def template_out(code: str) -> dict:
    """模板 + 冗余的方向名，方便前端直接渲染。"""
    t = task_templates()[code]
    return {**t, "direction_name": directions()[t["direction_code"]]["name"]}


@lru_cache(maxsize=1)
def child_assessment() -> dict:
    """儿童版测评：家长观察版 / 儿童自答版两套题目，结构相同。"""
    data = _load_yaml("child_assessment.yaml")
    # grit/mindset 是"学习态度指标"，作为计分维度与 8 个观察维度并列合法
    valid_codes = {t["code"] for t in data["traits"]} | {"grit", "mindset"}
    for form_name, items in data["items"].items():
        seen = set()
        counts: dict[str, int] = {}
        for it in items:
            if it["code"] in seen:
                raise ValueError(f"儿童题目 code 重复: {it['code']}")
            if it["trait"] not in valid_codes:
                raise ValueError(f"儿童题目 {it['code']} 引用了未知维度 {it['trait']}")
            seen.add(it["code"])
            counts[it["trait"]] = counts.get(it["trait"], 0) + 1
        for t in counts:
            if counts[t] < 3:
                raise ValueError(f"{form_name} 版维度 {t} 题目不足 3 道")
        for required in valid_codes:
            if required not in counts:
                raise ValueError(f"{form_name} 版缺少维度 {required} 的题目")
    return data


@lru_cache(maxsize=1)
def child_types() -> dict[str, dict]:
    """儿童类型培养方案：每个类型必须对应已存在的观察维度。"""
    raw = _load_yaml("child_types.yaml")["types"]
    trait_codes = {t["code"] for t in child_assessment()["traits"]}
    result = {}
    for t in raw:
        if t["trait"] not in trait_codes:
            raise ValueError(f"儿童类型 {t['type_name']} 引用了未知维度 {t['trait']}")
        if len(t.get("weekly_plan") or []) != 4:
            raise ValueError(f"儿童类型 {t['type_name']} 月度计划应为 4 周")
        result[t["trait"]] = t
    return result


@lru_cache(maxsize=1)
def item_rationales() -> dict:
    """出题理由库：题目 code → "为什么这么问"。缺失即内容校验失败。"""
    data = _load_yaml("item_rationales.yaml")
    # 校验：每套题库的每道题都必须有出题理由
    interview_codes = {q["code"] for q in interview()["questions"]}
    missing = interview_codes - set(data["interview"].keys())
    if missing:
        raise ValueError(f"访谈题缺少出题理由：{missing}")
    adult_codes = {it["code"] for it in assessment()["items"]}
    missing = adult_codes - set(data["assessment"].keys())
    if missing:
        raise ValueError(f"行业测评题缺少出题理由：{missing}")
    for form in ("parent", "self"):
        codes = {it["code"] for it in child_assessment()["items"][form]}
        missing = codes - set(data["child"].get(form, {}).keys())
        if missing:
            raise ValueError(f"儿童版 {form} 题缺少出题理由：{missing}")
    return data


@lru_cache(maxsize=1)
def methodology() -> dict:
    """方法论内容：理论来源、计分方式、边界与参考文献。"""
    return _load_yaml("methodology.yaml")




def validate_all() -> None:
    directions()
    task_templates()
    combinations()
    interview()
    assessment()
    industries()
    child_assessment()
    child_types()
    item_rationales()
    methodology()
    # 新增内容字段完整性：方向要有培养路径、行业要有门槛、特质要有提升建议
    for code, d in directions().items():
        if len(d.get("cultivation") or []) != 4 or not d.get("everyday_practice"):
            raise ValueError(f"方向 {code} 缺少培养路径或日常练习")
    for code, ind in industries().items():
        if not ind.get("requirements"):
            raise ValueError(f"行业 {code} 缺少门槛与资质")
    for t in assessment()["traits"]:
        if not t.get("improve"):
            raise ValueError(f"特质 {t['code']} 缺少提升建议")
    # 组合图谱里引用的方向必须存在
    for c in combinations():
        for d in c["directions"]:
            if d not in directions():
                raise ValueError(f"组合 {c['abilities']} 引用了未知方向 {d}")
