// components/ImageGrid.jsx
import React, { useState } from 'react';

const TYPE_COLORS = {
  studio:    '#818cf8',
  model:     '#34d399',
  lifestyle: '#f59e0b',
  editorial: '#f472b6',
};

const PLACEHOLDERS = [
  { label: 'Studio Shot',    type: 'studio',    desc: 'Clean product photography' },
  { label: 'Model Shot',     type: 'model',     desc: 'Worn/used by model' },
  { label: 'Lifestyle Shot', type: 'lifestyle', desc: 'Real-world context' },
  { label: 'Editorial Shot', type: 'editorial', desc: 'Magazine style' },
];

const SOURCE_LABELS = {
  puter:        { text: '⚡ Puter AI',    style: { background: 'rgba(124,106,247,.25)', border: '1px solid rgba(124,106,247,.4)', color: '#c084fc' } },
  pollinations: { text: '🌸 Pollinations', style: { background: 'rgba(240,180,41,.2)',  border: '1px solid rgba(240,180,41,.35)', color: '#f0b429' } },
  picsum:       { text: '📷 Placeholder', style: { background: 'rgba(107,107,138,.2)', border: '1px solid rgba(107,107,138,.35)', color: '#6b6b8a' } },
  fallback:     { text: '🔄 Fallback',    style: { background: 'rgba(107,107,138,.2)', border: '1px solid rgba(107,107,138,.35)', color: '#6b6b8a' } },
};

/* ─── Single image card ──────────────────────────────────────── */
function ImageCard({ img, index, generating, doneIndexes }) {
  const [imgError, setImgError] = useState(false);
  const isGenerating = generating && !doneIndexes.includes(index);
  const ph = PLACEHOLDERS[index];
  const type  = img?.type  || ph.type;
  const label = img?.label || ph.label;
  const desc  = img?.desc  || ph.desc;
  const color = TYPE_COLORS[type] || '#818cf8';
  const src   = imgError ? null : img?.url;

  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `retlify-${type}-${Date.now()}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  };

  const srcInfo = img?.source ? (SOURCE_LABELS[img.source] || SOURCE_LABELS.fallback) : null;

  return (
    <div style={s.card}>
      {/* Image area */}
      <div style={s.imgWrap}>

        {/* Generating overlay */}
        {isGenerating && (
          <div style={s.overlay}>
            <div style={s.spinner} />
            <span style={{ fontSize: '.74rem', color: '#6b6b8a' }}>
              Generating {label}…
            </span>
          </div>
        )}

        {/* Skeleton before any image */}
        {!isGenerating && !src && (
          <div style={s.skeleton} />
        )}

        {/* Loaded image */}
        {src && (
          <>
            <img
              src={src}
              alt={label}
              style={s.img}
              onError={() => setImgError(true)}
              loading="lazy"
            />
            <div style={s.successBadge}>✓ Generated</div>
            {srcInfo && (
              <div style={{ ...s.sourceTag, ...srcInfo.style }}>
                {srcInfo.text}
              </div>
            )}
          </>
        )}

        {/* Error state */}
        {imgError && (
          <div style={s.errorState}>
            <div style={{ fontSize: '1.5rem', marginBottom: '.3rem' }}>⚠️</div>
            <div style={{ fontSize: '.72rem', color: '#6b6b8a' }}>Failed to load</div>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div style={s.footer}>
        <div style={s.typeInfo}>
          <div style={{ ...s.typeDot, background: color }} />
          <div>
            <div style={s.typeName}>{label}</div>
            <div style={s.typeDesc}>{desc}</div>
          </div>
        </div>
        {src && (
          <button style={s.dlBtn} onClick={handleDownload} title="Download image" aria-label={`Download ${label}`}>
            ↓
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Grid ───────────────────────────────────────────────────── */
export default function ImageGrid({ images = [], generating, doneIndexes = [] }) {
  const isEmpty = !generating && images.length === 0;

  if (isEmpty) {
    return (
      <div style={s.emptyState}>
        <div style={s.emptyIcon}>✦</div>
        <div style={s.emptyTitle}>AI-generated images will appear here</div>
        <div style={s.emptySub}>
          Upload a product image and hit Generate to see<br />
          Studio · Model · Lifestyle · Editorial shots
        </div>
      </div>
    );
  }

  const total = 4;
  const done  = doneIndexes.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <div style={s.gridTitle}>Generated Images</div>
        <div style={s.gridCount}>{done}/{total} complete</div>
      </div>

      {/* Progress bar during generation */}
      {generating && (
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${pct}%` }} />
        </div>
      )}

      {/* 2×2 grid */}
      <div style={s.grid}>
        {[0, 1, 2, 3].map(i => (
          <ImageCard
            key={i}
            index={i}
            img={images[i] || null}
            generating={generating}
            doneIndexes={doneIndexes}
          />
        ))}
      </div>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}

const s = {
  emptyState:  { border: '2px dashed #1e1e2e', borderRadius: 20, padding: '4rem 2rem', textAlign: 'center' },
  emptyIcon:   { fontSize: '3.5rem', marginBottom: '1rem', opacity: .4 },
  emptyTitle:  { fontFamily: 'Syne, sans-serif', fontSize: '1.1rem', fontWeight: 700, marginBottom: '.5rem', color: '#6b6b8a' },
  emptySub:    { fontSize: '.85rem', color: '#6b6b8a', opacity: .7, lineHeight: 1.6 },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' },
  gridTitle:   { fontFamily: 'Syne, sans-serif', fontSize: '1.1rem', fontWeight: 700 },
  gridCount:   { fontSize: '.78rem', color: '#6b6b8a' },
  progressWrap:{ height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden', marginBottom: '1rem' },
  progressBar: { height: '100%', background: 'linear-gradient(90deg,#7c6af7,#c084fc)', transition: 'width .4s ease', borderRadius: 2 },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem' },
  card:        { background: '#16161f', border: '1px solid #1e1e2e', borderRadius: 18, overflow: 'hidden', transition: 'transform .25s, box-shadow .25s' },
  imgWrap:     { width: '100%', aspectRatio: '1', background: '#111118', position: 'relative', overflow: 'hidden' },
  overlay:     { position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(10,10,15,.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '.7rem' },
  spinner:     { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(124,106,247,.2)', borderTopColor: '#7c6af7', animation: 'spin 0.8s linear infinite' },
  skeleton:    { width: '100%', height: '100%', background: 'linear-gradient(90deg,#111118 25%,rgba(255,255,255,.04) 50%,#111118 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' },
  img:         { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .4s' },
  successBadge:{ position: 'absolute', top: '.75rem', right: '.75rem', zIndex: 5, background: 'rgba(52,211,153,.15)', border: '1px solid rgba(52,211,153,.3)', color: '#34d399', fontSize: '.65rem', fontWeight: 700, padding: '.25rem .6rem', borderRadius: 8, backdropFilter: 'blur(8px)' },
  sourceTag:   { position: 'absolute', bottom: '.6rem', left: '.6rem', zIndex: 5, fontSize: '.62rem', fontWeight: 600, padding: '.22rem .55rem', borderRadius: 6, backdropFilter: 'blur(8px)' },
  errorState:  { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  footer:      { padding: '.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  typeInfo:    { display: 'flex', alignItems: 'center', gap: '.5rem' },
  typeDot:     { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  typeName:    { fontSize: '.78rem', fontWeight: 600, color: '#e8e8f0' },
  typeDesc:    { fontSize: '.68rem', color: '#6b6b8a' },
  dlBtn:       { width: 30, height: 30, borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', cursor: 'pointer', color: '#6b6b8a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', transition: 'all .2s' },
};
