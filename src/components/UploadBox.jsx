// components/UploadBox.jsx
import React, { useState, useCallback, useRef } from 'react';

const STATUS_CONFIG = {
  idle:    { dot: '#6b6b8a', text: 'Upload an image to begin' },
  ready:   { dot: '#7c6af7', text: 'Ready to generate' },
  loading: { dot: '#f0b429', text: 'Generating with AI…', pulse: true },
  done:    { dot: '#34d399', text: 'All 4 images generated!' },
  error:   { dot: '#f87171', text: 'Generated with fallback images' },
};

export default function UploadBox({ onFile, preview, analysis, generating, onGenerate, status }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  }, [onFile]);

  const handleChange = useCallback(e => {
    const f = e.target.files[0];
    if (f) { onFile(f); e.target.value = ''; }
  }, [onFile]);

  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const canGenerate = !!preview && !generating;

  return (
    <aside style={s.panel}>
      <div style={s.panelTitle}>📁 Upload Product Image</div>

      {/* Drop zone */}
      <div
        style={{ ...s.dropZone, ...(drag ? s.dropZoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload product image"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <div style={s.uploadIcon}>🖼️</div>
        <div style={s.uploadTitle}>Drop product image here</div>
        <div style={s.uploadSub}>PNG · JPG · WEBP — any product photo</div>
      </div>

      {/* Image preview */}
      {preview && (
        <div style={s.previewWrap}>
          <img src={preview} alt="Uploaded product" style={s.previewImg} />
          <div style={s.previewBadge}>✓ Image loaded</div>
        </div>
      )}

      {/* Detected attributes */}
      {analysis && (
        <div style={s.analysisBox}>
          <div style={{ ...s.panelTitle, color: '#c084fc', marginBottom: '.7rem' }}>
            🔍 Detected Attributes
          </div>
          <div style={s.attrGrid}>
            {[
              ['Category', analysis.category],
              ['Color',    analysis.color],
              ['Pattern',  analysis.pattern],
              ['Material', analysis.material],
            ].map(([label, val]) => (
              <div key={label} style={s.attrChip}>
                <div style={s.attrLabel}>{label}</div>
                <div style={s.attrVal}>{val}</div>
              </div>
            ))}
          </div>
          <div style={s.confidence}>
            Detection confidence: {Math.round((analysis.confidence || 0.5) * 100)}%
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        style={{ ...s.genBtn, opacity: canGenerate ? 1 : 0.55, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
        disabled={!canGenerate}
        onClick={onGenerate}
        aria-label="Generate 4 AI images"
      >
        {generating
          ? <><span style={s.spinner} /> Generating Images…</>
          : '✦  Generate 4 AI Images'}
      </button>

      {/* Status indicator */}
      <div style={s.statusLine}>
        <div style={{
          ...s.dot,
          background: sc.dot,
          animation: sc.pulse ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />
        <span style={{ color: '#6b6b8a', fontSize: '.78rem' }}>{sc.text}</span>
      </div>

      {/* Hint */}
      <div style={s.hint}>
        <span>💡</span>
        <span>
          Name your file with keywords for best detection:{' '}
          <em>blue-striped-shirt.jpg</em>
        </span>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes spin   { to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}

const s = {
  panel:        { background: '#16161f', border: '1px solid #1e1e2e', borderRadius: 20, padding: '1.5rem', height: 'fit-content', position: 'sticky', top: 80 },
  panelTitle:   { fontFamily: 'Syne, sans-serif', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b6b8a', marginBottom: '1.2rem' },
  dropZone:     { border: '2px dashed #2a2a3e', borderRadius: 16, padding: '2rem 1.5rem', textAlign: 'center', cursor: 'pointer', background: 'rgba(124,106,247,.03)', transition: 'all .25s' },
  dropZoneActive: { borderColor: '#7c6af7', background: 'rgba(124,106,247,.09)', transform: 'translateY(-1px)' },
  uploadIcon:   { fontSize: '1.6rem', width: 52, height: 52, margin: '0 auto 1rem', background: 'linear-gradient(135deg,rgba(124,106,247,.2),rgba(192,132,252,.2))', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  uploadTitle:  { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: '.35rem' },
  uploadSub:    { fontSize: '.8rem', color: '#6b6b8a' },
  previewWrap:  { marginTop: '1.2rem', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '4/3', border: '1px solid #2a2a3e' },
  previewImg:   { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  previewBadge: { position: 'absolute', bottom: '.6rem', left: '.6rem', fontSize: '.7rem', fontWeight: 600, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', color: '#34d399', padding: '.3rem .65rem', borderRadius: 8, border: '1px solid rgba(52,211,153,.25)' },
  analysisBox:  { marginTop: '1.2rem', background: 'rgba(124,106,247,.08)', border: '1px solid rgba(124,106,247,.2)', borderRadius: 14, padding: '1rem' },
  attrGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.55rem' },
  attrChip:     { background: 'rgba(255,255,255,.04)', border: '1px solid #1e1e2e', borderRadius: 10, padding: '.5rem .75rem' },
  attrLabel:    { fontSize: '.65rem', color: '#6b6b8a', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '.2rem' },
  attrVal:      { fontSize: '.8rem', fontWeight: 500, textTransform: 'capitalize', color: '#e8e8f0' },
  confidence:   { marginTop: '.6rem', fontSize: '.68rem', color: '#6b6b8a', textAlign: 'center' },
  genBtn:       { marginTop: '1.2rem', width: '100%', height: 52, border: 'none', borderRadius: 14, background: 'linear-gradient(135deg,#7c6af7,#c084fc)', color: '#fff', fontFamily: 'Syne, sans-serif', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.04em', boxShadow: '0 4px 24px rgba(124,106,247,.35)', transition: 'all .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' },
  spinner:      { display: 'inline-block', width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .7s linear infinite', flexShrink: 0 },
  statusLine:   { marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' },
  dot:          { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  hint:         { display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.72rem', color: '#6b6b8a', marginTop: '.8rem', padding: '.65rem .9rem', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid #1e1e2e', lineHeight: 1.5 },
};
