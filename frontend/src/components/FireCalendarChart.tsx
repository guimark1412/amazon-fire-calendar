import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPeriodDisplay } from '../dateUtils';
import { I18N, type Language } from '../i18n';
import type { ChartViewMode, SensorFilter, TimelinePoint } from '../types';

interface FireCalendarChartProps {
  series: TimelinePoint[];
  chartMode?: ChartViewMode;
  showRawComparison?: boolean;
  sensor?: SensorFilter;
  lang: Language;
  selectedPeriod?: string | null;
  onSelectPeriod?: (period: string | null) => void;
}

export function FireCalendarChart({
  series,
  chartMode,
  showRawComparison = false,
  sensor = 'both',
  lang,
  selectedPeriod,
  onSelectPeriod,
}: FireCalendarChartProps) {
  const t = I18N[lang];
  const activeMode: ChartViewMode = chartMode ?? (showRawComparison ? 'raw' : 'harmonized');

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={series}
          margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
          style={{ cursor: onSelectPeriod ? 'pointer' : 'default' }}
          onClick={(state) => {
            if (!onSelectPeriod || state?.activeLabel == null) return;
            const clicked = String(state.activeLabel);
            if (!clicked) return;
            onSelectPeriod(selectedPeriod === clicked ? null : clicked);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="period"
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            minTickGap={16}
            tickFormatter={(val: string) =>
              val.includes('-W') ? val.split('-')[1] : formatPeriodDisplay(val, t.months, t.weekPrefix)
            }
          />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
          {selectedPeriod && (
            <ReferenceLine x={selectedPeriod} stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 4" />
          )}
          <Tooltip
            labelFormatter={(label) => formatPeriodDisplay(String(label ?? ''), t.months, t.weekPrefix)}
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />

          {activeMode === 'raw' && (
            <>
              {sensor !== 'VIIRS' && (
                <Bar dataKey="modis_raw" name={t.seriesModisRaw} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              )}
              {sensor !== 'MODIS' && (
                <Bar dataKey="viirs_raw" name={t.seriesViirsRaw} fill="#ef4444" radius={[4, 4, 0, 0]} />
              )}
            </>
          )}

          {activeMode === 'coincidence' && (
            <>
              <Bar
                dataKey="coincident_viirs"
                stackId="viirs_split"
                name={t.seriesCoincident}
                fill="#f97316"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="viirs_only_small"
                stackId="viirs_split"
                name={t.seriesViirsOnly}
                fill="#a855f7"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="modis_raw"
                name={t.seriesModis}
                stroke="#fbbf24"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </>
          )}

          {activeMode === 'frp' && (
            <>
              {sensor !== 'VIIRS' && (
                <Bar dataKey="modis_frp" name={t.seriesModisFrp} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              )}
              {sensor !== 'MODIS' && (
                <Bar dataKey="viirs_frp" name={t.seriesViirsFrp} fill="#ef4444" radius={[4, 4, 0, 0]} />
              )}
              <Line
                type="monotone"
                dataKey="harmonized_frp"
                name={t.seriesHarmFrp}
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </>
          )}

          {activeMode === 'harmonized' && (
            <>
              {sensor !== 'VIIRS' && (
                <Bar dataKey="modis_raw" name={t.seriesModis} fill="#f59e0b" radius={[4, 4, 0, 0]} />
              )}
              {sensor !== 'MODIS' && (
                <Bar
                  dataKey="viirs_normalized"
                  name={t.seriesViirsNorm}
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              )}
              {sensor === 'both' && (
                <Line
                  type="monotone"
                  dataKey="harmonized_total"
                  name={t.seriesHarmIndex}
                  stroke="#f97316"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="historical_avg"
                name={t.seriesHistAvg}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
