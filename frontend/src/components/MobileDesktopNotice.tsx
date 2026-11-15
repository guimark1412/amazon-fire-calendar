import { useEffect, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { I18N, type Language } from '../i18n';

const STORAGE_KEY = 'afc_mobile_notice_seen';

interface MobileDesktopNoticeProps {
  lang: Language;
  onToggleLang?: () => void;
}

export function MobileDesktopNotice({ lang, onToggleLang }: MobileDesktopNoticeProps) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return false;
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visible || typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handleChange = () => {
      if (!mq.matches) setVisible(false);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    mq.addEventListener?.('change', handleChange);
    window.addEventListener('keydown', handleEsc);
    return () => {
      mq.removeEventListener?.('change', handleChange);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  if (!visible) return null;

  const t = I18N[lang];

  return (
    <div
      className="mobile-notice-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-notice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="mobile-notice-card">
        <div className="mobile-notice-top">
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
          <button
            type="button"
            className="modal-close"
            onClick={dismiss}
            aria-label={t.mobileDesktopContinue}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mobile-morph-stage" aria-hidden="true">
          <div className="mobile-morph-glow" />
          <div className="mobile-morph-device">
            <span className="mobile-morph-speaker" />
            <div className="mobile-morph-screen">
              <div className="mobile-morph-ui-header" />
              <div className="mobile-morph-ui-body">
                <div className="mobile-morph-ui-map">
                  <span className="mobile-morph-fire-dot mobile-morph-fire-dot--1" />
                  <span className="mobile-morph-fire-dot mobile-morph-fire-dot--2" />
                </div>
                <div className="mobile-morph-ui-chart">
                  <span className="mobile-morph-bar" />
                  <span className="mobile-morph-bar" />
                  <span className="mobile-morph-bar" />
                </div>
              </div>
            </div>
            <span className="mobile-morph-home" />
          </div>
          <div className="mobile-morph-stand">
            <span className="mobile-morph-neck" />
            <span className="mobile-morph-base" />
          </div>
        </div>

        <h2 id="mobile-notice-title" className="mobile-notice-title">
          {t.mobileDesktopTitle}
        </h2>
        <p className="mobile-notice-desc">{t.mobileDesktopDesc}</p>

        <button
          type="button"
          className="control-select action-btn pitch-btn mobile-notice-cta"
          onClick={dismiss}
        >
          {t.mobileDesktopContinue}
        </button>
      </div>
    </div>
  );
}
