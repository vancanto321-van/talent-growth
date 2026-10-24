"""AI 评价质量评估工具：固定样本集 + 质量断言 + 运行器。

- samples.py：可复现的质量测试集（6 方向 × intro/advanced 共 12 个 normal 基础位
  + 14 类异常样本；dev/holdout 留出集划分）；
- checks.py：质量断言函数（运行器与 pytest 共用），含方差检验与语义类 strict 口径；
- run_eval.py：`uv run python -m evaluation.run_eval` 一键跑批（默认 dev 集，
  --holdout 跑留出集，--all 全跑），退出码 = 失败数 > 0 时为 1。

注意：Mock 结果只证明流程与口径正确，不代表真实大模型效果。
"""
