from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import BudgetaryEstimate, RFQ
from backend.routers.quote import estimate_to_response
from backend.schemas import RFQSubmitRequest, RFQSummary
from backend.services.audit import record_audit

router = APIRouter(prefix="/rfq", tags=["rfq"])


@router.post("/submit", response_model=RFQSummary)
def submit_rfq(payload: RFQSubmitRequest, db: Session = Depends(get_db)) -> RFQSummary:
    estimate = db.get(BudgetaryEstimate, payload.quote_id)
    if not estimate:
        raise HTTPException(status_code=404, detail="quote_id was not found.")
    if not payload.consent_to_review:
        raise HTTPException(status_code=400, detail="consent_to_review must be true.")

    snapshot = estimate_to_response(estimate).model_dump()
    rfq = RFQ(
        quote_id=estimate.id,
        customer_name=payload.customer_name,
        email=payload.email,
        phone=payload.phone,
        company=payload.company,
        customer_notes=payload.notes,
        consent_to_review=payload.consent_to_review,
        status="needs_review",
        original_estimate_snapshot=snapshot,
        review_required=estimate.review_required,
    )
    db.add(rfq)
    db.flush()
    record_audit(
        db,
        entity_type="rfq",
        entity_id=rfq.id,
        action="rfq_submitted",
        metadata={"quote_id": estimate.id, "customer_email": payload.email},
    )
    db.commit()
    db.refresh(rfq)
    return RFQSummary(
        rfq_id=rfq.id,
        quote_id=rfq.quote_id,
        status=rfq.status,
        customer_name=rfq.customer_name,
        email=rfq.email,
        company=rfq.company,
        review_required=bool(rfq.review_required),
        next_step="Admin manufacturability review is required before final quote.",
    )
