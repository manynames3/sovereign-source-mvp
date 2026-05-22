from backend.services.pricing.base import (
    finalize_estimate,
    finish_cost,
    geometry_dimensions,
    quantity_discount,
    stock_weight_kg,
    tolerance_multiplier,
)


def price_cnc_milling(input_data):
    x, y, z = geometry_dimensions(input_data.geometry, input_data.thickness_mm)
    surface_area_cm2 = max(input_data.geometry.get("surface_area_cm2") or ((x * y + x * z + y * z) * 2 / 100), 1)
    stock_weight = stock_weight_kg(input_data.geometry, input_data.material) * 1.35
    material_cost = (
        stock_weight
        * input_data.material.raw_cost_per_kg
        * input_data.quantity
        * quantity_discount(input_data.quantity)
    )
    setup_hours = 2.0
    complexity_hours = max((x * y * z) / 1_200_000, 0.8)
    machine_hours = (setup_hours + complexity_hours) * input_data.material.machinability_multiplier
    machine_cost = (
        machine_hours
        * input_data.material.default_machine_rate
        * input_data.quantity
        * tolerance_multiplier(input_data.tolerance)
        * quantity_discount(input_data.quantity)
    )
    inspection_cost = 65 * tolerance_multiplier(input_data.tolerance)
    return finalize_estimate(
        material_cost=material_cost,
        setup_cost=180,
        machine_or_cutting_cost=machine_cost,
        finishing_cost=finish_cost(input_data.finish, input_data.quantity, surface_area_cm2),
        inspection_cost=inspection_cost,
        quantity=input_data.quantity,
        margin_rate=0.38,
        uncertainty_rate=0.32,
        lead_time_low=12,
        lead_time_high=24,
    )
