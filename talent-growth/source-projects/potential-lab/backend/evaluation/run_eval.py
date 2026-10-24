"""AI 评价质量评估运行器：对固定样本集跑批、逐条输出结果、汇总通过/N-A/失败。

用法：
    cd backend && uv run python -m evaluation.run_eval            # 默认只跑 dev 集
    cd backend && uv run python -m evaluation.run_eval --holdout  # 只跑留出集
    cd backend && uv run python -m evaluation.run_eval --all      # dev + holdout 全跑

行为：
- 默认只跑 dev 集。留出集（holdout）默认不跑、不用于调规则，防止针对样本过拟合；
- 每条评估记录：耗时（ms）、adapter.model_tag、prompt_version；
  真实适配器（GLM）若返回 usage 则记录 token 数并按价目常量估算成本；
- 方差检验：normal 样本用真实适配器连跑 3 次，各维度分极差 ≤1 视为一致；
  Mock 是确定性的（极差恒 0），直接通过并标注「确定性」；
- 语义类分级（off_topic / flowery_empty / contradictory / ai_declared）：
  Mock 下记 N/A（Mock 无语义判别），真实适配器下必须执行 strict 检查；
- 汇总输出 通过/N-A/失败 计数；退出码 = 失败数 > 0 时为 1。
- N/A（Mock 无语义判别）不计入通过：Mock 汇总会显式输出「真实模型质量结论：未验证」。

注意：Mock 结果只证明流程与口径正确，不代表真实大模型效果。
"""

import argparse
import os
import sys
import time
from dataclasses import dataclass, field

from app.config import Settings
from app.content_loader import task_templates
from app.services.ai.mock import MockAdapter

from evaluation.checks import (
    avg_score,
    check_determinism,
    check_semantic_strict,
    check_variance,
    run_all_checks,
)
from evaluation.samples import SEMANTIC_CATEGORIES, samples_by_set

LINE = "-" * 72

# GLM 价目表（人民币 / 每百万 token），仅用于评估成本的粗略估算。
# 需按智谱最新定价更新：https://open.bigmodel.cn/pricing
GLM_PRICE_PER_MTOK = {
    "default": {"input": 2.0, "output": 8.0},  # 未知模型的保守兜底价
    "glm-4-flash": {"input": 0.0, "output": 0.0},
    "glm-4.5-flash": {"input": 0.0, "output": 0.0},
    "glm-4.5-air": {"input": 0.8, "output": 2.0},
    "glm-4.5": {"input": 4.0, "output": 16.0},
    "glm-4-plus": {"input": 5.0, "output": 20.0},
}

# normal 样本的方差检验连跑次数（仅真实适配器；Mock 确定性直接通过）
VARIANCE_RUNS = 3


@dataclass
class RunStats:
    """一次跑批的汇总：通过 / N-A / 失败 计数与累计开销。"""

    passed: int = 0
    na: int = 0
    failed: int = 0
    elapsed_ms: float = 0.0
    tokens: int = 0
    cost_cny: float = 0.0
    evaluated_ids: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.passed + self.na + self.failed


def estimate_cost_cny(model_tag: str, usage: dict) -> float | None:
    """按价目常量估算一次调用的成本（元）；模型不在表内时用兜底价。"""
    model = str(model_tag).split(":", 1)[-1]
    price = GLM_PRICE_PER_MTOK.get(model) or GLM_PRICE_PER_MTOK["default"]
    prompt = usage.get("prompt_tokens") or 0
    completion = usage.get("completion_tokens") or 0
    return round(prompt / 1e6 * price["input"] + completion / 1e6 * price["output"], 6)


def extract_usage(adapter, result) -> dict | None:
    """真实适配器若返回 usage 则取出（dict，含 prompt_tokens/completion_tokens）。

    预留接口：GLMAdapter 目前不透出 usage（结果 schema 无此字段），
    待 app/ 侧接入后此处即可直接生效，无需改运行器。
    """
    for candidate in (getattr(adapter, "last_usage", None), getattr(result, "usage", None)):
        if isinstance(candidate, dict) and (
            "prompt_tokens" in candidate or "total_tokens" in candidate
        ):
            return candidate
    return None


def _short(text: str, limit: int = 42) -> str:
    text = "".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"


def run_adapter(adapter, samples, templates: dict, verbose: bool = True) -> RunStats:
    """对样本集跑一个适配器，返回 RunStats（含逐条打印）。"""
    stats = RunStats()
    total = len(samples)
    model_tag = getattr(adapter, "model_tag", "?")
    is_mock = model_tag == "mock"

    for idx, sample in enumerate(samples, 1):
        template = templates[sample.template_code]
        t0 = time.perf_counter()
        try:
            result = adapter.evaluate_submission(template, sample.text, "independent")
        except Exception as e:  # AIError/网络/校验错误，真实模型可能抛出，逐条兜底
            stats.failed += 1
            stats.evaluated_ids.append(sample.id)
            print(f"[{idx}/{total}] {sample.id} [{sample.category}]  评估异常：{e}")
            print("      ✗ 全部检查未执行（评估器抛错）")
            continue
        elapsed_ms = (time.perf_counter() - t0) * 1000
        stats.elapsed_ms += elapsed_ms
        stats.evaluated_ids.append(sample.id)

        checks = run_all_checks(sample, result, template)
        na_checks: list[str] = []
        notes: list[str] = []

        # 方差检验：normal 样本。真实适配器连跑 3 次比各维度分极差（≤1 通过）；
        # Mock 确定性（极差恒 0），不重复跑，直接通过并标注。
        if sample.category == "normal":
            if is_mock:
                checks["分数方差"] = []
                notes.append("方差：确定性（Mock 极差恒 0），视作通过")
            else:
                repeats = [result] + [
                    adapter.evaluate_submission(template, sample.text, "independent")
                    for _ in range(VARIANCE_RUNS - 1)
                ]
                checks[f"分数方差（{VARIANCE_RUNS} 次极差≤1）"] = check_variance(repeats)

        # 语义类分级：Mock 无语义判别 → N/A；真实适配器必须执行 strict 检查
        if sample.category in SEMANTIC_CATEGORIES:
            if is_mock:
                na_checks.append("语义判别")
            else:
                checks["语义判别（strict）"] = check_semantic_strict(sample.category, result)

        if sample.category == "duplicate":
            # 重复一致性：同一文本再评一次，结果必须一致
            again = adapter.evaluate_submission(template, sample.text, "independent")
            checks["重复一致性"] = check_determinism(result, again)

        usage = extract_usage(adapter, result)

        failures = [f for fs in checks.values() for f in fs]
        if failures:
            stats.failed += 1
        elif na_checks:
            stats.na += 1
        else:
            stats.passed += 1

        print(
            f"[{idx}/{total}] {sample.id} [{sample.category}]  "
            f"均分 {avg_score(result)}  {elapsed_ms:.1f}ms"
        )
        print(f"      文本: {_short(sample.text)}")
        for name, fs in checks.items():
            if not fs:
                print(f"      ✓ {name}")
            else:
                for f in fs:
                    print(f"      ✗ {name}：{f}")
        for name in na_checks:
            print(f"      ⊘ {name}：N/A（Mock 无语义判别；真实模型必须通过 strict 检查）")
        for note in notes:
            print(f"      • {note}")
        if usage is not None:
            prompt = usage.get("prompt_tokens") or 0
            completion = usage.get("completion_tokens") or 0
            cost = estimate_cost_cny(model_tag, usage) or 0.0
            stats.tokens += usage.get("total_tokens") or (prompt + completion)
            stats.cost_cny += cost
            print(
                f"      • usage: {prompt} in / {completion} out tokens，"
                f"估算成本 ≈ ¥{cost:g}（价目常量需按最新定价更新）"
            )
    return stats


def print_summary(label: str, stats: RunStats, is_mock: bool = False) -> None:
    print(LINE)
    print(
        f"{label} 汇总: 通过 {stats.passed} / N-A {stats.na} / 失败 {stats.failed}"
        f"（共 {stats.total} 个样本，评估累计耗时 {stats.elapsed_ms:.0f}ms）"
    )
    if stats.tokens:
        print(
            f"  token 合计 ≈ {stats.tokens}，估算成本合计 ≈ ¥{stats.cost_cny:.4f}"
            "（按价目常量估算，需按最新定价更新）"
        )
    # 质量结论：N/A 不计入通过。Mock 只证明流程；语义类必须由真实模型通过后才算验证。
    if is_mock:
        if stats.failed:
            print(f"  Mock 结论：流程验证未通过（{stats.failed} 项失败）")
        else:
            print(
                f"  Mock 结论：流程与口径验证通过；语义类 {stats.na} 项 N/A。"
                "真实模型质量结论：未验证"
            )
    elif stats.failed:
        print(f"  真实模型结论：未通过（{stats.failed} 项失败）")
    elif stats.na:
        print(f"  真实模型结论：有保留通过（{stats.na} 项语义 N/A 需人工复核）")
    else:
        print("  真实模型结论：通过")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI 评价质量测试集运行器")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--holdout", action="store_true", help="只跑留出集（防过拟合验证，勿用于调规则）"
    )
    group.add_argument("--all", action="store_true", help="dev + holdout 全部运行")
    return parser.parse_args(argv)


def select_samples(args: argparse.Namespace) -> list:
    """默认只跑 dev 集；--holdout 跑留出集；--all 全跑。"""
    if args.holdout:
        return samples_by_set("holdout")
    if args.all:
        return samples_by_set("all")
    return samples_by_set("dev")


def maybe_run_glm(templates: dict, samples: list) -> RunStats | None:
    """配置了 GLM_API_KEY 时追加真实模型评估；未配置则提示并跳过。"""
    print()
    print("GLM 真实模型评估")
    api_key = os.environ.get("GLM_API_KEY", "")
    settings = Settings()
    if not api_key:
        api_key = settings.glm_api_key  # 兼容 .env 配置
    if not api_key:
        print("GLM 未配置，真实模型效果未验证")
        return None
    from app.services.ai.glm import GLMAdapter

    glm = GLMAdapter(Settings(glm_api_key=api_key, ai_provider="glm"))
    print(f"适配器: GLMAdapter model_tag={glm.model_tag} prompt_version={glm.prompt_version}")
    print(LINE)
    stats = run_adapter(glm, samples, templates)
    print_summary("GLM", stats, is_mock=False)
    return stats


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    which = "holdout" if args.holdout else ("all" if args.all else "dev")
    samples = select_samples(args)
    templates = task_templates()
    template = templates["exp_intro_explain"]
    rubric = "、".join(r["dimension"] for r in template["rubric"])

    print("=" * 72)
    print("AI 评价质量测试集（evaluation/samples.py）")
    print(
        f"集合: {which}（{len(samples)} 个样本）"
        f"{'　[留出集：勿用于调规则]' if which == 'holdout' else ''}"
    )
    print(f"覆盖: 6 方向 × intro/advanced 共 12 个 normal 基础位；异常样本挂 exp_intro_explain")
    print(f"锚点模板: exp_intro_explain《{template['title']}》 rubric={rubric}")
    print("=" * 72)

    mock = MockAdapter()
    print(f"适配器: MockAdapter model_tag={mock.model_tag} prompt_version={mock.prompt_version}")
    print(LINE)
    mock_stats = run_adapter(mock, samples, templates)
    print_summary(f"Mock（{which}）", mock_stats, is_mock=True)
    if mock_stats.na:
        print(
            "（N/A 说明：off_topic / flowery_empty / contradictory / ai_declared 属语义类样本，"
            "Mock 无判别能力，记 N/A 而非失败；真实模型必须通过 strict 检查。）"
        )

    exit_code = 1 if mock_stats.failed else 0
    glm_stats = maybe_run_glm(templates, samples)
    if glm_stats is not None and glm_stats.failed:
        exit_code = 1
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
