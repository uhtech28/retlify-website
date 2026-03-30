// App.jsx — AI Product Studio · Retlify
import React, { useState, useCallback } from 'react';
import UploadBox from './components/UploadBox.jsx';
import VirtualTryOnComingSoon from './components/VirtualTryOnComingSoon.jsx';
import { analyzeImage } from './utils/analyzeImage.js';

/* ─── Toast ──────────────────────────────────────────────────── */
let _tid = 0;
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '.5rem', pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '.75rem 1.1rem', borderRadius: 12, fontSize: '.82rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '.55rem', maxWidth: 340,
          animation: 'slideIn .3s ease',
          ...(t.type === 'success' ? { background: 'rgba(52,211,153,.15)',  border: '1px solid rgba(52,211,153,.35)',  color: '#34d399' }
            : t.type === 'error'   ? { background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.3)',  color: '#f87171' }
            :                        { background: 'rgba(124,106,247,.2)',   border: '1px solid rgba(124,106,247,.4)', color: '#c084fc' }),
        }}>
          <span style={{ flexShrink: 0 }}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────────── */
export default function App() {
  const [preview,      setPreview]      = useState(null);
  const [analysis,     setAnalysis]     = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [toasts,       setToasts]       = useState([]);

  const addToast = useCallback((msg, type = 'info', dur = 3800) => {
    const id = ++_tid;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), dur);
  }, []);

  const handleFile = useCallback(file => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    const a = analyzeImage(file);
    setAnalysis(a);
    setStatus('ready');
    addToast(`Detected: ${a.category} · ${a.color} · ${a.pattern}`, 'info');
  }, [addToast]);

  return (
    <div style={s.root}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>Retlify Studio</div>
        <div style={s.badge}>AI Product Photography</div>
      </header>

      {/* Main layout */}
      <main style={s.layout}>
        {/* LEFT: upload + product analysis */}
        <UploadBox
          onFile={handleFile}
          preview={preview}
          analysis={analysis}
          status={status}
        />

        {/* RIGHT: virtual try-on coming soon */}
        <div style={s.rightCol}>
          <VirtualTryOnComingSoon />
        </div>
      </main>

      <Toast toasts={toasts} />

      <style>{`
        @keyframes slideIn { from{transform:translateX(40px);opacity:0} to{transform:none;opacity:1} }
        * { box-sizing: border-box; }
        @media (max-width: 900px) {
          .layout { grid-template-columns: 1fr !important; }
          .panel  { position: static !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */
const s = {
  root:       { fontFamily: "'DM Sans', sans-serif", background: '#0a0a0f', color: '#e8e8f0', minHeight: '100vh' },
  header:     { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,15,.9)', backdropFilter: 'blur(24px)', borderBottom: '1px solid #1e1e2e', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 },
  logo:       { fontFamily: 'Syne, sans-serif', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-.02em', background: 'linear-gradient(135deg,#7c6af7,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  badge:      { fontSize: '.7rem', fontWeight: 600, letterSpacing: '.08em', background: 'rgba(124,106,247,.15)', color: '#c084fc', border: '1px solid rgba(124,106,247,.3)', padding: '.25rem .65rem', borderRadius: 99 },
  layout:     { display: 'grid', gridTemplateColumns: '360px 1fr', gap: '2rem', maxWidth: 1400, margin: '0 auto', padding: '2rem 2rem 4rem' },
  rightCol:   { display: 'flex', flexDirection: 'column' },
};

