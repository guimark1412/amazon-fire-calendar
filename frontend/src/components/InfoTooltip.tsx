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
const TOUCH_GUARD_MS = 700;

export function InfoTooltip({
  text,
  title,
  insideButton = false,
  variant = 'info',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const openedAtRef = useRef<number>(0);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const isRecentTouch = () => Date.now() - lastTouchTimeRef.current < TOUCH_GUARD_MS;

  const computePos = useCallback((): TooltipPos | null => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return null;
    const rect = el.getBoundingClientRect();
    const width = Math.min(272, window.innerWidth - 24);
    const centerX = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, centerX - width / 2));
    const arrowLeft = Math.max(14, Math.min(width - 14, centerX - left));
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' =
      spaceAbove < 145 && spaceBelow > spaceAbove ? 'bottom' : 'top';
    const top = placement === 'top' ? rect.top - 9 : rect.bottom + 9;
    return { left, top, width, placement, arrowLeft };
  }, []);

  const show = useCallback(() => {
    clearHoverTimer();
    openedAtRef.current = Date.now();
    const next = computePos();
    if (next) setPos(next);
    setOpen(true);
  }, [clearHoverTimer, computePos]);

  const scheduleShow = useCallback(() => {
    if (isRecentTouch()) return;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      openedAtRef.current = Date.now();
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
    let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 0;

    const handleScroll = () => {
      // Ignore tiny touch-tap micro-scrolls fired immediately on open
      if (Date.now() - openedAtRef.current < 220) return;
      setOpen(false);
    };
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      // Ignore mobile URL-bar height jitters unless horizontal width changed
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || portalRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('pointerdown', handleOutside, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('pointerdown', handleOutside, true);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className={`info-tip-anchor ${open ? 'info-tip-anchor--open' : ''}`}
      onTouchStart={() => {
        lastTouchTimeRef.current = Date.now();
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') {
          lastTouchTimeRef.current = Date.now();
        }
      }}
      onMouseEnter={scheduleShow}
      onMouseLeave={() => {
        if (isRecentTouch()) return;
        hide();
      }}
      onFocus={
        insideButton
          ? undefined
          : () => {
              if (isRecentTouch()) return;
              show();
            }
      }
      onBlur={
        insideButton
          ? undefined
          : () => {
              if (isRecentTouch()) return;
              hide();
            }
      }
      onClick={(e) => {
        const touchTap = isRecentTouch();
        if (insideButton && !touchTap) {
          // On desktop mouse click, let the parent button perform its primary action
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (open) {
          hide();
        } else {
          show();
        }
      }}
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
      aria-expanded={!insideButton ? open : undefined}
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
            ref={portalRef}
            role="tooltip"
            className={`info-tip-portal info-tip-portal--${pos.placement} ${
              variant === 'warning' ? 'info-tip-portal--warning' : ''
            }`}
            style={{
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              width: `${pos.width}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              hide();
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
