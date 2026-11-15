from collections import defaultdict
from datetime import datetime
import math
from typing import Any, Dict, List, Tuple

from .config import DEFAULT_VIIRS_TO_MODIS_FACTOR, RegionConfig


def compute_calibration_factor(records: List[Dict[str, Any]]) -> Tuple[float, str]:
    """Estimate the VIIRS -> MODIS scale factor from overlapping months and scan-track footprints."""
    monthly_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: {"MODIS": 0, "VIIRS": 0})
    modis_areas: List[float] = []
    viirs_areas: List[float] = []

    for rec in records:
        month_key = rec["acq_date"][:7]  # YYYY-MM
        sensor = rec["sensor"]
        monthly_counts[month_key][sensor] += 1
        area = float(rec.get("pixel_area_km2") or (1.0 if sensor == "MODIS" else 0.144))
        if sensor == "MODIS":
            modis_areas.append(area)
        else:
            viirs_areas.append(area)

    ratios: List[float] = []
    for counts in monthly_counts.values():
        if counts["MODIS"] >= 3 and counts["VIIRS"] >= 5:
            ratios.append(counts["MODIS"] / counts["VIIRS"])

    if ratios:
        empirical_factor = sum(ratios) / len(ratios)
        # Incorporate scan-angle footprint correction (VIIRS area / MODIS effective area)
        if modis_areas and viirs_areas:
            avg_m_area = sum(modis_areas) / len(modis_areas)
            avg_v_area = sum(viirs_areas) / len(viirs_areas)
            area_factor = min(0.45, max(0.14, (avg_v_area / max(0.5, avg_m_area)) * 1.65))
            blended = 0.75 * empirical_factor + 0.25 * area_factor
        else:
            blended = empirical_factor
        clamped = round(max(0.15, min(blended, 0.50)), 4)
        return clamped, "overlapping_spatiotemporal_calibration"

    return DEFAULT_VIIRS_TO_MODIS_FACTOR, "empirical_default"


def _classify_alert(harmonized_value: float, historical_avg: float) -> str:
    if historical_avg <= 0:
        return "normal"
    ratio = harmonized_value / historical_avg
    if ratio >= 1.35:
        return "critical"
    if ratio >= 1.10:
        return "elevated"
    return "normal"


def _partition_coincident_vs_small_viirs(
    period_records: List[Dict[str, Any]],
    proximity_deg: float = 0.42,
) -> Tuple[int, int]:
    """
    Partition VIIRS detections into:
    - coincident_viirs: VIIRS detections within proximity of a MODIS detection in the same time window
    - viirs_only_small: Unmatched VIIRS detections (smaller/cooler burns missed by MODIS 1km threshold)
    """
    modis_pts = [(r["latitude"], r["longitude"], float(r.get("scan", 1.0))) for r in period_records if r["sensor"] == "MODIS"]
    viirs_pts = [(r["latitude"], r["longitude"]) for r in period_records if r["sensor"] == "VIIRS"]

    if not viirs_pts:
        return 0, 0
    if not modis_pts:
        return 0, len(viirs_pts)

    cell_deg = max(0.05, proximity_deg * 2.0)
    modis_grid: Dict[Tuple[int, int], List[Tuple[float, float, float]]] = defaultdict(list)
    for m_lat, m_lon, m_scan in modis_pts:
        eff_radius = proximity_deg * max(1.0, min(2.0, m_scan))
        grid_key = (math.floor(m_lat / cell_deg), math.floor(m_lon / cell_deg))
        modis_grid[grid_key].append((m_lat, m_lon, eff_radius))

    coincident = 0
    viirs_only = 0
    for v_lat, v_lon in viirs_pts:
        cr = math.floor(v_lat / cell_deg)
        cc = math.floor(v_lon / cell_deg)
        matched = False
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                for m_lat, m_lon, eff_radius in modis_grid.get((cr + dr, cc + dc), ()):
                    if abs(v_lat - m_lat) <= eff_radius and abs(v_lon - m_lon) <= eff_radius:
                        matched = True
                        break
                if matched:
                    break
            if matched:
                break
        if matched:
            coincident += 1
        else:
            viirs_only += 1
    return coincident, viirs_only


def build_timeline(
    records: List[Dict[str, Any]],
    region: RegionConfig,
    granularity: str = "month",
    viirs_only_weight: float = 0.85,
) -> Dict[str, Any]:
    """
    Aggregate MODIS and VIIRS hotspots over time and harmonize VIIRS to MODIS scale.
    Accounts for:
    1. Overlapping empirical calibration & scan-track pixel area distortion
    2. Spatiotemporal coincidence vs. unmatched VIIRS-only small/cool fires
    3. Fire Radiative Power (FRP, MW) and Day/Night sensitivity split
    """
    factor, factor_source = compute_calibration_factor(records)

    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in records:
        date_str = rec["acq_date"]
        if granularity == "week":
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            iso_year, iso_week, _ = dt.isocalendar()
            key = f"{iso_year}-W{iso_week:02d}"
        else:
            key = date_str[:7]  # YYYY-MM
        buckets[key].append(rec)

    series: List[Dict[str, Any]] = []
    total_coincident = 0
    total_viirs_only = 0
    total_day = 0
    total_night = 0
    modis_areas_all: List[float] = []
    viirs_areas_all: List[float] = []
    total_frp_sum = 0.0

    for period in sorted(buckets.keys()):
        p_recs = buckets[period]
        modis_recs = [r for r in p_recs if r["sensor"] == "MODIS"]
        viirs_recs = [r for r in p_recs if r["sensor"] == "VIIRS"]

        modis_raw = len(modis_recs)
        viirs_raw = len(viirs_recs)

        coincident_viirs, viirs_only_small = _partition_coincident_vs_small_viirs(p_recs)
        total_coincident += coincident_viirs
        total_viirs_only += viirs_only_small

        # Weight unmatched VIIRS-only small fires slightly lower so small agricultural/cooler burns
        # do not artificially skew the 20-year MODIS historical trendline
        effective_viirs = coincident_viirs + (viirs_only_small * max(0.0, min(1.0, viirs_only_weight)))
        viirs_normalized = round(effective_viirs * factor, 2)

        if granularity == "week":
            try:
                month_idx = datetime.strptime(f"{period}-4", "%G-W%V-%u").month - 1
            except ValueError:
                month_idx = min(11, max(0, (int(period.split("-W")[1]) - 1) // 4))
            historical_avg = round(region.historical_monthly_avg[month_idx] / 4.0, 2)
        else:
            month_idx = int(period.split("-")[1]) - 1
            historical_avg = float(region.historical_monthly_avg[month_idx])

        # Harmonized index averages both sensors when both are present, or uses whichever is available
        if modis_raw > 0 and viirs_raw > 0:
            harmonized_total = round((modis_raw + viirs_normalized) / 2.0, 2)
        elif viirs_raw > 0:
            harmonized_total = viirs_normalized
        else:
            harmonized_total = float(modis_raw)

        deviation_pct = (
            round(((harmonized_total - historical_avg) / historical_avg) * 100.0, 1)
            if historical_avg > 0
            else 0.0
        )

        # Standardized anomaly Z-score approximation (assuming Poisson/historical variance ~0.28 * mean)
        std_est = max(1.0, historical_avg * 0.28)
        anomaly_zscore = round((harmonized_total - historical_avg) / std_est, 2)

        modis_frp = round(sum(float(r.get("frp", 0.0)) for r in modis_recs), 1)
        viirs_frp = round(sum(float(r.get("frp", 0.0)) for r in viirs_recs), 1)
        harmonized_frp = round(
            (modis_frp + viirs_frp * factor) / 2.0
            if (modis_raw > 0 and viirs_raw > 0)
            else (viirs_frp * factor if viirs_raw > 0 else modis_frp),
            1,
        )
        total_frp_sum += modis_frp + viirs_frp

        day_count = sum(1 for r in p_recs if r.get("daynight", "D") == "D")
        night_count = len(p_recs) - day_count
        total_day += day_count
        total_night += night_count

        m_areas = [float(r.get("pixel_area_km2", 1.0)) for r in modis_recs]
        v_areas = [float(r.get("pixel_area_km2", 0.144)) for r in viirs_recs]
        modis_areas_all.extend(m_areas)
        viirs_areas_all.extend(v_areas)

        series.append(
            {
                "period": period,
                "modis_raw": modis_raw,
                "viirs_raw": viirs_raw,
                "viirs_normalized": viirs_normalized,
                "harmonized_total": harmonized_total,
                "historical_avg": historical_avg,
                "deviation_pct": deviation_pct,
                "anomaly_zscore": anomaly_zscore,
                "alert_level": _classify_alert(harmonized_total, historical_avg),
                "coincident_viirs": coincident_viirs,
                "viirs_only_small": viirs_only_small,
                "modis_frp": modis_frp,
                "viirs_frp": viirs_frp,
                "harmonized_frp": harmonized_frp,
                "day_count": day_count,
                "night_count": night_count,
            }
        )

    ytd_harmonized = round(sum(item["harmonized_total"] for item in series), 1)
    ytd_historical = round(sum(item["historical_avg"] for item in series), 1)
    ytd_deviation_pct = (
        round(((ytd_harmonized - ytd_historical) / ytd_historical) * 100.0, 1)
        if ytd_historical > 0
        else 0.0
    )
    peak_period = max(series, key=lambda item: item["harmonized_total"])["period"] if series else "—"
    early_warning_status = _classify_alert(ytd_harmonized, ytd_historical)

    if early_warning_status == "critical":
        recommendation = (
            f"Alerta Crítico em {region.name}: curva acumulada está +{ytd_deviation_pct}% "
            "acima da média histórica MODIS. Recomenda-se mobilização antecipada de brigadas "
            "e foco nos quadrantes críticos antes do pico de seca."
        )
    elif early_warning_status == "elevated":
        recommendation = (
            f"Atenção Elevada em {region.name}: tendência acumulada ({ytd_deviation_pct:+.1f}%) "
            "supera a faixa histórica normal. Intensificar monitoramento por satélite e "
            "prontidão da Defesa Civil."
        )
    else:
        recommendation = (
            f"Situação dentro da normalidade histórica em {region.name} "
            f"({ytd_deviation_pct:+.1f}% vs. base MODIS). Manter monitoramento preventivo de rotina."
        )

    total_modis = sum(item["modis_raw"] for item in series)
    total_viirs = sum(item["viirs_raw"] for item in series)
    total_records = total_modis + total_viirs
    avg_modis_fp = round(sum(modis_areas_all) / len(modis_areas_all), 2) if modis_areas_all else 1.0
    avg_viirs_fp = round(sum(viirs_areas_all) / len(viirs_areas_all), 3) if viirs_areas_all else 0.144

    diagnostics = {
        "total_modis": total_modis,
        "total_viirs": total_viirs,
        "coincident_viirs": total_coincident,
        "viirs_only_small_fires": total_viirs_only,
        "viirs_only_pct": round((total_viirs_only / total_viirs) * 100.0, 1) if total_viirs > 0 else 0.0,
        "day_detections": total_day,
        "night_detections": total_night,
        "night_pct": round((total_night / total_records) * 100.0, 1) if total_records > 0 else 0.0,
        "avg_modis_footprint_km2": avg_modis_fp,
        "avg_viirs_footprint_km2": avg_viirs_fp,
        "effective_area_ratio": round(avg_modis_fp / max(0.05, avg_viirs_fp), 1),
        "total_frp_mw": round(total_frp_sum, 1),
        "avg_frp_mw": round(total_frp_sum / total_records, 1) if total_records > 0 else 0.0,
    }

    return {
        "region": region.id,
        "region_name": region.name,
        "granularity": granularity,
        "calibration_factor": factor,
        "calibration_source": factor_source,
        "summary": {
            "ytd_harmonized": ytd_harmonized,
            "ytd_historical": ytd_historical,
            "ytd_deviation_pct": ytd_deviation_pct,
            "peak_period": peak_period,
            "early_warning_status": early_warning_status,
            "recommendation": recommendation,
        },
        "diagnostics": diagnostics,
        "series": series,
    }


def build_spatial_grid(
    records: List[Dict[str, Any]],
    region: RegionConfig,
    cell_size: float = 1.25,
    viirs_only_weight: float = 0.85,
) -> Dict[str, Any]:
    """Aggregate hotspots into harmonized spatial grid cells over the region bounding box."""
    factor, _ = compute_calibration_factor(records)
    west, south, east, north = region.bbox

    buckets: Dict[Tuple[int, int], Dict[str, float]] = defaultdict(
        lambda: {
            "modis_raw": 0,
            "viirs_raw": 0,
            "frp_sum": 0.0,
            "area_sum": 0.0,
            "day_count": 0,
            "night_count": 0,
            "count": 0,
        }
    )

    for rec in records:
        col = int((rec["longitude"] - west) // cell_size)
        row = int((rec["latitude"] - south) // cell_size)
        cell = buckets[(row, col)]
        if rec["sensor"] == "MODIS":
            cell["modis_raw"] += 1
        else:
            cell["viirs_raw"] += 1
        cell["frp_sum"] += float(rec.get("frp", 0.0))
        cell["area_sum"] += float(rec.get("pixel_area_km2", 0.5))
        if rec.get("daynight", "D") == "N":
            cell["night_count"] += 1
        else:
            cell["day_count"] += 1
        cell["count"] += 1

    raw_cells: List[Dict[str, Any]] = []
    for (row, col), stats in buckets.items():
        cell_south = round(south + row * cell_size, 4)
        cell_north = round(min(north, cell_south + cell_size), 4)
        cell_west = round(west + col * cell_size, 4)
        cell_east = round(min(east, cell_west + cell_size), 4)
        modis_raw = int(stats["modis_raw"])
        viirs_raw = int(stats["viirs_raw"])
        weight_clamped = max(0.0, min(1.0, viirs_only_weight))
        effective_viirs = float(viirs_raw) if modis_raw > 0 else (viirs_raw * weight_clamped)
        viirs_normalized = round(effective_viirs * factor, 2)

        if modis_raw > 0 and viirs_raw > 0:
            harmonized_index = round((modis_raw + viirs_normalized) / 2.0, 2)
            sensor_overlap = "coincident"
        elif viirs_raw > 0:
            harmonized_index = viirs_normalized
            sensor_overlap = "viirs_only"
        else:
            harmonized_index = float(modis_raw)
            sensor_overlap = "modis_only"

        avg_frp = round(stats["frp_sum"] / stats["count"], 1) if stats["count"] > 0 else 0.0
        avg_footprint = round(stats["area_sum"] / stats["count"], 2) if stats["count"] > 0 else 0.5
        raw_cells.append(
            {
                "id": f"r{row}_c{col}",
                "bounds": [[cell_south, cell_west], [cell_north, cell_east]],
                "center": [
                    round((cell_south + cell_north) / 2.0, 4),
                    round((cell_west + cell_east) / 2.0, 4),
                ],
                "modis_raw": modis_raw,
                "viirs_raw": viirs_raw,
                "viirs_normalized": viirs_normalized,
                "harmonized_index": harmonized_index,
                "avg_frp": avg_frp,
                "avg_footprint_km2": avg_footprint,
                "day_count": int(stats["day_count"]),
                "night_count": int(stats["night_count"]),
                "sensor_overlap": sensor_overlap,
            }
        )

    if raw_cells:
        sorted_vals = sorted(c["harmonized_index"] for c in raw_cells)
        n_vals = len(sorted_vals)
        p75 = sorted_vals[min(n_vals - 1, int(0.75 * (n_vals - 1)))]
        p40 = sorted_vals[min(n_vals - 1, int(0.40 * (n_vals - 1)))]
        crit_thresh = max(3.0, p75)
        elev_thresh = max(1.5, p40)
        for c in raw_cells:
            val = c["harmonized_index"]
            if val >= crit_thresh:
                c["severity"] = "critical"
            elif val >= elev_thresh:
                c["severity"] = "elevated"
            else:
                c["severity"] = "normal"

    raw_cells.sort(key=lambda c: c["harmonized_index"], reverse=True)
    return {
        "region": region.id,
        "region_name": region.name,
        "cell_size": cell_size,
        "calibration_factor": factor,
        "total_cells": len(raw_cells),
        "cells": raw_cells,
    }
