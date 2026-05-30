(function () {
  'use strict';

  const FILTER_KEYS = ['gender', 'species', 'position', 'attribute',
                       'attack_type', 'complexity', 'date'];
  const ARRAY_FIELDS = new Set(['species', 'position']);

  const filters = {};

  // =============== Filter Initialiazation ===============

  function initFilters() {
    FILTER_KEYS.forEach(k => { filters[k] = { include: new Set(), exclude: new Set() }; });
  }
  initFilters();

  let allHeroes = [];
  let loaded = false;
  let savedFilters = null;

  let allGuesses = [];
  let guessedNames = new Set();

  const $ = id => document.getElementById(id);

  // =============== Initialization ===============

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof CONFIGURATION !== 'undefined') {
      if (Array.isArray(CONFIGURATION.guessedHeroNames)) {
        guessedNames = new Set(CONFIGURATION.guessedHeroNames);
      }
    }

    const guessesEl = document.getElementById('enc-guesses-data');
    if (guessesEl) {
      try {
        let parsed = JSON.parse(guessesEl.textContent);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        allGuesses = Array.isArray(parsed) ? parsed : [];
      } catch(e) {
        console.warn('[Encyclopedia] Failed to parse guesses:', e);
        allGuesses = [];
      }
    }

    const triggerBtn = $('enc-trigger-btn');
    if (triggerBtn) triggerBtn.addEventListener('click', openEncyclopedia);

    const closeBtn = $('enc-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEncyclopedia);

    const overlay = $('enc-overlay');
    if (overlay) overlay.addEventListener('click', e => {
      if (e.target === overlay) closeEncyclopedia();
    });

    document.addEventListener('keydown', e => {
      const ov = $('enc-overlay');
      if (!ov || !ov.classList.contains('enc-open')) return;
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') { closeEncyclopedia(); return; }
      if (e.code === 'KeyR') { e.preventDefault(); resetFilters(); return; }
      if (e.code === 'KeyQ') { e.preventDefault(); restoreFilters(); return; }
      if (e.code === 'KeyG') { e.preventDefault(); applyFromGuesses(); return; }
    });

    $('enc-reset-filters') && $('enc-reset-filters').addEventListener('click', resetFilters);
    $('enc-restore-filters') && $('enc-restore-filters').addEventListener('click', restoreFilters);
    $('enc-apply-guesses-filters') && $('enc-apply-guesses-filters').addEventListener('click', applyFromGuesses);
  });

  // =============== Window Modal ===============

  function openEncyclopedia() {
    const overlay = $('enc-overlay');
    if (!overlay) return;
    overlay.classList.add('enc-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (!loaded) fetchHeroes();
  }

  function closeEncyclopedia() {
    const overlay = $('enc-overlay');
    if (!overlay) return;
    overlay.classList.remove('enc-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // =============== Fetch Heroes ===============

  function fetchHeroes() {
    let url = '/encyclopedia/';
    if (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.encyclopediaUrl) {
      url = CONFIGURATION.encyclopediaUrl;
    }
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        allHeroes = Array.isArray(data.heroes) ? data.heroes : [];
        loaded = true;
        buildAllChips();
        renderGrid();
      })
      .catch(err => {
        console.error('[Encyclopedia] fetch error:', err);
        const g = $('enc-grid');
        if (g) g.innerHTML = '<div class="enc-no-results" style="color:rgba(255,100,100,0.8)">Failed to load heroes.</div>';
      });
  }

  // =============== Building Global Values ===============
  
  function buildAllChips() {
    const sets = {};
    FILTER_KEYS.forEach(k => { sets[k] = new Set(); });

    allHeroes.forEach(hero => {
      ARRAY_FIELDS.forEach(k => {
        const arr = Array.isArray(hero[k]) ? hero[k] : (hero[k] ? [hero[k]] : []);
        arr.forEach(v => { if (v) sets[k].add(String(v).trim()); });
      });
      FILTER_KEYS.forEach(k => {
        if (!ARRAY_FIELDS.has(k) && hero[k] != null) sets[k].add(String(hero[k]).trim());
      });
    });

    const CUSTOM_ORDERS = {
      gender: ['Male', 'Female', 'Other'],
      position: ['Carry', 'Midlane', 'Offlane', 'Support', 'Hard Support'],
      attribute: ['Strength', 'Agility', 'Intelligence', 'Universal'],
      attack_type: ['Melee', 'Ranged'],
      complexity: ['Easy', 'Medium', 'Hard'],
    }

    FILTER_KEYS.forEach(k => {
      const container = $(`enc-chips-${k}`);
      if (!container) { console.warn('[Enc] missing container:', k); return; }
      
      let values;

      if (CUSTOM_ORDERS[k]) {
        const order = CUSTOM_ORDERS[k];
        values = [...sets[k]].sort((a, b) => {
          const indexA = order.indexOf(a);
          const indexB = order.indexOf(b);
          
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          
          return indexA - indexB;
        });
      } else if (k === 'date') {
        values = [...sets[k]].sort((a, b) => Number(a) - Number(b));
      } else {
        values = [...sets[k]].sort();
      }
      container.innerHTML = '';
      values.forEach(v => container.appendChild(makeChip(v, v, k)));
    });
  }

  // =============== Chip Factory =============== 

  function makeChip(label, value, filterKey) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'enc-chip';
    btn.dataset.value = value;
    btn.textContent = label;

    btn.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('click', e => { e.preventDefault(); toggleFilter(filterKey, value, 'include'); });
    btn.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); toggleFilter(filterKey, value, 'exclude'); });

    return btn;
  }

  // =============== Filter Toggling Logic ===============

  function toggleFilter(filterKey, value, mode) {
    const f = filters[filterKey];

    const MULTI_INCLUDE_FIELDS = new Set(['species', 'position']);
    const isMultiInclude = MULTI_INCLUDE_FIELDS.has(filterKey);

    if (mode === 'include') {
      f.exclude.delete(value);

      if (isMultiInclude) {
        if (f.include.has(value)) {
          f.include.delete(value);
        } else {
          f.include.add(value);
        }
      } else {
        if (f.include.has(value)) {
          f.include.delete(value);
        } else {
          f.include.clear();
          f.include.add(value);
        }
      }
    } else {
      f.include.delete(value);
      if (f.exclude.has(value)) {
        f.exclude.delete(value);
      } else {
        f.exclude.add(value);
      }
    }

    syncChips(filterKey);
    renderGrid();
  }

  // =============== Apply From Guesses ===============

  function applyFromGuesses() {
    if (!allGuesses || allGuesses.length === 0) return;

    const tempIncludes = {};
    const tempExcludes = {};
    FILTER_KEYS.forEach(k => {
      tempIncludes[k] = new Set();
      tempExcludes[k] = new Set();
    });

    allGuesses.forEach(guess => {
      if (!guess.fields) return;

      FILTER_KEYS.forEach(k => {
        const field = guess.fields[k];
        if (!field || !field.status) return;

        const status = field.status;
        let values = [];

        if (ARRAY_FIELDS.has(k)) {
          if (Array.isArray(field.value)) {
            values = field.value.map(v => String(v).trim()).filter(Boolean);
          } else if (typeof field.value === 'string') {
            values = field.value.split(',').map(v => v.trim()).filter(Boolean);
          }
        } else {
          if (field.value != null) {
            values = [String(field.value).trim()];
          }
        }

        values.forEach(v => {
          if (status === 'correct') {
            tempIncludes[k].add(v);
            tempExcludes[k].delete(v);
          } else if (status === 'wrong') {
            if (!tempIncludes[k].has(v)) {
              tempExcludes[k].add(v);
            }
          }
        });
      });
    });

    FILTER_KEYS.forEach(k => {
      filters[k].include = tempIncludes[k];
      filters[k].exclude = tempExcludes[k];
    });

    syncAllChips();
    renderGrid();
  }

  // =============== Chip Visual Sync ===============

  function syncChips(filterKey) {
    const container = $(`enc-chips-${filterKey}`);
    if (!container) return;
    const f = filters[filterKey];

    container.querySelectorAll('.enc-chip').forEach(chip => {
      const v = chip.dataset.value;
      chip.classList.remove('enc-chip--active', 'enc-chip--exclude');
      if (f.include.has(v)) chip.classList.add('enc-chip--active');
      else if (f.exclude.has(v)) chip.classList.add('enc-chip--exclude');
    });
  }

  function syncAllChips() { FILTER_KEYS.forEach(syncChips); }

  // =============== Serialization ===============

  function serializeFilters() {
    const snap = {};
    FILTER_KEYS.forEach(k => {
      snap[k] = { include: [...filters[k].include], exclude: [...filters[k].exclude] };
    });
    return snap;
  }

  function applySnapshot(snap) {
    FILTER_KEYS.forEach(k => {
      if (!snap[k]) return;
      filters[k].include = new Set(snap[k].include || []);
      filters[k].exclude = new Set(snap[k].exclude || []);
    });
  }

  function filtersAreEmpty() {
    return FILTER_KEYS.every(k => filters[k].include.size === 0 && filters[k].exclude.size === 0);
  }

  function snapshotIsEmpty(snap) {
    if (!snap) return true;
    return FILTER_KEYS.every(k => !snap[k] || (snap[k].include.length === 0 && snap[k].exclude.length === 0));
  }

  // =============== Clear / Restore ===============

  function resetFilters() {
    if (!filtersAreEmpty()) savedFilters = serializeFilters();
    FILTER_KEYS.forEach(k => { filters[k].include.clear(); filters[k].exclude.clear(); });
    syncAllChips();
    renderGrid();
  }

  function restoreFilters() {
    if (!savedFilters || snapshotIsEmpty(savedFilters)) return;
    applySnapshot(savedFilters);
    syncAllChips();
    renderGrid();
  }

  // =============== Hero Matching Logic ===============

  function hasAnyFilter() {
    return FILTER_KEYS.some(k => filters[k].include.size > 0 || filters[k].exclude.size > 0);
  }

  function heroMatches(hero) {
    for (const k of FILTER_KEYS) {
      const f = filters[k];
      if (f.include.size === 0 && f.exclude.size === 0) continue;
      const heroVals = Array.isArray(hero[k]) ? hero[k].map(String) : [String(hero[k] ?? '')];
      if (f.include.size > 0 && ![...f.include].every(v => heroVals.includes(v))) return false;
      if (f.exclude.size > 0 && [...f.exclude].some(v => heroVals.includes(v))) return false;
    }
    return true;
  }

  // =============== Grid Rendering ===============

  function renderGrid() {
    const grid = $('enc-grid');
    const countEl = $('enc-count');
    if (!grid) return;

    grid.innerHTML = '';

    if (!loaded) {
      grid.innerHTML = '<div class="enc-loading"><div class="enc-spinner"></div><span>Loading heroes...</span></div>';
      return;
    }

    const filterOn = hasAnyFilter();
    let shown = 0;

    allHeroes.forEach(hero => {
      if (filterOn && !heroMatches(hero)) return;
      grid.appendChild(buildCard(hero));
      shown++;
    });

    if (countEl) {
      countEl.textContent = filterOn
        ? `${shown} of ${allHeroes.length} heroes`
        : `${allHeroes.length} heroes`;
    }

    if (shown === 0 && allHeroes.length > 0) {
      const msg = document.createElement('div');
      msg.className = 'enc-no-results';
      msg.textContent = 'No heroes match the selected filters.';
      grid.appendChild(msg);
    }
  }

  // =============== Hero Card Building ===============

  function buildCard(hero) {
    const card = document.createElement('div');
    card.className = 'enc-hero-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'enc-hero-img-wrap';

    if (hero.image) {
      const img = document.createElement('img');
      img.src = hero.image;
      img.alt = hero.name;
      img.className = 'enc-hero-img';
      img.loading = 'lazy';
      img.onerror = function () {
        this.parentElement.innerHTML = `<div class="enc-hero-placeholder">${hero.name[0]}</div>`;
      };
      imgWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'enc-hero-placeholder';
      ph.textContent = hero.name[0];
      imgWrap.appendChild(ph);
    }

    card.appendChild(imgWrap);

    const nameEl = document.createElement('span');
    nameEl.className = 'enc-hero-name';
    nameEl.textContent = hero.name;
    card.appendChild(nameEl);

    return card;
  }

  window.openEncyclopedia = openEncyclopedia;

  // =============== Global Guesses Hook ===============

  window.registerEncyclopediaGuess = function(guessData) {
    if (!guessData || !guessData.fields) return;
    if (allGuesses.some(g => g === guessData)) return;
    allGuesses.push(guessData);

    if (guessData.name) guessedNames.add(guessData.name);
  };

})();