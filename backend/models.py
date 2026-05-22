from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.database import Base


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def now_utc() -> datetime:
    return datetime.now(UTC)


class BudgetaryEstimate(Base):
    __tablename__ = "budgetary_estimates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("quote"))
    quote_type: Mapped[str] = mapped_column(String, default="budgetary_estimate")
    process_type: Mapped[str] = mapped_column(String, index=True)
    material: Mapped[str] = mapped_column(String)
    thickness_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    finish: Mapped[str] = mapped_column(String)
    tolerance: Mapped[str] = mapped_column(String)
    shipping_zip: Mapped[str | None] = mapped_column(String, nullable=True)
    target_delivery_date: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_metadata: Mapped[dict] = mapped_column(JSON)
    inputs_snapshot: Mapped[dict] = mapped_column(JSON)
    geometry: Mapped[dict] = mapped_column(JSON)
    estimated_price_low: Mapped[float] = mapped_column(Float)
    estimated_price_high: Mapped[float] = mapped_column(Float)
    estimated_lead_time_low: Mapped[int] = mapped_column(Integer)
    estimated_lead_time_high: Mapped[int] = mapped_column(Integer)
    cost_breakdown: Mapped[dict] = mapped_column(JSON)
    review_required: Mapped[bool] = mapped_column(Boolean)
    review_reasons: Mapped[list] = mapped_column(JSON)
    next_step: Mapped[str] = mapped_column(String)
    disclaimer: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    rfqs: Mapped[list["RFQ"]] = relationship(back_populates="estimate")


class RFQ(Base):
    __tablename__ = "rfqs_metal"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rfq"))
    quote_id: Mapped[str] = mapped_column(ForeignKey("budgetary_estimates.id"), index=True)
    customer_name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, index=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    company: Mapped[str | None] = mapped_column(String, nullable=True)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_to_review: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String, default="needs_review", index=True)
    original_estimate_snapshot: Mapped[dict] = mapped_column(JSON)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    manufacturability_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_process: Mapped[str | None] = mapped_column(String, nullable=True)
    required_changes: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    estimate: Mapped[BudgetaryEstimate] = relationship(back_populates="rfqs")
    final_quotes: Mapped[list["FinalQuote"]] = relationship(back_populates="rfq")
    orders: Mapped[list["Order"]] = relationship(back_populates="rfq")


class FinalQuote(Base):
    __tablename__ = "final_quotes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("final_quote"))
    rfq_id: Mapped[str] = mapped_column(ForeignKey("rfqs_metal.id"), index=True)
    final_price: Mapped[float] = mapped_column(Float)
    final_lead_time_days: Mapped[int] = mapped_column(Integer)
    final_process_type: Mapped[str] = mapped_column(String)
    final_material: Mapped[str] = mapped_column(String)
    final_finish: Mapped[str] = mapped_column(String)
    quote_expiration_date: Mapped[str] = mapped_column(String)
    production_notes: Mapped[str] = mapped_column(Text)
    payment_required_type: Mapped[str] = mapped_column(String)
    deposit_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending_customer_approval", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    rfq: Mapped[RFQ] = relationship(back_populates="final_quotes")
    orders: Mapped[list["Order"]] = relationship(back_populates="final_quote")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("order"))
    rfq_id: Mapped[str] = mapped_column(ForeignKey("rfqs_metal.id"), index=True)
    final_quote_id: Mapped[str] = mapped_column(ForeignKey("final_quotes.id"), index=True)
    customer_snapshot: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default="payment_pending", index=True)
    amount_paid: Mapped[float] = mapped_column(Float, default=0)
    balance_due: Mapped[float] = mapped_column(Float, default=0)
    payment_status: Mapped[str] = mapped_column(String, default="unpaid")
    production_status: Mapped[str] = mapped_column(String, default="not_started")
    file_metadata: Mapped[dict] = mapped_column(JSON)
    material: Mapped[str] = mapped_column(String)
    process_type: Mapped[str] = mapped_column(String)
    quantity: Mapped[int] = mapped_column(Integer)
    final_lead_time_days: Mapped[int] = mapped_column(Integer)
    production_notes: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    rfq: Mapped[RFQ] = relationship(back_populates="orders")
    final_quote: Mapped[FinalQuote] = relationship(back_populates="orders")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("pay"))
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    final_quote_id: Mapped[str] = mapped_column(ForeignKey("final_quotes.id"), index=True)
    amount_due: Mapped[float] = mapped_column(Float)
    payment_type: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    payment_url: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    order: Mapped[Order] = relationship(back_populates="payments")


class AuditEvent(Base):
    __tablename__ = "quote_order_audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("audit"))
    entity_type: Mapped[str] = mapped_column(String, index=True)
    entity_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("access"))
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, index=True)
    company: Mapped[str] = mapped_column(String, index=True)
    role: Mapped[str] = mapped_column(String)
    use_case: Mapped[str] = mapped_column(Text)
    estimated_monthly_rfqs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_to_contact: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String, default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
