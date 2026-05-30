/* ═══════════════════════════════════════════════════════════════
   DotaLe — hp_mode.js | Challenge Mode
   Isolated module. Does not modify the standard game logic.
   State is stored in localStorage under the 'dotale_hp_mode' key.
══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORAGE_KEY = 'dotale_hp_mode';
  const gameServerConfig = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.gameSettings) ? CONFIGURATION.gameSettings : {};
  const hpServerConfig = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.hpSettings) ? CONFIGURATION.hpSettings : {};
  const MAX_HP = hpServerConfig.MAX_HP || 100;
  const INITIAL_HP = hpServerConfig.INITIAL_HP || 100;
  const MAX_LEVELS = hpServerConfig.MAX_LEVELS || 5;

  const GAME_SETTINGS = gameServerConfig.GAME_SETTINGS || gameServerConfig || {
    TOTAL_HEROES: 127,
  };

  const BASE_HP = hpServerConfig.BASE_HP || {
    HP_FOR_LEVEL: 25,
    GUESS_INPUT: -2,
    WRONG: -1,
    PARTIAL: 1,
    CORRECT_FLD: 3,
    HINT_QUOTE: -5,
    HINT_ABILITY: -10,
    HINT_SCREEN: -15,
  };

  const BASE_SCORE = hpServerConfig.BASE_SCORE || {
    LEVEL_CLEAR: 100,
    UNUSED_HERO: 10,
    HINT_QUOTE_UNUSED: 10,
    HINT_ABIL_UNUSED: 20,
    HINT_SCRN_UNUSED: 30,
    CELL_CORRECT: 2,
    CELL_PARTIAL: 1, 
    CELL_WRONG: -1,
  };

  const SCALE_HP_NEG = hpServerConfig.SCALE_HP_NEG || 1.2;
  const SCALE_HP_POS = hpServerConfig.SCALE_HP_POS || 1.05;
  const SCALE_SCORE = hpServerConfig.SCALE_SCORE || 1.1;

  // =============== Scaling Functions ===============

  function scaleHp(base, level) {
    if (level <= 1) return base;
    const factor = Math.pow(base < 0 ? SCALE_HP_NEG : SCALE_HP_POS, level - 1);
    return base < 0
      ? -Math.round(Math.abs(base) * factor)
      : Math.round(base * factor);
  }

  // Returns all HP costs for the given level hints
  function hpCosts(level) {
    const result = {};
    for (const [k, v] of Object.entries(BASE_HP)) result[k] = scaleHp(v, level);
    return result;
  }

  function scaleScore(base, level) {
    if (level <= 1) return base;
    return Math.round(base * Math.pow(SCALE_SCORE, level - 1));
  }

  // hp for clear level
  function winBonus(level) {
    return Math.max(0, Math.round(BASE_HP.HP_FOR_LEVEL - SCALE_SCORE * level));
  }

  // =============== State ===============

  /**
  * @typedef {Object} state
  * @property {boolean} active
  * @property {number} hp
  * @property {boolean} dead
  * @property {number} level - Current level (1-based)
  * @property {number} score - Accumulated score
  * @property {number} guessScoreAccum - Points earned from cells in the current round
  * @property {string} sessionStart - ISO timestamp used as the stats key
  * @property {Object} usedHints
  * @property {boolean} usedHints.quote
  * @property {boolean} usedHints.ability
  * @property {boolean} usedHints.loading_screen
  * @property {Object|null} pendingVictory
  * @property {string} pendingVictory.heroName
  * @property {number} pendingVictory.attempts
  * @property {number} pendingVictory.levelWon
  * @property {number} pendingVictory.totalScore
  */

  let state = null;

  const isActive = () => !!(state && state.active);

  function loadState() {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
    catch (_) { return null; }
  }

  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // Creates a clean initial state
  function freshState() {
    return {
      active: true,
      hp: INITIAL_HP,
      dead: false,
      defeatNotified: false,
      level: 1,
      score: 0,
      guessScoreAccum: 0,
      sessionStart: new Date().toISOString(),
      usedHints: { quote: false, ability: false, loading_screen: false },
      pendingVictory : null,
    };
  }

  // Resets the current round, keeping the active mode
  function resetRound() {
    state.hp = INITIAL_HP;
    state.dead = false;
    state.defeatNotified = false;
    state.level = 1;
    state.score = 0;
    state.guessScoreAccum = 0;
    state.sessionStart = new Date().toISOString();
    state.usedHints = { quote: false, ability: false, loading_screen: false };
    delete state.pendingVictory;
    saveState(state);
  }

  function cfg(key) {
    return (typeof CONFIGURATION !== 'undefined') ? CONFIGURATION[key] : undefined;
  }

  // Base application URL (excluding /reset/)
  function appBaseUrl() {
    return (cfg('resetUrl') || '/reset/').replace(/\/reset\/?$/, '');
  }

  // =============== HP Calculations ===============

  function calcHpDelta(guessResult) {
    const c = hpCosts(state.level);
    let delta = c.GUESS_INPUT;
    for (const { status } of Object.values(guessResult.fields || {})) {
      if (status === 'wrong') delta += c.WRONG;
      if (status === 'partial') delta += c.PARTIAL;
      if (status === 'correct') delta += c.CORRECT_FLD;
    }
    return delta;
  }

  function applyHpChange(delta, source) {
    if (!isActive() || state.dead) return;
    state.hp = Math.min(MAX_HP, state.hp + delta);
    const died = state.hp <= 0;
    if (died) { state.hp = 0; state.dead = true; }
    saveState(state);
    renderHpBar();
    if (delta !== 0) showHpDelta(delta, source);
    if (died) triggerDeath();
  }

  // =============== Score Calculations ===============

  // Triggered on every guess — updates the score in real time
  function scoreGuess(guessResult) {
    if (!isActive() || state.dead) return;
    const lvl = state.level;
    let earned = 0;
    for (const { status } of Object.values(guessResult.fields || {})) {
      if (status === 'correct') earned += scaleScore(BASE_SCORE.CELL_CORRECT, lvl);
      if (status === 'partial') earned += scaleScore(BASE_SCORE.CELL_PARTIAL, lvl);
      if (status === 'wrong') earned += scaleScore(BASE_SCORE.CELL_WRONG, lvl);
    }
    state.guessScoreAccum += earned;
    state.score = Math.max(0, state.score + earned);
    saveState(state);
  }

  function calcLevelBonus(attempts, usedHints) {
    const lvl = state.level;
    let bonus = scaleScore(BASE_SCORE.LEVEL_CLEAR, lvl);
    bonus += Math.max(0, GAME_SETTINGS.TOTAL_HEROES - attempts) * scaleScore(BASE_SCORE.UNUSED_HERO, lvl);
    if (!usedHints.quote) bonus += scaleScore(BASE_SCORE.HINT_QUOTE_UNUSED, lvl);
    if (!usedHints.ability) bonus += scaleScore(BASE_SCORE.HINT_ABIL_UNUSED, lvl);
    if (!usedHints.loading_screen) bonus += scaleScore(BASE_SCORE.HINT_SCRN_UNUSED, lvl);
    return bonus;
  }

  // =============== HP Bar UI ===============

  function createHpBar() {
    if (document.getElementById('hp-mode-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'hp-mode-bar';
    bar.className = 'hp-mode-bar';
    bar.appendChild(document.getElementById('tpl-hp-bar').content.cloneNode(true));

    const searchSection = document.getElementById('search-section');
    const tableContainer = document.querySelector('.history-table-container');

    if (searchSection?.parentNode) {
      searchSection.dataset.origMargin = searchSection.style.marginBottom || '';
      searchSection.style.marginBottom = '0';
      searchSection.parentNode.insertBefore(bar, searchSection.nextSibling);
    } else if (tableContainer?.parentNode) {
      tableContainer.parentNode.insertBefore(bar, tableContainer);
    } else {
      document.querySelector('.game-container')?.appendChild(bar);
    }
  }

  function removeHpBar() {
    document.getElementById('hp-mode-bar')?.remove();
    const ss = document.getElementById('search-section');
    if (ss && ss.dataset.origMargin !== undefined) {
      ss.style.marginBottom = ss.dataset.origMargin;
      delete ss.dataset.origMargin;
    }
  }

  function renderHpBar() {
    if (!isActive()) return;
    const fill = document.getElementById('hp-bar-fill');
    const value = document.getElementById('hp-bar-value');
    const levelEl = document.getElementById('hp-bar-level');
    const scoreEl = document.getElementById('hp-bar-score-display');
    if (!fill || !value) return;

    const pct = Math.max(0, state.hp);
    fill.style.width = pct + '%';
    value.textContent = state.hp;

    const displayLevel = state.pendingVictory ? (state.level - 1) : (state.level || 1);

    if (levelEl) levelEl.textContent = `LVL ${displayLevel || 1}`;
    if (scoreEl) scoreEl.textContent = `Score: ${state.score || 0}`;

    fill.classList.remove('hp-bar-fill--high', 'hp-bar-fill--mid', 'hp-bar-fill--low', 'hp-bar-fill--critical');
    if (pct > 70) fill.classList.add('hp-bar-fill--high');
    else if (pct > 40) fill.classList.add('hp-bar-fill--mid');
    else if (pct > 15) fill.classList.add('hp-bar-fill--low');
    else fill.classList.add('hp-bar-fill--critical');
  }

  function showHpDelta(delta, source) {
    const container = document.getElementById('hp-bar-delta');
    if (!container) return;
    const el = document.createElement('span');
    el.className = `hp-delta-popup ${delta > 0 ? 'hp-delta-popup--gain' : 'hp-delta-popup--loss'}`;
    el.textContent = (delta > 0 ? '+' : '') + delta;
    if (source) el.title = source;
    container.innerHTML = '';
    container.appendChild(el);
    setTimeout(() => el.parentNode && el.remove(), 1800);
  }

  // =============== Server Communication ===============

  function postJson(path, payload) {
    return fetch(appBaseUrl() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': cfg('csrfToken') || '' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  // Promise of the latest hp-save-level request — prevents cancel from race-overtaking save
  let _saveLevelPromise = null;

  function serverSaveLevel(levelWon, levelBonus, totalScore) {
    if (!state.sessionStart) return;
    _saveLevelPromise = postJson('/api/hp-save-level/', {
      hp_session_start: state.sessionStart,
      hp_level: levelWon,
      hp_score_earned: levelBonus,
      hp_total_score: totalScore,
    });
  }

  function serverNotifyDefeat() {
    if (!state.sessionStart) return;
    postJson('/api/hp-defeat/', {
      hp_session_start: state.sessionStart,
      hp_total_score: state.score || 0,
      hp_level: state.level,
    });
  }

  function serverNotifyRunComplete(totalScore) {
    if (!state.sessionStart) return;
    postJson('/api/hp-complete/', {
      hp_session_start: state.sessionStart,
      hp_total_score: totalScore,
    });
  }

  // =============== Defeat ===============

  function triggerDeath() {
    _hideHintTooltips();

    const ss = document.getElementById('search-section');
    if (ss) ss.remove();

    const bar = document.getElementById('hp-mode-bar');
    const tbl = document.querySelector('.history-table-container');
    if (bar && tbl && bar.nextSibling !== tbl) tbl.parentNode?.insertBefore(bar, tbl);

    document.getElementById('hp-defeat-banner')?.remove();
    
    if (!state.defeatNotified) {
      serverNotifyDefeat();
      state.defeatNotified = true;
      saveState(state);
    }

    const resetUrl = cfg('resetUrl') || '/reset/';
    const finalScore = state.score || 0;

    const banner = document.createElement('div');
    banner.id = 'hp-defeat-banner';
    banner.className = 'hp-defeat-banner';
    banner.appendChild(document.getElementById('tpl-defeat-banner').content.cloneNode(true));
    banner.querySelector('.js-defeat-level').textContent = `You ran out of HP at Level ${state.level}!`;
    banner.querySelector('.js-defeat-score').textContent = `Score: ${finalScore}`;

    banner.querySelector('.hp-defeat-restart-btn').addEventListener('click', () => {
      const dest = _resetUrl(true);
      resetRound();
      state.awaitingReset = true;
      saveState(state);
      window.location.href = dest;
    });

    document.querySelector('.game-container')?.insertBefore(banner, document.querySelector('.game-container').firstChild);
    document.getElementById('hp-mode-bar')?.classList.add('hp-mode-bar--dead');
  }

  // =============== Victory ===============

  function handleVictory(heroName, attemptCount) {
    if (!isActive() || state.dead) return;

    const levelBonus = calcLevelBonus(attemptCount, state.usedHints || {});
    state.score = Math.max(0, state.score + levelBonus);

    const bonus = winBonus(state.level);
    const hpBefore = state.hp;
    state.hp = Math.min(MAX_HP, state.hp + bonus);

    const levelWon = state.level;
    state.level += 1;
    state.usedHints = { quote: false, ability: false, loading_screen: false };
    state.guessScoreAccum = 0;
    state.pendingVictory = { heroName, attempts: attemptCount, levelWon, totalScore: state.score };
    saveState(state);

    serverSaveLevel(levelWon, levelBonus, state.score);

    const runComplete = levelWon >= MAX_LEVELS;
    if (runComplete) {
      state.pendingVictory.runComplete = true;
      saveState(state);
      serverNotifyRunComplete(state.score);
    }

    if (hpBefore !== state.hp && bonus > 0) showHpDelta(bonus, 'Victory bonus');
    renderHpBar();

    setTimeout(showVictoryBannerHp, 30);
  }

  function showVictoryBannerHp() {
    if (!isActive() || !state.pendingVictory) return;
    if (document.getElementById('hp-victory-banner')) return;

    _hideHintTooltips();

    // Hide the default banner from game.js / server
    document.querySelectorAll('.victory-banner').forEach(el => {
      if (el.id !== 'hp-defeat-banner' && el.id !== 'hp-victory-banner') el.style.display = 'none';
    });
    const srv = document.getElementById('victory-banner-server');
    if (srv) srv.style.display = 'none';

    const { heroName, attempts, levelWon, totalScore, runComplete } = state.pendingVictory;
    const resetUrl = cfg('resetUrl') || '/reset/';
    const hardResetUrl = _resetUrl(true);

    const banner = document.createElement('div');
    banner.id = 'hp-victory-banner';
    banner.className = 'victory-banner';

    if (runComplete) {
      // Final banner — all levels completed
      banner.appendChild(document.getElementById('tpl-victory-champion').content.cloneNode(true));
      banner.querySelector('.js-champion-levels').textContent = `You conquered all ${MAX_LEVELS} levels of Challenge Mode!`;
      banner.querySelector('.js-champion-hero').textContent = heroName || '';
      banner.querySelector('.js-champion-score').textContent = `Final Score: ${totalScore}`;
      const shareBtn = banner.querySelector('.js-share-btn');
      shareBtn.dataset.heroName = heroName || '???';
      shareBtn.dataset.attempts = attempts;

      // Play Again — full Challenge Mode reset, starts a new session
      banner.querySelector('.hp-play-again-btn').addEventListener('click', () => {
        state.pendingVictory = null;
        state = freshState();
        saveState(state);
        window.location.href = hardResetUrl;
      });
    } else {
      // Default banner
      banner.appendChild(document.getElementById('tpl-victory-level').content.cloneNode(true));
      const attemptsEl = banner.querySelector('.js-victory-attempts');
      attemptsEl.textContent = '';
      attemptsEl.append('You guessed the hero in ');
      const strong = document.createElement('strong');
      strong.textContent = attempts;
      attemptsEl.append(strong);
      attemptsEl.append(` ${attempts === 1 ? 'attempt' : 'attempts'}!`);
      banner.querySelector('.js-victory-hero').textContent = heroName || '';
      banner.querySelector('.js-victory-level').textContent = `Level ${levelWon} of ${MAX_LEVELS} complete`;
      banner.querySelector('.js-victory-score').textContent = `Score: ${totalScore}`;
      const shareBtn = banner.querySelector('.js-share-btn');
      shareBtn.dataset.heroName = heroName || '???';
      shareBtn.dataset.attempts = attempts;

      banner.querySelector('.hp-next-level-btn').addEventListener('click', () => {
        state.pendingVictory = null;
        saveState(state);
        const sep = resetUrl.includes('?') ? '&' : '?';
        window.location.href = `${resetUrl}${sep}hp_nl=1`;
      });
    }

    document.querySelector('.game-container')?.insertBefore(banner, document.querySelector('.game-container').firstChild);
  }

    // =============== Mode Lifecycle ===============

  function startHpMode() {
    state = freshState();
    saveState(state);
    createHpBar();
    renderHpBar();
    updateMenuButton();
    patchHintSlots();
    _refreshHintCostBadges();
    setEncyclopediaDisabled(true);
  }

  function stopHpMode() {
    clearState();
    state = null;
    removeHpBar();
    document.getElementById('hp-defeat-banner')?.remove();
    document.getElementById('hp-victory-banner')?.remove();
    // Remove HP tooltips and listeners from hint slots
    document.querySelectorAll('.hint-slot').forEach(slot => {
      slot.querySelector('.hp-hint-cost')?.remove();
      slot.removeAttribute('data-hp-tooltip');
      if (slot._hpListener) {
        slot.removeEventListener('click', slot._hpListener);
        slot._hpListener = null;
      }
    });
    const sb = document.getElementById('victory-banner-server');
    if (sb) sb.style.display = '';
    const ss = document.getElementById('search-section');
    if (ss) { ss.style.pointerEvents = ''; ss.style.opacity = ''; }
    setEncyclopediaDisabled(false);
    updateMenuButton();
  }

  function hasActiveProgress() {
    const domGuesses = document.querySelectorAll('.guess-row-container').length;
    const jsGuesses = (window._gameGuesses?.length) || 0;
    return domGuesses > 0 || jsGuesses > 0 || !!cfg('isGameWon') || !!(state?.pendingVictory) || (state?.level > 1);
  }

  function toggleHpMode() {
    if (isActive()) {
      hasActiveProgress() ? showConfirm('disable') : (closeMenu(), stopHpMode());
    } else {
      if (hasActiveProgress()) {
        showConfirm('enable');
      } else {
        closeMenu();
        startHpMode();
        state.awaitingReset = true;
        saveState(state);
        window.location.href = _resetUrl(true);
      }
    }
  }

  function closeMenu() {
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  // =============== Confirm Modals ===============

  const CONFIRM_CONFIG = {
    enable: {
      title: 'Enable Challenge Mode',
      desc: 'Current progress will be reset and a new hero will be chosen.<br>Are you sure?',
      label: 'Yes, Reset &amp; Start',
      action: () => { startHpMode(); state.awaitingReset = true; saveState(state); window.location.href = _resetUrl(true); },
    },
    disable: {
      title: 'Disable Challenge Mode',
      desc: 'Challenge Mode will be turned off and the game will reset.<br>Are you sure?',
      label: 'Yes, Disable &amp; Reset',
      action : () => {
        const cancelP = serverCancelSessionAsync();
        const dest = _resetUrl(true);
        stopHpMode();
        Promise.race([cancelP, new Promise(r => setTimeout(r, 800))])
          .then(() => { window.location.href = dest; });
      },
    },
  };

  function showConfirm(type) {
    closeMenu();
    const { title, desc, label, action } = CONFIRM_CONFIG[type];
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-content-body');
    if (!overlay || !body) { action(); return; }

    body.innerHTML = '';
    const node = document.getElementById('tpl-confirm-modal').content.cloneNode(true);
    node.querySelector('.js-confirm-title').textContent = title;
    node.querySelector('.js-confirm-desc').innerHTML = desc;
    const confirmBtn = node.querySelector('#hp-modal-confirm');
    confirmBtn.id = 'hp-modal-confirm';
    confirmBtn.innerHTML = label;
    body.appendChild(node);
    overlay.classList.add('modal-overlay--visible');

    const close = () => {
      overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => { body.innerHTML = ''; }, 300);
    };
    document.getElementById('hp-modal-cancel')?.addEventListener('click', close);
    document.getElementById('hp-modal-confirm')?.addEventListener('click', () => { close(); action(); });
  }

  // =============== State Restoration from DOM ===============

  function recalcFromDom() {
    const existing = window._gameGuesses;
    if (!existing?.length) return;
    let hp = state.hp;
    for (const g of existing) {
      const c = hpCosts(state.level);
      hp += c.GUESS_INPUT;
      for (const { status } of Object.values(g.fields || {})) {
        if (status === 'wrong') hp += c.WRONG;
        if (status === 'partial') hp += c.PARTIAL;
        if (status === 'correct') hp += c.CORRECT_FLD;
      }
      hp = Math.min(MAX_HP, hp);
      if (hp <= 0) { hp = 0; break; }
    }
    state.hp = hp;
    state.dead = hp <= 0;
    saveState(state);
    renderHpBar();
    if (state.dead) triggerDeath();
  }

  // =============== Encyclopedia ===============

  function setEncyclopediaDisabled(disabled) {
    const btn = document.getElementById('enc-trigger-btn');
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle('hp-enc-disabled', disabled);
    if (disabled) {
      btn.setAttribute('data-hp-tooltip', 'Disabled in Challenge Mode');
    } else {
      btn.removeAttribute('data-hp-tooltip');
    }
  }

  // =============== Hints ===============

  const HINT_TYPE_MAP = {
    'quote': { key: 'quote', costKey: 'HINT_QUOTE', label: 'Quote hint' },
    'ability': { key: 'ability', costKey: 'HINT_ABILITY', label: 'Ability hint' },
    'loading-screen': { key: 'loading_screen', costKey: 'HINT_SCREEN', label: 'Screen hint' },
  };

  function patchHintSlots() {
    document.querySelectorAll('.hint-slot').forEach(slot => {
      if (slot._hpListener) slot.removeEventListener('click', slot._hpListener);

      const listener = () => {
        if (!isActive() || state.dead) return;
        if (!slot.classList.contains('hint-slot--active')) return;
        if (cfg('isGameWon') || state.pendingVictory) return;

        const type = slot.dataset.hintType;
        const meta = HINT_TYPE_MAP[type];
        if (!meta) return;
        if (state.usedHints?.[meta.key]) return;

        if (!state.usedHints) state.usedHints = {};
        state.usedHints[meta.key] = true;
        saveState(state);

        const delta = hpCosts(state.level)[meta.costKey];
        if (delta) applyHpChange(delta, meta.label);

        // Hide tooltip after use
        slot.removeAttribute('data-hp-tooltip');
      };

      slot._hpListener = listener;
      slot.addEventListener('click', listener);

      // Render / update HP cost on slot
      _updateHintCostBadge(slot);
    });
  }

  function _updateHintCostBadge(slot) {
    // Remove existing DOM badge if present
    slot.querySelector('.hp-hint-cost')?.remove();

    if (!isActive() || state.dead) {
      slot.removeAttribute('data-hp-tooltip');
      return;
    }

    const type = slot.dataset.hintType;
    const meta = HINT_TYPE_MAP[type];
    if (!meta) return;

    if (state.usedHints?.[meta.key]) {
      slot.removeAttribute('data-hp-tooltip');
      return;
    }

    const costVal = hpCosts(state.level)[meta.costKey];
    if (!costVal) return;

    slot.setAttribute('data-hp-tooltip', `${costVal} HP`);
  }

  function _hideHintTooltips() {
    document.querySelectorAll('.hint-slot[data-hp-tooltip]').forEach(slot => {
      slot.dataset.hpTooltipStashed = slot.getAttribute('data-hp-tooltip');
      slot.removeAttribute('data-hp-tooltip');
    });
  }

  function _refreshHintCostBadges() {
    if (!isActive()) return;
    document.querySelectorAll('.hint-slot').forEach(_updateHintCostBadge);
  }

  function observeHintSlots() {
    const panel = document.getElementById('hints-panel');
    if (!panel) return;
    new MutationObserver(() => {
      if (isActive()) {
        patchHintSlots();
        _refreshHintCostBadges();
      }
    }).observe(panel, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  // =============== Menu Button ===============

  function updateMenuButton() {
    const btn = document.getElementById('hp-mode-menu-btn');
    const label = btn?.querySelector('.hp-mode-btn-label');
    if (!btn) return;
    const on = isActive();
    label && (label.textContent = on ? 'Challenge: ON' : 'Challenge');
    btn.classList.toggle('fx-options-item--active', on);
  }

  function injectMenuButton() {
    const menu = document.getElementById('fx-options-menu');
    if (!menu || document.getElementById('hp-mode-menu-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'fx-options-item';
    btn.id = 'hp-mode-menu-btn';
    btn.setAttribute('role', 'menuitem');
    btn.appendChild(document.getElementById('tpl-menu-btn').content.cloneNode(true));
    btn.addEventListener('click', e => { e.stopPropagation(); toggleHpMode(); });

    const resetBtn = menu.querySelector('[data-action="reset"]');
    resetBtn ? menu.insertBefore(btn, resetBtn) : menu.appendChild(btn);
    updateMenuButton();
  }

  // =============== Reset Interception ===============

  // Returns a Promise that resolves after sending cancel (or immediately if there is nothing to wait for)
  function serverCancelSessionAsync() {
    if (!state?.sessionStart) return Promise.resolve();
    const sessionStart = state.sessionStart;
    const doCancel = () => fetch(appBaseUrl() + '/api/hp-cancel/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': cfg('csrfToken') || '' },
      body: JSON.stringify({ hp_session_start: sessionStart }),
      keepalive : true,
    }).catch(() => {});
    if (_saveLevelPromise) {
      const p = _saveLevelPromise.then(doCancel, doCancel);
      _saveLevelPromise = null;
      return p;
    }
    return doCancel();
  }

  function _resetUrl(isHardReset) {
    const base = cfg('resetUrl') || '/reset/';
    const sep = base.includes('?') ? '&' : '?';
    let url = base;
    if (state?.sessionStart) url += `${sep}hp_ss=${encodeURIComponent(state.sessionStart)}`;
    if (isHardReset) url += `${url === base ? sep : '&'}hp_reset=1`;
    return url;
  }

  // Intercepts the click on the Reset confirmation button in the standard modal.
  // Resets the HP state before the page navigates to /reset/.
  function patchResetConfirm() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', e => {
      if (!e.target.closest('#fx-reset-confirm')) return;
      if (!isActive()) return;

      // If the player is dead, Reset the same as "Try Again"
      if (state.dead) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const dest = _resetUrl(true);
        resetRound();
        state.awaitingReset = true;
        saveState(state);
        window.location.href = dest;
        return;
      }

      // Intercept standard navigation: wait for cancel request before leaving
      e.stopImmediatePropagation();
      e.preventDefault();

      const cancelP = serverCancelSessionAsync();
      const dest = _resetUrl(true);
      resetRound();
      state.awaitingReset = true;
      saveState(state);

      // Wait a maximum of 800ms for the response, then redirect anyway
      Promise.race([cancelP, new Promise(r => setTimeout(r, 800))])
        .then(() => { window.location.href = dest; });
    }, true);
  }

  // =============== Fetch Interception ===============

  (function patchFetch() {
    const orig = window.fetch;

    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

      // Flag guess requests as Challenge Mode so the server skips writing standard stats
      if (isActive() && !state.dead && url.includes('/api/guess/') && args[1]?.body) {
        try {
          const body = JSON.parse(args[1].body);
          body.hp_mode_active = true;
          args[1] = { ...args[1], body: JSON.stringify(body) };
        } catch (_) {}
      }

      const response = await orig.apply(this, args);
      if (!url.includes('/api/guess/')) return response;

      response.clone().json().then(data => {
        if (!isActive() || state.dead || !data?.result) return;
        scoreGuess(data.result); // Updates the score and bar immediately
        renderHpBar();
        if (data.won) {
          handleVictory(data.revealed_name, data.attempt_count);
        } else {
          applyHpChange(calcHpDelta(data.result), 'Guess');
        }
      }).catch(() => {});

      return response;
    };
  })();

  // =============== INIT ===============

  function init() {
    injectMenuButton();
    observeHintSlots();
    patchResetConfirm();

    const saved = loadState();
    if (!saved?.active) return;

    // Migrates legacy state objects missing the new fields
    state = {
      usedHints: { quote: false, ability: false, loading_screen: false },
      level: 1,
      score: 0,
      guessScoreAccum: 0,
      sessionStart: new Date().toISOString(),
      ...saved,
    };

    // If the page is loaded after an actual /reset/ — clear the flag and start fresh
    if (state.awaitingReset) {
      delete state.awaitingReset;
      state.hp = INITIAL_HP;
      state.dead = false;
      state.score = 0;
      state.guessScoreAccum = 0;
      state.level = 1;
      state.usedHints = { quote: false, ability: false, loading_screen: false };
      delete state.pendingVictory;
      saveState(state);
    }

    createHpBar();
    renderHpBar();
    updateMenuButton();
    patchHintSlots();
    _refreshHintCostBadges();
    setEncyclopediaDisabled(true);

    if (state.pendingVictory) {
      const srv = document.getElementById('victory-banner-server');
      if (srv) srv.style.display = 'none';
      // After a server restart, the Django session is empty, so game.js failed to hide the search-section.
      // Hide it manually to prevent users from triggering a Reset while the banner is active.
      const ss = document.getElementById('search-section');
      if (ss) { ss.style.pointerEvents = 'none'; ss.style.opacity = '0'; }
      setTimeout(showVictoryBannerHp, 0);
      return;
    }

    if (state.dead) {
      triggerDeath();
      return;
    }

    const domGuesses = document.querySelectorAll('.guess-row-container').length;
    const jsGuesses = window._gameGuesses?.length || 0;
    if (domGuesses > 0 || jsGuesses > 0) recalcFromDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DotaLeHP = { toggle: toggleHpMode, getState: () => state };

})();