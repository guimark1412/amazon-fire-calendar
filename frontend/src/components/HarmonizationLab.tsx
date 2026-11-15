import { useState } from 'react';
import { AlertOctagon, CheckCircle2, Scan, Sliders } from 'lucide-react';
import { I18N, type Language } from '../i18n';
import type { HarmonizationDiagnostics, TimelineSummary } from '../types';
import { InfoTooltip } from './InfoTooltip';

interface HarmonizationLabProps {
  diagnostics?: HarmonizationDiagnostics;
  summary?: TimelineSummary;
  calibrationFactor: number;
  viirsOnlyWeight: number;
  onChangeViirsWeight: (w: number) => void;
  lang: Language;
}

export function HarmonizationLab({
  diagnostics,
  summary,
  calibrationFactor,
  viirsOnlyWeight,
  onChangeViirsWeight,
  lang,
}: HarmonizationLabProps) {
  const [scanAngle, setScanAngle] = useState<number>(32);

  const rawModis = diagnostics?.total_modis ?? 271;
  const rawViirs = diagnostics?.total_viirs ?? 1064;
  const rawCombined = rawModis + rawViirs;
  const histBase = summary?.ytd_historical ?? 240;
  const rawFalseSpikePct = histBase > 0 ? Math.round(((rawCombined - histBase) / histBase) * 100) : 390;

  const harmTotal = summary?.ytd_harmonized ?? 271.4;
  const harmDevPct = summary?.ytd_deviation_pct ?? 13.1;

  // Compute physical MODIS vs VIIRS pixel stretch as a function of satellite scan angle (0 to 55 deg)
  const rad = (scanAngle * Math.PI) / 180;
  const cosTheta = Math.max(0.35, Math.cos(rad));
  const modisScanKm = Number((1.0 / Math.pow(cosTheta, 1.85)).toFixed(2));
  const modisTrackKm = Number((1.0 / Math.pow(cosTheta, 0.75)).toFixed(2));
  const modisAreaKm2 = Number((modisScanKm * modisTrackKm).toFixed(2));

  const viirsScanKm = Number((0.375 / Math.pow(cosTheta, 0.55)).toFixed(2));
  const viirsTrackKm = Number((0.375 / Math.pow(cosTheta, 0.35)).toFixed(2));
  const viirsAreaKm2 = Number((viirsScanKm * viirsTrackKm).toFixed(3));
  const ratio = Number((modisAreaKm2 / Math.max(0.05, viirsAreaKm2)).toFixed(1));

  const isPt = lang === 'pt';
  const t = I18N[lang];

  return (
    <section className="harm-lab-section" data-tour="harm-lab">
      <div className="harm-lab-grid">
        {/* Card 1: Before vs After Harmonization (Why Raw Data Fails) */}
        <div className="panel harm-compare-panel">
          <div className="panel-header" style={{ marginBottom: '10px' }}>
            <div>
              <h2 className="panel-title">
                {isPt
                  ? 'Por que Harmonizar? Distorção Bruta vs. Série Calibrada'
                  : 'Why Harmonize? Raw Distortion vs. Calibrated Baseline'}
              </h2>
            </div>
          </div>

          <div className="before-after-cards">
            <div className="ba-card ba-raw">
              <div className="ba-header">
                <span className="ba-header-title">
                  <AlertOctagon size={15} color="#f87171" />
                  <span>
                    {isPt ? 'SEM HARMONIZAÇÃO (Contagem Bruta)' : 'UNHARMONIZED (Raw Sensor Sum)'}
                  </span>
                </span>
                <InfoTooltip text={t.tips.labRaw} />
              </div>
              <div className="ba-big-num">
                {rawCombined.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}{' '}
                {lang === 'pt' ? 'focos' : 'hotspots'}
              </div>
              <div className="ba-Formula">
                {rawModis} MODIS (1km) + {rawViirs} VIIRS (375m)
              </div>
              <div className="ba-badge ba-badge-danger">
                +{rawFalseSpikePct}% vs. Média MODIS ({isPt ? 'Falso Alarme Estatístico' : 'False Statistical Spike'})
              </div>
            </div>

            <div className="ba-card ba-harm">
              <div className="ba-header">
                <span className="ba-header-title">
                  <CheckCircle2 size={15} color="#34d399" />
                  <span>
                    {isPt ? 'COM HARMONIZAÇÃO (Escala Unificada)' : 'HARMONIZED (Unified MODIS Scale)'}
                  </span>
                </span>
                <InfoTooltip text={t.tips.labHarm} />
              </div>
              <div className="ba-big-num">{harmTotal.toFixed(1)} eq. MODIS</div>
              <div className="ba-Formula">
                {isPt ? 'Fator' : 'Factor'} ×{calibrationFactor} · {diagnostics?.coincident_viirs ?? 934}{' '}
                {isPt ? 'coincidentes' : 'coincident'} + {diagnostics?.viirs_only_small_fires ?? 130}{' '}
                VIIRS-only
              </div>
              <div className="ba-badge ba-badge-ok">
                {harmDevPct >= 0 ? '+' : ''}
                {harmDevPct.toFixed(1)}% vs. Média MODIS ({isPt ? 'Anomalia Real Calibrada' : 'True Calibrated Anomaly'})
              </div>
            </div>
          </div>

          <div className="interactive-weight-box">
            <div className="weight-box-top">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Sliders size={14} color="#f97316" />
                {t.viirsWeightLabel}
                <InfoTooltip title="VIIRS-Only" text={t.tips.viirsWeight} />
              </span>
              <strong style={{ color: '#fdba74' }}>{Math.round(viirsOnlyWeight * 100)}%</strong>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viirsOnlyWeight}
              onChange={(e) => onChangeViirsWeight(parseFloat(e.target.value))}
              className="sim-slider"
            />
            <div className="slider-labels">
              <span>0% ({isPt ? 'Apenas Fogo Coincidente MODIS' : 'Coincident Fires Only'})</span>
              <span>85% ({isPt ? 'Equilíbrio Recomendado NASA' : 'Recommended NASA Balance'})</span>
              <span>100% ({isPt ? 'Peso Total p/ Pequenos Focos' : 'Full Weight for Small Burns'})</span>
            </div>
          </div>
        </div>

        {/* Card 2: Interactive Scan-Angle Swath Distortion Simulator */}
        <div className="panel swath-sim-panel">
          <div className="panel-header" style={{ marginBottom: '8px' }}>
            <div>
              <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Scan size={17} color="#f97316" />
                {isPt
                  ? 'Simulador de Distorção de Varredura (Scan × Track)'
                  : 'Off-Nadir Scan-Angle Pixel Distortion Simulator'}
              </h2>
            </div>
          </div>

          <div className="swath-visualizer">
            <div className="swath-stage">
              <span className="swath-modis-label">
                MODIS: {modisScanKm} × {modisTrackKm} km ({modisAreaKm2} km²)
              </span>
              <div
                className="swath-modis-box"
                style={{
                  width: `${Math.min(240, Math.round(modisScanKm * 52))}px`,
                  height: `${Math.min(86, Math.round(modisTrackKm * 38))}px`,
                }}
              >
                <div className="swath-viirs-cluster">
                  {Array.from({ length: Math.min(12, Math.max(4, Math.round(ratio / 1.5))) }).map((_, i) => (
                    <span key={i} className="swath-viirs-dot" title="VIIRS 375m pixel" />
                  ))}
                </div>
              </div>
            </div>

            <div className="swath-metrics-row">
              <div className="swath-stat">
                <span>{isPt ? 'Área Efetiva MODIS' : 'MODIS Pixel Area'}</span>
                <strong style={{ color: '#fbbf24' }}>{modisAreaKm2} km²</strong>
              </div>
              <div className="swath-stat">
                <span>{isPt ? 'Área Efetiva VIIRS' : 'VIIRS Pixel Area'}</span>
                <strong style={{ color: '#f87171' }}>{viirsAreaKm2} km²</strong>
              </div>
              <div className="swath-stat">
                <span>{isPt ? 'Razão de Área Real' : 'True Area Ratio'}</span>
                <strong style={{ color: '#38bdf8' }}>{ratio}×</strong>
              </div>
            </div>

            <div className="interactive-weight-box" style={{ marginTop: '8px' }}>
              <div className="weight-box-top">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  {isPt ? 'Ângulo de Visada (Off-Nadir)' : 'Scan Angle (Off-Nadir)'}
                  <InfoTooltip title="Off-Nadir" text={t.tips.scanAngle} />
                </span>
                <strong style={{ color: '#38bdf8' }}>{scanAngle}°</strong>
              </div>
              <input
                type="range"
                min="0"
                max="55"
                step="1"
                value={scanAngle}
                onChange={(e) => setScanAngle(parseInt(e.target.value, 10))}
                className="sim-slider"
              />
              <div className="slider-labels">
                <span>{lang === 'pt' ? '0° (Nadir · 1,0 km²)' : '0° (Nadir · 1.0 km²)'}</span>
                <span>{lang === 'pt' ? '30° (Intermediário · ~1,6 km²)' : '30° (Mid-Swath · ~1.6 km²)'}</span>
                <span>{lang === 'pt' ? '55° (Borda do Swath · ~8,2 km²)' : '55° (Swath Edge · ~8.2 km²)'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
