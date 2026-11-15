import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ShieldAlert, X } from 'lucide-react';
import { formatPeriodDisplay } from '../dateUtils';
import { formatRecommendation, I18N, type Language } from '../i18n';
import type { TimelineSummary } from '../types';

interface EarlyWarningPopoverProps {
  summary?: TimelineSummary;
  regionName: string;
  lang: Language;
}

export function EarlyWarningPopover({ summary, regionName, lang }: EarlyWarningPopoverProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const t = I18N[lang];

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  if (!summary) return null;

  const status = summary.early_warning_status;
  const devPct = summary.ytd_deviation_pct;
  const peakText = formatPeriodDisplay(summary.peak_period, t.months, t.weekPrefix);
  const fillPct = Math.min(
    100,
    summary.ytd_historical > 0
      ? Math.round((summary.ytd_harmonized / summary.ytd_historical) * 50)
      : 50,
  );

  return (
    <div className="alert-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`control-select action-btn alert-trigger-btn alert-trigger-${status}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <ShieldAlert size={14} />
        <span className="alert-trigger-label">{t.earlyWarningTitle}</span>
        <span className={`badge badge-${status}`}>
          <AlertTriangle size={11} />
          {t.alertLabels[status]}
        </span>
        <span className={`alert-trigger-dev dev-${status}`}>
          {devPct >= 0 ? '+' : ''}
          {devPct.toFixed(1)}%
        </span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          className={`alert-popover alert-popover-${status}`}
          role="dialog"
          aria-label={t.earlyWarningTitle}
        >
          <div className="aoi-popover-header">
            <span className="aoi-popover-title">
              <ShieldAlert size={15} />
              <span>{t.earlyWarningTitle}</span>
              <span className={`badge badge-${status}`}>
                <AlertTriangle size={11} />
                {t.alertLabels[status]}
              </span>
            </span>
            <button
              type="button"
              className="aoi-popover-close"
              onClick={() => setOpen(false)}
              aria-label="Close alert details"
            >
              <X size={14} />
            </button>
          </div>

          <p className="aoi-popover-desc">{t.alertPopoverDesc}</p>

          <div className="alert-popover-stats">
            <div className="alert-stat-card">
              <span className="alert-stat-label">
                {t.ytdLabel} ({t.vsBase})
              </span>
              <div className="alert-stat-value-row">
                <strong>{summary.ytd_harmonized.toFixed(1)}</strong>
                <span className="warning-kpi-muted">/ {summary.ytd_historical.toFixed(1)}</span>
                <strong className={`dev-${status}`}>
                  ({devPct >= 0 ? '+' : ''}
                  {devPct.toFixed(1)}%)
                </strong>
              </div>
            </div>

            <div className="alert-stat-card">
              <span className="alert-stat-label">{t.peakLabel}</span>
              <strong className="alert-stat-peak">{peakText}</strong>
            </div>
          </div>

          <div className="month-bar-track" style={{ margin: '2px 0' }}>
            <div className="month-bar-baseline" title={t.modisAvgLabel} />
            <div className={`month-bar-fill bar-${status}`} style={{ width: `${fillPct}%` }} />
          </div>

          <span className="alert-threshold-note">{t.alertThresholdHint}</span>

          <p className="alert-popover-rec">
            {formatRecommendation(lang, regionName, status, devPct)}
          </p>
        </div>
      )}
    </div>
  );
}
