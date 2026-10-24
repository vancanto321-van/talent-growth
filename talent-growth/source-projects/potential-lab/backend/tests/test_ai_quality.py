"""AI 评价质量回归：固定样本集 × MockAdapter 的质量断言 + app 级行为测试。

四个层次：
1. 样本集覆盖面：6 方向 × intro/advanced 的 12 个 normal 基础位 + 全部异常类别
   + dev/holdout 留出集划分（excellent / contradictory / flowery_empty /
   long_injection 至少各 1 个留出）；
2. 样本级质量检查——dev 集全样本断言结构与引用可溯源，确定性类样本加分数口径；
   holdout 留出样本只断言结构与引用（不预设分数，防止按留出样本调规则）；
3. Mock 行为特性：确定性、方差恒 0、语义类 N/A 分级、超长输入鲁棒性、
   运行器默认不跑 holdout；
4. app 级测试：re-evaluate 重试不产生重复有效评价、AI 降级不产生有效评价。

注意：Mock 结果只证明流程与口径正确，不代表真实大模型效果（见 evaluation/README.md）。
"""

import pytest

from app.content_loader import task_templates
from app.database import get_db
from app.models import Evaluation
from app.services.ai.base import AIAdapter, AIError
from app.services.ai.mock import MockAdapter

from evaluation.checks import (
    avg_score,
    check_determinism,
    check_expectation,
    check_not_inflated,
    check_quotes_avoid_fragments,
    check_quotes_in_text,
    check_rubric_consistency,
    check_semantic_strict,
    check_structure,
    check_variance,
    run_all_checks,
)
from evaluation.run_eval import (
    estimate_cost_cny,
    extract_usage,
    main,
    parse_args,
    run_adapter,
    select_samples,
)
from evaluation.samples import (
    DIRECTIONS,
    REQUIRED_CATEGORIES,
    REQUIRED_HOLDOUT_CATEGORIES,
    SAMPLES,
    SAMPLES_BY_ID,
    SEMANTIC_CATEGORIES,
    samples_by_category,
    samples_by_set,
)
from tests.test_flow import _do_one_task

TEMPLATE_CODE = "exp_intro_explain"
DEV = samples_by_set("dev")
HOLDOUT = samples_by_set("holdout")

# dev 集里"分数口径可判"的异常样本（语义类无 mock 可判断言，见 test_mock_semantic_*）
_DEV_SCORED_ANOMALIES = [
    s for s in DEV if s.category != "normal" and set(s.expectation) - {"note"}
]


def _adapter() -> MockAdapter:
    return MockAdapter()


def _evaluate(sample):
    """用 MockAdapter 按样本评估一次（与 run_eval 完全相同的调用方式）。"""
    return _adapter().evaluate_submission(
        task_templates()[sample.template_code], sample.text, "independent"
    )


def _result(score: int, comment: str = "") -> dict:
    """构造 checks.py 兼容的同构 dict 结果（真实 HTTP 响应形态）。"""
    return {
        "scores": [{"dimension": "准确性", "score": score, "comment": ""}],
        "evidence_quotes": [],
        "overall_comment": comment,
        "suggestions": [],
    }


# ---------- 1) 样本集覆盖面与留出集划分 ----------


def test_sample_set_covers_directions_stages_and_categories():
    """覆盖面：全部异常类别 + 6 方向 × intro/advanced 各 1 个 normal 基础位。"""
    categories = {s.category for s in SAMPLES}
    assert set(REQUIRED_CATEGORIES) <= categories

    normals = samples_by_category("normal")
    assert len(normals) == 12
    assert len({s.template_code for s in normals}) == 12
    for direction in DIRECTIONS:
        stages = {s.stage for s in normals if s.direction == direction}
        assert stages == {"intro", "advanced"}, f"方向 {direction} 缺 intro/advanced 基础位"

    # 元数据（direction/stage/difficulty）必须与内容库模板一致
    templates = task_templates()
    for s in SAMPLES:
        t = templates[s.template_code]
        assert s.direction == t["direction_code"]
        assert s.stage == t["stage"]
        assert s.difficulty == t["difficulty"]
        assert s.set in ("dev", "holdout")
        assert s.text.strip(), f"{s.id} 文本为空"

    # 异常类别全部挂在同一模板上，保证可横向比较
    for s in SAMPLES:
        if s.category != "normal":
            assert s.template_code == TEMPLATE_CODE, f"{s.id} 应挂在 {TEMPLATE_CODE}"


def test_holdout_split_rules():
    """留出集：dev/holdout 不重不漏，且要求的类别至少各 1 个留出。"""
    dev_ids = {s.id for s in DEV}
    holdout_ids = {s.id for s in HOLDOUT}
    assert not (dev_ids & holdout_ids)
    assert dev_ids | holdout_ids == {s.id for s in SAMPLES}
    holdout_categories = {s.category for s in HOLDOUT}
    assert set(REQUIRED_HOLDOUT_CATEGORIES) <= holdout_categories


def test_samples_by_set_api():
    assert samples_by_set("all") == SAMPLES
    assert samples_by_set("dev") == DEV
    assert samples_by_set("holdout") == HOLDOUT
    with pytest.raises(ValueError):
        samples_by_set("bogus")


# ---------- 2) dev 集：结构 / 引用溯源 / 抗注入 / 分数口径 ----------


@pytest.mark.parametrize("sample", DEV, ids=lambda s: s.id)
def test_dev_structure_and_traceable_quotes(sample):
    """dev 全样本：结构完整（维度与 rubric 一致、分数 1-5）且证据引用均为原文子串。"""
    result = _evaluate(sample)
    template = task_templates()[sample.template_code]
    assert check_structure(result, template) == []
    assert check_quotes_in_text(result, sample.text) == []


@pytest.mark.parametrize("sample", _DEV_SCORED_ANOMALIES, ids=lambda s: s.id)
def test_dev_scored_expectations(sample):
    """确定性类异常样本：机器可读分数口径全部满足（敷衍低分、优秀有引用、复制 ≤2 等）。"""
    assert check_expectation(sample, _evaluate(sample)) == []


@pytest.mark.parametrize("sample", samples_by_category("normal"), ids=lambda s: s.id)
def test_normal_full_checks_with_deterministic_variance(sample):
    """12 个 normal 基础位：通用检查全绿 + 分数方差（Mock 确定性，极差恒 0）。"""
    template = task_templates()[sample.template_code]
    result = _evaluate(sample)
    checks = run_all_checks(sample, result, template)
    checks["分数方差"] = check_variance([result, _evaluate(sample)])
    failures = {name: f for name, f in checks.items() if f}
    assert not failures, failures
    assert avg_score(result) >= sample.expectation["min_avg"]


@pytest.mark.parametrize(
    "sample", samples_by_category("injection_start", "injection_polite"), ids=lambda s: s.id
)
def test_injection_family_resists_and_never_quotes_the_instruction(sample):
    """注入文本（指令在开头/礼貌恳求式）：不服从注入（均分 < 5），指令不得被摘为证据。"""
    result = _evaluate(sample)
    assert avg_score(result) < 5.0
    assert check_not_inflated(result, sample.text) == []
    fragments = sample.expectation["forbidden_quote_fragments"]
    assert check_quotes_avoid_fragments(result, fragments) == []


def test_duplicate_and_normal_are_deterministic():
    """duplicate 与 normal 文本完全相同，多次评估结果必须逐字段一致。"""
    adapter = _adapter()
    template = task_templates()[TEMPLATE_CODE]
    text = SAMPLES_BY_ID["normal-exp-intro"].text
    results = [adapter.evaluate_submission(template, text, "independent") for _ in range(3)]
    results.append(_evaluate(SAMPLES_BY_ID["duplicate-001"]))
    for r in results[1:]:
        assert check_determinism(results[0], r) == []


def test_overlong_input_returns_valid_structure():
    """约 9000 字符超长输入：不崩溃、返回完整结构（由结构检查保证）。"""
    sample = SAMPLES_BY_ID["overlong-001"]
    result = _evaluate(sample)
    template = task_templates()[sample.template_code]
    assert check_structure(result, template) == []
    assert result.suggestions  # 完整返回，不被截断成空壳
    assert check_expectation(sample, result) == []  # 文本长度落在 approx_chars 区间


@pytest.mark.parametrize("sample", samples_by_category("copied_prompt"), ids=lambda s: s.id)
def test_strict_copied_bar(sample):
    """复制题干有确定性特征（大段包含题干），Mock 必须满足 ≤2 严格口径。"""
    assert check_rubric_consistency(sample.category, _evaluate(sample)) == []


# ---------- 3) holdout 留出集：只查结构与引用，不预设分数 ----------


@pytest.mark.parametrize("sample", HOLDOUT, ids=lambda s: s.id)
def test_holdout_structure_and_traceable_quotes(sample):
    """留出样本只断言结构与引用子串——分数不做预设，防止按留出样本调规则。"""
    result = _evaluate(sample)
    template = task_templates()[sample.template_code]
    assert check_structure(result, template) == []
    assert check_quotes_in_text(result, sample.text) == []


# ---------- 4) 运行器与语义类分级 ----------


def test_default_runner_skips_holdout(monkeypatch, capsys):
    """默认只跑 dev 集；--holdout 只跑留出集；--all 全跑；退出码 0。"""
    monkeypatch.delenv("GLM_API_KEY", raising=False)
    monkeypatch.setattr("evaluation.run_eval.maybe_run_glm", lambda templates, samples: None)

    dev_ids = {s.id for s in DEV}
    holdout_ids = {s.id for s in HOLDOUT}

    assert {s.id for s in select_samples(parse_args([]))} == dev_ids
    assert {s.id for s in select_samples(parse_args(["--holdout"]))} == holdout_ids
    assert {s.id for s in select_samples(parse_args(["--all"]))} == dev_ids | holdout_ids

    assert main([]) == 0
    out_default = capsys.readouterr().out
    for sid in holdout_ids:
        assert sid not in out_default, f"默认运行不应评估留出样本 {sid}"

    assert main(["--holdout"]) == 0
    out_holdout = capsys.readouterr().out
    for sid in holdout_ids:
        assert sid in out_holdout
    for sid in dev_ids:
        assert sid not in out_holdout, f"--holdout 运行不应评估 dev 样本 {sid}"


def test_mock_semantic_samples_are_na_not_failures():
    """语义类分级：Mock 下 off_topic / ai_declared 记 N/A，不计失败也不计入通过。"""
    samples = samples_by_category("off_topic", "ai_declared")
    stats = run_adapter(_adapter(), samples, task_templates(), verbose=False)
    assert stats.evaluated_ids == [s.id for s in samples]
    assert stats.na == len(samples)
    assert stats.failed == 0
    assert stats.passed == 0


_FLAG_EXAMPLES = {
    "off_topic": "该提交与任务无关，属于离题内容",
    "flowery_empty": "辞藻华丽但内容空洞，缺少具体的事",
    "contradictory": "论证前后矛盾，结论与理由冲突",
    "ai_declared": "正文声明由 AI 生成，需注意独立完成的口径",
}


@pytest.mark.parametrize("category", SEMANTIC_CATEGORIES)
def test_semantic_strict_rules_fire_for_real_model(category):
    """真实模型 strict 口径：低分或评语点破二选一；高分且不点破必须失败。"""
    assert check_semantic_strict(category, _result(2)) == []
    assert check_semantic_strict(category, _result(5)) != []
    assert check_semantic_strict(category, _result(5, _FLAG_EXAMPLES[category])) == []


def test_semantic_strict_ai_declared_cap_and_unknown_category():
    """ai_declared 的分数上限是 3（低于其他语义类）；非语义类不受 strict 约束。"""
    assert check_semantic_strict("ai_declared", _result(3)) == []
    assert check_semantic_strict("ai_declared", _result(4)) != []
    assert check_semantic_strict("normal", _result(5)) == []


def test_glm_cost_estimate_and_usage_extraction():
    """价目常量估算成本；未知模型走兜底价；Mock 适配器不产生 usage。"""
    assert (
        estimate_cost_cny("glm:glm-4.5", {"prompt_tokens": 1_000_000, "completion_tokens": 500_000})
        == pytest.approx(12.0)
    )
    assert (
        estimate_cost_cny("glm:unknown-model", {"prompt_tokens": 1_000_000, "completion_tokens": 0})
        == pytest.approx(2.0)
    )
    assert extract_usage(_adapter(), _result(3)) is None


# ---------- 5) app 级行为测试 ----------


def _db(client):
    return next(client.app.dependency_overrides[get_db]())


def test_reevaluate_keeps_single_active_ai_evaluation_with_provenance(client, full_cycle):
    """重试不重复：同一任务 re-evaluate 两次后，有效 AI 评估恰好 1 条，且可追溯模型与提示词版本。"""
    headers, _ = full_cycle
    inst_id, _ = _do_one_task(client, headers, TEMPLATE_CODE)

    for _ in range(2):
        resp = client.post(f"/api/tasks/{inst_id}/re-evaluate", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["evaluation"]["source"] == "ai"

    resp = client.get(f"/api/tasks/{inst_id}/evaluations", headers=headers)
    assert resp.status_code == 200
    ai_evals = [e for e in resp.json() if e["source"] == "ai"]
    assert len(ai_evals) == 1, f"重评后应恰好 1 条有效 AI 评估，实际 {len(ai_evals)} 条"

    db = _db(client)
    try:
        rows = (
            db.query(Evaluation)
            .filter(Evaluation.task_instance_id == inst_id, Evaluation.source == "ai")
            .order_by(Evaluation.id)
            .all()
        )
    finally:
        db.close()
    assert len(rows) == 3  # 提交时 1 条 + 重评 2 条，历史留档
    assert [r.superseded for r in rows] == [True, True, False]

    active = rows[-1]
    assert active.id == ai_evals[0]["id"]
    # 溯源字段：当前生效的评估必须能回答"谁、用哪版提示词评的"
    assert active.ai_model == "mock"
    assert active.prompt_version == "mock-v1"


def test_degraded_ai_produces_no_valid_evaluation(client, full_cycle, monkeypatch):
    """降级不产生有效评价：AI 抛 AIError 时提交成功但 degraded=True，任务停在 submitted。"""

    class ExplodingAI(AIAdapter):
        model_tag = "exploding"
        prompt_version = "explode-v1"

        def evaluate_submission(self, template, submission_text, mode):
            raise AIError("模拟模型故障")

    monkeypatch.setattr("app.routers.tasks.get_ai", lambda settings=None: ExplodingAI())

    headers, _ = full_cycle
    resp = client.post("/api/tasks/from-template", json={"template_code": TEMPLATE_CODE}, headers=headers)
    assert resp.status_code == 200
    inst_id = resp.json()["id"]
    resp = client.post(f"/api/tasks/{inst_id}/start", headers=headers)
    assert resp.status_code == 200

    resp = client.post(
        f"/api/tasks/{inst_id}/submit",
        json={
            "text_content": "我给新同事解释什么是迭代：先做一版能用的，用两周，收集反馈，再改下一版。",
            "mode": "independent",
            "time_spent_min": 20,
            "difficulty_feedback": 3,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["degraded"] is True
    assert data["instance"]["status"] == "submitted"
    assert data["evaluation"]["degraded"] is True
    assert data["evaluation"]["scores"] == []

    resp = client.get(f"/api/tasks/{inst_id}/evaluations", headers=headers)
    assert resp.status_code == 200
    valid_ai = [e for e in resp.json() if e["source"] == "ai" and e["scores"]]
    assert valid_ai == [], "降级时不应产生任何有效 AI 评估记录"
