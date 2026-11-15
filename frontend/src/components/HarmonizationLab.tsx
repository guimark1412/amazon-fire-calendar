import { useState } from 'react';
import { AlertOctagon, ArrowRight, CheckCircle2, Scan, Sliders } from 'lucide-react';
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
  const [scanAngle, setScanAngle] = useState<number>(30);

  const rawModis = diagnostics?.total_modis ?? 271;
  const rawViirs = diagnostics?.total_viirs ?? 1064;
  const rawCombined = rawModis + rawViirs;
  const histBase = summary?.ytd_historical ?? 240;
  const rawFalseSpikePct =
    histBase > 0 ? Math.round(((rawCombined - histBase) / histBase) * 100) : 390;

  const harmTotal = summary?.ytd_harmonized ?? 271.4;
  const harmDevPct = summary?.ytd_deviation_pct ?? 13.1;

  const coincidentViirs = diagnostics?.coincident_viirs ?? 934;
  const viirsOnlySmall = diagnostics?.viirs_only_small_fires ?? 130;
  const effectiveViirs = coincidentViirs + viirsOnlySmall * viirsOnlyWeight;
  const normalizedViirs = effectiveViirs * calibrationFactor;
  const liveHarmIndex = (rawModis + normalizedViirs) / 2;

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
  const locale = isPt ? 'pt-BR' : 'en-US';

  return (
    <section className="harm-lab-section" data-tour="harm-lab">
      <div className="harm-lab-grid">
        {/* Card 1: Calibration Comparison Workbench */}
        <div className="panel lab-card">
          <div className="lab-card-header">
            <h2 className="panel-title">
              {isPt ? 'Distorção Bruta vs. Série Calibrada' : 'Raw Distortion vs. Calibrated Series'}
            </h2>
            <span className="lab-eyebrow-group">
              <span className="lab-eyebrow">{isPt ? 'Comparativo 20 Anos' : '20-Year Scale'}</span>
              <InfoTooltip
                title={isPt ? 'Comparativo 20 Anos' : '20-Year Scale'}
                text={t.tips.labScale}
              />
            </span>
          </div>

          <div className="lab-compare-split">
            <div className="lab-compare-col lab-compare-col--raw">
              <div className="lab-col-head">
                <span className="lab-col-tag lab-col-tag--raw">
                  <AlertOctagon size={13} />
                  {isPt ? 'Sem Harmonização' : 'Unharmonized'}
                </span>
                <InfoTooltip text={t.tips.labRaw} />
              </div>
              <div className="lab-big-metric">
                {rawCombined.toLocaleString(locale)}{' '}
                <span>{isPt ? 'focos' : 'hotspots'}</span>
              </div>
              <div className="lab-sub-formula">
                {rawModis.toLocaleString(locale)} MODIS + {rawViirs.toLocaleString(locale)} VIIRS
              </div>
              <span className="lab-delta-pill lab-delta-pill--danger">
                +{rawFalseSpikePct}% vs. MODIS · {isPt ? 'Falso Alarme' : 'False Spike'}
              </span>
            </div>

            <div className="lab-split-arrow" aria-hidden="true">
              <ArrowRight size={16} />
            </div>

            <div className="lab-compare-col lab-compare-col--harm">
              <div className="lab-col-head">
                <span className="lab-col-tag lab-col-tag--harm">
                  <CheckCircle2 size={13} />
                  {isPt ? 'Harmonizado' : 'Harmonized'}
                </span>
                <InfoTooltip text={t.tips.labHarm} />
              </div>
              <div className="lab-big-metric">
                {harmTotal.toFixed(1)} <span>eq. MODIS</span>
              </div>
              <div className="lab-sub-formula">
                ×{calibrationFactor} · {coincidentViirs} {isPt ? 'coinc.' : 'coinc.'} + {viirsOnlySmall}{' '}
                VIIRS-only
              </div>
              <span className="lab-delta-pill lab-delta-pill--ok">
                {harmDevPct >= 0 ? '+' : ''}
                {harmDevPct.toFixed(1)}% vs. MODIS · {isPt ? 'Anomalia Real' : 'True Anomaly'}
              </span>
            </div>
          </div>

          <div className="lab-slider-dock">
            <div className="lab-slider-top">
              <span className="lab-slider-label">
                <Sliders size={14} color="#f97316" />
                {t.viirsWeightLabel}
                <InfoTooltip title="VIIRS-Only" text={t.tips.viirsWeight} />
              </span>
              <strong className="lab-slider-val" style={{ color: '#fdba74' }}>
                {Math.round(viirsOnlyWeight * 100)}%
              </strong>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viirsOnlyWeight}
              onChange={(e) => onChangeViirsWeight(parseFloat(e.target.value))}
              className="sim-slider"
              aria-label={t.viirsWeightLabel}
            />
            <div className="lab-slider-ticks">
              <span>{isPt ? '0% Coincidente' : '0% Coincident'}</span>
              <span>85% NASA</span>
              <span>{isPt ? '100% Integral' : '100% Full Weight'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Scan-Track Orbital Geometry Simulator */}
        <div className="panel lab-card">
          <div className="lab-card-header">
            <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Scan size={17} color="#f97316" />
              {isPt ? 'Geometria Orbital (Scan × Track)' : 'Orbital Geometry (Scan × Track)'}
            </h2>
            <span className="lab-eyebrow">{scanAngle === 0 ? 'Nadir' : `${scanAngle}° Off-Nadir`}</span>
          </div>

          <div className="swath-stage">
            <span className="swath-modis-label">
              MODIS {modisScanKm} × {modisTrackKm} km vs. VIIRS {viirsScanKm} × {viirsTrackKm} km
            </span>
            <div
              className="swath-modis-box"
              style={{
                width: `${Math.min(256, Math.round(modisScanKm * 52))}px`,
                height: `${Math.min(84, Math.round(modisTrackKm * 36))}px`,
              }}
            >
              <div className="swath-viirs-cluster">
                {Array.from({ length: Math.min(12, Math.max(4, Math.round(ratio / 1.5))) }).map((_, i) => (
                  <span key={i} className="swath-viirs-dot" title="VIIRS 375m pixel" />
                ))}
              </div>
            </div>
          </div>

          <div className="swath-telemetry">
            <div className="swath-tele-item">
              <span>{isPt ? 'Área MODIS' : 'MODIS Area'}</span>
              <strong style={{ color: '#fbbf24' }}>{modisAreaKm2} km²</strong>
            </div>
            <div className="swath-tele-item">
              <span>{isPt ? 'Área VIIRS' : 'VIIRS Area'}</span>
              <strong style={{ color: '#f87171' }}>{viirsAreaKm2} km²</strong>
            </div>
            <div className="swath-tele-item">
              <span>{isPt ? 'Razão de Área' : 'Area Ratio'}</span>
              <strong style={{ color: '#38bdf8' }}>{ratio}×</strong>
            </div>
          </div>

          <div className="lab-slider-dock">
            <div className="lab-slider-top">
              <span className="lab-slider-label">
                {isPt ? 'Ângulo de Visada (Off-Nadir)' : 'Scan Angle (Off-Nadir)'}
                <InfoTooltip title="Off-Nadir" text={t.tips.scanAngle} />
              </span>
              <strong className="lab-slider-val" style={{ color: '#38bdf8' }}>
                {scanAngle}°
              </strong>
            </div>
            <input
              type="range"
              min="0"
              max="55"
              step="1"
              value={scanAngle}
              onChange={(e) => setScanAngle(parseInt(e.target.value, 10))}
              className="sim-slider"
              aria-label={isPt ? 'Ângulo de Visada' : 'Scan Angle'}
            />
            <div className="lab-slider-ticks">
              <span>0° Nadir (1.0 km²)</span>
              <span>30° Mid (~1.6 km²)</span>
              <span>{isPt ? '55° Borda (~8.2 km²)' : '55° Edge (~8.2 km²)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live 3-Step Calibration Pipeline Ribbon */}
      <div className="panel pipeline-ribbon" aria-label={t.modalFormulaTitle}>
        <div className="pipeline-step">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num">01</span>
            <span className="pipeline-step-title">
              {isPt ? 'Ponderação VIIRS-Only' : 'VIIRS-Only Weighting'}
            </span>
          </div>
          <div className="pipeline-step-body">
            <code className="pipeline-step-eq">
              {coincidentViirs.toLocaleString(locale)} + ({viirsOnlySmall.toLocaleString(locale)} ×{' '}
              {viirsOnlyWeight.toFixed(2)})
            </code>
            <div className="pipeline-step-result">
              <strong className="pipeline-step-out">
                {effectiveViirs.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </strong>
              <span className="pipeline-step-unit">{isPt ? 'efetivos' : 'effective'}</span>
            </div>
          </div>
        </div>

        <span className="pipeline-connector" aria-hidden="true">
          <ArrowRight size={15} />
        </span>

        <div className="pipeline-step">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num">02</span>
            <span className="pipeline-step-title">
              {isPt ? 'Conversão à Escala MODIS' : 'MODIS Scale Conversion'}
            </span>
          </div>
          <div className="pipeline-step-body">
            <code className="pipeline-step-eq">
              {effectiveViirs.toFixed(1)} × {calibrationFactor}
            </code>
            <div className="pipeline-step-result">
              <strong className="pipeline-step-out">
                {normalizedViirs.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </strong>
              <span className="pipeline-step-unit">eq. MODIS</span>
            </div>
          </div>
        </div>

        <span className="pipeline-connector" aria-hidden="true">
          <ArrowRight size={15} />
        </span>

        <div className="pipeline-step pipeline-step--final">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num pipeline-step-num--final">03</span>
            <span className="pipeline-step-title">
              {isPt ? 'Índice Harmonizado' : 'Harmonized Index'}
            </span>
          </div>
          <div className="pipeline-step-body">
            <code className="pipeline-step-eq">
              ({rawModis.toLocaleString(locale)} + {normalizedViirs.toFixed(1)}) ÷ 2
            </code>
            <div className="pipeline-step-result">
              <strong className="pipeline-step-out pipeline-step-out--final">
                {liveHarmIndex.toLocaleString(locale, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </strong>
              <span className="pipeline-step-unit pipeline-step-unit--final">eq. MODIS</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
