/**
 * Retlify — AI Product Studio
 * ============================
 * Frontend module for the AI Product Studio feature.
 * Handles: drag & drop upload, image preview, AI generation,
 * results display (product shots + model photos + enhanced description).
 *
 * Usage:
 *   RetlifyProductStudio.init('container-id', { city: 'Jaipur' });
 *
 * Works standalone — no external dependencies beyond vanilla JS.
 */

(function (root) {
  'use strict';

  const AI_BASE = '/api/ai';

  /* ════════════════════════════════════════════════════════
     CSS INJECTION
     ════════════════════════════════════════════════════════ */

  const STUDIO_CSS = `
    .ps-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 960px; margin: 0 auto; }

    /* Upload Zone */
    .ps-upload-zone {
      border: 2.5px dashed #D1D5DB; border-radius: 16px; padding: 40px 24px;
      text-align: center; cursor: pointer; transition: all 0.2s ease;
      background: #FAFAFA; position: relative;
    }
    .ps-upload-zone:hover, .ps-upload-zone.drag-over {
      border-color: #FFD23F; background: #FFFBEB;
    }
    .ps-upload-zone input[type=file] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
    }
    .ps-upload-icon { font-size: 40px; margin-bottom: 12px; display: block; }
    .ps-upload-title { font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 6px; }
    .ps-upload-sub { font-size: 13px; color: #6B7280; margin: 0; }

    /* Preview grid */
    .ps-preview-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px; margin: 20px 0;
    }
    .ps-preview-item {
      position: relative; border-radius: 10px; overflow: hidden;
      aspect-ratio: 1; background: #F3F4F6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .ps-preview-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ps-preview-remove {
      position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.6);
      color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px;
      cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .ps-preview-remove:hover { background: #EF4444; }

    /* Form */
    .ps-form { margin: 24px 0; }
    .ps-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .ps-form-group { display: flex; flex-direction: column; gap: 6px; }
    .ps-label { font-size: 13px; font-weight: 600; color: #374151; }
    .ps-input {
      padding: 10px 14px; border: 1.5px solid #E5E7EB; border-radius: 10px;
      font-size: 14px; color: #111827; background: #fff; outline: none; transition: border-color 0.2s;
    }
    .ps-input:focus { border-color: #FFD23F; }
    .ps-textarea { min-height: 72px; resize: vertical; }
    .ps-toggle-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .ps-toggle { position: relative; width: 42px; height: 24px; }
    .ps-toggle input { opacity: 0; width: 0; height: 0; }
    .ps-toggle-slider {
      position: absolute; inset: 0; background: #D1D5DB; border-radius: 24px;
      cursor: pointer; transition: 0.3s;
    }
    .ps-toggle-slider:before {
      content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px;
      background: #fff; border-radius: 50%; transition: 0.3s;
    }
    .ps-toggle input:checked + .ps-toggle-slider { background: #FFD23F; }
    .ps-toggle input:checked + .ps-toggle-slider:before { transform: translateX(18px); }

    /* Button */
    .ps-btn {
      padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 700;
      border: none; cursor: pointer; transition: all 0.2s; display: inline-flex;
      align-items: center; gap: 8px;
    }
    .ps-btn-primary { background: #111827; color: #FFD23F; }
    .ps-btn-primary:hover { background: #1F2937; transform: translateY(-1px); }
    .ps-btn-primary:disabled { background: #9CA3AF; color: #fff; cursor: not-allowed; transform: none; }
    .ps-btn-secondary { background: #F3F4F6; color: #374151; }
    .ps-btn-secondary:hover { background: #E5E7EB; }

    /* Loading */
    .ps-loading {
      padding: 48px 24px; text-align: center;
    }
    .ps-loading-steps { display: flex; flex-direction: column; gap: 14px; max-width: 360px; margin: 0 auto; }
    .ps-loading-step {
      display: flex; align-items: center; gap: 14px; padding: 14px 18px;
      border-radius: 12px; background: #F9FAFB; border: 1.5px solid #E5E7EB;
      font-size: 14px; color: #6B7280; transition: all 0.3s;
    }
    .ps-loading-step.active { background: #FFFBEB; border-color: #FFD23F; color: #111827; font-weight: 600; }
    .ps-loading-step.done { background: #F0FDF4; border-color: #86EFAC; color: #166534; }
    .ps-step-icon { font-size: 20px; width: 28px; text-align: center; }
    .ps-spinner {
      width: 20px; height: 20px; border: 3px solid #E5E7EB;
      border-top-color: #FFD23F; border-radius: 50%; animation: ps-spin 0.7s linear infinite;
    }
    @keyframes ps-spin { to { transform: rotate(360deg); } }

    /* Results */
    .ps-results { margin-top: 32px; }
    .ps-results-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
      padding-bottom: 16px; border-bottom: 2px solid #F3F4F6;
    }
    .ps-results-title { font-size: 22px; font-weight: 800; color: #111827; margin: 0; }
    .ps-badge {
      padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;
      background: #DCFCE7; color: #166534;
    }
    .ps-badge.ai { background: #EFF6FF; color: #1D4ED8; }

    /* Gallery */
    .ps-section-label {
      font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
      color: #9CA3AF; margin: 24px 0 14px;
    }
    .ps-gallery {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px;
    }
    .ps-gallery-item {
      border-radius: 14px; overflow: hidden; position: relative;
      background: #F3F4F6; aspect-ratio: 3/4;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08); cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .ps-gallery-item:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
    .ps-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ps-gallery-tag {
      position: absolute; bottom: 10px; left: 10px;
      background: rgba(0,0,0,0.65); color: #fff; border-radius: 8px;
      padding: 4px 10px; font-size: 11px; font-weight: 600; backdrop-filter: blur(4px);
    }
    /* Description card */
    .ps-description-card {
      background: #fff; border: 1.5px solid #E5E7EB; border-radius: 16px;
      padding: 28px; margin: 24px 0;
    }
    .ps-product-title { font-size: 24px; font-weight: 800; color: #111827; margin: 0 0 8px; }
    .ps-marketing-line {
      font-size: 15px; color: #6B7280; font-style: italic; margin: 0 0 20px;
      padding-bottom: 20px; border-bottom: 1px solid #F3F4F6;
    }
    .ps-product-desc { font-size: 15px; color: #374151; line-height: 1.7; margin-bottom: 20px; }
    .ps-highlights { list-style: none; padding: 0; margin: 0 0 20px; display: flex; flex-direction: column; gap: 8px; }
    .ps-highlight-item {
      display: flex; align-items: flex-start; gap: 10px;
      font-size: 14px; color: #374151;
    }
    .ps-highlight-item::before { content: '✦'; color: #FFD23F; font-size: 12px; margin-top: 2px; flex-shrink: 0; }
    .ps-tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    .ps-tag {
      padding: 4px 12px; background: #F3F4F6; border-radius: 20px;
      font-size: 12px; color: #6B7280; font-weight: 500;
    }
    .ps-cta {
      display: inline-block; background: #FFD23F; color: #111827; font-weight: 700;
      padding: 12px 24px; border-radius: 10px; text-decoration: none;
      font-size: 14px; cursor: pointer; border: none; transition: background 0.2s;
    }
    .ps-cta:hover { background: #FFC200; }

    /* Attributes grid */
    .ps-attributes {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px; margin: 16px 0 24px;
    }
    .ps-attr-card {
      background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px;
      padding: 12px 14px; text-align: center;
    }
    .ps-attr-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #9CA3AF; font-weight: 700; }
    .ps-attr-val { font-size: 15px; font-weight: 700; color: #111827; margin-top: 4px; text-transform: capitalize; }

    /* Recommendations */
    .ps-recs { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .ps-rec-card {
      background: #fff; border: 1.5px solid #E5E7EB; border-radius: 12px;
      padding: 16px; transition: border-color 0.2s;
    }
    .ps-rec-card:hover { border-color: #FFD23F; }
    .ps-rec-name { font-size: 14px; font-weight: 700; color: #111827; }
    .ps-rec-reason { font-size: 12px; color: #9CA3AF; margin-top: 4px; }

    /* Error */
    .ps-error {
      background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 12px;
      padding: 20px 24px; color: #991B1B; display: flex; align-items: center; gap: 12px;
    }
    .ps-error-icon { font-size: 24px; flex-shrink: 0; }

    /* Copy button */
    .ps-copy-btn {
      background: none; border: 1px solid #E5E7EB; border-radius: 8px;
      padding: 6px 14px; font-size: 12px; color: #6B7280; cursor: pointer;
      transition: all 0.15s; margin-left: 10px;
    }
    .ps-copy-btn:hover { background: #F3F4F6; color: #111827; }
    .ps-copy-btn.copied { background: #DCFCE7; color: #166534; border-color: #86EFAC; }

    /* Responsive */
    @media (max-width: 640px) {
      .ps-form-row { grid-template-columns: 1fr; }
      .ps-gallery  { grid-template-columns: repeat(2, 1fr); }
      .ps-attributes { grid-template-columns: repeat(2, 1fr); }
    }
  `;

  function _injectStyles() {
    if (document.getElementById('ps-styles')) return;
    const style = document.createElement('style');
    style.id = 'ps-styles';
    style.textContent = STUDIO_CSS;
    document.head.appendChild(style);
  }

  /* ════════════════════════════════════════════════════════
     STATE
     ════════════════════════════════════════════════════════ */

  let _state = {
    images:         [],  // [{ file, preview, name }]
    productName:    '',
    category:       '',
    features:       '',
    generateImages: true,
    loading:        false,
    result:         null,
    error:          null,
  };
  let _container = null;

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */

  function _render() {
    if (!_container) return;

    const html = `
      <div class="ps-wrap">
        ${_renderUploadZone()}
        ${_state.images.length ? _renderPreviewGrid() : ''}
        ${_renderForm()}
        <div style="display:flex;gap:12px;align-items:center;margin-top:8px">
          <button class="ps-btn ps-btn-primary" id="ps-generate-btn" ${_state.loading || !_state.productName.trim() ? 'disabled' : ''}>
            ${_state.loading ? '<span class="ps-spinner"></span> Processing…' : '✨ Generate Product Studio'}
          </button>
          ${_state.result ? `<button class="ps-btn ps-btn-secondary" id="ps-reset-btn">↩ Start Over</button>` : ''}
        </div>
        ${_state.loading  ? _renderLoading() : ''}
        ${_state.error    ? _renderError()   : ''}
        ${_state.result && !_state.loading ? _renderResults() : ''}
      </div>
    `;

    _container.innerHTML = html;
    _attachEvents();
  }

  function _renderUploadZone() {
    return `
      <div class="ps-upload-zone" id="ps-drop-zone">
        <input type="file" id="ps-file-input" accept="image/jpeg,image/png,image/webp" multiple>
        <span class="ps-upload-icon">📸</span>
        <p class="ps-upload-title">Upload Product Images</p>
        <p class="ps-upload-sub">Drag & drop or click · JPG, PNG, WebP · Max 5 images · 10MB each</p>
      </div>
    `;
  }

  function _renderPreviewGrid() {
    const items = _state.images.map((img, i) => `
      <div class="ps-preview-item">
        <img src="${img.preview}" alt="${_esc(img.name)}">
        <button class="ps-preview-remove" data-index="${i}" title="Remove">×</button>
      </div>
    `).join('');
    return `<div class="ps-preview-grid">${items}</div>`;
  }

  function _renderForm() {
    return `
      <div class="ps-form">
        <div class="ps-form-row">
          <div class="ps-form-group">
            <label class="ps-label" for="ps-name">Product Name *</label>
            <input class="ps-input" id="ps-name" type="text" placeholder="e.g. Black Cotton T-Shirt, Rajasthani Lehenga…"
              value="${_esc(_state.productName)}" maxlength="100">
          </div>
          <div class="ps-form-group">
            <label class="ps-label" for="ps-cat">Category</label>
            <select class="ps-input" id="ps-cat">
              <option value="" ${!_state.category ? 'selected' : ''}>— Select category —</option>
              <option value="Clothing &amp; Apparel" ${_state.category==='Clothing & Apparel'?'selected':''}>Clothing &amp; Apparel</option>
              <option value="Ethnic Wear" ${_state.category==='Ethnic Wear'?'selected':''}>Ethnic Wear</option>
              <option value="Footwear" ${_state.category==='Footwear'?'selected':''}>Footwear</option>
              <option value="Accessories &amp; Jewellery" ${_state.category==='Accessories & Jewellery'?'selected':''}>Accessories &amp; Jewellery</option>
              <option value="Electronics &amp; Gadgets" ${_state.category==='Electronics & Gadgets'?'selected':''}>Electronics &amp; Gadgets</option>
              <option value="Home &amp; Living" ${_state.category==='Home & Living'?'selected':''}>Home &amp; Living</option>
              <option value="Beauty &amp; Personal Care" ${_state.category==='Beauty & Personal Care'?'selected':''}>Beauty &amp; Personal Care</option>
              <option value="Food &amp; Beverages" ${_state.category==='Food & Beverages'?'selected':''}>Food &amp; Beverages</option>
              <option value="Toys &amp; Games" ${_state.category==='Toys & Games'?'selected':''}>Toys &amp; Games</option>
              <option value="Sports &amp; Fitness" ${_state.category==='Sports & Fitness'?'selected':''}>Sports &amp; Fitness</option>
              <option value="Books &amp; Stationery" ${_state.category==='Books & Stationery'?'selected':''}>Books &amp; Stationery</option>
              <option value="Bags &amp; Luggage" ${_state.category==='Bags & Luggage'?'selected':''}>Bags &amp; Luggage</option>
              <option value="Automotive" ${_state.category==='Automotive'?'selected':''}>Automotive</option>
              <option value="Health &amp; Wellness" ${_state.category==='Health & Wellness'?'selected':''}>Health &amp; Wellness</option>
              <option value="Other" ${_state.category==='Other'?'selected':''}>Other</option>
            </select>
          </div>
          <div class="ps-form-group">
            <label class="ps-label" for="ps-feats">Key Features <span style="color:#9CA3AF;font-weight:400">(comma separated)</span></label>
            <input class="ps-input" id="ps-feats" type="text" placeholder="e.g. 100% cotton, machine wash, slim fit"
              value="${_esc(_state.features)}" maxlength="300">
          </div>
        </div>
        <div class="ps-toggle-row">
          <label class="ps-toggle">
            <input type="checkbox" id="ps-gen-toggle" ${_state.generateImages ? 'checked' : ''}>
            <span class="ps-toggle-slider"></span>
          </label>
          <span style="font-size:14px;color:#374151;font-weight:500">Generate AI Photos (Studio · Model · Lifestyle · Premium)</span>
          <span style="font-size:12px;color:#6B7280">— 4 shots via Puter.js AI <span style="color:#22C55E;font-weight:600">● Free</span></span>
        </div>
      </div>
    `;
  }

  function _renderLoading() {
    const steps = [
      { icon: '🔒', label: 'Safety check',           id: 'step-safety'  },
      { icon: '🔍', label: 'Analyzing product',      id: 'step-analyze' },
      { icon: '✍️', label: 'Writing description',    id: 'step-desc'    },
      { icon: '🎨', label: 'Generating product photo',id: 'step-photo'  },
      { icon: '👗', label: 'Creating model shots',   id: 'step-model'   },
    ];

    const stepHTML = steps.map((s, i) => `
      <div class="ps-loading-step ${i === 0 ? 'active' : ''}" id="${s.id}">
        <span class="ps-step-icon">${s.icon}</span>
        <span>${s.label}</span>
        ${i === 0 ? '<div class="ps-spinner" style="margin-left:auto"></div>' : ''}
      </div>
    `).join('');

    return `
      <div class="ps-loading">
        <div style="font-size:28px;margin-bottom:16px">⚡</div>
        <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px">AI Product Studio is working…</div>
        <div style="font-size:14px;color:#6B7280;margin-bottom:28px">This takes 15–60 seconds</div>
        <div class="ps-loading-steps">${stepHTML}</div>
      </div>
    `;
  }

  function _renderError() {
    return `
      <div class="ps-error" style="margin-top:24px">
        <span class="ps-error-icon">⚠️</span>
        <div>
          <div style="font-weight:700;margin-bottom:4px">${_esc(_state.error.title || 'Something went wrong')}</div>
          <div style="font-size:14px">${_esc(_state.error.message || '')}</div>
        </div>
      </div>
    `;
  }

  function _renderResults() {
    const r = _state.result;
    if (!r) return '';

    // Backend returns flat array: [{url, source, type, label}, ...]
    const allImages = Array.isArray(r.images) ? r.images.filter(img => img && img.url) : [];
    const hasImages = allImages.length > 0;

    return `
      <div class="ps-results">
        <div class="ps-results-header">
          <h2 class="ps-results-title">✨ Product Studio</h2>
          <span class="ps-badge ai">AI Generated</span>
        </div>

        ${hasImages ? `
          <div class="ps-section-label">🎨 Generated Images</div>
          <div class="ps-gallery">${allImages.map((img, i) => _renderGalleryItem(img, img.label || img.type || 'Generated', i)).join('')}</div>
        ` : ''}

        <div class="ps-description-card">
          <h3 class="ps-product-title" id="ps-out-title">${_esc(r.title || '')}</h3>
          ${r.marketingLine ? `<p class="ps-marketing-line">"${_esc(r.marketingLine)}"</p>` : ''}
          <p class="ps-product-desc" id="ps-out-desc">${_esc(r.description || '')}</p>

          ${r.highlights?.length ? `
            <ul class="ps-highlights">
              ${r.highlights.map(h => `<li class="ps-highlight-item">${_esc(h)}</li>`).join('')}
            </ul>
          ` : ''}

          ${r.tags?.length ? `
            <div class="ps-tags-row">
              ${r.tags.map(t => `<span class="ps-tag">#${_esc(t)}</span>`).join('')}
            </div>
          ` : ''}

          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button class="ps-cta" id="ps-copy-desc">📋 Copy Description</button>
            <button class="ps-copy-btn" id="ps-copy-all">Copy All</button>
          </div>
        </div>

        ${r.category ? `
          <div class="ps-section-label">🔍 Detected Attributes</div>
          <div class="ps-attributes">
            ${[
              { label: 'Category', val: r.category },
              { label: 'Color',    val: r.color    },
              { label: 'Style',    val: r.style    },
              { label: 'Pattern',  val: r.pattern  },
              r.material ? { label: 'Material', val: r.material } : null,
              { label: 'Gender',   val: r.gender   },
              { label: 'Occasion', val: r.occasion },
              { label: 'Confidence', val: r.confidence ? Math.round(r.confidence * 100) + '%' : 'N/A' },
            ].filter(Boolean).map(attr => `
              <div class="ps-attr-card">
                <div class="ps-attr-label">${_esc(attr.label)}</div>
                <div class="ps-attr-val">${_esc(attr.val || '—')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${r.recommendations?.length ? `
          <div class="ps-section-label">💡 Pair With</div>
          <div class="ps-recs">
            ${r.recommendations.map(rec => `
              <div class="ps-rec-card">
                <div class="ps-rec-name">${_esc(rec.name)}</div>
                <div class="ps-rec-reason">${_esc(rec.reason)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div style="margin-top:24px;font-size:12px;color:#9CA3AF">
          Analyzed ${r.imageCount || 0} image${r.imageCount !== 1 ? 's' : ''} ·
          ${r.analysisMethod || ''} · ${r.processingTimeMs ? Math.round(r.processingTimeMs / 1000) + 's' : ''}

        </div>
      </div>
    `;
  }

  function _renderGalleryItem(img, label, i) {
    if (!img || !img.url) return '';
    return `
      <div class="ps-gallery-item" onclick="_psOpenImage('${img.url}')">
        <img src="${img.url}" alt="${_esc(label)}" loading="lazy"
          onerror="this.onerror=null;this.src='https://picsum.photos/seed/${label.replace(/\\s+/g,\'\'')}${i}/512/512'">
        <span class="ps-gallery-tag">${_esc(label)}</span>
      </div>
    `;
  }

  /* ════════════════════════════════════════════════════════
     EVENTS
     ════════════════════════════════════════════════════════ */

  function _attachEvents() {
    // File input
    const fileInput = document.getElementById('ps-file-input');
    if (fileInput) fileInput.addEventListener('change', _handleFileSelect);

    // Drag & drop
    const dropZone = document.getElementById('ps-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop',      e => { e.preventDefault(); dropZone.classList.remove('drag-over'); _handleDrop(e); });
    }

    // Remove image buttons
    document.querySelectorAll('.ps-preview-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        _state.images.splice(idx, 1);
        _render();
      });
    });

    // Form inputs
    const nameInput = document.getElementById('ps-name');
    if (nameInput) nameInput.addEventListener('input', e => { _state.productName = e.target.value; _syncGenerateBtn(); });

    const catInput  = document.getElementById('ps-cat');
    if (catInput)  catInput.addEventListener('change', e => { _state.category = e.target.value; });

    const featInput = document.getElementById('ps-feats');
    if (featInput) featInput.addEventListener('input', e => { _state.features = e.target.value; });

    const toggle = document.getElementById('ps-gen-toggle');
    if (toggle) toggle.addEventListener('change', e => { _state.generateImages = e.target.checked; });

    // Generate
    const genBtn = document.getElementById('ps-generate-btn');
    if (genBtn) genBtn.addEventListener('click', _generate);

    // Reset
    const resetBtn = document.getElementById('ps-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', _reset);

    // Copy buttons
    const copyDesc = document.getElementById('ps-copy-desc');
    if (copyDesc) copyDesc.addEventListener('click', () => _copyToClipboard(
      `${_state.result?.title}\n\n${_state.result?.description}\n\n${_state.result?.highlights?.join('\n')}`,
      copyDesc, 'Copied!'
    ));

    const copyAll = document.getElementById('ps-copy-all');
    if (copyAll) copyAll.addEventListener('click', () => _copyToClipboard(
      JSON.stringify({
        title: _state.result?.title,
        description: _state.result?.description,
        highlights:  _state.result?.highlights,
        tags:        _state.result?.tags,
        marketingLine: _state.result?.marketingLine,
      }, null, 2),
      copyAll, 'Copied JSON!'
    ));
  }

  function _syncGenerateBtn() {
    const btn = document.getElementById('ps-generate-btn');
    if (btn) btn.disabled = _state.loading || !_state.productName.trim();
  }

  function _handleFileSelect(e) {
    _addFiles([...e.target.files]);
  }

  function _handleDrop(e) {
    _addFiles([...e.dataTransfer.files]);
  }

  function _addFiles(files) {
    const remaining = 5 - _state.images.length;
    const toAdd     = files
      .filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
      .slice(0, remaining);

    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        _state.images.push({ file, preview: e.target.result, name: file.name });
        _render();
      };
      reader.readAsDataURL(file);
    });

    if (files.length > remaining) {
      setTimeout(() => alert(`Maximum 5 images allowed. ${files.length - remaining} file(s) skipped.`), 100);
    }
  }

  /* ════════════════════════════════════════════════════════
     API CALL  (v4 — Puter.js images + backend description)
     ════════════════════════════════════════════════════════ */

  async function _generate() {
    if (!_state.productName.trim()) return;

    _state.loading = true;
    _state.error   = null;
    _state.result  = null;
    _render();

    // Animate loading steps
    const stepIds = ['step-safety', 'step-analyze', 'step-desc', 'step-photo', 'step-model'];
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      const el = document.getElementById(stepIds[currentStep]);
      if (el) { el.classList.remove('active'); el.classList.add('done'); el.querySelector('.ps-spinner')?.remove(); }
      currentStep++;
      if (currentStep < stepIds.length) {
        const next = document.getElementById(stepIds[currentStep]);
        if (next) {
          next.classList.add('active');
          const spinner = document.createElement('div');
          spinner.className = 'ps-spinner';
          spinner.style.marginLeft = 'auto';
          next.appendChild(spinner);
        }
      }
    }, 8000);

    try {
      // ── A. Backend call for description/analysis (images always off — we handle those) ──
      const formData = new FormData();
      formData.append('productName', _state.productName.trim());
      formData.append('generateImages', 'false');  // We generate images via Puter.js instead

      if (_state.features.trim()) {
        _state.features.split(',').map(f => f.trim()).filter(Boolean).forEach(f =>
          formData.append('features', f)
        );
      }
      _state.images.forEach(img => formData.append('images', img.file));

      // ── B. Image generation via imageService.js (Puter → Pollinations → Picsum) ──
      // imageService.js must be loaded — it provides window.generateImages
      // promptBuilder.js must also be loaded — imageService depends on it
      const imagePromise = _state.generateImages && typeof window.generateImages === 'function'
        ? window.generateImages({
              productName: _state.productName.trim(),
              category:    _state.category  || '',
              features:    _state.features  || '',
            })
            .then(shots => shots
              .filter(s => s.url)
              .map(s => ({ url: s.url, source: s.source || 'puter', type: s.type, label: s.label }))
            )
            .catch(err => {
              console.warn('[ProductStudio] Image generation failed:', err.message);
              return [];  // Graceful — description result still shows
            })
        : Promise.resolve([]);

      // ── C. Run both in parallel ──
      const [res, puterImages] = await Promise.all([
        fetch(`${AI_BASE}/product-studio`, { method: 'POST', body: formData }),
        imagePromise,
      ]);

      const data = await res.json();

      clearInterval(stepInterval);
      stepIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.classList.add('done'); }
      });

      if (!res.ok || !data.success) {
        _state.error = {
          title:   data.safe === false ? '🔒 Image Safety Violation' : '❌ Generation Failed',
          message: data.error || data.reason || 'Something went wrong. Please try again.',
        };
      } else {
        // ── D. Merge Puter.js images into result ──
        if (puterImages.length) {
          data.images = puterImages;
        }
        _state.result = data;
      }
    } catch (err) {
      clearInterval(stepInterval);
      _state.error = { title: 'Network Error', message: err.message };
    }

    _state.loading = false;
    _render();
  }

  function _reset() {
    _state = { images: [], productName: '', category: '', features: '', generateImages: true, loading: false, result: null, error: null };
    _render();
  }

  /* ════════════════════════════════════════════════════════
     UTILS
     ════════════════════════════════════════════════════════ */

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function _copyToClipboard(text, btn, successLabel) {
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = successLabel;
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    } catch { /* silent */ }
  }

  // Global for onclick in template strings
  root._psOpenImage = function (url) {
    window.open(url, '_blank', 'noopener');
  };

  /* ════════════════════════════════════════════════════════
     PUBLIC INIT
     ════════════════════════════════════════════════════════ */

  function init(containerSelector, opts = {}) {
    _injectStyles();

    _container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) || document.getElementById(containerSelector)
      : containerSelector;

    if (!_container) {
      console.warn('[ProductStudio] Container not found:', containerSelector);
      return;
    }

    _state = { images: [], productName: '', category: '', features: '', generateImages: true, loading: false, result: null, error: null };
    _render();
  }

  /* ════════════════════════════════════════════════════════
     EXPORT
     ════════════════════════════════════════════════════════ */

  if (!root.RetlifyProductStudio) {
    root.RetlifyProductStudio = { init };
  }

})(window);
