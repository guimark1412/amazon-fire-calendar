import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SlidingOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SlidingToggleGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SlidingOption<T>[];
  ariaLabel: string;
  groupClassName?: string;
  btnClassName?: string;
  indicatorClassName?: string;
  /** Extra dependencies (e.g. lang, dynamic labels) that change button widths. */
  deps?: unknown[];
}

export function SlidingToggleGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  groupClassName = 'toggle-group',
  btnClassName = 'toggle-btn',
  indicatorClassName = 'toggle-pill-indicator',
  deps = [],
}: SlidingToggleGroupProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const btn = btnRefs.current[value];
      if (!btn || btn.offsetWidth === 0 || btn.offsetHeight === 0) {
        setIndicator((prev) =>
          prev.width === 0 ? prev : { left: 0, top: 0, width: 0, height: 0 },
        );
        return;
      }
      const next = {
        left: btn.offsetLeft,
        top: btn.offsetTop,
        width: btn.offsetWidth,
        height: btn.offsetHeight,
      };
      setIndicator((prev) =>
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    const el = containerRef.current;
    const ro =
      el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateIndicator) : null;
    if (ro && el) ro.observe(el);

    return () => {
      window.removeEventListener('resize', updateIndicator);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length, ...deps]);

  return (
    <div
      ref={containerRef}
      className={`${groupClassName} ${indicator.width > 0 ? 'has-indicator' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {indicator.width > 0 && (
        <span
          className={indicatorClassName}
          aria-hidden="true"
          style={{
            width: `${indicator.width}px`,
            height: `${indicator.height}px`,
            transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(el) => {
            btnRefs.current[opt.value] = el;
          }}
          type="button"
          title={opt.title}
          className={`${btnClassName} ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
