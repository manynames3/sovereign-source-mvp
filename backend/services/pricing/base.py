from dataclasses import dataclass

from backend.services.materials import MaterialSpec


@dataclass(frozen=True)
class PricingInput:
    process_type: str
    material: MaterialSpec
    thickness_mm: float | None
    quantity: int
    finish: str
    tolerance: str
    geometry: dict


@dataclass(frozen=True)
class PricingResult:
    price_low: float
    price_high: float
    lead_time_low: int
    lead_time_high: int
    cost_breakdown: dict


def estimate_price(input_data: PricingInput) -> PricingResult:
    if input_data.process_type == "laser_cutting":
        from backend.services.pricing.laser import price_laser_cutting

        return price_laser_cutting(input_data)
    if input_data.process_type == "waterjet_cutting":
        from backend.services.pricing.waterjet import price_waterjet_cutting

        return price_waterjet_cutting(input_data)
    if input_data.process_type == "sheet_metal_bending":
        from backend.services.pricing.sheet_metal import price_sheet_metal_bending

        return price_sheet_metal_bending(input_data)
    if input_data.process_type == "cnc_milling":
        from backend.services.pricing.cnc import price_cnc_milling

        return price_cnc_milling(input_data)
    raise ValueError(f"Unsupported process type: {input_data.process_type}")


def geometry_dimensions(geometry: dict, thickness_mm: float | None) -> tuple[float, float, float]:
    box = geometry.get("bounding_box_mm") or {}
    x = float(box.get("x") or 100)
    y = float(box.get("y") or 100)
    z = float(box.get("z") or thickness_mm or 10)
    return max(x, 1), max(y, 1), max(z, 1)


def sheet_weight_kg(geometry: dict, thickness_mm: float | None, material: MaterialSpec) -> float:
    x, y, z = geometry_dimensions(geometry, thickness_mm)
    effective_thickness = thickness_mm or z
    volume_cm3 = (x / 10) * (y / 10) * (effective_thickness / 10)
    return max(volume_cm3 * material.density_g_cm3 / 1000, 0.02)


def stock_weight_kg(geometry: dict, material: MaterialSpec) -> float:
    x, y, z = geometry_dimensions(geometry, None)
    volume_cm3 = (x / 10) * (y / 10) * (z / 10)
    return max(volume_cm3 * material.density_g_cm3 / 1000, 0.05)


def quantity_discount(quantity: int) -> float:
    if quantity >= 100:
        return 0.78
    if quantity >= 50:
        return 0.84
    if quantity >= 10:
        return 0.91
    return 1.0


def finish_cost(finish: str, quantity: int, area_cm2: float) -> float:
    per_part = {
        "none": 0,
        "deburred": 3.5,
        "brushed": 7.5,
        "anodized": 18,
        "powder_coated": 16,
        "passivated": 14,
        "custom": 35,
    }[finish]
    area_factor = max(area_cm2 / 500, 1)
    return per_part * quantity * area_factor


def tolerance_multiplier(tolerance: str) -> float:
    return {"standard": 1.0, "tight": 1.22, "critical": 1.55}[tolerance]


def finalize_estimate(
    *,
    material_cost: float,
    setup_cost: float,
    machine_or_cutting_cost: float,
    finishing_cost: float,
    inspection_cost: float,
    quantity: int,
    margin_rate: float,
    uncertainty_rate: float,
    lead_time_low: int,
    lead_time_high: int,
) -> PricingResult:
    subtotal = material_cost + setup_cost + machine_or_cutting_cost + finishing_cost + inspection_cost
    margin_amount = subtotal * margin_rate
    pre_uncertainty = subtotal + margin_amount
    uncertainty_amount = pre_uncertainty * uncertainty_rate
    high = pre_uncertainty + uncertainty_amount
    low = max(pre_uncertainty * 0.88, subtotal)
    return PricingResult(
        price_low=round(low, 2),
        price_high=round(high, 2),
        lead_time_low=lead_time_low,
        lead_time_high=lead_time_high,
        cost_breakdown={
            "material_cost": round(material_cost, 2),
            "setup_cost": round(setup_cost, 2),
            "machine_or_cutting_cost": round(machine_or_cutting_cost, 2),
            "finishing_cost": round(finishing_cost, 2),
            "inspection_cost": round(inspection_cost, 2),
            "margin_amount": round(margin_amount, 2),
            "uncertainty_amount": round(uncertainty_amount, 2),
            "quantity": quantity,
        },
    )
