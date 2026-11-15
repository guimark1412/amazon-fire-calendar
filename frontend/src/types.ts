export type SensorFilter = 'both' | 'MODIS' | 'VIIRS';
export type Granularity = 'month' | 'week';
export type AlertLevel = 'normal' | 'elevated' | 'critical';
export type DayNightFilter = 'all' | 'D' | 'N';
export type ConfidenceFilter = 'all' | 'nominal' | 'high';
export type MapViewMode = 'points' | 'footprints' | 'grid';
export type ChartViewMode = 'harmonized' | 'raw' | 'coincidence' | 'frp';
export type MatrixMetric = 'harmonized' | 'frp';
export type ColorRamp = 'alert' | 'viridis';

export interface RegionInfo {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;
}

export interface FireHotspot {
  latitude: number;
  longitude: number;
  brightness: number;
  frp: number;
  confidence: string;
  confidence_level?: 'low' | 'nominal' | 'high';
  scan?: number;
  track?: number;
  pixel_area_km2?: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
  sensor: 'MODIS' | 'VIIRS';
  daynight: string;
}

export interface FiresResponse {
  region: string;
  sensor: string;
  data_source: string;
  live_unscaled?: boolean;
  total_count: number;
  returned_count: number;
  fires: FireHotspot[];
}

export interface TimelinePoint {
  period: string;
  modis_raw: number;
  viirs_raw: number;
  viirs_normalized: number;
  harmonized_total: number;
  historical_avg: number;
  deviation_pct: number;
  anomaly_zscore?: number;
  alert_level: AlertLevel;
  coincident_viirs?: number;
  viirs_only_small?: number;
  modis_frp?: number;
  viirs_frp?: number;
  harmonized_frp?: number;
  day_count?: number;
  night_count?: number;
}

export interface TimelineSummary {
  ytd_harmonized: number;
  ytd_historical: number;
  ytd_deviation_pct: number;
  peak_period: string;
  early_warning_status: AlertLevel;
  recommendation: string;
}

export interface HarmonizationDiagnostics {
  total_modis: number;
  total_viirs: number;
  coincident_viirs: number;
  viirs_only_small_fires: number;
  viirs_only_pct: number;
  day_detections: number;
  night_detections: number;
  night_pct: number;
  avg_modis_footprint_km2: number;
  avg_viirs_footprint_km2: number;
  effective_area_ratio: number;
  total_frp_mw: number;
  avg_frp_mw: number;
}

export interface TimelineResponse {
  region: string;
  region_name: string;
  granularity: Granularity;
  calibration_factor: number;
  calibration_source: string;
  data_source: string;
  summary: TimelineSummary;
  diagnostics?: HarmonizationDiagnostics;
  series: TimelinePoint[];
}

export interface GridCell {
  id: string;
  bounds: [[number, number], [number, number]];
  center: [number, number];
  modis_raw: number;
  viirs_raw: number;
  viirs_normalized: number;
  harmonized_index: number;
  avg_frp: number;
  avg_footprint_km2?: number;
  day_count?: number;
  night_count?: number;
  sensor_overlap?: 'coincident' | 'viirs_only' | 'modis_only';
  severity: AlertLevel;
}

export interface GridResponse {
  region: string;
  region_name: string;
  cell_size: number;
  calibration_factor: number;
  total_cells: number;
  data_source: string;
  live_unscaled?: boolean;
  cells: GridCell[];
}
