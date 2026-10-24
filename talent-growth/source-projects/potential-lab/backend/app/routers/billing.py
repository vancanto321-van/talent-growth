"""计费：报价、下单、（开发期）模拟支付、权益查询。

正式微信支付的接入点在 services/billing.py 的模块注释里写明了三步。
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import EntitlementOut, OrderOut, PricingItem
from app.services.billing import (
    PRODUCTS,
    active_subscription,
    create_order,
    has_any_valid_order,
    has_entitlement,
    mock_pay,
)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CreateOrderRequest(BaseModel):
    product_code: str = Field(min_length=1, max_length=32)
    scope_id: int | None = None  # 按次商品锁定的对象 id（测评结果/周期）


def _price_label(cents: int, code: str = "") -> str:
    return f"¥{cents / 100:g}" + ("/月" if PRODUCTS.get(code, {}).get("monthly") else "")


def _order_out(order) -> OrderOut:
    return OrderOut(
        id=order.id,
        product_code=order.product_code,
        product_name=PRODUCTS[order.product_code]["name"],
        amount_cents=order.amount_cents,
        status=order.status,
        out_trade_no=order.out_trade_no,
        expires_at=order.expires_at.isoformat() if order.expires_at else None,
        mock_pay_available=settings.allow_mock_pay,
    )


@router.get("/pricing", response_model=list[PricingItem])
def pricing(user: User = Depends(get_current_user)):
    out = []
    for code, meta in PRODUCTS.items():
        cents = getattr(settings, meta["price_attr"])
        out.append(
            PricingItem(
                code=code,
                name=meta["name"],
                price_cents=cents,
                price_label=_price_label(cents, code),
                desc=meta["desc"],
            )
        )
    return out


@router.post("/orders", response_model=OrderOut)
def create(user: User = Depends(get_current_user), body: CreateOrderRequest = None, db: Session = Depends(get_db)):
    if not body or not body.product_code:
        raise HTTPException(status_code=400, detail="缺少 product_code")
    order = create_order(db, user, body.product_code, scope_id=body.scope_id)
    # 正式环境：此处调用微信统一下单，把 prepay_id 组装成 pay_params 返回。
    return _order_out(order)


@router.post("/orders/{order_id}/mock-pay", response_model=OrderOut)
def pay(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _order_out(mock_pay(db, user, order_id))


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """用户取消未支付订单（失败态的一种；已支付订单不可取消）。"""
    from app.models import Order as OrderModel

    order = db.get(OrderModel, order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status_code=404, detail="订单不存在")
    if order.status == "paid":
        raise HTTPException(status_code=400, detail="已支付订单不能取消")
    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return _order_out(order)


@router.post("/orders/{order_id}/refund", response_model=OrderOut)
def refund(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """退款撤销（开发期模拟入口；正式环境由微信退款回调驱动同一状态迁移）。"""
    from app.services.billing import refund_order

    return _order_out(refund_order(db, user, order_id))


@router.get("/orders", response_model=list[OrderOut])
def list_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models import Order as OrderModel

    rows = (
        db.query(OrderModel)
        .filter(OrderModel.user_id == user.id)
        .order_by(OrderModel.created_at.desc())
        .all()
    )
    return [_order_out(o) for o in rows]


@router.post("/wechat-notify")
def wechat_notify(db: Session = Depends(get_db)):
    """微信支付回调桩。

    生产实现要求（docs/compliance.md 第 6c 节）：
    1. 验签（平台证书/APIv3 密钥）→ 2. 解密 resource → 3. 按 out_trade_no 幂等更新订单 →
    4. 返回 {"code":"SUCCESS"}。未配置商户号前固定返回 501，绝不假装成功。
    """
    raise HTTPException(
        status_code=501,
        detail="微信支付回调未启用：需商户号与 APIv3 凭据后按 docs/compliance.md 第 6c 节实现",
    )


@router.get("/me", response_model=EntitlementOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = active_subscription(db, user)
    return EntitlementOut(
        child_assessment_unlocked=has_any_valid_order(db, user, "child_assessment"),
        subscription_active_until=sub.expires_at.isoformat() if sub else None,
        cycle_report_unlocked=has_any_valid_order(db, user, "cycle_report"),
    )
