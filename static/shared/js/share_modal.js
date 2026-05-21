const ShareModal = (() => {
  'use strict';

  // =============== Configuration ===============

  const FIELD_ORDER = ['gender', 'species', 'position', 'attribute',
                       'attack_type', 'complexity', 'date'];

  // =============== API ===============

  function open(guesses, heroName, attempts) {
    _buildCard(guesses, heroName, attempts);
    const overlay = document.getElementById('share-modal-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('share-modal-overlay--visible');
        overlay.setAttribute('aria-hidden', 'false');
      });
    });
    _clearHint();
  }

  function close() {
    const overlay = document.getElementById('share-modal-overlay');
    overlay.classList.remove('share-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('transitionend', () => {
      overlay.style.display = 'none';
    }, { once: true });
  }

  // =============== DOM Builders & Renderers ===============

  function _buildCard(guesses, heroName, attempts) {
    const grid = document.getElementById('share-card-grid');
    grid.innerHTML = '';

    [...guesses].forEach(guess => {
      const row = document.createElement('div');
      row.className = 'share-grid-row';

      // Add icon cell on the left
      const iconCell = document.createElement('div');
      iconCell.className = 'share-grid-hero-icon';
      if (guess.heroImage) {
        const img = document.createElement('img');
        img.src = guess.heroImage;
        img.alt = '';
        iconCell.appendChild(img);
      } else {
        iconCell.classList.add('share-grid-hero-icon--empty');
      }
      row.appendChild(iconCell);

      FIELD_ORDER.forEach(key => {
        const field = (guess.fields || {})[key];
        const status = field ? field.status : 'wrong';
        const cell = document.createElement('div');
        cell.className = `share-grid-cell share-grid-cell--${status}`;
        row.appendChild(cell);
      });
      grid.appendChild(row);
    });

    const attWord = attempts === 1 ? 'attempt' : 'attempts';
    document.getElementById('share-card-footer').textContent =
      heroName ? `${attempts} ${attWord} · ${heroName}` : `${attempts} ${attWord}`;
  }

  // =============== Image Generation & Actions ===============

  async function _generatePng() {
    if (!window.html2canvas) throw new Error('html2canvas not loaded');
    const card = document.getElementById('share-card');

    // Duplicate the card off-screen to calculate dynamic content dimensions before rendering.
    const clone = card.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.top = '-99999px';
    clone.style.left = '-99999px';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.width = card.offsetWidth + 'px';
    document.body.appendChild(clone);

    try {
      return await html2canvas(clone, {
        backgroundColor: '#111318',
        scale: 2,
        useCORS: true,
        logging: false,
      });
    } finally {
      document.body.removeChild(clone);
    }
  }

  async function download() {
    try {
      const canvas = await _generatePng();
      const link = document.createElement('a');
      link.download = 'dotale-result.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      _setHint('Saved!', 'success');
    } catch (e) {
      console.error(e);
      _setHint('Failed to generate image', 'error');
    }
  }

  async function copyImage() {
    try {
      const canvas = await _generatePng();
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          _setHint('Copied to clipboard!', 'success');
        } catch {
          const link = document.createElement('a');
          link.download = 'dotale-result.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          _setHint('Saved (clipboard unavailable)', 'success');
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
      _setHint('Failed to generate image', 'error');
    }
  }

  // =============== Notifications ===============

  function _setHint(text, type) {
    const el = document.getElementById('share-modal-hint');
    if (!el) return;
    el.textContent = text;
    el.className = `share-modal-hint share-modal-hint--${type}`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; el.className = 'share-modal-hint'; }, 3000);
  }

  function _clearHint() {
    const el = document.getElementById('share-modal-hint');
    if (el) { el.textContent = ''; el.className = 'share-modal-hint'; }
  }

  // =============== DOM Data Parsing ===============

  function _collectGuessesFromDom() {
    const FIELD_KEYS = ['gender', 'species', 'position', 'attribute',
                        'attack_type', 'complexity', 'date'];
    const container = document.getElementById('guesses-history-list')
                   || document.getElementById('stats-guesses-list');
    if (!container) return [];
    const rows = container.querySelectorAll('.guess-row-container');
    const result = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('.table-field-cell');
      const fields = {};
      FIELD_KEYS.forEach((key, i) => {
        const cell = cells[i];
        if (!cell) return;
        const statusMatch = [...cell.classList].find(c => c.startsWith('cell-status-'));
        const status = statusMatch ? statusMatch.replace('cell-status-', '') : 'wrong';
        fields[key] = { status, value: cell.textContent.trim() };
      });
      const heroImg = row.querySelector('.column-hero img');
      const heroImage = heroImg ? heroImg.src.replace('/heroes/', '/heroes_minimap/') : null;
      result.push({ fields, correct: row.classList.contains('guess-row-container--correct'), heroImage });
    });
    return result.reverse();
  }

  // =============== Initialization ===============

  function init() {
    const ov = document.getElementById('share-modal-overlay');
    if (!ov) return;
    document.getElementById('share-modal-close')?.addEventListener('click', close);
    document.getElementById('share-btn-download')?.addEventListener('click', download);
    document.getElementById('share-btn-copy')?.addEventListener('click', copyImage);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ov.classList.contains('share-modal-overlay--visible')) close();
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.button-share-result');
      if (!btn) return;

      // Fetch data for the statistics page directly from the banner.
      let heroName = btn.dataset.heroName || '';
      let attempts = Number(btn.dataset.attempts || 0);

      if (!heroName) {
        heroName = document.getElementById('stats-banner-hero')?.textContent.trim() || '';
      }
      if (!attempts) {
        const subtitle = document.getElementById('stats-banner-subtitle')?.textContent || '';
        const match = subtitle.match(/\d+/);
        attempts = match ? Number(match[0]) : 0;
      }

      const guesses = window._gameGuesses || _collectGuessesFromDom();
      open(guesses, heroName, attempts);
    });
  }

  return { open, close, init };
})();

// ================= Init =================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ShareModal.init);
} else {
  ShareModal.init();
}