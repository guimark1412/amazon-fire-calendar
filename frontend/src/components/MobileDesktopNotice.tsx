import { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { I18N, type Language } from '../i18n';

const STORAGE_KEY = 'afc_mobile_notice_seen';

type SplashPhase = 'loading' | 'playing' | 'fading' | 'done';

interface MobileDesktopNoticeProps {
  lang: Language;
  appReady: boolean;
  onToggleLang?: () => void;
}

export function MobileDesktopNotice({ lang, appReady, onToggleLang }: MobileDesktopNoticeProps) {
  const [phase, setPhase] = useState<SplashPhase>(() => {
    if (typeof window === 'undefined') return 'done';
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return 'done';
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) === '1' ? 'done' : 'loading';
    } catch {
      return 'loading';
    }
  });

  const startFadeOut = useCallback(() => {
    setPhase((prev) => (prev === 'fading' || prev === 'done' ? prev : 'fading'));
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage errors in restricted contexts
    }
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

  // Step 1 -> Step 2: wait until site data is loaded (min 450ms beat, max 4.5s safety cap)
  useEffect(() => {
    if (phase !== 'loading') return;
    const delay = appReady ? 450 : 4500;
    const timer = window.setTimeout(() => {
      setPhase('playing');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, appReady]);

  // Step 2 -> Step 3: play phone->monitor morph + hold readable message, then smoothly dissolve
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = window.setTimeout(() => {
      startFadeOut();
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [phase, startFadeOut]);

  // Step 3 -> Step 4: unmount cleanly after slow transparent dissolve finishes
  useEffect(() => {
    if (phase !== 'fading') return;
    const timer = window.setTimeout(() => {
      setPhase('done');
    }, 1250);
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
            className="control-select control-select-sm action-btn mobile-notice-lang-btn"
            onClick={onToggleLang}
            aria-label="Switch language"
          >
            <Globe size={13} />
            {lang === 'pt' ? 'EN' : 'PT'}
          </button>
        ) : (
          <span />
        )}

        {phase === 'playing' && (
          <button
            type="button"
            className="mobile-splash-skip"
            onClick={startFadeOut}
          >
            {t.mobileDesktopContinue}
          </button>
        )}
      </div>

      <div className="mobile-splash-center">
        {phase === 'loading' ? (
          <div className="mobile-splash-loader" role="status">
            <img
              src="/logo-calendar.png"
              alt="Amazon Fire Calendar"
              className="mobile-splash-logo"
            />
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
                  <div className="mobile-morph-ui-header" />
                  <div className="mobile-morph-ui-body">
                    <div className="mobile-morph-ui-map">
                      <span className="mobile-morph-fire-dot mobile-morph-fire-dot--1" />
                      <span className="mobile-morph-fire-dot mobile-morph-fire-dot--2" />
                    </div>
                    <div className="mobile-morph-ui-chart mobile-morph-ui-chart--hero">
                      <span className="mobile-morph-bar" />
                      <span className="mobile-morph-bar" />
                      <span className="mobile-morph-bar" />
                      <span className="mobile-morph-bar" />
                    </div>
                  </div>
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
