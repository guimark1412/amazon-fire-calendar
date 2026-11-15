import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { I18N, type Language } from '../i18n';
import type { Granularity } from '../types';
import {
  currentMonthIndex,
  currentYear,
  dryPeak,
  isSameRange,
  last30Days,
  todayIso,
  yearToDate,
} from '../dateUtils';

interface DateRangePickerPopoverProps {
  startDate: string | null;
  endDate: string | null;
  granularity: Granularity;
  selectedPeriod?: string | null;
  lang: Language;
  variant?: 'inline' | 'floating';
  onApplyRange: (start: string | null, end: string | null, nextGranularity?: Granularity) => void;
  onSelectPeriod?: (period: string | null, nextGranularity?: Granularity) => void;
  onClearPeriod?: () => void;
}

const DEFAULT_YEAR = currentYear();
const DEFAULT_MONTH = currentMonthIndex();
const SELECTABLE_YEARS = [DEFAULT_YEAR - 2, DEFAULT_YEAR - 1, DEFAULT_YEAR];

function padTwoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${padTwoDigits(monthIndex + 1)}-${padTwoDigits(day)}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseIsoParts(iso: string): { year: number; monthIndex: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return {
    year: Number(m[1]),
    monthIndex: Number(m[2]) - 1,
    day: Number(m[3]),
  };
}

function formatPillDateRange(
  startDate: string | null,
  endDate: string | null,
  selectedPeriod: string | null | undefined,
  lang: Language,
): string {
  const t = I18N[lang];
  if (selectedPeriod) {
    return selectedPeriod;
  }
  if (!startDate || !endDate) {
    return t.datePickerFullYear;
  }
  const s = parseIsoParts(startDate);
  const e = parseIsoParts(endDate);
  if (!s || !e) return `${startDate} - ${endDate}`;

  const monthNames = t.months;
  const sLabel = `${padTwoDigits(s.day)} ${monthNames[s.monthIndex] ?? ''}`;
  const eLabel = `${padTwoDigits(e.day)} ${monthNames[e.monthIndex] ?? ''}`;
  if (s.year === e.year) {
    return `${sLabel} - ${eLabel}, ${e.year}`;
  }
  return `${sLabel} ${s.year} - ${eLabel} ${e.year}`;
}

export function DateRangePickerPopover({
  startDate,
  endDate,
  selectedPeriod,
  lang,
  variant = 'floating',
  onApplyRange,
  onSelectPeriod,
  onClearPeriod,
}: DateRangePickerPopoverProps) {
  const t = I18N[lang];
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(DEFAULT_YEAR);
  const [viewMonth, setViewMonth] = useState<number>(DEFAULT_MONTH);
  const [draftStart, setDraftStart] = useState<string | null>(startDate);
  const [draftEnd, setDraftEnd] = useState<string | null>(endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useEffect(() => {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    if (startDate) {
      const parsed = parseIsoParts(startDate);
      if (parsed) {
        setViewYear(parsed.year);
        setViewMonth(parsed.monthIndex);
      }
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!selectedPeriod) return;
    const m = /^(\d{4})-(\d{2})$/.exec(selectedPeriod);
    if (m) {
      setViewYear(Number(m[1]));
      setViewMonth(Number(m[2]) - 1);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (evt: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(evt.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const cells: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(null);
    }
    for (let d = 1; d <= totalDays; d += 1) {
      cells.push({ day: d, iso: toIsoDate(viewYear, viewMonth, d) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const previewRange = useMemo(() => {
    if (draftStart && draftEnd) {
      return draftStart <= draftEnd ? [draftStart, draftEnd] : [draftEnd, draftStart];
    }
    if (draftStart && hoverDate) {
      return draftStart <= hoverDate ? [draftStart, hoverDate] : [hoverDate, draftStart];
    }
    if (draftStart) {
      return [draftStart, draftStart];
    }
    return null;
  }, [draftStart, draftEnd, hoverDate]);

  const hasActiveFilter = Boolean((startDate && endDate) || selectedPeriod);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(SELECTABLE_YEARS[0], y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1], y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (iso: string) => {
    if (iso > todayIso()) return;
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(iso);
      setDraftEnd(null);
      return;
    }
    const [orderedStart, orderedEnd] = draftStart <= iso ? [draftStart, iso] : [iso, draftStart];
    setDraftStart(orderedStart);
    setDraftEnd(orderedEnd);
    setHoverDate(null);
    onApplyRange(orderedStart, orderedEnd);
    setOpen(false);
  };

  const handleSelectMonthChip = (monthIdx: number) => {
    const periodStr = `${viewYear}-${padTwoDigits(monthIdx + 1)}`;
    setViewMonth(monthIdx);
    if (onSelectPeriod) {
      onSelectPeriod(selectedPeriod === periodStr ? null : periodStr, 'month');
    } else {
      const mStart = toIsoDate(viewYear, monthIdx, 1);
      const rawEnd = toIsoDate(viewYear, monthIdx, daysInMonth(viewYear, monthIdx));
      const today = todayIso();
      if (mStart > today) return;
      const mEnd = rawEnd > today ? today : rawEnd;
      onApplyRange(mStart, mEnd);
    }
    setOpen(false);
  };

  const handleSelectFullMonth = () => {
    const mStart = toIsoDate(viewYear, viewMonth, 1);
    const rawEnd = toIsoDate(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
    const today = todayIso();
    if (mStart > today) return;
    const mEnd = rawEnd > today ? today : rawEnd;
    setDraftStart(mStart);
    setDraftEnd(mEnd);
    onApplyRange(mStart, mEnd);
    setOpen(false);
  };

  const handleApplyDraft = () => {
    if (draftStart && draftEnd) {
      const [s, e] = draftStart <= draftEnd ? [draftStart, draftEnd] : [draftEnd, draftStart];
      onApplyRange(s, e);
      setOpen(false);
    } else if (draftStart) {
      onApplyRange(draftStart, draftStart);
      setOpen(false);
    }
  };

  const handleClearAll = () => {
    setDraftStart(null);
    setDraftEnd(null);
    setHoverDate(null);
    onApplyRange(null, null);
    onClearPeriod?.();
    setOpen(false);
  };

  const pillValue = formatPillDateRange(startDate, endDate, selectedPeriod, lang);
  const chipMonths = viewYear === DEFAULT_YEAR ? t.months.slice(0, DEFAULT_MONTH + 1) : t.months;
  const r30 = last30Days();
  const rPeak = dryPeak();
  const rYear = yearToDate();

  return (
    <div
      ref={anchorRef}
      className={variant === 'inline' ? 'map-date-picker-inline' : 'map-date-picker-anchor'}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className={`map-date-pill ${hasActiveFilter ? 'active' : ''} ${variant === 'inline' ? 'pill-inline' : ''}`}>
        <button
          type="button"
          className="map-date-pill-trigger"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={t.datePickerTitle}
        >
          <Calendar size={14} color={hasActiveFilter ? '#fbbf24' : '#f97316'} />
          <span className="map-date-pill-text">
            {variant === 'inline' ? (
              <>
                {t.periodFilterLabel}: <strong>{pillValue}</strong>
              </>
            ) : (
              pillValue
            )}
          </span>
          <ChevronDown size={14} />
        </button>

        {hasActiveFilter && (
          <button
            type="button"
            className="map-date-pill-clear"
            onClick={handleClearAll}
            title={t.clearRangeBtn}
            aria-label={t.clearRangeBtn}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div
          className={`map-date-popover ${variant === 'inline' ? 'popover-left' : ''}`}
          role="dialog"
          aria-label={t.datePickerTitle}
        >
          <div className="cal-popover-top">
            <span className="cal-popover-title">{t.datePickerTitle}</span>
          </div>

          <div className="cal-month-chips" role="group" aria-label="Quick month periods">
            {chipMonths.map((label, idx) => {
              const ym = `${viewYear}-${padTwoDigits(idx + 1)}`;
              const isChipActive = selectedPeriod === ym;
              return (
                <button
                  key={ym}
                  type="button"
                  className={`cal-month-chip ${isChipActive ? 'active' : ''}`}
                  onClick={() => handleSelectMonthChip(idx)}
                  title={ym}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="cal-presets-grid">
            <button
              type="button"
              className={`cal-preset-btn ${!startDate && !endDate && !selectedPeriod ? 'active' : ''}`}
              onClick={handleClearAll}
            >
              {t.clearPeriodBtn}
            </button>
            <button
              type="button"
              className={`cal-preset-btn ${isSameRange(startDate, endDate, r30) ? 'active' : ''}`}
              onClick={() => {
                onApplyRange(r30.start, r30.end);
                setOpen(false);
              }}
            >
              {t.presetLast30d}
            </button>
            <button
              type="button"
              className={`cal-preset-btn ${isSameRange(startDate, endDate, rPeak) ? 'active' : ''}`}
              onClick={() => {
                onApplyRange(rPeak.start, rPeak.end);
                setOpen(false);
              }}
            >
              {t.presetDryPeak}
            </button>
            <button
              type="button"
              className={`cal-preset-btn ${isSameRange(startDate, endDate, rYear) ? 'active' : ''}`}
              onClick={() => {
                onApplyRange(rYear.start, rYear.end);
                setOpen(false);
              }}
            >
              {t.presetFullYear}
            </button>
          </div>

          <div className="cal-nav-row">
            <button
              type="button"
              className="cal-icon-btn"
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>

            <div className="cal-select-pair">
              <select
                className="control-select control-select-sm"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                aria-label="Month"
              >
                {t.months.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                className="control-select control-select-sm"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                aria-label="Year"
              >
                {SELECTABLE_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="cal-icon-btn"
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <button
            type="button"
            className="cal-full-month-btn"
            onClick={handleSelectFullMonth}
          >
            {t.selectFullMonthBtn}
          </button>

          <div className="cal-weekdays-row">
            {t.weekdaysShort.map((wd) => (
              <span key={wd} className="cal-weekday-label">
                {wd}
              </span>
            ))}
          </div>

          <div className="cal-grid" onMouseLeave={() => setHoverDate(null)}>
            {(() => {
              const today = todayIso();
              return calendarCells.map((cell, idx) => {
                if (!cell) {
                  return <span key={`empty-${idx}`} className="cal-day-empty" />;
                }
                const isFuture = cell.iso > today;
                const inRange = Boolean(
                  !isFuture && previewRange && cell.iso >= previewRange[0] && cell.iso <= previewRange[1],
                );
                const isEdge = Boolean(
                  !isFuture && previewRange && (cell.iso === previewRange[0] || cell.iso === previewRange[1]),
                );
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isFuture}
                    className={`cal-day ${inRange ? 'in-range' : ''} ${isEdge ? 'range-edge' : ''} ${isFuture ? 'future-day' : ''}`}
                    onMouseEnter={() => {
                      if (!isFuture && draftStart && !draftEnd) setHoverDate(cell.iso);
                    }}
                    onClick={() => handleDayClick(cell.iso)}
                  >
                    {cell.day}
                  </button>
                );
              });
            })()}
          </div>

          <div className="cal-popover-footer">
            <span className="cal-hint-text">
              {draftStart && !draftEnd
                ? t.calendarHintEnd
                : previewRange
                  ? `${previewRange[0]} → ${previewRange[1]}`
                  : t.calendarHintStart}
            </span>
            <div className="cal-footer-actions">
              <button type="button" className="cal-clear-btn" onClick={handleClearAll}>
                {t.clearRangeBtn}
              </button>
              <button
                type="button"
                className="cal-apply-btn"
                onClick={handleApplyDraft}
                disabled={!draftStart}
              >
                {t.applyRangeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
