/**
 * Retlify — Image Generator (v5, Smart Prompt Edition)
 * =====================================================
 * 100% frontend AI — no backend, no API keys.
 * Uses Puter.js (puter.ai.txt2img) directly in the browser.
 *
 * KEY FIXES in v5:
 *  ✅ generateImages(productData)  — accepts { productName, category, features }
 *  ✅ Smart prompt builder         — uses category + features for accurate images
 *  ✅ Category-aware descriptors   — "shirt" → clothing terms, "saree" → ethnic terms
 *  ✅ Anti-hallucination guards    — prevents generic/unrelated imagery
 *  ✅ 4 shot types                 — Studio / Model / Lifestyle / Premium Brand
 *  ✅ Parallel generation          — all 4 fire simultaneously
 *  ✅ Zero backend required
 *  ❌ No HuggingFace
 *  ❌ No Replicate
 *  ❌ No Pollinations (primary)
 *
 * Usage:
 *   // New API (recommended):
 *   const shots = await generateImages({ productName: 'Blue Denim Jacket', category: 'Clothing & Apparel', features: 'Slim fit, Washed denim' });
 *
 *   // Legacy API (still works):
 *   const shots = await generateProductImages('Blue Denim Jacket');
 *
 *   // Drop-in widget:
 *   new ImageGenerator('#container');
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   1. PUTER.JS LOADER
   Dynamically injects the Puter.js SDK once and caches the promise.
   ═══════════════════════════════════════════════════════════════════════════ */

let _puterReady = null;

function _ensurePuter() {
  if (_puterReady) return _puterReady;

  _puterReady = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.puter && window.puter.ai) {
      return resolve(window.puter);
    }
    const script = document.createElement('script');
    script.src   = 'https://js.puter.com/v2/';
    script.async = true;
    script.onload = () => {
      const poll = setInterval(() => {
        if (window.puter && window.puter.ai && typeof window.puter.ai.txt2img === 'function') {
          clearInterval(poll);
          resolve(window.puter);
        }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error('Puter.js timed out after 15s')); }, 15000);
    };
    script.onerror = () => reject(new Error('Could not load Puter.js SDK'));
    document.head.appendChild(script);
  });

  return _puterReady;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CATEGORY → VISUAL DESCRIPTOR MAP
   Maps product categories to specific visual language that steers the AI
   toward the correct product type. This is what prevents "shirt → building".
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORY_DESCRIPTORS = {
  // ── Fashion / Apparel ──────────────────────────────────────────────────
  'clothing & apparel': {
    type: 'garment',
    material: 'fabric',
    context: 'fashion apparel',
    modelContext: 'wearing this clothing item',
    lifestyleCtx: 'casual fashion lifestyle',
    negatives: 'no buildings, no landscapes, no vehicles',
  },
  'footwear': {
    type: 'pair of shoes',
    material: 'leather and sole',
    context: 'footwear product',
    modelContext: 'wearing these shoes, feet visible',
    lifestyleCtx: 'active lifestyle footwear scene',
    negatives: 'no buildings, no faces without shoes, no vehicles',
  },
  'jewellery': {
    type: 'jewellery piece',
    material: 'metal and gemstone',
    context: 'luxury jewellery',
    modelContext: 'model wearing this jewellery, close-up',
    lifestyleCtx: 'elegant jewellery lifestyle scene',
    negatives: 'no buildings, no full body, no vehicles',
  },
  'bags & accessories': {
    type: 'fashion accessory',
    material: 'premium material',
    context: 'fashion accessory product',
    modelContext: 'model holding or wearing this accessory',
    lifestyleCtx: 'stylish lifestyle accessory scene',
    negatives: 'no buildings, no vehicles, no unrelated objects',
  },
  // ── Ethnic Wear ────────────────────────────────────────────────────────
  'kurti': {
    type: 'kurti ethnic top',
    material: 'cotton or silk fabric',
    context: 'Indian ethnic fashion apparel',
    modelContext: 'Indian model wearing this kurti, full body',
    lifestyleCtx: 'Indian festive or casual lifestyle',
    negatives: 'no buildings, no western clothing, no vehicles',
  },
  'saree': {
    type: 'saree draped garment',
    material: 'silk or cotton fabric with border',
    context: 'traditional Indian saree',
    modelContext: 'Indian model draped in this saree, full body',
    lifestyleCtx: 'elegant Indian festive setting',
    negatives: 'no buildings, no western clothing, no vehicles',
  },
  'lehenga': {
    type: 'lehenga ethnic outfit',
    material: 'embroidered fabric with skirt and blouse',
    context: 'Indian bridal or festive wear',
    modelContext: 'Indian model wearing this lehenga, full bridal look',
    lifestyleCtx: 'Indian wedding or celebration setting',
    negatives: 'no buildings, no western clothing, no vehicles',
  },
  // ── Electronics ────────────────────────────────────────────────────────
  'electronics': {
    type: 'electronic device',
    material: 'plastic and metal chassis',
    context: 'consumer electronics product',
    modelContext: 'person holding or using this device',
    lifestyleCtx: 'modern tech lifestyle scene',
    negatives: 'no buildings, no outdoor landscapes, no clothing',
  },
  'mobile phones': {
    type: 'smartphone',
    material: 'glass and aluminum body',
    context: 'mobile phone product',
    modelContext: 'hand holding this smartphone, screen visible',
    lifestyleCtx: 'modern tech lifestyle, person using phone',
    negatives: 'no buildings, no vehicles, no full body landscapes',
  },
  // ── Home & Living ──────────────────────────────────────────────────────
  'home & kitchen': {
    type: 'home product',
    material: 'household material',
    context: 'home and kitchen product',
    modelContext: 'person using this home product in kitchen or living room',
    lifestyleCtx: 'cozy modern home interior',
    negatives: 'no outdoor scenes, no fashion, no vehicles',
  },
  'furniture': {
    type: 'furniture piece',
    material: 'wood or upholstery',
    context: 'interior furniture',
    modelContext: 'person sitting on or using this furniture',
    lifestyleCtx: 'stylish modern interior room setting',
    negatives: 'no outdoor landscapes, no vehicles, no fashion',
  },
  // ── Beauty ─────────────────────────────────────────────────────────────
  'beauty & cosmetics': {
    type: 'beauty product',
    material: 'cosmetic packaging',
    context: 'beauty and skincare product',
    modelContext: 'model applying or using this beauty product',
    lifestyleCtx: 'luxury beauty routine lifestyle',
    negatives: 'no buildings, no vehicles, no unrelated objects',
  },
  // ── Sports ─────────────────────────────────────────────────────────────
  'sports & fitness': {
    type: 'sports equipment or activewear',
    material: 'performance material',
    context: 'sports and fitness product',
    modelContext: 'athlete using or wearing this sports product',
    lifestyleCtx: 'active outdoor or gym fitness lifestyle',
    negatives: 'no buildings, no fashion context, no vehicles',
  },
  // ── Toys ───────────────────────────────────────────────────────────────
  'toys & games': {
    type: 'toy or game',
    material: 'colorful plastic or fabric',
    context: 'children\'s toy or game product',
    modelContext: 'child playing with this toy, joyful expression',
    lifestyleCtx: 'playful children\'s room or outdoor play setting',
    negatives: 'no adults only, no vehicles, no buildings',
  },
  // ── Default fallback ────────────────────────────────────────────────────
  default: {
    type: 'product',
    material: 'quality material',
    context: 'ecommerce product',
    modelContext: 'person using or holding this product',
    lifestyleCtx: 'modern lifestyle scene',
    negatives: 'no unrelated objects, no random backgrounds',
  },
};

function _getCategoryDescriptor(category) {
  if (!category) return CATEGORY_DESCRIPTORS.default;
  const key = String(category).toLowerCase().trim();
  return CATEGORY_DESCRIPTORS[key] || CATEGORY_DESCRIPTORS.default;
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. SHOT TYPE DEFINITIONS
   4 distinct shot types — each with a specific visual purpose and prompt style.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHOT_TYPES = [
  {
    key:   'studio',
    label: 'Studio Shot',
    emoji: '📦',
    build: (product, cat, features) => {
      const desc = _getCategoryDescriptor(cat);
      const featureStr = features ? `, ${features}` : '';
      return [
        `professional ecommerce product photography of a ${product}`,
        `${desc.context}${featureStr}`,
        `isolated on pure white background`,
        `softbox studio lighting, no harsh shadows`,
        `sharp crisp focus on the ${desc.type}`,
        `commercial fashion catalog style`,
        `clean product presentation, no props`,
        `high resolution 8K product photo`,
        `photorealistic, highly detailed`,
        `${desc.negatives}`,
        `no text, no watermarks, no people`,
      ].join(', ');
    },
  },
  {
    key:   'model',
    label: 'Model Shot',
    emoji: '👗',
    build: (product, cat, features) => {
      const desc = _getCategoryDescriptor(cat);
      const featureStr = features ? ` with ${features}` : '';
      return [
        `fashion model ${desc.modelContext}${featureStr}`,
        `the product is a ${product}`,
        `${desc.context} photography`,
        `professional lookbook shoot`,
        `clean neutral studio background`,
        `full body editorial pose`,
        `high-end fashion magazine quality`,
        `soft natural key lighting`,
        `commercial model photography`,
        `premium apparel brand aesthetic`,
        `photorealistic, highly detailed`,
        `${desc.negatives}`,
        `no text, no watermarks`,
      ].join(', ');
    },
  },
  {
    key:   'lifestyle',
    label: 'Lifestyle Shot',
    emoji: '🌿',
    build: (product, cat, features) => {
      const desc = _getCategoryDescriptor(cat);
      const featureStr = features ? `, highlighting ${features}` : '';
      return [
        `aspirational lifestyle photo featuring a ${product}${featureStr}`,
        `${desc.lifestyleCtx}`,
        `${desc.context} in real-world setting`,
        `warm golden hour natural lighting`,
        `shallow depth of field with soft bokeh`,
        `editorial photography`,
        `authentic real-life context`,
        `Instagram-worthy composition`,
        `photorealistic, highly detailed`,
        `${desc.negatives}`,
        `no text, no watermarks`,
      ].join(', ');
    },
  },
  {
    key:   'premium',
    label: 'Premium Brand Shot',
    emoji: '✨',
    build: (product, cat, features) => {
      const desc = _getCategoryDescriptor(cat);
      const featureStr = features ? ` emphasizing ${features}` : '';
      return [
        `luxury fashion brand campaign image of a ${product}${featureStr}`,
        `${desc.context} premium advertising`,
        `dramatic cinematic lighting`,
        `deep charcoal gradient background`,
        `high contrast rich shadows`,
        `designer fashion house aesthetic`,
        `sophisticated and aspirational`,
        `premium brand advertising quality`,
        `Vogue-editorial visual style`,
        `photorealistic, highly detailed`,
        `${desc.negatives}`,
        `no text, no watermarks`,
      ].join(', ');
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   4. PROMPT BUILDER
   Accepts productName + category + features → returns rich, accurate prompt.
   This is the core fix — specific prompts = relevant images.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Build a rich ecommerce prompt for a specific shot type.
 *
 * @param {string} productName  - e.g. "Yellow Checkered Shirt"
 * @param {string} [category]   - e.g. "Clothing & Apparel"
 * @param {string} [features]   - e.g. "Cotton fabric, slim fit, full sleeves"
 * @param {object} shot         - one of SHOT_TYPES
 * @returns {string}            - full AI prompt
 */
function buildPrompt(productName, category, features, shot) {
  // Handle legacy call: buildPrompt(rawProduct, shot)
  if (shot === undefined && category && typeof category === 'object') {
    shot = category;
    category = '';
    features = '';
  }

  const cleanName     = String(productName || '').trim().replace(/[<>"']/g, '');
  const cleanCategory = String(category   || '').trim();
  const cleanFeatures = String(features   || '').trim();

  if (!shot || !shot.build) {
    // Fallback to legacy format
    return `high quality ecommerce product photo of a ${cleanName}, studio lighting, white background, fashion catalog style, realistic, detailed`;
  }

  return shot.build(cleanName, cleanCategory, cleanFeatures);
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. PRIMARY: generateImages(productData)
   ─────────────────────────────────────────────────────────────────────────
   The main function — accepts a productData object and returns 4 image URLs.

   @param {object} productData
     productData.productName  {string}  required — e.g. "Yellow Checkered Shirt"
     productData.category     {string}  optional — e.g. "Clothing & Apparel"
     productData.features     {string}  optional — e.g. "Cotton, slim fit"
     productData.shotKeys     {array}   optional — subset of shot keys to generate
     productData.onProgress   {fn}      optional — callback(done, total, shotKey)

   @returns {Promise<Array<{url, label, emoji, type, prompt, error}>>}
   ═══════════════════════════════════════════════════════════════════════════ */

async function generateImages(productData = {}) {
  const {
    productName,
    category  = '',
    features  = '',
    shotKeys  = SHOT_TYPES.map(s => s.key),
    onProgress,
  } = productData;

  if (!productName || !String(productName).trim()) {
    throw new Error('generateImages: productName is required');
  }

  const puter  = await _ensurePuter();
  const shots  = SHOT_TYPES.filter(s => shotKeys.includes(s.key));
  let doneCount = 0;

  console.log('[ImageGen] Starting generation for:', productName, '|', category, '|', features);

  const promises = shots.map(async (shot) => {
    const prompt = buildPrompt(productName, category, features, shot);

    console.log(`[ImageGen] ${shot.key} prompt:`, prompt);

    try {
      const imgEl = await puter.ai.txt2img(prompt, false);
      doneCount++;
      onProgress?.(doneCount, shots.length, shot.key);

      return {
        url:    imgEl.src,
        label:  shot.label,
        emoji:  shot.emoji,
        type:   shot.key,
        prompt,
        error:  false,
      };
    } catch (err) {
      doneCount++;
      onProgress?.(doneCount, shots.length, shot.key);
      console.warn(`[ImageGen] ${shot.key} failed:`, err.message);

      return {
        url:      null,
        label:    shot.label,
        emoji:    shot.emoji,
        type:     shot.key,
        prompt,
        error:    true,
        errorMsg: err.message,
      };
    }
  });

  const results    = await Promise.all(promises);
  const successful = results.filter(r => !r.error && r.url);

  if (!successful.length) {
    throw new Error('All image generations failed. Check your internet connection and try again.');
  }

  return results;
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. LEGACY ALIAS: generateProductImages(rawProduct, opts)
   Preserved for backward compatibility with existing code that calls:
   window.generateProductImages('Blue Denim Jacket')
   ═══════════════════════════════════════════════════════════════════════════ */

async function generateProductImages(rawProduct, opts = {}) {
  return generateImages({
    productName: rawProduct,
    category:    opts.category   || '',
    features:    opts.features   || '',
    shotKeys:    opts.shotKeys   || SHOT_TYPES.map(s => s.key),
    onProgress:  opts.onProgress || null,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. ImageGenerator UI COMPONENT
   Drop-in widget that renders a full image generator panel with input fields
   for product name, category, and features — feeding all into generateImages().

   Usage: new ImageGenerator('#container')
   ═══════════════════════════════════════════════════════════════════════════ */

class ImageGenerator {
  constructor(container, opts = {}) {
    this._el = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!this._el) throw new Error(`ImageGenerator: container not found: ${container}`);

    this._opts = {
      placeholder: opts.placeholder || 'e.g. Blue Denim Jacket, Silk Saree, iPhone Case…',
      columns:     opts.columns     || 2,
      shotKeys:    opts.shotKeys    || SHOT_TYPES.map(s => s.key),
    };

    this._state = {
      loading:     false,
      doneCount:   0,
      totalCount:  0,
      images:      [],
      error:       null,
      productName: '',
      category:    '',
      features:    '',
    };

    // Pre-warm Puter.js in the background
    _ensurePuter().catch(() => {});
    this._injectStyles();
    this._render();
  }

  async generate() {
    const { productName, category, features } = this._state;
    if (this._state.loading || !productName.trim()) return;

    const shots = SHOT_TYPES.filter(s => this._opts.shotKeys.includes(s.key));
    this._setState({ loading: true, doneCount: 0, totalCount: shots.length, images: [], error: null });

    try {
      const images = await generateImages({
        productName,
        category,
        features,
        shotKeys:   this._opts.shotKeys,
        onProgress: (done, total) => this._setState({ doneCount: done, totalCount: total }),
      });
      this._setState({ loading: false, images });
    } catch (err) {
      this._setState({ loading: false, error: err.message });
    }
  }

  _setState(patch) {
    Object.assign(this._state, patch);
    this._render();
  }

  _render() {
    this._el.innerHTML = `
      <div class="ig-wrap">
        ${this._renderInputPanel()}
        ${this._state.loading                               ? this._renderLoader() : ''}
        ${this._state.error                                 ? this._renderError()  : ''}
        ${this._state.images.length && !this._state.loading ? this._renderGrid()   : ''}
      </div>
    `;
    this._attachEvents();
  }

  _renderInputPanel() {
    const cats = [
      '', 'Clothing & Apparel', 'Footwear', 'Jewellery', 'Bags & Accessories',
      'Kurti', 'Saree', 'Lehenga',
      'Electronics', 'Mobile Phones',
      'Home & Kitchen', 'Furniture',
      'Beauty & Cosmetics', 'Sports & Fitness', 'Toys & Games',
    ];

    const chips = SHOT_TYPES
      .filter(s => this._opts.shotKeys.includes(s.key))
      .map(s => `<span class="ig-chip">${s.emoji} ${s.label}</span>`)
      .join('');

    const categoryOptions = cats.map(c =>
      `<option value="${this._esc(c)}" ${this._state.category === c ? 'selected' : ''}>${c || 'Select category…'}</option>`
    ).join('');

    return `
      <div class="ig-input-panel">
        <div class="ig-field-row">
          <div class="ig-field ig-field--name">
            <label class="ig-label">Product Name <span class="ig-req">*</span></label>
            <input
              id="ig-name-input"
              class="ig-input"
              type="text"
              placeholder="${this._opts.placeholder}"
              value="${this._esc(this._state.productName)}"
              ${this._state.loading ? 'disabled' : ''}
            />
          </div>
          <div class="ig-field ig-field--cat">
            <label class="ig-label">Category</label>
            <select id="ig-cat-select" class="ig-input ig-select" ${this._state.loading ? 'disabled' : ''}>
              ${categoryOptions}
            </select>
          </div>
        </div>
        <div class="ig-field">
          <label class="ig-label">Key Features <span class="ig-opt">(optional — improves accuracy)</span></label>
          <input
            id="ig-feats-input"
            class="ig-input"
            type="text"
            placeholder="e.g. Cotton fabric, slim fit, navy blue, full sleeves…"
            value="${this._esc(this._state.features)}"
            ${this._state.loading ? 'disabled' : ''}
          />
        </div>
        <div class="ig-action-row">
          <button id="ig-generate-btn" class="ig-btn" ${this._state.loading || !this._state.productName.trim() ? 'disabled' : ''}>
            ${this._state.loading
              ? '<span class="ig-spinner"></span> Generating…'
              : '✨ Generate 4 Product Shots'}
          </button>
          <div class="ig-chip-row">${chips}</div>
        </div>
      </div>
    `;
  }

  _renderLoader() {
    const shots = SHOT_TYPES.filter(s => this._opts.shotKeys.includes(s.key));
    const done  = this._state.doneCount;
    const pct   = Math.round((done / shots.length) * 100);

    return `
      <div class="ig-loader">
        <div class="ig-progress-bar"><div class="ig-progress-fill" style="width:${pct}%"></div></div>
        <div class="ig-progress-label">${done} / ${shots.length} images ready</div>
        <div class="ig-shot-list">
          ${shots.map((s, i) => {
            const isDone   = i < done;
            const isActive = i === done;
            return `
              <div class="ig-shot-row${isDone ? ' done' : ''}${isActive ? ' active' : ''}">
                <span>${s.emoji}</span>
                <span class="ig-shot-name">${s.label}</span>
                ${isDone   ? '<span class="ig-check">✓</span>'   : ''}
                ${isActive ? '<span class="ig-spin-dot"></span>'  : ''}
              </div>`;
          }).join('')}
        </div>
        <p class="ig-loader-sub">Powered by Puter.js AI — runs entirely in your browser · Free · No API key needed</p>
      </div>
    `;
  }

  _renderError() {
    return `
      <div class="ig-error">
        <span>⚠️</span>
        <span class="ig-error-msg">${this._esc(this._state.error)}</span>
        <button id="ig-retry-btn" class="ig-retry-btn">Retry</button>
      </div>
    `;
  }

  _renderGrid() {
    const cols   = this._opts.columns;
    const images = this._state.images;
    const ok     = images.filter(i => !i.error && i.url).length;

    return `
      <div class="ig-grid-header">
        <span class="ig-count">${ok} of ${images.length} shots generated for <strong>${this._esc(this._state.productName)}</strong></span>
        <button id="ig-regenerate-btn" class="ig-regen-btn">↩ Generate Again</button>
      </div>
      <div class="ig-grid" style="grid-template-columns:repeat(${cols},1fr)">
        ${images.map((img, idx) => img.error || !img.url
          ? `<div class="ig-card ig-card--error">
               <div class="ig-placeholder"><span>${img.emoji}</span><span class="ig-fail-txt">${this._esc(img.label)} failed</span></div>
               <span class="ig-tag">${img.emoji} ${this._esc(img.label)}</span>
             </div>`
          : `<div class="ig-card">
               <img src="${this._esc(img.url)}" alt="${this._esc(img.label)} of ${this._esc(this._state.productName)}" class="ig-img" loading="lazy"/>
               <span class="ig-tag">${img.emoji} ${this._esc(img.label)}</span>
               <div class="ig-overlay">
                 <a href="${this._esc(img.url)}" download="retlify-${img.type}-${idx+1}.jpg" class="ig-dl-btn" title="Download">⬇</a>
                 <a href="${this._esc(img.url)}" target="_blank" rel="noopener" class="ig-open-btn" title="Full size">⤢</a>
               </div>
             </div>`
        ).join('')}
      </div>
    `;
  }

  _attachEvents() {
    const nameInput  = this._el.querySelector('#ig-name-input');
    const catSelect  = this._el.querySelector('#ig-cat-select');
    const featsInput = this._el.querySelector('#ig-feats-input');
    const genBtn     = this._el.querySelector('#ig-generate-btn');
    const regenBtn   = this._el.querySelector('#ig-regenerate-btn');
    const retryBtn   = this._el.querySelector('#ig-retry-btn');

    nameInput?.addEventListener('input',  e => { this._state.productName = e.target.value; this._updateBtn(); });
    catSelect?.addEventListener('change', e => { this._state.category    = e.target.value; });
    featsInput?.addEventListener('input', e => { this._state.features    = e.target.value; });

    nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') genBtn?.click(); });

    genBtn?.addEventListener('click', () => this.generate());
    regenBtn?.addEventListener('click', () => {
      this._setState({ images: [], error: null });
      this.generate();
    });
    retryBtn?.addEventListener('click', () => this.generate());
  }

  _updateBtn() {
    const btn = this._el.querySelector('#ig-generate-btn');
    if (btn) btn.disabled = this._state.loading || !this._state.productName.trim();
  }

  _esc(str) {
    return str
      ? String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      : '';
  }

  _injectStyles() {
    if (document.getElementById('ig-styles-v5')) return;
    const style = document.createElement('style');
    style.id = 'ig-styles-v5';
    style.textContent = `
      .ig-wrap { font-family: 'DM Sans', 'Outfit', system-ui, sans-serif; }

      /* ── Input Panel ─────────────────────────────── */
      .ig-input-panel { margin-bottom: 20px; }

      .ig-field-row {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 12px;
        margin-bottom: 12px;
      }
      @media (max-width: 600px) { .ig-field-row { grid-template-columns: 1fr; } }

      .ig-field { display: flex; flex-direction: column; gap: 5px; }
      .ig-label { font-size: 12px; font-weight: 700; color: #374151; letter-spacing: .3px; text-transform: uppercase; }
      .ig-req   { color: #EF4444; }
      .ig-opt   { font-weight: 400; text-transform: none; color: #9CA3AF; font-size: 11px; }

      .ig-input {
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
      .ig-input:focus    { border-color: #FFD23F; box-shadow: 0 0 0 3px rgba(255,210,63,.15); }
      .ig-input:disabled { background: #F9FAFB; color: #9CA3AF; cursor: not-allowed; }
      .ig-select { cursor: pointer; appearance: auto; }

      .ig-action-row {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      /* ── Shot chips ────────────────────────────────── */
      .ig-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .ig-chip {
        padding: 4px 10px;
        background: #F3F4F6;
        border-radius: 20px;
        font-size: 11px;
        color: #374151;
        font-weight: 600;
        letter-spacing: .2px;
      }

      /* ── Generate Button ──────────────────────────── */
      .ig-btn {
        padding: 11px 20px;
        background: linear-gradient(135deg, #111827, #1F2937);
        color: #FFD23F;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        font-family: inherit;
        transition: all .2s;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .ig-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1F2937, #374151); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.2); }
      .ig-btn:disabled              { opacity: .5; cursor: not-allowed; transform: none; }
      .ig-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(255,210,63,.3);
        border-top-color: #FFD23F;
        border-radius: 50%;
        animation: ig-spin .7s linear infinite;
        display: inline-block;
      }
      @keyframes ig-spin { to { transform: rotate(360deg); } }

      /* ── Loader ──────────────────────────────────── */
      .ig-loader {
        padding: 20px;
        background: #F9FAFB;
        border-radius: 14px;
        margin-bottom: 16px;
        border: 1.5px solid #E5E7EB;
      }
      .ig-progress-bar { height: 6px; background: #E5E7EB; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
      .ig-progress-fill { height: 100%; background: linear-gradient(90deg, #FFD23F, #FFC200); border-radius: 3px; transition: width .4s ease; }
      .ig-progress-label { font-size: 12px; color: #6B7280; font-weight: 600; margin-bottom: 12px; }
      .ig-shot-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .ig-shot-row {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 8px;
        background: #fff; border: 1.5px solid #E5E7EB;
        font-size: 13px; color: #9CA3AF; transition: all .25s;
      }
      .ig-shot-row.active { border-color: #FFD23F; background: #FFFBEB; color: #111827; font-weight: 600; }
      .ig-shot-row.done   { border-color: #86EFAC; background: #F0FDF4; color: #166534; }
      .ig-shot-name       { flex: 1; }
      .ig-check           { color: #22C55E; font-weight: 700; }
      .ig-spin-dot {
        width: 14px; height: 14px;
        border: 2px solid rgba(255,210,63,.3);
        border-top-color: #FFD23F;
        border-radius: 50%;
        animation: ig-spin .7s linear infinite;
      }
      .ig-loader-sub { font-size: 11px; color: #9CA3AF; text-align: center; margin: 0; }

      /* ── Error ───────────────────────────────────── */
      .ig-error {
        display: flex; align-items: center; gap: 10px;
        padding: 14px 16px;
        background: #FEF2F2; border: 1px solid #FECACA;
        border-radius: 10px; font-size: 13px; color: #991B1B;
        margin-bottom: 12px;
      }
      .ig-error-msg { flex: 1; }
      .ig-retry-btn {
        padding: 5px 12px; background: #991B1B; color: #fff;
        border: none; border-radius: 6px; font-size: 12px;
        font-weight: 600; cursor: pointer; font-family: inherit;
      }
      .ig-retry-btn:hover { background: #7F1D1D; }

      /* ── Grid Header ─────────────────────────────── */
      .ig-grid-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px; flex-wrap: wrap; gap: 8px;
      }
      .ig-count { font-size: 13px; color: #374151; }
      .ig-regen-btn {
        padding: 5px 12px; background: #F3F4F6; color: #374151;
        border: 1.5px solid #E5E7EB; border-radius: 8px;
        font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
        transition: all .15s;
      }
      .ig-regen-btn:hover { background: #E5E7EB; }

      /* ── Image Grid ──────────────────────────────── */
      .ig-grid { display: grid; gap: 10px; }
      .ig-card {
        position: relative; aspect-ratio: 3/4;
        border-radius: 12px; overflow: hidden;
        background: #F3F4F6; cursor: pointer;
        animation: ig-fadeup .35s ease both;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
        transition: transform .2s, box-shadow .2s;
      }
      .ig-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.12); }
      @keyframes ig-fadeup { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .ig-card--error { opacity: .5; cursor: default; }
      .ig-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s; }
      .ig-card:hover .ig-img { transform: scale(1.03); }

      .ig-placeholder {
        width: 100%; height: 100%;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 8px; font-size: 28px; color: #D1D5DB;
      }
      .ig-fail-txt { font-size: 11px; color: #9CA3AF; }

      .ig-tag {
        position: absolute; bottom: 8px; left: 8px;
        background: rgba(0,0,0,.65); color: #fff; border-radius: 6px;
        padding: 3px 9px; font-size: 11px; font-weight: 600;
        backdrop-filter: blur(4px); pointer-events: none;
      }

      .ig-overlay {
        position: absolute; inset: 0;
        background: linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 50%);
        opacity: 0; transition: opacity .2s;
        display: flex; align-items: flex-end; justify-content: flex-end;
        gap: 6px; padding: 8px;
      }
      .ig-card:hover .ig-overlay { opacity: 1; }
      .ig-dl-btn, .ig-open-btn {
        background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35);
        color: #fff; border-radius: 6px; padding: 5px 8px; font-size: 14px;
        text-decoration: none; line-height: 1; transition: background .15s;
        backdrop-filter: blur(4px);
      }
      .ig-dl-btn:hover, .ig-open-btn:hover { background: rgba(255,255,255,.35); }
    `;
    document.head.appendChild(style);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. EXPORTS
   ═══════════════════════════════════════════════════════════════════════════ */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ImageGenerator,
    generateImages,
    generateProductImages,   // legacy alias
    buildPrompt,
    SHOT_TYPES,
    CATEGORY_DESCRIPTORS,
  };
}

if (typeof window !== 'undefined') {
  window.ImageGenerator        = ImageGenerator;
  window.generateImages        = generateImages;         // NEW primary API
  window.generateProductImages = generateProductImages;  // legacy alias kept
  window.buildPrompt           = buildPrompt;
  window.SHOT_TYPES            = SHOT_TYPES;
  window.CATEGORY_DESCRIPTORS  = CATEGORY_DESCRIPTORS;
}
