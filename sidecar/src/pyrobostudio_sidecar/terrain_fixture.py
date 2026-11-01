"""Deterministic terrain fixture regions built from real H3 cell ids."""
import h3


def regions() -> list[dict]:
    out: list[dict] = []
    base_lat = 40.700
    base_lng = -74.000
    offsets = [
        (0.0, 0.0),
        (0.0002, 0.0),
        (0.0004, 0.0004),
        (0.0, 0.0004),
        (0.0004, 0.0),
        (0.0002, 0.0002),
        (-0.0002, 0.0002),
        (-0.0002, 0.0),
    ]
    decays = [1.0, 0.62, 0.2, 0.86, 0.5, 1.0, 0.95, 0.9]
    age_hours = [2, 6, 30, 10, 14, 0.5, 1.5, 4]
    for i, (dlat, dlng) in enumerate(offsets):
        out.append(
            {
                "cellId": h3.latlng_to_cell(base_lat + dlat, base_lng + dlng, 8),
                "confidence": round(decays[i] * 0.95, 3),
                "ageNs": int(age_hours[i] * 3_600_000_000_000),
                "sourceRobot": f"robot{(i % 3) + 1}",
                "conflict": i == 5,
                "centroid": [round(base_lng + dlng, 6), round(base_lat + dlat, 6)],
            }
        )
    return out


def regions_json() -> list[dict]:
    return regions()
