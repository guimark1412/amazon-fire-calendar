from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class RegionConfig:
    """Geographic bounding box, optional clipping polygon, and historical baseline for a region."""

    id: str
    name: str
    # (west, south, east, north) in decimal degrees for NASA FIRMS API
    bbox: Tuple[float, float, float, float]
    center: Tuple[float, float]
    zoom: int
    # Average monthly MODIS-equivalent fire hotspots (Jan-Dec)
    historical_monthly_avg: Tuple[float, ...]
    # Optional (lon, lat) boundary polygon to restrict points inside the bbox
    polygon: Optional[Tuple[Tuple[float, float], ...]] = None


# Coarse boundary polygon for Brazil's 9 Legal Amazon states (AC, AM, RR, AP, PA, RO, MT, TO, W-MA),
# excluding neighboring countries (Venezuela, Guianas, Suriname, Colombia, Peru, Bolivia).
AMAZONIA_LEGAL_BR_POLYGON: Tuple[Tuple[float, float], ...] = (
    (-73.99, -7.12), (-73.70, -4.40), (-70.10, -4.25), (-69.50, -1.50),
    (-70.05, 1.25), (-67.15, 2.25), (-64.20, 4.10), (-62.95, 4.25),
    (-60.73, 5.27), (-59.80, 4.15), (-59.65, 1.85), (-58.15, 1.25),
    (-56.00, 1.85), (-54.05, 2.15), (-53.20, 3.25), (-51.80, 4.45),
    (-49.85, 2.20), (-48.35, -0.45), (-46.10, -1.05), (-44.15, -2.25),
    (-44.00, -5.80), (-45.50, -9.80), (-46.30, -13.10), (-48.80, -13.45),
    (-50.55, -13.15), (-52.25, -16.10), (-53.15, -17.95), (-57.60, -17.90),
    (-60.35, -16.30), (-60.50, -13.65), (-63.10, -12.60), (-65.40, -11.95),
    (-65.35, -9.80), (-68.75, -11.00), (-70.60, -10.95), (-72.80, -9.50),
)

AMAZONAS_POLYGON: Tuple[Tuple[float, float], ...] = (
    (-73.99, -7.12), (-73.70, -4.40), (-70.10, -4.25), (-69.50, -1.50),
    (-70.05, 1.25), (-67.15, 2.25), (-64.20, 2.20), (-60.90, 0.40),
    (-58.90, 1.25), (-56.10, -2.15), (-56.15, -5.80), (-57.60, -9.05),
    (-59.05, -9.55), (-61.90, -8.10), (-64.10, -8.75), (-66.85, -9.65),
    (-69.50, -8.90), (-72.90, -7.50),
)

PARA_POLYGON: Tuple[Tuple[float, float], ...] = (
    (-58.90, 1.25), (-58.15, 1.25), (-56.00, 1.85), (-54.05, 2.15),
    (-53.50, 0.25), (-51.90, -1.25), (-49.00, 0.25), (-48.10, -0.45),
    (-46.10, -1.05), (-47.45, -4.60), (-48.60, -5.25), (-48.55, -8.35),
    (-49.85, -9.75), (-52.20, -9.80), (-55.00, -9.70), (-58.10, -9.15),
    (-57.60, -7.20), (-56.15, -5.80), (-56.10, -2.15),
)


def point_in_polygon(lon: float, lat: float, polygon: Tuple[Tuple[float, float], ...]) -> bool:
    """Return True when (lon, lat) lies inside the given (lon, lat) polygon via ray casting."""
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def in_region(lon: float, lat: float, region: RegionConfig) -> bool:
    """Return True if (lon, lat) falls within the region's bounding box and optional polygon."""
    west, south, east, north = region.bbox
    if not (west <= lon <= east and south <= lat <= north):
        return False
    if region.polygon is not None:
        return point_in_polygon(lon, lat, region.polygon)
    return True


REGIONS: Dict[str, RegionConfig] = {
    "amazonia_legal": RegionConfig(
        id="amazonia_legal",
        name="Amazônia Legal (Brasil)",
        bbox=(-74.0, -18.0, -44.0, 5.5),
        center=(-5.5, -59.5),
        zoom=5,
        historical_monthly_avg=(8, 6, 8, 10, 14, 28, 52, 96, 116, 72, 44, 24),
        polygon=AMAZONIA_LEGAL_BR_POLYGON,
    ),
    "norte_america_sul": RegionConfig(
        id="norte_america_sul",
        name="Norte da América do Sul",
        bbox=(-74.0, -18.0, -44.0, 5.5),
        center=(-4.5, -59.5),
        zoom=5,
        historical_monthly_avg=(10, 8, 10, 12, 16, 32, 58, 104, 128, 80, 52, 30),
    ),
    "amazonas": RegionConfig(
        id="amazonas",
        name="Somente Amazonas",
        bbox=(-73.8, -9.8, -56.1, 2.2),
        center=(-4.2, -63.0),
        zoom=6,
        historical_monthly_avg=(4, 2, 4, 4, 6, 10, 18, 32, 40, 24, 16, 8),
        polygon=AMAZONAS_POLYGON,
    ),
    "para": RegionConfig(
        id="para",
        name="Somente Pará",
        bbox=(-58.9, -9.8, -46.1, 2.6),
        center=(-4.5, -52.5),
        zoom=6,
        historical_monthly_avg=(4, 2, 4, 4, 6, 10, 18, 32, 40, 24, 16, 8),
        polygon=PARA_POLYGON,
    ),
    "mato_grosso": RegionConfig(
        id="mato_grosso",
        name="Somente Mato Grosso",
        bbox=(-61.6, -18.0, -50.2, -7.3),
        center=(-12.6, -55.9),
        zoom=6,
        historical_monthly_avg=(4, 4, 4, 6, 8, 16, 30, 56, 68, 40, 24, 12),
    ),
    "rondonia": RegionConfig(
        id="rondonia",
        name="Somente Rondônia",
        bbox=(-66.8, -13.7, -59.8, -7.9),
        center=(-10.8, -63.0),
        zoom=7,
        historical_monthly_avg=(2, 2, 2, 2, 4, 6, 10, 16, 20, 12, 8, 4),
    ),
    "acre": RegionConfig(
        id="acre",
        name="Somente Acre",
        bbox=(-74.0, -11.1, -66.6, -7.1),
        center=(-9.1, -70.4),
        zoom=7,
        historical_monthly_avg=(2, 2, 2, 2, 4, 6, 10, 16, 20, 12, 8, 4),
    ),
}

# Empirical ratio: 1 MODIS (1km) hotspot corresponds on average to ~4 VIIRS (375m) hotspots,
# so VIIRS * 0.25 approximates MODIS-equivalent counts when overlapping calibration is sparse.
DEFAULT_VIIRS_TO_MODIS_FACTOR = 0.25


def parse_custom_bbox(bbox_str: Optional[str]) -> Optional[Tuple[float, float, float, float]]:
    """Parse 'west,south,east,north' into a validated 4-tuple of floats."""
    if not bbox_str:
        return None
    parts = [p.strip() for p in bbox_str.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must have 4 comma-separated values: west,south,east,north")
    west, south, east, north = (float(p) for p in parts)
    if west >= east or south >= north:
        raise ValueError("Invalid bbox bounds: west must be < east and south must be < north")
    if not (-180.0 <= west <= 180.0 and -180.0 <= east <= 180.0):
        raise ValueError("Longitude out of bounds (-180 to 180)")
    if not (-90.0 <= south <= 90.0 and -90.0 <= north <= 90.0):
        raise ValueError("Latitude out of bounds (-90 to 90)")
    return (round(west, 4), round(south, 4), round(east, 4), round(north, 4))


def resolve_region_config(
    region_id: str,
    custom_bbox: Optional[Tuple[float, float, float, float]] = None,
) -> RegionConfig:
    """Resolve a preset RegionConfig or dynamically build one for a custom Area of Interest (AOI)."""
    base = REGIONS.get(region_id, REGIONS["amazonia_legal"])
    if custom_bbox is None:
        return base

    west, south, east, north = custom_bbox
    center = (round((south + north) / 2.0, 4), round((west + east) / 2.0, 4))
    span = max(east - west, north - south)
    zoom = 8 if span < 3 else 7 if span < 6 else 6 if span < 14 else 5

    # Scale historical monthly MODIS baseline by area ratio relative to Amazônia Legal
    amz_w, amz_s, amz_e, amz_n = REGIONS["amazonia_legal"].bbox
    amz_area = max(1.0, (amz_e - amz_w) * (amz_n - amz_s))
    custom_area = max(0.25, (east - west) * (north - south))
    area_ratio = min(1.5, max(0.04, custom_area / amz_area))

    scaled_avg = tuple(
        round(max(0.5, val * area_ratio), 2)
        for val in REGIONS["amazonia_legal"].historical_monthly_avg
    )

    return RegionConfig(
        id="custom_aoi",
        name=f"Área de Interesse Customizada ({south:.1f}°, {west:.1f}° a {north:.1f}°, {east:.1f}°)",
        bbox=custom_bbox,
        center=center,
        zoom=zoom,
        historical_monthly_avg=scaled_avg,
    )
