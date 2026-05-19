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
        const won = g.result === 'victory';
        const item = document.createElement('div');
        item.className = 'stats-game-item';
        item.innerHTML = `
          <span class="stats-result-dot ${won ? 'won' : 'lost'}"></span>
          <div class="stats-game-info">
            <span class="stats-game-time">${g.time}</span>
            <span class="stats-game-hero">${g.hero || '?'}</span>
          </div>
          <span class="stats-game-attempts">${g.attempts || '?'}</span>`;
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

// =============== Render ===============

function renderGame(data) {
  const won = data.result === 'victory';
  const hero = data.hero || '?';
  const attempts = data.attempts || (data.guesses || []).length;
  const guesses = data.guesses || [];

  const banner = document.getElementById('stats-banner');
  banner.style.display = 'block';
  banner.className = won ? 'victory-banner' : 'victory-banner stats-defeat-banner';
  document.getElementById('stats-banner-title').textContent = won ? 'Victory!' : 'Defeat';
  document.getElementById('stats-banner-subtitle').innerHTML =
    `Guessed in <strong>${plural(attempts, 'attempt', 'attempts')}</strong>`;
  document.getElementById('stats-banner-hero').textContent = hero;

  guesses.reverse();

  const fieldKeys = guesses.length
    ? Object.keys(guesses[0].fields || {})
    : ['gender','species','position','attribute','attack_type','complexity','date'];

  const list = document.getElementById('stats-guesses-list');
  list.innerHTML = '';

  guesses.forEach(g => {
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

  if (!guesses.length) {
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