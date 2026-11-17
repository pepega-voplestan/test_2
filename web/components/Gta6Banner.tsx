import React, { useState, useEffect } from 'react';

// GTA VI releases November 19, 2026 at midnight CET (UTC+1)
const RELEASE_DATE = new Date('2026-11-19T00:00:00+01:00');
const STORAGE_KEY = 'vopley_gta6';
// Header height in px — keep in sync with Header.tsx h-[52px]
const HEADER_H = 52;
// Half the feed column max-width + a little breathing room so panels don't clip the feed
const HALF_FEED = 354;

function getTimeLeft() {
  const diff = RELEASE_DATE.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

const Gta6Banner: React.FC = () => {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  // window.gta6() — toggle; window.gta6(true/false) — set
  useEffect(() => {
    (window as any).gta6 = (val?: boolean) => {
      const next = val !== undefined ? val : !enabled;
      setEnabled(next);
      localStorage.setItem(STORAGE_KEY, String(next));
      console.log(`GTA6 banner: ${next ? 'включён ✅' : 'выключен ❌'}`);
    };
    return () => { delete (window as any).gta6; };
  }, [enabled]);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!enabled) return null;

  const localReleaseTime = RELEASE_DATE.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const panelBase: React.CSSProperties = {
    position: 'fixed',
    top: HEADER_H,
    bottom: 0,
    zIndex: 10,
    overflow: 'hidden',
    // Only show on wide-enough screens; hide via display otherwise (see className)
  };

  const imgBase: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  return (
    <>
      <style>{`
        @keyframes gta6-pulse {
          from { transform: scale(1) rotate(-1deg); }
          to   { transform: scale(1.07) rotate(1deg); }
        }
      `}</style>

      {/* Left panel — shows left portion of the banner image */}
      <div
        className="hidden xl:block"
        style={{ ...panelBase, left: 0, right: `calc(50vw + ${HALF_FEED}px)` }}
      >
        <img src="/gta6-banner.jpg" alt="" style={{ ...imgBase, objectPosition: 'left top' }} draggable={false} />
        {/* Fade inner edge to match page background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to left, rgb(var(--th-page)) 0%, transparent 35%)`,
          pointerEvents: 'none',
        }} />
      </div>

      {/* Right panel — shows right portion of the banner image + countdown timer */}
      <div
        className="hidden xl:block"
        style={{ ...panelBase, left: `calc(50vw + ${HALF_FEED}px)`, right: 0 }}
      >
        {/* 85% positions the viewport over the reviews section rather than the far right edge */}
        <img src="/gta6-banner.jpg" alt="" style={{ ...imgBase, objectPosition: '85% top' }} draggable={false} />
        {/* Fade inner edge to match page background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to right, rgb(var(--th-page)) 0%, transparent 35%)`,
          pointerEvents: 'none',
        }} />

        {/* Countdown + buy button — lower part of right panel, below the reviews */}
        <div style={{ position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.72)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            borderRadius: '8px',
            padding: '8px 14px',
            backdropFilter: 'blur(6px)',
            textAlign: 'center',
          }}>
            <div style={{
              color: '#fbbf24',
              fontSize: '0.55rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}>
              до релиза
            </div>

            {timeLeft ? (
              <>
                <div style={{
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.03em',
                  lineHeight: 1.1,
                }}>
                  {pad(timeLeft.days)}д{' '}
                  {pad(timeLeft.hours)}ч{' '}
                  {pad(timeLeft.minutes)}м{' '}
                  <span style={{ color: '#fbbf24' }}>{pad(timeLeft.seconds)}с</span>
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.5rem', marginTop: '5px', lineHeight: 1.4 }}>
                  в вашем часовом поясе:<br />
                  <span style={{ color: '#9ca3af' }}>{localReleaseTime}</span>
                </div>
              </>
            ) : (
              <div style={{ color: '#fbbf24', fontSize: '0.95rem', fontWeight: 900, letterSpacing: '0.05em' }}>
                ОН ВЫШЕЛ!!!
              </div>
            )}
          </div>

          {/* Ugly "Купить" button */}
          <a
            href="https://store.steampowered.com/app/4814120/ANANTA/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #00ff41, #ffff00)',
              color: '#cc0000',
              fontSize: '1.1rem',
              fontWeight: 900,
              fontFamily: 'Impact, Arial Black, sans-serif',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              padding: '7px 18px',
              border: '3px solid #ff00ff',
              borderRadius: '4px',
              boxShadow: '0 0 12px #00ff41, 3px 3px 0 #ff00ff',
              textShadow: '1px 1px 0 #ffff00, -1px -1px 0 #000',
              animation: 'gta6-pulse 0.8s ease-in-out infinite alternate',
              cursor: 'pointer',
            }}
          >
            🛒 КУПИТЬ
          </a>
        </div>
      </div>
    </>
  );
};

export default Gta6Banner;
