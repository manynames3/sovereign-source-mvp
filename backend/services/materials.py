from dataclasses import dataclass


@dataclass(frozen=True)
class MaterialSpec:
    key: str
    label: str
    density_g_cm3: float
    raw_cost_per_kg: float
    sheet_cost_multiplier: float
    machinability_multiplier: float
    default_machine_rate: float
    review_required: bool = False


MATERIALS: dict[str, MaterialSpec] = {
    "aluminum_6061": MaterialSpec(
        key="aluminum_6061",
        label="Aluminum 6061",
        density_g_cm3=2.70,
        raw_cost_per_kg=8.50,
        sheet_cost_multiplier=1.35,
        machinability_multiplier=0.85,
        default_machine_rate=95,
    ),
    "stainless_304": MaterialSpec(
        key="stainless_304",
        label="Stainless 304",
        density_g_cm3=8.00,
        raw_cost_per_kg=10.75,
        sheet_cost_multiplier=1.55,
        machinability_multiplier=1.30,
        default_machine_rate=115,
    ),
    "mild_steel": MaterialSpec(
        key="mild_steel",
        label="Mild steel",
        density_g_cm3=7.85,
        raw_cost_per_kg=3.40,
        sheet_cost_multiplier=1.25,
        machinability_multiplier=1.00,
        default_machine_rate=90,
    ),
    "carbon_steel": MaterialSpec(
        key="carbon_steel",
        label="Carbon steel",
        density_g_cm3=7.85,
        raw_cost_per_kg=3.80,
        sheet_cost_multiplier=1.30,
        machinability_multiplier=1.05,
        default_machine_rate=92,
    ),
    "copper": MaterialSpec(
        key="copper",
        label="Copper",
        density_g_cm3=8.96,
        raw_cost_per_kg=13.25,
        sheet_cost_multiplier=1.70,
        machinability_multiplier=1.45,
        default_machine_rate=120,
    ),
    "brass": MaterialSpec(
        key="brass",
        label="Brass",
        density_g_cm3=8.50,
        raw_cost_per_kg=11.50,
        sheet_cost_multiplier=1.55,
        machinability_multiplier=1.10,
        default_machine_rate=105,
    ),
    "titanium_grade_5": MaterialSpec(
        key="titanium_grade_5",
        label="Titanium Grade 5",
        density_g_cm3=4.43,
        raw_cost_per_kg=58.00,
        sheet_cost_multiplier=2.10,
        machinability_multiplier=2.25,
        default_machine_rate=165,
        review_required=True,
    ),
}


def get_material(key: str) -> MaterialSpec:
    try:
        return MATERIALS[key]
    except KeyError as exc:
        raise ValueError(f"Unsupported material: {key}") from exc
