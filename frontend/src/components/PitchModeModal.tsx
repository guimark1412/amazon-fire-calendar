import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3X3,
  Layers,
  MapPin,
  Presentation,
  Scan,
  X,
} from 'lucide-react';
import { I18N, type Language } from '../i18n';
import type { ChartViewMode, MapViewMode, TimelineSummary } from '../types';

export type WorkspaceView = 'overview' | 'matrix' | 'science';
export type PitchDemoAction =
  | 'raw'
  | 'harmonized'
  | 'coincidence'
  | 'frp'
  | 'grid'
  | 'points'
  | 'footprints'
  | 'preset_peak'
  | 'preset_7d'
  | 'preset_all'
  | 'focus_peak_month'
  | 'export_csv'
  | 'export_geojson';

interface PitchModeModalProps {
  open: boolean;
  onClose: () => void;
  regionName: string;
  totalFires: number;
  calibrationFactor: number;
  summary?: TimelineSummary;
  mapMode: MapViewMode;
  chartMode: ChartViewMode;
  lang: Language;
  onSelectView: (view: WorkspaceView) => void;
  onTriggerDemoAction: (action: PitchDemoAction) => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
}

const TOUR_TARGETS = [
  'topbar',
  'map-panel',
  'chart-panel',
  'calendar-matrix',
  'harm-lab',
  'pitch-summary',
] as const;

export function PitchModeModal({
  open,
  onClose,
  regionName,
  totalFires,
  calibrationFactor,
  summary,
  mapMode,
  chartMode,
  lang,
  onSelectView,
  onTriggerDemoAction,
}: PitchModeModalProps) {
  const [tourCursor, setTourCursor] = useState<{ index: number; fromView: WorkspaceView | null }>({
    index: 0,
    fromView: null,
  });
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [tabHandoff, setTabHandoff] = useState<boolean>(false);
  const t = I18N[lang];
  const stepIndex = tourCursor.index;

  const measureElement = useCallback((el: HTMLElement | null) => {
    if (!el || (el.offsetWidth === 0 && el.offsetHeight === 0)) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
    });
  }, []);

  const measureSelector = useCallback(
    (tourName: string) => {
      if (!tourName || tourName === 'pitch-summary') {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${tourName}"]`) as HTMLElement | null;
      measureElement(el);
    },
    [measureElement],
  );

  const goToStep = useCallback(
    (updater: number | ((prev: number) => number)) => {
      setTourCursor((prev) => {
        const rawNext = typeof updater === 'function' ? updater(prev.index) : updater;
        const nextIdx = Math.max(0, Math.min(TOUR_TARGETS.length - 1, rawNext));
        if (nextIdx === prev.index) return prev;
        const prevView = t.tourSteps[prev.index]?.view as WorkspaceView | undefined;
        return { index: nextIdx, fromView: prevView ?? null };
      });
    },
    [t.tourSteps],
  );

  const handleClose = useCallback(() => {
    setTabHandoff(false);
    setTourCursor({ index: 0, fromView: null });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setTabHandoff(false);
    setTourCursor({ index: 0, fromView: null });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const step = t.tourSteps[stepIndex];
    const nextView = step.view as WorkspaceView;
    const target = TOUR_TARGETS[stepIndex];

    if (target === 'pitch-summary') {
      setTabHandoff(false);
      onSelectView(nextView);
      setRect(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    let rafId = 0;
    let initTimer = 0;
    let switchTimer = 0;
    let handoffEndTimer = 0;
    let activeSelector = target as string;

    const handleReposition = () => measureSelector(activeSelector);

    const startTargetFocus = () => {
      activeSelector = target;
      const elImmediate = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null;
      if (elImmediate && elImmediate.offsetWidth > 0 && elImmediate.offsetHeight > 0) {
        measureElement(elImmediate);
      }
      setTabHandoff(false);
      let waitStart = performance.now();

      const trackTarget = () => {
        const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null;
        if (!el) {
          if (performance.now() - waitStart < 1400) {
            rafId = window.requestAnimationFrame(trackTarget);
          } else {
            setRect(null);
          }
          return;
        }
        if (stepIndex === 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: target === 'harm-lab' ? 'start' : 'center' });
        }
        measureElement(el);

        const animStart = performance.now();
        const tick = (now: number) => {
          measureSelector(target);
          if (now - animStart < 900) {
            rafId = window.requestAnimationFrame(tick);
          }
        };
        rafId = window.requestAnimationFrame(tick);
      };

      initTimer = window.setTimeout(trackTarget, 80);
    };

    const viewTabsEl = document.querySelector('[data-tour="view-tabs"]') as HTMLElement | null;
    const canSpotlightTabs = Boolean(
      viewTabsEl && viewTabsEl.offsetWidth > 0 && viewTabsEl.offsetHeight > 0,
    );
    const shouldShowTabHandoff = Boolean(
      tourCursor.fromView && tourCursor.fromView !== nextView && canSpotlightTabs,
    );

    if (shouldShowTabHandoff) {
      activeSelector = 'view-tabs';
      setTabHandoff(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      measureElement(viewTabsEl);

      // Phase 1 (0-460ms): highlight the tab bar first; Phase 2 (460-1020ms): switch tab, then show card.
      const handoffStart = performance.now();
      const tickTabs = (now: number) => {
        measureSelector('view-tabs');
        if (now - handoffStart < 980) {
          rafId = window.requestAnimationFrame(tickTabs);
        }
      };
      rafId = window.requestAnimationFrame(tickTabs);

      switchTimer = window.setTimeout(() => {
        onSelectView(nextView);
        measureSelector('view-tabs');
      }, 460);

      handoffEndTimer = window.setTimeout(() => {
        window.cancelAnimationFrame(rafId);
        startTargetFocus();
      }, 1020);
    } else {
      setTabHandoff(false);
      onSelectView(nextView);
      startTargetFocus();
    }

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.clearTimeout(initTimer);
      window.clearTimeout(switchTimer);
      window.clearTimeout(handoffEndTimer);
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, stepIndex, tourCursor.fromView, t.tourSteps, onSelectView, measureElement, measureSelector]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        goToStep((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        goToStep((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose, goToStep]);

  if (!open) return null;

  const step = t.tourSteps[stepIndex];
  const ytdDev = summary?.ytd_deviation_pct ?? 0;
  const alertStatus = summary?.early_warning_status ?? 'normal';

  const boxTop = rect ? rect.top - 8 : 0;
  const boxLeft = rect ? rect.left - 8 : 0;
  const boxWidth = rect ? rect.width + 16 : 0;
  const boxHeight = rect ? rect.height + 16 : 0;
  const boxBottom = boxTop + boxHeight;

  const getTooltipStyle = (): CSSProperties => {
    if (typeof window === 'undefined') {
      return { top: '80px', left: '24px' };
    }
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const cardWidth = Math.min(460, vw - 32);
    const estHeight = 320;

    if (!rect) {
      return {
        top: `${Math.max(20, vh - estHeight - 24)}px`,
        left: `${Math.max(20, vw - cardWidth - 24)}px`,
      };
    }

    if (vw <= 768) {
      if (tabHandoff) {
        return {
          top: `${Math.min(vh - 64, Math.max(12, Math.round(boxBottom + 12)))}px`,
          left: '12px',
        };
      }
      const spotlightInUpperHalf = boxTop + boxHeight / 2 < vh * 0.52;
      return {
        top: spotlightInUpperHalf ? `${Math.max(16, vh - estHeight - 76)}px` : '12px',
        left: '12px',
        width: `${Math.max(260, vw - 24)}px`,
      };
    }

    if (tabHandoff) {
      return {
        top: `${Math.min(vh - 64, Math.max(16, Math.round(boxBottom + 14)))}px`,
        left: `${Math.max(16, Math.min(Math.round(rect.left), vw - 360))}px`,
      };
    }

    if (rect.width < vw * 0.65) {
      const topPos = Math.max(20, Math.min(boxTop + 16, vh - estHeight - 20));
      if (rect.left < vw * 0.25) {
        return {
          top: `${topPos}px`,
          left: `${Math.min(vw - cardWidth - 20, Math.round(rect.left + rect.width + 24))}px`,
        };
      }
      return {
        top: `${topPos}px`,
        left: `${Math.max(20, Math.round(rect.left - cardWidth - 24))}px`,
      };
    }

    const clampedLeft = Math.max(16, Math.min(rect.left, vw - cardWidth - 16));

    if (boxBottom + 16 + estHeight <= vh && boxBottom >= 0) {
      return {
        top: `${boxBottom + 16}px`,
        left: `${clampedLeft}px`,
      };
    }

    if (boxTop - 16 - estHeight >= 0) {
      return {
        top: `${Math.max(16, boxTop - estHeight - 16)}px`,
        left: `${clampedLeft}px`,
      };
    }

    return {
      top: `${Math.max(20, vh - estHeight - 20)}px`,
      left: `${Math.max(20, vw - cardWidth - 20)}px`,
    };
  };

  const renderFooter = () => (
    <div className="pitch-footer">
      <button
        type="button"
        className="control-select action-btn"
        onClick={() => goToStep((prev) => prev - 1)}
        disabled={stepIndex === 0}
      >
        <ChevronLeft size={15} />
        {t.tourPrev}
      </button>

      <div className="pitch-dots" role="tablist" aria-label="Tour steps">
        {TOUR_TARGETS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={`pitch-dot ${idx === stepIndex ? 'active' : ''}`}
            onClick={() => goToStep(idx)}
            aria-label={`Step ${idx + 1}`}
          />
        ))}
      </div>

      {stepIndex < TOUR_TARGETS.length - 1 ? (
        <button
          type="button"
          className="control-select action-btn pitch-btn"
          onClick={() => goToStep((prev) => prev + 1)}
        >
          {t.tourNext}
          <ChevronRight size={15} />
        </button>
      ) : (
        <button type="button" className="control-select action-btn pitch-btn" onClick={handleClose}>
          {t.tourFinish}
        </button>
      )}
    </div>
  );

  if (step.target === 'pitch-summary') {
    return (
      <div
        className="modal-overlay pitch-summary-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pitch-summary-title"
      >
        <div className="modal-card pitch-summary-card">
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Presentation size={18} color="#f97316" />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fdba74' }}>
                {step.badge}
              </span>
            </div>
            <button type="button" className="modal-close" onClick={handleClose} aria-label="Fechar tour">
              <X size={16} />
            </button>
          </div>

          <div className="pitch-slide-body" style={{ minHeight: 'auto', margin: '14px 0 18px' }}>
            <h2 id="pitch-summary-title" className="pitch-slide-heading">
              {step.title}
            </h2>
            <p className="pitch-lead">{step.description}</p>

            <div className="pitch-kpi-row" style={{ marginBottom: '16px' }}>
              <div className="pitch-mini-card">
                <span className="warning-kpi-label">{t.pitchSummaryMetrics.hotspots}</span>
                <strong>{totalFires.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}</strong>
                <p>{regionName}</p>
              </div>
              <div className="pitch-mini-card">
                <span className="warning-kpi-label">{t.pitchSummaryMetrics.factor}</span>
                <strong>× {calibrationFactor}</strong>
                <p>MODIS 1km ↔ VIIRS 375m</p>
              </div>
              <div className="pitch-mini-card">
                <span className="warning-kpi-label">{t.pitchSummaryMetrics.deviation}</span>
                <strong>
                  {ytdDev >= 0 ? '+' : ''}
                  {ytdDev}%
                </strong>
                <p>{t.alertLabels[alertStatus]}</p>
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e5e7eb', marginBottom: '8px' }}>
              {t.modalPillarsTitle}
            </div>
            <div className="pillars-grid">
              {t.modalPillars.map((pillar) => (
                <div key={pillar.title} className="pillar-card">
                  <strong>{pillar.title}</strong>
                  <p>{pillar.desc}</p>
                </div>
              ))}
            </div>

            <div className="pitch-action-row" style={{ marginTop: '14px' }}>
              <button
                type="button"
                className="control-select action-btn"
                onClick={() => onTriggerDemoAction('export_csv')}
              >
                <Download size={14} />
                {t.exportBtn}
              </button>
              <button
                type="button"
                className="control-select action-btn pitch-btn"
                onClick={() => onTriggerDemoAction('export_geojson')}
              >
                <Download size={14} />
                {t.exportGeoJsonBtn}
              </button>
            </div>
          </div>

          {renderFooter()}
        </div>
      </div>
    );
  }

  return (
    <>
      {rect && (
        <div
          className={`tour-spotlight-box ${tabHandoff ? 'tour-spotlight-box--handoff' : ''}`}
          style={{
            top: `${boxTop}px`,
            left: `${boxLeft}px`,
            width: `${boxWidth}px`,
            height: `${boxHeight}px`,
          }}
        />
      )}

      {!tabHandoff && (
        <div
          key="step"
          className="tour-tooltip-card"
          style={getTooltipStyle()}
          role="dialog"
          aria-modal="false"
          aria-labelledby="pitch-tour-title"
        >
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Presentation size={18} color="#f97316" />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fdba74' }}>
                {step.badge}
              </span>
            </div>
            <button type="button" className="modal-close" onClick={handleClose} aria-label="Fechar tour">
              <X size={16} />
            </button>
          </div>

          <div className="tour-tooltip-body" key={stepIndex}>
            <h3 id="pitch-tour-title">{step.title}</h3>
            <p>{step.description}</p>

          {stepIndex === 0 && (
            <>
              <div className="tour-live-note" style={{ marginTop: '10px' }}>
                <strong>{regionName}:</strong> {totalFires.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}{' '}
                {t.tourRecentHotspots} • {t.tourCalibFactor} <code>× {calibrationFactor}</code>
              </div>
              <div className="pitch-action-row">
                <button
                  type="button"
                  className="control-select action-btn"
                  onClick={() => onTriggerDemoAction('preset_peak')}
                >
                  <Calendar size={14} />
                  {t.tourDemoPeakAugSep}
                </button>
                <button
                  type="button"
                  className="control-select action-btn"
                  onClick={() => onTriggerDemoAction('preset_7d')}
                >
                  <Calendar size={14} />
                  {t.tourDemoLast7d}
                </button>
                <button
                  type="button"
                  className="control-select action-btn"
                  onClick={() => onTriggerDemoAction('preset_all')}
                >
                  {t.tourDemoFullYear}
                </button>
              </div>
            </>
          )}

          {stepIndex === 1 && (
            <div className="pitch-action-row">
              <button
                type="button"
                className={`control-select action-btn ${mapMode === 'points' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('points')}
              >
                <MapPin size={14} />
                {t.tourViewPoints}
              </button>
              <button
                type="button"
                className={`control-select action-btn ${mapMode === 'footprints' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('footprints')}
              >
                <Scan size={14} />
                {t.footprintsBtn}
              </button>
              <button
                type="button"
                className={`control-select action-btn ${mapMode === 'grid' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('grid')}
              >
                <Grid3X3 size={14} />
                {t.tourViewGrid}
              </button>
              <button
                type="button"
                className="control-select action-btn"
                onClick={() => onTriggerDemoAction('focus_peak_month')}
              >
                <Calendar size={14} />
                {t.tourDemoHighlightPeak}
              </button>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="pitch-action-row">
              <button
                type="button"
                className={`control-select action-btn ${chartMode === 'harmonized' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('harmonized')}
              >
                <Layers size={14} />
                {t.chartModeHarm}
              </button>
              <button
                type="button"
                className={`control-select action-btn ${chartMode === 'raw' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('raw')}
              >
                <Layers size={14} />
                {t.chartModeRaw}
              </button>
              <button
                type="button"
                className={`control-select action-btn ${chartMode === 'coincidence' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('coincidence')}
              >
                <Layers size={14} />
                {t.chartModeCoinc}
              </button>
              <button
                type="button"
                className={`control-select action-btn ${chartMode === 'frp' ? 'pitch-btn' : ''}`}
                onClick={() => onTriggerDemoAction('frp')}
              >
                <Layers size={14} />
                {t.chartModeFrp}
              </button>
            </div>
          )}

          {stepIndex === 3 && (
            <div className="tour-live-note" style={{ marginTop: '10px' }}>
              <strong>Status ({regionName}):</strong> {t.tourYtdDev}{' '}
              {ytdDev >= 0 ? '+' : ''}
              {ytdDev}% • {t.tourPeakIn} {summary?.peak_period ?? '—'}
            </div>
          )}

          {stepIndex === 4 && (
            <div className="tour-live-note" style={{ marginTop: '10px' }}>
              <strong>{t.tourCalibFactor}:</strong> <code>× {calibrationFactor}</code> · MODIS 1km ↔ VIIRS 375m
            </div>
          )}
          </div>

          {renderFooter()}
        </div>
      )}
    </>
  );
}
