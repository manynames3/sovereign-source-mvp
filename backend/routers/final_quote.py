from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import FinalQuote, Order
from backend.routers.admin import final_quote_to_response
from backend.schemas import FinalQuoteApprovalResponse, FinalQuoteCustomerResponse, FinalQuoteRejectRequest, FinalQuoteResponse
from backend.services.audit import record_audit

router = APIRouter(prefix="/quote/final", tags=["final_quote"])


@router.get("/{final_quote_id}", response_model=FinalQuoteCustomerResponse)
def get_final_quote(final_quote_id: str, db: Session = Depends(get_db)) -> FinalQuoteCustomerResponse:
    final_quote = db.get(FinalQuote, final_quote_id)
    if not final_quote:
        raise HTTPException(status_code=404, detail="Final quote not found.")
    response = final_quote_to_response(final_quote).model_dump()
    return FinalQuoteCustomerResponse(
        **response,
        original_quote_id=final_quote.rfq.quote_id,
        customer_name=final_quote.rfq.customer_name,
        company=final_quote.rfq.company,
    )


@router.post("/{final_quote_id}/approve", response_model=FinalQuoteApprovalResponse)
def approve_final_quote(final_quote_id: str, db: Session = Depends(get_db)) -> FinalQuoteApprovalResponse:
    final_quote = db.get(FinalQuote, final_quote_id)
    if not final_quote:
        raise HTTPException(status_code=404, detail="Final quote not found.")
    if final_quote.status not in {"pending_customer_approval", "rejected"}:
        raise HTTPException(status_code=400, detail="Final quote cannot be approved from current status.")

    rfq = final_quote.rfq
    final_quote.status = "approved"
    rfq.status = "approved"
    existing_order = next((order for order in final_quote.orders), None)
    if existing_order:
        order = existing_order
    else:
        order = Order(
            rfq_id=rfq.id,
            final_quote_id=final_quote.id,
            customer_snapshot={
                "customer_name": rfq.customer_name,
                "email": rfq.email,
                "phone": rfq.phone,
                "company": rfq.company,
            },
            status="payment_pending",
            amount_paid=0,
            balance_due=final_quote.final_price,
            payment_status="unpaid",
            production_status="not_started",
            file_metadata=rfq.original_estimate_snapshot["file"],
            material=final_quote.final_material,
            process_type=final_quote.final_process_type,
            quantity=rfq.original_estimate_snapshot["inputs"]["quantity"],
            final_lead_time_days=final_quote.final_lead_time_days,
            production_notes=final_quote.production_notes,
        )
        db.add(order)
        db.flush()
    record_audit(
        db,
        entity_type="final_quote",
        entity_id=final_quote.id,
        action="final_quote_approved",
        metadata={"rfq_id": rfq.id, "order_id": order.id},
    )
    db.commit()
    db.refresh(order)
    return FinalQuoteApprovalResponse(
        final_quote_id=final_quote.id,
        rfq_id=rfq.id,
        order_id=order.id,
        status=final_quote.status,
        payment_required=True,
    )


@router.post("/{final_quote_id}/reject", response_model=FinalQuoteResponse)
def reject_final_quote(
    final_quote_id: str,
    payload: FinalQuoteRejectRequest,
    db: Session = Depends(get_db),
) -> FinalQuoteResponse:
    final_quote = db.get(FinalQuote, final_quote_id)
    if not final_quote:
        raise HTTPException(status_code=404, detail="Final quote not found.")
    final_quote.status = "rejected"
    final_quote.rejection_reason = payload.rejection_reason
    final_quote.rfq.status = "rejected"
    final_quote.rfq.rejection_reason = payload.rejection_reason
    record_audit(
        db,
        entity_type="final_quote",
        entity_id=final_quote.id,
        action="final_quote_rejected",
        metadata={"reason": payload.rejection_reason},
    )
    db.commit()
    db.refresh(final_quote)
    return final_quote_to_response(final_quote)
