"""行业潜力测评计分：全部由程序规则计算，模型不参与。

- 特质分：该特质下各题（反向题先翻转）的均分 × 20 → 0-100；
- 行业潜力分：Σ(权重 × 特质分) / Σ权重 → 0-100；
- 优势/短板：行业内加权特质按 权重×得分 排序，≥65 记优势，<55 记短板（按权重排训练优先级）。

问卷结果定位为"潜力参照"（自答），不是天赋判定——页面与 API 均携带此声明。
"""

from app.content_loader import assessment as load_assessment
from app.content_loader import industries as load_industries

STRENGTH_THRESHOLD = 65
GAP_THRESHOLD = 55

NOTE = (
    "这是基于 48 题自答问卷的潜力参照，不是天赋判定，更不能替代真实任务的验证。"
    "分数高 = 值得优先用任务去验证；分数低 = 入行要多跨一道坎，但不代表不能做。"
)


def compute_trait_scores(answers: dict[str, int]) -> dict[str, float]:
    data = load_assessment()
    per_trait: dict[str, list[int]] = {}
    for it in data["items"]:
        if it["code"] not in answers:
            raise ValueError(f"题目未作答：{it['code']}")
        raw = int(answers[it["code"]])
        if not 1 <= raw <= 5:
            raise ValueError(f"题目 {it['code']} 的答案必须是 1-5")
        value = 6 - raw if it.get("reverse") else raw
        per_trait.setdefault(it["trait"], []).append(value)
    missing = {t["code"] for t in data["traits"]} - set(per_trait)
    if missing:
        raise ValueError(f"特质缺少作答：{missing}")
    return {t: round(sum(vs) / len(vs) * 20, 1) for t, vs in per_trait.items()}


def rank_industries(trait_scores: dict[str, float]) -> list[dict]:
    ranked = []
    for code, ind in load_industries().items():
        w = ind["weights"]
        score = sum(wt * trait_scores[t] for t, wt in w.items()) / sum(w.values())
        ranked.append({"code": code, "score": round(score, 1)})
    ranked.sort(key=lambda x: -x["score"])
    for i, item in enumerate(ranked, 1):
        item["rank"] = i
    return ranked


def industry_breakdown(industry: dict, trait_scores: dict[str, float]) -> dict:
    """单个行业的优势/短板分析（用于结果页与行业详情页）。"""
    meta = {t["code"]: t for t in load_assessment()["traits"]}
    entries = []
    for t, wt in industry["weights"].items():
        entries.append(
            {
                "trait": t,
                "name": meta[t]["name"],
                "score": round(trait_scores[t], 1),
                "weight": wt,
                "contribution": round(wt * trait_scores[t], 1),
            }
        )
    strengths = sorted(
        [e for e in entries if e["score"] >= STRENGTH_THRESHOLD],
        key=lambda e: -e["contribution"],
    )
    gaps = sorted(
        [e for e in entries if e["score"] < GAP_THRESHOLD],
        key=lambda e: (-e["weight"], e["score"]),
    )
    keep = lambda e: {"trait": e["trait"], "name": e["name"], "score": e["score"]}  # noqa: E731
    return {
        "strengths": [keep(e) for e in strengths[:4]],
        "gaps": [keep(e) for e in gaps[:4]],
        "gap_advice": (
            f"训练优先级：先补「{gaps[0]['name']}」，它是这个行业权重最高的短板。"
            if gaps
            else "该行业看重的特质你都在线，短板训练可以从培训路径第 2 阶段开始。"
        ),
    }


def build_result_payload(trait_scores: dict[str, float], industries_ranked: list[dict]) -> dict:
    meta = {t["code"]: t for t in load_assessment()["traits"]}
    all_industries = load_industries()
    trait_out = [
        {
            "code": t,
            "name": meta[t]["name"],
            "description": meta[t]["description"],
            "score": round(trait_scores[t], 1),
            "improve": meta[t].get("improve", []),
        }
        for t in meta
    ]
    trait_out.sort(key=lambda x: -x["score"])
    industries_out = []
    for item in industries_ranked:
        ind = all_industries[item["code"]]
        breakdown = industry_breakdown(ind, trait_scores)
        industries_out.append(
            {
                "rank": item["rank"],
                "code": item["code"],
                "name": ind["name"],
                "tagline": ind["tagline"],
                "score": item["score"],
                "income_top": ind["income"]["top"],
                "strengths": breakdown["strengths"],
                "gaps": breakdown["gaps"],
                "gap_advice": breakdown["gap_advice"],
            }
        )
    return {"trait_scores": trait_out, "industries": industries_out, "note": NOTE}
