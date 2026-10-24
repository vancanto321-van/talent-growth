"""计费：订单创建 + 权益检查。

开发期用 mock 支付（allow_mock_pay=True 时，直接把订单标记为已支付）。
正式上线对接微信支付（JSAPI）的接入点：
  1) create_order → 调微信「统一下单」拿到 prepay_id，把 pay_params 返回给前端 wx.requestPayment；
  2) 新增 /api/billing/wechat-notify 回调接口，验签后把订单置为 paid；
  3) 关闭 allow_mock_pay。商户号/证书/回调域名要求见 docs/compliance.md。
"""

import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, User
from app.utils import utcnow


def is_minor(user: User) -> bool:
    """age_band 标记为未成年的用户（取值约定见 models.User.age_band 注释）。"""
    return "未成年" in (user.age_band or "")


def check_minor_pay_limit(db: Session, user: User, incoming_cents: int) -> None:
    """未成年人付费上限（compliance.md 6b）：下单即校验，超限拒绝。

    统计口径：本自然日 / 本自然月内该用户全部已支付订单金额 + 本次订单金额。
    上限可在 config（minor_daily/monthly_pay_limit_cents）或 .env 调整。
    """
    if not is_minor(user):
        return
    now = utcnow()
    paid_rows = (
        db.query(Order)
        .filter(
            Order.user_id == user.id,
            Order.status == "paid",
            Order.paid_at.isnot(None),
        )
        .all()
    )
    day_spent = sum(
        o.amount_cents for o in paid_rows if o.paid_at.date() == now.date()
    )
    month_spent = sum(
        o.amount_cents
        for o in paid_rows
        if o.paid_at.year == now.year and o.paid_at.month == now.month
    )
    daily_limit = settings.minor_daily_pay_limit_cents
    monthly_limit = settings.minor_monthly_pay_limit_cents
    if day_spent + incoming_cents > daily_limit:
        raise HTTPException(
            status_code=403,
            detail=(
                f"未成年人单日付费上限为 ¥{daily_limit / 100:g}，今日已付 ¥{day_spent / 100:g}，"
                f"本次需 ¥{incoming_cents / 100:g}。付费须由监护人操作。"
            ),
        )
    if month_spent + incoming_cents > monthly_limit:
        raise HTTPException(
            status_code=403,
            detail=(
                f"未成年人单月付费上限为 ¥{monthly_limit / 100:g}，本月已付 ¥{month_spent / 100:g}，"
                f"本次需 ¥{incoming_cents / 100:g}。付费须由监护人操作。"
            ),
        )

PRODUCTS = {
    "child_assessment": {
        "name": "儿童完整测评报告",
        "price_attr": "price_child_assessment_cents",
        "monthly": False,
        "scoped": True,  # scope_id = 测评结果 id：一次购买只解锁那一份报告
        "desc": "8 维度完整得分 + 类型深度解读 + 学习态度建议（按次）",
    },
    "child_plan_monthly": {
        "name": "儿童月度培养方案",
        "price_attr": "price_child_plan_monthly_cents",
        "monthly": True,
        "scoped": False,  # 订阅期内全局有效
        "desc": "按月解锁全部 8 个类型的 4 周培养计划（每月更新主题）",
    },
    "cycle_report": {
        "name": "结业深度报告",
        "price_attr": "price_cycle_report_cents",
        "monthly": False,
        "scoped": True,  # scope_id = 周期 id：一次购买只解锁那个周期的报告
        "desc": "解锁指定周期的 4 周结业深度报告（判定依据/未验证清单/下期计划）",
    },
}


def price_of(product_code: str) -> int:
    if product_code not in PRODUCTS:
        raise HTTPException(status_code=404, detail="未知商品")
    return getattr(settings, PRODUCTS[product_code]["price_attr"])


def create_order(db: Session, user: User, product_code: str, scope_id: int | None = None) -> Order:
    # 按次商品：scope 对象必须存在且属于本人（防白花钱/错绑他人对象）
    if PRODUCTS.get(product_code, {}).get("scoped"):
        if scope_id is None:
            raise HTTPException(status_code=400, detail="该商品需要指定解锁对象（scope_id）")
        if product_code == "child_assessment":
            from app.models import ChildAssessmentResult

            target = db.get(ChildAssessmentResult, scope_id)
            ok = target is not None and target.user_id == user.id
        elif product_code == "cycle_report":
            from app.models import ExplorationCycle

            target = db.get(ExplorationCycle, scope_id)
            ok = target is not None and target.user_id == user.id
        else:
            ok = False
        if not ok:
            raise HTTPException(status_code=404, detail="解锁对象不存在或不属于当前用户")
    check_minor_pay_limit(db, user, price_of(product_code))
    order = Order(
        user_id=user.id,
        product_code=product_code,
        scope_id=scope_id,
        amount_cents=price_of(product_code),
        out_trade_no=f"PL{utcnow().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8].upper()}",
        created_at=utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def mock_pay(db: Session, user: User, order_id: int) -> Order:
    """开发/演示用模拟支付。上线前设置 ALLOW_MOCK_PAY=false 关闭。"""
    if not settings.allow_mock_pay:
        raise HTTPException(status_code=403, detail="模拟支付已关闭，请走微信支付")
    order = db.get(Order, order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status == "paid":
        return order  # 幂等：重复通知不重复结算
    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="订单已取消，请重新下单")
    if order.status == "refunded":
        raise HTTPException(status_code=400, detail="已退款订单不可再次支付")
    # 支付落地前最后一道闸：同日多次下单再挨个支付可能累计超限（下单时无法预知）
    check_minor_pay_limit(db, user, order.amount_cents)
    now = utcnow()
    order.status = "paid"
    order.paid_at = now
    if PRODUCTS[order.product_code]["monthly"]:
        order.expires_at = now + timedelta(days=31)
    db.commit()
    db.refresh(order)
    return order


def refund_order(db: Session, user: User, order_id: int) -> Order:
    """退款撤销：已支付订单立即失去权益（月订阅 expires_at 置为当前，按次单标记 refunded）。

    开发/演示用模拟退款入口；正式环境由微信退款回调调用同一状态迁移。
    """
    order = db.get(Order, order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status != "paid":
        raise HTTPException(status_code=400, detail="仅已支付订单可退款")
    order.status = "refunded"
    if PRODUCTS[order.product_code]["monthly"]:
        order.expires_at = utcnow()  # 立即失效
    db.commit()
    db.refresh(order)
    return order


def has_entitlement(db: Session, user: User, product_code: str, scope_id: int | None = None) -> bool:
    """权益检查。按次（scoped）商品必须命中同一 scope——买一份只解锁一份，
    不会意外解锁历史或未来对象。"""
    now = utcnow()
    q = db.query(Order).filter(
        Order.user_id == user.id,
        Order.product_code == product_code,
        Order.status == "paid",
    )
    rows = q.all()
    if PRODUCTS.get(product_code, {}).get("scoped"):
        rows = [o for o in rows if o.scope_id is not None and o.scope_id == scope_id]
    return any(o.expires_at is None or o.expires_at > now for o in rows)


def has_any_valid_order(db: Session, user: User, product_code: str) -> bool:
    """是否存在任一有效（已支付、未过期）的该商品订单——不限定 scope。"""
    now = utcnow()
    rows = (
        db.query(Order)
        .filter(
            Order.user_id == user.id,
            Order.product_code == product_code,
            Order.status == "paid",
        )
        .all()
    )
    return any(o.expires_at is None or o.expires_at > now for o in rows)


def active_subscription(db: Session, user: User) -> Order | None:
    now = utcnow()
    rows = (
        db.query(Order)
        .filter(
            Order.user_id == user.id,
            Order.product_code == "child_plan_monthly",
            Order.status == "paid",
        )
        .order_by(Order.expires_at.desc())
        .all()
    )
    return next((o for o in rows if o.expires_at and o.expires_at > now), None)
