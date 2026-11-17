import React, { useState, useEffect } from 'react';

// GTA VI releases November 19, 2026 at midnight CET (UTC+1)
const RELEASE_DATE = new Date('2026-11-19T00:00:00+01:00');
const STORAGE_KEY = 'vopley_gta6';

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
  const [enabled, setEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false');
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

  // Toggle class on <html> so the CSS rules in the <style> tag below kick in
  useEffect(() => {
    if (enabled) {
      document.documentElement.classList.add('gta6-active');
    } else {
      document.documentElement.classList.remove('gta6-active');
    }
    return () => document.documentElement.classList.remove('gta6-active');
  }, [enabled]);

  if (!enabled) return null;

  const localReleaseTime = RELEASE_DATE.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <style>{`
        /* Background image on the body — visible in the gutters on xl+ screens */
        @media (min-width: 1280px) {
          html.gta6-active body {
            background: url(/gta6-banner.jpg) center top / cover fixed !important;
          }
          /* Make the page wrapper transparent so the body background shows through */
          html.gta6-active #root > div {
            background-color: transparent !important;
          }
          /* Give the feed column a solid background so the banner doesn't bleed through card gaps */
          html.gta6-active main > div {
            background-color: rgb(var(--th-page));
            border-radius: 12px;
          }
        }

        @keyframes gta6-pulse {
          from { transform: scale(1) rotate(-1deg); }
          to   { transform: scale(1.07) rotate(1deg); }
        }
      `}</style>

      {/* Timer + buy button — fixed in the bottom-right gutter */}
      <div
        className="hidden xl:flex"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 10,
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
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
    </>
  );
};

export default Gta6Banner;
