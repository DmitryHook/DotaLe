/* ══════════════════════════════════════════════════════
   DotaLe — game.js | Game logic: search, attempts, hints
══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ========================= DOM Elements (shared) =========================

  const modalOverlay = document.getElementById('modal-overlay');
  const modalContentBody = document.getElementById('modal-content-body');

  // ========================= Hint Modal / Templates =========================

  function openHintModal(contentHtml) {
    if (!modalOverlay || !modalContentBody) return;
    modalContentBody.innerHTML = contentHtml;
    modalOverlay.classList.add('modal-overlay--visible');
  }

  function buildHintModalContent(hintSlotElement) {
    const hintType = hintSlotElement.dataset.hintType;

    if (hintType === 'quote') {
      const text = hintSlotElement.dataset.text;
      const audioUrl = hintSlotElement.dataset.mp3;
      return `
        <div class="modal-quote-container">
          <p class="modal-quote-text">«${text}»</p>
          ${audioUrl ? `<audio controls class="modal-audio-player"><source src="${audioUrl}" type="audio/mpeg"></audio>` : ''}
        </div>`;
    }

    if (hintType === 'ability') {
      const name = hintSlotElement.dataset.name.replace(/\.png$/i, '');
      const iconUrl = hintSlotElement.dataset.icon;
      return `
        <div class="modal-ability-container">
          ${iconUrl ? `<img src="${iconUrl}" alt="${name}" class="modal-ability-icon">` : ''}
          <span class="modal-ability-name">${name}</span>
        </div>`;
    }

    if (hintType === 'loading-screen') {
      const imageUrl = hintSlotElement.dataset.image;
      return `<img src="${imageUrl}" alt="Loading screen" class="modal-loading-screen-image">`;
    }

    return '';
  }

  // ========================= Hint Slots — always initialized =========================

  function initializeHintSlots() {
    document.querySelectorAll('.hint-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        if (!slot.classList.contains('hint-slot--active')) return;
        openHintModal(buildHintModalContent(slot));
      });
    });

    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove('modal-overlay--visible');
    });
  }

  initializeHintSlots();

  // If the game has already been won, the script does not initialize further.
  if (CONFIGURATION.isGameWon) return;

  // ========================= DOM Elements =========================

  const heroSearchInput = document.getElementById('hero-search-input');
  const heroSearchButton = document.getElementById('hero-search-button');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const guessesHistoryList = document.getElementById('guesses-history-list');
  const notificationToast = document.getElementById('notification-toast');

  // ========================= State =========================

  let currentAutocompleteResults = []; // Hero selection list
  let selectedAutocompleteIndex = -1; // Current selection index
  let autocompleteDebounceTimer = null;
  let guessesHistory = []; // Guesses history for share modal

  // ========================= Notifications =========================

  function displayNotificationToast(message, type = 'info') {
    notificationToast.textContent = message;
    notificationToast.className = `notification-toast notification-toast--visible notification-toast--${type}`;

    clearTimeout(notificationToast._hideTimer);
    notificationToast._hideTimer = setTimeout(() => {
      notificationToast.classList.remove('notification-toast--visible');
    }, 3000);
  }

  // ========================= Autocomplete =========================

  function renderAutocompleteDropdown(results) {
    currentAutocompleteResults = results;
    selectedAutocompleteIndex = -1;

    if (!results.length) {
      autocompleteDropdown.innerHTML = '';
      autocompleteDropdown.classList.remove('autocomplete-dropdown--open');
      return;
    }

    autocompleteDropdown.innerHTML = results.map((hero, index) => `
      <div class="autocomplete-item" data-index="${index}">
        ${hero.image
          ? `<img src="${hero.image}" alt="${hero.name}">`
          : `<div class="autocomplete-placeholder-icon">${hero.name[0]}</div>`
        }
        <span>${hero.name}</span>
      </div>
    `).join('');
    autocompleteDropdown.classList.add('autocomplete-dropdown--open');
  }

  function closeAutocompleteDropdown() {
    autocompleteDropdown.classList.remove('autocomplete-dropdown--open');
    autocompleteDropdown.innerHTML = '';
    currentAutocompleteResults = [];
    selectedAutocompleteIndex = -1;
  }

  async function fetchHeroAutocomplete(query) {
    if (!query) {
      closeAutocompleteDropdown();
      return;
    }
    try {
      const response = await fetch(`/api/search/?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      renderAutocompleteDropdown(data.results || []);
    } catch (error) {
      console.error('Error searching for heroes:', error);
      closeAutocompleteDropdown();
    }
  }

  function selectHeroFromAutocomplete(index) {
    const hero = currentAutocompleteResults[index];
    if (!hero) return;

    heroSearchInput.value = hero.name;
    closeAutocompleteDropdown();
    handleGuessSubmission();
  }

  function updateAutocompleteHighlight() {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((element, index) => {
      element.classList.toggle('autocomplete-item--selected', index === selectedAutocompleteIndex);
    });
  }

  // ========================= Guess Handler =========================

  async function handleGuessSubmission() {
    const heroName = heroSearchInput.value.trim();

    if (!heroName) {
      displayNotificationToast('Enter hero name or select from the list', 'error');
      return;
    }
    
    // Disabling the button during the request
    heroSearchButton.disabled = true;
    heroSearchButton.textContent = '...';

    try {
      const response = await fetch('/api/guess/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': CONFIGURATION.csrfToken,
        },
        body: JSON.stringify({
          hero_name: heroName
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        displayNotificationToast(data.error || 'An error occurred while submitting your attempt', 'error');
        return;
      }

      appendNewGuessToHistoryTable(data.result);
      guessesHistory.unshift(data.result);

      // Send data to share modal without animation race condition
      window._gameGuesses = [...guessesHistory].reverse().map(g => ({
        fields: Object.fromEntries(
          Object.entries(g.fields).map(([k, v]) => [k, { status: v.status, value: v.value }])
        ),
        heroImage: g.image ? g.image.replace('/heroes/', '/heroes_minimap/') : null,
        correct: g.correct,
      }));

      if (data.hints) {
        updateHintsVisualState(data.hints);
      }

      if (data.hint_params) {
        CONFIGURATION.hintParams = data.hint_params;
      }
      updateHintStatusLabels(data.attempt_count);

      heroSearchInput.value = '';

      if (data.won) {
        showVictoryBanner(data.revealed_name, data.attempt_count);
      }

    } catch (err) {
      displayNotificationToast('Server connection error', 'error');
    } finally {
      heroSearchButton.disabled = false;
      heroSearchButton.textContent = '▶';
    }
  }

  function appendNewGuessToHistoryTable(guessResult) {
    const rowElement = document.createElement('div');
    rowElement.className = 'guess-row-container' + (guessResult.correct ? ' guess-row-container--correct' : '');

    const heroCell = document.createElement('div');
    heroCell.className = 'table-column column-hero';
    if (guessResult.image) {
      heroCell.innerHTML = `<img src="${guessResult.image}" alt="${guessResult.name}" class="hero-image-avatar">`;
    } else {
      heroCell.innerHTML = `<div class="hero-avatar-placeholder">${guessResult.name[0]}</div>`;
    }
    heroCell.innerHTML += `<span class="hero-display-name">${guessResult.name}</span>`;
    rowElement.appendChild(heroCell);

    // Attributes cells in display order
    const FIELD_DISPLAY_ORDER = [
      'gender', 'species', 'position', 'attribute',
      'attack_type', 'complexity', 'date'
    ];

    const cellsData = FIELD_DISPLAY_ORDER.map(fieldKey => {
      const fieldData = guessResult.fields[fieldKey];
      const displayValue = Array.isArray(fieldData.value) ? fieldData.value.join(', ') : fieldData.value;

      const cellElement = document.createElement('div');
      cellElement.className = 'table-column table-field-cell';
      cellElement.style.background = 'var(--color-background-tertiary)';
      cellElement.style.border = '1px solid var(--color-border-standard)';
      cellElement.innerHTML = `<span class="field-value-text" style="visibility:hidden">${displayValue}</span>`;

      rowElement.appendChild(cellElement);
      return { cellElement, fieldData, displayValue };
    });

    guessesHistoryList.prepend(rowElement);
    // Animation code
    requestAnimationFrame(() => {
      cellsData.forEach(({ cellElement, fieldData, displayValue }, i) => {
        setTimeout(() => {
          if (cellElement._animTimer) {
            clearTimeout(cellElement._animTimer);
            cellElement._animTimer = null;
          }
          
          // 1: Remove the transition and reset to 0.
          cellElement.style.transition = 'none';
          cellElement.style.transform = 'rotateY(0deg)';

          // 2: Wait 2 frames so the browser definitely applies the changes.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              cellElement.style.transition = 'transform 0.15s ease-in';
              cellElement.style.transform = 'rotateY(90deg)';

              cellElement._animTimer = setTimeout(() => {
                cellElement._animTimer = null;
                cellElement.className = `table-column table-field-cell cell-status-${fieldData.status}`;
                cellElement.style.background = '';
                cellElement.style.border = '';
                cellElement.innerHTML = `<span class="field-value-text">${displayValue}</span>`;

                cellElement.style.transition = 'transform 0.15s linear';
                cellElement.style.transform = 'rotateY(0deg)';
              }, 150);
            });
          });
        }, i * 350);
      });
    });
  }

  // ========================= Update UI =========================

  function updateHintStatusLabels(currentAttempts) {
    const updateLabel = (id, threshold) => {
      const remaining = Math.max(0, threshold - currentAttempts);
      const element = document.querySelector(`#${id} .hint-status-message`);
      if (!element) return;

      if (remaining === 0) {
        element.textContent = 'Click to open';
      } else {
        const word = remaining === 1 ? 'attempt' : 'attempts';
        element.textContent = `${remaining} ${word} left`;
      }
    };

    updateLabel('hint-quote', 4);
    updateLabel('hint-ability', 8);
    updateLabel('hint-loading-screen', 12);
  }

  function updateHintsVisualState(hintsData) {
    if (hintsData.quote) {
      const slot = document.getElementById('hint-quote');
      slot.classList.add('hint-slot--active');
      slot.dataset.text = hintsData.quote.text || '';
      slot.dataset.mp3 = hintsData.quote.mp3 || '';
    }
    if (hintsData.ability) {
      const slot = document.getElementById('hint-ability');
      slot.classList.add('hint-slot--active');
      slot.dataset.name = hintsData.ability.name || '';
      slot.dataset.icon = hintsData.ability.icon || '';
    }
    if (hintsData.loading_screen) {
      const slot = document.getElementById('hint-loading-screen');
      slot.classList.add('hint-slot--active');
      slot.dataset.image = hintsData.loading_screen.image || '';
    }
  }

  // ========================= Victory =========================

  function showVictoryBanner(heroName, attemptsCount) {
    const mainContainer = document.querySelector('.game-container');
    const searchSection = document.getElementById('search-section');
    const template = document.getElementById('tpl-victory-banner');

    if (searchSection) searchSection.remove();

    if (template) {
      const clone = template.content.cloneNode(true);
      clone.querySelector('[data-attempts]').textContent = attemptsCount;
      clone.querySelector('[data-attempts-word]').textContent = attemptsCount === 1 ? 'attempt' : 'attempts';
      clone.querySelector('[data-hero-name]').textContent = heroName;
      clone.querySelector('[data-reset-href]').href = CONFIGURATION.resetUrl || '/reset/';

      const shareBtn = clone.querySelector('.button-share-result');
      if (shareBtn) {
        shareBtn.dataset.heroName = heroName;
        shareBtn.dataset.attempts = attemptsCount;
      }

      mainContainer.insertBefore(clone, mainContainer.firstChild);
    }

    displayNotificationToast('Success!', 'success');
  }

  // ========================= Event Listeners =========================

  function initializeEventListeners() {
    heroSearchInput.addEventListener('input', () => {
      const query = heroSearchInput.value.trim();
      clearTimeout(autocompleteDebounceTimer);
      autocompleteDebounceTimer = setTimeout(() => fetchHeroAutocomplete(query), 250);
    });

    // Reopen dropdown on focus if input already has a value
    heroSearchInput.addEventListener('focus', () => {
      const query = heroSearchInput.value.trim();
      if (query) fetchHeroAutocomplete(query);
    });

    // Close dropdown when input loses focus (e.g. switching monitors/windows).
    // Delay lets a mousedown on an autocomplete item fire first.
    heroSearchInput.addEventListener('blur', () => {
      setTimeout(closeAutocompleteDropdown, 150);
    });

    // Navigation with keyboard in autocomplete
    heroSearchInput.addEventListener('keydown', (event) => {
      const resultsCount = currentAutocompleteResults.length;
      if (!resultsCount) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedAutocompleteIndex = (selectedAutocompleteIndex + 1) % resultsCount;
        updateAutocompleteHighlight();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedAutocompleteIndex = (selectedAutocompleteIndex - 1 + resultsCount) % resultsCount;
        updateAutocompleteHighlight();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedAutocompleteIndex >= 0) {
          selectHeroFromAutocomplete(selectedAutocompleteIndex);
        } else if (resultsCount === 1) {
          selectHeroFromAutocomplete(0);
        } else {
          handleGuessSubmission();
        }
      } else if (event.key === 'Escape') {
        closeAutocompleteDropdown();
      }
    });

    autocompleteDropdown.addEventListener('mousedown', (event) => {
      const item = event.target.closest('.autocomplete-item');
      if (!item) return;
      event.preventDefault();
      const index = parseInt(item.dataset.index, 10);
      selectHeroFromAutocomplete(index);
    });

    heroSearchButton.addEventListener('click', handleGuessSubmission);

    // Close autocomplete on click outside
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.search-section')) {
        closeAutocompleteDropdown();
      }
    });
  }

  // ========================= Initialization =========================

  function initializeGame() {
    initializeEventListeners();
    updateHintStatusLabels(CONFIGURATION.attemptsInitialCount);
  }

  initializeGame();

})();