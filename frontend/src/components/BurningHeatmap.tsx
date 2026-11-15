import { Flame } from 'lucide-react';
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

function getHeatColor(ratio: number, ramp: ColorRamp): string {
  if (ramp === 'viridis') {
    if (ratio >= 1.45) return '#fde725';
    if (ratio >= 1.2) return '#5ec962';
    if (ratio >= 0.95) return '#21918c';
    if (ratio >= 0.65) return '#3b528b';
    return '#440154';
  }
  if (ratio >= 1.45) return '#dc2626';
  if (ratio >= 1.2) return '#ef4444';
  if (ratio >= 1.0) return '#f59e0b';
  if (ratio >= 0.75) return '#10b981';
  return '#059669';
}

export function BurningHeatmap({
  series,
  colorRamp = 'alert',
  lang,
  selectedPeriod,
  onSelectPeriod,
}: BurningHeatmapProps) {
  if (!series.length) return null;
  const t = I18N[lang];
  const maxHarm = Math.max(...series.map((s) => s.harmonized_total), 1);
  const isWeeklyStrip = series.length > 14 && series.some((s) => s.period.includes('-W'));

  return (
    <div className="panel heatmap-strip-panel">
      <div className="panel-header" style={{ marginBottom: '6px' }}>
        <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flame size={18} color="#f97316" />
          {t.heatmapTitle}
          <InfoTooltip title={t.heatmapTitle} text={t.tips.heatmap} />
        </h2>
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

      <div className={`heatmap-cells-row ${isWeeklyStrip ? 'heatmap-cells-row--weekly' : 'heatmap-cells-row--monthly'}`}>
        {series.map((pt) => {
          const ratio = pt.historical_avg > 0 ? pt.harmonized_total / pt.historical_avg : 1.0;
          const heightPct = Math.max(22, Math.round((pt.harmonized_total / maxHarm) * 100));
          const bg = getHeatColor(ratio, colorRamp);
          const shortPeriod = pt.period.includes('-W')
            ? pt.period.split('-')[1]
            : t.months[Math.max(0, Math.min(11, parseInt(pt.period.split('-')[1], 10) - 1))] ?? pt.period;

          const isSelected = selectedPeriod === pt.period;
          const labelHarmonized = lang === 'pt' ? 'Harmonizado' : 'Harmonized';
          const labelAvg = lang === 'pt' ? 'Média MODIS' : 'MODIS Avg';
          const labelDev = lang === 'pt' ? 'Desvio' : 'Deviation';
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
              title={`${pt.period} | ${labelHarmonized}: ${pt.harmonized_total} | ${labelAvg}: ${pt.historical_avg} | ${labelDev}: ${pt.deviation_pct >= 0 ? '+' : ''}${pt.deviation_pct}%`}
            >
              <div className="heatmap-bar-well">
                <div
                  className="heatmap-bar-pillar"
                  style={{
                    height: `${heightPct}%`,
                    background: bg,
                    boxShadow: ratio >= 1.3 ? `0 0 10px ${bg}88` : 'none',
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
