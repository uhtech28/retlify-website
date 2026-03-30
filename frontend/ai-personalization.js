/**
 * Retlify AI Personalization Engine — Frontend Module
 * =====================================================
 * Tracks user behavior in localStorage and syncs to backend on login.
 * Renders "Recommended for you", "Trending near you", and "People also searched" sections.
 * Upgrades search dropdown with recent searches + trending + personalized suggestions.
 *
 * Usage (in dashboard.html, after ai-search.js and ai-chat.js):
 *   <script src="ai-personalization.js"></script>
 *   <script>
 *     RetlifyPersonalization.init({
 *       userId: 'user123',       // from auth session (optional — works for guests too)
 *       city: 'Jaipur',
 *       mode: 'customer',        // 'customer' | 'shopkeeper'
 *     });
 *   </script>
 *
 * The module:
 *   1. Tracks searches/clicks/views into localStorage
 *   2. Syncs to backend when userId is available
 *   3. Injects recommendation UI sections into the page
 *   4. Upgrades RetlifyAISearch with personalized context
 *   5. Upgrades RetlifyChat with user history context
 */

(function (root) {
  'use strict';

  const AI_BASE     = '/api/ai';
  const LS_KEY      = 'retlify_behavior_v2';
  const LS_PREFS    = 'retlify_prefs_v2';
  const MAX_EVENTS  = 200;

  let _userId       = null;
  let _city         = '';
  let _mode         = 'customer';
  let _initialized  = false;
  let _syncTimer    = null;

  /* ══════════════════════════════════════════════════════════
     1. LOCAL STORAGE BEHAVIOR TRACKING
  ══════════════════════════════════════════════════════════ */

  function _loadStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { return {}; }
  }

  function _saveStore(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch { /* storage full – ignore */ }
  }

  function _getProfile() {
    return _loadStore();
  }

  function _appendEvent(type, payload) {
    const store = _loadStore();
    if (!store.events) store.events = [];
    store.events.push({ type, ...payload, timestamp: Date.now() });
    // Keep only the most recent MAX_EVENTS
    if (store.events.length > MAX_EVENTS) store.events.splice(0, store.events.length - MAX_EVENTS);
    _saveStore(store);
  }

  /* ── Category detector ───────────────────────────────── */
  const CAT_MAP = {
    footwear:    ['shoes','sandals','chappals','sneakers','boots','heels','mojari','footwear'],
    clothing:    ['kurti','saree','lehenga','jeans','shirt','dress','kapde','ethnic','top','kurta'],
    electronics: ['mobile','phone','headphones','earphones','laptop','tv','charger','earbuds'],
    grocery:     ['atta','dal','chawal','sabzi','vegetables','fruits','grocery','masala'],
    jewellery:   ['gold','silver','jewellery','necklace','ring','bangle','earring'],
    toys:        ['toys','kids','children','game','doll'],
    beauty:      ['cosmetics','makeup','beauty','skincare','lipstick'],
    fitness:     ['gym','fitness','sports','exercise','yoga','dumbbell'],
  };

  function _detectCategory(text) {
    const q = (text || '').toLowerCase();
    for (const [cat, kws] of Object.entries(CAT_MAP)) {
      if (kws.some(k => q.includes(k))) return cat;
    }
    return 'general';
  }

  /* ── Category score calculator ───────────────────────── */
  function _getCategoryScores() {
    const store = _loadStore();
    const events = store.events || [];
    const scores = {};
    const WEIGHTS = { search: 1, click: 2, view: 1.5, purchase: 5 };
    const now = Date.now();

    for (const evt of events) {
      const cat = evt.category || _detectCategory(evt.query || evt.product?.name || '');
      if (!cat || cat === 'general') continue;
      const ageDays = (now - evt.timestamp) / (1000 * 60 * 60 * 24);
      const decay   = Math.exp(-ageDays / 7); // 7-day half-life
      scores[cat]   = (scores[cat] || 0) + (WEIGHTS[evt.type] || 1) * decay;
    }
    return scores;
  }

  function _getTopCategories(n = 3) {
    return Object.entries(_getCategoryScores())
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([cat]) => cat);
  }

  function _getRecentSearches(n = 10) {
    const store  = _loadStore();
    const events = (store.events || []).filter(e => e.type === 'search');
    const seen   = new Set();
    const result = [];
    for (let i = events.length - 1; i >= 0 && result.length < n; i--) {
      const q = events[i].query;
      if (q && !seen.has(q)) { seen.add(q); result.push(q); }
    }
    return result;
  }

  /* ── Public tracking API ─────────────────────────────── */

  function trackSearch(query) {
    if (!query) return;
    const category = _detectCategory(query);
    _appendEvent('search', { query: query.toLowerCase().trim(), category, city: _city });
    _scheduleSyncToBackend();
  }

  function trackClick(product) {
    if (!product) return;
    const category = product.category || _detectCategory(product.name || '');
    _appendEvent('click', { product: { id: product.id, name: product.name, category }, category });
    _scheduleSyncToBackend();
  }

  function trackView(product, durationMs = 0) {
    if (!product) return;
    const category = product.category || _detectCategory(product.name || '');
    _appendEvent('view', { product: { id: product.id, name: product.name, category }, durationMs, category });
    _scheduleSyncToBackend();
  }

  function trackPurchase(product) {
    if (!product) return;
    const category = product.category || _detectCategory(product.name || '');
    _appendEvent('purchase', { product: { id: product.id, name: product.name, category }, category });
    _scheduleSyncToBackend();
  }

  /* ── Backend sync ────────────────────────────────────── */

  function _scheduleSyncToBackend() {
    if (!_userId) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_syncToBackend, 5000); // batch within 5s
  }

  async function _syncToBackend() {
    if (!_userId) return;
    const store = _loadStore();
    const events = store.events || [];
    if (!events.length) return;

    try {
      await fetch(`${AI_BASE}/user/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: _userId, events }),
      });
    } catch { /* fail silently */ }
  }

  /* ══════════════════════════════════════════════════════════
     2. PERSONALIZATION CONTEXT BUILDER
  ══════════════════════════════════════════════════════════ */

  function buildContext() {
    return {
      userId:         _userId,
      city:           _city,
      topCategories:  _getTopCategories(3),
      recentSearches: _getRecentSearches(5),
    };
  }

  /* ══════════════════════════════════════════════════════════
     3. RECOMMENDATION SECTIONS UI
  ══════════════════════════════════════════════════════════ */

  /**
   * Inject "Recommended for you" section before a target element.
   * @param {string} targetSelector - CSS selector of the element to inject before
   */
  async function injectRecommendationsSection(targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const wrapper = _createElement('div', 'rly-recs-section');
    wrapper.innerHTML = _recLoadingHTML();
    target.parentElement.insertBefore(wrapper, target);

    try {
      const ctx   = buildContext();
      const res   = await fetch(`${AI_BASE}/recommendations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city: _city, userId: _userId, query: ctx.recentSearches[0] || '' }),
      });
      if (!res.ok) throw new Error('API error');
      const data  = await res.json();
      wrapper.innerHTML = _renderRecommendations(data);
      _bindRecClicks(wrapper);
    } catch {
      wrapper.remove(); // quietly hide on error
    }
  }

  function _recLoadingHTML() {
    return `<div class="rly-recs-loading"><span class="rly-recs-spin"></span><span>Loading recommendations…</span></div>`;
  }

  function _renderRecommendations({ recommended, trending }) {
    if (!recommended?.items?.length && !trending?.items?.length) return '';

    const recCards = (recommended?.items || []).map(item => `
      <div class="rly-rec-card" data-name="${_esc(item.name)}" data-category="${_esc(item.category || '')}">
        <div class="rly-rec-icon">${_categoryIcon(item.category)}</div>
        <div class="rly-rec-body">
          <div class="rly-rec-name">${_esc(item.name)}</div>
          <div class="rly-rec-reason">${_esc(item.reason || '')}</div>
        </div>
        <div class="rly-rec-meta">
          <span class="rly-rec-trend">${_esc(item.trend || '')}</span>
          <span class="rly-conf-badge" title="AI confidence">${Math.round((item.confidence || 0.7) * 100)}%</span>
        </div>
      </div>
    `).join('');

    const trendCards = (trending?.items || []).slice(0, 4).map(item => `
      <div class="rly-trend-card" data-name="${_esc(item.name)}" data-category="${_esc(item.category || '')}">
        <div class="rly-trend-badge">${_esc(item.trend || '')}</div>
        <div class="rly-trend-icon">${_categoryIcon(item.category)}</div>
        <div class="rly-trend-name">${_esc(item.name)}</div>
        <span class="rly-conf-badge rly-conf-sm" title="AI confidence">${Math.round((item.confidence || 0.7) * 100)}%</span>
      </div>
    `).join('');

    return `
      <div class="rly-recs-wrap">
        ${recCards ? `
          <div class="rly-recs-row">
            <div class="rly-recs-header">
              <span class="rly-ai-badge">✦ AI</span>
              <span class="rly-recs-title">Recommended for you</span>
              <span class="rly-recs-sub">${recommended?.source === 'personalized' ? 'Based on your activity' : 'Popular near ' + (_city || 'you')}</span>
            </div>
            <div class="rly-rec-list">${recCards}</div>
          </div>
        ` : ''}

        ${trendCards ? `
          <div class="rly-recs-row rly-trending-row">
            <div class="rly-recs-header">
              <span class="rly-ai-badge rly-ai-badge-fire">🔥</span>
              <span class="rly-recs-title">Trending near ${_esc(_city || 'you')}</span>
              <span class="rly-recs-sub">${_esc(trending?.headline || 'Hot picks this week')}</span>
            </div>
            <div class="rly-trend-list">${trendCards}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function _bindRecClicks(wrapper) {
    wrapper.querySelectorAll('.rly-rec-card, .rly-trend-card').forEach(card => {
      card.addEventListener('click', () => {
        const name     = card.dataset.name || '';
        const category = card.dataset.category || '';
        trackClick({ name, category });

        // Auto-fill search if input is on page
        const searchInput = document.querySelector('#search-input, .srch-inp, [data-ai-search], input[type="search"]');
        if (searchInput) {
          searchInput.value = name;
          searchInput.dispatchEvent(new Event('input'));
          searchInput.focus();
        }
      });
    });
  }

  /* ── People also searched bubble ─────────────────────── */
  async function injectAlsoSearched(containerSelector, baseQuery) {
    const container = document.querySelector(containerSelector);
    if (!container || !baseQuery) return;

    try {
      const res  = await fetch(`${AI_BASE}/recommendations/also?q=${encodeURIComponent(baseQuery)}&userId=${_userId || ''}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.terms?.length) return;

      const el = _createElement('div', 'rly-also-wrap');
      el.innerHTML = `
        <span class="rly-also-label">👥 People also searched:</span>
        ${data.terms.map(t => `<button class="rly-also-tag" data-term="${_esc(t)}">${_esc(t)}</button>`).join('')}
        <span class="rly-conf-badge rly-conf-sm">${Math.round((data.confidence || 0.7) * 100)}%</span>
      `;
      container.appendChild(el);

      el.querySelectorAll('.rly-also-tag').forEach(btn => {
        btn.addEventListener('click', () => {
          trackSearch(btn.dataset.term);
          const input = document.querySelector('#search-input, .srch-inp, [data-ai-search], input[type="search"]');
          if (input) { input.value = btn.dataset.term; input.dispatchEvent(new Event('input')); input.focus(); }
        });
      });
    } catch { /* fail silently */ }
  }

  /* ══════════════════════════════════════════════════════════
     4. SEARCH UPGRADE — recent searches + personalized drops
  ══════════════════════════════════════════════════════════ */

  /**
   * Upgrade RetlifyAISearch dropdown to include recent + personalized searches.
   * Call after RetlifyAISearch.init().
   */
  function upgradeSearchDropdown(inputSelector) {
    const input = typeof inputSelector === 'string'
      ? document.querySelector(inputSelector)
      : inputSelector;
    if (!input) return;

    const originalOnSearch = input._rlyOnSearch;

    // Intercept form submit to track
    const form = input.closest('form');
    if (form && !form._rlyPersonalized) {
      form._rlyPersonalized = true;
      form.addEventListener('submit', () => {
        const q = input.value.trim();
        if (q) trackSearch(q);
      });
    }

    // Intercept input changes to track
    input.addEventListener('change', () => {
      const q = input.value.trim();
      if (q) trackSearch(q);
    });

    // Patch the dropdown open to show recent searches when empty
    input.addEventListener('focus', () => {
      if (!input.value.trim()) {
        _showPersonalizedTrending(input);
      }
    });
  }

  function _showPersonalizedTrending(input) {
    const dropdown = input.parentElement?.querySelector('.ai-srch-drop');
    if (!dropdown || dropdown.classList.contains('open')) return;

    const recentSearches = _getRecentSearches(5);
    if (!recentSearches.length) return; // let existing trending logic handle empty state

    // Inject recent searches section at top of dropdown
    const existing = dropdown.querySelector('.rly-recent-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'rly-recent-section';
    section.innerHTML = `
      <div class="ai-srch-cat"><span class="ai-powered-badge">🕐 Recent Searches</span></div>
      ${recentSearches.map(s => `
        <div class="ai-srch-item rly-recent-item" data-query="${_esc(s)}">
          <span class="ai-srch-item-icon">🕐</span>
          <span>${_esc(s)}</span>
          <span class="ai-srch-item-arr">↗</span>
        </div>
      `).join('')}
    `;
    dropdown.prepend(section);

    section.querySelectorAll('.rly-recent-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = item.dataset.query;
        dropdown.classList.remove('open');
        trackSearch(item.dataset.query);
        input.dispatchEvent(new Event('change'));
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     5. CHATBOT CONTEXT UPGRADE
  ══════════════════════════════════════════════════════════ */

  /**
   * Upgrade RetlifyChat to pass user context in every message.
   * Call after RetlifyChat.init().
   */
  function upgradeChatContext() {
    if (typeof root.RetlifyChat === 'undefined') return;

    const ctx = buildContext();
    // The chatbot already accepts context in init — re-initialize with richer context
    // We patch the internal _context object if accessible, otherwise context is
    // passed at chat route level via userId header
    if (root.RetlifyChat._setContext) {
      root.RetlifyChat._setContext(ctx);
    }
  }

  /* ══════════════════════════════════════════════════════════
     6. TRENDING ALERTS BANNER
  ══════════════════════════════════════════════════════════ */

  async function injectTrendAlerts(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    try {
      const res  = await fetch(`${AI_BASE}/trends/detect`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ city: _city }),
      });
      if (!res.ok) return;
      const { alerts } = await res.json();
      const high = alerts.filter(a => a.urgency === 'High').slice(0, 3);
      if (!high.length) return;

      const banner = _createElement('div', 'rly-trend-alerts');
      banner.innerHTML = `
        <div class="rly-trend-alerts-header">
          <span class="rly-ai-badge">✦ AI</span>
          <span>Demand spikes in ${_esc(_city || 'your area')}</span>
          <button class="rly-alerts-close">✕</button>
        </div>
        ${high.map(a => `
          <div class="rly-alert-row rly-alert-${a.urgency?.toLowerCase() || 'medium'}">
            <span class="rly-alert-dot"></span>
            <span>${_esc(a.message)}</span>
            <span class="rly-conf-badge rly-conf-sm">${Math.round((a.confidence || 0.7) * 100)}%</span>
          </div>
        `).join('')}
      `;
      container.appendChild(banner);
      banner.querySelector('.rly-alerts-close')?.addEventListener('click', () => banner.remove());
    } catch { /* fail silently */ }
  }

  /* ══════════════════════════════════════════════════════════
     7. AI CONFIDENCE BADGE HELPER
  ══════════════════════════════════════════════════════════ */

  /**
   * Add a confidence badge to any AI-generated element.
   * RetlifyPersonalization.addConfidenceBadge(element, 0.87)
   */
  function addConfidenceBadge(el, confidence = 0.7) {
    if (!el) return;
    const existing = el.querySelector('.rly-conf-badge');
    if (existing) existing.remove();
    const badge = document.createElement('span');
    badge.className = 'rly-conf-badge';
    badge.title     = `AI confidence: ${Math.round(confidence * 100)}%`;
    badge.textContent = `${Math.round(confidence * 100)}%`;
    el.appendChild(badge);
  }

  /* ══════════════════════════════════════════════════════════
     8. INIT
  ══════════════════════════════════════════════════════════ */

  /**
   * Initialize the personalization engine.
   * @param {object} opts - { userId, city, mode, searchSelector, chatTarget, recommendationsTarget }
   */
  function init(opts = {}) {
    if (_initialized) return;
    _initialized = true;

    _userId = opts.userId || null;
    _city   = opts.city   || '';
    _mode   = opts.mode   || 'customer';

    // Persist city to prefs
    try {
      const prefs = JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
      if (_city) prefs.city = _city;
      if (_userId) prefs.userId = _userId;
      localStorage.setItem(LS_PREFS, JSON.stringify(prefs));
    } catch {}

    // Restore city from prefs if not provided
    if (!_city) {
      try {
        const prefs = JSON.parse(localStorage.getItem(LS_PREFS) || '{}');
        _city = prefs.city || '';
      } catch {}
    }

    // Upgrade search dropdown if selector provided
    if (opts.searchSelector) {
      // Wait a tick for RetlifyAISearch to have initialized
      setTimeout(() => upgradeSearchDropdown(opts.searchSelector), 200);
    }

    // Upgrade chatbot context
    setTimeout(upgradeChatContext, 300);

    // Sync existing localStorage events to backend (if logged in)
    if (_userId) {
      setTimeout(_syncToBackend, 2000);
    }

    // Inject recommendation sections
    if (opts.recommendationsTarget && _mode === 'customer') {
      setTimeout(() => injectRecommendationsSection(opts.recommendationsTarget), 500);
    }

    // Inject trend alerts
    if (opts.alertsTarget) {
      setTimeout(() => injectTrendAlerts(opts.alertsTarget), 800);
    }

    // Inject styles
    _injectStyles();
  }

  /* ══════════════════════════════════════════════════════════
     9. STYLES
  ══════════════════════════════════════════════════════════ */

  function _injectStyles() {
    if (document.getElementById('rly-personalization-styles')) return;
    const style  = document.createElement('style');
    style.id     = 'rly-personalization-styles';
    style.textContent = `
/* ── Recommendation section ── */
.rly-recs-section{margin:18px 0 10px}
.rly-recs-loading{display:flex;align-items:center;gap:10px;padding:14px;color:#9CA3AF;font-size:13px}
.rly-recs-spin{width:16px;height:16px;border:2px solid #E5E7EB;border-top-color:#FFD23F;border-radius:50%;animation:rlySpin .7s linear infinite;flex-shrink:0}
@keyframes rlySpin{to{transform:rotate(360deg)}}
.rly-recs-wrap{display:flex;flex-direction:column;gap:18px}
.rly-recs-row{background:#fff;border:1.5px solid #F3F4F6;border-radius:16px;padding:16px;box-shadow:0 2px 12px rgba(0,0,0,.04)}
.rly-trending-row{background:linear-gradient(135deg,#FFF9EB,#FFFBF5)}
.rly-recs-header{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.rly-recs-title{font-size:14px;font-weight:700;color:#111827}
.rly-recs-sub{font-size:11.5px;color:#9CA3AF;margin-left:auto}

/* ── AI badge ── */
.rly-ai-badge{display:inline-flex;align-items:center;background:linear-gradient(90deg,#FFD23F22,#6366f122);border:1px solid #FFD23F55;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:800;color:#92400e;letter-spacing:.4px}
.rly-ai-badge-fire{background:linear-gradient(90deg,#FEF3C7,#FEE2E2);border-color:#FCA5A5}

/* ── Recommended cards ── */
.rly-rec-list{display:flex;flex-direction:column;gap:6px}
.rly-rec-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:all .15s;border:1px solid transparent}
.rly-rec-card:hover{background:#F9FAFB;border-color:#E5E7EB;transform:translateX(3px)}
.rly-rec-icon{font-size:20px;flex-shrink:0;width:36px;height:36px;background:#F3F4F6;border-radius:8px;display:flex;align-items:center;justify-content:center}
.rly-rec-body{flex:1;min-width:0}
.rly-rec-name{font-size:13.5px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rly-rec-reason{font-size:11px;color:#9CA3AF;margin-top:2px}
.rly-rec-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.rly-rec-trend{font-size:11px;font-weight:700;color:#059669}

/* ── Trending cards ── */
.rly-trend-list{display:flex;gap:8px;flex-wrap:wrap}
.rly-trend-card{flex:1;min-width:120px;max-width:180px;background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:12px 10px;cursor:pointer;transition:all .15s;position:relative;text-align:center}
.rly-trend-card:hover{border-color:#FFD23F;box-shadow:0 4px 16px rgba(255,210,63,.2);transform:translateY(-2px)}
.rly-trend-badge{position:absolute;top:6px;right:6px;font-size:10px;font-weight:700;color:#059669;background:#DCFCE7;border-radius:20px;padding:1px 6px}
.rly-trend-icon{font-size:22px;margin-bottom:6px}
.rly-trend-name{font-size:12px;font-weight:600;color:#111827;line-height:1.4}

/* ── Confidence badge ── */
.rly-conf-badge{display:inline-flex;align-items:center;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700;color:#6B7280;cursor:default}
.rly-conf-sm{font-size:9px;padding:1px 5px}

/* ── Also searched ── */
.rly-also-wrap{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 0;margin-top:6px}
.rly-also-label{font-size:11.5px;color:#6B7280;font-weight:600;white-space:nowrap}
.rly-also-tag{background:#F3F4F6;border:1.5px solid #E5E7EB;border-radius:20px;padding:4px 12px;font-size:12px;color:#374151;cursor:pointer;font-family:inherit;transition:all .15s}
.rly-also-tag:hover{background:#FFF9EB;border-color:#FFD23F;color:#92400e}

/* ── Trend alerts banner ── */
.rly-trend-alerts{background:linear-gradient(135deg,#FFF9EB,#FFFBF2);border:1.5px solid #FDE68A;border-radius:14px;padding:12px 16px;margin:14px 0}
.rly-trend-alerts-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;font-weight:700;color:#92400e}
.rly-alerts-close{margin-left:auto;background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px;line-height:1;padding:0}
.rly-alert-row{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#374151;padding:4px 0;border-top:1px solid #FDE68A}
.rly-alert-dot{width:7px;height:7px;border-radius:50%;background:#F59E0B;flex-shrink:0}
.rly-alert-high .rly-alert-dot{background:#EF4444}
.rly-alert-medium .rly-alert-dot{background:#F59E0B}

/* ── Recent searches in dropdown ── */
.rly-recent-section .ai-srch-item{color:#6B7280}
.rly-recent-section .ai-srch-item:hover{color:#111827}
`;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════ */

  function _createElement(tag, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _categoryIcon(cat) {
    const icons = {
      footwear: '👟', clothing: '👗', electronics: '📱',
      grocery: '🛒', jewellery: '💍', toys: '🧸',
      beauty: '💄', fitness: '💪', books: '📚',
      furniture: '🪑', general: '🛍️',
    };
    return icons[cat] || '🛍️';
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  root.RetlifyPersonalization = {
    init,
    trackSearch,
    trackClick,
    trackView,
    trackPurchase,
    buildContext,
    addConfidenceBadge,
    injectRecommendationsSection,
    injectAlsoSearched,
    injectTrendAlerts,
    upgradeSearchDropdown,
    getRecentSearches: _getRecentSearches,
    getTopCategories:  _getTopCategories,
  };

})(typeof window !== 'undefined' ? window : {});
