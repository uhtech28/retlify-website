/**
 * Retlify AI Features — Analytics Panel + AI Product Studio
 * ==========================================================
 * v2: Description Generator → full AI Product Studio
 *
 * Exports: RetlifyAI.initAnalytics, RetlifyAI.initDescriptionGenerator
 * (initDescriptionGenerator now boots the full Product Studio)
 */

(function (root) {
  'use strict';

  const AI_BASE = '/api/ai';

  // ══════════════════════════════════════════
  // AI ANALYTICS PANEL  (unchanged)
  // ══════════════════════════════════════════

  async function initAnalytics(containerSelector, opts = {}) {
    const container =
      typeof containerSelector === 'string'
        ? document.querySelector(containerSelector) || document.getElementById(containerSelector.replace('#',''))
        : containerSelector;
    if (!container) return;

    container.innerHTML = `<div class="ai-loading-wrap"><div class="ai-loading-spinner"></div><div class="ai-loading-text">Loading AI insights…</div></div>`;

    try {
      const res  = await fetch(`${AI_BASE}/insights?city=${encodeURIComponent(opts.city||'')}`);
      const data = await res.json();
      container.innerHTML = _renderAnalytics(data, opts);
    } catch {
      container.innerHTML = `<div class="ai-error">⚠️ Could not load insights. Please try again.</div>`;
    }
  }

  function _renderAnalytics(data, opts) {
    const insights = data.insights || data.topInsights || [];
    const trending = data.trendingProducts || data.trending || [];
    const recs     = data.recommendations || data.actionItems || [];
    const festivals= data.upcomingFestivals || data.festivals || [];
    const gaps     = data.marketGaps || [];
    const focus    = data.weeklyFocus || data.summary || 'Keep building your store!';

    const insightCards = insights.slice(0,4).map(i => `
      <div class="ai-insight-card">
        <div class="ai-insight-icon">${i.icon||'💡'}</div>
        <div>
          <div class="ai-insight-title">${_esc(i.title||i.insight||'')}</div>
          <div class="ai-insight-desc">${_esc(i.description||i.detail||'')}</div>
          ${i.action?`<div class="ai-insight-action">→ ${_esc(i.action)}</div>`:''}
        </div>
      </div>`).join('');

    const trendRows = trending.slice(0,6).map(t => `
      <div class="ai-trend-row">
        <span class="ai-trend-name">${_esc(t.name||t.product||'')}</span>
        <span class="ai-trend-demand ai-demand-${(t.demand||'').toLowerCase().replace(' ','-')}">${_esc(t.demand||'')}</span>
        <span class="ai-trend-pct">${t.growth||t.change||''}</span>
      </div>`).join('');

    const recItems = recs.slice(0,5).map(r=>`<li class="ai-rec-item">→ ${_esc(r.action||r)}</li>`).join('');
    const gapItems = gaps.slice(0,4).map(g=>`<div class="ai-gap-item">◦ ${_esc(g.gap||g)}</div>`).join('');

    const festItems = festivals.slice(0,4).map(f=>`
      <div class="ai-festival-item">
        <span style="font-size:20px">${f.icon||'🎉'}</span>
        <span class="ai-festival-name">${_esc(f.name||'')}</span>
        <span class="ai-festival-demand">${_esc(f.products||f.opportunity||'')}</span>
        <span class="ai-festival-urgency urgency-${(f.urgency||'low').toLowerCase()}">${_esc(f.urgency||'')}</span>
      </div>`).join('');

    return `
      <div class="ai-analytics-wrap">
        <div class="ai-analytics-header">
          <div class="ai-analytics-badge">✦ AI Insights</div>
          <div class="ai-analytics-headline">Your Shop Intelligence Report</div>
          <div class="ai-weekly-focus">${_esc(focus)}</div>
        </div>

        <div class="ai-insight-grid">${insightCards||'<div class="ai-empty">No insights yet — add products to get started.</div>'}</div>

        <div class="ai-two-col">
          <div class="ai-panel">
            <div class="ai-panel-title">📈 Trending Near You</div>
            ${trendRows||'<div class="ai-empty">No data yet.</div>'}
          </div>
          <div class="ai-panel">
            <div class="ai-panel-title">✅ Recommended Actions</div>
            <ul class="ai-rec-list">${recItems||'<li class="ai-rec-item">Keep your catalogue updated</li>'}</ul>
            ${gapItems?`<div class="ai-panel-sub-title">Market Gaps</div>${gapItems}`:''}
          </div>
        </div>

        ${festItems?`<div class="ai-festivals"><div class="ai-panel-title">🎊 Upcoming Festivals</div>${festItems}</div>`:''}
        <div class="ai-analytics-footer">Powered by Retlify AI · Updates daily</div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // AI PRODUCT STUDIO
  // ══════════════════════════════════════════════════════════════

  /* ── State ─────────────────────────────────────────────────── */
  let _uploadedFiles = [];   // File objects
  let _previews      = [];   // { id, url, file }

  /* ── Boot ──────────────────────────────────────────────────── */
  function initDescriptionGenerator(formContainerId) {
    const container = document.getElementById(formContainerId);
    if (!container) return;

    _uploadedFiles = [];
    _previews      = [];

    container.innerHTML = _studioShell();
    _bindStudio(container);
  }

  /* ── HTML Shell ─────────────────────────────────────────────── */
  function _studioShell() {
    return `
<div class="pstudio-root" id="pstudio-root">

  <!-- HEADER -->
  <div class="pstudio-head">
    <div class="pstudio-head-left">
      <div class="pstudio-badge">✦ AI Product Studio</div>
      <h2 class="pstudio-title">Turn Any Product Into a Premium Listing</h2>
      <p class="pstudio-sub">Upload images · AI generates pro photos, model shots & SEO copy</p>
    </div>
    <div class="pstudio-head-pills">
      <span class="pstudio-pill pstudio-pill-img">🖼 AI Photos</span>
      <span class="pstudio-pill pstudio-pill-model">👗 Model Shots</span>
      <span class="pstudio-pill pstudio-pill-seo">✍ SEO Copy</span>
    </div>
  </div>

  <!-- 2-COLUMN BODY -->
  <div class="pstudio-body">

    <!-- LEFT: INPUT PANEL -->
    <div class="pstudio-left" id="pstudio-left">

      <div class="pstudio-section-label">Product Details</div>

      <div class="pstudio-field">
        <label class="pstudio-label">Product Name <span class="pstudio-req">*</span></label>
        <input id="ps-name" class="pstudio-input" placeholder="e.g. Blue Denim Jacket, iPhone 15 Case…" maxlength="120"/>
      </div>

      <div class="pstudio-field">
        <label class="pstudio-label">Category <span class="pstudio-req">*</span></label>
        <select id="ps-cat" class="pstudio-input">
          <option value="">Select category…</option>
          <optgroup label="Fashion">
            <option value="Clothing &amp; Apparel">Clothing &amp; Apparel</option>
            <option value="Footwear">Footwear</option>
            <option value="Jewellery">Jewellery</option>
            <option value="Bags &amp; Accessories">Bags &amp; Accessories</option>
          </optgroup>
          <optgroup label="Ethnic Wear">
            <option value="Kurti">Kurti</option>
            <option value="Saree">Saree</option>
            <option value="Lehenga">Lehenga</option>
          </optgroup>
          <optgroup label="Tech">
            <option value="Electronics">Electronics</option>
            <option value="Mobile Phones">Mobile Phones</option>
          </optgroup>
          <optgroup label="Other">
            <option value="Home &amp; Kitchen">Home &amp; Kitchen</option>
            <option value="Beauty &amp; Cosmetics">Beauty &amp; Cosmetics</option>
            <option value="Sports &amp; Fitness">Sports &amp; Fitness</option>
            <option value="Toys &amp; Games">Toys &amp; Games</option>
            <option value="Furniture">Furniture</option>
            <option value="Other">Other</option>
          </optgroup>
        </select>
      </div>

      <div class="pstudio-field">
        <label class="pstudio-label">Key Features <span class="pstudio-opt">(comma-separated)</span></label>
        <input id="ps-feats" class="pstudio-input" placeholder="e.g. Waterproof, Stretchable, 30hr battery…"/>
      </div>

      <div class="pstudio-field">
        <label class="pstudio-label">Output Language</label>
        <select id="ps-lang" class="pstudio-input">
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="hinglish">Hinglish</option>
        </select>
      </div>

      <!-- IMAGE UPLOAD -->
      <div class="pstudio-section-label" style="margin-top:6px">Product Images</div>

      <div class="pstudio-upload-zone" id="ps-drop-zone" role="button" tabindex="0" aria-label="Upload product images">
        <input type="file" id="ps-file-input" accept="image/jpeg,image/png,image/webp" multiple style="display:none"/>
        <div class="pstudio-upload-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="pstudio-upload-text">Drag &amp; drop product images here</div>
        <div class="pstudio-upload-sub">or <span class="pstudio-upload-link">click to browse</span></div>
        <div class="pstudio-upload-hint">JPG, PNG, WEBP · Max 5MB each · Up to 5 images</div>
      </div>

      <!-- PREVIEW STRIP -->
      <div class="pstudio-preview-strip" id="ps-preview-strip" style="display:none"></div>

      <!-- CTA -->
      <button id="ps-generate-btn" class="pstudio-generate-btn">
        <span class="pstudio-btn-icon">✦</span>
        <span id="ps-btn-txt">Generate AI Product Studio</span>
      </button>

      <div id="ps-progress" class="pstudio-progress" style="display:none">
        <div class="pstudio-progress-bar"><div class="pstudio-progress-fill" id="ps-progress-fill"></div></div>
        <div class="pstudio-progress-steps" id="ps-progress-steps">Initialising…</div>
      </div>

    </div><!-- /left -->

    <!-- RIGHT: OUTPUT PANEL -->
    <div class="pstudio-right" id="pstudio-right">

      <!-- Empty state -->
      <div class="pstudio-empty" id="ps-empty-state">
        <div class="pstudio-empty-icon">🎨</div>
        <div class="pstudio-empty-title">Your AI Studio</div>
        <div class="pstudio-empty-sub">Fill in product details on the left and click Generate.<br>AI will produce professional photos + complete SEO listing.</div>
        <div class="pstudio-empty-features">
          <div class="pstudio-ef-item"><span>📸</span>Studio product shots</div>
          <div class="pstudio-ef-item"><span>👗</span>Model wearing photos</div>
          <div class="pstudio-ef-item"><span>🔍</span>SEO title &amp; description</div>
          <div class="pstudio-ef-item"><span>🏷</span>Keywords &amp; tags</div>
        </div>
      </div>

      <!-- Results (hidden until generated) -->
      <div class="pstudio-results" id="ps-results" style="display:none">

        <!-- Marketing line -->
        <div class="pstudio-marketing-banner" id="ps-marketing-banner"></div>

        <!-- Virtual Try-On Coming Soon (replaces Generated Images) -->
        <div class="pstudio-results-section vto-section">
          <div class="vto-card">
            <!-- Ambient particles -->
            <div class="vto-particles" aria-hidden="true">
              <div class="vto-p vto-p1"></div><div class="vto-p vto-p2"></div>
              <div class="vto-p vto-p3"></div><div class="vto-p vto-p4"></div>
              <div class="vto-p vto-p5"></div><div class="vto-p vto-p6"></div>
              <div class="vto-p vto-p7"></div><div class="vto-p vto-p8"></div>
            </div>
            <!-- Rings -->
            <div class="vto-rings" aria-hidden="true">
              <div class="vto-ring vto-ring1"></div>
              <div class="vto-ring vto-ring2"></div>
              <div class="vto-ring vto-ring3"></div>
            </div>
            <!-- Badge -->
            <div class="vto-badge"><span class="vto-badge-dot"></span>Coming Soon</div>
            <!-- Orb -->
            <div class="vto-orb-wrap">
              <div class="vto-outer-glow"></div>
              <div class="vto-mid-glow"></div>
              <div class="vto-orb">
                <div class="vto-orb-highlight"></div>
                <span class="vto-orb-icon">✦</span>
              </div>
            </div>
            <!-- Text -->
            <h3 class="vto-title">AI Virtual Try-On</h3>
            <p class="vto-desc">Upload your product and generate realistic model shots, lifestyle visuals, and studio-quality images using AI.</p>
            <div class="vto-divider"></div>
            <p class="vto-sub">Virtual try-on system is under development. Stay tuned for a powerful AI feature.</p>
            <!-- Pills -->
            <div class="vto-pills">
              <span class="vto-pill">👔 Model Shots</span>
              <span class="vto-pill">🏡 Lifestyle Visuals</span>
              <span class="vto-pill">🎬 Studio Quality</span>
              <span class="vto-pill">⚡ Instant AI</span>
            </div>
            <!-- CTA -->
            <button class="vto-btn" id="vto-notify-btn" onclick="(function(btn){if(btn.dataset.notified){return;}btn.dataset.notified='1';btn.innerHTML='<span style=\'color:#34d399;font-size:1rem\'>✓</span>&nbsp;You\'re on the list!';btn.style.background='rgba(52,211,153,0.12)';btn.style.border='1px solid rgba(52,211,153,0.35)';btn.style.color='#34d399';btn.style.cursor='default';})(this)">
              <span class="vto-btn-icon">🔔</span> Notify Me
            </button>
          </div>
        </div>

        <!-- Content output -->
        <div class="pstudio-results-section">
          <div class="pstudio-results-section-hd">
            <span class="pstudio-rs-label">Generated Content</span>
            <button class="pstudio-copy-all-btn" id="ps-copy-all">Copy All</button>
          </div>

          <div class="pstudio-content-card" id="ps-content-title">
            <div class="pstudio-content-lbl">TITLE</div>
            <div class="pstudio-content-val" id="ps-out-title"></div>
            <button class="pstudio-copy-mini" data-target="ps-out-title">Copy</button>
          </div>

          <div class="pstudio-content-card" id="ps-content-desc">
            <div class="pstudio-content-lbl">DESCRIPTION</div>
            <div class="pstudio-content-val" id="ps-out-desc"></div>
            <button class="pstudio-copy-mini" data-target="ps-out-desc">Copy</button>
          </div>

          <div class="pstudio-content-card">
            <div class="pstudio-content-lbl">HIGHLIGHTS</div>
            <ul class="pstudio-hl-list" id="ps-out-hl"></ul>
          </div>

          <div class="pstudio-content-card">
            <div class="pstudio-content-lbl">SEO TAGS</div>
            <div class="pstudio-tags-row" id="ps-out-tags"></div>
          </div>

          <div class="pstudio-content-card" id="ps-cta-card" style="display:none">
            <div class="pstudio-content-lbl">CALL TO ACTION</div>
            <div class="pstudio-cta-val" id="ps-out-cta"></div>
          </div>
        </div>

        <!-- Detected attributes -->
        <div class="pstudio-attr-row" id="ps-attr-row"></div>

        <!-- Regenerate -->
        <button class="pstudio-regen-btn" id="ps-regen-btn">↺ Regenerate</button>

      </div><!-- /results -->

    </div><!-- /right -->
  </div><!-- /body -->
</div><!-- /root -->`;
  }

  /* ── Bind all interactions ─────────────────────────────────── */
  function _bindStudio(container) {
    const dropZone   = container.querySelector('#ps-drop-zone');
    const fileInput  = container.querySelector('#ps-file-input');
    const genBtn     = container.querySelector('#ps-generate-btn');
    const regenBtn   = container.querySelector('#ps-regen-btn');

    /* File input click */
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') fileInput.click(); });

    /* Drag events */
    ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault(); dropZone.classList.add('pstudio-upload-zone--drag');
    }));
    ['dragleave','dragend','drop'].forEach(ev => dropZone.addEventListener(ev, () => {
      dropZone.classList.remove('pstudio-upload-zone--drag');
    }));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      _handleFiles([...e.dataTransfer.files]);
    });

    /* File select */
    fileInput.addEventListener('change', () => {
      _handleFiles([...fileInput.files]);
      fileInput.value = '';
    });

    /* Generate */
    genBtn.addEventListener('click', _runStudio);
    regenBtn.addEventListener('click', _runStudio);

    /* Copy mini buttons (delegated) */
    container.addEventListener('click', e => {
      if (e.target.matches('.pstudio-copy-mini')) {
        const id  = e.target.dataset.target;
        const val = document.getElementById(id)?.textContent || '';
        _copyText(val, e.target);
      }
      if (e.target.id === 'ps-copy-all') _copyAll();
      if (e.target.matches('.pstudio-img-dl-btn')) _downloadImage(e.target.dataset.url, e.target.dataset.name);
    });
  }

  /* ── File handling ─────────────────────────────────────────── */
  function _handleFiles(files) {
    const ALLOWED = ['image/jpeg','image/png','image/webp'];
    const MAX_MB  = 5;
    const MAX_CNT = 5;

    files.forEach(file => {
      if (_uploadedFiles.length >= MAX_CNT) {
        _toast('Maximum 5 images allowed', 'warn'); return;
      }
      if (!ALLOWED.includes(file.type)) {
        _toast(`${file.name}: only JPG, PNG, WEBP allowed`, 'error'); return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        _toast(`${file.name}: must be under 5MB`, 'error'); return;
      }
      const id  = `img_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const url = URL.createObjectURL(file);
      _uploadedFiles.push(file);
      _previews.push({ id, url, file });
    });

    _renderPreviews();
  }

  function _removeImage(id) {
    const idx = _previews.findIndex(p => p.id === id);
    if (idx === -1) return;
    URL.revokeObjectURL(_previews[idx].url);
    _uploadedFiles.splice(idx, 1);
    _previews.splice(idx, 1);
    _renderPreviews();
  }

  function _renderPreviews() {
    const strip = document.getElementById('ps-preview-strip');
    if (!strip) return;
    if (!_previews.length) { strip.style.display = 'none'; strip.innerHTML = ''; return; }

    strip.style.display = 'flex';
    strip.innerHTML = _previews.map(p => `
      <div class="pstudio-thumb" id="thumb-${p.id}">
        <img src="${p.url}" alt="Product image preview" class="pstudio-thumb-img"/>
        <button class="pstudio-thumb-rm" data-id="${p.id}" title="Remove">×</button>
      </div>`).join('') +
      (_previews.length < 5 ? `
        <div class="pstudio-thumb pstudio-thumb-add" id="ps-add-more">
          <span style="font-size:22px;color:#9CA3AF">+</span>
          <span style="font-size:10px;color:#9CA3AF;margin-top:2px">Add</span>
        </div>` : '');

    strip.querySelectorAll('.pstudio-thumb-rm').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); _removeImage(btn.dataset.id); });
    });
    const addMore = strip.querySelector('#ps-add-more');
    if (addMore) addMore.addEventListener('click', () => document.getElementById('ps-file-input').click());
  }

  /* ── GENERATE ──────────────────────────────────────────────── */
  async function _runStudio() {
    const name  = document.getElementById('ps-name')?.value.trim();
    const cat   = document.getElementById('ps-cat')?.value;
    const feats = document.getElementById('ps-feats')?.value.trim();
    const lang  = document.getElementById('ps-lang')?.value || 'en';

    if (!name)  { _shake('ps-name');  _toast('Enter a product name', 'error'); return; }
    if (!cat)   { _shake('ps-cat');   _toast('Select a category',    'error'); return; }

    _setGenerating(true);

    const formData = new FormData();
    formData.append('productName', name);
    formData.append('category',    cat);
    formData.append('language',    lang);
    formData.append('generateImages', 'true');

    const features = feats ? feats.split(',').map(f => f.trim()).filter(Boolean) : [];
    features.forEach(f => formData.append('features', f));
    _uploadedFiles.forEach(file => formData.append('images', file));

    _progressSteps([
      { label: 'Analysing product images…',    pct: 15 },
      { label: 'Building AI prompts…',         pct: 30 },
      { label: 'Generating product photos…',   pct: 55 },
      { label: 'Writing SEO description…',     pct: 80 },
      { label: 'Assembling your studio…',      pct: 95 },
    ]);

    try {
      const res = await fetch(`${AI_BASE}/product-studio`, {
        method: 'POST',
        body:   formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 400 && err.safe === false) {
          throw new Error('Image rejected: ' + (err.reason || 'unsafe content detected'));
        }
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      _progressDone();
      _renderResults(data);
    } catch (err) {
      _progressDone();
      _showError(err.message || 'Generation failed. Please try again.');
    } finally {
      _setGenerating(false);
    }
  }

  /* ── Progress simulation ───────────────────────────────────── */
  let _progressTimer = null;
  function _progressSteps(steps) {
    const bar   = document.getElementById('ps-progress-fill');
    const label = document.getElementById('ps-progress-steps');
    const prog  = document.getElementById('ps-progress');
    if (!prog) return;
    prog.style.display = 'block';
    if (bar) bar.style.width = '5%';

    let i = 0;
    _progressTimer && clearInterval(_progressTimer);
    _progressTimer = setInterval(() => {
      if (i >= steps.length) { clearInterval(_progressTimer); return; }
      const s = steps[i++];
      if (bar)   bar.style.width   = s.pct + '%';
      if (label) label.textContent = s.label;
    }, 1800);
  }
  function _progressDone() {
    clearInterval(_progressTimer);
    const bar   = document.getElementById('ps-progress-fill');
    const label = document.getElementById('ps-progress-steps');
    if (bar)   bar.style.width   = '100%';
    if (label) label.textContent = 'Done!';
    setTimeout(() => {
      const prog = document.getElementById('ps-progress');
      if (prog) prog.style.display = 'none';
    }, 700);
  }

  /* ── Render results ────────────────────────────────────────── */
  function _renderResults(data) {
    const empty   = document.getElementById('ps-empty-state');
    const results = document.getElementById('ps-results');
    if (empty)   empty.style.display   = 'none';
    if (results) results.style.display = 'block';

    /* Marketing banner */
    const banner = document.getElementById('ps-marketing-banner');
    if (banner && data.marketingLine) {
      banner.textContent    = '✦ ' + data.marketingLine;
      banner.style.display  = 'block';
    } else if (banner) {
      banner.style.display = 'none';
    }

    /* Images */
    _renderImageGrid(data.images);

    /* Content */
    _setText('ps-out-title', data.title || '');
    _setText('ps-out-desc',  data.description || '');

    const hlList = document.getElementById('ps-out-hl');
    if (hlList) {
      hlList.innerHTML = (data.highlights || []).map(h =>
        `<li class="pstudio-hl-item"><span class="pstudio-hl-check">✓</span>${_esc(h)}</li>`
      ).join('');
    }

    const tagsRow = document.getElementById('ps-out-tags');
    if (tagsRow) {
      tagsRow.innerHTML = (data.tags || data.seoTags || []).map(t =>
        `<span class="pstudio-tag">#${_esc(t)}</span>`
      ).join('');
    }

    const ctaCard = document.getElementById('ps-cta-card');
    const ctaVal  = document.getElementById('ps-out-cta');
    if (ctaVal && data.callToAction) {
      ctaVal.textContent      = data.callToAction;
      if (ctaCard) ctaCard.style.display = 'block';
    }

    /* Attributes chips */
    const attrRow = document.getElementById('ps-attr-row');
    if (attrRow) {
      const attrs = data.detectedAttributes || {};
      const chips = [
        attrs.category && { label: '📦 Category', val: attrs.category },
        attrs.color    && { label: '🎨 Color',    val: attrs.color },
        attrs.style    && { label: '✨ Style',     val: attrs.style },
        attrs.gender   && attrs.gender !== 'unisex' && { label: '👤 For',  val: attrs.gender },
        attrs.occasion && { label: '📅 Occasion', val: attrs.occasion },
      ].filter(Boolean);

      attrRow.innerHTML = chips.map(c =>
        `<div class="pstudio-attr-chip"><span class="pstudio-attr-lbl">${c.label}</span><span class="pstudio-attr-val">${_esc(c.val)}</span></div>`
      ).join('');
      attrRow.style.display = chips.length ? 'flex' : 'none';
    }

    /* Scroll to results */
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _renderImageGrid(images) {
    /* Virtual Try-On Coming Soon: image generation intentionally disabled */
    const imgCnt = document.getElementById('ps-img-count');
    if (imgCnt) imgCnt.textContent = '';
  }

  /* ── UI helpers ─────────────────────────────────────────────── */
  function _setGenerating(on) {
    const btn  = document.getElementById('ps-generate-btn');
    const txt  = document.getElementById('ps-btn-txt');
    if (!btn) return;
    btn.disabled = on;
    if (txt) txt.textContent = on ? 'Generating…' : 'Generate AI Product Studio';
    btn.classList.toggle('pstudio-generate-btn--loading', on);
  }

  function _showError(msg) {
    const results = document.getElementById('ps-results');
    const empty   = document.getElementById('ps-empty-state');
    if (empty) empty.style.display = 'none';
    if (results) {
      results.style.display = 'block';
      results.innerHTML = `
        <div class="pstudio-error">
          <span style="font-size:22px">⚠️</span>
          <div>
            <div style="font-weight:700;margin-bottom:4px">Generation Failed</div>
            <div style="font-size:13px;opacity:.8">${_esc(msg)}</div>
          </div>
          <button onclick="document.getElementById('ps-results').style.display='none';document.getElementById('ps-empty-state').style.display='flex'" class="pstudio-error-dismiss">Dismiss</button>
        </div>`;
    }
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function _shake(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('pstudio-shake');
    setTimeout(() => el.classList.remove('pstudio-shake'), 500);
  }
  function _copyText(text, btn) {
    navigator.clipboard?.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  }
  function _copyAll() {
    const title = document.getElementById('ps-out-title')?.textContent || '';
    const desc  = document.getElementById('ps-out-desc')?.textContent  || '';
    const hl    = [...(document.querySelectorAll('.pstudio-hl-item') || [])].map(el => '• ' + el.textContent.replace('✓','')).join('\n');
    const tags  = [...(document.querySelectorAll('.pstudio-tag') || [])].map(el => el.textContent).join(' ');
    const text  = [title, '', desc, '', hl, '', tags].filter(x => x!==undefined).join('\n');
    const btn   = document.getElementById('ps-copy-all');
    _copyText(text, btn);
  }
  function _downloadImage(url, name) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = name || 'retlify-image.jpg'; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function _toast(msg, type = 'info') {
    let toastEl = document.getElementById('ps-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'ps-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = `pstudio-toast pstudio-toast--${type} pstudio-toast--show`;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('pstudio-toast--show'), 3000);
  }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ══════════════════════════════════════════
  // STYLES
  // ══════════════════════════════════════════

  function _injectStyles() {
    if (document.getElementById('rly-ai-feat-styles')) return;
    const style = document.createElement('style');
    style.id = 'rly-ai-feat-styles';
    style.textContent = `
/* ─── ANALYTICS (unchanged) ───────────────────────────────────────── */
.ai-analytics-wrap{display:flex;flex-direction:column;gap:20px}
.ai-analytics-header{background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:24px 28px;color:#fff}
.ai-analytics-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,210,63,.15);border:1px solid rgba(255,210,63,.25);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#FFD23F;letter-spacing:.5px;margin-bottom:10px}
.ai-analytics-headline{font-family:'Outfit',sans-serif;font-size:18px;font-weight:900;letter-spacing:-.3px;margin-bottom:6px}
.ai-weekly-focus{font-size:12.5px;color:rgba(255,255,255,.5);padding:8px 12px;background:rgba(255,255,255,.04);border-radius:8px;border-left:3px solid #FFD23F}
.ai-insight-grid{display:grid;grid-template-columns:1fr;gap:10px}
.ai-insight-card{display:flex;gap:12px;background:var(--card-bg,#F9FAFB);border-radius:12px;padding:14px 16px;border:1px solid rgba(0,0,0,.06);transition:transform .2s}
.ai-insight-card:hover{transform:translateY(-2px)}
.ai-insight-icon{font-size:22px;flex-shrink:0;margin-top:1px}
.ai-insight-title{font-family:'Outfit',sans-serif;font-size:13.5px;font-weight:800;color:var(--card-color,#111827);margin-bottom:3px}
.ai-insight-desc{font-size:12.5px;color:#374151;line-height:1.55;margin-bottom:5px}
.ai-insight-action{font-size:12px;color:#6B7280;font-style:italic}
.ai-two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:600px){.ai-two-col{grid-template-columns:1fr}}
.ai-panel{background:#fff;border:1px solid #EBEBEB;border-radius:12px;padding:16px 18px}
.ai-panel-title{font-family:'Outfit',sans-serif;font-size:13px;font-weight:800;color:#111827;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #F3F4F6}
.ai-panel-sub-title{font-size:11.5px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-top:12px;margin-bottom:6px}
.ai-trend-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #F9FAFB;font-size:12.5px}
.ai-trend-row:last-child{border-bottom:none}
.ai-trend-name{flex:1;color:#374151;font-weight:500}
.ai-trend-demand{font-size:10.5px;font-weight:700;border-radius:20px;padding:2px 8px}
.ai-demand-high{background:#DCFCE7;color:#166534}
.ai-demand-very-high{background:#FEE2E2;color:#991B1B}
.ai-demand-medium{background:#FEF9C3;color:#713F12}
.ai-demand-seasonal{background:#EDE9FE;color:#4C1D95}
.ai-trend-pct{font-size:12px;font-weight:700;color:#059669;min-width:40px;text-align:right}
.ai-rec-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:7px}
.ai-rec-item{font-size:12.5px;color:#374151;line-height:1.5}
.ai-gap-item{font-size:12px;color:#6B7280;padding:4px 0;border-top:1px dashed #F3F4F6}
.ai-festivals{background:#fff;border:1px solid #EBEBEB;border-radius:12px;padding:16px 18px}
.ai-festival-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F9FAFB;font-size:13px}
.ai-festival-item:last-child{border-bottom:none}
.ai-festival-name{font-weight:700;color:#111827;flex:1}
.ai-festival-demand{font-size:12px;color:#6B7280;flex:2}
.ai-festival-urgency{font-size:10.5px;font-weight:700;border-radius:20px;padding:2px 9px}
.urgency-high{background:#FEE2E2;color:#991B1B}
.urgency-medium{background:#FEF9C3;color:#713F12}
.urgency-low{background:#F3F4F6;color:#374151}
.ai-analytics-footer{text-align:center;font-size:10.5px;color:#9CA3AF;padding-top:4px}
/* Shared loading */
.ai-loading-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:14px}
.ai-loading-spinner{width:36px;height:36px;border:3px solid #E5E7EB;border-top-color:#FFD23F;border-radius:50%;animation:rlySpinAI .8s linear infinite}
@keyframes rlySpinAI{to{transform:rotate(360deg)}}
.ai-loading-text{font-size:13px;color:#6B7280}
.ai-error{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px;font-size:13px;color:#DC2626;display:flex;align-items:center;gap:8px}
.ai-empty{font-size:12.5px;color:#9CA3AF;padding:8px 0}

/* ─── AI PRODUCT STUDIO ────────────────────────────────────────────── */

/* Root */
.pstudio-root{display:flex;flex-direction:column;gap:0;font-family:'DM Sans',sans-serif}

/* Header */
.pstudio-head{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:0 0 20px;border-bottom:1.5px solid #F3F4F6;margin-bottom:20px}
.pstudio-head-left{display:flex;flex-direction:column;gap:4px}
.pstudio-badge{display:inline-flex;align-items:center;gap:5px;background:linear-gradient(90deg,rgba(255,210,63,.18),rgba(255,180,0,.1));border:1px solid rgba(255,210,63,.4);border-radius:20px;padding:4px 13px;font-size:11px;font-weight:800;color:#B45309;letter-spacing:.6px;width:fit-content}
.pstudio-title{font-family:'Outfit',sans-serif;font-size:20px;font-weight:900;color:#111827;letter-spacing:-.3px;margin:4px 0 0}
.pstudio-sub{font-size:12.5px;color:#6B7280;margin:2px 0 0;line-height:1.5}
.pstudio-head-pills{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pstudio-pill{font-size:11px;font-weight:700;border-radius:20px;padding:4px 12px;letter-spacing:.2px}
.pstudio-pill-img{background:#EFF6FF;color:#1D4ED8}
.pstudio-pill-model{background:#F0FDF4;color:#166534}
.pstudio-pill-seo{background:#FFF7ED;color:#C2410C}

/* 2-col body */
.pstudio-body{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
@media(max-width:760px){.pstudio-body{grid-template-columns:1fr}}

/* Left panel */
.pstudio-left{display:flex;flex-direction:column;gap:13px;background:#FAFAFA;border:1.5px solid #F3F4F6;border-radius:16px;padding:20px 18px}
.pstudio-section-label{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#9CA3AF;margin-bottom:-4px}
.pstudio-field{display:flex;flex-direction:column;gap:5px}
.pstudio-label{font-size:12.5px;font-weight:700;color:#374151}
.pstudio-req{color:#EF4444}
.pstudio-opt{font-weight:400;color:#9CA3AF;font-size:11.5px}
.pstudio-input{padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:13.5px;color:#111827;outline:none;font-family:'DM Sans',sans-serif;transition:border-color .2s,box-shadow .2s;background:#fff}
.pstudio-input:focus{border-color:#FFD23F;box-shadow:0 0 0 3px rgba(255,210,63,.12)}
.pstudio-shake{animation:psShake .4s ease}
@keyframes psShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}

/* Upload zone */
.pstudio-upload-zone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:2px dashed #D1D5DB;border-radius:12px;padding:20px 16px;cursor:pointer;transition:border-color .2s,background .2s;background:#fff;text-align:center}
.pstudio-upload-zone:hover,.pstudio-upload-zone--drag{border-color:#FFD23F;background:rgba(255,210,63,.04)}
.pstudio-upload-icon{color:#9CA3AF;margin-bottom:2px;transition:color .2s}
.pstudio-upload-zone:hover .pstudio-upload-icon{color:#F59E0B}
.pstudio-upload-text{font-size:13px;font-weight:600;color:#374151}
.pstudio-upload-sub{font-size:12px;color:#9CA3AF}
.pstudio-upload-link{color:#F59E0B;font-weight:700;cursor:pointer}
.pstudio-upload-hint{font-size:11px;color:#C4C9D0;margin-top:3px}

/* Preview strip */
.pstudio-preview-strip{display:flex;gap:8px;flex-wrap:wrap;padding:4px 0}
.pstudio-thumb{position:relative;width:64px;height:64px;border-radius:9px;overflow:hidden;border:1.5px solid #E5E7EB;flex-shrink:0;transition:transform .15s}
.pstudio-thumb:hover{transform:scale(1.04)}
.pstudio-thumb-img{width:100%;height:100%;object-fit:cover}
.pstudio-thumb-rm{position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-weight:700}
.pstudio-thumb-rm:hover{background:#EF4444}
.pstudio-thumb-add{display:flex;flex-direction:column;align-items:center;justify-content:center;background:#F9FAFB;border:1.5px dashed #D1D5DB;cursor:pointer}
.pstudio-thumb-add:hover{border-color:#FFD23F;background:rgba(255,210,63,.05)}

/* Generate button */
.pstudio-generate-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:13px 20px;background:linear-gradient(135deg,#111827,#1F2937);color:#FFD23F;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;font-family:'Outfit',sans-serif;transition:all .2s;letter-spacing:.2px;box-shadow:0 4px 14px rgba(0,0,0,.18);margin-top:2px}
.pstudio-generate-btn:hover:not(:disabled){background:linear-gradient(135deg,#1F2937,#374151);transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.22)}
.pstudio-generate-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
.pstudio-btn-icon{font-size:16px;animation:none}
.pstudio-generate-btn--loading .pstudio-btn-icon{animation:psBtnSpin 1s linear infinite;display:inline-block}
@keyframes psBtnSpin{to{transform:rotate(360deg)}}

/* Progress */
.pstudio-progress{display:flex;flex-direction:column;gap:8px;padding:4px 0}
.pstudio-progress-bar{height:4px;background:#F3F4F6;border-radius:4px;overflow:hidden}
.pstudio-progress-fill{height:100%;background:linear-gradient(90deg,#FFD23F,#F59E0B);border-radius:4px;transition:width .8s ease;width:0%}
.pstudio-progress-steps{font-size:11.5px;color:#6B7280;text-align:center}

/* ── RIGHT PANEL ── */
.pstudio-right{background:#fff;border:1.5px solid #F3F4F6;border-radius:16px;min-height:380px;display:flex;flex-direction:column;overflow:hidden}

/* Empty state */
.pstudio-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:10px;flex:1;text-align:center}
.pstudio-empty-icon{font-size:44px;opacity:.35}
.pstudio-empty-title{font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;color:#374151}
.pstudio-empty-sub{font-size:12.5px;color:#9CA3AF;line-height:1.6;max-width:260px}
.pstudio-empty-features{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:280px;margin-top:8px}
.pstudio-ef-item{display:flex;align-items:center;gap:7px;background:#F9FAFB;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;color:#374151}
.pstudio-ef-item span{font-size:16px}

/* Results */
.pstudio-results{display:flex;flex-direction:column;gap:0;flex:1}
.pstudio-marketing-banner{padding:12px 18px;background:linear-gradient(90deg,#0f172a,#1e293b);color:#FFD23F;font-size:13px;font-weight:700;letter-spacing:.3px;display:none}

.pstudio-results-section{padding:16px 18px;border-bottom:1.5px solid #F3F4F6}
.pstudio-results-section:last-of-type{border-bottom:none}
.pstudio-results-section-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pstudio-rs-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#6B7280}
.pstudio-rs-meta{font-size:11px;color:#9CA3AF}

/* Image grid */
.pstudio-img-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
.pstudio-img-card{border-radius:10px;overflow:hidden;background:#F3F4F6;aspect-ratio:1;animation:psFadeUp .4s ease both}
@keyframes psFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.pstudio-img-card--error{opacity:.4}
.pstudio-img-wrap{position:relative;width:100%;height:100%;overflow:hidden}
.pstudio-img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.pstudio-img-card:hover .pstudio-img{transform:scale(1.06)}
.pstudio-img-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55) 0%,transparent 50%);opacity:0;transition:opacity .2s;display:flex;align-items:flex-end;justify-content:space-between;padding:7px 8px}
.pstudio-img-card:hover .pstudio-img-overlay{opacity:1}
.pstudio-img-type-badge{font-size:9px;font-weight:700;color:rgba(255,255,255,.9);letter-spacing:.3px;text-transform:uppercase;max-width:70px;line-height:1.2}
.pstudio-img-dl-btn{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:6px;padding:4px 6px;cursor:pointer;display:flex;align-items:center;gap:3px;font-size:10px;font-weight:600;transition:background .15s;flex-shrink:0}
.pstudio-img-dl-btn:hover{background:rgba(255,255,255,.35)}
.pstudio-no-img{font-size:12.5px;color:#9CA3AF;text-align:center;padding:18px 10px;line-height:1.8}

/* Content cards */
.pstudio-copy-all-btn{font-size:11.5px;font-weight:700;color:#374151;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:7px;padding:4px 12px;cursor:pointer;transition:all .15s}
.pstudio-copy-all-btn:hover{border-color:#FFD23F;background:#FFFBEB}
.pstudio-content-card{position:relative;padding:12px 14px;background:#FAFAFA;border:1px solid #F3F4F6;border-radius:10px;margin-bottom:8px}
.pstudio-content-card:last-child{margin-bottom:0}
.pstudio-content-lbl{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#9CA3AF;margin-bottom:5px}
.pstudio-content-val{font-size:13.5px;color:#111827;line-height:1.65;padding-right:56px}
.pstudio-copy-mini{position:absolute;top:10px;right:10px;font-size:11px;font-weight:700;color:#6B7280;background:#fff;border:1px solid #E5E7EB;border-radius:6px;padding:3px 9px;cursor:pointer;transition:all .15s}
.pstudio-copy-mini:hover{background:#FEF3C7;border-color:#FCD34D;color:#92400E}
.pstudio-hl-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px}
.pstudio-hl-item{display:flex;align-items:flex-start;gap:7px;font-size:13px;color:#374151;line-height:1.5}
.pstudio-hl-check{color:#10B981;font-weight:900;flex-shrink:0;margin-top:1px}
.pstudio-tags-row{display:flex;flex-wrap:wrap;gap:6px}
.pstudio-tag{background:#EFF6FF;color:#1D4ED8;border-radius:20px;padding:3px 11px;font-size:11.5px;font-weight:700}
.pstudio-cta-val{font-size:13.5px;font-weight:700;color:#059669;font-style:italic}

/* Attribute chips */
.pstudio-attr-row{display:flex;flex-wrap:wrap;gap:6px;padding:14px 18px;border-top:1.5px solid #F3F4F6}
.pstudio-attr-chip{display:flex;align-items:center;gap:5px;background:#F3F4F6;border-radius:20px;padding:4px 11px;font-size:11px}
.pstudio-attr-lbl{color:#9CA3AF;font-weight:600}
.pstudio-attr-val{color:#111827;font-weight:700;text-transform:capitalize}

/* Virtual Try-On Coming Soon */
.vto-section{padding:0!important;border-bottom:1.5px solid #F3F4F6}
.vto-card{position:relative;overflow:hidden;background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f2027 100%);border-radius:0;padding:2.2rem 1.5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:0.75rem;min-height:420px}
.vto-particles{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.vto-p{position:absolute;border-radius:50%}
.vto-p1{width:3px;height:3px;left:12%;top:18%;background:#facc15;opacity:.35;animation:vtoParticle 5s 0s ease-in-out infinite alternate}
.vto-p2{width:2px;height:2px;left:80%;top:12%;background:#fb923c;opacity:.28;animation:vtoParticle 4.2s 1s ease-in-out infinite alternate}
.vto-p3{width:4px;height:4px;left:65%;top:72%;background:#facc15;opacity:.22;animation:vtoParticle 6s 0.5s ease-in-out infinite alternate}
.vto-p4{width:2px;height:2px;left:25%;top:80%;background:rgba(255,255,255,.6);opacity:.25;animation:vtoParticle 4.8s 2s ease-in-out infinite alternate}
.vto-p5{width:3px;height:3px;left:90%;top:45%;background:#facc15;opacity:.3;animation:vtoParticle 5.5s 0.8s ease-in-out infinite alternate}
.vto-p6{width:2px;height:2px;left:40%;top:8%;background:#fb923c;opacity:.2;animation:vtoParticle 4s 1.5s ease-in-out infinite alternate}
.vto-p7{width:3px;height:3px;left:8%;top:55%;background:rgba(255,255,255,.5);opacity:.18;animation:vtoParticle 6.5s 0.3s ease-in-out infinite alternate}
.vto-p8{width:2px;height:2px;left:55%;top:90%;background:#facc15;opacity:.25;animation:vtoParticle 5.2s 2.2s ease-in-out infinite alternate}
@keyframes vtoParticle{0%{transform:translateY(0) translateX(0)}100%{transform:translateY(-14px) translateX(7px)}}
.vto-rings{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.vto-ring{position:absolute;border-radius:50%;border:1px solid rgba(250,204,21,.14);animation:vtoRing 5s ease-in-out infinite}
.vto-ring1{width:180px;height:180px;animation-delay:0s}
.vto-ring2{width:270px;height:270px;border-color:rgba(250,204,21,.07);animation-delay:.9s}
.vto-ring3{width:370px;height:370px;border-color:rgba(250,204,21,.04);animation-delay:1.8s}
@keyframes vtoRing{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(1.04);opacity:.15}}
.vto-badge{position:relative;z-index:10;display:inline-flex;align-items:center;gap:.4rem;background:linear-gradient(90deg,#facc15 0%,#fbbf24 50%,#facc15 100%);background-size:200% auto;color:#000;padding:.28rem .9rem;border-radius:9999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;animation:vtoBadgeShimmer 3s linear infinite}
@keyframes vtoBadgeShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
.vto-badge-dot{width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,.45);display:inline-block}
.vto-orb-wrap{position:relative;width:96px;height:96px;display:flex;align-items:center;justify-content:center;z-index:10;margin:.4rem 0}
.vto-outer-glow{position:absolute;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(250,204,21,.22) 0%,transparent 70%);animation:vtoOuterGlow 4s ease-in-out infinite}
@keyframes vtoOuterGlow{0%,100%{opacity:.15;transform:scale(1)}50%{opacity:.3;transform:scale(1.08)}}
.vto-mid-glow{position:absolute;width:88px;height:88px;border-radius:50%;background:radial-gradient(circle,rgba(251,146,60,.5) 0%,rgba(250,204,21,.3) 50%,transparent 80%);filter:blur(22px);opacity:.55;animation:vtoMidGlow 4s ease-in-out infinite}
@keyframes vtoMidGlow{0%,100%{opacity:.55;filter:blur(22px)}50%{opacity:.85;filter:blur(16px)}}
.vto-orb{position:relative;width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#facc15 0%,#fb923c 55%,#ef4444 100%);display:flex;align-items:center;justify-content:center;z-index:5;box-shadow:0 0 36px 10px rgba(250,204,21,.45),0 0 70px 25px rgba(251,146,60,.2);animation:vtoFloat 4s ease-in-out infinite}
@keyframes vtoFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-12px) scale(1.06)}}
.vto-orb-highlight{position:absolute;top:13%;left:17%;width:38%;height:28%;border-radius:50%;background:rgba(255,255,255,.32);filter:blur(5px);transform:rotate(-25deg)}
.vto-orb-icon{font-size:1.5rem;color:rgba(0,0,0,.5);position:relative;z-index:1}
.vto-title{position:relative;z-index:10;font-family:'Outfit',sans-serif;font-size:clamp(1.2rem,2.5vw,1.7rem);font-weight:800;letter-spacing:-.03em;line-height:1.15;background:linear-gradient(135deg,#fff 0%,#facc15 50%,#fb923c 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;animation:vtoFadeUp .6s ease both .1s}
.vto-desc{position:relative;z-index:10;font-size:12.5px;color:rgba(255,255,255,.58);line-height:1.65;max-width:300px;margin:0;animation:vtoFadeUp .6s ease both .2s}
.vto-divider{width:40px;height:2px;background:linear-gradient(90deg,transparent,rgba(250,204,21,.5),transparent);border-radius:2px}
.vto-sub{position:relative;z-index:10;font-size:11.5px;color:rgba(255,255,255,.32);line-height:1.55;max-width:260px;margin:0;animation:vtoFadeUp .6s ease both .35s}
.vto-pills{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;position:relative;z-index:10;animation:vtoFadeUp .6s ease both .45s}
.vto-pill{font-size:10px;font-weight:700;padding:.28rem .65rem;border-radius:9999px;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.2);color:rgba(250,204,21,.85);letter-spacing:.02em}
.vto-btn{position:relative;z-index:10;display:inline-flex;align-items:center;gap:.4rem;background:#facc15;color:#000;font-family:'Outfit',sans-serif;font-weight:800;font-size:13px;padding:.6rem 1.4rem;border-radius:9999px;border:none;cursor:pointer;letter-spacing:.02em;transition:transform .2s ease,box-shadow .2s ease;animation:vtoFadeUp .6s ease both .55s;margin-top:.2rem}
.vto-btn:hover{transform:scale(1.06) translateY(-1px);box-shadow:0 8px 26px rgba(250,204,21,.45)}
.vto-btn:active{transform:scale(.97)}
.vto-btn-icon{font-size:.95rem;line-height:1}
@keyframes vtoFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

/* Remove old image grid styles (kept for safety, zeroed out) */
.pstudio-img-grid{display:none!important}
.pstudio-no-img{display:none!important}
`;
    document.head.appendChild(style);
  }

  _injectStyles();

  root.RetlifyAI = { initAnalytics, initDescriptionGenerator };

})(typeof window !== 'undefined' ? window : {});
