from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Order, Payment
from backend.schemas import MockPaymentConfirmRequest, PaymentConfirmResponse, PaymentSessionResponse
from backend.services.audit import record_audit
from backend.services.payment_provider import MockPaymentProvider

router = APIRouter(tags=["payments"])


@router.post("/orders/{order_id}/payment-session", response_model=PaymentSessionResponse)
def create_payment_session(order_id: str, db: Session = Depends(get_db)) -> PaymentSessionResponse:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.status != "payment_pending":
        raise HTTPException(status_code=400, detail="Order is not payment_pending.")
    final_quote = order.final_quote
    if final_quote.payment_required_type == "deposit":
        amount_due = float(final_quote.deposit_amount or 0)
    else:
        amount_due = float(final_quote.final_price)
    if amount_due <= 0:
        raise HTTPException(status_code=400, detail="Amount due is invalid.")

    payment = Payment(
        order_id=order.id,
        final_quote_id=final_quote.id,
        amount_due=amount_due,
        payment_type=final_quote.payment_required_type,
        payment_url="pending",
    )
    db.add(payment)
    db.flush()
    provider_session = MockPaymentProvider().create_session(
        payment_session_id=payment.id,
        amount_due=amount_due,
        payment_type=payment.payment_type,
    )
    payment.payment_url = provider_session.payment_url
    payment.status = provider_session.status
    order.payment_status = "payment_pending"
    order.rfq.status = "payment_pending"
    record_audit(
        db,
        entity_type="payment",
        entity_id=payment.id,
        action="payment_session_created",
        metadata={"order_id": order.id, "amount_due": amount_due, "payment_type": payment.payment_type},
    )
    db.commit()
    db.refresh(payment)
    return PaymentSessionResponse(
        payment_session_id=payment.id,
        payment_url=payment.payment_url,
        amount_due=payment.amount_due,
        payment_type=payment.payment_type,
        status=payment.status,
    )


@router.post("/payments/mock-confirm", response_model=PaymentConfirmResponse)
def confirm_mock_payment(payload: MockPaymentConfirmRequest, db: Session = Depends(get_db)) -> PaymentConfirmResponse:
    payment = db.get(Payment, payload.payment_session_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment session not found.")
    order = payment.order

    if payload.payment_status == "paid":
        payment.status = "paid"
        order.amount_paid = payment.amount_due
        order.balance_due = max(order.final_quote.final_price - payment.amount_due, 0)
        order.payment_status = "paid"
        order.status = "paid"
        order.production_status = "order_ready"
        order.rfq.status = "paid"
    else:
        payment.status = "failed"
        order.payment_status = "failed"
        order.status = "payment_pending"

    record_audit(
        db,
        entity_type="payment",
        entity_id=payment.id,
        action="payment_status_updated",
        metadata={"payment_status": payload.payment_status, "order_id": order.id},
    )
    db.commit()
    db.refresh(payment)
    return PaymentConfirmResponse(
        payment_session_id=payment.id,
        order_id=order.id,
        payment_status=payment.status,
        order_status=order.status,
        rfq_status=order.rfq.status,
        amount_paid=order.amount_paid,
        balance_due=order.balance_due,
    )
