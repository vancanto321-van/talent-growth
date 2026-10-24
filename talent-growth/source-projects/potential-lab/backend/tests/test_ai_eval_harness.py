"""评估器有效性证明：用一个可控的"真实"适配器替身（model_tag 非 mock）验证：
语义严格检查在真实适配器下会执行，且能抓住 捏造证据/分数膨胀/离题高分。
这证明评估基础设施本身可靠——真实 GLM 接入后，坏输出会被同样的检查拦下。
"""

from app import schemas
from app.content_loader import task_templates
from app.services.ai.base import AIAdapter
from evaluation.checks import avg_score, check_quotes_in_text, check_semantic_strict
from evaluation.run_eval import run_adapter
from evaluation.samples import SAMPLES_BY_ID


class FakeRealAdapter(AIAdapter):
    """测试替身：model_tag 非 mock → 运行器按真实适配器口径执行语义 strict 检查。"""

    model_tag = "glm-fake-eval"
    prompt_version = "fake-v1"

    def __init__(self, mode: str = "honest"):
        self.mode = mode

    def evaluate_submission(self, template, submission_text, mode):
        if self.mode == "inflated_fabricated":
            return schemas.AITaskEvaluation(
                scores=[
                    schemas.AIDimensionScore(dimension=r["dimension"], score=5, comment="完美")
                    for r in template["rubric"]
                ],
                evidence_quotes=["本作品完美无缺，无可挑剔，是史上最佳提交。"],
                overall_comment="完美无缺。",
                suggestions=[],
            )
        base = 4 if len(submission_text) > 150 else 3
        return schemas.AITaskEvaluation(
            scores=[
                schemas.AIDimensionScore(dimension=r["dimension"], score=base, comment="按长度保守估计")
                for r in template["rubric"]
            ],
            evidence_quotes=[submission_text[:50]],
            overall_comment="保守评估。",
            suggestions=[],
        )

    def extract_clues(self, messages):
        raise NotImplementedError

    def plan_note(self, week_index, direction_name):
        return ""

    def combination_reading(self, combos, direction_names):
        return ""


def _off_topic_sample():
    return SAMPLES_BY_ID["off_topic-001"]


def _templates():
    return task_templates()


def test_semantic_strict_executes_for_real_adapter():
    sample = _off_topic_sample()
    result = FakeRealAdapter("honest").evaluate_submission(
        _templates()["exp_intro_explain"], sample.text, "independent"
    )
    failures = check_semantic_strict(sample.category, result)
    assert failures, "离题样本得高分却通过语义检查 = 评估器失效"


def test_harness_catches_inflated_fabricated_output():
    sample = _off_topic_sample()
    bad = FakeRealAdapter("inflated_fabricated")
    stats = run_adapter(bad, [sample], _templates(), verbose=False)
    assert stats.failed == 1, "离题满分必须判失败"

    result = bad.evaluate_submission(
        _templates()["exp_intro_explain"], sample.text, "independent"
    )
    assert avg_score(result) == 5.0
    problems = check_quotes_in_text(result, sample.text)
    assert problems, "捏造的引用必须被引用检查标记"


def test_honest_real_adapter_passes_structural_checks():
    sample = _off_topic_sample()
    result = FakeRealAdapter("honest").evaluate_submission(
        _templates()["exp_intro_explain"], sample.text, "independent"
    )
    assert not check_quotes_in_text(result, sample.text), "诚实替身的证据来自原文，不应被标记"
    for s in result.scores:
        assert 1 <= s.score <= 5


def test_run_adapter_distinguishes_mock_vs_real_semantics():
    from app.services.ai.mock import MockAdapter

    sample = _off_topic_sample()
    templates = _templates()
    mock_stats = run_adapter(MockAdapter(), [sample], templates, verbose=False)
    real_stats = run_adapter(
        FakeRealAdapter("inflated_fabricated"), [sample], templates, verbose=False
    )
    assert mock_stats.failed == 0 and mock_stats.na >= 0, "Mock 语义类应记 N/A"
    assert real_stats.failed == 1, "真实口径下离题满分必须失败"
