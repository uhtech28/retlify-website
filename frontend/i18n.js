/**
 * Retlify i18n Engine v2.0
 * Production-ready multilingual system for India-focused SaaS
 * Supports: en, hi, bn, te, mr, ta, gu, kn, ml, pa, or, as, ur (RTL)
 * Features: lazy loading, localStorage, backend sync, RTL, fallback to en
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.I18n = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ─────────────────────────────────────────────────
   * LANGUAGE REGISTRY
   * ───────────────────────────────────────────────── */
  const LANGUAGES = [
    { code: 'en', name: 'English',    nativeName: 'English',    dir: 'ltr' },
    { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी',      dir: 'ltr' },
    { code: 'bn', name: 'Bengali',    nativeName: 'বাংলা',       dir: 'ltr' },
    { code: 'te', name: 'Telugu',     nativeName: 'తెలుగు',      dir: 'ltr' },
    { code: 'mr', name: 'Marathi',    nativeName: 'मराठी',       dir: 'ltr' },
    { code: 'ta', name: 'Tamil',      nativeName: 'தமிழ்',       dir: 'ltr' },
    { code: 'gu', name: 'Gujarati',   nativeName: 'ગુજરાતી',     dir: 'ltr' },
    { code: 'kn', name: 'Kannada',    nativeName: 'ಕನ್ನಡ',       dir: 'ltr' },
    { code: 'ml', name: 'Malayalam',  nativeName: 'മലയാളം',      dir: 'ltr' },
    { code: 'pa', name: 'Punjabi',    nativeName: 'ਪੰਜਾਬੀ',      dir: 'ltr' },
    { code: 'or', name: 'Odia',       nativeName: 'ଓଡ଼ିଆ',       dir: 'ltr' },
    { code: 'as', name: 'Assamese',   nativeName: 'অসমীয়া',     dir: 'ltr' },
    { code: 'ur', name: 'Urdu',       nativeName: 'اردو',        dir: 'rtl' },
  ];

  /* ─────────────────────────────────────────────────
   * INTERNAL STATE
   * ───────────────────────────────────────────────── */
  const _cache = {};          // { langCode: { key: value, ... } }
  let   _currentLang = 'en';
  let   _fallbackLang = 'en';
  const _pendingLoads = {};   // promise deduplication
  const LOCALE_BASE = (function () {
    const s = document.currentScript;
    if (s) {
      const src = s.src;
      return src.replace(/\/i18n\.js.*$/, '/locales');
    }
    return '/locales';
  })();
  const LS_KEY  = 'retlify_lang';
  const API_URL = '/api/auth/language'; // backend endpoint

  /* ─────────────────────────────────────────────────
   * LOAD A LOCALE FILE (lazy + cached)
   * ───────────────────────────────────────────────── */
  async function _loadLocale(code) {
    if (_cache[code]) return _cache[code];
    if (_pendingLoads[code]) return _pendingLoads[code];

    _pendingLoads[code] = fetch(`${LOCALE_BASE}/${code}/common.json?v=2`)
      .then(r => {
        if (!r.ok) throw new Error(`[i18n] 404 locale/${code}`);
        return r.json();
      })
      .then(data => {
        _cache[code] = data;
        delete _pendingLoads[code];
        return data;
      })
      .catch(err => {
        console.warn('[i18n] Failed to load locale:', code, err);
        delete _pendingLoads[code];
        return _cache['en'] || {};
      });

    return _pendingLoads[code];
  }

  /* ─────────────────────────────────────────────────
   * TRANSLATE A SINGLE KEY
   * ───────────────────────────────────────────────── */
  function t(key, params) {
    const bundle = _cache[_currentLang] || _cache[_fallbackLang] || {};
    let str = bundle[key] || (_cache[_fallbackLang] || {})[key] || key;
    if (params && typeof str === 'string') {
      Object.keys(params).forEach(k => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }
    return str;
  }

  /* ─────────────────────────────────────────────────
   * APPLY TRANSLATIONS TO DOM
   * ───────────────────────────────────────────────── */
  function _applyDOM() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = t(key);
      if (val && val !== key) el.textContent = val;
    });

    // HTML content (for rich text)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.dataset.i18nHtml;
      const val = t(key);
      if (val && val !== key) el.innerHTML = val;
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const val = t(key);
      if (val && val !== key) el.placeholder = val;
    });

    // Titles / tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const val = t(key);
      if (val && val !== key) el.title = val;
    });

    // aria-labels
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.dataset.i18nAria;
      const val = t(key);
      if (val && val !== key) el.setAttribute('aria-label', val);
    });
  }

  /* ─────────────────────────────────────────────────
   * APPLY RTL / LTR LAYOUT
   * ───────────────────────────────────────────────── */
  function _applyDir(dir) {
    document.documentElement.dir  = dir;
    document.documentElement.lang = _currentLang;
    // Toggle RTL helper class for custom CSS
    document.body.classList.toggle('rtl', dir === 'rtl');
    document.body.classList.toggle('ltr', dir !== 'rtl');
    // Apply to all main layout containers
    ['sb', 'main', 'content'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.dir = dir;
    });
  }

  /* ─────────────────────────────────────────────────
   * SYNC LANGUAGE TO BACKEND (non-blocking)
   * ───────────────────────────────────────────────── */
  function _syncToBackend(code) {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      fetch(API_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ language: code }),
      }).catch(() => {/* silent fail */});
    } catch (e) { /* silent */ }
  }

  /* ─────────────────────────────────────────────────
   * PUBLIC: SET LANGUAGE
   * ───────────────────────────────────────────────── */
  async function setLanguage(code, opts) {
    if (!LANGUAGES.find(l => l.code === code)) {
      console.warn('[i18n] Unknown language:', code, '— falling back to en');
      code = 'en';
    }

    opts = opts || {};
    const prevLang = _currentLang;

    // Ensure fallback (en) is cached
    if (!_cache['en']) await _loadLocale('en');

    // Load requested locale
    await _loadLocale(code);
    _currentLang = code;

    // Persist
    try { localStorage.setItem(LS_KEY, code); } catch (e) { /* private mode */ }

    // Apply to DOM
    const lang = LANGUAGES.find(l => l.code === code);
    _applyDir(lang ? lang.dir : 'ltr');
    _applyDOM();

    // Update language selector(s) if present
    document.querySelectorAll('.retlify-lang-select, #langSel').forEach(sel => {
      if (sel.value !== code) sel.value = code;
    });

    // Backend sync (unless told not to)
    if (!opts.skipBackendSync) _syncToBackend(code);

    // Fire custom event for pages that need to react
    window.dispatchEvent(new CustomEvent('retlify:langchange', {
      detail: { lang: code, dir: lang ? lang.dir : 'ltr', prev: prevLang }
    }));

    return code;
  }

  /* ─────────────────────────────────────────────────
   * PUBLIC: GET SAVED LANGUAGE (localStorage → backend → 'en')
   * ───────────────────────────────────────────────── */
  async function getSavedLanguage() {
    // 1. localStorage (fastest)
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored && LANGUAGES.find(l => l.code === stored)) return stored;
    } catch (e) { /* private mode */ }

    // 2. User object in localStorage
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.language && LANGUAGES.find(l => l.code === user.language)) {
        return user.language;
      }
    } catch (e) { /* bad json */ }

    // 3. Backend (async, only if logged in)
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const r = await fetch(API_URL, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.language && LANGUAGES.find(l => l.code === d.language)) {
            return d.language;
          }
        }
      }
    } catch (e) { /* offline */ }

    return 'en';
  }

  /* ─────────────────────────────────────────────────
   * PUBLIC: INITIALIZE (call once on page load)
   * ───────────────────────────────────────────────── */
  async function init(opts) {
    opts = opts || {};

    // Always cache English first (needed for fallback)
    await _loadLocale('en');

    // Determine language
    let code = opts.language || await getSavedLanguage();
    if (!LANGUAGES.find(l => l.code === code)) code = 'en';

    await setLanguage(code, { skipBackendSync: true });

    return code;
  }

  /* ─────────────────────────────────────────────────
   * PUBLIC: POPULATE A LANGUAGE SELECTOR <select>
   * ───────────────────────────────────────────────── */
  function populateSelect(selectEl, currentCode) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    LANGUAGES.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.nativeName + (lang.dir === 'rtl' ? ' (RTL)' : '');
      if (lang.code === (currentCode || _currentLang)) opt.selected = true;
      selectEl.appendChild(opt);
    });
    selectEl.addEventListener('change', e => setLanguage(e.target.value));
  }

  /* ─────────────────────────────────────────────────
   * PUBLIC API
   * ───────────────────────────────────────────────── */
  return {
    t,
    init,
    setLanguage,
    getSavedLanguage,
    populateSelect,
    get currentLang() { return _currentLang; },
    get languages()   { return LANGUAGES.slice(); },
    get isRTL()       { return (LANGUAGES.find(l => l.code === _currentLang) || {}).dir === 'rtl'; },
  };
}));
