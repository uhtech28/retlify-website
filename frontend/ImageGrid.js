/**
 * Retlify — ImageGrid.js
 * =======================
 * Drop-in UI component that renders the 4-image product grid.
 *
 * Handles:
 *   - Input form (product name, category, features)
 *   - Loading skeleton with per-shot progress
 *   - 4-image grid with labels, download, full-size links
 *   - onerror fallback on every <img> (Picsum, never broken icon)
 *   - Error state with retry button
 *   - Source badge per image (Puter AI / Pollinations / Placeholder)
 *
 * Usage:
 *   <div id="product-image-grid"></div>
 *   <script src="promptBuilder.js"></script>
 *   <script src="imageService.js"></script>
 *   <script src="ImageGrid.js"></script>
 *   <script>
 *     new ImageGrid('#product-image-grid');
 *   </script>
 *
 * Dependencies (must load before this file):
 *   promptBuilder.js  → window.buildImagePrompts
 *   imageService.js   → window.generateImages
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   CSS — injected once into <head>
───────────────────────────────────────────────────────────── */
const GRID_CSS = `
  .ig2-wrap {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'DM Sans', sans-serif;
    max-width: 900px;
    margin: 0 auto;
  }

  /* ── Form ─────────────────────────────────── */
  .ig2-form { margin-bottom: 20px; }
  .ig2-row  {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 12px;
    margin-bottom: 12px;
  }
  @media (max-width: 560px) { .ig2-row { grid-template-columns: 1fr; } }

  .ig2-field       { display: flex; flex-direction: column; gap: 5px; }
  .ig2-label       { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #6B7280; }
  .ig2-input, .ig2-select {
    padding: 10px 13px;
    border: 1.5px solid #E5E7EB;
    border-radius: 10px;
    font-size: 14px;
    font-family: inherit;
    color: #111827;
    background: #fff;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .ig2-input:focus, .ig2-select:focus {
    border-color: #FFD23F;
    box-shadow: 0 0 0 3px rgba(255,210,63,.15);
  }
  .ig2-input:disabled, .ig2-select:disabled {
    background: #F9FAFB;
    color: #9CA3AF;
    cursor: not-allowed;
  }

  /* ── Button ─────────────────────────────────── */
  .ig2-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .ig2-btn {
    padding: 11px 22px;
    background: #111827;
    color: #FFD23F;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background .2s, transform .15s;
    flex-shrink: 0;
  }
  .ig2-btn:hover:not(:disabled) { background: #1F2937; transform: translateY(-1px); }
  .ig2-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
  .ig2-btn-ghost {
    padding: 9px 16px;
    background: #F3F4F6;
    color: #374151;
    border: 1.5px solid #E5E7EB;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background .15s;
  }
  .ig2-btn-ghost:hover { background: #E5E7EB; }

  /* ── Spinner ─────────────────────────────────── */
  .ig2-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,210,63,.3);
    border-top-color: #FFD23F;
    border-radius: 50%;
    animation: ig2-spin .65s linear infinite;
    display: inline-block;
  }
  @keyframes ig2-spin { to { transform: rotate(360deg); } }

  /* ── Loading State ─────────────────────────────── */
  .ig2-loading {
    background: #F9FAFB;
    border: 1.5px solid #E5E7EB;
    border-radius: 14px;
    padding: 20px 24px;
    margin-bottom: 16px;
  }
  .ig2-progress-bar { height: 5px; background: #E5E7EB; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
  .ig2-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #FFD23F, #FFC200);
    border-radius: 3px;
    transition: width .4s ease;
  }
  .ig2-progress-label { font-size: 12px; color: #6B7280; font-weight: 600; margin-bottom: 14px; }
  .ig2-shot-list      { display: flex; flex-direction: column; gap: 7px; }
  .ig2-shot-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; border-radius: 9px;
    background: #fff; border: 1.5px solid #E5E7EB;
    font-size: 13px; color: #9CA3AF;
    transition: all .2s;
  }
  .ig2-shot-row.active  { border-color: #FFD23F; background: #FFFBEB; color: #111827; font-weight: 600; }
  .ig2-shot-row.done    { border-color: #86EFAC; background: #F0FDF4; color: #166534; }
  .ig2-shot-name        { flex: 1; }
  .ig2-check            { color: #22C55E; font-weight: 700; font-size: 13px; }
  .ig2-dot-spin {
    width: 13px; height: 13px;
    border: 2px solid rgba(255,210,63,.3);
    border-top-color: #FFD23F;
    border-radius: 50%;
    animation: ig2-spin .65s linear infinite;
  }

  /* ── Error State ─────────────────────────────── */
  .ig2-error {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 18px;
    background: #FEF2F2; border: 1.5px solid #FECACA;
    border-radius: 12px; color: #991B1B;
    font-size: 13px; margin-bottom: 12px;
  }
  .ig2-error-msg { flex: 1; line-height: 1.5; }
  .ig2-retry-btn {
    padding: 6px 14px; background: #EF4444; color: #fff;
    border: none; border-radius: 7px; font-size: 12px;
    font-weight: 700; cursor: pointer; font-family: inherit;
    flex-shrink: 0;
  }
  .ig2-retry-btn:hover { background: #DC2626; }

  /* ── Grid Header ─────────────────────────────── */
  .ig2-grid-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 8px; margin-bottom: 12px;
  }
  .ig2-grid-title { font-size: 14px; font-weight: 700; color: #111827; }
  .ig2-grid-sub   { font-size: 12px; color: #9CA3AF; margin-left: 6px; }

  /* ── Image Grid ─────────────────────────────── */
  .ig2-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  @media (max-width: 480px) { .ig2-grid { grid-template-columns: 1fr; } }

  .ig2-card {
    position: relative;
    aspect-ratio: 3 / 4;
    border-radius: 14px;
    overflow: hidden;
    background: #F3F4F6;
    box-shadow: 0 2px 10px rgba(0,0,0,.07);
    cursor: pointer;
    transition: transform .25s, box-shadow .25s;
    animation: ig2-fadein .35s ease both;
  }
  .ig2-card:hover { transform: translateY(-4px) scale(1.01); box-shadow: 0 10px 30px rgba(0,0,0,.14); }
  @keyframes ig2-fadein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  .ig2-img {
    width: 100%; height: 100%;
    object-fit: cover; display: block;
    transition: transform .3s;
  }
  .ig2-card:hover .ig2-img { transform: scale(1.04); }

  /* Skeleton */
  .ig2-skeleton {
    width: 100%; height: 100%;
    background: linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%);
    background-size: 200% 100%;
    animation: ig2-shimmer 1.4s infinite;
  }
  @keyframes ig2-shimmer { to { background-position: -200% 0; } }

  /* Label badge */
  .ig2-label {
    position: absolute; bottom: 10px; left: 10px;
    background: rgba(0,0,0,.68); color: #fff;
    border-radius: 7px; padding: 4px 10px;
    font-size: 11px; font-weight: 700;
    backdrop-filter: blur(6px);
    pointer-events: none;
    letter-spacing: .2px;
  }

  /* Source badge */
  .ig2-source {
    position: absolute; top: 10px; right: 10px;
    border-radius: 20px; padding: 3px 9px;
    font-size: 10px; font-weight: 700;
    letter-spacing: .3px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }
  .ig2-source-puter       { background: rgba(99,102,241,.85); color: #fff; }
  .ig2-source-pollinations{ background: rgba(34,197,94,.85);  color: #fff; }
  .ig2-source-picsum      { background: rgba(107,114,128,.7); color: #fff; }

  /* Hover overlay: download + fullsize */
  .ig2-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 55%);
    opacity: 0; transition: opacity .2s;
    display: flex; align-items: flex-end; justify-content: flex-end;
    gap: 6px; padding: 10px;
  }
  .ig2-card:hover .ig2-overlay { opacity: 1; }
  .ig2-icon-btn {
    background: rgba(255,255,255,.18);
    border: 1px solid rgba(255,255,255,.35);
    color: #fff; border-radius: 7px;
    padding: 6px 9px; font-size: 14px;
    text-decoration: none; line-height: 1;
    transition: background .15s;
    backdrop-filter: blur(4px);
    cursor: pointer;
  }
  .ig2-icon-btn:hover { background: rgba(255,255,255,.32); }
`;

function _injectStyles() {
  if (document.getElementById('ig2-styles')) return;
  const s = document.createElement('style');
  s.id = 'ig2-styles';
  s.textContent = GRID_CSS;
  document.head.appendChild(s);
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const SHOT_META = [
  { type: 'studio',    label: 'Studio Shot',    emoji: '📦' },
  { type: 'model',     label: 'Model Shot',      emoji: '👗' },
  { type: 'lifestyle', label: 'Lifestyle Shot',  emoji: '🌿' },
  { type: 'editorial', label: 'Editorial Shot',  emoji: '✨' },
];

/* ─────────────────────────────────────────────────────────────
   IMAGEGRID CLASS
───────────────────────────────────────────────────────────── */
class ImageGrid {
  constructor(container, opts = {}) {
    this._el = typeof container === 'string'
      ? (document.querySelector(container) || document.getElementById(container.replace(/^#/, '')))
      : container;

    if (!this._el) throw new Error(`ImageGrid: container not found — "${container}"`);

    this._opts = {
      columns:     opts.columns     || 2,
      placeholder: opts.placeholder || 'e.g. Blue Cotton Shirt, Silk Saree…',
    };

    this._state = {
      productName: '',
      category:    '',
      features:    '',
      loading:     false,
      doneCount:   0,
      images:      [],
      error:       null,
    };

    _injectStyles();
    this._render();
  }

  /* ── Public: generate ──────────────────────────────────────── */
  async generate() {
    const { productName, category, features } = this._state;
    if (!productName.trim() || this._state.loading) return;

    this._setState({ loading: true, doneCount: 0, images: [], error: null });

    try {
      if (typeof window.generateImages !== 'function') {
        throw new Error('imageService.js is not loaded. Add it before ImageGrid.js.');
      }

      const images = await window.generateImages({
        productName,
        category,
        features,
        onProgress: (done) => this._setState({ doneCount: done }),
      });

      this._setState({ loading: false, images });

    } catch (err) {
      console.error('[ImageGrid] Generation error:', err.message);
      this._setState({ loading: false, error: err.message });
    }
  }

  /* ── Internal state ────────────────────────────────────────── */
  _setState(patch) {
    Object.assign(this._state, patch);
    this._render();
  }

  /* ── Render ────────────────────────────────────────────────── */
  _render() {
    this._el.innerHTML = `
      <div class="ig2-wrap">
        ${this._renderForm()}
        ${this._state.loading ? this._renderLoading() : ''}
        ${this._state.error   ? this._renderError()   : ''}
        ${this._state.images.length && !this._state.loading ? this._renderGrid() : ''}
      </div>
    `;
    this._attachEvents();
  }

  _renderForm() {
    const cats = [
      '', 'Clothing & Apparel', 'Shirt', 'T-Shirt', 'Jeans', 'Dress', 'Jacket',
      'Hoodie', 'Saree', 'Kurti', 'Lehenga', 'Kurta',
      'Footwear', 'Sneakers', 'Boots', 'Sandals',
      'Bags & Accessories', 'Jewellery', 'Beauty & Skincare',
      'Electronics', 'Mobile Phones', 'Home & Kitchen', 'Sports & Fitness',
    ];
    const disabled = this._state.loading;
    const noName   = !this._state.productName.trim();

    return `
      <div class="ig2-form">
        <div class="ig2-row">
          <div class="ig2-field">
            <label class="ig2-label">Product Name *</label>
            <input id="ig2-name" class="ig2-input" type="text"
              placeholder="${_esc(this._opts.placeholder)}"
              value="${_esc(this._state.productName)}"
              ${disabled ? 'disabled' : ''} maxlength="120" />
          </div>
          <div class="ig2-field">
            <label class="ig2-label">Category</label>
            <select id="ig2-cat" class="ig2-select" ${disabled ? 'disabled' : ''}>
              ${cats.map(c =>
                `<option value="${_esc(c)}" ${this._state.category === c ? 'selected' : ''}>${c || '— Select —'}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="ig2-field" style="margin-bottom:14px">
          <label class="ig2-label">Key Features <span style="font-weight:400;text-transform:none;color:#9CA3AF">(optional)</span></label>
          <input id="ig2-feats" class="ig2-input" type="text"
            placeholder="e.g. slim fit, 100% cotton, navy blue, full sleeves"
            value="${_esc(this._state.features)}"
            ${disabled ? 'disabled' : ''} maxlength="200" />
        </div>
        <div class="ig2-actions">
          <button id="ig2-generate-btn" class="ig2-btn" ${disabled || noName ? 'disabled' : ''}>
            ${disabled
              ? '<span class="ig2-spinner"></span> Generating…'
              : '✨ Generate 4 Product Images'}
          </button>
          ${this._state.images.length
            ? `<button id="ig2-reset-btn" class="ig2-btn-ghost">↩ Reset</button>`
            : ''}
        </div>
      </div>
    `;
  }

  _renderLoading() {
    const done  = this._state.doneCount;
    const total = SHOT_META.length;
    const pct   = Math.round((done / total) * 100);

    return `
      <div class="ig2-loading">
        <div class="ig2-progress-bar">
          <div class="ig2-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="ig2-progress-label">${done} / ${total} images ready…</div>
        <div class="ig2-shot-list">
          ${SHOT_META.map((s, i) => {
            const isDone   = i < done;
            const isActive = i === done;
            return `
              <div class="ig2-shot-row${isDone ? ' done' : ''}${isActive ? ' active' : ''}">
                <span>${s.emoji}</span>
                <span class="ig2-shot-name">${s.label}</span>
                ${isDone   ? '<span class="ig2-check">✓</span>'      : ''}
                ${isActive ? '<span class="ig2-dot-spin"></span>'     : ''}
              </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  _renderError() {
    return `
      <div class="ig2-error">
        <span style="font-size:18px;flex-shrink:0">⚠️</span>
        <span class="ig2-error-msg">${_esc(this._state.error)}</span>
        <button id="ig2-retry-btn" class="ig2-retry-btn">Retry</button>
      </div>
    `;
  }

  _renderGrid() {
    const images = this._state.images;
    const ok     = images.filter(i => i.url).length;

    const sourceLabel = { puter: 'Puter AI', pollinations: 'Pollinations', picsum: 'Placeholder' };
    const sourceClass = { puter: 'ig2-source-puter', pollinations: 'ig2-source-pollinations', picsum: 'ig2-source-picsum' };

    return `
      <div class="ig2-grid-header">
        <div>
          <span class="ig2-grid-title">${ok} images generated</span>
          <span class="ig2-grid-sub">for "${_esc(this._state.productName)}"</span>
        </div>
        <button id="ig2-regen-btn" class="ig2-btn-ghost">↩ Regenerate</button>
      </div>
      <div class="ig2-grid" style="grid-template-columns:repeat(${this._opts.columns},1fr)">
        ${images.map((img, i) => {
          const fallback = `https://picsum.photos/seed/${img.type || i}${i}/512/512`;
          if (!img.url) {
            // Slot with no URL — render skeleton placeholder
            return `
              <div class="ig2-card" style="cursor:default">
                <div class="ig2-skeleton"></div>
                <span class="ig2-label">${_esc(img.emoji || '📦')} ${_esc(img.label || img.type)}</span>
              </div>`;
          }
          return `
            <div class="ig2-card">
              <img
                class="ig2-img"
                src="${_esc(img.url)}"
                alt="${_esc(img.label)} of ${_esc(this._state.productName)}"
                loading="lazy"
                onerror="this.onerror=null;this.src='${fallback}';"
              />
              <span class="ig2-source ${sourceClass[img.source] || 'ig2-source-picsum'}">
                ${_esc(sourceLabel[img.source] || img.source || 'AI')}
              </span>
              <span class="ig2-label">${_esc(img.emoji || '')} ${_esc(img.label || img.type)}</span>
              <div class="ig2-overlay">
                <a href="${_esc(img.url)}" download="retlify-${_esc(img.type)}-${i + 1}.jpg"
                   class="ig2-icon-btn" title="Download">⬇</a>
                <a href="${_esc(img.url)}" target="_blank" rel="noopener"
                   class="ig2-icon-btn" title="Full size">⤢</a>
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  /* ── Events ────────────────────────────────────────────────── */
  _attachEvents() {
    const nameInput = this._el.querySelector('#ig2-name');
    const catSelect = this._el.querySelector('#ig2-cat');
    const featsInput= this._el.querySelector('#ig2-feats');
    const genBtn    = this._el.querySelector('#ig2-generate-btn');
    const resetBtn  = this._el.querySelector('#ig2-reset-btn');
    const retryBtn  = this._el.querySelector('#ig2-retry-btn');
    const regenBtn  = this._el.querySelector('#ig2-regen-btn');

    nameInput?.addEventListener('input',  e => {
      this._state.productName = e.target.value;
      const btn = this._el.querySelector('#ig2-generate-btn');
      if (btn) btn.disabled = this._state.loading || !this._state.productName.trim();
    });
    catSelect?.addEventListener('change', e => { this._state.category = e.target.value; });
    featsInput?.addEventListener('input', e => { this._state.features = e.target.value; });

    // Enter key on product name triggers generate
    nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') this.generate(); });

    genBtn?.addEventListener('click',  () => this.generate());
    retryBtn?.addEventListener('click', () => this.generate());
    regenBtn?.addEventListener('click', () => {
      this._setState({ images: [], error: null });
      this.generate();
    });
    resetBtn?.addEventListener('click', () => {
      this._setState({ images: [], error: null, productName: '', category: '', features: '' });
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   BROWSER EXPORT
───────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.ImageGrid = ImageGrid;
}

/* ─────────────────────────────────────────────────────────────
   NODE EXPORT
───────────────────────────────────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ImageGrid };
}
