from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import FinalQuote, RFQ
from backend.schemas import AdminReviewRequest, AdminReviewResponse, FinalQuoteCreateRequest, FinalQuoteResponse
from backend.services.audit import record_audit

router = APIRouter(prefix="/admin/rfq", tags=["admin"])


@router.patch("/{rfq_id}/review", response_model=AdminReviewResponse)
def update_review(rfq_id: str, payload: AdminReviewRequest, db: Session = Depends(get_db)) -> AdminReviewResponse:
    rfq = db.get(RFQ, rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found.")
    rfq.status = payload.status
    rfq.internal_notes = payload.internal_notes
    rfq.reviewed_by = payload.reviewed_by
    rfq.manufacturability_notes = payload.manufacturability_notes
    rfq.recommended_process = payload.recommended_process
    rfq.required_changes = payload.required_changes
    if payload.review_required is not None:
        rfq.review_required = payload.review_required
    if payload.status == "rejected":
        rfq.rejection_reason = payload.manufacturability_notes or payload.internal_notes

    record_audit(
        db,
        entity_type="rfq",
        entity_id=rfq.id,
        action="admin_review_updated",
        metadata=payload.model_dump(),
    )
    db.commit()
    db.refresh(rfq)
    return AdminReviewResponse(
        rfq_id=rfq.id,
        status=rfq.status,
        internal_notes=rfq.internal_notes,
        manufacturability_notes=rfq.manufacturability_notes,
        recommended_process=rfq.recommended_process,
        required_changes=rfq.required_changes,
        review_required=rfq.review_required,
    )


@router.post("/{rfq_id}/final-quote", response_model=FinalQuoteResponse)
def create_final_quote(
    rfq_id: str,
    payload: FinalQuoteCreateRequest,
    db: Session = Depends(get_db),
) -> FinalQuoteResponse:
    rfq = db.get(RFQ, rfq_id)
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found.")
    if rfq.status != "ready_for_final_quote":
        raise HTTPException(status_code=400, detail="RFQ must be ready_for_final_quote before final quote creation.")
    _validate_final_quote(payload)

    final_quote = FinalQuote(
        rfq_id=rfq.id,
        final_price=payload.final_price,
        final_lead_time_days=payload.final_lead_time_days,
        final_process_type=payload.final_process_type,
        final_material=payload.final_material,
        final_finish=payload.final_finish,
        quote_expiration_date=payload.quote_expiration_date,
        production_notes=payload.production_notes,
        payment_required_type=payload.payment_required_type,
        deposit_amount=payload.deposit_amount,
    )
    rfq.status = "quoted"
    db.add(final_quote)
    db.flush()
    record_audit(
        db,
        entity_type="final_quote",
        entity_id=final_quote.id,
        action="final_quote_created",
        metadata={"rfq_id": rfq.id, "final_price": payload.final_price},
    )
    db.commit()
    db.refresh(final_quote)
    return final_quote_to_response(final_quote)


def final_quote_to_response(final_quote: FinalQuote) -> FinalQuoteResponse:
    return FinalQuoteResponse(
        final_quote_id=final_quote.id,
        rfq_id=final_quote.rfq_id,
        status=final_quote.status,
        final_price=final_quote.final_price,
        final_lead_time_days=final_quote.final_lead_time_days,
        final_process_type=final_quote.final_process_type,
        final_material=final_quote.final_material,
        final_finish=final_quote.final_finish,
        quote_expiration_date=final_quote.quote_expiration_date,
        production_notes=final_quote.production_notes,
        payment_required_type=final_quote.payment_required_type,
        deposit_amount=final_quote.deposit_amount,
    )


def _validate_final_quote(payload: FinalQuoteCreateRequest) -> None:
    if payload.final_price <= 0:
        raise HTTPException(status_code=400, detail="final_price must be greater than zero.")
    if payload.final_lead_time_days <= 0:
        raise HTTPException(status_code=400, detail="final_lead_time_days must be greater than zero.")
    try:
        expiration = date.fromisoformat(payload.quote_expiration_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="quote_expiration_date must be YYYY-MM-DD.") from exc
    if expiration <= date.today():
        raise HTTPException(status_code=400, detail="quote_expiration_date must be in the future.")
    if payload.payment_required_type == "deposit":
        if payload.deposit_amount is None or payload.deposit_amount <= 0:
            raise HTTPException(status_code=400, detail="deposit_amount is required for deposit payment.")
        if payload.deposit_amount > payload.final_price:
            raise HTTPException(status_code=400, detail="deposit_amount cannot exceed final_price.")
