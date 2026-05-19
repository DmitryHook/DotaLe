/* ══════════════════════════════════════════════════════
   DotaLe — game.js | Game logic: search, attempts, hints
══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (CONFIGURATION.isGameWon) return; // If the game has already been won, the script does not initialize.

  // ========================= DOM Elements =========================

  const heroSearchInput = document.getElementById('hero-search-input');
  const heroSearchButton = document.getElementById('hero-search-button');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const guessesHistoryList = document.getElementById('guesses-history-list');
  const notificationToast = document.getElementById('notification-toast');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalContentBody = document.getElementById('modal-content-body');

  // ========================= State =========================

  let currentAutocompleteResults = []; // Hero selection list
  let selectedAutocompleteIndex = -1; // Current selection index
  let autocompleteDebounceTimer = null;

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

    FIELD_DISPLAY_ORDER.forEach(fieldKey => {
      const fieldData = guessResult.fields[fieldKey];
      if (!fieldData) return;

      const cellElement = document.createElement('div');
      cellElement.className = `table-column table-field-cell cell-status-${fieldData.status}`;
      
      const displayValue = Array.isArray(fieldData.value) ? fieldData.value.join(', ') : fieldData.value;
      
      let cellInnerHtml = `<span class="field-value-text">${displayValue}</span>`;
      
      cellElement.innerHTML = cellInnerHtml;
      rowElement.appendChild(cellElement);
    });

    guessesHistoryList.prepend(rowElement);
  }

  // ========================= Modal / Templates =========================

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

    // Click on hint
    document.querySelectorAll('.hint-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        if (!slot.classList.contains('hint-slot--active')) return;
        const hintContent = buildHintModalContent(slot);
        openHintModal(hintContent);
      });
    });

  }

  // ========================= Initialization =========================

  function initializeGame() {
    initializeEventListeners();
    updateHintStatusLabels(CONFIGURATION.attemptsInitialCount);
  }

  initializeGame();

})();