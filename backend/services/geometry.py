import math
import re
from pathlib import Path

from backend.services.materials import MaterialSpec


def default_geometry(metadata: dict | None = None) -> dict:
    return {
        "watertight": None,
        "volume_cm3": 0,
        "surface_area_cm2": 0,
        "bounding_box_mm": {"x": 0, "y": 0, "z": 0},
        "metadata": metadata or {},
    }


def analyze_geometry(path: Path, extension: str, material: MaterialSpec, thickness_mm: float | None) -> tuple[str, dict]:
    if extension == "stl":
        return _analyze_stl(path, material)
    if extension == "dxf":
        return _analyze_dxf(path, thickness_mm)
    if extension in {"step", "stp"}:
        return _analyze_step_metadata(path)
    return "requires_review", default_geometry({"reason": "PDF stored as supporting drawing, not parsed for geometry."})


def _analyze_stl(path: Path, material: MaterialSpec) -> tuple[str, dict]:
    try:
        import trimesh

        mesh = trimesh.load_mesh(path, force="mesh")
        extents = [float(value) for value in mesh.bounding_box.extents]
        volume_cm3 = max(float(abs(mesh.volume)) / 1000, 0)
        surface_area_cm2 = max(float(mesh.area) / 100, 0)
        weight_kg = volume_cm3 * material.density_g_cm3 / 1000
        return "analyzed", {
            "watertight": bool(mesh.is_watertight),
            "volume_cm3": round(volume_cm3, 4),
            "surface_area_cm2": round(surface_area_cm2, 4),
            "bounding_box_mm": {
                "x": round(extents[0], 4) if len(extents) > 0 else 0,
                "y": round(extents[1], 4) if len(extents) > 1 else 0,
                "z": round(extents[2], 4) if len(extents) > 2 else 0,
            },
            "metadata": {"estimated_weight_kg": round(weight_kg, 4), "parser": "trimesh"},
        }
    except Exception as exc:  # pragma: no cover - dependency/runtime dependent
        return "requires_review", default_geometry({"reason": f"STL parser failed: {exc}"})


def _analyze_dxf(path: Path, thickness_mm: float | None) -> tuple[str, dict]:
    text = path.read_text(errors="ignore")
    values = _dxf_group_values(text)
    x_values = [value for code, value in values if code in {"10", "11", "12", "13"}]
    y_values = [value for code, value in values if code in {"20", "21", "22", "23"}]
    entity_count = len(re.findall(r"\n\s*0\s*\n\s*(LINE|LWPOLYLINE|POLYLINE|CIRCLE|ARC)", text, re.IGNORECASE))
    line_lengths = _dxf_line_lengths(values)

    if not x_values or not y_values:
        return "requires_review", default_geometry({"reason": "DXF geometry could not be bounded.", "entity_count": entity_count})

    x_size = max(x_values) - min(x_values)
    y_size = max(y_values) - min(y_values)
    z_size = thickness_mm or 0
    area_cm2 = max(x_size * y_size / 100, 0)
    volume_cm3 = area_cm2 * ((thickness_mm or 0) / 10)
    return "analyzed", {
        "watertight": None,
        "volume_cm3": round(volume_cm3, 4),
        "surface_area_cm2": round(area_cm2, 4),
        "bounding_box_mm": {"x": round(x_size, 4), "y": round(y_size, 4), "z": round(z_size, 4)},
        "metadata": {
            "parser": "lightweight_dxf",
            "entity_count": entity_count,
            "cut_length_mm": round(sum(line_lengths), 4),
        },
    }


def _dxf_group_values(text: str) -> list[tuple[str, float]]:
    lines = [line.strip() for line in text.splitlines()]
    values: list[tuple[str, float]] = []
    for index in range(0, len(lines) - 1, 2):
        code = lines[index]
        try:
            values.append((code, float(lines[index + 1])))
        except ValueError:
            continue
    return values


def _dxf_line_lengths(values: list[tuple[str, float]]) -> list[float]:
    lengths: list[float] = []
    current: dict[str, float] = {}
    for code, value in values:
        if code in {"10", "20", "11", "21"}:
            current[code] = value
        if {"10", "20", "11", "21"}.issubset(current):
            lengths.append(math.hypot(current["11"] - current["10"], current["21"] - current["20"]))
            current = {}
    return lengths


def _analyze_step_metadata(path: Path) -> tuple[str, dict]:
    text = path.read_text(errors="ignore")
    points = re.findall(
        r"CARTESIAN_POINT\s*\([^,]*,\s*\(([-+0-9.Ee]+),\s*([-+0-9.Ee]+),\s*([-+0-9.Ee]+)\)\)",
        text,
        re.IGNORECASE,
    )
    face_count = len(re.findall(r"ADVANCED_FACE|FACE_BOUND", text, re.IGNORECASE))
    edge_count = len(re.findall(r"EDGE_CURVE|ORIENTED_EDGE", text, re.IGNORECASE))
    metadata = {"parser": "metadata_only_step", "face_count": face_count, "edge_count": edge_count}
    if not points:
        return "requires_review", default_geometry({**metadata, "reason": "STEP parser unavailable; stored for human review."})

    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    zs = [float(point[2]) for point in points]
    geometry = default_geometry(metadata)
    geometry["bounding_box_mm"] = {
        "x": round(max(xs) - min(xs), 4),
        "y": round(max(ys) - min(ys), 4),
        "z": round(max(zs) - min(zs), 4),
    }
    return "requires_review", geometry
