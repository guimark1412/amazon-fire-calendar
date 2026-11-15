import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Download,
  Flame,
  FlaskConical,
  Globe,
  Grid3X3,
  LayoutGrid,
  MapPin,
  Presentation,
  Radio,
  Scan,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getFires, getGrid, getRegions, getTimeline } from './api';
import { BurningHeatmap } from './components/BurningHeatmap';
import { CalendarMatrix } from './components/CalendarMatrix';
import { DateRangePickerPopover } from './components/DateRangePickerPopover';
import { EarlyWarningPopover } from './components/EarlyWarningPopover';
import { currentYear, dryPeak, last7Days, yearToDate } from './dateUtils';
import { FireCalendarChart } from './components/FireCalendarChart';
import { FireMap } from './components/FireMap';
import { HarmonizationLab } from './components/HarmonizationLab';
import { InfoTooltip } from './components/InfoTooltip';
import { PitchModeModal, type WorkspaceView } from './components/PitchModeModal';
import { I18N, type Language } from './i18n';
import type {
  ChartViewMode,
  ConfidenceFilter,
  FiresResponse,
  Granularity,
  GridResponse,
  MapViewMode,
  RegionInfo,
  SensorFilter,
  TimelineResponse,
} from './types';

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

export function App() {
  const [lang, setLang] = useState<Language>('pt');
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('amazonia_legal');
  const [sensor, setSensor] = useState<SensorFilter>('both');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [minConfidence, setMinConfidence] = useState<ConfidenceFilter>('all');
  const [viirsOnlyWeight, setViirsOnlyWeight] = useState<number>(0.85);

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
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [scienceDetailsOpen, setScienceDetailsOpen] = useState<boolean>(false);
  const [aoiError, setAoiError] = useState<boolean>(false);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const aoiPopoverRef = useRef<HTMLDivElement | null>(null);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);
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
  }, [selectedRegion, sensor, bboxParam, minConfidence, selectedPeriod, dateRange.start, dateRange.end, retryNonce]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTimeline(true);
    setError(null);

    getTimeline(selectedRegion, granularity, {
      bbox: bboxParam,
      minConfidence,
      viirsOnlyWeight,
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
    viirsOnlyWeight,
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
      viirsOnlyWeight,
      sensor,
      period: selectedPeriod,
      startDate: dateRange.start,
      endDate: dateRange.end,
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
    viirsOnlyWeight,
    sensor,
    customBbox,
    selectedPeriod,
    dateRange.start,
    dateRange.end,
    retryNonce,
  ]);

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

  const handleSelectPeriodFromViz = (period: string | null) => {
    setSelectedPeriod(period);
    if (period) {
      setDateRange({ start: null, end: null });
    }
  };

  const handleSelectPeriodFromCalendar = (
    period: string | null,
    nextGranularity?: Granularity,
  ) => {
    setSelectedPeriod(period);
    setDateRange({ start: null, end: null });
    if (nextGranularity) {
      setGranularity(nextGranularity);
    }
  };

  const handleApplyDateRange = (
    start: string | null,
    end: string | null,
    nextGranularity?: Granularity,
  ) => {
    setDateRange({ start, end });
    setSelectedPeriod(null);
    if (nextGranularity) {
      setGranularity(nextGranularity);
    }
  };

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

  const handleMapSelectBbox = (bbox: [number, number, number, number]) => {
    setCustomBbox(bbox);
    setBboxInputs({
      west: String(bbox[0]),
      south: String(bbox[1]),
      east: String(bbox[2]),
      north: String(bbox[3]),
    });
    setIsDrawingAoi(false);
  };

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

  return (
    <div className="app-shell">
      <header className="workspace-header" data-tour="topbar">
        <div className="topbar-main">
          <div className="brand">
            <div className="brand-icon">
              <Flame size={20} />
            </div>
            <div>
              <div className="brand-title-row">
                <h1>Amazon Fire Calendar</h1>
                <span className={`badge badge-compact ${isLive ? 'badge-live' : 'badge-elevated'}`}>
                  <Radio size={12} />
                  {loading ? t.syncing : isLive ? t.sourceLive : t.sourceFallback}
                </span>
              </div>
              <p>{t.subtitle}</p>
            </div>
          </div>

          <nav className="view-tabs" aria-label="Workspace views">
            <button
              type="button"
              className={`view-tab ${activeView === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveView('overview')}
            >
              <LayoutGrid size={15} />
              {t.tabOverview}
            </button>
            <button
              type="button"
              className={`view-tab ${activeView === 'matrix' ? 'active' : ''}`}
              onClick={() => setActiveView('matrix')}
            >
              <Calendar size={15} />
              {t.tabMatrix}
            </button>
            <button
              type="button"
              className={`view-tab ${activeView === 'science' ? 'active' : ''}`}
              onClick={() => setActiveView('science')}
            >
              <FlaskConical size={15} />
              {t.tabScience}
            </button>
          </nav>

          <div className="controls utility-actions">
            <button
              type="button"
              className="control-select action-btn pitch-btn"
              onClick={() => setPitchOpen(true)}
            >
              <Presentation size={15} />
              {t.pitchBtn}
            </button>

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
              onClick={() => setLang((prev) => (prev === 'pt' ? 'en' : 'pt'))}
              aria-label="Switch language"
            >
              <Globe size={15} />
              {lang === 'pt' ? 'EN' : 'PT'}
            </button>
          </div>
        </div>

        <div className="filter-kpi-strip">
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

            <div className="toggle-group" role="group" aria-label="Sensor filter">
              {(['both', 'MODIS', 'VIIRS'] as SensorFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`toggle-btn ${sensor === s ? 'active' : ''}`}
                  onClick={() => setSensor(s)}
                >
                  {s === 'both' ? t.both : s}
                  {s === 'MODIS' && <InfoTooltip title="MODIS (1 km)" text={t.tips.sensorModis} insideButton />}
                  {s === 'VIIRS' && <InfoTooltip title="VIIRS (375 m)" text={t.tips.sensorViirs} insideButton />}
                </button>
              ))}
            </div>

            <div className="toggle-group" role="group" aria-label="Granularity">
              <button
                type="button"
                className={`toggle-btn ${granularity === 'month' ? 'active' : ''}`}
                onClick={() => {
                  setGranularity('month');
                  setSelectedPeriod(null);
                }}
              >
                {t.monthly}
              </button>
              <button
                type="button"
                className={`toggle-btn ${granularity === 'week' ? 'active' : ''}`}
                onClick={() => {
                  setGranularity('week');
                  setSelectedPeriod(null);
                }}
              >
                {t.weekly}
              </button>
            </div>

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
                      aria-label={lang === 'pt' ? 'Fechar filtros' : 'Close filters'}
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

          <div className="kpi-inline-group">
            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>{t.kpiHotspots}</span>
                <InfoTooltip title={t.kpiHotspots} text={t.tips.kpiHotspots} />
              </span>
              <strong className="kpi-mini-value">
                {firesData ? firesData.total_count.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') : '—'}
              </strong>
            </div>

            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>{t.kpiFactor}</span>
                <InfoTooltip title={t.kpiFactor} text={t.tips.kpiFactor} />
              </span>
              <strong className="kpi-mini-value">
                {timelineData ? `× ${timelineData.calibration_factor}` : '—'}
              </strong>
            </div>

            <div className="kpi-mini-pill">
              <span className="kpi-mini-label">
                <span>
                  {t.kpiAlert} {latestPeriod ? `(${latestPeriod.period})` : ''}
                </span>
                <InfoTooltip title={t.kpiAlert} text={t.tips.kpiAlert} />
              </span>
              <div className="kpi-mini-alert">
                {latestPeriod ? (
                  <>
                    <span className={`badge badge-${latestPeriod.alert_level}`}>
                      <AlertTriangle size={12} />
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
              lang={lang}
              onApplyRange={handleApplyDateRange}
              onSelectPeriod={handleSelectPeriodFromCalendar}
              onClearPeriod={() => setSelectedPeriod(null)}
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
                  <h2 className="panel-title">{t.mapTitle(activeRegion.name)}</h2>
                  <p className="panel-subtitle">
                    {mapMode === 'grid'
                      ? t.mapSubGrid(gridData?.total_cells ?? 0)
                      : mapMode === 'footprints'
                        ? t.mapSubFootprints
                        : t.mapSubPoints}
                  </p>
                </div>
                <div className="toggle-group" role="group" aria-label="Map mode">
                  <button
                    type="button"
                    className={`toggle-btn ${mapMode === 'points' ? 'active' : ''}`}
                    onClick={() => setMapMode('points')}
                  >
                    <MapPin size={14} />
                    {t.pointsBtn}
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${mapMode === 'footprints' ? 'active' : ''}`}
                    onClick={() => setMapMode('footprints')}
                  >
                    <Scan size={14} />
                    {t.footprintsBtn}
                    <InfoTooltip title={t.footprintsBtn} text={t.tips.mapFootprints} insideButton />
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${mapMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setMapMode('grid')}
                  >
                    <Grid3X3 size={14} />
                    {t.gridBtn}
                    <InfoTooltip title={t.gridBtn} text={t.tips.mapGrid} insideButton />
                  </button>
                </div>
              </div>

              <FireMap
                fires={firesData?.fires ?? []}
                gridCells={gridData?.cells ?? []}
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

                <div className="toggle-group" role="group" aria-label="Chart mode">
                  <button
                    type="button"
                    className={`toggle-btn ${chartMode === 'harmonized' ? 'active' : ''}`}
                    onClick={() => setChartMode('harmonized')}
                  >
                    {t.chartModeHarm}
                    <InfoTooltip title={t.chartModeHarm} text={t.tips.chartHarm} insideButton />
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${chartMode === 'raw' ? 'active' : ''}`}
                    onClick={() => setChartMode('raw')}
                  >
                    {t.chartModeRaw}
                    <InfoTooltip title={t.chartModeRaw} text={t.tips.chartRaw} insideButton />
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${chartMode === 'coincidence' ? 'active' : ''}`}
                    onClick={() => setChartMode('coincidence')}
                  >
                    {t.chartModeCoinc}
                    <InfoTooltip title={t.chartModeCoinc} text={t.tips.chartCoinc} insideButton />
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${chartMode === 'frp' ? 'active' : ''}`}
                    onClick={() => setChartMode('frp')}
                  >
                    {t.chartModeFrp}
                    <InfoTooltip title="FRP (MW)" text={t.tips.frp} insideButton />
                  </button>
                </div>
              </div>

              <FireCalendarChart
                series={timelineData?.series ?? []}
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
              lang={lang}
              onApplyRange={handleApplyDateRange}
              onSelectPeriod={handleSelectPeriodFromCalendar}
              onClearPeriod={() => setSelectedPeriod(null)}
            />
            <EarlyWarningPopover summary={summary} regionName={activeRegion.name} lang={lang} />
          </div>
          <BurningHeatmap
            series={timelineData?.series ?? []}
            lang={lang}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={handleSelectPeriodFromViz}
          />
          <CalendarMatrix
            series={timelineData?.series ?? []}
            lang={lang}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={handleSelectPeriodFromViz}
          />
        </div>
      )}

      {activeView === 'science' && (
        <div className="science-view-stack">
          <HarmonizationLab
            diagnostics={timelineData?.diagnostics}
            summary={summary}
            calibrationFactor={calibrationFactor}
            viirsOnlyWeight={viirsOnlyWeight}
            onChangeViirsWeight={setViirsOnlyWeight}
            lang={lang}
          />

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
              <>
                <p className="panel-subtitle" style={{ maxWidth: '75ch', marginTop: '2px' }}>
                  {t.modalIntro}
                </p>

                <div className="science-panel-grid">
                  <div className="sensor-compare-grid" style={{ margin: 0 }}>
                    <div className="sensor-box">
                      <span className="badge badge-elevated">MODIS (Terra / Aqua)</span>
                      <div className="pixel-demo">
                        <div className="pixel-modis">1.0 km → 2.6 km (Scan × Track)</div>
                      </div>
                      <p className="sensor-desc">{t.modalModisDesc}</p>
                    </div>

                    <div className="sensor-box">
                      <span className="badge badge-critical">VIIRS (Suomi NPP / NOAA-20 / 21)</span>
                      <div className="pixel-demo">
                        <div className="pixel-viirs-grid">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <span key={i} className="pixel-viirs-cell" />
                          ))}
                        </div>
                      </div>
                      <p className="sensor-desc">{t.modalViirsDesc}</p>
                    </div>
                  </div>

                  <div className="formula-box">
                    <strong>{t.modalFormulaTitle}</strong>
                    <code>
                      VIIRS_effective = Coincident_VIIRS + (VIIRS_only_small × {viirsOnlyWeight})
                    </code>
                    <code>VIIRS_normalized = VIIRS_effective × {calibrationFactor}</code>
                    <code>Harmonized_Index = (MODIS_raw + VIIRS_normalized) / 2</code>
                    <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: '#9ca3af', lineHeight: 1.55 }}>
                      {t.modalFormulaNote(calibrationFactor)}
                    </p>
                  </div>
                </div>

                <div className="science-arch-block">
                  <h3 className="science-arch-title">{t.modalPillarsTitle}</h3>
                  <div className="pillars-grid">
                    {t.modalPillars.map((pillar) => (
                      <div key={pillar.title} className="pillar-card">
                        <strong>{pillar.title}</strong>
                        <p>{pillar.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

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
          } else if (action === 'preset_peak') {
            const r = dryPeak();
            handleApplyDateRange(r.start, r.end, 'month');
          } else if (action === 'preset_7d') {
            const r = last7Days();
            handleApplyDateRange(r.start, r.end, 'week');
          } else if (action === 'preset_all') {
            const r = yearToDate();
            handleApplyDateRange(r.start, r.end, 'month');
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
          className={`mobile-nav-item ${pitchOpen ? 'active' : ''}`}
          onClick={() => {
            setActiveView('overview');
            setPitchOpen(true);
          }}
        >
          <Presentation size={18} />
          <span>{t.navPitch}</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
