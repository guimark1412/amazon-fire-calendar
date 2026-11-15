"""Update backend/data/amazon_sample_fires.csv with calibrated new daily NASA FIRMS detections."""

from __future__ import annotations

import argparse
import calendar
import csv
from datetime import date, datetime, timedelta, timezone
import io
import os
from pathlib import Path
import sys
import urllib.request
from typing import Any, Dict, List, Optional, Sequence, Tuple

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import REGIONS, in_region  # noqa: E402
from app.firms_client import (  # noqa: E402
    DATA_FILE,
    FIRMS_BASE_URL,
    VIIRS_FALLBACK_SOURCES,
    VIIRS_PRIMARY_SOURCE,
    _resample_evenly,
)

CSV_FIELDNAMES: Tuple[str, ...] = (
    "latitude",
    "longitude",
    "bright_ti4",
    "scan",
    "track",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "version",
    "bright_ti5",
    "frp",
    "daynight",
)


def _download_firms_raw_rows(
    map_key: str,
    area_str: str,
    firms_source: str,
    days: int,
) -> List[Dict[str, str]]:
    """Fetch raw CSV rows from NASA FIRMS area endpoint for the trailing `days` window (1..5)."""
    span = max(1, min(days, 5))
    url = f"{FIRMS_BASE_URL}/{map_key}/{firms_source}/{area_str}/{span}"
    with urllib.request.urlopen(url, timeout=30.0) as resp:
        text = resp.read().decode("utf-8").strip()

    if not text or text.startswith("Invalid") or text.startswith("<!"):
        raise ValueError(f"NASA FIRMS returned invalid response for {firms_source}: {text[:120]}")

    first_line = text.splitlines()[0].lower()
    if "latitude" not in first_line or "acq_date" not in first_line:
        raise ValueError(f"NASA FIRMS returned unexpected header for {firms_source}: {first_line[:120]}")

    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _normalize_raw_to_schema(raw: Dict[str, str], default_instrument: str) -> Dict[str, str]:
    """Map NASA FIRMS MODIS/VIIRS raw columns into the unified CSV schema."""
    instrument = (raw.get("instrument") or default_instrument).strip().upper()
    bright_t4 = (raw.get("bright_ti4") or raw.get("brightness") or "330.0").strip()
    bright_t5 = (raw.get("bright_ti5") or raw.get("bright_t31") or "300.0").strip()
    return {
        "latitude": (raw.get("latitude") or "").strip(),
        "longitude": (raw.get("longitude") or "").strip(),
        "bright_ti4": bright_t4,
        "scan": (raw.get("scan") or ("1.0" if instrument == "MODIS" else "0.38")).strip(),
        "track": (raw.get("track") or ("1.0" if instrument == "MODIS" else "0.38")).strip(),
        "acq_date": (raw.get("acq_date") or "").strip(),
        "acq_time": str(raw.get("acq_time") or "0000").strip().zfill(4),
        "satellite": (raw.get("satellite") or "").strip(),
        "instrument": instrument,
        "confidence": (raw.get("confidence") or "nominal").strip(),
        "version": (raw.get("version") or ("6.1NRT" if instrument == "MODIS" else "2.0NRT")).strip(),
        "bright_ti5": bright_t5,
        "frp": (raw.get("frp") or "0.0").strip(),
        "daynight": (raw.get("daynight") or "D").strip().upper(),
    }


def _dedupe_rows(rows: Sequence[Dict[str, str]]) -> List[Dict[str, str]]:
    """Deduplicate fire hotspot rows by sensor, rounded coordinates, date, and time."""
    seen = set()
    out: List[Dict[str, str]] = []
    for row in rows:
        try:
            key = (
                row["instrument"],
                round(float(row["latitude"]), 5),
                round(float(row["longitude"]), 5),
                row["acq_date"],
                row["acq_time"],
            )
        except (KeyError, ValueError):
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _calibrate_day_rows(
    day_iso: str,
    modis_rows: List[Dict[str, str]],
    viirs_rows: List[Dict[str, str]],
    hist_month_avg: float,
) -> List[Dict[str, str]]:
    """Resample one UTC day's MODIS and VIIRS detections to match the calibrated CSV baseline."""
    year, month, _ = (int(part) for part in day_iso.split("-"))
    days_in_month = max(28, calendar.monthrange(year, month)[1])

    live_m = len(modis_rows)
    live_v = len(viirs_rows)
    expected_live_modis = max(12.0, hist_month_avg * 45.0)
    if live_m > 0:
        raw_intensity = live_m / expected_live_modis
    else:
        raw_intensity = live_v / (expected_live_modis * 3.8)
    intensity = max(0.45, min(raw_intensity, 2.25))

    goal_daily_modis = (hist_month_avg / days_in_month) * intensity
    raw_ratio = (live_v / live_m) if live_m > 0 else 4.0
    ratio_v_to_m = max(2.2, min(raw_ratio, 6.5))
    goal_daily_viirs = goal_daily_modis * ratio_v_to_m

    target_modis = max(1 if live_m > 0 else 0, int(round(goal_daily_modis)))
    target_viirs = max(1 if live_v > 0 else 0, int(round(goal_daily_viirs)))

    modis_sorted = sorted(modis_rows, key=lambda r: (r["acq_time"], r["latitude"], r["longitude"]))
    viirs_sorted = sorted(viirs_rows, key=lambda r: (r["acq_time"], r["latitude"], r["longitude"]))

    selected: List[Dict[str, str]] = []
    if modis_sorted:
        selected.extend(_resample_evenly(modis_sorted, target_modis))
    if viirs_sorted:
        selected.extend(_resample_evenly(viirs_sorted, target_viirs))
    return selected


def update_csv(
    csv_path: Path = DATA_FILE,
    map_key: Optional[str] = None,
    lookback_days: int = 5,
    require_key: bool = False,
) -> int:
    """Append complete UTC days newer than the CSV's latest date; return count of added rows."""
    key = (map_key if map_key is not None else os.getenv("FIRMS_MAP_KEY", "")).strip()
    if not key:
        msg = "FIRMS_MAP_KEY is not set; skipping historical CSV update."
        if require_key:
            raise RuntimeError(msg)
        print(msg)
        return 0

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        existing_rows = list(csv.DictReader(handle))

    max_csv_date = max((r["acq_date"].strip() for r in existing_rows if r.get("acq_date")), default="2024-01-01")
    yesterday_utc = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()

    if max_csv_date >= yesterday_utc:
        print(f"CSV already up to date through {max_csv_date} (yesterday UTC: {yesterday_utc}).")
        return 0

    region = REGIONS["amazonia_legal"]
    west, south, east, north = region.bbox
    area_str = f"{west},{south},{east},{north}"
    span = max(1, min(lookback_days, 5))

    raw_modis: List[Dict[str, str]] = []
    try:
        raw_modis = [
            _normalize_raw_to_schema(r, "MODIS")
            for r in _download_firms_raw_rows(key, area_str, "MODIS_NRT", span)
        ]
    except Exception as exc:
        print(f"Warning: MODIS_NRT fetch failed: {exc}")

    raw_viirs: List[Dict[str, str]] = []
    for viirs_source in (VIIRS_PRIMARY_SOURCE,) + VIIRS_FALLBACK_SOURCES:
        try:
            fetched = _download_firms_raw_rows(key, area_str, viirs_source, span)
            if fetched:
                raw_viirs = [_normalize_raw_to_schema(r, "VIIRS") for r in fetched]
                break
        except Exception as exc:
            print(f"Warning: {viirs_source} fetch failed: {exc}")

    by_day: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
    for row in _dedupe_rows(raw_modis + raw_viirs):
        acq_date = row["acq_date"]
        if not (max_csv_date < acq_date <= yesterday_utc):
            continue
        try:
            lon = float(row["longitude"])
            lat = float(row["latitude"])
        except ValueError:
            continue
        if not in_region(lon, lat, region):
            continue
        bucket = by_day.setdefault(acq_date, {"MODIS": [], "VIIRS": []})
        if row["instrument"] == "MODIS":
            bucket["MODIS"].append(row)
        else:
            bucket["VIIRS"].append(row)

    new_rows: List[Dict[str, str]] = []
    for day_iso in sorted(by_day):
        month_idx = max(0, min(11, int(day_iso.split("-")[1]) - 1))
        hist_avg = max(1.0, float(region.historical_monthly_avg[month_idx]))
        new_rows.extend(
            _calibrate_day_rows(
                day_iso=day_iso,
                modis_rows=by_day[day_iso]["MODIS"],
                viirs_rows=by_day[day_iso]["VIIRS"],
                hist_month_avg=hist_avg,
            )
        )

    if not new_rows:
        print(f"No new complete-day detections found after {max_csv_date} up to {yesterday_utc}.")
        return 0

    merged = existing_rows + new_rows
    merged.sort(key=lambda r: (r["acq_date"], r["acq_time"], r["instrument"]))

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(merged)

    print(
        f"Added {len(new_rows)} calibrated rows across {len(by_day)} day(s) "
        f"({min(by_day)}..{max(by_day)}) to {csv_path}."
    )
    return len(new_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Append new calibrated NASA FIRMS daily rows to historical CSV.")
    parser.add_argument("--days", type=int, default=5, help="Trailing NASA FIRMS days to inspect (1..5).")
    parser.add_argument(
        "--require-key",
        action="store_true",
        help="Exit with error if FIRMS_MAP_KEY is missing.",
    )
    args = parser.parse_args()
    update_csv(lookback_days=args.days, require_key=args.require_key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
