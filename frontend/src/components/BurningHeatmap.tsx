import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { formatPeriodDisplay, parsePeriodInfo } from '../dateUtils';
import { I18N, type Language } from '../i18n';
import type { ColorRamp, TimelinePoint } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface BurningHeatmapProps {
  series: TimelinePoint[];
  colorRamp?: ColorRamp;
  lang: Language;
  selectedPeriod?: string | null;
  onSelectPeriod?: (period: string | null) => void;
}

function getHeatColor(pt: TimelinePoint, ramp: ColorRamp): string {
  const ratio = pt.historical_avg > 0 ? pt.harmonized_total / pt.historical_avg : 1.0;
  if (ramp === 'viridis') {
    if (pt.alert_level === 'critical') return ratio >= 1.55 ? '#fde725' : '#5ec962';
    if (pt.alert_level === 'elevated') return '#21918c';
    return ratio >= 0.85 ? '#3b528b' : '#440154';
  }
  if (pt.alert_level === 'critical') {
    return ratio >= 1.55 ? '#dc2626' : '#ef4444';
  }
  if (pt.alert_level === 'elevated') {
    return '#f59e0b';
  }
  return ratio >= 0.85 ? '#10b981' : '#059669';
}

export function BurningHeatmap({
  series,
  colorRamp = 'alert',
  lang,
  selectedPeriod,
  onSelectPeriod,
}: BurningHeatmapProps) {
  const t = I18N[lang];
  const [hoveredPeriod, setHoveredPeriod] = useState<string | null>(null);
  const isWeeklyMode = useMemo(() => series.some((s) => s.period.includes('-W')), [series]);

  const monthGroups = useMemo(() => {
    if (!isWeeklyMode) return [];
    const groups: Array<{ key: string; monthLabel: string; weeks: TimelinePoint[] }> = [];
    const byKey = new Map<string, { key: string; monthLabel: string; weeks: TimelinePoint[] }>();
    for (const pt of series) {
      const info = parsePeriodInfo(pt.period, t.months, t.weekPrefix);
      const key = info.sublabel || String(info.monthIdx);
      let group = byKey.get(key);
      if (!group) {
        group = { key, monthLabel: t.months[info.monthIdx] ?? key, weeks: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.weeks.push(pt);
    }
    return groups;
  }, [isWeeklyMode, series, t.months, t.weekPrefix]);

  if (!series.length) return null;

  const maxHarm = Math.max(...series.map((s) => s.harmonized_total), 1);
  const labelHarmonized = lang === 'pt' ? 'Harmonizado' : 'Harmonized';
  const labelAvg = lang === 'pt' ? 'Média MODIS' : 'MODIS Avg';
  const labelDev = lang === 'pt' ? 'Desvio' : 'Deviation';

  const formatTooltip = (pt: TimelinePoint) =>
    `${formatPeriodDisplay(pt.period, t.months, t.weekPrefix)} | ${labelHarmonized}: ${pt.harmonized_total} | ${labelAvg}: ${pt.historical_avg} | ${labelDev}: ${pt.deviation_pct >= 0 ? '+' : ''}${pt.deviation_pct}%`;

  const activePeriodKey = hoveredPeriod ?? (isWeeklyMode ? selectedPeriod ?? null : null);
  const activeWeekPt = activePeriodKey ? series.find((s) => s.period === activePeriodKey) : undefined;

  return (
    <div className="panel heatmap-strip-panel">
      <div className="panel-header" style={{ marginBottom: '6px' }}>
        <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flame size={18} color="#f97316" />
          {t.heatmapTitle}
          <InfoTooltip title={t.heatmapTitle} text={t.tips.heatmap} />
        </h2>
        <div className="heatmap-header-right">
          {isWeeklyMode && activeWeekPt && (
            <span className="heatmap-focus-pill">
              {formatPeriodDisplay(activeWeekPt.period, t.months, t.weekPrefix)} ·{' '}
              <strong style={{ color: getHeatColor(activeWeekPt, colorRamp) }}>
                {activeWeekPt.deviation_pct >= 0 ? '+' : ''}
                {Math.round(activeWeekPt.deviation_pct)}%
              </strong>
            </span>
          )}
          <div className="heatmap-legend">
            <span>{t.heatmapLow}</span>
            <div
              className="heatmap-gradient-bar"
              style={{
                background:
                  colorRamp === 'viridis'
                    ? 'linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)'
                    : 'linear-gradient(90deg, #059669, #10b981, #f59e0b, #ef4444, #dc2626)',
              }}
            />
            <span>{t.heatmapHigh}</span>
          </div>
        </div>
      </div>

      <div className="heatmap-cells-row heatmap-cells-row--monthly">
        {isWeeklyMode
          ? monthGroups.map((group) => {
              const focusedInGroup = group.weeks.find(
                (w) => w.period === (hoveredPeriod ?? selectedPeriod),
              );
              const peakPt = group.weeks.reduce((best, cur) =>
                cur.deviation_pct > best.deviation_pct ? cur : best,
              );
              const displayPt = focusedInGroup ?? peakPt;
              const displayBg = getHeatColor(displayPt, colorRamp);
              const focusedShort = focusedInGroup
                ? `${focusedInGroup.period.split('-')[1]} `
                : '';

              return (
                <div
                  key={group.key}
                  className={`heatmap-cell-col ${focusedInGroup ? 'has-active-week' : ''}`}
                >
                  <div className="heatmap-bar-well heatmap-week-well">
                    {group.weeks.map((pt) => {
                      const heightPct = Math.max(18, Math.round((pt.harmonized_total / maxHarm) * 100));
                      const bg = getHeatColor(pt, colorRamp);
                      const isSelected = selectedPeriod === pt.period;
                      return (
                        <button
                          key={pt.period}
                          type="button"
                          className={`heatmap-week-bar ${isSelected ? 'is-selected' : ''}`}
                          style={{
                            height: `${heightPct}%`,
                            background: bg,
                            boxShadow: pt.alert_level === 'critical' ? `0 0 8px ${bg}66` : undefined,
                          }}
                          title={formatTooltip(pt)}
                          aria-label={formatTooltip(pt)}
                          aria-pressed={isSelected}
                          onMouseEnter={() => setHoveredPeriod(pt.period)}
                          onMouseLeave={() => setHoveredPeriod((cur) => (cur === pt.period ? null : cur))}
                          onFocus={() => setHoveredPeriod(pt.period)}
                          onBlur={() => setHoveredPeriod((cur) => (cur === pt.period ? null : cur))}
                          onClick={() => onSelectPeriod?.(isSelected ? null : pt.period)}
                        />
                      );
                    })}
                  </div>
                  <span className="heatmap-cell-label">{group.monthLabel}</span>
                  <span className="heatmap-cell-dev" style={{ color: displayBg }}>
                    {focusedShort}
                    {displayPt.deviation_pct >= 0 ? '+' : ''}
                    {Math.round(displayPt.deviation_pct)}%
                  </span>
                </div>
              );
            })
          : series.map((pt) => {
              const heightPct = Math.max(22, Math.round((pt.harmonized_total / maxHarm) * 100));
              const bg = getHeatColor(pt, colorRamp);
              const shortPeriod =
                t.months[Math.max(0, Math.min(11, parseInt(pt.period.split('-')[1], 10) - 1))] ??
                pt.period;
              const isSelected = selectedPeriod === pt.period;

              return (
                <div
                  key={pt.period}
                  className="heatmap-cell-col"
                  onClick={() => onSelectPeriod?.(isSelected ? null : pt.period)}
                  style={{
                    cursor: onSelectPeriod ? 'pointer' : undefined,
                    outline: isSelected ? '2px solid #38bdf8' : undefined,
                    outlineOffset: '2px',
                    borderRadius: '6px',
                  }}
                  title={formatTooltip(pt)}
                >
                  <div className="heatmap-bar-well">
                    <div
                      className="heatmap-bar-pillar"
                      style={{
                        height: `${heightPct}%`,
                        background: bg,
                        boxShadow: pt.alert_level === 'critical' ? `0 0 10px ${bg}88` : 'none',
                      }}
                    />
                  </div>
                  <span className="heatmap-cell-label">{shortPeriod}</span>
                  <span className="heatmap-cell-dev" style={{ color: bg }}>
                    {pt.deviation_pct >= 0 ? '+' : ''}
                    {Math.round(pt.deviation_pct)}%
                  </span>
                </div>
              );
            })}
      </div>
    </div>
  );
}
