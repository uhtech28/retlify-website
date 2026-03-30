// components/VirtualTryOnComingSoon.jsx
import React, { useState, useEffect } from 'react';

/* ─── Particle dots ──────────────────────────────────────────── */
function Particles() {
  const dots = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 6,
    duration: Math.random() * 4 + 4,
    opacity: Math.random() * 0.4 + 0.1,
  }));

  return (
    <div style={s.particleLayer} aria-hidden="true">
      {dots.map(d => (
        <div
          key={d.id}
          style={{
            position: 'absolute',
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.size,
            height: d.size,
            borderRadius: '50%',
            background: d.id % 3 === 0 ? '#facc15' : d.id % 3 === 1 ? '#fb923c' : 'rgba(255,255,255,0.5)',
            opacity: d.opacity,
            animation: `particleDrift ${d.duration}s ${d.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Ring accent ────────────────────────────────────────────── */
function Rings() {
  return (
    <div style={s.ringContainer} aria-hidden="true">
      <div style={{ ...s.ring, ...s.ring1 }} />
      <div style={{ ...s.ring, ...s.ring2 }} />
      <div style={{ ...s.ring, ...s.ring3 }} />
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function VirtualTryOnComingSoon() {
  const [notified, setNotified] = useState(false);
  const [pulse,    setPulse]    = useState(false);

  /* Subtle heartbeat pulse every 3s */
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleNotify = () => {
    if (notified) return;
    setNotified(true);
  };

  return (
    <div style={s.container}>

      {/* CSS animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-14px) scale(1.06); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.55; filter: blur(28px); }
          50%       { opacity: 0.85; filter: blur(20px); }
        }
        @keyframes outerGlow {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50%       { opacity: 0.30; transform: scale(1.08); }
        }
        @keyframes ringExpand {
          0%, 100% { transform: scale(1);    opacity: 0.35; }
          50%       { transform: scale(1.04); opacity: 0.18; }
        }
        @keyframes particleDrift {
          0%   { transform: translateY(0px) translateX(0px); }
          100% { transform: translateY(-12px) translateX(6px); }
        }
        @keyframes badgeShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes checkPop {
          0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
          70%  { transform: scale(1.2) rotate(4deg);  opacity: 1; }
          100% { transform: scale(1) rotate(0deg);    opacity: 1; }
        }
        .vto-notify-btn {
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .vto-notify-btn:hover:not(:disabled) {
          transform: scale(1.05) translateY(-1px);
          box-shadow: 0 8px 28px rgba(250,204,21,0.45);
        }
        .vto-notify-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
      `}</style>

      {/* Background ambient particles */}
      <Particles />

      {/* Decorative rings */}
      <Rings />

      {/* ── Badge ── */}
      <div style={s.badge}>
        <span style={s.badgeDot} />
        Coming Soon
      </div>

      {/* ── Orb + glow system ── */}
      <div style={s.orbWrapper}>
        {/* Outer diffuse glow */}
        <div style={{ ...s.outerGlow, animation: 'outerGlow 4s ease-in-out infinite' }} />

        {/* Mid glow ring */}
        <div style={{ ...s.midGlow, animation: `glowPulse 4s ease-in-out infinite` }} />

        {/* The floating orb itself */}
        <div
          style={{
            ...s.orb,
            animation: 'float 4s ease-in-out infinite',
            boxShadow: pulse
              ? '0 0 60px 20px rgba(250,204,21,0.6), 0 0 100px 40px rgba(251,146,60,0.3)'
              : '0 0 40px 14px rgba(250,204,21,0.45), 0 0 80px 30px rgba(251,146,60,0.2)',
          }}
        >
          {/* Inner highlight */}
          <div style={s.orbHighlight} />

          {/* Icon inside orb */}
          <span style={s.orbIcon}>✦</span>
        </div>
      </div>

      {/* ── Title ── */}
      <h2 style={{ ...s.title, animation: 'fadeSlideUp 0.6s ease both 0.1s' }}>
        AI Virtual Try-On
      </h2>

      {/* ── Description ── */}
      <p style={{ ...s.description, animation: 'fadeSlideUp 0.6s ease both 0.2s' }}>
        Upload your product and generate realistic model shots, lifestyle visuals,
        and studio-quality images using AI.
      </p>

      {/* ── Divider ── */}
      <div style={s.divider} />

      {/* ── Sub text ── */}
      <p style={{ ...s.subText, animation: 'fadeSlideUp 0.6s ease both 0.35s' }}>
        Virtual try-on system is under development. Stay tuned for a powerful AI feature.
      </p>

      {/* ── Feature pills ── */}
      <div style={{ ...s.pillRow, animation: 'fadeSlideUp 0.6s ease both 0.45s' }}>
        {['👔 Model Shots', '🏡 Lifestyle Visuals', '🎬 Studio Quality', '⚡ Instant AI'].map(label => (
          <span key={label} style={s.featurePill}>{label}</span>
        ))}
      </div>

      {/* ── CTA Button ── */}
      <div style={{ animation: 'fadeSlideUp 0.6s ease both 0.55s' }}>
        {notified ? (
          <div style={s.notifiedState}>
            <span style={{ animation: 'checkPop 0.4s ease both', display: 'inline-block' }}>✓</span>
            &nbsp;You're on the list!
          </div>
        ) : (
          <button
            className="vto-notify-btn"
            style={s.ctaBtn}
            onClick={handleNotify}
          >
            <span style={s.ctaBtnIcon}>🔔</span>
            Notify Me
          </button>
        )}
      </div>

    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */
const s = {
  container: {
    position: 'relative',
    borderRadius: '1rem',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2027 100%)',
    color: '#fff',
    padding: '2.5rem 2rem',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
    border: '1px solid rgba(250,204,21,0.12)',
    height: '100%',
    minHeight: 520,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    overflow: 'hidden',
    gap: '0.9rem',
  },

  particleLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },

  ringContainer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
    borderRadius: '50%',
    border: '1px solid rgba(250,204,21,0.15)',
    animation: 'ringExpand 5s ease-in-out infinite',
  },
  ring1: { width: 220, height: 220, animationDelay: '0s'   },
  ring2: { width: 320, height: 320, animationDelay: '0.8s', border: '1px solid rgba(250,204,21,0.08)' },
  ring3: { width: 440, height: 440, animationDelay: '1.6s', border: '1px solid rgba(250,204,21,0.04)' },

  badge: {
    position: 'relative',
    zIndex: 10,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    background: 'linear-gradient(90deg, #facc15 0%, #fbbf24 50%, #facc15 100%)',
    backgroundSize: '200% auto',
    color: '#000',
    padding: '0.28rem 0.9rem',
    borderRadius: '9999px',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    animation: 'badgeShimmer 3s linear infinite',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    display: 'inline-block',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.25)',
  },

  orbWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    margin: '0.5rem 0',
  },
  outerGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(250,204,21,0.25) 0%, transparent 70%)',
  },
  midGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(251,146,60,0.5) 0%, rgba(250,204,21,0.3) 50%, transparent 80%)',
    filter: 'blur(28px)',
    opacity: 0.55,
  },
  orb: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #facc15 0%, #fb923c 55%, #ef4444 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    transition: 'box-shadow 0.4s ease',
  },
  orbHighlight: {
    position: 'absolute',
    top: '14%',
    left: '18%',
    width: '40%',
    height: '30%',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.35)',
    filter: 'blur(6px)',
    transform: 'rotate(-25deg)',
  },
  orbIcon: {
    fontSize: '1.8rem',
    color: 'rgba(0,0,0,0.55)',
    textShadow: '0 1px 2px rgba(255,255,255,0.3)',
    position: 'relative',
    zIndex: 1,
  },

  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(1.5rem, 3vw, 2.1rem)',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
    background: 'linear-gradient(135deg, #ffffff 0%, #facc15 50%, #fb923c 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
    position: 'relative',
    zIndex: 10,
  },

  description: {
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.62)',
    lineHeight: 1.65,
    maxWidth: 380,
    margin: 0,
    position: 'relative',
    zIndex: 10,
  },

  divider: {
    width: 48,
    height: 2,
    background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.5), transparent)',
    borderRadius: 2,
  },

  subText: {
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.38)',
    lineHeight: 1.55,
    maxWidth: 320,
    margin: 0,
    position: 'relative',
    zIndex: 10,
  },

  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 10,
  },
  featurePill: {
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '0.3rem 0.75rem',
    borderRadius: '9999px',
    background: 'rgba(250,204,21,0.08)',
    border: '1px solid rgba(250,204,21,0.2)',
    color: 'rgba(250,204,21,0.85)',
    letterSpacing: '0.02em',
  },

  ctaBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    background: '#facc15',
    color: '#000',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 700,
    fontSize: '0.85rem',
    padding: '0.65rem 1.6rem',
    borderRadius: '9999px',
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    position: 'relative',
    zIndex: 10,
  },
  ctaBtnIcon: {
    fontSize: '0.95rem',
    lineHeight: 1,
  },

  notifiedState: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    background: 'rgba(52,211,153,0.12)',
    border: '1px solid rgba(52,211,153,0.35)',
    color: '#34d399',
    fontWeight: 700,
    fontSize: '0.85rem',
    padding: '0.65rem 1.6rem',
    borderRadius: '9999px',
    position: 'relative',
    zIndex: 10,
  },
};
