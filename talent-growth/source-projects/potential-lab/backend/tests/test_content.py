"""种子内容完整性：code 唯一、外键有效、阶段齐全、每道题都有出题理由。"""

from app.content_loader import item_rationales, validate_all
from app.content_loader import assessment as load_assessment
from app.content_loader import child_assessment as load_child
from app.content_loader import interview as load_interview
from app.content_loader import methodology as load_methodology


def test_content_valid():
    validate_all()  # 不抛异常即通过


def test_every_item_has_rationale():
    rationales = item_rationales()
    for q in load_interview()["questions"]:
        assert rationales["interview"].get(q["code"]), f"访谈题 {q['code']} 缺少出题理由"
    for it in load_assessment()["items"]:
        assert rationales["assessment"].get(it["code"]), f"测评题 {it['code']} 缺少出题理由"
    for form in ("parent", "self"):
        for it in load_child()["items"][form]:
            assert rationales["child"][form].get(it["code"]), f"儿童题 {it['code']} 缺少出题理由"


def test_methodology_content():
    data = load_methodology()
    assert len(data["sections"]) >= 5
    assert len(data["references"]) >= 10
    # 参考文献必须包含关键理论源
    joined = " ".join(data["references"])
    for keyword in ("McClelland", "Holland", "Gardner", "Duckworth", "Dweck", "Macnamara"):
        assert keyword in joined, f"参考文献缺少 {keyword}"
    # 学习方法论两节（HowToLiveBetter 借鉴，见 docs/research-notes.md 第 6 条）
    ids = [s["id"] for s in data["sections"]]
    assert "practice" in ids and "entry" in ids, "方法论缺 practice/entry 章节"
    joined_sections = " ".join(b["body"] for s in data["sections"] for b in s["blocks"])
    for keyword in ("Pashler", "Dunlosky", "Cepeda", "Brunmair", "Pan & Rickard"):
        assert keyword in joined_sections, f"练习方法论缺 {keyword} 引用"
    # 科学边界必须保留「不做学习风格测评」声明（合规红线）
    cannot = " ".join(data["science_boundary"]["cannot_show"])
    assert "学习风格" in cannot, "科学边界缺学习风格声明"
    # CC BY 出处署名（借鉴来源披露）
    assert "CC BY 4.0" in joined and "HowToLiveBetter" in joined, "参考文献缺 CC BY 出处"
