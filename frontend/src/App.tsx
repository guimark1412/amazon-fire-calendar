import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Download,
  FlaskConical,
  Globe,
  Grid3X3,
  LayoutGrid,
  MapPin,
  Menu,
  Presentation,
  Radio,
  Scan,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getFires, getGrid, getRegions, getTimeline } from './api';
import { DateRangePickerPopover } from './components/DateRangePickerPopover';
import { currentYear } from './dateUtils';
import { FireCalendarChart } from './components/FireCalendarChart';
import { FireMap } from './components/FireMap';
import { InfoTooltip } from './components/InfoTooltip';
import { MobileDesktopNotice } from './components/MobileDesktopNotice';
import { SlidingToggleGroup } from './components/SlidingToggleGroup';
import type { WorkspaceView } from './components/PitchModeModal';
import { I18N, type Language } from './i18n';
import type {
  ChartViewMode,
  ConfidenceFilter,
  FireHotspot,
  FiresResponse,
  Granularity,
  GridCell,
  GridResponse,
  MapViewMode,
  RegionInfo,
  SensorFilter,
  TimelinePoint,
  TimelineResponse,
} from './types';

const BurningHeatmap = lazy(() =>
  import('./components/BurningHeatmap').then((m) => ({ default: m.BurningHeatmap })),
);
const CalendarMatrix = lazy(() =>
  import('./components/CalendarMatrix').then((m) => ({ default: m.CalendarMatrix })),
);
const EarlyWarningPopover = lazy(() =>
  import('./components/EarlyWarningPopover').then((m) => ({ default: m.EarlyWarningPopover })),
);
const HarmonizationLab = lazy(() =>
  import('./components/HarmonizationLab').then((m) => ({ default: m.HarmonizationLab })),
);
const PitchModeModal = lazy(() =>
  import('./components/PitchModeModal').then((m) => ({ default: m.PitchModeModal })),
);

const EMPTY_FIRES: FireHotspot[] = [];
const EMPTY_GRID_CELLS: GridCell[] = [];
const EMPTY_SERIES: TimelinePoint[] = [];

/** Close a floating popover on outside pointer down or Escape key press. */
function usePopoverDismiss(
  isOpen: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
  setOpen: (next: boolean) => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, anchorRef, setOpen]);
}

const LANG_STORAGE_KEY = 'afc_lang';

function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    // Ignore storage errors in restricted contexts
  }
  const prefs =
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : [];
  for (const tag of prefs) {
    const norm = (tag || '').toLowerCase();
    if (norm.startsWith('pt')) return 'pt';
    if (norm.startsWith('en')) return 'en';
  }
  return 'en';
}

export function App() {
  const [lang, setLang] = useState<Language>(detectInitialLanguage);
  const [rawLive, setRawLive] = useState<boolean>(false);
  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next: Language = prev === 'pt' ? 'en' : 'pt';
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next;
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  }, [lang]);
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('amazonia_legal');
  const [sensor, setSensor] = useState<SensorFilter>('both');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [minConfidence, setMinConfidence] = useState<ConfidenceFilter>('all');
  const [viirsOnlyWeight, setViirsOnlyWeight] = useState<number>(0.85);
  const [debouncedViirsWeight, setDebouncedViirsWeight] = useState<number>(0.85);

  const [subfiltersOpen, setSubfiltersOpen] = useState<boolean>(false);
  const [customBbox, setCustomBbox] = useState<[number, number, number, number] | null>(null);
  const [aoiPanelOpen, setAoiPanelOpen] = useState<boolean>(false);
  const [isDrawingAoi, setIsDrawingAoi] = useState<boolean>(false);
  const [bboxInputs, setBboxInputs] = useState<{
    west: string;
    south: string;
    east: string;
    north: string;
  }>({
    west: '-64.5',
    south: '-9.5',
    east: '-58.5',
    north: '-2.5',
  });

  const [chartMode, setChartMode] = useState<ChartViewMode>('harmonized');
  const [mapMode, setMapMode] = useState<MapViewMode>('points');
  const [pitchOpen, setPitchOpen] = useState<boolean>(false);
  const [pitchVisited, setPitchVisited] = useState<boolean>(false);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [scienceDetailsOpen, setScienceDetailsOpen] = useState<boolean>(false);
  const [aoiError, setAoiError] = useState<boolean>(false);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const aoiPopoverRef = useRef<HTMLDivElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
  const viewTabsRef = useRef<HTMLElement | null>(null);
  const tabBtnRefs = useRef<Record<WorkspaceView, HTMLButtonElement | null>>({
    overview: null,
    matrix: null,
    science: null,
  });
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const btn = tabBtnRefs.current[activeView];
      if (!btn || btn.offsetWidth === 0) {
        setTabIndicator((prev) => (prev.width === 0 ? prev : { left: 0, width: 0 }));
        return;
      }
      const nextLeft = btn.offsetLeft;
      const nextWidth = btn.offsetWidth;
      setTabIndicator((prev) =>
        prev.left === nextLeft && prev.width === nextWidth
          ? prev
          : { left: nextLeft, width: nextWidth },
      );
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    const navEl = viewTabsRef.current;
    const ro = navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateIndicator) : null;
    if (ro && navEl) ro.observe(navEl);

    return () => {
      window.removeEventListener('resize', updateIndicator);
      ro?.disconnect();
    };
  }, [activeView, lang]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  usePopoverDismiss(exportMenuOpen, exportMenuRef, setExportMenuOpen);
  usePopoverDismiss(aoiPanelOpen, aoiPopoverRef, setAoiPanelOpen);
  usePopoverDismiss(subfiltersOpen, filtersPopoverRef, setSubfiltersOpen);

  const [firesData, setFiresData] = useState<FiresResponse | null>(null);
  const [gridData, setGridData] = useState<GridResponse | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [loadingFires, setLoadingFires] = useState<boolean>(true);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(true);
  const [loadingGrid, setLoadingGrid] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loading = loadingFires || loadingTimeline || loadingGrid;
  const t = I18N[lang];
  const bboxParam = customBbox ? customBbox.join(',') : null;

  useEffect(() => {
    if (viirsOnlyWeight === debouncedViirsWeight) return;
    const timer = window.setTimeout(() => {
      setDebouncedViirsWeight(viirsOnlyWeight);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [viirsOnlyWeight, debouncedViirsWeight]);

  useEffect(() => {
    let cancelled = false;
    getRegions()
      .then((res) => {
        if (!cancelled) setRegions(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading regions');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  useEffect(() => {
    let cancelled = false;
    setLoadingFires(true);
    setError(null);

    getFires(selectedRegion, sensor, 7, 2000, {
      bbox: bboxParam,
      minConfidence,
      period: selectedPeriod,
      startDate: dateRange.start,
      endDate: dateRange.end,
      rawLive,
    })
      .then((firesRes) => {
        if (!cancelled) setFiresData(firesRes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Backend connection error (${err.message}).`
              : 'Error fetching data',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFires(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRegion, sensor, bboxParam, minConfidence, selectedPeriod, dateRange.start, dateRange.end, rawLive, retryNonce]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTimeline(true);
    setError(null);

    getTimeline(selectedRegion, granularity, {
      bbox: bboxParam,
      minConfidence,
      viirsOnlyWeight: debouncedViirsWeight,
      sensor,
    })
      .then((timelineRes) => {
        if (!cancelled) setTimelineData(timelineRes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Backend connection error (${err.message}).`
              : 'Error fetching data',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTimeline(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedRegion,
    granularity,
    bboxParam,
    minConfidence,
    debouncedViirsWeight,
    sensor,
    retryNonce,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadingGrid(true);
    const cellSize = customBbox
      ? Math.max(0.35, Math.min(1.2, Number(((customBbox[2] - customBbox[0]) / 6).toFixed(2))))
      : selectedRegion === 'amazonia_legal'
        ? 1.5
        : 0.8;

    getGrid(selectedRegion, 7, cellSize, {
      bbox: bboxParam,
      minConfidence,
      viirsOnlyWeight: debouncedViirsWeight,
      sensor,
      period: selectedPeriod,
      startDate: dateRange.start,
      endDate: dateRange.end,
      rawLive,
    })
      .then((gridRes) => {
        if (!cancelled) setGridData(gridRes);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? `Backend connection error (${err.message}).`
              : 'Error fetching data',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingGrid(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedRegion,
    bboxParam,
    minConfidence,
    debouncedViirsWeight,
    sensor,
    customBbox,
    selectedPeriod,
    dateRange.start,
    dateRange.end,
    rawLive,
    retryNonce,
  ]);

  const isRangeOver7Days = useMemo(() => {
    if (selectedPeriod) {
      return !/-W\d+/i.test(selectedPeriod);
    }
    if (dateRange.start && dateRange.end) {
      const startMs = Date.parse(`${dateRange.start}T00:00:00Z`);
      const endMs = Date.parse(`${dateRange.end}T00:00:00Z`);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        return Math.abs(endMs - startMs) / 86_400_000 >= 7;
      }
    }
    return false;
  }, [selectedPeriod, dateRange.start, dateRange.end]);

  const activeRegion = useMemo(() => {
    if (customBbox) {
      const [w, s, e, n] = customBbox;
      const span = Math.max(e - w, n - s);
      return {
        id: 'custom_aoi',
        name: `${t.aoiActiveLabel} (${s.toFixed(1)}°, ${w.toFixed(1)}° → ${n.toFixed(1)}°, ${e.toFixed(1)}°)`,
        bbox: customBbox,
        center: [Number(((s + n) / 2).toFixed(3)), Number(((w + e) / 2).toFixed(3))] as [
          number,
          number,
        ],
        zoom: span < 3 ? 8 : span < 6 ? 7 : span < 14 ? 6 : 5,
      };
    }
    return (
      regions.find((r) => r.id === selectedRegion) ?? {
        id: 'amazonia_legal',
        name: 'Amazônia Legal',
        bbox: [-74, -18, -44, 5.5] as [number, number, number, number],
        center: [-5.5, -59.5] as [number, number],
        zoom: 5,
      }
    );
  }, [regions, selectedRegion, customBbox, t.aoiActiveLabel]);

  const latestPeriod = useMemo(() => {
    const series = timelineData?.series ?? [];
    if (!series.length) return undefined;
    if (selectedPeriod) {
      const matched = series.find((item) => item.period === selectedPeriod);
      if (matched) return matched;
    }
    return series[series.length - 1];
  }, [timelineData, selectedPeriod]);
  const isLive = firesData?.data_source?.startsWith('live_nasa_firms') ?? false;
  const summary = timelineData?.summary;
  const calibrationFactor = timelineData?.calibration_factor ?? 0.25;
  const activeFilterCount = (minConfidence !== 'all' ? 1 : 0) + (viirsOnlyWeight !== 0.85 ? 1 : 0);
  const hasModifiedSubfilters = activeFilterCount > 0;
  const hasCustomControls =
    selectedRegion !== 'amazonia_legal' ||
    Boolean(customBbox) ||
    sensor !== 'both' ||
    granularity !== 'month' ||
    hasModifiedSubfilters;

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => {
      setIsMobileViewport(mq.matches);
      if (!mq.matches) setMobileMenuOpen(false);
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !aoiPanelOpen && !subfiltersOpen && !exportMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mobileMenuOpen, aoiPanelOpen, subfiltersOpen, exportMenuOpen]);

  const handleSelectPeriodFromViz = useCallback((period: string | null) => {
    setSelectedPeriod(period);
    if (period) {
      setDateRange({ start: null, end: null });
    }
  }, []);

  const handleSelectPeriodFromCalendar = useCallback((
    period: string | null,
    nextGranularity?: Granularity,
  ) => {
    setSelectedPeriod(period);
    setDateRange({ start: null, end: null });
    if (nextGranularity) {
      setGranularity(nextGranularity);
    }
  }, []);

  const handleApplyDateRange = useCallback((
    start: string | null,
    end: string | null,
    nextGranularity?: Granularity,
  ) => {
    setDateRange({ start, end });
    setSelectedPeriod(null);
    if (nextGranularity) {
      setGranularity(nextGranularity);
    }
  }, []);

  const handleClearPeriod = useCallback(() => {
    setSelectedPeriod(null);
  }, []);

  const handleApplyCoords = () => {
    const w = parseFloat(bboxInputs.west);
    const s = parseFloat(bboxInputs.south);
    const e = parseFloat(bboxInputs.east);
    const n = parseFloat(bboxInputs.north);
    if (!Number.isNaN(w) && !Number.isNaN(s) && !Number.isNaN(e) && !Number.isNaN(n) && w < e && s < n) {
      setAoiError(false);
      setCustomBbox([w, s, e, n]);
      setIsDrawingAoi(false);
      setAoiPanelOpen(false);
    } else {
      setAoiError(true);
    }
  };

  const handleMapSelectBbox = useCallback((bbox: [number, number, number, number]) => {
    setCustomBbox(bbox);
    setBboxInputs({
      west: String(bbox[0]),
      south: String(bbox[1]),
      east: String(bbox[2]),
      north: String(bbox[3]),
    });
    setIsDrawingAoi(false);
  }, []);

  const handleExportCsv = () => {
    if (!timelineData?.series.length) return;
    const headers = [
      'period',
      'modis_raw',
      'viirs_raw',
      'coincident_viirs',
      'viirs_only_small',
      'viirs_normalized',
      'harmonized_total',
      'historical_avg',
      'deviation_pct',
      'anomaly_zscore',
      'modis_frp',
      'viirs_frp',
      'harmonized_frp',
      'alert_level',
    ];
    const rows = timelineData.series.map((item) =>
      headers.map((h) => String(item[h as keyof typeof item] ?? '')).join(','),
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendario_harmonizado_${customBbox ? 'custom_aoi' : selectedRegion}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGeoJson = () => {
    const gridFeatures = (gridData?.cells ?? []).map((cell) => {
      const [[south, west], [north, east]] = cell.bounds;
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
        properties: {
          feature_kind: 'grid_cell',
          id: cell.id,
          modis_raw: cell.modis_raw,
          viirs_raw: cell.viirs_raw,
          viirs_normalized: cell.viirs_normalized,
          harmonized_index: cell.harmonized_index,
          avg_frp: cell.avg_frp,
          avg_footprint_km2: cell.avg_footprint_km2 ?? null,
          sensor_overlap: cell.sensor_overlap ?? null,
          severity: cell.severity,
        },
      };
    });

    const fireFeatures = (firesData?.fires ?? []).map((fire) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [fire.longitude, fire.latitude],
      },
      properties: {
        feature_kind: 'hotspot',
        sensor: fire.sensor,
        satellite: fire.satellite,
        acq_date: fire.acq_date,
        acq_time: fire.acq_time,
        frp: fire.frp,
        brightness: fire.brightness,
        confidence: fire.confidence,
        confidence_level: fire.confidence_level ?? null,
        pixel_area_km2: fire.pixel_area_km2 ?? null,
        daynight: fire.daynight,
      },
    }));

    const featureCollection = {
      type: 'FeatureCollection',
      metadata: {
        region: customBbox ? 'custom_aoi' : selectedRegion,
        sensor,
        period: selectedPeriod ?? null,
        start_date: dateRange.start,
        end_date: dateRange.end,
        exported_at: new Date().toISOString(),
      },
      features: [...gridFeatures, ...fireFeatures],
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: 'application/geo+json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const rangeSuffix = selectedPeriod
      ? `_${selectedPeriod}`
      : dateRange.start && dateRange.end
        ? `_${dateRange.start}_to_${dateRange.end}`
        : '';
    link.download = `focos_harmonizados_${customBbox ? 'custom_aoi' : selectedRegion}${rangeSuffix}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const utilityActionsNode = (
    <div className="controls utility-actions">
      {!isMobileViewport && (
        <button
          type="button"
          className={`control-select action-btn pitch-btn ${!pitchVisited && !pitchOpen ? 'pitch-btn--pulse' : ''}`}
          onClick={() => {
            setPitchVisited(true);
            setPitchOpen(true);
          }}
        >
          <Presentation size={15} />
          {t.pitchBtn}
        </button>
      )}

      <div className="export-dropdown-wrap" ref={exportMenuRef}>
        <button
          type="button"
          className="control-select action-btn"
          onClick={() => setExportMenuOpen((prev) => !prev)}
          aria-expanded={exportMenuOpen}
        >
          <Download size={15} />
          {t.exportBtnLabel}
          <ChevronDown size={14} />
        </button>

        {exportMenuOpen && (
          <div className="export-dropdown-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="export-dropdown-item"
              onClick={() => {
                handleExportCsv();
                setExportMenuOpen(false);
              }}
              disabled={!timelineData?.series.length}
            >
              <Download size={14} />
              {t.exportBtn}
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-dropdown-item"
              onClick={() => {
                handleExportGeoJson();
                setExportMenuOpen(false);
              }}
              disabled={!firesData?.fires.length && !gridData?.cells.length}
            >
              <Download size={14} />
              {t.exportGeoJsonBtn}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="control-select action-btn"
        onClick={toggleLang}
        aria-label="Switch language"
      >
        <Globe size={15} />
        {lang === 'pt' ? 'EN' : 'PT'}
      </button>
    </div>
  );

  const filterControlsNode = (
    <div className="controls filter-controls">
      <select
        className="control-select"
        value={selectedRegion}
        onChange={(e) => {
          const nextId = e.target.value;
          setSelectedRegion(nextId);
          setCustomBbox(null);
          const found = regions.find((r) => r.id === nextId);
          if (found) {
            setBboxInputs({
              west: String(found.bbox[0]),
              south: String(found.bbox[1]),
              east: String(found.bbox[2]),
              north: String(found.bbox[3]),
            });
          }
        }}
        aria-label="Region"
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      <div className="aoi-anchor" ref={aoiPopoverRef}>
        <button
          type="button"
          className={`control-select action-btn ${customBbox || aoiPanelOpen || isDrawingAoi ? 'aoi-active-btn' : ''}`}
          aria-expanded={aoiPanelOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setAoiError(false);
            setAoiPanelOpen((prev) => !prev);
          }}
        >
          <Crosshair size={14} />
          {t.customAoiBtn}
        </button>

        {aoiPanelOpen && (
          <div className="aoi-popover" role="dialog" aria-label={t.aoiPopoverTitle}>
            <div className="aoi-popover-header">
              <span className="aoi-popover-title">
                <Crosshair size={14} color="#38bdf8" />
                {t.aoiPopoverTitle}
              </span>
              <button
                type="button"
                className="aoi-popover-close"
                onClick={() => setAoiPanelOpen(false)}
                aria-label="Close AOI card"
              >
                <X size={14} />
              </button>
            </div>

            <p className="aoi-popover-desc">{t.aoiInstruction}</p>

            <div className="aoi-popover-actions">
              <button
                type="button"
                className={`control-select control-select-sm action-btn aoi-draw-btn ${isDrawingAoi ? 'pitch-btn' : ''}`}
                onClick={() => {
                  setActiveView('overview');
                  setIsDrawingAoi((prev) => !prev);
                  setAoiPanelOpen(false);
                  setMobileMenuOpen(false);
                }}
              >
                <Crosshair size={14} />
                {isDrawingAoi ? t.cancelDrawBtn : t.drawAoiBtn}
              </button>
              {customBbox && (
                <button
                  type="button"
                  className="control-select control-select-sm action-btn"
                  onClick={() => {
                    setCustomBbox(null);
                    setIsDrawingAoi(false);
                    setAoiError(false);
                    setAoiPanelOpen(false);
                  }}
                >
                  <X size={14} />
                  {t.clearAoiBtn}
                </button>
              )}
            </div>

            <div className="aoi-coords-grid">
              <label>
                <span>West (Lon)</span>
                <input
                  type="number"
                  step="0.5"
                  value={bboxInputs.west}
                  onChange={(e) => {
                    setAoiError(false);
                    setBboxInputs((s) => ({ ...s, west: e.target.value }));
                  }}
                />
              </label>
              <label>
                <span>South (Lat)</span>
                <input
                  type="number"
                  step="0.5"
                  value={bboxInputs.south}
                  onChange={(e) => {
                    setAoiError(false);
                    setBboxInputs((s) => ({ ...s, south: e.target.value }));
                  }}
                />
              </label>
              <label>
                <span>East (Lon)</span>
                <input
                  type="number"
                  step="0.5"
                  value={bboxInputs.east}
                  onChange={(e) => {
                    setAoiError(false);
                    setBboxInputs((s) => ({ ...s, east: e.target.value }));
                  }}
                />
              </label>
              <label>
                <span>North (Lat)</span>
                <input
                  type="number"
                  step="0.5"
                  value={bboxInputs.north}
                  onChange={(e) => {
                    setAoiError(false);
                    setBboxInputs((s) => ({ ...s, north: e.target.value }));
                  }}
                />
              </label>
            </div>

            {aoiError && <p className="aoi-error-hint">{t.aoiInvalidBounds}</p>}

            <button
              type="button"
              className="control-select action-btn pitch-btn aoi-apply-full"
              onClick={handleApplyCoords}
            >
              {t.applyCoordsBtn}
            </button>
          </div>
        )}
      </div>

      <SlidingToggleGroup
        ariaLabel="Sensor filter"
        value={sensor}
        onChange={setSensor}
        deps={[lang, mobileMenuOpen]}
        options={(['both', 'MODIS', 'VIIRS'] as SensorFilter[]).map((s) => ({
          value: s,
          label: (
            <>
              {s === 'both' ? t.both : s}
              {s === 'MODIS' && <InfoTooltip title="MODIS (1 km)" text={t.tips.sensorModis} insideButton />}
              {s === 'VIIRS' && <InfoTooltip title="VIIRS (375 m)" text={t.tips.sensorViirs} insideButton />}
            </>
          ),
        }))}
      />

      <SlidingToggleGroup
        ariaLabel="Granularity"
        value={granularity}
        onChange={(next) => {
          setGranularity(next);
          setSelectedPeriod(null);
        }}
        deps={[lang, mobileMenuOpen]}
        options={[
          { value: 'month', label: t.monthly },
          { value: 'week', label: t.weekly },
        ]}
      />

      <div className="aoi-anchor filters-anchor" ref={filtersPopoverRef}>
        <button
          type="button"
          className={`control-select action-btn ${subfiltersOpen || hasModifiedSubfilters ? 'aoi-active-btn' : ''}`}
          onClick={() => setSubfiltersOpen((prev) => !prev)}
          aria-expanded={subfiltersOpen}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal size={14} />
          {t.advFiltersBtn}
          {activeFilterCount > 0 && (
            <span className="filters-active-count">{activeFilterCount}</span>
          )}
        </button>

        {subfiltersOpen && (
          <div className="aoi-popover filters-popover" role="dialog" aria-label={t.advFiltersBtn}>
            <div className="aoi-popover-header">
              <span className="aoi-popover-title">
                <SlidersHorizontal size={14} color="#f97316" />
                {t.advFiltersBtn}
              </span>
              <button
                type="button"
                className="aoi-popover-close"
                onClick={() => setSubfiltersOpen(false)}
                aria-label="Close filters"
              >
                <X size={14} />
              </button>
            </div>

            <div className="filters-field">
              <label className="filters-field-label" htmlFor="filter-confidence-select">
                {lang === 'pt' ? 'Confiança NASA FIRMS' : 'NASA FIRMS Confidence'}
              </label>
              <select
                id="filter-confidence-select"
                className="control-select control-select-sm"
                value={minConfidence}
                onChange={(e) => setMinConfidence(e.target.value as ConfidenceFilter)}
              >
                <option value="all">{t.confAll}</option>
                <option value="nominal">{t.confNominal}</option>
                <option value="high">{t.confHigh}</option>
              </select>
            </div>

            <div className="filters-field">
              <span className="filters-field-label">
                <label htmlFor="filter-viirs-weight-select">{t.viirsWeightLabel}</label>
                <InfoTooltip title="VIIRS-Only" text={t.tips.viirsWeight} />
              </span>
              <select
                id="filter-viirs-weight-select"
                className="control-select control-select-sm"
                value={String(viirsOnlyWeight)}
                onChange={(e) => setViirsOnlyWeight(parseFloat(e.target.value))}
              >
                <option value="1">{lang === 'pt' ? '1.00× (Sem Desconto)' : '1.00× (No Discount)'}</option>
                <option value="0.85">{lang === 'pt' ? '0.85× (Padrão NASA)' : '0.85× (NASA Default)'}</option>
                <option value="0.7">{lang === 'pt' ? '0.70× (Conservador)' : '0.70× (Conservative)'}</option>
                <option value="0.5">{lang === 'pt' ? '0.50× (Foco Grandes Incêndios)' : '0.50× (Large Fires Focus)'}</option>
              </select>
            </div>

            {hasModifiedSubfilters && (
              <button
                type="button"
                className="control-select control-select-sm action-btn filters-reset-btn"
                onClick={() => {
                  setMinConfidence('all');
                  setViirsOnlyWeight(0.85);
                }}
              >
                {lang === 'pt' ? 'Restaurar padrão' : 'Reset defaults'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="workspace-header" data-tour="topbar">
        <div className="topbar-main">
          <div className="brand">
            <div className="brand-icon">
              <img src="/logo-calendar.png" alt="Amazon Fire Calendar" className="brand-logo-img" />
            </div>
            <div className="brand-text">
              <div className="brand-title-row">
                <h1>Amazon Fire Calendar</h1>
                <span className={`badge badge-compact ${isLive ? 'badge-live' : 'badge-elevated'}`}>
                  <Radio size={12} />
                  {loading ? t.syncing : isLive ? t.sourceLive : t.sourceFallback}
                </span>
              </div>
              {!isMobileViewport && <p>{t.subtitle}</p>}
            </div>
          </div>

          <nav
            ref={viewTabsRef}
            className={`view-tabs ${tabIndicator.width > 0 ? 'has-indicator' : ''}`}
            data-tour="view-tabs"
            aria-label="Workspace views"
          >
            {tabIndicator.width > 0 && (
              <span
                className="view-tab-indicator"
                aria-hidden="true"
                style={{
                  transform: `translate3d(${tabIndicator.left}px, 0, 0)`,
                  width: `${tabIndicator.width}px`,
                }}
              />
            )}
            <button
              ref={(el) => {
                tabBtnRefs.current.overview = el;
              }}
              type="button"
              className={`view-tab ${activeView === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveView('overview')}
            >
              <LayoutGrid size={15} />
              {t.tabOverview}
            </button>
            <button
              ref={(el) => {
                tabBtnRefs.current.matrix = el;
              }}
              type="button"
              className={`view-tab ${activeView === 'matrix' ? 'active' : ''}`}
              onClick={() => setActiveView('matrix')}
            >
              <Calendar size={15} />
              {t.tabMatrix}
            </button>
            <button
              ref={(el) => {
                tabBtnRefs.current.science = el;
              }}
              type="button"
              className={`view-tab ${activeView === 'science' ? 'active' : ''}`}
              onClick={() => setActiveView('science')}
            >
              <FlaskConical size={15} />
              {t.tabScience}
            </button>
          </nav>

          {!isMobileViewport ? (
            utilityActionsNode
          ) : (
            <button
              type="button"
              className={`mobile-menu-trigger ${mobileMenuOpen ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={t.mobileControlsTitle}
            >
              {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
              {hasCustomControls && !mobileMenuOpen && <span className="mobile-menu-dot" aria-hidden="true" />}
            </button>
          )}
        </div>

        <div className="filter-kpi-strip">
          {!isMobileViewport && filterControlsNode}

          <div className="kpi-inline-group">
            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>{isMobileViewport ? t.kpiHotspotsShort : t.kpiHotspots}</span>
                {!isMobileViewport && <InfoTooltip title={t.kpiHotspots} text={t.tips.kpiHotspots} />}
              </span>
              <strong className="kpi-mini-value">
                {firesData ? firesData.total_count.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') : '—'}
              </strong>
            </div>

            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>{isMobileViewport ? t.kpiFactorShort : t.kpiFactor}</span>
                {!isMobileViewport && <InfoTooltip title={t.kpiFactor} text={t.tips.kpiFactor} />}
              </span>
              <strong className="kpi-mini-value">
                {timelineData ? `× ${timelineData.calibration_factor}` : '—'}
              </strong>
            </div>

            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>
                  {isMobileViewport
                    ? latestPeriod
                      ? `Status · ${latestPeriod.period}`
                      : 'Status'
                    : `${t.kpiAlert} ${latestPeriod ? `(${latestPeriod.period})` : ''}`}
                </span>
                {!isMobileViewport && <InfoTooltip title={t.kpiAlert} text={t.tips.kpiAlert} />}
              </span>
              <div className="kpi-mini-alert">
                {latestPeriod ? (
                  <>
                    <span className={`badge badge-${latestPeriod.alert_level}`}>
                      <AlertTriangle size={11} />
                      {t.alertLabels[latestPeriod.alert_level]}
                    </span>
                    <strong className={`dev-${latestPeriod.alert_level}`}>
                      {latestPeriod.deviation_pct >= 0 ? '+' : ''}
                      {latestPeriod.deviation_pct}%
                    </strong>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isMobileViewport && mobileMenuOpen && (
        <>
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="mobile-controls-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t.mobileControlsTitle}
          >
            <div className="mobile-drawer-header">
              <span className="mobile-drawer-title">{t.mobileControlsTitle}</span>
              <button
                type="button"
                className="aoi-popover-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close controls"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">{t.mobileFiltersSection}</span>
              {filterControlsNode}
            </div>
            <div className="mobile-drawer-section">
              <span className="mobile-drawer-section-label">{t.mobileActionsSection}</span>
              {utilityActionsNode}
            </div>
          </aside>
        </>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <div className="error-banner-text">
            <strong>{error}</strong>
            {(error.includes('Failed to fetch') ||
              error.includes('502') ||
              error.includes('503') ||
              error.includes('504')) && (
              <span className="error-banner-detail">{t.backendWakeHint}</span>
            )}
          </div>
          <button
            type="button"
            className="control-select action-btn"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            {t.retryBtn}
          </button>
        </div>
      )}

      {activeView === 'overview' && (
        <>
          <div className="map-period-inline-row overview-period-bar">
            <DateRangePickerPopover
              variant="inline"
              startDate={dateRange.start}
              endDate={dateRange.end}
              granularity={granularity}
              selectedPeriod={selectedPeriod}
              rawLive={rawLive}
              lang={lang}
              onApplyRange={handleApplyDateRange}
              onSelectPeriod={handleSelectPeriodFromCalendar}
              onClearPeriod={handleClearPeriod}
              onToggleRawLive={(next) => {
                setRawLive(next);
              }}
            />

            {isDrawingAoi && (
              <div className="active-aoi-pill">
                <Crosshair size={13} />
                <span>{t.aoiDrawingBanner}</span>
                <button
                  type="button"
                  className="aoi-clear-inline"
                  onClick={() => setIsDrawingAoi(false)}
                >
                  <X size={13} />
                  {t.cancelDrawBtn}
                </button>
              </div>
            )}

            {customBbox && !isDrawingAoi && (
              <div className="active-aoi-pill">
                <Crosshair size={13} />
                <span>{activeRegion.name}</span>
                <button
                  type="button"
                  className="aoi-clear-inline"
                  onClick={() => {
                    setCustomBbox(null);
                    setIsDrawingAoi(false);
                  }}
                >
                  <X size={13} />
                  {t.clearAoiBtn}
                </button>
              </div>
            )}
          </div>

          <main className="main-grid">
            <section className="panel" data-tour="map-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title panel-title-inline">
                    <span>{t.mapTitle(activeRegion.name)}</span>
                    {!rawLive && isRangeOver7Days && (
                      <span className="map-warning-tip-wrap">
                        <InfoTooltip
                          variant="warning"
                          title={t.tips.liveUnscaledTitle}
                          text={t.tips.liveUnscaledTip}
                        />
                      </span>
                    )}
                  </h2>
                  <p className="panel-subtitle">
                    {mapMode === 'grid'
                      ? t.mapSubGrid(gridData?.total_cells ?? 0)
                      : mapMode === 'footprints'
                        ? t.mapSubFootprints
                        : t.mapSubPoints}
                  </p>
                </div>
                <SlidingToggleGroup
                  ariaLabel="Map mode"
                  value={mapMode}
                  onChange={setMapMode}
                  deps={[lang]}
                  options={[
                    {
                      value: 'points',
                      label: (
                        <>
                          <MapPin size={14} />
                          {t.pointsBtn}
                        </>
                      ),
                    },
                    {
                      value: 'footprints',
                      label: (
                        <>
                          <Scan size={14} />
                          {t.footprintsBtn}
                          <InfoTooltip title={t.footprintsBtn} text={t.tips.mapFootprints} insideButton />
                        </>
                      ),
                    },
                    {
                      value: 'grid',
                      label: (
                        <>
                          <Grid3X3 size={14} />
                          {t.gridBtn}
                          <InfoTooltip title={t.gridBtn} text={t.tips.mapGrid} insideButton />
                        </>
                      ),
                    },
                  ]}
                />
              </div>

              <FireMap
                fires={firesData?.fires ?? EMPTY_FIRES}
                gridCells={gridData?.cells ?? EMPTY_GRID_CELLS}
                viewMode={mapMode}
                sensor={sensor}
                center={activeRegion.center}
                zoom={activeRegion.zoom}
                lang={lang}
                customBbox={customBbox}
                isDrawingAoi={isDrawingAoi}
                onSelectBbox={handleMapSelectBbox}
                startDate={dateRange.start}
                endDate={dateRange.end}
                selectedPeriod={selectedPeriod}
                isLoading={loadingFires || loadingGrid}
              />

              <div className="legend-row">
                {mapMode === 'grid' ? (
                  <>
                    <span>
                      <span className="legend-dot" style={{ background: '#ef4444' }} />
                      {t.legendCrit}
                    </span>
                    <span>
                      <span className="legend-dot" style={{ background: '#f59e0b' }} />
                      {t.legendElev}
                    </span>
                    <span>
                      <span className="legend-dot" style={{ background: '#10b981' }} />
                      {t.legendNorm}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <span className="legend-dot" style={{ background: '#f59e0b' }} />
                      {t.legendModis}
                    </span>
                    <span>
                      <span className="legend-dot" style={{ background: '#ef4444' }} />
                      {t.legendViirs}
                    </span>
                  </>
                )}
                {customBbox && (
                  <span>
                    <span className="legend-dot" style={{ background: '#38bdf8' }} />
                    {t.legendAoi}
                  </span>
                )}
              </div>
            </section>

            <section className="panel" data-tour="chart-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">{t.chartTitle}</h2>
                  <p className="panel-subtitle">
                    {chartMode === 'raw'
                      ? t.chartSubRaw
                      : chartMode === 'coincidence'
                        ? t.chartSubCoincidence
                        : chartMode === 'frp'
                          ? t.chartSubFrp
                          : t.chartSubHarm}{' '}
                    · {t.clickBarHint}
                  </p>
                </div>

                <SlidingToggleGroup
                  ariaLabel="Chart mode"
                  value={chartMode}
                  onChange={setChartMode}
                  deps={[lang]}
                  options={[
                    {
                      value: 'harmonized',
                      label: (
                        <>
                          {t.chartModeHarm}
                          <InfoTooltip title={t.chartModeHarm} text={t.tips.chartHarm} insideButton />
                        </>
                      ),
                    },
                    {
                      value: 'raw',
                      label: (
                        <>
                          {t.chartModeRaw}
                          <InfoTooltip title={t.chartModeRaw} text={t.tips.chartRaw} insideButton />
                        </>
                      ),
                    },
                    {
                      value: 'coincidence',
                      label: (
                        <>
                          {t.chartModeCoinc}
                          <InfoTooltip title={t.chartModeCoinc} text={t.tips.chartCoinc} insideButton />
                        </>
                      ),
                    },
                    {
                      value: 'frp',
                      label: (
                        <>
                          {t.chartModeFrp}
                          <InfoTooltip title="FRP (MW)" text={t.tips.frp} insideButton />
                        </>
                      ),
                    },
                  ]}
                />
              </div>

              <FireCalendarChart
                series={timelineData?.series ?? EMPTY_SERIES}
                chartMode={chartMode}
                sensor={sensor}
                lang={lang}
                selectedPeriod={selectedPeriod}
                onSelectPeriod={handleSelectPeriodFromViz}
              />
            </section>
          </main>
        </>
      )}

      {activeView === 'matrix' && (
        <div className="matrix-view-stack">
          <div className="map-period-inline-row matrix-top-bar" style={{ marginTop: 0 }}>
            <DateRangePickerPopover
              variant="inline"
              startDate={dateRange.start}
              endDate={dateRange.end}
              granularity={granularity}
              selectedPeriod={selectedPeriod}
              rawLive={rawLive}
              lang={lang}
              onApplyRange={handleApplyDateRange}
              onSelectPeriod={handleSelectPeriodFromCalendar}
              onClearPeriod={handleClearPeriod}
              onToggleRawLive={(next) => {
                setRawLive(next);
              }}
            />
            <Suspense fallback={null}>
              <EarlyWarningPopover summary={summary} regionName={activeRegion.name} lang={lang} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <BurningHeatmap
              series={timelineData?.series ?? EMPTY_SERIES}
              lang={lang}
              selectedPeriod={selectedPeriod}
              onSelectPeriod={handleSelectPeriodFromViz}
            />
            <CalendarMatrix
              series={timelineData?.series ?? EMPTY_SERIES}
              lang={lang}
              selectedPeriod={selectedPeriod}
              onSelectPeriod={handleSelectPeriodFromViz}
            />
          </Suspense>
        </div>
      )}

      {activeView === 'science' && (
        <div className="science-view-stack">
          <Suspense fallback={null}>
            <HarmonizationLab
              diagnostics={timelineData?.diagnostics}
              summary={summary}
              calibrationFactor={calibrationFactor}
              viirsOnlyWeight={viirsOnlyWeight}
              onChangeViirsWeight={setViirsOnlyWeight}
              lang={lang}
            />
          </Suspense>

          <section className="panel science-section">
            <button
              type="button"
              className="science-collapse-trigger"
              onClick={() => setScienceDetailsOpen((prev) => !prev)}
              aria-expanded={scienceDetailsOpen}
            >
              <span className="science-collapse-title">
                <FlaskConical size={18} color="#f97316" />
                {t.scienceMethodToggle}
              </span>
              {scienceDetailsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {scienceDetailsOpen && (
              <div className="editorial-pillars-grid">
                {t.modalPillars.map((pillar, idx) => (
                  <div key={pillar.title} className="editorial-pillar">
                    <span className="editorial-pillar-num">0{idx + 1}</span>
                    <strong>{pillar.title.replace(/^\d+\.\s*/, '')}</strong>
                    <p>{pillar.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {pitchOpen && (
        <Suspense fallback={null}>
          <PitchModeModal
            open={pitchOpen}
            onClose={() => setPitchOpen(false)}
            regionName={activeRegion.name}
            totalFires={firesData?.total_count ?? 0}
            calibrationFactor={calibrationFactor}
            summary={summary}
            mapMode={mapMode}
            chartMode={chartMode}
            lang={lang}
            onSelectView={setActiveView}
            onTriggerDemoAction={(action) => {
              if (action === 'raw' || action === 'harmonized' || action === 'coincidence' || action === 'frp') {
                setChartMode(action);
              } else if (action === 'grid' || action === 'points' || action === 'footprints') {
                setMapMode(action);
              } else if (action === 'focus_peak_month') {
                const peak =
                  summary?.peak_period && summary.peak_period !== '—'
                    ? summary.peak_period
                    : `${currentYear()}-08`;
                handleSelectPeriodFromCalendar(peak, peak.includes('-W') ? 'week' : 'month');
              } else if (action === 'export_csv') {
                handleExportCsv();
              } else if (action === 'export_geojson') {
                handleExportGeoJson();
              }
            }}
          />
        </Suspense>
      )}

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-nav-item ${activeView === 'overview' && !pitchOpen ? 'active' : ''}`}
          onClick={() => setActiveView('overview')}
        >
          <LayoutGrid size={18} />
          <span>{t.navPanel}</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeView === 'matrix' && !pitchOpen ? 'active' : ''}`}
          onClick={() => setActiveView('matrix')}
        >
          <Calendar size={18} />
          <span>{t.navCalendar}</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${activeView === 'science' && !pitchOpen ? 'active' : ''}`}
          onClick={() => setActiveView('science')}
        >
          <FlaskConical size={18} />
          <span>{t.navScience}</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${pitchOpen ? 'active' : ''} ${!pitchVisited && !pitchOpen ? 'mobile-nav-item--pulse' : ''}`}
          onClick={() => {
            setPitchVisited(true);
            setActiveView('overview');
            setPitchOpen(true);
          }}
        >
          <Presentation size={18} />
          <span>{t.navPitch}</span>
        </button>
      </nav>

      <MobileDesktopNotice
        lang={lang}
        appReady={!loading || Boolean(error)}
        onToggleLang={toggleLang}
      />
    </div>
  );
}

export default App;
