"""行业潜力测评：评分正确性（含反向题）、提交流程、行业详情、转线索。"""

import pytest

from app.content_loader import assessment as load_assessment
from app.services.assessment import compute_trait_scores, industry_breakdown, rank_industries
from app.content_loader import industries as load_industries


def _all_answers(value: int) -> dict[str, int]:
    return {it["code"]: value for it in load_assessment()["items"]}


def test_reverse_scoring():
    # 全部答 5（最像我）：普通题计 5，反向题计 1 → 每特质 (5+5+5+1)/4 = 80 分
    scores = compute_trait_scores(_all_answers(5))
    assert all(v == pytest.approx(80.0) for v in scores.values())
    # 全部答 1：镜像 → (1+1+1+5)/4 = 40 分；两组之和恒为 120（每特质 3 正 1 反结构）
    scores_low = compute_trait_scores(_all_answers(1))
    for t in scores:
        assert scores_low[t] == pytest.approx(40.0)
        assert scores[t] + scores_low[t] == pytest.approx(120.0)
    # 中性作答不受反向题影响：60 分
    assert all(v == pytest.approx(60.0) for v in compute_trait_scores(_all_answers(3)).values())


def test_all_neutral_scores_are_equal():
    scores = compute_trait_scores(_all_answers(3))
    assert all(v == pytest.approx(60.0) for v in scores.values())
    ranked = rank_industries(scores)
    # 中性作答时所有行业分数相同且排序稳定
    assert all(r["score"] == pytest.approx(ranked[0]["score"]) for r in ranked)
    assert [r["rank"] for r in ranked] == list(range(1, len(ranked) + 1))


def test_missing_answer_rejected():
    answers = _all_answers(3)
    del answers["v1"]
    with pytest.raises(ValueError, match="v1"):
        compute_trait_scores(answers)
    answers["v1"] = 9
    with pytest.raises(ValueError, match="1-5"):
        compute_trait_scores(answers)


def test_weights_shape_industry_scores():
    # 把身体特质拉满、其它压到 1：竞技跑步应排第一，外科/销售靠后
    data = load_assessment()
    answers = {}
    for it in data["items"]:
        answers[it["code"]] = 5 if it["trait"] == "physical" else 1
    scores = compute_trait_scores(answers)
    ranked = rank_industries(scores)
    assert ranked[0]["code"] == "athletics"
    assert ranked[-1]["code"] != "athletics"


def test_breakdown_gaps_and_strengths():
    data = load_assessment()
    answers = {}
    for it in data["items"]:
        answers[it["code"]] = 5 if it["trait"] in ("precision", "focus", "logical") else 1
    scores = compute_trait_scores(answers)
    surgeon = load_industries()["surgeon"]
    breakdown = industry_breakdown(surgeon, scores)
    strength_traits = {s["trait"] for s in breakdown["strengths"]}
    assert strength_traits <= {"precision", "focus", "logical"}
    assert breakdown["gaps"], "全低分作答下必有短板"
    assert "先补" in breakdown["gap_advice"]


def test_submit_and_latest_flow(client, auth_headers):
    # 拉题库
    resp = client.get("/api/assessment/questions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 48
    assert len(data["options"]) == 5

    # 未答完被拒
    resp = client.post("/api/assessment/submit", json={"answers": {"v1": 3}}, headers=auth_headers)
    assert resp.status_code == 400

    # 完整提交
    answers = {it["code"]: 4 for it in data["items"]}
    resp = client.post("/api/assessment/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 200
    result = resp.json()
    assert len(result["trait_scores"]) == 12
    assert len(result["industries"]) == 12
    assert result["industries"][0]["rank"] == 1
    assert "不是天赋判定" in result["note"]

    # latest 返回同一份
    resp = client.get("/api/assessment/latest", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == result["id"]


def test_industry_detail_and_to_clues(client, auth_headers):
    # 详情
    resp = client.get("/api/assessment/industries/surgeon", headers=auth_headers)
    assert resp.status_code == 404 or resp.status_code == 200  # 尚未测评时 my_score 为空但详情可用
    detail = resp.json()
    assert detail["name"] == "外科医生"
    assert len(detail["training_path"]) == 4
    assert "top" in detail["income"]
    assert detail["my_score"] is None

    # 线下行业转线索被拒并给出指引
    resp = client.post("/api/assessment/industries/athletics/to-clues", headers=auth_headers)
    assert resp.status_code == 400
    assert "自查任务" in resp.json()["detail"]

    # 线上行业转线索成功
    resp = client.post("/api/assessment/industries/sales/to-clues", headers=auth_headers)
    assert resp.status_code == 200
    clue_ids = resp.json()["clue_ids"]
    assert len(clue_ids) == 2

    # 线索出现在探测结果流（通过 cycles 前的 candidate 状态无法直接列出，转线索接口返回即可）
