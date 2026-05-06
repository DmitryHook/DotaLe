// ========================= SETTINGS =========================

(function () {
  'use strict';

  const DEFAULT_VISUAL_CONFIG = {
    quote_blur: true,
    ability_blur: true,
    ability_grayscale: true,
    ability_rotate: true,
    loading_grayscale: true,
    loading_puzzle: true,
    puzzle_cols: 4,
    puzzle_rows: 4,
  };

  const STORAGE_KEY = 'dotale_fx_settings';

  function fetchPersistedSettings() {
    try {
      const storedData = localStorage.getItem(STORAGE_KEY);
      return storedData 
        ? Object.assign({}, DEFAULT_VISUAL_CONFIG, JSON.parse(storedData)) 
        : Object.assign({}, DEFAULT_VISUAL_CONFIG);
    } catch (error) { 
      // Fallback to defaults if storage is corrupted or inaccessible
      return Object.assign({}, DEFAULT_VISUAL_CONFIG); 
    }
  }

  function updateAndSaveSetting(settingKey, settingValue) {
    const settings = fetchPersistedSettings();
    settings[settingKey] = settingValue;
    
    try { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); 
    } catch (error) {
      /* Silent fail for private mode or storage limit */
    }
  }

  function getActiveConfig() { 
    return fetchPersistedSettings(); 
  }

  window.DotaLeFX = window.DotaLeFX || {};
  window.DotaLeFX.getConfig = getActiveConfig;
  window.DotaLeFX.saveSetting = updateAndSaveSetting;

})();

// ========================= EFFECTS =========================

(function () {
  'use strict';

  const getSettings = window.DotaLeFX.getConfig;

  /* — Quote blur — */
  function applyQuoteEffect(modalContainer) {
    if (!getSettings().quote_blur) return;

    const quoteElement = modalContainer.querySelector('.modal-quote-text');
    if (!quoteElement) return;

    quoteElement.classList.add('modal-quote-text--blurred');
    quoteElement.addEventListener('click', function () {
      quoteElement.classList.remove('modal-quote-text--blurred');
      quoteElement.classList.add('modal-quote-text--revealed');
    }, { once: true });
  }

  /* — Ability: grayscale + rotation — */
  function applyAbilityEffect(modalContainer) {
    const settings = getSettings();
    const iconElement = modalContainer.querySelector('.modal-ability-icon');

    if (iconElement && (settings.ability_grayscale || settings.ability_rotate)) {
      iconElement.style.visibility = 'hidden';

      function processIconStyles() {
        iconElement.classList.add('modal-ability-icon--fx');
        
        if (settings.ability_grayscale) {
          iconElement.classList.add('modal-ability-icon--grayscale');
        }

        if (settings.ability_rotate) {
          const params = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.hintParams) || {};
          const rotationDegrees = params.ability_rotation || [90, 180, 270][Math.floor(Math.random() * 3)];
          
          iconElement.style.transition = 'none';
          iconElement.style.transform  = 'rotate(' + rotationDegrees + 'deg)';
          
          /* Force reflow to apply transform without transition */
          void iconElement.offsetWidth; 
          
          iconElement.style.transition = '';
        }
        iconElement.style.visibility = '';
      }

      if (iconElement.complete && iconElement.naturalWidth) {
        processIconStyles();
      } else {
        iconElement.addEventListener('load', processIconStyles, { once: true });
      }
    }

    const nameElement = modalContainer.querySelector('.modal-ability-name');
    if (nameElement && settings.ability_blur) {
      nameElement.classList.add('modal-ability-name--blurred');
      nameElement.addEventListener('click', function () {
        nameElement.classList.remove('modal-ability-name--blurred');
        nameElement.classList.add('modal-ability-name--revealed');
      }, { once: true });
    }
  }

  /* — Loading screen: grayscale + puzzle — */
  function getShuffledArray(dataSource) {
    const arrayCopy = dataSource.slice();
    for (let i = arrayCopy.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      const temporaryValue = arrayCopy[i];
      arrayCopy[i] = arrayCopy[randomIndex];
      arrayCopy[randomIndex] = temporaryValue;
    }
    return arrayCopy;
  }

  function applyLoadingScreenEffect(modalContainer) {
    const settings = getSettings();
    if (!settings.loading_grayscale && !settings.loading_puzzle) return;

    const sourceImage = modalContainer.querySelector('.modal-loading-screen-image');
    if (!sourceImage) return;

    sourceImage.classList.add('modal-loading-screen-image--hidden');

    function renderPuzzleCanvas() {
      const globalParams = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.hintParams) || {};
      const currentSettings = getSettings();
      
      const columns = currentSettings.puzzle_cols || 4;
      const rows = currentSettings.puzzle_rows || 4;
      const gridSizeKey = columns + 'x' + rows;
      const predefinedGrids = globalParams.grids || {};
      
      const tileOrder = (predefinedGrids[gridSizeKey] && predefinedGrids[gridSizeKey].length)
        ? predefinedGrids[gridSizeKey]
        : getShuffledArray(Array.from({ length: columns * rows }, function(_, index) { return index; }));

      const imageWidth = sourceImage.naturalWidth  || 600;
      const imageHeight = sourceImage.naturalHeight || 338;

      const canvas = document.createElement('canvas');
      canvas.className = 'hint-puzzle-canvas';
      canvas.width  = imageWidth;
      canvas.height = imageHeight;

      const context = canvas.getContext('2d');
      if (settings.loading_grayscale) {
        context.filter = 'grayscale(1)';
      }

      if (settings.loading_puzzle) {
        const tileWidth = imageWidth / columns;
        const tileHeight = imageHeight / rows;

        tileOrder.forEach(function(sourceIndex, destinationIndex) {
          const sourceCol = sourceIndex % columns;
          const sourceRow = Math.floor(sourceIndex / columns);
          const destCol = destinationIndex % columns;
          const destRow = Math.floor(destinationIndex / columns);

          context.drawImage(
            sourceImage, 
            sourceCol * tileWidth, sourceRow * tileHeight, tileWidth, tileHeight, 
            destCol * tileWidth, destRow * tileHeight, tileWidth, tileHeight
          );
        });
      } else {
        context.drawImage(sourceImage, 0, 0, imageWidth, imageHeight);
      }

      sourceImage.parentNode.insertBefore(canvas, sourceImage);
    }

    if (sourceImage.complete && sourceImage.naturalWidth) {
      renderPuzzleCanvas();
    } else {
      sourceImage.addEventListener('load', renderPuzzleCanvas, { once: true });
      sourceImage.addEventListener('error', function() {
        sourceImage.classList.remove('modal-loading-screen-image--hidden');
      }, { once: true });
    }
  }

  window.DotaLeFX.applyQuoteEffect         = applyQuoteEffect;
  window.DotaLeFX.applyAbilityEffect       = applyAbilityEffect;
  window.DotaLeFX.applyLoadingScreenEffect = applyLoadingScreenEffect;

})();

// ========================= SETTINGS UI =========================

(function () {
  'use strict';

  const getSettings = window.DotaLeFX.getConfig;
  const saveSetting = window.DotaLeFX.saveSetting;

  const PUZZLE_DIFFICULTY_STEPS = [
    { rows:  1, cols:  2, label:   '2' },
    { rows:  2, cols:  2, label:   '4' },
    { rows:  2, cols:  4, label:   '8' },
    { rows:  4, cols:  4, label:  '16' },
    { rows:  4, cols:  8, label:  '32' },
    { rows:  8, cols:  8, label:  '64' },
    { rows:  8, cols: 16, label: '128' },
    { rows: 16, cols: 16, label: '256' },
  ];

  function syncPuzzleSliderVisibility(isPuzzleEnabled) {
    const sliderRow = document.getElementById('fx-puzzle-slider-row');
    if (sliderRow) {
      sliderRow.style.display = isPuzzleEnabled ? '' : 'none';
    }
  }

  function createSettingToggle(settingKey) {
    const currentSettings = getSettings();
    const labelContainer = document.createElement('label');
    labelContainer.className = 'fx-toggle';

    const checkbox = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.checked = !!currentSettings[settingKey];
    
    checkbox.addEventListener('change', function () {
      saveSetting(settingKey, checkbox.checked);
      if (settingKey === 'loading_puzzle') {
        syncPuzzleSliderVisibility(checkbox.checked);
      }
    });

    const toggleTrack = document.createElement('span');
    toggleTrack.className = 'fx-toggle-track';

    labelContainer.appendChild(checkbox);
    labelContainer.appendChild(toggleTrack);
    return labelContainer;
  }

  function createSettingsRow(labelText, descriptionText, settingKey) {
    const rowContainer = document.createElement('div');
    rowContainer.className = 'fx-settings-row';

    const infoContainer = document.createElement('div');
    infoContainer.className = 'fx-settings-row-info';

    const titleLabel = document.createElement('div');
    titleLabel.className   = 'fx-settings-row-label';
    titleLabel.textContent = labelText;
    infoContainer.appendChild(titleLabel);

    if (descriptionText) {
      const descriptionLabel = document.createElement('div');
      descriptionLabel.className   = 'fx-settings-row-desc';
      descriptionLabel.textContent = descriptionText;
      infoContainer.appendChild(descriptionLabel);
    }

    rowContainer.appendChild(infoContainer);
    rowContainer.appendChild(createSettingToggle(settingKey));
    return rowContainer;
  }

  function createSettingsGroup(groupTitle, rows) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'fx-settings-group';

    const titleElement = document.createElement('div');
    titleElement.className   = 'fx-settings-group-title';
    titleElement.textContent = groupTitle;
    groupContainer.appendChild(titleElement);

    rows.forEach(function (row) { 
      groupContainer.appendChild(row); 
    });
    
    return groupContainer;
  }

  function createPuzzleSliderRow() {
    const settings = getSettings();
    
    // Find current step based on saved rows and columns
    let activeStepIndex = PUZZLE_DIFFICULTY_STEPS.findIndex(function(step) {
      return step.rows === (settings.puzzle_rows || 4) && step.cols === (settings.puzzle_cols || 4);
    });
    
    if (activeStepIndex < 0) activeStepIndex = 1;

    const rowWrapper = document.createElement('div');
    rowWrapper.className = 'fx-puzzle-slider-row';
    rowWrapper.id = 'fx-puzzle-slider-row';
    rowWrapper.style.display = settings.loading_puzzle ? '' : 'none';

    const headerRow = document.createElement('div');
    headerRow.className = 'fx-puzzle-slider-labelrow';

    const label = document.createElement('span');
    label.className   = 'fx-settings-row-label';
    label.textContent = 'Pieces';

    const piecesBadge = document.createElement('span');
    piecesBadge.className   = 'fx-puzzle-badge';
    piecesBadge.id          = 'fx-puzzle-badge';
    piecesBadge.textContent = PUZZLE_DIFFICULTY_STEPS[activeStepIndex].label;

    headerRow.appendChild(label);
    headerRow.appendChild(piecesBadge);
    rowWrapper.appendChild(headerRow);

    const rangeInput = document.createElement('input');
    rangeInput.type  = 'range';
    rangeInput.min   = '0';
    rangeInput.max   = String(PUZZLE_DIFFICULTY_STEPS.length - 1);
    rangeInput.step  = '1';
    rangeInput.value = String(activeStepIndex);
    rangeInput.className = 'fx-puzzle-slider';
    rangeInput.id        = 'fx-puzzle-slider';

    rangeInput.addEventListener('input', function() {
      const selectedIndex = parseInt(rangeInput.value);
      const selectedStep = PUZZLE_DIFFICULTY_STEPS[selectedIndex];
      
      piecesBadge.textContent = selectedStep.label;
      saveSetting('puzzle_rows', selectedStep.rows);
      saveSetting('puzzle_cols', selectedStep.cols);
    });

    rowWrapper.appendChild(rangeInput);
    return rowWrapper;
  }

  function createSettingsModalContent() {
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'fx-modal-settings';

    const modalTitle = document.createElement('div');
    modalTitle.className   = 'fx-modal-title';
    modalTitle.textContent = 'Hint Complexity';
    mainWrapper.appendChild(modalTitle);

    mainWrapper.appendChild(createSettingsGroup('Quote', [
      createSettingsRow('Blur text', 'Click the quote to reveal it', 'quote_blur'),
    ]));

    mainWrapper.appendChild(createSettingsGroup('Ability', [
      createSettingsRow('Blur name', 'Click the name to reveal it', 'ability_blur'),
      createSettingsRow('Grayscale', 'Icon shown in black & white', 'ability_grayscale'),
      createSettingsRow('Rotation', 'Randomly rotated 90°/180°/270°', 'ability_rotate'),
    ]));

    mainWrapper.appendChild(createSettingsGroup('Loading Screen', [
      createSettingsRow('Grayscale', 'Loading screen shown in black & white', 'loading_grayscale'),
      createSettingsRow('Puzzle', 'Scrambled into pieces', 'loading_puzzle'),
      createPuzzleSliderRow(),
    ]));

    return mainWrapper;
  }

  function openSettingsModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody    = document.getElementById('modal-content-body');
    
    if (!modalOverlay || !modalBody) return;

    modalBody.innerHTML = ''; // Clear previous content
    modalBody.appendChild(createSettingsModalContent());
    modalOverlay.classList.add('modal-overlay--visible');
  }

  window.DotaLeFX.openSettingsModal = openSettingsModal;

})();

// ========================= RESET CONFIRM =========================

(function () {
  'use strict';

  function createResetConfirmationContent(resetTargetUrl) {
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'fx-modal-settings';
    contentWrapper.style.textAlign = 'center';

    const modalTitle = document.createElement('div');
    modalTitle.className = 'fx-modal-title';
    modalTitle.textContent = 'Reset Game';
    contentWrapper.appendChild(modalTitle);

    const description = document.createElement('p');
    description.style.cssText = 'margin:18px 0 24px;font-size:16px;color:var(--color-text-dimmed);line-height:1.6;';
    description.textContent = 'All progress will be lost and a new hero will be chosen. Are you sure?';
    contentWrapper.appendChild(description);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display:flex;gap:12px;justify-content:center;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = [
      'padding:10px 28px', 'font-family:Rajdhani,sans-serif', 'font-size:14px',
      'font-weight:600', 'letter-spacing:1px', 'background:transparent',
      'border:1px solid var(--color-border-standard)',
      'border-radius:var(--border-radius-standard)',
      'color:var(--color-text-dimmed)', 'cursor:pointer', 'transition:all .2s',
    ].join(';');

    cancelButton.addEventListener('mouseover', function() {
      cancelButton.style.borderColor = 'var(--color-accent-gold)';
      cancelButton.style.color = 'var(--color-accent-gold)';
    });

    cancelButton.addEventListener('mouseout', function() {
      cancelButton.style.borderColor = 'var(--color-border-standard)';
      cancelButton.style.color = 'var(--color-text-dimmed)';
    });

    cancelButton.addEventListener('click', function() {
      const modalOverlay = document.getElementById('modal-overlay');
      modalOverlay.classList.remove('modal-overlay--visible');
      
      // Clear content after the closing animation finishes
      setTimeout(function() {
        document.getElementById('modal-content-body').innerHTML = '';
      }, 250);
    });

    const confirmButton = document.createElement('a');
    confirmButton.href = resetTargetUrl;
    confirmButton.textContent = 'Yes, Reset';
    confirmButton.style.cssText = [
      'display:inline-block', 'padding:10px 28px',
      'font-family:Rajdhani,sans-serif', 'font-size:14px',
      'font-weight:700', 'letter-spacing:1px', 'text-decoration:none',
      'background:var(--color-status-error-background)',
      'border:1px solid var(--color-status-error-border)',
      'border-radius:var(--border-radius-standard)',
      'color:#f0a8a8', 'cursor:pointer', 'transition:all .2s',
    ].join(';');

    confirmButton.addEventListener('mouseover', function() {
      confirmButton.style.background = '#a02020';
    });

    confirmButton.addEventListener('mouseout', function() {
      confirmButton.style.background = 'var(--color-status-error-background)';
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    contentWrapper.appendChild(buttonContainer);

    return contentWrapper;
  }

  function interceptResetAction() {
    const resetGameButton = document.querySelector('.button-reset-game');
    if (!resetGameButton) return;

    const originalResetUrl = resetGameButton.getAttribute('href');
    
    resetGameButton.addEventListener('click', function(event) {
      event.preventDefault();
      
      const modalOverlay = document.getElementById('modal-overlay');
      const modalBody = document.getElementById('modal-content-body');
      
      // Direct redirect if modal elements are missing
      if (!modalOverlay || !modalBody) { 
        window.location.href = originalResetUrl; 
        return; 
      }

      modalBody.innerHTML = '';
      modalBody.appendChild(createResetConfirmationContent(originalResetUrl));
      modalOverlay.classList.add('modal-overlay--visible');
    });
  }

  window.DotaLeFX.interceptResetButton = interceptResetAction;

})();

// ========================= MODAL OBSERVER =========================

(function () {
  'use strict';

  const effectsAPI = window.DotaLeFX;

  // Watches for changes in the modal body and applies visual effects to new content
  function initializeModalObserver() {
    const modalBody = document.getElementById('modal-content-body');
    if (!modalBody) return;

    const modalObserver = new MutationObserver(function (mutations) {
      // Filter out internal changes caused by the effects themselves
      const hasMeaningfulContentAdded = mutations.some(function (mutation) {
        return Array.from(mutation.addedNodes).some(function (node) {
          return node.nodeType === 1 // Node.ELEMENT_NODE
            && !node.classList.contains('hint-puzzle-canvas')
            && !node.classList.contains('fx-modal-settings');
        });
      });

      if (!hasMeaningfulContentAdded) return;

      modalObserver.disconnect();

      // Double rAF to ensure the DOM has rendered and styles are recalculated
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          const modalOverlay = document.getElementById('modal-overlay');
          const isModalVisible = modalOverlay && modalOverlay.classList.contains('modal-overlay--visible');

          if (!isModalVisible) {
            modalObserver.observe(modalBody, { childList: true });
            return;
          }

          const windowElement = document.getElementById('modal-window');
          if (windowElement) {
            windowElement.classList.remove('modal-window--wide', 'modal-window--hint');
          }

          // Quote
          if (modalBody.querySelector('.modal-quote-text')) {
            effectsAPI.applyQuoteEffect(modalBody);
            if (windowElement) windowElement.classList.add('modal-window--hint');
            
            const audioPlayer = modalBody.querySelector('.modal-audio-player');
            if (audioPlayer) audioPlayer.volume = 0.25;
          }

          // Ability
          if (modalBody.querySelector('.modal-ability-container')) {
            effectsAPI.applyAbilityEffect(modalBody);
            if (windowElement) windowElement.classList.add('modal-window--hint');
          }

          // Loading screen
          if (modalBody.querySelector('.modal-loading-screen-image')) {
            effectsAPI.applyLoadingScreenEffect(modalBody);
            if (windowElement) windowElement.classList.add('modal-window--wide');
          }

          modalObserver.observe(modalBody, { childList: true });
        });
      });
    });
    modalObserver.observe(modalBody, { childList: true });
  }

  window.DotaLeFX.observeModal = initializeModalObserver;

})();


// ========================= INITIALIZATION =========================

(function () {
  'use strict';

  const effectsAPI = window.DotaLeFX;

  // Creates and injects the settings gear button into the header
  function injectSettingsButton() {
    const headerActionsContainer = document.querySelector('.header-actions');
    if (!headerActionsContainer) return;

    const settingsButton = document.createElement('button');
    settingsButton.className = 'fx-gear-button';
    settingsButton.setAttribute('aria-label', 'Hint complexity settings');
    settingsButton.title = 'Difficulty settings';
    settingsButton.innerHTML = 'Settings';
    
    settingsButton.addEventListener('click', effectsAPI.openSettingsModal);
    
    headerActionsContainer.appendChild(settingsButton);
  }

  function initializeModalClosingLogic() {
    const modalOverlay = document.getElementById('modal-overlay');
    if (!modalOverlay) return;

    modalOverlay.addEventListener('click', function (event) {
      if (event.target === modalOverlay) {
        closeAndClearModal(modalOverlay);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modalOverlay.classList.contains('modal-overlay--visible')) {
        closeAndClearModal(modalOverlay);
      }
    });
  }

  /**
   * Closes the modal and clears its content after the animation finishes
   * @param {HTMLElement} overlay - The modal overlay element
   */
  function closeAndClearModal(overlay) {
    overlay.classList.remove('modal-overlay--visible');

    setTimeout(function () {
      if (!overlay.classList.contains('modal-overlay--visible')) {
        const modalContentBody = document.getElementById('modal-content-body');
        if (modalContentBody) {
          modalContentBody.innerHTML = '';
        }
      }
    }, 300);
  }

  function initializePlugin() {
    injectSettingsButton();
    
    effectsAPI.interceptResetButton();
    effectsAPI.observeModal();
    
    initializeModalClosingLogic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePlugin);
  } else {
    initializePlugin();
  }

})();
