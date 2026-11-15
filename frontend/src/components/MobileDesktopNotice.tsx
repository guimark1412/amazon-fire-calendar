import { useCallback, useEffect, useState } from 'react';
import { I18N, type Language } from '../i18n';

type SplashPhase = 'loading' | 'playing' | 'fading' | 'done';

interface MobileDesktopNoticeProps {
  lang: Language;
  appReady: boolean;
  onToggleLang?: () => void;
}

export function MobileDesktopNotice({ lang, appReady, onToggleLang }: MobileDesktopNoticeProps) {
  const [phase, setPhase] = useState<SplashPhase>(() => {
    if (typeof window === 'undefined') return 'done';
    return window.matchMedia('(max-width: 768px)').matches ? 'loading' : 'done';
  });

  const startFadeOut = useCallback(() => {
    setPhase((prev) => (prev === 'fading' || prev === 'done' ? prev : 'fading'));
  }, []);

  // Desktop viewport check & Escape shortcut
  useEffect(() => {
    if (phase === 'done' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handleChange = () => {
      if (!mq.matches) {
        setPhase('done');
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startFadeOut();
    };
    mq.addEventListener?.('change', handleChange);
    window.addEventListener('keydown', handleEsc);
    return () => {
      mq.removeEventListener?.('change', handleChange);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [phase, startFadeOut]);

  // Step 1 -> Step 2: wait until site data is loaded (min 400ms beat, max 4.5s safety cap)
  useEffect(() => {
    if (phase !== 'loading') return;
    const delay = appReady ? 400 : 4500;
    const timer = window.setTimeout(() => {
      setPhase('playing');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, appReady]);

  // Step 2 -> Step 3: show phone (~1.5s) -> morph to monitor -> pause cleanly -> dissolve
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = window.setTimeout(() => {
      startFadeOut();
    }, 4600);
    return () => window.clearTimeout(timer);
  }, [phase, startFadeOut]);

  // Step 3 -> Step 4: unmount cleanly after slow transparent dissolve finishes
  useEffect(() => {
    if (phase !== 'fading') return;
    const timer = window.setTimeout(() => {
      setPhase('done');
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'done') return null;

  const t = I18N[lang];

  return (
    <div
      className={`mobile-splash-overlay mobile-splash-overlay--${phase}`}
      role="dialog"
      aria-modal={phase !== 'fading'}
      aria-labelledby="mobile-notice-title"
    >
      <div className="mobile-splash-topbar">
        {onToggleLang ? (
          <button
            type="button"
            className="mobile-splash-ghost-btn"
            onClick={onToggleLang}
            aria-label="Switch language"
          >
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="mobile-splash-center">
        {phase === 'loading' ? (
          <div className="mobile-splash-loader" role="status">
            <span className="mobile-splash-spinner" aria-hidden="true" />
            <p className="mobile-splash-loading-text">{t.mobileDesktopLoading}</p>
          </div>
        ) : (
          <div className="mobile-splash-morph-wrap">
            <div className="mobile-morph-stage mobile-morph-stage--hero" aria-hidden="true">
              <div className="mobile-morph-glow mobile-morph-glow--hero" />
              <div className="mobile-morph-device mobile-morph-device--hero">
                <span className="mobile-morph-speaker" />
                <div className="mobile-morph-screen">
                  <span className="mobile-morph-ember" />
                  <span className="mobile-morph-line mobile-morph-line--short" />
                </div>
                <span className="mobile-morph-home" />
              </div>
              <div className="mobile-morph-stand mobile-morph-stand--hero">
                <span className="mobile-morph-neck mobile-morph-neck--hero" />
                <span className="mobile-morph-base mobile-morph-base--hero" />
              </div>
            </div>

            <h2 id="mobile-notice-title" className="mobile-notice-title mobile-notice-title--hero">
              {t.mobileDesktopTitle}
            </h2>
            <p className="mobile-notice-desc mobile-notice-desc--hero">{t.mobileDesktopDesc}</p>
          </div>
        )}
      </div>
    </div>
  );
}
