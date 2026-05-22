from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import BudgetaryEstimate
from backend.schemas import EstimateResponse
from backend.services.audit import record_audit
from backend.services.geometry import analyze_geometry
from backend.services.materials import get_material
from backend.services.pricing import PricingInput, estimate_price
from backend.services.review_rules import evaluate_review_required
from backend.services.storage import LocalStorage

router = APIRouter(prefix="/quote", tags=["quote"])

ALLOWED_PROCESS_TYPES = {"laser_cutting", "waterjet_cutting", "sheet_metal_bending", "cnc_milling"}
ALLOWED_TOLERANCES = {"standard", "tight", "critical"}
ALLOWED_FINISHES = {"none", "deburred", "brushed", "anodized", "powder_coated", "passivated", "custom"}
THICKNESS_REQUIRED = {"laser_cutting", "waterjet_cutting", "sheet_metal_bending"}
DISCLAIMER = (
    "This is a budgetary estimate only. Final price, lead time, and manufacturability must be confirmed before production."
)
NEXT_STEP = "Submit RFQ for manufacturability review and final quote."


@router.post("/metal", response_model=EstimateResponse)
async def create_metal_estimate(
    file: UploadFile = File(...),
    process_type: str = Form(...),
    material: str = Form(...),
    thickness_mm: float | None = Form(default=None),
    quantity: int = Form(...),
    finish: str = Form(...),
    tolerance: str = Form(...),
    shipping_zip: str | None = Form(default=None),
    target_delivery_date: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> EstimateResponse:
    _validate_inputs(process_type, material, thickness_mm, quantity, finish, tolerance)
    material_spec = get_material(material)
    stored_file = await LocalStorage().save(file)
    geometry_status, geometry = analyze_geometry(
        stored_file.path,
        stored_file.extension,
        material_spec,
        thickness_mm,
    )
    pricing = estimate_price(
        PricingInput(
            process_type=process_type,
            material=material_spec,
            thickness_mm=thickness_mm,
            quantity=quantity,
            finish=finish,
            tolerance=tolerance,
            geometry=geometry,
        ),
    )
    review_required, review_reasons = evaluate_review_required(
        file_extension=stored_file.extension,
        geometry_status=geometry_status,
        geometry=geometry,
        material=material_spec,
        process_type=process_type,
        tolerance=tolerance,
        finish=finish,
        quantity=quantity,
        estimated_high=pricing.price_high,
        notes=notes,
    )
    file_metadata = {
        "name": stored_file.original_name,
        "type": stored_file.extension,
        "valid": True,
        "geometry_status": geometry_status,
        "storage_key": stored_file.storage_key,
        "size_bytes": stored_file.size_bytes,
        "checksum": stored_file.checksum,
    }
    inputs_snapshot = {
        "material": material,
        "thickness_mm": thickness_mm,
        "quantity": quantity,
        "finish": finish,
        "tolerance": tolerance,
        "shipping_zip": shipping_zip,
        "target_delivery_date": target_delivery_date,
    }
    estimate = BudgetaryEstimate(
        process_type=process_type,
        material=material,
        thickness_mm=thickness_mm,
        quantity=quantity,
        finish=finish,
        tolerance=tolerance,
        shipping_zip=shipping_zip,
        target_delivery_date=target_delivery_date,
        notes=notes,
        file_metadata=file_metadata,
        inputs_snapshot=inputs_snapshot,
        geometry=geometry,
        estimated_price_low=pricing.price_low,
        estimated_price_high=pricing.price_high,
        estimated_lead_time_low=pricing.lead_time_low,
        estimated_lead_time_high=pricing.lead_time_high,
        cost_breakdown=pricing.cost_breakdown,
        review_required=review_required,
        review_reasons=review_reasons,
        next_step=NEXT_STEP,
        disclaimer=DISCLAIMER,
    )
    db.add(estimate)
    db.flush()
    record_audit(
        db,
        entity_type="budgetary_estimate",
        entity_id=estimate.id,
        action="estimate_created",
        metadata={"process_type": process_type, "review_required": review_required},
    )
    db.commit()
    db.refresh(estimate)
    return estimate_to_response(estimate)


def estimate_to_response(estimate: BudgetaryEstimate) -> EstimateResponse:
    return EstimateResponse(
        quote_id=estimate.id,
        quote_type="budgetary_estimate",
        process_type=estimate.process_type,
        file=estimate.file_metadata,
        inputs=estimate.inputs_snapshot,
        geometry=estimate.geometry,
        estimated_price_range={"low": estimate.estimated_price_low, "high": estimate.estimated_price_high},
        estimated_lead_time_days={"low": estimate.estimated_lead_time_low, "high": estimate.estimated_lead_time_high},
        cost_breakdown=estimate.cost_breakdown,
        review_required=estimate.review_required,
        review_reasons=estimate.review_reasons,
        next_step=estimate.next_step,
        disclaimer=estimate.disclaimer,
    )


def _validate_inputs(
    process_type: str,
    material: str,
    thickness_mm: float | None,
    quantity: int,
    finish: str,
    tolerance: str,
) -> None:
    if process_type not in ALLOWED_PROCESS_TYPES:
        raise HTTPException(status_code=400, detail="Invalid process_type.")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    if process_type in THICKNESS_REQUIRED and (thickness_mm is None or thickness_mm <= 0):
        raise HTTPException(status_code=400, detail="thickness_mm is required for flat or sheet processes.")
    if finish not in ALLOWED_FINISHES:
        raise HTTPException(status_code=400, detail="Invalid finish.")
    if tolerance not in ALLOWED_TOLERANCES:
        raise HTTPException(status_code=400, detail="Invalid tolerance.")
    try:
        get_material(material)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
