import csv
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
import io
import logging
import os
import time
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from .config import DEFAULT_VIIRS_TO_MODIS_FACTOR, REGIONS, RegionConfig, in_region, resolve_region_config

logger = logging.getLogger(__name__)

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "amazon_sample_fires.csv"
FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
_LIVE_CACHE: Dict[Tuple[str, int, str], Tuple[float, List[Dict[str, Any]]]] = {}
_BASELINE_CACHE: Dict[Tuple[str, Tuple[float, float, float, float]], Tuple[float, ...]] = {}
BASELINE_YEARS = ("2024", "2025")
CACHE_TTL_SECONDS = 300.0
VIIRS_PRIMARY_SOURCE = "VIIRS_NOAA20_NRT"
VIIRS_FALLBACK_SOURCES = ("VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT")


def _classify_confidence(raw_conf: str) -> str:
    """Normalize MODIS numeric (0-100) and VIIRS categorical (low/nominal/high) confidence."""
    val = raw_conf.strip().lower()
    if val in ("h", "high"):
        return "high"
    if val in ("n", "nominal"):
        return "nominal"
    if val in ("l", "low"):
        return "low"
    try:
        num = float(val)
        if num >= 80:
            return "high"
        if num >= 50:
            return "nominal"
        return "low"
    except ValueError:
        return "nominal"


def _normalize_row(row: Dict[str, str], default_sensor: Optional[str] = None) -> Dict[str, Any]:
    """Normalize a MODIS or VIIRS CSV row into a unified fire hotspot record with scan footprint."""
    instrument = (row.get("instrument") or default_sensor or "").strip().upper()
    if "VIIRS" in instrument:
        sensor = "VIIRS"
    elif "MODIS" in instrument:
        sensor = "MODIS"
    else:
        sensor = default_sensor or "VIIRS"

    brightness_raw = row.get("bright_ti4") or row.get("brightness") or "0"
    frp_raw = row.get("frp") or "0"
    confidence_raw = (row.get("confidence") or "nominal").strip()
    confidence_level = _classify_confidence(confidence_raw)

    default_dim = "1.0" if sensor == "MODIS" else "0.38"
    scan_km = float(row.get("scan") or default_dim)
    track_km = float(row.get("track") or default_dim)
    pixel_area_km2 = round(scan_km * track_km, 3)

    return {
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "brightness": float(brightness_raw),
        "frp": float(frp_raw),
        "confidence": confidence_raw,
        "confidence_level": confidence_level,
        "scan": round(scan_km, 2),
        "track": round(track_km, 2),
        "pixel_area_km2": pixel_area_km2,
        "acq_date": row["acq_date"].strip(),
        "acq_time": str(row.get("acq_time") or "0000").strip().zfill(4),
        "satellite": (row.get("satellite") or "").strip(),
        "sensor": sensor,
        "daynight": (row.get("daynight") or "D").strip().upper(),
    }


def _in_bbox(record: Dict[str, Any], bbox: Tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    return west <= record["longitude"] <= east and south <= record["latitude"] <= north


def _record_matches_period(acq_date: str, period_norm: str) -> bool:
    if "-W" in period_norm:
        try:
            iso_year, iso_week, _ = datetime.strptime(acq_date, "%Y-%m-%d").isocalendar()
            return f"{iso_year}-W{iso_week:02d}" == period_norm
        except ValueError:
            return False
    return acq_date.startswith(period_norm)


def _apply_filters(
    records: List[Dict[str, Any]],
    sensor: str = "both",
    daynight: str = "all",
    min_confidence: str = "all",
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sensor_norm = sensor.upper() if sensor.lower() in ("modis", "viirs") else "both"
    dn_norm = daynight.upper() if daynight.upper() in ("D", "N") else "all"
    conf_norm = min_confidence.lower() if min_confidence.lower() in ("nominal", "high") else "all"
    period_raw = period.strip() if period else ""
    period_norm = period_raw.upper() if "-w" in period_raw.lower() else period_raw
    start_norm = start_date.strip() if start_date else ""
    end_norm = end_date.strip() if end_date else ""

    filtered: List[Dict[str, Any]] = []
    for r in records:
        if sensor_norm != "both" and r["sensor"] != sensor_norm:
            continue
        if dn_norm != "all" and r.get("daynight", "D") != dn_norm:
            continue
        if conf_norm == "high" and r.get("confidence_level") != "high":
            continue
        if conf_norm == "nominal" and r.get("confidence_level") not in ("nominal", "high"):
            continue
        acq_date = str(r.get("acq_date", ""))
        if period_norm and not _record_matches_period(acq_date, period_norm):
            continue
        if start_norm and acq_date < start_norm:
            continue
        if end_norm and acq_date > end_norm:
            continue
        filtered.append(r)
    return filtered


def _requests_historical_year(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> bool:
    """Return True when any requested temporal parameter targets a prior baseline year (2024 or 2025)."""
    for val in (period, start_date, end_date):
        if val:
            norm = val.strip()
            if norm.startswith("2024") or norm.startswith("2025"):
                return True
    return False


def _load_local_csv(
    region: RegionConfig,
    include_prior_years: bool = False,
) -> List[Dict[str, Any]]:
    """Read fire hotspots from the bundled NASA FIRMS-formatted local CSV."""
    if not DATA_FILE.exists():
        logger.warning("Local fallback CSV not found at %s", DATA_FILE)
        return []

    records: List[Dict[str, Any]] = []
    with DATA_FILE.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            record = _normalize_row(row)
            if not include_prior_years and record["acq_date"] < "2026-01-01":
                continue
            if in_region(record["longitude"], record["latitude"], region):
                records.append(record)
    return records


def _build_day_chunks(
    days: int,
    ref_utc: Optional[date] = None,
) -> List[Tuple[int, Optional[str]]]:
    """
    Split a 1-10 day window into NASA FIRMS-compliant [1..5] day requests.
    NASA FIRMS /api/area/csv rejects day_range > 5 with HTTP 400.
    """
    clamped = max(1, min(days, 10))
    if clamped <= 5:
        return [(clamped, None)]

    today_utc = ref_utc or datetime.now(timezone.utc).date()
    chunks: List[Tuple[int, Optional[str]]] = []
    # Anchor 1 day extra back so UTC-4 Amazonia local date boundaries remain covered.
    cursor = today_utc - timedelta(days=clamped)
    while cursor < today_utc - timedelta(days=4):
        span = min(5, max(1, (today_utc - cursor).days))
        chunks.append((span, cursor.isoformat()))
        cursor += timedelta(days=span)
    chunks.append((min(5, clamped), None))
    return chunks


def _fetch_firms_csv(url: str, label: str) -> List[Dict[str, Any]]:
    """Download and parse a single NASA FIRMS area CSV response."""
    if httpx is not None:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(url)
            response.raise_for_status()
        text = response.text.strip()
    else:
        with urllib.request.urlopen(url, timeout=20.0) as resp:
            text = resp.read().decode("utf-8").strip()

    if not text or text.startswith("Invalid") or text.startswith("<!"):
        raise ValueError(f"NASA FIRMS returned invalid response: {text[:120]}")

    first_line = text.splitlines()[0].lower()
    if "latitude" not in first_line or "acq_date" not in first_line:
        raise ValueError(f"NASA FIRMS returned unexpected header: {first_line[:120]}")

    reader = csv.DictReader(io.StringIO(text))
    return [_normalize_row(row, default_sensor=label) for row in reader]


def _find_cached_enclosing_records(
    bbox: Tuple[float, float, float, float],
    clamped_days: int,
    firms_source: str,
    now: float,
) -> Optional[List[Dict[str, Any]]]:
    """Reuse fresh cached records from an enclosing bbox (e.g. Amazonia Legal -> Mato Grosso)."""
    west, south, east, north = bbox
    for (c_area, c_days, c_src), (ts, cached_records) in _LIVE_CACHE.items():
        if c_days != clamped_days or c_src != firms_source or now - ts >= CACHE_TTL_SECONDS:
            continue
        parts = [float(p) for p in c_area.split(",")]
        cw, cs, ce, cn = parts
        if cw <= west and cs <= south and ce >= east and cn >= north:
            return [r for r in cached_records if _in_bbox(r, bbox)]
    return None


def _dedupe_and_trim_live(records: List[Dict[str, Any]], clamped_days: int) -> List[Dict[str, Any]]:
    """Deduplicate multi-chunk overlaps and restrict records to the trailing `clamped_days` window."""
    deduped: List[Dict[str, Any]] = []
    seen: set = set()
    for r in records:
        key = (
            r["sensor"],
            round(r["latitude"], 5),
            round(r["longitude"], 5),
            r["acq_date"],
            r["acq_time"],
            r["satellite"],
        )
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    if not deduped:
        return []

    latest_rec_date = max(r["acq_date"] for r in deduped)
    latest_anchor = max(latest_rec_date, (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat())
    try:
        cutoff_date = (
            datetime.strptime(latest_anchor, "%Y-%m-%d").date() - timedelta(days=clamped_days - 1)
        ).isoformat()
    except ValueError:
        cutoff_date = ""

    trimmed = [r for r in deduped if not cutoff_date or r["acq_date"] >= cutoff_date]
    trimmed.sort(key=lambda r: (r["acq_date"], r["acq_time"], r["sensor"]))
    return trimmed


def _fetch_source_chunks(
    map_key: str,
    area_str: str,
    firms_source: str,
    label: str,
    chunks: List[Tuple[int, Optional[str]]],
) -> Tuple[List[Dict[str, Any]], int]:
    """Fetch all [1..5]-day chunks for a given FIRMS source; return records and ok chunk count."""
    collected: List[Dict[str, Any]] = []
    ok_chunks = 0
    for span, start_iso in chunks:
        suffix = f"/{span}/{start_iso}" if start_iso else f"/{span}"
        url = f"{FIRMS_BASE_URL}/{map_key}/{firms_source}/{area_str}{suffix}"
        try:
            chunk_rows = _fetch_firms_csv(url, label=label)
            collected.extend(chunk_rows)
            ok_chunks += 1
        except Exception as exc:
            logger.warning("NASA FIRMS chunk %s (%s) failed: %s", firms_source, suffix, exc)
    return collected, ok_chunks


def _fetch_live_firms(
    map_key: str,
    region: RegionConfig,
    days: int,
    sensor: str,
) -> List[Dict[str, Any]]:
    """Fetch near-real-time fire hotspots from the NASA FIRMS area CSV API using [1..5]-day chunks."""
    west, south, east, north = region.bbox
    area_str = f"{west},{south},{east},{north}"
    clamped_days = max(1, min(days, 10))
    chunks = _build_day_chunks(clamped_days)

    sensor_groups: List[Tuple[Tuple[str, ...], str]] = []
    if sensor in ("both", "MODIS"):
        sensor_groups.append((("MODIS_NRT",), "MODIS"))
    if sensor in ("both", "VIIRS"):
        sensor_groups.append(((VIIRS_PRIMARY_SOURCE,) + VIIRS_FALLBACK_SOURCES, "VIIRS"))

    records: List[Dict[str, Any]] = []
    now = time.time()
    total_ok_sources = 0

    for candidate_sources, label in sensor_groups:
        primary_source = candidate_sources[0]
        enclosing = _find_cached_enclosing_records(region.bbox, clamped_days, primary_source, now)
        if enclosing is not None:
            records.extend(enclosing)
            total_ok_sources += 1
            continue

        source_records: List[Dict[str, Any]] = []
        source_succeeded = False
        for firms_source in candidate_sources:
            rows, ok_chunks = _fetch_source_chunks(map_key, area_str, firms_source, label, chunks)
            if ok_chunks > 0:
                source_succeeded = True
                source_records = _dedupe_and_trim_live(rows, clamped_days)
                if source_records or firms_source == candidate_sources[-1]:
                    _LIVE_CACHE[(area_str, clamped_days, primary_source)] = (time.time(), source_records)
                    break

        if source_succeeded:
            total_ok_sources += 1
            records.extend(source_records)

    if total_ok_sources == 0:
        raise RuntimeError("All NASA FIRMS NRT requests failed")

    if region.polygon is not None:
        records = [r for r in records if in_region(r["longitude"], r["latitude"], region)]

    records.sort(key=lambda r: (r["acq_date"], r["acq_time"], r["sensor"]))
    return records


def _requests_live_nrt_window(
    days: int,
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ref_utc: Optional[date] = None,
) -> bool:
    """Return True if no temporal filter is active or if the requested range overlaps recent NRT days."""
    if not period and not start_date and not end_date:
        return True

    today_utc = ref_utc or datetime.now(timezone.utc).date()
    nrt_start = (today_utc - timedelta(days=max(days, 10) + 1)).isoformat()

    if end_date and end_date.strip() < nrt_start:
        return False
    if start_date and not end_date and start_date.strip() > (today_utc + timedelta(days=1)).isoformat():
        return False

    if period:
        p = period.strip()
        p_upper = p.upper()
        if "-W" in p_upper:
            try:
                week_end = datetime.strptime(f"{p_upper}-7", "%G-W%V-%u").date().isoformat()
                return week_end >= nrt_start
            except ValueError:
                return True
        if len(p) == 7 and p[4] == "-":
            try:
                year, month = int(p[:4]), int(p[5:7])
                next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
                month_end = (next_month - timedelta(days=1)).isoformat()
                return month_end >= nrt_start
            except ValueError:
                return True
        if len(p) == 4 and p.isdigit():
            return f"{p}-12-31" >= nrt_start

    return True


def _resample_evenly(items: List[Dict[str, Any]], target: int) -> List[Dict[str, Any]]:
    """Pick `target` records spread uniformly across `items` (repeating if target > len)."""
    if target <= 0 or not items:
        return []
    step = len(items) / target
    return [items[int(i * step) % len(items)] for i in range(target)]


def get_fire_records(
    region_id: str = "amazonia_legal",
    sensor: str = "both",
    days: int = 10,
    custom_bbox: Optional[Tuple[float, float, float, float]] = None,
    daynight: str = "all",
    min_confidence: str = "all",
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], str]:
    """Return fire records for a region and sensor, using live FIRMS if configured or CSV fallback."""
    region = resolve_region_config(region_id, custom_bbox)
    sensor_norm = sensor.upper() if sensor.lower() in ("modis", "viirs") else "both"
    map_key = os.getenv("FIRMS_MAP_KEY", "").strip()

    has_temporal_filter = bool(period or start_date or end_date)
    include_prior_years = _requests_historical_year(period, start_date, end_date)
    needs_live_nrt = _requests_live_nrt_window(days, period, start_date, end_date)

    if map_key and needs_live_nrt:
        try:
            live_records = _fetch_live_firms(map_key, region, days, sensor_norm)
            live_dates = {r["acq_date"] for r in live_records}
            if has_temporal_filter:
                historical = _load_local_csv(region, include_prior_years=include_prior_years)
                combined = [r for r in historical if r["acq_date"] not in live_dates] + live_records
                combined.sort(key=lambda r: (r["acq_date"], r["acq_time"]))
            else:
                combined = live_records
            records = _apply_filters(
                combined,
                sensor=sensor_norm,
                daynight=daynight,
                min_confidence=min_confidence,
                period=period,
                start_date=start_date,
                end_date=end_date,
            )
            if has_temporal_filter:
                has_live_in_result = any(r["acq_date"] in live_dates for r in records)
                source_label = "live_nasa_firms+history" if has_live_in_result else "local_csv_fallback"
            else:
                source_label = "live_nasa_firms"
            return records, source_label
        except Exception as exc:
            logger.warning("Live NASA FIRMS fetch failed (%s); falling back to local CSV.", exc)

    records = _load_local_csv(region, include_prior_years=include_prior_years)
    records = _apply_filters(
        records,
        sensor=sensor_norm,
        daynight=daynight,
        min_confidence=min_confidence,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    return records, "local_csv_fallback"


def compute_dynamic_historical_avg(region: RegionConfig) -> Tuple[float, ...]:
    """Compute regional monthly MODIS baseline from prior historical years (2024-2025) in DATA_FILE."""
    cache_key = (region.id, region.bbox)
    cached = _BASELINE_CACHE.get(cache_key)
    if cached is not None:
        return cached

    all_prior = [
        r for r in _load_local_csv(region, include_prior_years=True) if r["acq_date"][:4] in BASELINE_YEARS
    ]
    # Small custom AOIs with very sparse local history fall back to the area-scaled regional baseline.
    if len(all_prior) < 24:
        return region.historical_monthly_avg

    monthly_year_modis: Dict[Tuple[str, str], float] = {}
    for yr in BASELINE_YEARS:
        for m in range(1, 13):
            monthly_year_modis[(yr, f"{m:02d}")] = 0.0

    viirs_fallback_counts: Dict[Tuple[str, str], int] = {}
    for rec in all_prior:
        yr = rec["acq_date"][:4]
        mm = rec["acq_date"][5:7]
        ym_key = (yr, mm)
        if ym_key not in monthly_year_modis:
            continue
        if rec["sensor"] == "MODIS":
            monthly_year_modis[ym_key] += 1.0
        else:
            viirs_fallback_counts[ym_key] = viirs_fallback_counts.get(ym_key, 0) + 1

    averages = []
    for m in range(1, 13):
        mm = f"{m:02d}"
        year_vals = []
        for yr in BASELINE_YEARS:
            val = monthly_year_modis[(yr, mm)]
            if val <= 0.0 and viirs_fallback_counts.get((yr, mm), 0) > 0:
                val = viirs_fallback_counts[(yr, mm)] * DEFAULT_VIIRS_TO_MODIS_FACTOR
            year_vals.append(val)
        averages.append(round(max(0.5, sum(year_vals) / len(BASELINE_YEARS)), 2))

    result = tuple(averages)
    _BASELINE_CACHE[cache_key] = result
    return result


def with_dynamic_historical_baseline(region: RegionConfig) -> RegionConfig:
    """Return a RegionConfig whose historical_monthly_avg is calibrated to that region's 2024-2025 baseline."""
    dynamic_avg = compute_dynamic_historical_avg(region)
    if dynamic_avg == region.historical_monthly_avg:
        return region
    return replace(region, historical_monthly_avg=dynamic_avg)


def get_timeline_records(
    region_id: str = "amazonia_legal",
    days: int = 7,
    custom_bbox: Optional[Tuple[float, float, float, float]] = None,
    daynight: str = "all",
    min_confidence: str = "all",
    sensor: str = "both",
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], str]:
    """Combine multi-month local history with scaled live FIRMS NRT records for a coherent calendar."""
    region = with_dynamic_historical_baseline(resolve_region_config(region_id, custom_bbox))
    include_prior_years = _requests_historical_year(period, start_date, end_date)
    raw_historical = _load_local_csv(region, include_prior_years=include_prior_years)
    historical = _apply_filters(
        raw_historical,
        sensor=sensor,
        daynight=daynight,
        min_confidence=min_confidence,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    if (period or start_date or end_date) and not _requests_live_nrt_window(days, period, start_date, end_date):
        return historical, "local_csv_fallback"

    live, source = get_fire_records(
        region_id=region_id,
        sensor="both",
        days=days,
        custom_bbox=custom_bbox,
        daynight=daynight,
        min_confidence=min_confidence,
    )

    if source != "live_nasa_firms" or not live:
        return historical, ("local_csv_fallback" if source != "live_nasa_firms" else source)

    live_dates = {r["acq_date"] for r in live}
    by_month: Dict[str, List[Dict[str, Any]]] = {}
    for rec in live:
        ym = rec["acq_date"][:7]
        by_month.setdefault(ym, []).append(rec)

    base_historical = _apply_filters(
        raw_historical,
        sensor=sensor,
        daynight=daynight,
        min_confidence=min_confidence,
    )

    scaled_live: List[Dict[str, Any]] = []
    for ym, month_recs in by_month.items():
        live_modis = [r for r in month_recs if r["sensor"] == "MODIS"]
        live_viirs = [r for r in month_recs if r["sensor"] == "VIIRS"]
        live_m = len(live_modis)
        live_v = len(live_viirs)

        month_idx = max(0, min(11, int(ym.split("-")[1]) - 1))
        hist_month_avg = max(1.0, float(region.historical_monthly_avg[month_idx]))
        kept_csv_modis = sum(
            1
            for r in base_historical
            if r["acq_date"][:7] == ym and r["acq_date"] not in live_dates and r["sensor"] == "MODIS"
        )
        kept_csv_viirs = sum(
            1
            for r in base_historical
            if r["acq_date"][:7] == ym and r["acq_date"] not in live_dates and r["sensor"] == "VIIRS"
        )
        n_live_days = max(1, len({r["acq_date"] for r in month_recs}))
        expected_live_modis = max(12.0, hist_month_avg * 45.0 * n_live_days)

        if live_m > 0:
            raw_intensity = live_m / expected_live_modis
        else:
            raw_intensity = live_v / (expected_live_modis * 3.8)
        intensity = max(0.45, min(raw_intensity, 2.25))

        goal_modis = hist_month_avg * intensity
        raw_ratio = (live_v / live_m) if live_m > 0 else 4.0
        ratio_v_to_m = max(2.2, min(raw_ratio, 6.5))
        goal_viirs = goal_modis * ratio_v_to_m

        target_modis = max(
            1 if (live_m > 0 and kept_csv_modis == 0) else 0,
            int(round(goal_modis - kept_csv_modis)),
        )
        target_viirs = max(
            1 if live_v > 0 else 0,
            int(round(goal_viirs - kept_csv_viirs)),
        )

        if live_m > 0:
            scaled_live.extend(_resample_evenly(live_modis, target_modis))
        if live_v > 0:
            scaled_live.extend(_resample_evenly(live_viirs, target_viirs))

    merged = [r for r in base_historical if r["acq_date"] not in live_dates] + _apply_filters(
        scaled_live,
        sensor=sensor,
        daynight=daynight,
        min_confidence=min_confidence,
    )
    merged.sort(key=lambda r: (r["acq_date"], r["acq_time"]))
    merged = _apply_filters(
        merged,
        sensor=sensor,
        daynight=daynight,
        min_confidence=min_confidence,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )
    has_live_in_result = any(r["acq_date"] in live_dates for r in merged)
    return merged, ("live_nasa_firms+history" if has_live_in_result else "local_csv_fallback")
