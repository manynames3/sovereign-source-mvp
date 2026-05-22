from typing import Literal

from pydantic import BaseModel, Field, field_validator

ProcessType = Literal["laser_cutting", "waterjet_cutting", "sheet_metal_bending", "cnc_milling"]
Tolerance = Literal["standard", "tight", "critical"]
Finish = Literal["none", "deburred", "brushed", "anodized", "powder_coated", "passivated", "custom"]
Material = Literal[
    "aluminum_6061",
    "stainless_304",
    "mild_steel",
    "carbon_steel",
    "copper",
    "brass",
    "titanium_grade_5",
]
GeometryStatus = Literal["analyzed", "requires_review"]
RFQStatus = Literal[
    "draft_estimate",
    "needs_review",
    "in_review",
    "changes_requested",
    "ready_for_final_quote",
    "quoted",
    "approved",
    "payment_pending",
    "paid",
    "in_production",
    "shipped",
    "completed",
    "cancelled",
    "rejected",
]
AdminReviewStatus = Literal["needs_review", "in_review", "changes_requested", "ready_for_final_quote", "rejected"]
PaymentRequiredType = Literal["deposit", "full_payment"]
PaymentStatusInput = Literal["paid", "failed"]


class BoundingBox(BaseModel):
    x: float = 0
    y: float = 0
    z: float = 0


class Geometry(BaseModel):
    watertight: bool | None = None
    volume_cm3: float = 0
    surface_area_cm2: float = 0
    bounding_box_mm: BoundingBox = Field(default_factory=BoundingBox)
    metadata: dict = Field(default_factory=dict)


class EstimateFile(BaseModel):
    name: str
    type: str
    valid: bool
    geometry_status: GeometryStatus
    storage_key: str | None = None
    size_bytes: int | None = None
    checksum: str | None = None


class EstimateInputs(BaseModel):
    material: Material
    thickness_mm: float | None = None
    quantity: int
    finish: Finish
    tolerance: Tolerance
    shipping_zip: str | None = None
    target_delivery_date: str | None = None


class PriceRange(BaseModel):
    low: float
    high: float


class LeadTimeRange(BaseModel):
    low: int
    high: int


class CostBreakdown(BaseModel):
    material_cost: float
    setup_cost: float
    machine_or_cutting_cost: float
    finishing_cost: float
    inspection_cost: float
    margin_amount: float
    uncertainty_amount: float
    quantity: int


class EstimateResponse(BaseModel):
    quote_id: str
    quote_type: Literal["budgetary_estimate"]
    process_type: ProcessType
    file: EstimateFile
    inputs: EstimateInputs
    geometry: Geometry
    estimated_price_range: PriceRange
    estimated_lead_time_days: LeadTimeRange
    cost_breakdown: CostBreakdown
    review_required: bool
    review_reasons: list[str]
    next_step: str
    disclaimer: str


class RFQSubmitRequest(BaseModel):
    quote_id: str
    customer_name: str
    email: str
    phone: str | None = None
    company: str | None = None
    notes: str | None = None
    consent_to_review: bool


class RFQSummary(BaseModel):
    rfq_id: str
    quote_id: str
    status: RFQStatus
    customer_name: str
    email: str
    company: str | None = None
    review_required: bool
    next_step: str


class AdminReviewRequest(BaseModel):
    status: AdminReviewStatus
    internal_notes: str | None = None
    reviewed_by: str | None = None
    manufacturability_notes: str | None = None
    recommended_process: ProcessType | None = None
    required_changes: str | None = None
    review_required: bool | None = None


class AdminReviewResponse(BaseModel):
    rfq_id: str
    status: AdminReviewStatus
    internal_notes: str | None = None
    manufacturability_notes: str | None = None
    recommended_process: str | None = None
    required_changes: str | None = None
    review_required: bool | None = None


class FinalQuoteCreateRequest(BaseModel):
    final_price: float
    final_lead_time_days: int
    final_process_type: ProcessType
    final_material: Material
    final_finish: Finish
    quote_expiration_date: str
    production_notes: str
    payment_required_type: PaymentRequiredType
    deposit_amount: float | None = None


class FinalQuoteResponse(BaseModel):
    final_quote_id: str
    rfq_id: str
    status: str
    final_price: float
    final_lead_time_days: int
    final_process_type: str
    final_material: str
    final_finish: str
    quote_expiration_date: str
    production_notes: str
    payment_required_type: PaymentRequiredType
    deposit_amount: float | None = None


class FinalQuoteCustomerResponse(FinalQuoteResponse):
    original_quote_id: str
    customer_name: str
    company: str | None = None


class FinalQuoteRejectRequest(BaseModel):
    rejection_reason: str | None = None


class FinalQuoteApprovalResponse(BaseModel):
    final_quote_id: str
    rfq_id: str
    order_id: str
    status: str
    payment_required: bool


class PaymentSessionResponse(BaseModel):
    payment_session_id: str
    payment_url: str
    amount_due: float
    payment_type: PaymentRequiredType
    status: str


class MockPaymentConfirmRequest(BaseModel):
    payment_session_id: str
    payment_status: PaymentStatusInput


class PaymentConfirmResponse(BaseModel):
    payment_session_id: str
    order_id: str
    payment_status: str
    order_status: str
    rfq_status: str
    amount_paid: float
    balance_due: float


class OrderResponse(BaseModel):
    order_id: str
    rfq_id: str
    final_quote_id: str
    status: str
    amount_paid: float
    balance_due: float
    payment_status: str
    production_status: str
    file_metadata: dict
    material: str
    process_type: str
    quantity: int
    final_lead_time_days: int
    production_notes: str


class AccessRequestCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    company: str = Field(min_length=2, max_length=160)
    role: str = Field(min_length=2, max_length=80)
    use_case: str = Field(min_length=10, max_length=1200)
    estimated_monthly_rfqs: int | None = Field(default=None, ge=0, le=100000)
    notes: str | None = Field(default=None, max_length=2000)
    consent_to_contact: bool

    @field_validator("email")
    @classmethod
    def email_must_look_valid(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("email must be a valid address.")
        return normalized

    @field_validator("name", "company", "role", "use_case")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class AccessRequestResponse(BaseModel):
    request_id: str
    status: str
    company: str
    email: str
    next_step: str
