/**
 * Retlify AI Smart Search
 * Drop-in upgrade for the existing search bar in dashboard.html
 * Adds: suggestions dropdown, typo correction, Hinglish support, intent badges
 */

(function (root) {
  'use strict';

  const AI_BASE = '/api/ai';
  let _debounceTimer = null;
  let _currentSuggestions = [];
  let _activeIndex = -1;

  const TRENDING = [
    '🔥 Running shoes near me',
    '🛍️ Red lehenga for wedding',
    '📱 Best mobile shop nearby',
    '🎧 Budget headphones under 500',
    '👗 Kurti for office wear',
  ];

  /**
   * Initialize AI search on an existing input element.
   * @param {string|HTMLElement} inputSelector - CSS selector or element
   * @param {object} opts - { onSearch, city, placeholder }
   */
  function init(inputSelector, opts = {}) {
    const input = typeof inputSelector === 'string'
      ? document.querySelector(inputSelector)
      : inputSelector;

    if (!input) return console.warn('[AISearch] Input not found:', inputSelector);

    // Upgrade placeholder
    if (opts.placeholder) input.placeholder = opts.placeholder;

    // Find or create dropdown
    let dropdown = input.parentElement?.querySelector('.ai-srch-drop');
    if (!dropdown) {
      dropdown = _createDropdown();
      input.parentElement?.appendChild(dropdown);
    }

    // Add AI badge to search wrapper
    _addAIBadge(input);

    // Event: typing
    input.addEventListener('input', (e) => {
      clearTimeout(_debounceTimer);
      const q = e.target.value.trim();
      if (!q) {
        _showTrending(dropdown);
        return;
      }
      _debounceTimer = setTimeout(() => _fetchSuggestions(q, dropdown, opts.city), 280);
    });

    // Event: focus
    input.addEventListener('focus', () => {
      if (!input.value.trim()) _showTrending(dropdown);
      else dropdown.classList.add('open');
    });

    // Event: keyboard navigation
    input.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); _moveActive(1, dropdown, input); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _moveActive(-1, dropdown, input); }
      if (e.key === 'Enter')     { e.preventDefault(); _selectActive(dropdown, input, opts.onSearch); }
      if (e.key === 'Escape')    { dropdown.classList.remove('open'); _activeIndex = -1; }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!input.parentElement?.contains(e.target)) {
        dropdown.classList.remove('open');
        _activeIndex = -1;
      }
    });

    // Submit: parse query with AI
    const form = input.closest('form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        const intent = await _parseQuery(q);
        dropdown.classList.remove('open');
        if (opts.onSearch) opts.onSearch(q, intent);
      });
    }

    return { input, dropdown };
  }

  async function _fetchSuggestions(query, dropdown, city) {
    try {
      const res = await fetch(`${AI_BASE}/search/suggest?q=${encodeURIComponent(query)}&city=${city || ''}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      _currentSuggestions = data.suggestions || [];
      _activeIndex = -1;

      _renderSuggestions(dropdown, {
        suggestions: _currentSuggestions,
        corrected: data.corrected,
        translated: data.translated,
        intent: data.intent,
        query,
      });
    } catch {
      // Fallback: show static trending
      _showTrending(dropdown);
    }
  }

  async function _parseQuery(query) {
    try {
      const res = await fetch(`${AI_BASE}/search/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function _renderSuggestions(dropdown, { suggestions, corrected, translated, intent, query }) {
    dropdown.innerHTML = '';

    // Correction notice
    if (corrected && corrected.toLowerCase() !== query.toLowerCase()) {
      const notice = document.createElement('div');
      notice.className = 'ai-srch-notice';
      notice.innerHTML = `<span class="ai-srch-notice-icon">✨</span> Did you mean: <strong>${_esc(corrected)}</strong>?`;
      notice.addEventListener('click', () => {
        const input = dropdown.parentElement?.querySelector('input, .srch-inp');
        if (input) { input.value = corrected; input.dispatchEvent(new Event('input')); }
      });
      dropdown.appendChild(notice);
    }

    // Language detection notice
    if (translated && translated !== query) {
      const tlNotice = document.createElement('div');
      tlNotice.className = 'ai-srch-notice ai-srch-notice-lang';
      tlNotice.innerHTML = `<span>🌐</span> Searching in English: <em>${_esc(translated)}</em>`;
      dropdown.appendChild(tlNotice);
    }

    // Intent badges
    if (intent) {
      const badges = document.createElement('div');
      badges.className = 'ai-srch-badges';
      if (intent.hasLocation) badges.innerHTML += `<span class="ai-badge ai-badge-loc">📍 Near me</span>`;
      if (intent.priceFilter) {
        const sym = intent.priceFilter.type === 'max' ? 'Under' : 'Above';
        badges.innerHTML += `<span class="ai-badge ai-badge-price">₹ ${sym} ₹${intent.priceFilter.value}</span>`;
      }
      if (intent.keywords?.length) {
        badges.innerHTML += `<span class="ai-badge ai-badge-kw">🔍 ${_esc(intent.keywords.slice(0, 2).join(', '))}</span>`;
      }
      if (badges.innerHTML) dropdown.appendChild(badges);
    }

    // Suggestions list
    if (suggestions.length) {
      const cat = document.createElement('div');
      cat.className = 'ai-srch-cat';
      cat.innerHTML = '<span class="ai-powered-badge">✦ AI Suggestions</span>';
      dropdown.appendChild(cat);

      suggestions.forEach((s, i) => {
        const item = document.createElement('div');
        item.className = 'ai-srch-item';
        item.dataset.index = i;
        item.innerHTML = `<span class="ai-srch-item-icon">🔍</span><span>${_esc(s)}</span><span class="ai-srch-item-arr">↗</span>`;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const input = dropdown.parentElement?.querySelector('input, .srch-inp');
          if (input) {
            input.value = s;
            dropdown.classList.remove('open');
            input.dispatchEvent(new Event('change'));
          }
        });
        dropdown.appendChild(item);
        _currentSuggestions[i] = s;
      });
    }

    dropdown.classList.toggle('open', !!suggestions.length || !!corrected || !!translated);
  }

  function _showTrending(dropdown) {
    dropdown.innerHTML = '';
    const cat = document.createElement('div');
    cat.className = 'ai-srch-cat';
    cat.innerHTML = '<span class="ai-powered-badge">🔥 Trending</span>';
    dropdown.appendChild(cat);

    TRENDING.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'ai-srch-item';
      item.dataset.index = i;
      item.innerHTML = `<span>${_esc(s)}</span><span class="ai-srch-item-arr">↗</span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const input = dropdown.parentElement?.querySelector('input, .srch-inp');
        if (input) { input.value = s.replace(/^[^\w]+/, ''); dropdown.classList.remove('open'); }
      });
      dropdown.appendChild(item);
    });

    dropdown.classList.add('open');
  }

  function _moveActive(dir, dropdown, input) {
    const items = dropdown.querySelectorAll('.ai-srch-item');
    if (!items.length) return;
    items[_activeIndex]?.classList.remove('active');
    _activeIndex = Math.max(-1, Math.min(items.length - 1, _activeIndex + dir));
    if (_activeIndex >= 0) {
      items[_activeIndex].classList.add('active');
      input.value = items[_activeIndex].textContent.replace('↗', '').trim().replace(/^[^\w]+/, '');
    }
  }

  function _selectActive(dropdown, input, onSearch) {
    const items = dropdown.querySelectorAll('.ai-srch-item');
    if (_activeIndex >= 0 && items[_activeIndex]) {
      input.value = items[_activeIndex].textContent.replace('↗', '').trim().replace(/^[^\w]+/, '');
      dropdown.classList.remove('open');
      if (onSearch) onSearch(input.value);
    }
  }

  function _createDropdown() {
    const d = document.createElement('div');
    d.className = 'ai-srch-drop';
    return d;
  }

  function _addAIBadge(input) {
    const wrap = input.parentElement;
    if (!wrap || wrap.querySelector('.ai-search-label')) return;
    const badge = document.createElement('span');
    badge.className = 'ai-search-label';
    badge.textContent = '✦ AI';
    wrap.style.position = 'relative';
    wrap.appendChild(badge);
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Inject styles
  const STYLES = `
.ai-srch-drop{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1.5px solid #E5E7EB;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:1000;overflow:hidden;display:none;max-height:360px;overflow-y:auto}
.ai-srch-drop.open{display:block;animation:aiDropIn .15s ease}
@keyframes aiDropIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.ai-srch-cat{padding:7px 14px 5px;font-size:10.5px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.6px;background:#F9FAFB;display:flex;align-items:center;gap:6px}
.ai-powered-badge{display:inline-flex;align-items:center;gap:4px;background:linear-gradient(90deg,#FFD23F22,#6366f122);border:1px solid #FFD23F44;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;color:#92400e;letter-spacing:.3px}
.ai-srch-item{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;font-size:13.5px;color:#374151;transition:background .1s;position:relative}
.ai-srch-item:hover,.ai-srch-item.active{background:#F9FAFB}
.ai-srch-item-icon{color:#9CA3AF;font-size:13px;flex-shrink:0}
.ai-srch-item-arr{margin-left:auto;color:#D1D5DB;font-size:12px;transition:color .1s}
.ai-srch-item:hover .ai-srch-item-arr{color:#FFD23F}
.ai-srch-notice{padding:9px 14px;font-size:12.5px;color:#374151;background:#FFFBEB;border-bottom:1px solid #FEF3C7;cursor:pointer;display:flex;align-items:center;gap:7px;transition:background .1s}
.ai-srch-notice:hover{background:#FEF9C3}
.ai-srch-notice-lang{background:#EFF6FF;border-bottom:1px solid #BFDBFE;cursor:default}
.ai-srch-notice-lang:hover{background:#EFF6FF}
.ai-srch-notice-icon{font-size:15px}
.ai-srch-badges{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;background:#F9FAFB;border-bottom:1px solid #F3F4F6}
.ai-badge{display:inline-flex;align-items:center;gap:4px;border-radius:20px;padding:3px 9px;font-size:11px;font-weight:600}
.ai-badge-loc{background:#DCFCE7;color:#166534}
.ai-badge-price{background:#EFF6FF;color:#1D4ED8}
.ai-badge-kw{background:#F3F4F6;color:#374151}
.ai-search-label{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:9.5px;font-weight:800;letter-spacing:.8px;color:#92400e;background:linear-gradient(90deg,#FFD23F33,#FDE68A33);border:1px solid #FFD23F66;border-radius:20px;padding:2px 7px;pointer-events:none}
`;

  if (!document.getElementById('retlify-ai-search-styles')) {
    const style = document.createElement('style');
    style.id = 'retlify-ai-search-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Expose globally
  root.RetlifyAISearch = { init };

})(typeof window !== 'undefined' ? window : {});

/* ── v2 PATCH: Personalization integration ───────────────
 * This section upgrades the existing RetlifyAISearch.init to
 * automatically inject personalization context when RetlifyPersonalization is available.
 */
(function patchAISearch(root) {
  const _orig = root.RetlifyAISearch?.init;
  if (!_orig) return;

  root.RetlifyAISearch.init = function (inputSelector, opts = {}) {
    // Merge personalization context if available
    if (root.RetlifyPersonalization) {
      const ctx = root.RetlifyPersonalization.buildContext();
      opts = {
        ...opts,
        city:   opts.city || ctx.city,
        userId: opts.userId || ctx.userId,
        _personCtx: ctx,
      };
    }

    const result = _orig.call(this, inputSelector, opts);

    // Upgrade dropdown with recent searches
    if (root.RetlifyPersonalization && result?.input) {
      root.RetlifyPersonalization.upgradeSearchDropdown(result.input);
    }

    // Track searches on submit / change
    if (result?.input) {
      const input = result.input;
      const form  = input.closest('form');
      if (form && !form._rlySearchTracked) {
        form._rlySearchTracked = true;
        form.addEventListener('submit', () => {
          const q = input.value.trim();
          if (q && root.RetlifyPersonalization) root.RetlifyPersonalization.trackSearch(q);
        });
      }
    }

    return result;
  };
})(typeof window !== 'undefined' ? window : {});
