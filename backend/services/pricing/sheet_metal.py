from backend.services.pricing.base import (
    finalize_estimate,
    finish_cost,
    geometry_dimensions,
    quantity_discount,
    sheet_weight_kg,
    tolerance_multiplier,
)


def price_sheet_metal_bending(input_data):
    x, y, _ = geometry_dimensions(input_data.geometry, input_data.thickness_mm)
    area_cm2 = (x * y) / 100
    bend_count = int(input_data.geometry.get("metadata", {}).get("bend_count") or 2)
    material_cost = (
        sheet_weight_kg(input_data.geometry, input_data.thickness_mm, input_data.material)
        * input_data.material.raw_cost_per_kg
        * input_data.material.sheet_cost_multiplier
        * input_data.quantity
        * quantity_discount(input_data.quantity)
    )
    cutting_cost = 18 * input_data.quantity * quantity_discount(input_data.quantity)
    bend_cost = bend_count * 9.5 * input_data.quantity * tolerance_multiplier(input_data.tolerance)
    hardware_insert_placeholder = 0
    return finalize_estimate(
        material_cost=material_cost,
        setup_cost=140,
        machine_or_cutting_cost=cutting_cost + bend_cost + hardware_insert_placeholder,
        finishing_cost=finish_cost(input_data.finish, input_data.quantity, area_cm2),
        inspection_cost=18 * tolerance_multiplier(input_data.tolerance),
        quantity=input_data.quantity,
        margin_rate=0.34,
        uncertainty_rate=0.24,
        lead_time_low=7,
        lead_time_high=14,
    )
