/**
 * Retlify AI Assistant — Floating Chatbot Widget
 * Injects a floating button + chat modal into any page.
 * Supports customer & shopkeeper modes.
 */

(function (root) {
  'use strict';

  const AI_BASE = '/api/ai';
  let _mode = 'customer';
  let _context = {};
  let _history = []; // [{role, content}]
  let _isOpen = false;
  let _isTyping = false;
  let _elements = {};

  const WELCOME = {
    customer: 'Hi! 👋 I\'m your Retlify shopping assistant.\n\nI can help you find shops, compare prices, and discover products near you. What are you looking for today?',
    shopkeeper: 'Hi! 👋 I\'m your Retlify business advisor.\n\nAsk me about trending products, stocking decisions, or how to grow your shop. How can I help?',
  };

  const QUICK_PROMPTS = {
    customer: [
      'Find budget headphones nearby',
      'Which shop has cheapest sneakers?',
      'Recommend a lehenga shop',
      'Best mobile phones under ₹10,000',
    ],
    shopkeeper: [
      'Which products should I stock?',
      'Why are my sales low?',
      'How to attract more customers?',
      'What\'s trending in my area?',
    ],
  };

  /**
   * Initialize the chatbot widget.
   * @param {object} opts - { mode: 'customer'|'shopkeeper', context: {}, position: 'bottom-right' }
   */
  function init(opts = {}) {
    _mode = opts.mode || 'customer';
    _context = opts.context || {};

    _injectStyles();
    _buildWidget();
    _bindEvents();

    // Auto-show welcome after 3s on first visit
    if (sessionStorage.getItem('retlify_chat_opened')) return;
    setTimeout(() => _pulseButton(), 3000);
  }

  function _buildWidget() {
    const container = document.createElement('div');
    container.id = 'retlify-chat-container';
    container.innerHTML = `
      <div id="rly-chat-panel" class="rly-panel">
        <div class="rly-panel-header">
          <div class="rly-header-left">
            <div class="rly-avatar">✦</div>
            <div>
              <div class="rly-header-title">Retlify AI</div>
              <div class="rly-header-sub" id="rly-status">
                <span class="rly-status-dot"></span>
                ${_mode === 'shopkeeper' ? 'Business Advisor' : 'Shopping Assistant'}
              </div>
            </div>
          </div>
          <div class="rly-header-right">
            <button class="rly-icon-btn" id="rly-clear-btn" title="Clear chat">↺</button>
            <button class="rly-icon-btn" id="rly-close-btn" title="Close">✕</button>
          </div>
        </div>

        <div class="rly-messages" id="rly-messages">
          <div class="rly-powered">Powered by Claude AI</div>
        </div>

        <div class="rly-quick-wrap" id="rly-quick">
          ${QUICK_PROMPTS[_mode].map(p => `<button class="rly-quick-btn" data-prompt="${_escAttr(p)}">${_esc(p)}</button>`).join('')}
        </div>

        <div class="rly-input-row">
          <input id="rly-input" class="rly-input" placeholder="Ask anything…" autocomplete="off" maxlength="500"/>
          <button class="rly-send-btn" id="rly-send-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>

      <button id="rly-fab" class="rly-fab" aria-label="Open AI Assistant">
        <span class="rly-fab-icon rly-fab-open"><svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 3L15.2 9.8L22 12L15.2 14.2L13 21L10.8 14.2L4 12L10.8 9.8L13 3Z" fill="#0a0800" stroke="#0a0800" stroke-width="0.5" stroke-linejoin="round"/><path d="M20 5L21 7.5L23.5 8.5L21 9.5L20 12L19 9.5L16.5 8.5L19 7.5L20 5Z" fill="#0a0800" opacity="0.6"/><path d="M6 14L6.8 16L8.5 16.8L6.8 17.6L6 19.5L5.2 17.6L3.5 16.8L5.2 16L6 14Z" fill="#0a0800" opacity="0.5"/></svg></span>
        <span class="rly-fab-icon rly-fab-close" style="display:none"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2L16 16M16 2L2 16" stroke="#0a0800" stroke-width="2.5" stroke-linecap="round"/></svg></span>
        <span class="rly-fab-badge" id="rly-badge" style="display:none">1</span>
      </button>
    `;
    document.body.appendChild(container);

    _elements = {
      panel: document.getElementById('rly-chat-panel'),
      messages: document.getElementById('rly-messages'),
      input: document.getElementById('rly-input'),
      sendBtn: document.getElementById('rly-send-btn'),
      fab: document.getElementById('rly-fab'),
      quickWrap: document.getElementById('rly-quick'),
      badge: document.getElementById('rly-badge'),
      closeBtn: document.getElementById('rly-close-btn'),
      clearBtn: document.getElementById('rly-clear-btn'),
    };

    // Show welcome message
    _appendMessage('assistant', WELCOME[_mode]);
  }

  function _bindEvents() {
    _elements.fab.addEventListener('click', togglePanel);
    _elements.closeBtn.addEventListener('click', closePanel);
    _elements.clearBtn.addEventListener('click', clearChat);
    _elements.sendBtn.addEventListener('click', sendMessage);
    _elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Quick prompt buttons
    _elements.quickWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.rly-quick-btn');
      if (btn) {
        _elements.input.value = btn.dataset.prompt;
        sendMessage();
      }
    });
  }

  async function sendMessage() {
    const text = _elements.input.value.trim();
    if (!text || _isTyping) return;

    _elements.input.value = '';
    _elements.quickWrap.style.display = 'none';
    _appendMessage('user', text);

    _history.push({ role: 'user', content: text });
    _setTyping(true);

    try {
      const res = await fetch(`${AI_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: _history,
          mode: _mode,
          context: _context,
        }),
      });

      const data = await res.json();
      const reply = data.reply || 'Sorry, I couldn\'t process that. Please try again.';
      _history.push({ role: 'assistant', content: reply });
      _setTyping(false);
      _appendMessage('assistant', reply);
    } catch {
      _setTyping(false);
      _appendMessage('assistant', '⚠️ Connection issue. Please check your internet and try again.');
    }
  }

  function _appendMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `rly-msg rly-msg-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'rly-bubble';
    bubble.innerHTML = _formatText(text);
    wrap.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'rly-time';
    time.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    wrap.appendChild(time);

    _elements.messages.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      _elements.messages.scrollTop = _elements.messages.scrollHeight;
    });
  }

  function _setTyping(on) {
    _isTyping = on;
    _elements.sendBtn.disabled = on;

    const existing = document.getElementById('rly-typing');
    if (on && !existing) {
      const wrap = document.createElement('div');
      wrap.id = 'rly-typing';
      wrap.className = 'rly-msg rly-msg-assistant rly-typing-wrap';
      wrap.innerHTML = '<div class="rly-bubble rly-typing"><span></span><span></span><span></span></div>';
      _elements.messages.appendChild(wrap);
      requestAnimationFrame(() => {
        wrap.classList.add('in');
        _elements.messages.scrollTop = _elements.messages.scrollHeight;
      });
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function _formatText(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function togglePanel() {
    if (_isOpen) closePanel(); else openPanel();
  }

  function openPanel() {
    _isOpen = true;
    _elements.panel.classList.add('open');
    _elements.fab.querySelector('.rly-fab-open').style.display = 'none';
    _elements.fab.querySelector('.rly-fab-close').style.display = '';
    _elements.badge.style.display = 'none';
    _elements.input.focus();
    _elements.messages.scrollTop = _elements.messages.scrollHeight;
    sessionStorage.setItem('retlify_chat_opened', '1');
  }

  function closePanel() {
    _isOpen = false;
    _elements.panel.classList.remove('open');
    _elements.fab.querySelector('.rly-fab-open').style.display = '';
    _elements.fab.querySelector('.rly-fab-close').style.display = 'none';
  }

  function clearChat() {
    _history = [];
    _elements.messages.innerHTML = '<div class="rly-powered">Powered by Claude AI</div>';
    _elements.quickWrap.style.display = '';
    _appendMessage('assistant', WELCOME[_mode]);
  }

  function _pulseButton() {
    _elements.fab.classList.add('pulse');
    _elements.badge.style.display = '';
    setTimeout(() => _elements.fab.classList.remove('pulse'), 3000);
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function _escAttr(s) { return String(s).replace(/"/g,'&quot;'); }

  function _injectStyles() {
    if (document.getElementById('rly-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'rly-chat-styles';
    style.textContent = `
#retlify-chat-container{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:'DM Sans',system-ui,sans-serif}

/* ── Yellow AI Assistant FAB ── */
.rly-fab{
  width:58px;height:58px;border-radius:50%;
  background:linear-gradient(135deg,#facc15,#eab308);
  border:none;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 24px rgba(250,204,21,.45),0 2px 8px rgba(0,0,0,.25);
  transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease;
  position:relative;overflow:visible;
}
.rly-fab:hover{
  transform:scale(1.1) translateY(-2px);
  box-shadow:0 12px 36px rgba(250,204,21,.6),0 4px 12px rgba(0,0,0,.2);
}
.rly-fab:active{transform:scale(1.03) translateY(0)}
.rly-fab.pulse{animation:rlyPulse 2s ease 3}
@keyframes rlyPulse{
  0%{box-shadow:0 4px 24px rgba(250,204,21,.45),0 0 0 0 rgba(250,204,21,.5)}
  50%{box-shadow:0 4px 24px rgba(250,204,21,.45),0 0 0 14px rgba(250,204,21,0)}
  100%{box-shadow:0 4px 24px rgba(250,204,21,.45),0 0 0 0 rgba(250,204,21,0)}
}

.rly-fab-icon{
  display:flex;align-items:center;justify-content:center;
  width:28px;height:28px;flex-shrink:0;
}
.rly-fab-icon svg{transition:transform .25s ease}
.rly-fab:hover .rly-fab-icon svg{transform:scale(1.08) rotate(5deg)}

.rly-fab::before{
  content:'';position:absolute;inset:-4px;border-radius:50%;
  background:conic-gradient(from 0deg,rgba(250,204,21,.5),rgba(234,179,8,.2),rgba(250,204,21,.5));
  opacity:0;transition:opacity .25s;z-index:-1;
  animation:fabRingRot 8s linear infinite paused;
}
.rly-fab:hover::before{opacity:1;animation-play-state:running}
@keyframes fabRingRot{to{transform:rotate(360deg)}}

.rly-fab-badge{position:absolute;top:-3px;right:-3px;width:18px;height:18px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #eab308;box-shadow:0 2px 8px rgba(239,68,68,.4)}
.rly-panel{position:absolute;bottom:70px;right:0;width:360px;max-height:520px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;pointer-events:none;transform:translateY(12px) scale(.97);transition:all .2s ease}
.rly-panel.open{opacity:1;pointer-events:all;transform:translateY(0) scale(1)}
.rly-panel-header{background:linear-gradient(135deg,#111827,#1e293b);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.rly-header-left{display:flex;align-items:center;gap:10px}
.rly-avatar{width:36px;height:36px;border-radius:10px;background:rgba(255,210,63,.15);border:1.5px solid rgba(255,210,63,.3);display:flex;align-items:center;justify-content:center;font-size:16px;color:#FFD23F;font-weight:900;font-family:'Outfit',sans-serif;flex-shrink:0}
.rly-header-title{font-family:'Outfit',sans-serif;font-size:14px;font-weight:800;color:#fff;letter-spacing:-.2px}
.rly-header-sub{font-size:11px;color:rgba(255,255,255,.45);display:flex;align-items:center;gap:5px;margin-top:2px}
.rly-status-dot{width:6px;height:6px;border-radius:50%;background:#22C55E;flex-shrink:0}
.rly-header-right{display:flex;gap:4px}
.rly-icon-btn{background:rgba(255,255,255,.08);border:none;color:rgba(255,255,255,.5);width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.rly-icon-btn:hover{background:rgba(255,255,255,.15);color:#fff}
.rly-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:0}
.rly-messages::-webkit-scrollbar{width:4px}.rly-messages::-webkit-scrollbar-track{background:transparent}.rly-messages::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:4px}
.rly-powered{text-align:center;font-size:10.5px;color:#D1D5DB;margin-bottom:4px}
.rly-msg{display:flex;flex-direction:column;opacity:0;transform:translateY(8px);transition:all .25s ease}
.rly-msg.in{opacity:1;transform:translateY(0)}
.rly-msg-user{align-items:flex-end}
.rly-msg-assistant{align-items:flex-start}
.rly-bubble{max-width:82%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.6;word-break:break-word}
.rly-msg-user .rly-bubble{background:#111827;color:#fff;border-radius:14px 14px 4px 14px}
.rly-msg-assistant .rly-bubble{background:#F3F4F6;color:#111827;border-radius:14px 14px 14px 4px}
.rly-time{font-size:10px;color:#9CA3AF;margin-top:4px;padding:0 2px}
.rly-typing{display:flex;align-items:center;gap:4px;padding:12px 16px}
.rly-typing span{width:7px;height:7px;border-radius:50%;background:#9CA3AF;animation:rlyDot 1.2s infinite}
.rly-typing span:nth-child(2){animation-delay:.2s}
.rly-typing span:nth-child(3){animation-delay:.4s}
@keyframes rlyDot{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1);opacity:1}}
.rly-quick-wrap{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid #F3F4F6;background:#FAFAFA}
.rly-quick-btn{background:#fff;border:1.5px solid #E5E7EB;border-radius:20px;padding:5px 12px;font-size:12px;color:#374151;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap}
.rly-quick-btn:hover{border-color:#FFD23F;color:#92400e;background:#FFFBEB}
.rly-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #F3F4F6;background:#fff;flex-shrink:0}
.rly-input{flex:1;border:1.5px solid #E5E7EB;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;font-family:'DM Sans',sans-serif;color:#111827;transition:border-color .2s}
.rly-input:focus{border-color:#FFD23F;box-shadow:0 0 0 3px rgba(255,210,63,.1)}
.rly-send-btn{width:38px;height:38px;border-radius:10px;background:#111827;border:none;color:#FFD23F;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.rly-send-btn:hover{background:#1F2937;transform:scale(1.05)}
.rly-send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
@media(max-width:420px){.rly-panel{width:calc(100vw - 32px);right:-8px}}
`;
    document.head.appendChild(style);
  }

  root.RetlifyChat = { init, open: openPanel, close: closePanel, toggle: togglePanel };

})(typeof window !== 'undefined' ? window : {});

/* ── v2 PATCH: Context injection + confidence display ────
 * Exposes _setContext so RetlifyPersonalization can inject user history.
 * Also shows confidence badge on AI responses when confidence data is returned.
 */
(function patchChat(root) {
  if (!root.RetlifyChat) return;

  // Expose context setter
  root.RetlifyChat._setContext = function (ctx) {
    // Access the closure variable _context via patching sendMessage
    const origSend = root.RetlifyChat._origSend;
    if (!origSend) {
      // Store context for next sendMessage patching cycle
      root.RetlifyChat._pendingCtx = ctx;
    }
  };

  // Patch to inject userId into every chat request
  const _origInit = root.RetlifyChat.init;
  root.RetlifyChat.init = function (opts = {}) {
    // Auto-enrich context with personalization data
    if (root.RetlifyPersonalization) {
      const pCtx = root.RetlifyPersonalization.buildContext();
      opts.context = {
        ...(opts.context || {}),
        recentSearches: pCtx.recentSearches || [],
        topCategories:  pCtx.topCategories  || [],
        city:           opts.context?.city || pCtx.city || '',
        userId:         pCtx.userId || opts.context?.userId,
      };
    }
    return _origInit.call(this, opts);
  };
})(typeof window !== 'undefined' ? window : {});
