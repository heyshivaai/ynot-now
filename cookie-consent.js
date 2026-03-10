(function() {
  'use strict';
  const CONSENT_KEY = 'ynot_cookie_consent';
  const CONSENT_VERSION = '1.0';

  function hasConsent() {
    try {
      const consent = localStorage.getItem(CONSENT_KEY);
      if (consent) { return JSON.parse(consent).version === CONSENT_VERSION; }
    } catch (e) {}
    return false;
  }

  function saveConsent(accepted) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        version: CONSENT_VERSION, accepted: accepted, timestamp: new Date().toISOString()
      }));
    } catch (e) {}
  }

  function showBanner() {
    if (hasConsent()) return;
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.innerHTML = `
      <div class="cookie-content">
        <p><strong>Cookie Notice:</strong> We use essential cookies and analytics to improve your experience. By continuing, you agree to our <a href="/privacy">Privacy Policy</a>.</p>
        <div class="cookie-buttons">
          <button id="cookie-accept" class="cookie-btn accept">Accept</button>
          <button id="cookie-decline" class="cookie-btn decline">Decline Analytics</button>
        </div>
      </div>`;

    const style = document.createElement('style');
    style.textContent = `
      #cookie-consent-banner{position:fixed;bottom:0;left:0;right:0;background:#0a0a08;color:#f5f5f2;padding:16px 24px;z-index:10000;font-family:'DM Sans',-apple-system,sans-serif;font-size:14px;box-shadow:0 -4px 20px rgba(0,0,0,0.15);animation:slideUp 0.3s ease-out}
      @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
      #cookie-consent-banner .cookie-content{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
      #cookie-consent-banner p{margin:0;flex:1;min-width:280px;line-height:1.5}
      #cookie-consent-banner a{color:#fff;text-decoration:underline}
      #cookie-consent-banner .cookie-buttons{display:flex;gap:12px;flex-shrink:0}
      #cookie-consent-banner .cookie-btn{padding:10px 20px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:all 0.2s;font-family:inherit}
      #cookie-consent-banner .cookie-btn.accept{background:#fff;color:#0a0a08}
      #cookie-consent-banner .cookie-btn.accept:hover{background:#f5f5f2}
      #cookie-consent-banner .cookie-btn.decline{background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3)}
      #cookie-consent-banner .cookie-btn.decline:hover{border-color:rgba(255,255,255,0.6)}
      @media(max-width:600px){#cookie-consent-banner{padding:16px}#cookie-consent-banner .cookie-content{flex-direction:column;text-align:center}#cookie-consent-banner .cookie-buttons{width:100%;justify-content:center}}`;

    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById('cookie-accept').addEventListener('click', function() {
      saveConsent(true);
      banner.style.animation = 'slideUp 0.3s ease-out reverse';
      setTimeout(() => banner.remove(), 300);
    });

    document.getElementById('cookie-decline').addEventListener('click', function() {
      saveConsent(false);
      window['va'] = function() {};
      window['vaq'] = [];
      banner.style.animation = 'slideUp 0.3s ease-out reverse';
      setTimeout(() => banner.remove(), 300);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
