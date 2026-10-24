"""儿童版计分：程序规则，模型不参与。

- 八个观察维度分：均分 × 20 → 0-100；
- 类型 = 最高维度（同分按维度顺序取先）；毅力与思维模式是"学习态度指标"，不参与类型判定；
- 报告声明：类型描述当下行为倾向，不是定性标签；题目为自编观察题，
  理论参照哈佛加德纳多元智能框架与宾大/斯坦福的毅力、思维模式研究（非原题）。
"""

from app.content_loader import child_assessment as load_assessment
from app.content_loader import child_types as load_types

MI_TRAITS = [t["code"] for t in load_assessment()["traits"]]
ATTITUDE_TRAITS = ["grit", "mindset"]


def compute_scores(answers: dict[str, int], form: str) -> dict:
    items = load_assessment()["items"][form]
    if not items:
        raise ValueError(f"未知测评版本：{form}")
    per_trait: dict[str, list[int]] = {}
    for it in items:
        if it["code"] not in answers:
            raise ValueError(f"题目未作答：{it['code']}")
        raw = int(answers[it["code"]])
        if not 1 <= raw <= 5:
            raise ValueError(f"题目 {it['code']} 的答案必须是 1-5")
        per_trait.setdefault(it["trait"], []).append(raw)

    scores = {t: round(sum(vs) / len(vs) * 20, 1) for t, vs in per_trait.items()}
    missing = set(MI_TRAITS + ATTITUDE_TRAITS) - set(scores)
    if missing:
        raise ValueError(f"维度缺少作答：{missing}")

    grit = round(sum(per_trait["grit"]) / len(per_trait["grit"]) * 20)
    mindset = round(sum(per_trait["mindset"]) / len(per_trait["mindset"]) * 20)
    type_trait = max(MI_TRAITS, key=lambda t: scores[t])
    return {
        "mi_scores": scores,
        "grit_score": grit,
        "mindset_score": mindset,
        "type_trait": type_trait,
    }


def type_content(trait: str) -> dict:
    types = load_types()
    if trait not in types:
        raise ValueError(f"未知类型：{trait}")
    return types[trait]


def attitude_advice(grit: int, mindset: int) -> list[dict]:
    """学习态度指标偏低时给出专项建议（概念：宾大 grit / 斯坦福 growth mindset）。"""
    advice = []
    if grit < 60:
        advice.append(
            {
                "key": "grit",
                "label": f"毅力 {grit}/100",
                "text": "把大目标拆成「跳一跳够得着」的小步子，孩子每完成一小步就具体表扬努力过程；",
            }
        )
    if mindset < 60:
        advice.append(
            {
                "key": "mindset",
                "label": f"思维模式 {mindset}/100",
                "text": "家里把「好聪明」换成「你用的这个办法好」，把失败聊成「又找到一条走不通的路」。",
            }
        )
    return advice


DECLARATION = (
    "本测评为基于行为观察的参考工具：八个维度参照哈佛大学加德纳教授的多元智能理论"
    "（自编中文观察题，非哈佛官方量表）；毅力与思维模式概念分别来自宾夕法尼亚大学和"
    "斯坦福大学的公开研究（自编题）。类型描述孩子当下的兴趣与行为倾向，会随成长变化，"
    "不是定性的标签，更不能替代专业机构的评估。"
)
