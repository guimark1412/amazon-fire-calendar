from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import REGIONS, parse_custom_bbox, resolve_region_config
from .firms_client import get_fire_records, get_timeline_records, with_dynamic_historical_baseline
from .harmonization import build_spatial_grid, build_timeline

app = FastAPI(
    title="Amazon Fire Calendar API",
    description="Harmonizes NASA FIRMS MODIS (1km) and VIIRS (375m) fire hotspots for the Amazon and custom AOIs.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "amazon-fire-calendar", "version": "0.2.0"}


@app.get("/api/regions")
def list_regions() -> dict:
    return {
        "regions": [
            {
                "id": r.id,
                "name": r.name,
                "bbox": r.bbox,
                "center": r.center,
                "zoom": r.zoom,
            }
            for r in REGIONS.values()
        ]
    }


def _resolve_bbox_or_400(bbox_str: Optional[str]):
    try:
        return parse_custom_bbox(bbox_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _sample_evenly(items: list, target: int) -> list:
    """Select up to `target` items uniformly across `items` so all days and regions are represented."""
    if target <= 0 or not items:
        return []
    if len(items) <= target:
        return items
    step = len(items) / target
    return [items[int(i * step)] for i in range(target)]


def _sample_by_month(items: list, target: int) -> list:
    """Water-filling stratified sample by YYYY-MM so dense live months do not crowd out earlier months."""
    if target <= 0 or not items:
        return []
    if len(items) <= target:
        return items

    buckets: Dict[str, list] = {}
    for rec in items:
        ym = (rec.get("acq_date") or "")[:7]
        buckets.setdefault(ym, []).append(rec)

    if len(buckets) <= 1:
        return _sample_evenly(items, target)

    remaining_budget = target
    quotas: Dict[str, int] = {}
    unfilled = sorted(buckets.keys())
    while unfilled:
        share = remaining_budget // len(unfilled)
        next_unfilled = []
        allocated = 0
        for ym in unfilled:
            n = len(buckets[ym])
            if n <= share:
                quotas[ym] = n
                allocated += n
            else:
                next_unfilled.append(ym)
        if not next_unfilled:
            break
        if len(next_unfilled) == len(unfilled):
            base, rem = divmod(remaining_budget, len(unfilled))
            for idx, ym in enumerate(unfilled):
                quotas[ym] = base + (1 if idx < rem else 0)
            break
        remaining_budget -= allocated
        unfilled = next_unfilled

    sampled: list = []
    for ym in sorted(buckets.keys()):
        sampled.extend(_sample_evenly(buckets[ym], quotas[ym]))
    return sampled


@app.get("/api/fires")
def get_fires(
    region: str = Query("amazonia_legal", description="Region ID from /api/regions or 'custom_aoi'"),
    sensor: str = Query("both", description="both, MODIS, or VIIRS"),
    days: int = Query(7, ge=1, le=10, description="Day range for live NASA FIRMS (1-10)"),
    limit: int = Query(500, ge=1, le=5000, description="Max hotspots returned"),
    bbox: Optional[str] = Query(None, description="Optional custom bbox: west,south,east,north"),
    daynight: str = Query("all", description="all, D (Day), or N (Night)"),
    min_confidence: str = Query("all", description="all, nominal, or high"),
    period: Optional[str] = Query(None, description="Optional period filter (YYYY-MM or YYYY-Www)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
) -> dict:
    custom_bbox = _resolve_bbox_or_400(bbox)
    if custom_bbox is None and region not in REGIONS:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")

    records, data_source = get_fire_records(
        region_id=region,
        sensor=sensor,
        days=days,
        custom_bbox=custom_bbox,
        daynight=daynight,
        min_confidence=min_confidence,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    if sensor.lower() == "both" and len(records) > limit:
        half = limit // 2
        all_modis = [r for r in records if r["sensor"] == "MODIS"]
        all_viirs = [r for r in records if r["sensor"] == "VIIRS"]
        modis = _sample_by_month(all_modis, half)
        viirs = _sample_by_month(all_viirs, limit - len(modis))
        sliced = modis + viirs
    else:
        sliced = _sample_by_month(records, limit)
    return {
        "region": "custom_aoi" if custom_bbox else region,
        "sensor": sensor,
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "data_source": data_source,
        "total_count": len(records),
        "returned_count": len(sliced),
        "fires": sliced,
    }


@app.get("/api/timeline")
def get_timeline(
    region: str = Query("amazonia_legal", description="Region ID from /api/regions or 'custom_aoi'"),
    granularity: str = Query("month", pattern="^(month|week)$"),
    sensor: str = Query("both", description="both, MODIS, or VIIRS"),
    bbox: Optional[str] = Query(None, description="Optional custom bbox: west,south,east,north"),
    daynight: str = Query("all", description="all, D (Day), or N (Night)"),
    min_confidence: str = Query("all", description="all, nominal, or high"),
    viirs_only_weight: float = Query(
        0.85,
        ge=0.0,
        le=1.0,
        description="Weight applied to unmatched VIIRS-only small/cool detections (0.0 to 1.0)",
    ),
    period: Optional[str] = Query(None, description="Optional period filter (YYYY-MM or YYYY-Www)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
) -> dict:
    custom_bbox = _resolve_bbox_or_400(bbox)
    if custom_bbox is None and region not in REGIONS:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")

    region_cfg = with_dynamic_historical_baseline(resolve_region_config(region, custom_bbox))
    all_records, data_source = get_timeline_records(
        region_id=region,
        days=7,
        custom_bbox=custom_bbox,
        daynight=daynight,
        min_confidence=min_confidence,
        sensor="both",
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    if sensor.lower() in ("modis", "viirs"):
        target_sensor = sensor.upper()
        records = [r for r in all_records if r["sensor"] == target_sensor]
    else:
        records = all_records
    timeline = build_timeline(
        records,
        region_cfg,
        granularity=granularity,
        viirs_only_weight=viirs_only_weight,
        sensor=sensor,
        reference_records=all_records,
    )
    timeline["sensor"] = sensor
    timeline["period"] = period
    timeline["start_date"] = start_date
    timeline["end_date"] = end_date
    timeline["data_source"] = data_source
    return timeline


@app.get("/api/grid")
def get_grid(
    region: str = Query("amazonia_legal", description="Region ID from /api/regions or 'custom_aoi'"),
    sensor: str = Query("both", description="both, MODIS, or VIIRS"),
    days: int = Query(7, ge=1, le=10),
    cell_size: float = Query(1.25, ge=0.25, le=5.0),
    bbox: Optional[str] = Query(None, description="Optional custom bbox: west,south,east,north"),
    daynight: str = Query("all", description="all, D (Day), or N (Night)"),
    min_confidence: str = Query("all", description="all, nominal, or high"),
    viirs_only_weight: float = Query(0.85, ge=0.0, le=1.0),
    period: Optional[str] = Query(None, description="Optional period filter (YYYY-MM or YYYY-Www)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
) -> dict:
    custom_bbox = _resolve_bbox_or_400(bbox)
    if custom_bbox is None and region not in REGIONS:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")

    region_cfg = with_dynamic_historical_baseline(resolve_region_config(region, custom_bbox))
    all_records, data_source = get_fire_records(
        region_id=region,
        sensor="both",
        days=days,
        custom_bbox=custom_bbox,
        daynight=daynight,
        min_confidence=min_confidence,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    if sensor.lower() in ("modis", "viirs"):
        target_sensor = sensor.upper()
        records = [r for r in all_records if r["sensor"] == target_sensor]
    else:
        records = all_records
    grid = build_spatial_grid(
        records,
        region_cfg,
        cell_size=cell_size,
        viirs_only_weight=viirs_only_weight,
        sensor=sensor,
        reference_records=all_records,
    )
    grid["sensor"] = sensor
    grid["period"] = period
    grid["start_date"] = start_date
    grid["end_date"] = end_date
    grid["data_source"] = data_source
    return grid
