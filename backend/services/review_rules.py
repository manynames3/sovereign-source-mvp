import re

from backend.services.materials import MaterialSpec

REVIEW_KEYWORDS = (
    "threads",
    "threaded",
    "tapped",
    "tight tolerances",
    "aerospace",
    "defense",
    "itar",
    "critical",
    "urgent",
    "inspection",
)


def evaluate_review_required(
    *,
    file_extension: str,
    geometry_status: str,
    geometry: dict,
    material: MaterialSpec,
    process_type: str,
    tolerance: str,
    finish: str,
    quantity: int,
    estimated_high: float,
    notes: str | None,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    metadata = geometry.get("metadata") or {}
    bbox = geometry.get("bounding_box_mm") or {}

    if geometry_status != "analyzed":
        reasons.append("File geometry could not be fully parsed; manufacturability review required.")
    if file_extension in {"step", "stp", "dxf"} and metadata.get("parser") in {None, "metadata_only_step"}:
        reasons.append(f"{file_extension.upper()} geometry requires human review in this MVP.")
    if file_extension == "stl" and geometry.get("watertight") is False:
        reasons.append("STL mesh is not watertight.")
    if tolerance in {"tight", "critical"}:
        reasons.append(f"{tolerance} tolerance requires review.")
    if estimated_high > 5000:
        reasons.append("Budgetary estimate high range exceeds $5,000.")
    if any(float(bbox.get(axis) or 0) > 500 for axis in ("x", "y", "z")):
        reasons.append("Bounding box exceeds 500 mm on at least one axis.")
    if quantity > 100:
        reasons.append("Quantity over 100 requires review.")
    if material.review_required:
        reasons.append(f"{material.label} requires review.")
    if process_type == "cnc_milling":
        reasons.append("CNC milling is budgetary-estimate-only and requires review.")
    if finish == "custom":
        reasons.append("Custom finish requires review.")
    if notes and _has_review_keyword(notes):
        reasons.append("Notes mention review-sensitive requirements.")

    deduped = list(dict.fromkeys(reasons))
    return bool(deduped), deduped


def _has_review_keyword(notes: str) -> bool:
    normalized = notes.lower()
    return any(re.search(rf"\b{re.escape(keyword)}\b", normalized) for keyword in REVIEW_KEYWORDS)
