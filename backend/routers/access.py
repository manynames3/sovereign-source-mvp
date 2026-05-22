from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AccessRequest
from backend.schemas import AccessRequestCreate, AccessRequestResponse
from backend.services.audit import record_audit

router = APIRouter(prefix="/access", tags=["access"])


@router.post("/request", response_model=AccessRequestResponse)
def request_access(payload: AccessRequestCreate, db: Session = Depends(get_db)) -> AccessRequestResponse:
    if not payload.consent_to_contact:
        raise HTTPException(status_code=400, detail="consent_to_contact must be true.")

    access_request = AccessRequest(
        name=payload.name,
        email=payload.email,
        company=payload.company,
        role=payload.role,
        use_case=payload.use_case,
        estimated_monthly_rfqs=payload.estimated_monthly_rfqs,
        notes=payload.notes,
        consent_to_contact=payload.consent_to_contact,
        status="new",
    )
    db.add(access_request)
    db.flush()
    record_audit(
        db,
        entity_type="access_request",
        entity_id=access_request.id,
        action="access_request_submitted",
        metadata={
            "company": access_request.company,
            "email": access_request.email,
            "role": access_request.role,
            "estimated_monthly_rfqs": access_request.estimated_monthly_rfqs,
        },
    )
    db.commit()
    db.refresh(access_request)

    return AccessRequestResponse(
        request_id=access_request.id,
        status=access_request.status,
        company=access_request.company,
        email=access_request.email,
        next_step="We will review the request and confirm the right demo or pilot path before enabling production data access.",
    )
