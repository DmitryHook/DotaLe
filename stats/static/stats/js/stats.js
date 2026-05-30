// =============== API ===============

const api = {
  dates: () => fetch(`${API_BASE}dates/`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  games: (d) => fetch(`${API_BASE}games/${d}/`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  game: (d, f) => fetch(`${API_BASE}game/${d}/${f}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
};

// =============== Helpers ===============

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function formatDate(str) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = str.split('-');
  return `${months[parseInt(m)-1]} ${parseInt(d)}, ${y}`;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// =============== Sidebar ===============

async function loadSidebar() {
  const inner = document.getElementById('stats-sidebar-inner');
  try {
    const { dates } = await api.dates();
    if (!dates || !dates.length) {
      inner.innerHTML = '<div class="stats-loading">No data</div>';
      return;
    }
    inner.innerHTML = '';

    for (const date of dates) {
      const { games } = await api.games(date);
      if (!games || !games.length) continue;

      const group = document.createElement('div');
      group.className = 'stats-date-group';
      group.innerHTML = `<div class="stats-date-label">${formatDate(date)}</div>`;

      games.forEach(g => {
        if (g.result === 'in_progress') return;
        const won = g.result === 'victory';
        const isHp = g.total_score != null;
        const heroLabel = g.hero || (isHp ? 'Challenge Mode' : '?');
        const hpIcon = isHp
          ? `<span class="stats-hp-icon" title="Challenge Mode"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-icon lucide-chevrons-up"><path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/></svg></span>`
          : '';
        const item = document.createElement('div');
        item.className = 'stats-game-item';
        item.innerHTML = `
          <span class="stats-result-dot ${won ? 'won' : 'lost'}"></span>
          <div class="stats-game-info">
            <span class="stats-game-time">${g.time}</span>
            <span class="stats-game-hero">${heroLabel}</span>
          </div>
          ${hpIcon}`;
        item.dataset.date = date;
        item.dataset.filename = g.filename;
        item.addEventListener('click', () => selectGame(date, g.filename, item));
        group.appendChild(item);
      });

      inner.appendChild(group);
    }
  } catch (err) {
    inner.innerHTML = `<div class="stats-loading" style="color:#c0392b">Error: ${err.message}</div>`;
  }
}

// =============== Select game ===============

async function selectGame(date, filename, itemEl) {
  document.querySelectorAll('.stats-game-item').forEach(el => el.classList.remove('active'));
  itemEl.classList.add('active');

  document.getElementById('stats-empty').style.display = 'none';
  document.getElementById('stats-game-view').style.display = 'block';

  const list = document.getElementById('stats-guesses-list');
  const banner = document.getElementById('stats-banner');

  list.style.opacity = '0.4';
  banner.style.opacity = '0.4';

  try {
    const data = await api.game(date, filename);
    renderGame(data);
    list.style.opacity = '';
    banner.style.opacity = '';
  } catch (err) {
    list.style.opacity = '';
    banner.style.opacity = '';
    list.innerHTML = `<div class="stats-loading" style="color:#c0392b">Error: ${err.message}</div>`;
  }
}

// =============== Level separator ===============

function renderLevelSeparator(sep) {
  const lvl = sep.level ?? '?';
  const result = sep.result || 'victory';

  const label = result === 'defeat' ? `LEVEL ${lvl}` : `LEVEL ${lvl}`;

  const el = document.createElement('div');
  el.className = 'hp-level-separator' + (result === 'defeat' ? ' hp-level-separator--defeat' : '');
  el.innerHTML = `
    <div class="hp-level-separator-inner">
      <span class="hp-level-separator-line"></span>
      <span class="hp-level-separator-text">${label}</span>
      <span class="hp-level-separator-line"></span>
    </div>
  `;
  return el;
}

// =============== HP Share modal — level selection ===============

function buildHpLevels(data) {
  // All separators are placed BEFORE the guesses of the next level.
  // sep{victory, hero:X} => buffer before it = winning level (correct guess = hero),
  //                         buffer after it = guesses for level X.
  // sep{defeat,  hero:X} => buffer before it = last winning level,
  //                         buffer after it = failed guesses (hero = sep.hero = not guessed).
  // Total: level's hero = the last correct guess in its buffer.
  // for a defeat level (the final buffer) = pending_sep.hero.

  const levels = [];
  const guesses = data.guesses || [];
  let buffer = [];
  let levelNum = 1;
  let pending_sep = null;

  guesses.forEach(g => {
    if (g.__level_separator__) {
      if (buffer.length) {
        const correct = [...buffer].reverse().find(b => b.correct);
        levels.push({
          level : levelNum,
          hero : correct?.name || null,
          attempts: buffer.length,
          result : 'victory',
          guesses : [...buffer],
        });
        levelNum++;
        buffer = [];
      }
      pending_sep = g;
    } else {
      buffer.push(g);
    }
  });

  if (buffer.length) {
    const isDefeat = data.result === 'defeat';
    let hero;
    if (isDefeat && pending_sep?.result === 'defeat') {
      hero = pending_sep.hero || data.hero || null;
    } else {
      const correct = [...buffer].reverse().find(b => b.correct);
      hero = correct?.name || data.hero || null;
    }
    levels.push({
      level : levelNum,
      hero,
      attempts: buffer.length,
      result : isDefeat ? 'defeat' : 'victory',
      guesses : [...buffer],
    });
  }

  return levels;
}

// =============== HP Share picker dropdown ===============

function showHpSharePicker(data, anchorBtn) {
  const existing = document.getElementById('hp-share-level-picker');
  if (existing) { existing.remove(); return; }

  const levels = buildHpLevels(data);
  if (!levels.length) return;

  // If there is only one level, share immediately without the picker
  if (levels.length === 1) {
    triggerHpShare(data, levels[0]);
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'hp-share-level-picker';
  picker.className = 'hp-share-picker';

  levels.forEach(lvl => {
    const btn = document.createElement('button');
    btn.className = 'hp-share-picker-btn';
    btn.textContent = `Level ${lvl.level}`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.remove();
      triggerHpShare(data, lvl);
    });
    picker.appendChild(btn);
  });

  anchorBtn.parentNode.appendChild(picker);
  anchorBtn.parentNode.style.position = 'relative';

  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== anchorBtn) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 0);
}

// Share — populate window._gameGuesses with only the selected level's guesses
function triggerHpShare(data, selectedLevel) {
  // Build level guesses array in share_modal format (fields + heroImage + correct)
  const levelGuesses = (selectedLevel.guesses || []).map(g => ({
    fields : Object.fromEntries(
      Object.entries(g.fields || {}).map(([k, v]) => [k, { status: v.status, value: v.value }])
    ),
    heroImage : g.image ? g.image.replace('/heroes/', '/heroes_minimap/') : null,
    correct : g.correct || false,
  }));

  // Override _gameGuesses — share_modal will pull exactly these values
  const prevGuesses = window._gameGuesses;
  window._gameGuesses = levelGuesses;

  const isDefeat = selectedLevel.result === 'defeat';

  const heroName = isDefeat
    ? `❌ ${selectedLevel.hero || data.hero || '???'}`
    : (selectedLevel.hero || '???');

  const fakeBtn = document.createElement('button');
  fakeBtn.className = 'button-share-result';
  fakeBtn.dataset.heroName = heroName;
  fakeBtn.dataset.attempts = selectedLevel.attempts || 0;
  fakeBtn.style.display = 'none';
  document.body.appendChild(fakeBtn);
  fakeBtn.click();

  // Restore _gameGuesses after share_modal has read the data
  setTimeout(() => {
    fakeBtn.remove();
    window._gameGuesses = prevGuesses;
  }, 100);
}

// =============== Render ===============

function renderGame(data) {
  const isHp = data.total_score != null;
  const won = data.result === 'victory';
  const hero = data.hero || '?';
  const guesses = data.guesses || [];
  const attempts = data.attempts || guesses.filter(g => !g.__level_separator__).length;

  const banner = document.getElementById('stats-banner');
  banner.style.display = 'block';
  banner.className = won ? 'victory-banner' : 'victory-banner stats-defeat-banner';

  // Clean up dynamically added elements from the previous game
  document.getElementById('stats-banner-title').textContent = won ? 'Victory!' : 'Defeat';

  if (isHp) {
    const levels = buildHpLevels(data);
    const completedLevels = levels.filter(l => l.result === 'victory').length;
    const totalAttempts = levels.reduce((s, l) => s + (l.attempts || 0), 0);
    const lastWonLevel = [...levels].reverse().find(l => l.result === 'victory');
    const lastLevel = levels[levels.length - 1];

    if (!won) {
      document.getElementById('stats-banner-subtitle').innerHTML =
        `Challenge Mode · <strong>${plural(totalAttempts, 'attempt', 'attempts')}</strong>`;
      // On defeat, show the hero that wasn't guessed (from the defeat-separator)
      const defeatSep = (data.guesses || []).find(g => g.__level_separator__ && g.result === 'defeat');
      const unguessedHero = defeatSep?.hero || data.hero || null;
      document.getElementById('stats-banner-hero').textContent = unguessedHero || 'Mystery Hero';
    } else {
      document.getElementById('stats-banner-subtitle').innerHTML =
        `Challenge Mode · <strong>${plural(totalAttempts, 'attempt', 'attempts')}</strong>`;
      document.getElementById('stats-banner-hero').textContent =
        lastWonLevel?.hero || hero || '?';
    }

    // Score — separate div
    const scoreEl = document.getElementById('stats-banner-score');
    if (scoreEl) {
      if (data.total_score != null) {
        scoreEl.textContent = `Score: ${data.total_score}`;
        scoreEl.style.display = '';
      } else {
        scoreEl.style.display = 'none';
      }
    }
  } else {
    document.getElementById('stats-banner-subtitle').innerHTML =
      `Standard Mode · <strong>${plural(attempts, 'attempt', 'attempts')}</strong>`;
    document.getElementById('stats-banner-hero').textContent = hero;
    // Hide score — it's only for Challenge Mode
    const scoreEl = document.getElementById('stats-banner-score');
    if (scoreEl) scoreEl.style.display = 'none';
  }

  const buttonsEl = document.querySelector('#stats-banner .victory-buttons');
  buttonsEl.innerHTML = '';

  if (isHp) {
    const levels = buildHpLevels(data);
    if (levels.length) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'button-start-new-game hp-share-toggle-btn';
      shareBtn.textContent = 'Share';
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showHpSharePicker(data, shareBtn);
      });
      buttonsEl.appendChild(shareBtn);
    }
  } else {
    const shareBtn = document.createElement('button');
    shareBtn.className = 'button-start-new-game button-share-result';
    shareBtn.textContent = 'Share';
    shareBtn.dataset.heroName = hero;
    shareBtn.dataset.attempts = attempts;
    buttonsEl.appendChild(shareBtn);
  }

  // Guesses list
  const firstGuess = guesses.find(g => !g.__level_separator__);
  const fieldKeys = firstGuess
    ? Object.keys(firstGuess.fields || {})
    : ['gender','species','position','attribute','attack_type','complexity','date'];

  const list = document.getElementById('stats-guesses-list');
  list.innerHTML = '';

  // Challenge mode: chronological order; standard game: reverse order
  const ordered = isHp ? guesses : [...guesses].reverse();

  ordered.forEach(g => {
    if (g.__level_separator__) {
      list.appendChild(renderLevelSeparator(g));
      return;
    }

    const row = document.createElement('div');
    row.className = `guess-row-container${g.correct ? ' guess-row-container--correct' : ''}`;

    // hero cell
    const heroCol = document.createElement('div');
    heroCol.className = 'table-column column-hero';
    heroCol.innerHTML = g.image
      ? `<img src="${g.image}" alt="${g.name}" class="hero-image-avatar">`
      : `<div class="hero-avatar-placeholder">${(g.name || '?')[0]}</div>`;
    heroCol.innerHTML += `<span class="hero-display-name">${g.name || '?'}</span>`;
    row.appendChild(heroCol);

    // field cells — same classes as index.html template loop
    fieldKeys.forEach(key => {
      const f = (g.fields || {})[key] || { value: '—', status: 'wrong' };
      const col = document.createElement('div');
      col.className = `table-column table-field-cell cell-status-${f.status}`;
      col.innerHTML = `<span class="field-value-text">${formatValue(f.value)}</span>`;
      row.appendChild(col);
    });

    list.appendChild(row);
  });

  if (!ordered.filter(g => !g.__level_separator__).length) {
    list.innerHTML = '<div class="stats-loading">No guesses</div>';
  }
}

// =============== Keyboard navigation ===============

function getGameItems() {
  return Array.from(document.querySelectorAll('.stats-game-item'));
}

function getActiveIndex(items) {
  return items.findIndex(el => el.classList.contains('active'));
}

function activateItem(items, index) {
  if (!items.length) return;
  index = Math.max(0, Math.min(index, items.length - 1));
  const item = items[index];

  const date = item.dataset.date;
  const filename = item.dataset.filename;
  if (!date || !filename) return;

  selectGame(date, filename, item);

  item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;

  const items = getGameItems();
  if (!items.length) return;

  e.preventDefault();

  const current = getActiveIndex(items);

  if (e.key === 'ArrowDown') {
    activateItem(items, current === -1 ? 0 : current + 1);
  } else if (e.key === 'ArrowUp') {
    activateItem(items, current === -1 ? items.length - 1 : current - 1);
  } else if (e.key === 'Enter') {
    if (current !== -1) activateItem(items, current);
  }
});

// =============== Init ===============

loadSidebar();