from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_regions():
    res = client.get("/api/regions")
    assert res.status_code == 200
    ids = {r["id"] for r in res.json()["regions"]}
    assert {
        "amazonia_legal",
        "norte_america_sul",
        "amazonas",
        "para",
        "mato_grosso",
        "rondonia",
        "acre",
    }.issubset(ids)


def test_region_polygon_filtering():
    from app.config import REGIONS, in_region

    br_legal = REGIONS["amazonia_legal"]
    south_am = REGIONS["norte_america_sul"]
    am_only = REGIONS["amazonas"]
    pa_only = REGIONS["para"]

    # Brazilian cities inside Legal Amazon
    for lon, lat in [(-60.02, -3.12), (-48.50, -1.46), (-56.10, -15.60), (-67.82, -9.97)]:
        assert in_region(lon, lat, br_legal)
        assert in_region(lon, lat, south_am)

    # Neighboring countries included in Northern South America, excluded from Brazil's Legal Amazon
    for lon, lat in [(-65.00, 5.00), (-55.50, 3.50), (-63.18, -17.78), (-73.25, -3.75)]:
        assert not in_region(lon, lat, br_legal)
        assert in_region(lon, lat, south_am)

    assert in_region(-60.02, -3.12, am_only)
    assert not in_region(-48.50, -1.46, am_only)
    assert in_region(-48.50, -1.46, pa_only)
    assert not in_region(-55.50, 3.50, pa_only)


def test_fires_filter_by_sensor_and_footprint():
    res_modis = client.get("/api/fires?region=amazonas&sensor=MODIS&limit=50")
    assert res_modis.status_code == 200
    data = res_modis.json()
    assert data["data_source"] in ("live_nasa_firms", "live_nasa_firms+history", "local_csv_fallback")
    assert data["returned_count"] > 0
    assert all(f["sensor"] == "MODIS" for f in data["fires"])
    assert "pixel_area_km2" in data["fires"][0]
    assert "scan" in data["fires"][0]

    res_viirs = client.get("/api/fires?region=amazonas&sensor=VIIRS&limit=50")
    assert res_viirs.status_code == 200
    viirs_data = res_viirs.json()
    assert viirs_data["returned_count"] > 0
    assert all(f["sensor"] == "VIIRS" for f in viirs_data["fires"])


def test_custom_aoi_bbox_and_filters():
    res = client.get("/api/fires?bbox=-65.0,-10.0,-58.0,-2.0&min_confidence=nominal")
    assert res.status_code == 200
    body = res.json()
    assert body["region"] == "custom_aoi"
    assert body["returned_count"] > 0
    for f in body["fires"]:
        assert -65.0 <= f["longitude"] <= -58.0
        assert -10.0 <= f["latitude"] <= -2.0
        assert f["confidence_level"] in ("nominal", "high")


def test_timeline_harmonization_and_diagnostics():
    res = client.get("/api/timeline?region=amazonia_legal&granularity=month&viirs_only_weight=0.85")
    assert res.status_code == 200
    body = res.json()
    assert 0.15 <= body["calibration_factor"] <= 0.50
    assert "summary" in body
    assert "diagnostics" in body
    diag = body["diagnostics"]
    for key in (
        "total_modis",
        "total_viirs",
        "coincident_viirs",
        "viirs_only_small_fires",
        "avg_modis_footprint_km2",
        "avg_viirs_footprint_km2",
        "effective_area_ratio",
        "total_frp_mw",
    ):
        assert key in diag
    for key in (
        "ytd_harmonized",
        "ytd_historical",
        "ytd_deviation_pct",
        "peak_period",
        "early_warning_status",
        "recommendation",
    ):
        assert key in body["summary"]
    assert len(body["series"]) >= 6
    first = body["series"][0]
    for key in (
        "period",
        "modis_raw",
        "viirs_raw",
        "viirs_normalized",
        "harmonized_total",
        "historical_avg",
        "alert_level",
        "coincident_viirs",
        "viirs_only_small",
        "modis_frp",
        "viirs_frp",
        "harmonized_frp",
        "anomaly_zscore",
    ):
        assert key in first


def test_grid_endpoint():
    res = client.get("/api/grid?region=amazonas")
    assert res.status_code == 200
    body = res.json()
    assert body["region"] == "amazonas"
    assert body["total_cells"] > 0
    cell = body["cells"][0]
    for key in (
        "id",
        "bounds",
        "center",
        "modis_raw",
        "viirs_raw",
        "viirs_normalized",
        "harmonized_index",
        "avg_frp",
        "avg_footprint_km2",
        "sensor_overlap",
        "severity",
    ):
        assert key in cell


def test_period_filter():
    all_res = client.get("/api/fires?region=amazonas")
    assert all_res.status_code == 200
    assert all_res.json()["total_count"] > 0

    tl_month = client.get("/api/timeline?region=amazonas&granularity=month").json()
    month_pt = tl_month["series"][0]
    month_period = month_pt["period"]
    filtered_month = client.get(f"/api/fires?region=amazonas&period={month_period}")
    assert filtered_month.status_code == 200
    body = filtered_month.json()
    assert body["period"] == month_period
    assert body["total_count"] == month_pt["modis_raw"] + month_pt["viirs_raw"]
    assert all(f["acq_date"].startswith(month_period) for f in body["fires"])

    grid_month = client.get(f"/api/grid?region=amazonas&period={month_period}")
    assert grid_month.status_code == 200
    assert grid_month.json()["period"] == month_period

    tl_week = client.get("/api/timeline?region=amazonas&granularity=week").json()
    week_period = tl_week["series"][0]["period"]
    filtered_week = client.get(f"/api/fires?region=amazonas&period={week_period}")
    assert filtered_week.status_code == 200
    assert filtered_week.json()["period"] == week_period


def test_date_range_and_sensor_integration():
    fires_aug = client.get("/api/fires?region=amazonia_legal&start_date=2026-08-01&end_date=2026-08-31&sensor=VIIRS")
    assert fires_aug.status_code == 200
    f_body = fires_aug.json()
    assert f_body["start_date"] == "2026-08-01"
    assert f_body["end_date"] == "2026-08-31"
    assert f_body["total_count"] > 0
    assert all("2026-08-01" <= f["acq_date"] <= "2026-08-31" and f["sensor"] == "VIIRS" for f in f_body["fires"])

    grid_viirs = client.get(
        "/api/grid?region=amazonia_legal&start_date=2026-08-01&end_date=2026-08-31&sensor=VIIRS&viirs_only_weight=0.5"
    )
    assert grid_viirs.status_code == 200
    g_body = grid_viirs.json()
    assert g_body["sensor"] == "VIIRS"
    assert g_body["start_date"] == "2026-08-01"
    assert all(cell["modis_raw"] == 0 for cell in g_body["cells"])

    tl_viirs = client.get("/api/timeline?region=amazonia_legal&start_date=2026-08-01&end_date=2026-09-30&sensor=VIIRS")
    assert tl_viirs.status_code == 200
    t_body = tl_viirs.json()
    assert t_body["sensor"] == "VIIRS"
    assert [pt["period"] for pt in t_body["series"]] == ["2026-08", "2026-09"]
    assert all(pt["modis_raw"] == 0 for pt in t_body["series"])


def test_november_2026_and_prior_year_queries():
    nov_res = client.get("/api/fires?region=amazonia_legal&start_date=2026-11-01&end_date=2026-11-14")
    assert nov_res.status_code == 200
    nov_body = nov_res.json()
    assert nov_body["total_count"] > 0
    assert all("2026-11-01" <= f["acq_date"] <= "2026-11-14" for f in nov_body["fires"])

    hist_res = client.get("/api/fires?region=amazonia_legal&period=2025-08")
    assert hist_res.status_code == 200
    hist_body = hist_res.json()
    assert hist_body["total_count"] > 0
    assert all(f["acq_date"].startswith("2025-08") for f in hist_body["fires"])


def test_firms_day_chunking_and_temporal_nrt_gating():
    from datetime import date
    from app import firms_client

    ref = date(2026, 11, 15)
    for d in range(1, 11):
        chunks = firms_client._build_day_chunks(d, ref_utc=ref)
        assert chunks, f"Expected non-empty chunks for days={d}"
        assert all(1 <= span <= 5 for span, _ in chunks)

    assert not firms_client._requests_live_nrt_window(7, period="2025-08", ref_utc=ref)
    assert not firms_client._requests_live_nrt_window(
        7, start_date="2026-08-01", end_date="2026-08-31", ref_utc=ref
    )
    assert firms_client._requests_live_nrt_window(7, period="2026-11", ref_utc=ref)
    assert firms_client._requests_live_nrt_window(7, ref_utc=ref)


def test_live_and_history_exact_date_merge_and_zero_row_handling(monkeypatch):
    from app import firms_client

    sample_live = [
        {
            "latitude": -8.5,
            "longitude": -55.5,
            "brightness": 330.0,
            "frp": 45.0,
            "confidence": "92",
            "confidence_level": "high",
            "scan": 1.1,
            "track": 1.0,
            "pixel_area_km2": 1.1,
            "acq_date": "2026-11-12",
            "acq_time": "1400",
            "satellite": "Terra",
            "sensor": "MODIS",
            "daynight": "D",
        }
    ]
    monkeypatch.setenv("FIRMS_MAP_KEY", "test_key_123")
    monkeypatch.setattr(firms_client, "_fetch_live_firms", lambda *a, **kw: list(sample_live))

    recs, src = firms_client.get_fire_records("amazonia_legal", period="2026-11", days=7)
    assert src == "live_nasa_firms+history"
    dates = {r["acq_date"] for r in recs}
    # Earlier November days outside live_dates must NOT be stripped
    assert "2026-11-01" in dates
    assert "2026-11-12" in dates

    # Valid empty live response must remain live (0 fires), not fall back to fake CSV
    monkeypatch.setattr(firms_client, "_fetch_live_firms", lambda *a, **kw: [])
    empty_recs, empty_src = firms_client.get_fire_records("acre", days=7)
    assert empty_src == "live_nasa_firms"
    assert empty_recs == []


def test_spatial_coincident_partition_matches_exact_geometry():
    import random
    from app.harmonization import _partition_coincident_vs_small_viirs

    rng = random.Random(42)
    records = []
    for _ in range(40):
        records.append(
            {
                "latitude": rng.uniform(-15.0, 2.0),
                "longitude": rng.uniform(-70.0, -48.0),
                "sensor": "MODIS",
                "scan": rng.uniform(0.9, 2.5),
            }
        )
    for _ in range(250):
        records.append(
            {
                "latitude": rng.uniform(-15.0, 2.0),
                "longitude": rng.uniform(-70.0, -48.0),
                "sensor": "VIIRS",
                "scan": 0.4,
            }
        )

    coinc, v_only = _partition_coincident_vs_small_viirs(records, proximity_deg=0.42)
    modis = [r for r in records if r["sensor"] == "MODIS"]
    viirs = [r for r in records if r["sensor"] == "VIIRS"]
    brute_c = sum(
        1
        for v in viirs
        if any(
            abs(v["latitude"] - m["latitude"]) <= 0.42 * max(1.0, min(2.0, m["scan"]))
            and abs(v["longitude"] - m["longitude"]) <= 0.42 * max(1.0, min(2.0, m["scan"]))
            for m in modis
        )
    )
    assert (coinc, v_only) == (brute_c, len(viirs) - brute_c)


def test_live_cache_preserves_unclipped_bbox_across_regions(monkeypatch):
    import time
    from app import firms_client
    from app.config import REGIONS

    monkeypatch.setenv("FIRMS_MAP_KEY", "test_key_cache")
    firms_client._LIVE_CACHE.clear()
    sa_area = ",".join(str(x) for x in REGIONS["norte_america_sul"].bbox)
    now = time.time()
    cached_rows = [
        {
            "latitude": -3.12,
            "longitude": -60.02,
            "brightness": 325.0,
            "frp": 22.0,
            "confidence": "90",
            "confidence_level": "high",
            "scan": 1.0,
            "track": 1.0,
            "pixel_area_km2": 1.0,
            "acq_date": "2026-11-12",
            "acq_time": "1400",
            "satellite": "Terra",
            "sensor": "MODIS",
            "daynight": "D",
        },
        {
            "latitude": 5.00,
            "longitude": -65.00,
            "brightness": 325.0,
            "frp": 22.0,
            "confidence": "90",
            "confidence_level": "high",
            "scan": 1.0,
            "track": 1.0,
            "pixel_area_km2": 1.0,
            "acq_date": "2026-11-12",
            "acq_time": "1405",
            "satellite": "Terra",
            "sensor": "MODIS",
            "daynight": "D",
        },
    ]
    firms_client._LIVE_CACHE[(sa_area, 7, "MODIS_NRT")] = (now, cached_rows)

    br_recs, br_src = firms_client.get_fire_records("amazonia_legal", sensor="MODIS", days=7)
    sa_recs, sa_src = firms_client.get_fire_records("norte_america_sul", sensor="MODIS", days=7)
    assert br_src == "live_nasa_firms"
    assert sa_src == "live_nasa_firms"
    assert len(br_recs) == 1
    assert br_recs[0]["longitude"] == -60.02
    assert len(sa_recs) == 2
    firms_client._LIVE_CACHE.clear()


def test_dynamic_historical_baseline_matches_prior_years():
    tl_am = client.get("/api/timeline?region=amazonas&granularity=month").json()
    by_period_am = {pt["period"]: pt for pt in tl_am["series"]}
    # September in Amazonas 2024-2025 CSV avg is 14.0 (previously overstated as hardcoded 20.0)
    assert by_period_am["2026-09"]["historical_avg"] == 14.0
    assert by_period_am["2026-08"]["historical_avg"] == 10.5
    assert by_period_am["2026-11"]["historical_avg"] == 4.0

    tl_pa = client.get("/api/timeline?region=para&granularity=month").json()
    by_period_pa = {pt["period"]: pt for pt in tl_pa["series"]}
    assert by_period_pa["2026-09"]["historical_avg"] == 9.0

    # Tiny sparse custom AOI safely falls back without zero/division issues
    tl_tiny = client.get("/api/timeline?bbox=-60.1,-3.2,-59.9,-3.0&granularity=month").json()
    assert all(pt["historical_avg"] >= 0.5 for pt in tl_tiny["series"])


def test_concurrent_live_fetches_single_flight(monkeypatch):
    """Concurrent cold requests for the same live source must share a single FIRMS download."""
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor
    from datetime import datetime, timezone
    from app import firms_client

    today_iso = datetime.now(timezone.utc).date().isoformat()
    monkeypatch.setenv("FIRMS_MAP_KEY", "test_dummy_key")
    monkeypatch.setattr(firms_client, "_LIVE_CACHE", {})
    monkeypatch.setattr(firms_client, "_FETCH_LOCKS", {})

    call_count = 0
    count_lock = threading.Lock()

    def fake_fetch_chunks(map_key, area_str, firms_source, label, chunks):
        nonlocal call_count
        time.sleep(0.05)
        with count_lock:
            call_count += 1
        return ([
            {
                "latitude": -5.0,
                "longitude": -60.0,
                "brightness": 325.0,
                "acq_date": today_iso,
                "acq_time": "1430",
                "satellite": "Terra",
                "sensor": "MODIS",
                "frp": 42.0,
                "confidence": "85",
                "confidence_level": "high",
                "scan": 1.0,
                "track": 1.0,
                "pixel_area_km2": 1.0,
                "daynight": "D",
            }
        ], 1)

    monkeypatch.setattr(firms_client, "_fetch_source_chunks", fake_fetch_chunks)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(firms_client.get_fire_records, "amazonia_legal", sensor="MODIS", days=7)
            for _ in range(3)
        ]
        results = [fut.result() for fut in futures]

    assert call_count == 1
    assert len(results) == 3
    for records, source in results:
        assert "live_nasa_firms" in source
        assert any(r["acq_date"] == today_iso for r in records)


def test_all_regions_seasonal_calendar_coherence():
    from fastapi.testclient import TestClient
    from app.config import REGIONS
    from app.main import app

    local_client = TestClient(app)

    for reg in REGIONS:
        res_both = local_client.get(
            f"/api/timeline?year=2026&granularity=month&region={reg}&sensor=both"
        )
        assert res_both.status_code == 200
        data_both = res_both.json()

        res_week = local_client.get(
            f"/api/timeline?year=2026&granularity=week&region={reg}&sensor=both"
        )
        assert res_week.status_code == 200
        data_week = res_week.json()

        res_modis = local_client.get(
            f"/api/timeline?year=2026&granularity=month&region={reg}&sensor=MODIS"
        )
        res_viirs = local_client.get(
            f"/api/timeline?year=2026&granularity=month&region={reg}&sensor=VIIRS"
        )
        assert res_modis.status_code == 200
        assert res_viirs.status_code == 200
        data_modis = res_modis.json()
        data_viirs = res_viirs.json()

        # Calibration factor must stay anchored to MODIS/VIIRS overlap regardless of sensor filter
        assert abs(data_both["calibration_factor"] - data_modis["calibration_factor"]) <= 1e-4
        assert abs(data_both["calibration_factor"] - data_viirs["calibration_factor"]) <= 1e-4

        # Monthly and weekly YTD historical totals must agree
        ytd_hist_m = data_both["summary"]["ytd_historical"]
        ytd_hist_w = data_week["summary"]["ytd_historical"]
        assert abs(ytd_hist_m - ytd_hist_w) <= 0.5, (
            f"{reg}: ytd_historical month={ytd_hist_m} != week={ytd_hist_w}"
        )

        # Rainy season (Jan-Apr) stays normal; peak falls in Aug/Sep and is elevated/critical
        by_period = {pt["period"]: pt for pt in data_both["series"]}
        for rainy_period in ("2026-01", "2026-02", "2026-03", "2026-04"):
            assert by_period[rainy_period]["alert_level"] == "normal", (
                f"{reg} {rainy_period} got {by_period[rainy_period]['alert_level']}"
            )

        peak_period = data_both["summary"]["peak_period"]
        assert peak_period in ("2026-08", "2026-09"), f"{reg}: unexpected peak={peak_period}"
        peak_pt = by_period[peak_period]
        assert peak_pt["deviation_pct"] > 20.0
        assert peak_pt["alert_level"] in ("elevated", "critical")

        # Single-sensor VIIRS mode must retain coincident classification from companion MODIS data
        viirs_by_period = {pt["period"]: pt for pt in data_viirs["series"]}
        assert viirs_by_period[peak_period]["coincident_viirs"] > 0


def test_all_map_views_use_calibrated_calendar_scale():
    tl_m = client.get("/api/timeline?region=amazonia_legal&granularity=month").json()
    nov_pt = next(p for p in tl_m["series"] if p["period"] == "2026-11")
    nov_expected_count = nov_pt["modis_raw"] + nov_pt["viirs_raw"]

    fires_oct = client.get("/api/fires?region=amazonia_legal&period=2026-10").json()
    fires_nov = client.get("/api/fires?region=amazonia_legal&period=2026-11").json()
    grid_nov = client.get("/api/grid?region=amazonia_legal&period=2026-11").json()

    assert fires_oct["live_unscaled"] is False
    assert fires_nov["live_unscaled"] is False
    assert grid_nov["live_unscaled"] is False
    assert fires_nov["total_count"] == nov_expected_count
    assert fires_nov["total_count"] <= fires_oct["total_count"]

    fires_live = client.get("/api/fires?region=amazonia_legal").json()
    assert fires_live["live_unscaled"] is False
    assert 30 <= fires_live["total_count"] <= fires_nov["total_count"]

    tl_w = client.get("/api/timeline?region=amazonia_legal&granularity=week").json()
    latest_week = tl_w["series"][-1]["period"]
    fires_week = client.get(f"/api/fires?region=amazonia_legal&period={latest_week}").json()
    grid_week = client.get(f"/api/grid?region=amazonia_legal&period={latest_week}").json()
    assert fires_week["live_unscaled"] is False
    assert grid_week["live_unscaled"] is False

    fires_30d = client.get("/api/fires?region=amazonia_legal&start_date=2026-10-16&end_date=2026-11-15").json()
    grid_ytd = client.get("/api/grid?region=amazonia_legal&start_date=2026-01-01&end_date=2026-11-15").json()
    fires_7d = client.get("/api/fires?region=amazonia_legal&start_date=2026-11-09&end_date=2026-11-15").json()
    assert fires_30d["live_unscaled"] is False
    assert grid_ytd["live_unscaled"] is False
    assert fires_7d["live_unscaled"] is False

    fires_raw = client.get("/api/fires?region=amazonia_legal&raw_live=true").json()
    assert fires_raw["live_unscaled"] is ("live_nasa_firms" in fires_raw["data_source"])
    assert fires_raw["total_count"] >= fires_live["total_count"]



