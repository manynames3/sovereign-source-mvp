from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Order
from backend.schemas import OrderResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: str, db: Session = Depends(get_db)) -> OrderResponse:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order_to_response(order)


def order_to_response(order: Order) -> OrderResponse:
    return OrderResponse(
        order_id=order.id,
        rfq_id=order.rfq_id,
        final_quote_id=order.final_quote_id,
        status=order.status,
        amount_paid=order.amount_paid,
        balance_due=order.balance_due,
        payment_status=order.payment_status,
        production_status=order.production_status,
        file_metadata=order.file_metadata,
        material=order.material,
        process_type=order.process_type,
        quantity=order.quantity,
        final_lead_time_days=order.final_lead_time_days,
        production_notes=order.production_notes,
    )
