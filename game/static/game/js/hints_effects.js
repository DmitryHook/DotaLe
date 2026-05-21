// ========================= SETTINGS =========================

(function () {
  'use strict';

  const DEFAULT_VISUAL_CONFIG = {
    quote_blur: false,
    ability_blur: false,
    ability_grayscale: false,
    ability_rotate: false,
    loading_grayscale: false,
    loading_puzzle: false,
    puzzle_cols: 2,
    puzzle_rows: 2,
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

  window.DotaLeFX = window.DotaLeFX || {};
  window.DotaLeFX.getConfig = fetchPersistedSettings;
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
          iconElement.style.transform = 'rotate(' + rotationDegrees + 'deg)';
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
        : getShuffledArray(Array.from({ length: columns * rows }, function (_, index) { return index; }));

      const imageWidth = sourceImage.naturalWidth || 600;
      const imageHeight = sourceImage.naturalHeight || 338;

      const canvas = document.createElement('canvas');
      canvas.className = 'hint-puzzle-canvas';
      canvas.width = imageWidth;
      canvas.height = imageHeight;

      const context = canvas.getContext('2d');
      if (settings.loading_grayscale) {
        context.filter = 'grayscale(1)';
      }

      if (settings.loading_puzzle) {
        const tileWidth  = imageWidth / columns;
        const tileHeight = imageHeight / rows;

        tileOrder.forEach(function (sourceIndex, destinationIndex) {
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
      sourceImage.addEventListener('error', function () {
        sourceImage.classList.remove('modal-loading-screen-image--hidden');
      }, { once: true });
    }
  }

  window.DotaLeFX.applyQuoteEffect = applyQuoteEffect;
  window.DotaLeFX.applyAbilityEffect = applyAbilityEffect;
  window.DotaLeFX.applyLoadingScreenEffect = applyLoadingScreenEffect;

})();

// ========================= SETTINGS UI =========================

(function () {
  'use strict';

  const getSettings = window.DotaLeFX.getConfig;
  const saveSetting = window.DotaLeFX.saveSetting;

  const PUZZLE_DIFFICULTY_STEPS = [
    { rows: 1, cols: 2, label: '2' },
    { rows: 2, cols: 2, label: '4' },
    { rows: 2, cols: 4, label: '8' },
    { rows: 4, cols: 4, label: '16' },
    { rows: 4, cols: 8, label: '32' },
    { rows: 8, cols: 8, label: '64' },
    { rows: 8, cols: 16, label: '128' },
    { rows: 16, cols: 16, label: '256' },
  ];

  function syncPuzzleSliderVisibility(isPuzzleEnabled, container) {
    const sliderRow = (container || document).querySelector('#fx-puzzle-slider-row');
    if (sliderRow) sliderRow.style.display = isPuzzleEnabled ? '' : 'none';
  }

  function hydrateSettingsModal(clone) {
    const settings = getSettings();

    // Sync all toggle checkboxes
    clone.querySelectorAll('input[data-setting]').forEach(function (checkbox) {
      const key = checkbox.dataset.setting;
      checkbox.checked = !!settings[key];

      checkbox.addEventListener('change', function () {
        saveSetting(key, checkbox.checked);
        if (key === 'loading_puzzle') {
          syncPuzzleSliderVisibility(checkbox.checked, checkbox.closest('.fx-modal-settings'));
        }
      });
    });

    // Sync puzzle slider
    const slider = clone.querySelector('#fx-puzzle-slider');
    const badge = clone.querySelector('#fx-puzzle-badge');
    if (slider && badge) {
      let activeStepIndex = PUZZLE_DIFFICULTY_STEPS.findIndex(function (step) {
        return step.rows === (settings.puzzle_rows || 4) && step.cols === (settings.puzzle_cols || 4);
      });
      if (activeStepIndex < 0) activeStepIndex = 3;

      slider.value = String(activeStepIndex);
      badge.textContent = PUZZLE_DIFFICULTY_STEPS[activeStepIndex].label;

      slider.addEventListener('input', function () {
        const selectedStep = PUZZLE_DIFFICULTY_STEPS[parseInt(slider.value)];
        badge.textContent = selectedStep.label;
        saveSetting('puzzle_rows', selectedStep.rows);
        saveSetting('puzzle_cols', selectedStep.cols);
      });
    }

    syncPuzzleSliderVisibility(!!settings.loading_puzzle, clone);
  }

  function openSettingsModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-content-body');
    const template = document.getElementById('tpl-settings-modal');

    if (!modalOverlay || !modalBody || !template) return;

    const clone = template.content.cloneNode(true);
    hydrateSettingsModal(clone);

    modalBody.innerHTML = '';
    modalBody.appendChild(clone);
    modalOverlay.classList.add('modal-overlay--visible');
  }

  window.DotaLeFX.openSettingsModal = openSettingsModal;

})();

// ========================= RESET CONFIRM =========================

(function () {
  'use strict';

  function triggerReset(resetUrl) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-content-body');
    const template = document.getElementById('tpl-reset-modal');

    if (!modalOverlay || !modalBody || !template) {
      window.location.href = resetUrl;
      return;
    }

    const clone = template.content.cloneNode(true);

    const confirmBtn = clone.querySelector('#fx-reset-confirm');
    if (confirmBtn) confirmBtn.href = resetUrl;

    const cancelBtn = clone.querySelector('#fx-reset-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        modalOverlay.classList.remove('modal-overlay--visible');
        setTimeout(function () { modalBody.innerHTML = ''; }, 250);
      });
    }

    modalBody.innerHTML = '';
    modalBody.appendChild(clone);
    modalOverlay.classList.add('modal-overlay--visible');
  }

  window.DotaLeFX.triggerReset = triggerReset;

})();

// ========================= MODAL OBSERVER =========================

(function () {
  'use strict';

  const effectsAPI = window.DotaLeFX;

  /* Watches modal body for new hint content and applies visual effects */
  function initializeModalObserver() {
    const modalBody = document.getElementById('modal-content-body');
    if (!modalBody) return;

    const modalObserver = new MutationObserver(function (mutations) {
      const hasMeaningfulContentAdded = mutations.some(function (mutation) {
        return Array.from(mutation.addedNodes).some(function (node) {
          return node.nodeType === 1
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

          if (modalBody.querySelector('.modal-quote-text')) {
            effectsAPI.applyQuoteEffect(modalBody);
            if (windowElement) windowElement.classList.add('modal-window--hint');
            const audioPlayer = modalBody.querySelector('.modal-audio-player');
            if (audioPlayer) audioPlayer.volume = 0.25;
          }

          if (modalBody.querySelector('.modal-ability-container')) {
            effectsAPI.applyAbilityEffect(modalBody);
            if (windowElement) windowElement.classList.add('modal-window--hint');
          }

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

  function initializeOptionsMenu() {
    const toggleBtn = document.getElementById('fx-options-toggle');
    const menu = document.getElementById('fx-options-menu');
    if (!toggleBtn || !menu) return;

    const resetUrl = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.resetUrl) || '/reset/';
    const aboutUrl = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.aboutUrl) || '/about/';
    const statsUrl = (typeof CONFIGURATION !== 'undefined' && CONFIGURATION.statsUrl) || '/stats/';

    function openMenu() {
      menu.classList.add('fx-options-menu--open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.classList.add('fx-options-toggle--active');
    }

    function closeMenu() {
      menu.classList.remove('fx-options-menu--open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.classList.remove('fx-options-toggle--active');
    }

    const wrapper = document.getElementById("fx-options-wrapper");
    if (wrapper) wrapper.addEventListener("click", function (e) { e.stopPropagation(); });

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.contains('fx-options-menu--open') ? closeMenu() : openMenu();
    });

    // Single delegated listener for all menu items
    menu.addEventListener('click', function (e) {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      e.stopPropagation();
      closeMenu();

      const action = item.dataset.action;
      if (action === 'settings') {
        effectsAPI.openSettingsModal();
      } else if (action === 'reset') {
        effectsAPI.triggerReset(resetUrl);
      } else if (action === 'statistics') {
        window.location.href = statsUrl;
      } else if (action === 'about') {
        window.location.href = aboutUrl;
      }
    });

    document.addEventListener('click', function () { closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  function initializeModalClosingLogic() {
    const modalOverlay = document.getElementById('modal-overlay');
    if (!modalOverlay) return;

    function closeAndClearModal() {
      modalOverlay.classList.remove('modal-overlay--visible');
      setTimeout(function () {
        if (!modalOverlay.classList.contains('modal-overlay--visible')) {
          const modalContentBody = document.getElementById('modal-content-body');
          if (modalContentBody) modalContentBody.innerHTML = '';
        }
      }, 300);
    }

    modalOverlay.addEventListener('click', function (event) {
      if (event.target === modalOverlay) closeAndClearModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modalOverlay.classList.contains('modal-overlay--visible')) {
        closeAndClearModal();
      }
    });
  }

  function initializePlugin() {
    initializeOptionsMenu();
    effectsAPI.observeModal();
    initializeModalClosingLogic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePlugin);
  } else {
    initializePlugin();
  }

})();