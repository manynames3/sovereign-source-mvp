from backend.services.pricing.base import (
    finalize_estimate,
    finish_cost,
    geometry_dimensions,
    quantity_discount,
    sheet_weight_kg,
    tolerance_multiplier,
)


def price_laser_cutting(input_data):
    x, y, _ = geometry_dimensions(input_data.geometry, input_data.thickness_mm)
    area_cm2 = (x * y) / 100
    thickness_multiplier = 1 + max((input_data.thickness_mm or 1) - 3, 0) * 0.12
    cut_length_mm = input_data.geometry.get("metadata", {}).get("cut_length_mm") or (2 * (x + y))
    pierce_count = max(int(input_data.geometry.get("metadata", {}).get("entity_count") or 4), 1)
    material_cost = (
        sheet_weight_kg(input_data.geometry, input_data.thickness_mm, input_data.material)
        * input_data.material.raw_cost_per_kg
        * input_data.material.sheet_cost_multiplier
        * input_data.quantity
        * quantity_discount(input_data.quantity)
    )
    cutting_cost = (
        ((cut_length_mm / 1000) * 7.5 * thickness_multiplier + pierce_count * 0.85)
        * input_data.quantity
        * tolerance_multiplier(input_data.tolerance)
        * quantity_discount(input_data.quantity)
    )
    return finalize_estimate(
        material_cost=material_cost,
        setup_cost=85,
        machine_or_cutting_cost=cutting_cost,
        finishing_cost=finish_cost(input_data.finish, input_data.quantity, area_cm2),
        inspection_cost=12 * tolerance_multiplier(input_data.tolerance),
        quantity=input_data.quantity,
        margin_rate=0.32,
        uncertainty_rate=0.18,
        lead_time_low=5,
        lead_time_high=9,
    )
