import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_SRC = ROOT_DIR / "frontend" / "src"
sys.path.insert(0, str(BACKEND_DIR))

from app.config import REGIONS, parse_custom_bbox, resolve_region_config
from app.firms_client import get_fire_records, get_timeline_records
from app.harmonization import build_spatial_grid, build_timeline


def build_combined_tsx_source() -> str:
    """Concatenate frontend/src TypeScript/TSX modules into a single browser-ready TSX script for Babel Standalone."""
    order = [
        FRONTEND_SRC / "types.ts",
        FRONTEND_SRC / "dateUtils.ts",
        FRONTEND_SRC / "i18n.ts",
        FRONTEND_SRC / "api.ts",
        FRONTEND_SRC / "components" / "DateRangePickerPopover.tsx",
        FRONTEND_SRC / "components" / "FireMap.tsx",
        FRONTEND_SRC / "components" / "FireCalendarChart.tsx",
        FRONTEND_SRC / "components" / "HarmonizationLab.tsx",
        FRONTEND_SRC / "components" / "BurningHeatmap.tsx",
        FRONTEND_SRC / "components" / "CalendarMatrix.tsx",
        FRONTEND_SRC / "components" / "PitchModeModal.tsx",
        FRONTEND_SRC / "App.tsx",
    ]
    chunks = [
        """
const React = window.React;
const { useState, useEffect, useMemo, useCallback, useRef } = window.React;
const {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line, ReferenceLine
} = window.Recharts;
const {
  MapContainer, TileLayer, CircleMarker, Rectangle, Popup, useMap, useMapEvents
} = window.ReactLeaflet;
const {
  AlertTriangle, BarChart3, Crosshair, Download, Flame, FlaskConical, Globe,
  Grid3X3, Layers, LayoutGrid, MapPin, Presentation, Radio, Scan, ShieldAlert,
  SlidersHorizontal, X, Activity, Calendar, Eye, Moon, AlertOctagon, CheckCircle2,
  Sliders, ChevronLeft, ChevronRight, Mic, ChevronDown
} = window.LucideReact;
"""
    ]
    for path in order:
        code = path.read_text(encoding="utf-8")
        # Strip import statements (provided via globals above or same file)
        code = re.sub(r"^import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];?\s*$", "", code, flags=re.MULTILINE)
        # Replace import.meta.env.VITE_API_URL with window.location.origin
        code = code.replace("import.meta.env.VITE_API_URL", "window.location.origin")
        # Strip 'export default App;' and 'export ' keywords
        code = re.sub(r"^export\s+default\s+\w+;?\s*$", "", code, flags=re.MULTILINE)
        code = re.sub(r"^export\s+(interface|type|const|function|async\s+function)", r"\1", code, flags=re.MULTILINE)
        chunks.append(f"// --- {path.name} ---\n" + code)

    chunks.append(
        """
const rootEl = document.getElementById('root');
if (rootEl) {
  window.ReactDOM.createRoot(rootEl).render(window.React.createElement(App));
}
"""
    )
    return "\n\n".join(chunks)


INDEX_HTML_TEMPLATE = """<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Amazon Fire Calendar v2.0 — NASA Space Apps 2026</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="/style.css" />
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="module">
      import React from 'https://esm.sh/react@18.3.1';
      import ReactDOM from 'https://esm.sh/react-dom@18.3.1/client';
      import * as Recharts from 'https://esm.sh/recharts@2.12.7?deps=react@18.3.1,react-dom@18.3.1';
      import * as ReactLeaflet from 'https://esm.sh/react-leaflet@4.2.1?deps=react@18.3.1,react-dom@18.3.1,leaflet@1.9.4';
      import * as LucideReact from 'https://esm.sh/lucide-react@0.454.0?deps=react@18.3.1';

      window.React = React;
      window.ReactDOM = ReactDOM;
      window.Recharts = Recharts;
      window.ReactLeaflet = ReactLeaflet;
      window.LucideReact = LucideReact;

      const res = await fetch('/app-bundle.tsx');
      const tsxCode = await res.text();
      const compiled = window.Babel.transform(tsxCode, {
        filename: 'app.tsx',
        presets: ['typescript', ['react', { runtime: 'classic' }]],
      }).code;
      const runApp = new Function(compiled);
      runApp();
    </script>
  </head>
  <body>
    <div id="root">
      <div style="display:grid;place-items:center;height:100vh;color:#fdba74;font-family:system-ui;">
        Carregando Amazon Fire Calendar v2.0 (NASA Space Apps 2026)...
      </div>
    </div>
  </body>
</html>
"""


class PreviewHandler(BaseHTTPRequestHandler):
    def _send_json(self, data: dict, status: int = 200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _send_text(self, text: str, content_type: str, status: int = 200):
        raw = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        if path == "/" or path == "/index.html":
            self._send_text(INDEX_HTML_TEMPLATE, "text/html; charset=utf-8")
            return

        if path == "/style.css":
            css = (FRONTEND_SRC / "index.css").read_text(encoding="utf-8")
            self._send_text(css, "text/css; charset=utf-8")
            return

        if path == "/app-bundle.tsx":
            self._send_text(build_combined_tsx_source(), "text/plain; charset=utf-8")
            return

        if path == "/api/health":
            self._send_json({"status": "ok", "service": "amazon-fire-calendar", "version": "0.2.0"})
            return

        if path == "/api/regions":
            self._send_json(
                {
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
            )
            return

        try:
            custom_bbox = parse_custom_bbox(qs.get("bbox"))
        except ValueError as exc:
            self._send_json({"detail": str(exc)}, status=400)
            return

        region = qs.get("region", "amazonia_legal")
        daynight = qs.get("daynight", "all")
        min_confidence = qs.get("min_confidence", "all")

        start_date = qs.get("start_date")
        end_date = qs.get("end_date")
        period = qs.get("period")

        if path == "/api/fires":
            sensor = qs.get("sensor", "both")
            days = int(qs.get("days", "5"))
            limit = int(qs.get("limit", "800"))
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
                modis = [r for r in records if r["sensor"] == "MODIS"][:half]
                viirs = [r for r in records if r["sensor"] == "VIIRS"][: limit - len(modis)]
                sliced = modis + viirs
            else:
                sliced = records[:limit]
            self._send_json(
                {
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
            )
            return

        if path == "/api/timeline":
            granularity = qs.get("granularity", "month")
            sensor = qs.get("sensor", "both")
            weight = float(qs.get("viirs_only_weight", "0.85"))
            region_cfg = resolve_region_config(region, custom_bbox)
            records, data_source = get_timeline_records(
                region_id=region,
                days=7,
                custom_bbox=custom_bbox,
                daynight=daynight,
                min_confidence=min_confidence,
                sensor=sensor,
                period=period,
                start_date=start_date,
                end_date=end_date,
            )
            tl = build_timeline(records, region_cfg, granularity=granularity, viirs_only_weight=weight)
            tl["sensor"] = sensor
            tl["period"] = period
            tl["start_date"] = start_date
            tl["end_date"] = end_date
            tl["data_source"] = data_source
            self._send_json(tl)
            return

        if path == "/api/grid":
            sensor = qs.get("sensor", "both")
            days = int(qs.get("days", "7"))
            cell_size = float(qs.get("cell_size", "1.25"))
            weight = float(qs.get("viirs_only_weight", "0.85"))
            region_cfg = resolve_region_config(region, custom_bbox)
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
            grid = build_spatial_grid(records, region_cfg, cell_size=cell_size, viirs_only_weight=weight)
            grid["sensor"] = sensor
            grid["period"] = period
            grid["start_date"] = start_date
            grid["end_date"] = end_date
            grid["data_source"] = data_source
            self._send_json(grid)
            return

        self._send_json({"detail": "Not found"}, status=404)


if __name__ == "__main__":
    port = 8000
    server = HTTPServer(("127.0.0.1", port), PreviewHandler)
    print(f"Amazon Fire Calendar v2.0 live at http://localhost:{port}", flush=True)
    server.serve_forever()
