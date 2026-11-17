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

  // Expose window.gta6(true/false) — no arg toggles
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

  // Show release time in the user's local timezone
  const localReleaseTime = RELEASE_DATE.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative w-full overflow-hidden select-none">
      <img
        src="/gta6-banner.jpg"
        alt="GTA VI — скоро"
        className="w-full h-auto block"
        draggable={false}
      />

      {/* Countdown overlay — bottom-right, below the review quotes in the image */}
      <div className="absolute" style={{ bottom: '3%', right: '1.5%' }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          borderRadius: '8px',
          padding: '8px 12px',
          backdropFilter: 'blur(6px)',
          textAlign: 'center',
          minWidth: '130px',
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
                letterSpacing: '0.02em',
                lineHeight: 1.1,
              }}>
                {pad(timeLeft.days)}д{' '}
                {pad(timeLeft.hours)}ч{' '}
                {pad(timeLeft.minutes)}м{' '}
                <span style={{ color: '#fbbf24' }}>{pad(timeLeft.seconds)}с</span>
              </div>
              <div style={{
                color: '#6b7280',
                fontSize: '0.5rem',
                marginTop: '5px',
                lineHeight: 1.4,
              }}>
                в вашем часовом поясе:<br />
                <span style={{ color: '#9ca3af' }}>{localReleaseTime}</span>
              </div>
            </>
          ) : (
            <div style={{
              color: '#fbbf24',
              fontSize: '0.95rem',
              fontWeight: 900,
              letterSpacing: '0.05em',
            }}>
              ОН ВЫШЕЛ!!!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Gta6Banner;
