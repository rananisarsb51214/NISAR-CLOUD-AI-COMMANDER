/**
 * ChatBot Studio - Embeddable Roman Urdu / English Live Chat Widget
 * Zero-dependency, Shadow-DOM isolated, WhatsApp-integrated client widget.
 */
(function initChatbotWidget(window, document) {
  'use strict';

  // Common Roman Urdu and English stopwords to ignore during matching
  const STOPWORDS = new Set([
    'a', 'an', 'the', 'is', 'of', 'to', 'in', 'ka', 'ki', 'ke', 
    'hai', 'hain', 'mein', 'me', 'kya', 'ko', 'se', 'aur', 'or', 'hy', 'ho', 'koi'
  ]);

  // DOM builder helper
  function createElement(tag, attributes = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attributes)) {
      if (key === 'text') {
        el.textContent = val;
      } else {
        el.setAttribute(key, val);
      }
    }
    children.forEach(child => el.append(child));
    return el;
  }

  // Tokenize input and filter out stopwords
  function tokenize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word && !STOPWORDS.has(word));
  }

  // Standardize Pakistani and international phone numbers
  function normalizePhoneNumber(rawNumber) {
    let clean = String(rawNumber || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(clean)) {
      return '92' + clean.slice(1); // Convert 03xx to 923xx
    }
    return clean;
  }

  // Calculate contrast text color (black or white) based on background hex
  function getContrastColor(hexColor) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hexColor || '');
    if (!match) return '#000000';
    const num = parseInt(match[1], 16);
    const yiq = (0.299 * (num >> 16)) + (0.587 * ((num >> 8) & 255)) + (0.114 * (num & 255));
    return yiq > 150 ? '#000000' : '#ffffff';
  }

  // Main factory function
  window.ChatBotWidget = function (config, customMountElement) {
    const cfg = Object.assign({
      name: 'Business',
      type: 'E-commerce',
      tone: 'Friendly',
      services: 'General inquiries and support',
      whatsapp: '',
      color: '#00FF88',
      logo: '',
      knowledge: '',
      price: '',
      location: '',
      hours: '',
      brand: true
    }, config);

    let orderState = null;
    let isFresh = true;

    // Helper: Build WhatsApp click-to-chat URL
    function buildWhatsAppUrl(messageText) {
      const phone = normalizePhoneNumber(cfg.whatsapp);
      const base = `https://wa.me/${phone.length >= 10 ? phone : ''}`;
      return messageText ? `${base}?text=${encodeURIComponent(messageText)}` : base;
    }

    // Helper: Tone greeting prefix
    function getTonePrefix() {
      if (cfg.tone === 'Desi') return 'Jani ';
      if (cfg.tone === 'Professional') return 'Respected customer, ';
      return '';
    }

    // FAQ Knowledge Base Matcher (Sørensen-Dice coefficient)
    function searchKnowledgeBase(userText) {
      const userTokens = tokenize(userText);
      if (!userTokens.length || !cfg.knowledge) return null;

      let bestScore = 0;
      let bestAnswer = null;

      const entries = String(cfg.knowledge).split(/\n(?=\s*Q:)/i);
      for (const entry of entries) {
        const match = entry.match(/Q:\s*([\s\S]*?)\s*A:\s*([\s\S]*)/i);
        if (!match) continue;

        const qTokens = tokenize(match[1]);
        const intersection = userTokens.filter(t => qTokens.includes(t)).length;
        const total = userTokens.length + qTokens.length;
        const score = total > 0 ? (2 * intersection) / total : 0;

        if (score > bestScore) {
          bestScore = score;
          bestAnswer = match[2].trim();
        }
      }

      return bestScore >= 0.4 ? bestAnswer : null;
    }

    // WhatsApp handoff fallback response
    function createWhatsAppHandoff(topic) {
      return {
        text: `${topic} ki exact detail team confirm karegi. WhatsApp pe seedha baat karein:`,
        action: {
          label: 'WhatsApp pe baat karo',
          href: buildWhatsAppUrl(`Salam! ${cfg.name} ke bare mein poochna tha.`)
        }
      };
    }

    // Intent routing and multi-step conversation logic
    function processReply(userInput) {
      const text = userInput.toLowerCase();
      const prefix = getTonePrefix();

      // Active lead capture / ordering flow
      if (orderState) {
        if (/cancel|rehne do|nahi chahiye/.test(text)) {
          orderState = null;
          return { text: 'Theek hai, koi masla nahi. Aur kuch poochna ho to batain.' };
        }
        if (orderState.step === 1) {
          orderState.customerName = userInput.trim().slice(0, 60);
          orderState.step = 2;
          return { text: `Shukriya ${orderState.customerName}! Apka phone number?` };
        }
        const phone = userInput.replace(/\D/g, '');
        if (phone.length < 10 || phone.length > 15) {
          return { text: 'Number sahi nahi lagta. 03001234567 jaisa likhein (ya cancel likhein).' };
        }
        const summary = `Salam! Mein ${orderState.customerName} (${phone}) ${cfg.name} se: ${orderState.originalRequest}`;
        orderState = null;
        return {
          text: 'Done! Foran confirm ke liye WhatsApp dabayein, team jaldi rabta karegi:',
          action: { label: 'WhatsApp pe bhejo', href: buildWhatsAppUrl(summary) }
        };
      }

      // Check knowledge base
      const kbAnswer = searchKnowledgeBase(userInput);
      if (kbAnswer) return { text: kbAnswer };

      // Greetings
      if (/salam|hello|\bhi\b|hey|aoa/.test(text)) {
        return { text: `${prefix}Walaikum assalam! ${cfg.name} mein khush amdeed. Price, services ya order — kya jaanna hai?` };
      }

      // Thanks
      if (/shukri|thank|jazak|meherban/.test(text)) {
        return { text: 'Khushi hui! Aur kuch poochna ho to batain.' };
      }

      // Ordering intent
      if (/order|book|appoint|khareed|lena|chahiye|chahye|buy/.test(text)) {
        orderState = { step: 1, originalRequest: userInput };
        return { text: `${prefix}Zaroor! Pehle apka naam bata dein?` };
      }

      // Pricing inquiries
      if (/pric|rate|qeemat|qimat|kimat|cost|charge|fee|paise|paisay|rupay|pkr|kitn[ae]y?\s+(ka|ki|ke|mein)/.test(text)) {
        return cfg.price ? { text: prefix + cfg.price } : createWhatsAppHandoff('Pricing');
      }

      // Services / Products
      if (/service|kaam|product|menu|offer|deal|kya milta|kya karte/.test(text)) {
        return { text: `${cfg.name} yeh deta hai: ${cfg.services}.` };
      }

      // Location / Address
      if (/locat|address|kahan|kidhar|pata|map|branch/.test(text)) {
        return cfg.location ? { text: `${prefix}Hamari location: ${cfg.location}.` } : createWhatsAppHandoff('Location');
      }

      // Business Hours
      if (/timing|time|open|khula|band|hours|kab/.test(text)) {
        return cfg.hours ? { text: `${prefix}Hamara timing: ${cfg.hours}.` } : createWhatsAppHandoff('Timing');
      }

      // Direct WhatsApp / Contact inquiry
      if (/whatsapp|number|contact|call|phone|rabta|raabta|human|agent/.test(text)) {
        return {
          text: `Direct WhatsApp pe rabta karein: +${normalizePhoneNumber(cfg.whatsapp)}`,
          action: { label: 'WhatsApp kholo', href: buildWhatsAppUrl() }
        };
      }

      return createWhatsAppHandoff('Is sawal');
    }

    // Mount host container
    const host = customMountElement || createElement('div');
    if (!customMountElement) {
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000';
      document.body.append(host);
    }

    // Shadow DOM structure
    const root = host.attachShadow({ mode: 'open' });
    const styleSheet = createElement('style', {
      text: `
        * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
        .widget-box {
          display: flex; flex-direction: column; background: #0b100d; color: #fff; overflow: hidden;
          ${customMountElement ? 'height: 100%;' : 'width: min(360px, calc(100vw - 32px)); height: min(520px, calc(100vh - 100px)); border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.4); margin-bottom: 10px;'}
        }
        .widget-box[hidden] { display: none; }
        .header { background: var(--accent); color: var(--contrast); padding: 12px; display: flex; align-items: center; gap: 10px; }
        .header img, .avatar-placeholder { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: rgba(0,0,0,0.15); display: grid; place-items: center; }
        .header b { display: block; font-size: 14px; }
        .header small { font-size: 11px; opacity: 0.8; }
        .header a, .header button { margin-left: auto; color: inherit; background: none; border: 0; font-size: 18px; text-decoration: none; cursor: pointer; }
        .messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .msg { max-width: 84%; padding: 8px 12px; border-radius: 16px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
        .msg.bot { background: #18231c; align-self: flex-start; border-bottom-left-radius: 4px; }
        .msg.user { background: #fff; color: #000; align-self: flex-end; border-bottom-right-radius: 4px; }
        .msg a { display: block; margin-top: 8px; background: var(--accent); color: var(--contrast); padding: 7px 10px; border-radius: 10px; text-align: center; text-decoration: none; font-weight: 600; }
        .chips { display: flex; gap: 6px; padding: 0 10px 8px; overflow-x: auto; scrollbar-width: none; }
        .chips button { flex: none; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 99px; padding: 5px 11px; font-size: 12px; cursor: pointer; }
        .footer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
        .footer input { flex: 1; min-width: 0; background: #060908; color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 99px; padding: 9px 14px; font-size: 13px; outline: none; }
        .footer button { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--accent); color: var(--contrast); font-size: 16px; cursor: pointer; }
        .branding { text-align: center; font-size: 10px; opacity: 0.4; padding: 0 0 6px; }
        .toggle-btn { width: 56px; height: 56px; border-radius: 50%; border: 0; background: var(--accent); color: var(--contrast); font-size: 24px; cursor: pointer; float: right; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
      `
    });

    // Elements
    const avatarEl = createElement('span', { class: 'avatar-placeholder' });
    const titleEl = createElement('b');
    const waHeaderLink = createElement('a', { target: '_blank', rel: 'noopener', title: 'WhatsApp', text: '📞' });
    const headerEl = createElement('div', { class: 'header' }, [
      avatarEl,
      createElement('div', {}, [titleEl, createElement('small', { text: '● Online • Replies instantly' })]),
      waHeaderLink
    ]);

    const messagesEl = createElement('div', { class: 'messages', 'aria-live': 'polite' });
    const chipsEl = createElement('div', { class: 'chips' });
    const inputEl = createElement('input', { placeholder: 'Type karo... price, services, order', maxlength: '300', 'aria-label': 'Message' });
    const sendBtn = createElement('button', { text: '➤', 'aria-label': 'Send' });
    const footerEl = createElement('div', { class: 'footer' }, [inputEl, sendBtn]);

    const widgetBox = createElement('div', { class: 'widget-box' }, [headerEl, messagesEl, chipsEl, footerEl]);
    if (cfg.brand !== false) {
      widgetBox.append(createElement('div', { class: 'branding', text: 'Powered by ChatBot Studio' }));
    }

    root.append(styleSheet, widgetBox);

    // Floating launcher button
    let launcherBtn = null;
    if (!customMountElement) {
      widgetBox.hidden = true;
      launcherBtn = createElement('button', { class: 'toggle-btn', text: '💬', 'aria-label': 'Open Chat' });
      launcherBtn.onclick = function () {
        widgetBox.hidden = !widgetBox.hidden;
        launcherBtn.textContent = widgetBox.hidden ? '💬' : '✕';
        if (!widgetBox.hidden) inputEl.focus();
      };
      root.append(launcherBtn);

      const closeHeaderBtn = createElement('button', { text: '✕', 'aria-label': 'Close Chat' });
      closeHeaderBtn.onclick = () => launcherBtn.onclick();
      headerEl.append(closeHeaderBtn);
    }

    // Apply styles and data
    function applyStyles() {
      const accent = cfg.color || '#00FF88';
      const contrast = getContrastColor(accent);

      [host, widgetBox, launcherBtn].forEach(el => {
        if (el) {
          el.style.setProperty('--accent', accent);
          el.style.setProperty('--contrast', contrast);
        }
      });

      titleEl.textContent = cfg.name;
      avatarEl.textContent = '';
      if (cfg.logo) {
        avatarEl.append(createElement('img', { src: cfg.logo, alt: '' }));
      } else {
        avatarEl.textContent = '🏪';
      }

      waHeaderLink.href = buildWhatsAppUrl();

      // Quick prompt buttons
      chipsEl.textContent = '';
      ['Price kya hai?', 'Services batao', 'Location?', 'Order karna hai'].forEach(prompt => {
        const btn = createElement('button', { text: prompt });
        btn.onclick = () => handleSend(prompt);
        chipsEl.append(btn);
      });

      if (isFresh) {
        messagesEl.textContent = '';
        renderMessage('bot', { text: `Assalam-o-Alaikum! 👋 ${cfg.name} mein khush amdeed. Mein apki kese madad kar sakta hoon?` });
      }
    }

    // Append message bubble
    function renderMessage(senderRole, messageObj) {
      const bubble = createElement('div', { class: `msg ${senderRole}`, text: messageObj.text });
      if (messageObj.action && /^https:\/\/wa\.me\//.test(messageObj.action.href)) {
        bubble.append(createElement('a', {
          href: messageObj.action.href,
          target: '_blank',
          rel: 'noopener',
          text: messageObj.action.label
        }));
      }
      messagesEl.append(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    // Dispatch message and simulate realistic typing delay
    function handleSend(textToSend) {
      const text = String(textToSend || inputEl.value).trim();
      if (!text) return;

      isFresh = false;
      inputEl.value = '';
      renderMessage('user', { text: text.slice(0, 300) });

      const typingIndicator = renderMessage('bot', { text: '…' });
      setTimeout(() => {
        const response = processReply(text);
        typingIndicator.remove();
        renderMessage('bot', response);
      }, 450);
    }

    sendBtn.onclick = () => handleSend();
    inputEl.onkeydown = e => { if (e.key === 'Enter') handleSend(); };

    applyStyles();

    // Public update API
    return {
      update(newConfig) {
        Object.assign(cfg, newConfig);
        applyStyles();
      }
    };
  };
})(window, document);
