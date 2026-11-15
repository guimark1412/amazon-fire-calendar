from pathlib import Path
import csv
import sys
from datetime import datetime, timedelta, timezone

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts import update_historical_csv as updater  # noqa: E402


def test_update_csv_appends_calibrated_new_day(tmp_path: Path, monkeypatch) -> None:
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    two_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()

    csv_path = tmp_path / "fires.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=updater.CSV_FIELDNAMES)
        writer.writeheader()
        writer.writerow(
            {
                "latitude": "-4.17277",
                "longitude": "-64.22538",
                "bright_ti4": "331.83",
                "scan": "0.38",
                "track": "0.38",
                "acq_date": two_days_ago,
                "acq_time": "0335",
                "satellite": "N20",
                "instrument": "VIIRS",
                "confidence": "nominal",
                "version": "2.0NRT",
                "bright_ti5": "307.73",
                "frp": "30.39",
                "daynight": "N",
            }
        )

    def fake_download(map_key: str, area_str: str, firms_source: str, days: int):
        if firms_source == "MODIS_NRT":
            return [
                {
                    "latitude": "-4.10",
                    "longitude": "-64.20",
                    "brightness": "345.0",
                    "scan": "1.2",
                    "track": "1.1",
                    "acq_date": yesterday,
                    "acq_time": "1530",
                    "satellite": "Terra",
                    "instrument": "MODIS",
                    "confidence": "85",
                    "version": "6.1NRT",
                    "bright_t31": "315.0",
                    "frp": "88.5",
                    "daynight": "D",
                },
                # Outside Legal Amazon polygon (e.g. Atlantic Ocean) must be filtered out
                {
                    "latitude": "0.0",
                    "longitude": "-30.0",
                    "brightness": "345.0",
                    "scan": "1.2",
                    "track": "1.1",
                    "acq_date": yesterday,
                    "acq_time": "1531",
                    "satellite": "Terra",
                    "instrument": "MODIS",
                    "confidence": "85",
                    "version": "6.1NRT",
                    "bright_t31": "315.0",
                    "frp": "88.5",
                    "daynight": "D",
                },
            ]
        return [
            {
                "latitude": "-4.12",
                "longitude": "-64.22",
                "bright_ti4": "350.0",
                "scan": "0.40",
                "track": "0.39",
                "acq_date": yesterday,
                "acq_time": "1600",
                "satellite": "N20",
                "instrument": "VIIRS",
                "confidence": "high",
                "version": "2.0NRT",
                "bright_ti5": "320.0",
                "frp": "22.1",
                "daynight": "D",
            },
            # Older than max_csv_date (should be ignored)
            {
                "latitude": "-4.15",
                "longitude": "-64.25",
                "bright_ti4": "350.0",
                "scan": "0.40",
                "track": "0.39",
                "acq_date": two_days_ago,
                "acq_time": "1600",
                "satellite": "N20",
                "instrument": "VIIRS",
                "confidence": "high",
                "version": "2.0NRT",
                "bright_ti5": "320.0",
                "frp": "22.1",
                "daynight": "D",
            },
        ]

    monkeypatch.setattr(updater, "_download_firms_raw_rows", fake_download)
    added = updater.update_csv(csv_path=csv_path, map_key="dummy-key", lookback_days=5, require_key=True)
    assert added >= 2

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    assert len(rows) == 1 + added
    assert all(r["longitude"] != "-30.0" for r in rows)
    assert any(r["acq_date"] == yesterday and r["instrument"] == "MODIS" for r in rows)
    assert any(r["acq_date"] == yesterday and r["instrument"] == "VIIRS" for r in rows)
