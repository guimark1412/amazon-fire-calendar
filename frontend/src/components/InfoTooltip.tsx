import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  title?: string;
  insideButton?: boolean;
  variant?: 'info' | 'warning';
}

interface TooltipPos {
  left: number;
  top: number;
  width: number;
  placement: 'top' | 'bottom';
  arrowLeft: number;
}

const HOVER_DELAY_MS = 500;

export function InfoTooltip({
  text,
  title,
  insideButton = false,
  variant = 'info',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const computePos = useCallback((): TooltipPos | null => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return null;
    const rect = el.getBoundingClientRect();
    const width = Math.min(272, window.innerWidth - 24);
    const centerX = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, centerX - width / 2));
    const arrowLeft = Math.max(12, Math.min(width - 12, centerX - left));
    const placement: 'top' | 'bottom' = rect.top < 120 ? 'bottom' : 'top';
    const top = placement === 'top' ? rect.top - 9 : rect.bottom + 9;
    return { left, top, width, placement, arrowLeft };
  }, []);

  const show = useCallback(() => {
    clearHoverTimer();
    const next = computePos();
    if (next) setPos(next);
    setOpen(true);
  }, [clearHoverTimer, computePos]);

  const scheduleShow = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      const next = computePos();
      if (next) setPos(next);
      setOpen(true);
    }, HOVER_DELAY_MS);
  }, [clearHoverTimer, computePos]);

  const hide = useCallback(() => {
    clearHoverTimer();
    setOpen(false);
  }, [clearHoverTimer]);

  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    const next = computePos();
    if (next) setPos(next);
  }, [open, computePos]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => setOpen(false);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('mousedown', handleOutside);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('mousedown', handleOutside);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className="info-tip-anchor"
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
      onFocus={insideButton ? undefined : show}
      onBlur={insideButton ? undefined : hide}
      onClick={
        insideButton
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (open) {
                hide();
              } else {
                show();
              }
            }
      }
      onKeyDown={
        insideButton
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (open) hide();
                else show();
              }
            }
      }
      role={insideButton ? undefined : 'button'}
      tabIndex={insideButton ? undefined : 0}
      aria-label={title ? `${title}: ${text}` : text}
    >
      <span
        className={`info-tip-badge ${variant === 'warning' ? 'info-tip-badge--warning' : ''}`}
        aria-hidden="true"
      >
        {variant === 'warning' ? <AlertTriangle size={12} strokeWidth={2.4} /> : 'i'}
      </span>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className={`info-tip-portal info-tip-portal--${pos.placement} ${
              variant === 'warning' ? 'info-tip-portal--warning' : ''
            }`}
            style={{
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              width: `${pos.width}px`,
            }}
          >
            <span className="info-tip-arrow" style={{ left: `${pos.arrowLeft}px` }} />
            {title && <strong className="info-tip-title">{title}</strong>}
            <span className="info-tip-text">{text}</span>
          </div>,
          document.body,
        )}
    </span>
  );
}
