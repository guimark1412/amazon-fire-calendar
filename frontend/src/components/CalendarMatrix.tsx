import { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { parsePeriodInfo } from '../dateUtils';
import { I18N, type Language } from '../i18n';
import type { AlertLevel, MatrixMetric, TimelinePoint } from '../types';

interface CalendarMatrixProps {
  series: TimelinePoint[];
  lang: Language;
  selectedPeriod?: string | null;
  onSelectPeriod?: (period: string | null) => void;
}

function formatMetric(value: number): string {
  if (Math.abs(value - Math.round(value)) < 0.005) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

export function CalendarMatrix({
  series,
  lang,
  selectedPeriod,
  onSelectPeriod,
}: CalendarMatrixProps) {
  const t = I18N[lang];
  const [statusFilter, setStatusFilter] = useState<'all' | AlertLevel>('all');
  const [metric, setMetric] = useState<MatrixMetric>('harmonized');

  const isWeekly = useMemo(() => series.some((item) => item.period.includes('-W')), [series]);

  const counts = useMemo(() => {
    const acc = { all: series.length, critical: 0, elevated: 0, normal: 0 };
    for (const item of series) {
      acc[item.alert_level] += 1;
    }
    return acc;
  }, [series]);

  const filteredSeries = useMemo(
    () => (statusFilter === 'all' ? series : series.filter((item) => item.alert_level === statusFilter)),
    [series, statusFilter],
  );

  const quarters = useMemo(() => {
    const groups: TimelinePoint[][] = [[], [], [], []];
    for (const item of filteredSeries) {
      const { quarterIdx } = parsePeriodInfo(item.period, t.months, t.weekPrefix);
      groups[quarterIdx].push(item);
    }
    return groups
      .map((items, idx) => ({ idx, title: t.quarters[idx], items }))
      .filter((group) => group.items.length > 0);
  }, [filteredSeries, t.months, t.weekPrefix, t.quarters]);

  const [expandedQuarters, setExpandedQuarters] = useState<number[]>(() => [
    quarters.length > 0 ? quarters[quarters.length - 1].idx : 3,
  ]);

  useEffect(() => {
    if (quarters.length === 0) return;
    setExpandedQuarters((prev) => {
      if (prev.some((idx) => quarters.some((q) => q.idx === idx))) {
        return prev;
      }
      return [quarters[quarters.length - 1].idx];
    });
  }, [quarters]);

  const allQuartersExpanded =
    quarters.length > 0 && quarters.every((q) => expandedQuarters.includes(q.idx));

  const toggleQuarter = (qIdx: number) => {
    setExpandedQuarters((prev) =>
      prev.includes(qIdx) ? prev.filter((id) => id !== qIdx) : [...prev, qIdx],
    );
  };

  const toggleAllQuarters = () => {
    if (allQuartersExpanded) {
      setExpandedQuarters([]);
    } else {
      setExpandedQuarters(quarters.map((q) => q.idx));
    }
  };

  const renderCard = (item: TimelinePoint) => {
    const info = parsePeriodInfo(item.period, t.months, t.weekPrefix);
    const fillPct = Math.min(
      100,
      item.historical_avg > 0 ? Math.round((item.harmonized_total / item.historical_avg) * 50) : 50,
    );
    const frpVal = item.harmonized_frp ?? 0;
    const isSelected = selectedPeriod === item.period;

    return (
      <div
        key={item.period}
        className={`month-card month-${item.alert_level}`}
        onClick={() => onSelectPeriod?.(isSelected ? null : item.period)}
        title={
          item.coincident_viirs !== undefined
            ? `${t.coincShortLabel}: ${item.coincident_viirs ?? 0} / ${item.viirs_only_small ?? 0}`
            : undefined
        }
        style={{
          cursor: onSelectPeriod ? 'pointer' : undefined,
          outline: isSelected ? '2px solid #38bdf8' : undefined,
          outlineOffset: '2px',
        }}
      >
        <div className="month-card-top">
          <div className="month-title-group">
            <span className="month-name">{info.label}</span>
            {info.sublabel && <span className="month-sub">{info.sublabel}</span>}
          </div>
          <span className={`badge badge-${item.alert_level}`}>
            {t.alertLabels[item.alert_level]}
          </span>
        </div>

        <div className="month-values">
          {metric === 'harmonized' ? (
            <>
              <div>
                <span className="month-val-label">{t.harmLabel}</span>
                <strong className="month-val-num">{formatMetric(item.harmonized_total)}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="month-val-label">{t.modisAvgLabel}</span>
                <span className="month-val-base">{formatMetric(item.historical_avg)}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="month-val-label">{t.frpLabel}</span>
                <strong className="month-val-num">{frpVal.toFixed(1)} MW</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="month-val-label">MODIS FRP</span>
                <span className="month-val-base">{(item.modis_frp ?? 0).toFixed(0)} MW</span>
              </div>
            </>
          )}
        </div>

        <div className="month-bar-track">
          <div className="month-bar-baseline" title={t.modisAvgLabel} />
          <div className={`month-bar-fill bar-${item.alert_level}`} style={{ width: `${fillPct}%` }} />
        </div>

        <div className="month-deviation">
          <span>{t.devLabel}</span>
          <strong className={`dev-${item.alert_level}`}>
            {item.deviation_pct >= 0 ? '+' : ''}
            {item.deviation_pct.toFixed(1)}%
          </strong>
        </div>
      </div>
    );
  };

  return (
    <section className="calendar-matrix-section" data-tour="calendar-matrix">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="#f97316" />
              {t.matrixTitle}
            </h2>
            <p className="panel-subtitle">{t.matrixSub}</p>
          </div>

          <div className="matrix-controls-wrap">
            <div className="toggle-group" role="group" aria-label="Matrix metric">
              <button
                type="button"
                className={`toggle-btn ${metric === 'harmonized' ? 'active' : ''}`}
                onClick={() => setMetric('harmonized')}
              >
                {t.metricHarmBtn}
              </button>
              <button
                type="button"
                className={`toggle-btn ${metric === 'frp' ? 'active' : ''}`}
                onClick={() => setMetric('frp')}
              >
                {t.metricFrpBtn}
              </button>
            </div>

            <div className="matrix-filter-bar" role="group" aria-label="Filter periods by status">
              {(['all', 'critical', 'elevated', 'normal'] as const).map((status) => {
                const label = status === 'all' ? t.filterAll : t.alertLabels[status];
                return (
                  <button
                    key={status}
                    type="button"
                    className={`filter-pill filter-${status} ${statusFilter === status ? 'active' : ''}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {label} <span className="filter-count">{counts[status]}</span>
                  </button>
                );
              })}
              {isWeekly && statusFilter === 'all' && quarters.length > 1 && (
                <button
                  type="button"
                  className="filter-pill"
                  onClick={toggleAllQuarters}
                >
                  {allQuartersExpanded ? t.collapseQuarters : t.expandAllQuarters}
                </button>
              )}
            </div>
          </div>
        </div>

        {isWeekly ? (
          <div className="quarter-list">
            {quarters.map((quarter) => {
              const critCount = quarter.items.filter((i) => i.alert_level === 'critical').length;
              const elevCount = quarter.items.filter((i) => i.alert_level === 'elevated').length;
              const isExpanded = statusFilter !== 'all' || expandedQuarters.includes(quarter.idx);
              return (
                <div key={quarter.idx} className="quarter-group">
                  <button
                    type="button"
                    className={`quarter-header quarter-toggle-btn ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleQuarter(quarter.idx)}
                    aria-expanded={isExpanded}
                  >
                    <div className="quarter-title-row">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <h3>{quarter.title}</h3>
                      <span className="quarter-count">{t.weeksCount(quarter.items.length)}</span>
                    </div>
                    <div className="quarter-badges">
                      {critCount > 0 && (
                        <span className="badge badge-critical">
                          {critCount} {t.alertLabels.critical}
                        </span>
                      )}
                      {elevCount > 0 && (
                        <span className="badge badge-elevated">
                          {elevCount} {t.alertLabels.elevated}
                        </span>
                      )}
                    </div>
                  </button>
                  {isExpanded && <div className="month-grid">{quarter.items.map(renderCard)}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="month-grid">{filteredSeries.map(renderCard)}</div>
        )}
      </div>
    </section>
  );
}
