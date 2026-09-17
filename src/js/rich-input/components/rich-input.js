/**
 * <rich-input> Custom Element
 * Keyword-based autocomplete input field powered by OpaqueRange and Custom Highlight API.
 */

import { DEFAULT_OPERATORS, normalizeOperators, DEFAULT_COMBINATORS, normalizeCombinators, parseSearchTokens, parseSearchQuery, getCaretContext, getSuggestions, applySuggestion, isDatalistValue } from '../utils/query-parser.js';
import { highlightManager, isOpaqueRangeSupported, isHighlightSupported } from '../utils/highlights.js';
import { getCaretCoordinates, positionPopover } from '../utils/positioning.js';
import { setupContentEditableAdapter, isContentEditableFallbackActive } from '../utils/contenteditable-adapter.js';

const KEYWORD_SUGGESTION_DELAY = 300;

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: inline-block;
    position: relative;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  :host([hidden]),
  [hidden] {
    display: none !important;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .wrapper {
    position: relative;
    width: 100%;
  }

  .control {
    display: flex;
    align-items: center;
    position: relative;
    width: 100%;
    background-color: var(--ri-input-bg, var(--rs-input-bg, #ffffff));
    border: 1px solid var(--ri-input-border, var(--rs-input-border, #d1d5db));
    border-radius: var(--ri-input-radius, var(--rs-input-radius, 8px));
    padding: 0 0.75rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .control:focus-within {
    border-color: var(--ri-primary, var(--rs-primary, #2563eb));
    box-shadow: 0 0 0 3px var(--ri-focus-ring, var(--rs-focus-ring, rgba(37, 99, 235, 0.2)));
  }

  :host([disabled]) .control {
    background-color: var(--ri-disabled-bg, var(--rs-disabled-bg, #f3f4f6));
    border-color: var(--ri-disabled-border, var(--rs-disabled-border, #e5e7eb));
    opacity: 0.7;
    cursor: not-allowed;
  }

  slot[name="leading"] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-right: 0.5rem;
    color: var(--ri-icon-color, var(--rs-icon-color, #9ca3af));
  }

  .search-icon {
    width: 1.125rem;
    height: 1.125rem;
    color: inherit;
    pointer-events: none;
  }

  ::slotted([slot="trailing"]) {
    flex-shrink: 0;
    margin-left: 0.375rem;
  }

  .search-input {
    flex: 1;
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 0.95rem;
    line-height: 1.5;
    padding: 0.625rem 0;
    color: var(--ri-input-color, var(--rs-input-color, #111827));
    white-space: pre;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    box-sizing: border-box;
  }

  .search-input::-webkit-scrollbar {
    display: none;
  }

  .search-input::placeholder {
    color: var(--ri-placeholder-color, var(--rs-placeholder-color, #9ca3af));
  }

  /* Contenteditable empty placeholder fallback */
  .search-input:empty::before {
    content: attr(data-placeholder);
    color: var(--ri-placeholder-color, var(--rs-placeholder-color, #9ca3af));
    pointer-events: none;
    display: inline-block;
  }

  /* Generic prefix highlight for operators */
  ::highlight(rich-input-operator) {
    color: var(--ri-operator-color, var(--ri-keyword-color, #64748b));
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
  }

  /* Generic highlight for combinators */
  ::highlight(rich-input-combinator) {
    color: var(--ri-combinator-color, var(--ri-operator-color, var(--ri-keyword-color, #64748b)));
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
  }

  /* Generic prefix highlight for keywords */
  ::highlight(rich-input-keyword) {
    color: var(--ri-keyword-color, #64748b);
    text-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
  }

  /* Squiggly line underneath invalid keyword values */
  ::highlight(rich-input-invalid) {
    text-decoration: underline wavy var(--ri-invalid-color, var(--rs-invalid-color, #ef4444));
    -webkit-text-decoration: underline wavy var(--ri-invalid-color, var(--rs-invalid-color, #ef4444));
    text-decoration-line: underline;
    -webkit-text-decoration-line: underline;
    text-decoration-style: wavy;
    -webkit-text-decoration-style: wavy;
    text-decoration-color: var(--ri-invalid-color, var(--rs-invalid-color, #ef4444));
    -webkit-text-decoration-color: var(--ri-invalid-color, var(--rs-invalid-color, #ef4444));
    text-decoration-skip-ink: none;
  }

  /* Visually hide datalists and custom style tags in slot */
  ::slotted(datalist),
  ::slotted(style) {
    display: none !important;
  }

  .clear-button {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    margin-left: 0.375rem;
    border: none;
    border-radius: 9999px;
    background: var(--ri-clear-bg, var(--rs-clear-bg, #e5e7eb));
    color: var(--ri-clear-color, var(--rs-clear-color, #4b5563));
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .clear-button[hidden] {
    display: none !important;
  }

  .clear-button:hover {
    background: var(--ri-clear-hover-bg, var(--rs-clear-hover-bg, #d1d5db));
    color: var(--ri-clear-hover-color, var(--rs-clear-hover-color, #111827));
  }

  .clear-button svg {
    width: 1rem;
    height: 1rem;
  }

  /* HTML Popover API styles */
  .popover {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 0;
    min-width: 280px;
    max-width: 420px;
    max-height: 290px;
    overflow-y: auto;
    background-color: var(--ri-popover-bg, var(--rs-popover-bg, #ffffff));
    border: 1px solid var(--ri-popover-border, var(--rs-popover-border, #e2e8f0));
    border-radius: var(--ri-popover-radius, var(--rs-popover-radius, 8px));
    box-shadow: var(--ri-popover-shadow, var(--rs-popover-shadow, 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)));
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .popover:not(:popover-open) {
    display: none;
  }

  .popover-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ri-popover-border, var(--rs-popover-border, #e2e8f0));
    background-color: var(--ri-header-bg, var(--rs-header-bg, #f8fafc));
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ri-header-color, var(--rs-header-color, #64748b));
  }

  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1.4;
    transition: background-color 0.1s ease;
    user-select: none;
    color: var(--ri-item-title-color, var(--rs-item-title-color, #0f172a));
  }

  .suggestion-item.selected {
    background-color: var(--ri-item-selected-bg, rgba(37, 99, 235, 0.06));
  }

  .suggestion-item:hover,
  .suggestion-item.active {
    background-color: var(--ri-item-active-bg, var(--rs-item-active-bg, #f1f5f9));
  }

  .suggestion-content {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .suggestion-title {
    font-weight: 600;
    color: var(--ri-item-title-color, var(--rs-item-title-color, #0f172a));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-desc {
    font-size: 0.75rem;
    color: var(--ri-item-desc-color, var(--rs-item-desc-color, #64748b));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-image {
    object-fit: cover;
    flex-shrink: 0;
    pointer-events: none;
    vertical-align: middle;
  }

  /* Visually hide datalists in slot */
  ::slotted(datalist) {
    display: none !important;
  }
</style>

<div part="wrapper" class="wrapper">
  <div part="control" class="control">
    <slot name="leading">
      <svg part="icon" class="search-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
      </svg>
    </slot>
    <input
      part="input"
      class="search-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="false"
      aria-haspopup="listbox"
      aria-controls="ri-listbox"
    />
    <button part="clear-button" type="button" class="clear-button" aria-label="Clear search query" hidden>
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
      </svg>
    </button>
    <slot name="trailing"></slot>
  </div>

  <div
    part="popover suggestions"
    class="popover"
    popover="manual"
  >
    <div part="suggestions-header" class="popover-header">
      <span id="ri-listbox-label" part="suggestions-title" class="popover-title">Suggestions</span>
    </div>
    <ul
      id="ri-listbox"
      part="suggestions-list"
      class="suggestions-list"
      role="listbox"
      aria-labelledby="ri-listbox-label"
    ></ul>
  </div>

  <slot style="display: none;"></slot>
</div>
`;

function extractHighlightRules(rules) {
  let css = '';
  for (const rule of rules) {
    try {
      if (rule.cssRules && rule.cssRules.length > 0) {
        css += extractHighlightRules(rule.cssRules);
      } else if (rule.cssText && rule.cssText.includes('::highlight')) {
        css += rule.cssText + '\n';
      }
    } catch (e) {}
  }
  return css;
}

function syncDocumentHighlightStyles(shadowRoot) {
  if (typeof document === 'undefined' || !shadowRoot || !isContentEditableFallbackActive) return;
  try {
    let highlightCss = '';
    for (const sheet of document.styleSheets) {
      try {
        if (sheet.cssRules) {
          highlightCss += extractHighlightRules(sheet.cssRules);
        }
      } catch (e) {}
    }
    if (highlightCss) {
      let styleEl = shadowRoot.getElementById('ri-synced-highlight-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ri-synced-highlight-styles';
        shadowRoot.appendChild(styleEl);
      }
      if (styleEl.textContent !== highlightCss) {
        styleEl.textContent = highlightCss;
      }
    }
  } catch (e) {}
}

export class RichInput extends HTMLElement {
  static formAssociated = true;

  static _globalOperators = [...DEFAULT_OPERATORS];
  static _globalCombinators = [...DEFAULT_COMBINATORS];

  /**
   * Global default operators inherited by newly created <rich-input> instances.
   */
  static get operators() {
    return [...RichInput._globalOperators];
  }

  static set operators(val) {
    if (val === null || val === undefined) {
      RichInput._globalOperators = [...DEFAULT_OPERATORS];
    } else {
      RichInput._globalOperators = normalizeOperators(val);
    }
  }

  static get defaultOperators() {
    return RichInput.operators;
  }

  static set defaultOperators(val) {
    RichInput.operators = val;
  }

  /**
   * Global default combinators inherited by newly created <rich-input> instances.
   */
  static get combinators() {
    return [...RichInput._globalCombinators];
  }

  static set combinators(val) {
    if (val === null || val === undefined) {
      RichInput._globalCombinators = [...DEFAULT_COMBINATORS];
    } else {
      RichInput._globalCombinators = normalizeCombinators(val);
    }
  }

  static get defaultCombinators() {
    return RichInput.combinators;
  }

  static set defaultCombinators(val) {
    RichInput.combinators = val;
  }

  static get observedAttributes() {
    return [
      'value',
      'placeholder',
      'disabled',
      'name',
      'readonly',
      'autofocus',
      'required',
      'highlight-quotes',
      'operators',
      'combinators',
      'aria-label',
      'aria-labelledby',
    ];
  }

  constructor() {
    super();

    this._internals = this.attachInternals ? this.attachInternals() : null;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    // In browsers lacking OpaqueRange but supporting CSS Custom Highlights (Safari 17.2+, Firefox 141+),
    // swap in a [contenteditable] element to expose standard DOM Text nodes for Custom Highlights.
    const useContentEditable = isContentEditableFallbackActive;
    if (useContentEditable) {
      const existingInput = this.shadowRoot.querySelector('.search-input');
      const editableDiv = document.createElement('div');
      editableDiv.className = 'search-input';
      editableDiv.setAttribute('part', 'input');
      editableDiv.setAttribute('role', 'combobox');
      editableDiv.setAttribute('aria-autocomplete', 'list');
      editableDiv.setAttribute('aria-expanded', 'false');
      editableDiv.setAttribute('aria-haspopup', 'listbox');
      editableDiv.setAttribute('aria-controls', 'ri-listbox');
      editableDiv.setAttribute('spellcheck', 'false');
      editableDiv.setAttribute('tabindex', '0');
      existingInput.replaceWith(editableDiv);
      this._input = setupContentEditableAdapter(editableDiv, this);
    } else {
      this._input = this.shadowRoot.querySelector('.search-input');
    }

    this._popover = this.shadowRoot.querySelector('.popover');
    this._popoverTitle = this.shadowRoot.querySelector('.popover-title');
    this._suggestionsList = this.shadowRoot.querySelector('.suggestions-list');
    this._clearBtn = this.shadowRoot.querySelector('.clear-button');
    this._slot = this.shadowRoot.querySelector('slot:not([name])');

    this._configuredKeywords = new Map();
    this._operators = [...RichInput.operators];
    this._settingOperatorsAttribute = false;
    this._combinators = [...RichInput.combinators];
    this._settingCombinatorsAttribute = false;
    this._activeSuggestions = [];
    this._selectedIndex = -1;
    this._context = null;
    this._suggestionTimeout = null;
    this._ownedRanges = [];
    this._invalidRanges = [];
    this._operatorRanges = [];
    this._combinatorRanges = [];
    this._activeKeywordHighlightMap = new Map();
    this._isFocused = false;
    this._lastCaretPosition = -1;

    // Bound listeners for easy cleanup
    this._onInput = this._onInput.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onSelectionChange = this._onSelectionChange.bind(this);
    this._onClearClick = this._onClearClick.bind(this);
    this._onClearMouseDown = (e) => e.preventDefault();
    this._onSlotChange = this._onSlotChange.bind(this);
    this._onGlobalClick = this._onGlobalClick.bind(this);
    this._onGlobalResizeOrScroll = this._onGlobalResizeOrScroll.bind(this);
  }

  connectedCallback() {
    this._syncInjectedStyles();
    syncDocumentHighlightStyles(this.shadowRoot);
    highlightManager.register(this);

    // Track initial focus state
    this._isFocused = Boolean(
      this.shadowRoot?.activeElement === this._input ||
      document.activeElement === this ||
      document.activeElement === this._input ||
      this.matches?.(':focus-within')
    );

    // Parse initial datalists
    this._loadDatalists();

    // Listen to changes on light DOM datalists and style tags
    this._slot.addEventListener('slotchange', this._onSlotChange);
    this._mutationObserver = new MutationObserver((mutations) => {
      const hasLightDomChange = mutations.some(
        (m) => !(m.target === this && m.type === 'attributes')
      );
      if (!hasLightDomChange) return;
      this._loadDatalists();
      this._syncInjectedStyles();
      this.updateHighlights();
    });
    this._mutationObserver.observe(this, { childList: true, subtree: true, attributes: true, characterData: true });

    // Events on input
    this._input.addEventListener('input', this._onInput);
    this._input.addEventListener('keydown', this._onKeyDown);
    this._input.addEventListener('keyup', this._onKeyUp);
    this._input.addEventListener('focus', this._onFocus);
    this._input.addEventListener('blur', this._onBlur);
    this._input.addEventListener('click', this._onClick);
    this._clearBtn.addEventListener('mousedown', this._onClearMouseDown);
    this._clearBtn.addEventListener('click', this._onClearClick);

    // Global events
    document.addEventListener('click', this._onGlobalClick);
    document.addEventListener('selectionchange', this._onSelectionChange);
    window.addEventListener('resize', this._onGlobalResizeOrScroll);
    window.addEventListener('scroll', this._onGlobalResizeOrScroll, { passive: true });

    // Sync initial attributes
    if (this.hasAttribute('operators')) {
      const rawOps = this.getAttribute('operators');
      this._operators = normalizeOperators(rawOps);
      const normalizedAttr = this._operators.join(' ');
      if (rawOps !== normalizedAttr) {
        this._settingOperatorsAttribute = true;
        this.setAttribute('operators', normalizedAttr);
        this._settingOperatorsAttribute = false;
      }
    } else if (this._operators.length > 0) {
      this._settingOperatorsAttribute = true;
      this.setAttribute('operators', this._operators.join(' '));
      this._settingOperatorsAttribute = false;
    }
    if (this.hasAttribute('combinators')) {
      const rawCombs = this.getAttribute('combinators');
      this._combinators = normalizeCombinators(rawCombs);
      const normalizedAttr = this._combinators.join(' ');
      if (rawCombs !== normalizedAttr) {
        this._settingCombinatorsAttribute = true;
        this.setAttribute('combinators', normalizedAttr);
        this._settingCombinatorsAttribute = false;
      }
    } else if (this._combinators.length > 0) {
      this._settingCombinatorsAttribute = true;
      this.setAttribute('combinators', this._combinators.join(' '));
      this._settingCombinatorsAttribute = false;
    }
    if (this.hasAttribute('value')) {
      this._input.value = this.getAttribute('value');
    }
    if (this.hasAttribute('placeholder')) {
      this._input.placeholder = this.getAttribute('placeholder');
    }
    if (this.hasAttribute('disabled')) {
      this._input.disabled = true;
    }
    if (this.hasAttribute('name') && this._internals) {
      this._internals.setFormValue(this._input.value);
    }

    this._syncAccessibleName();
    this._updateClearButton();
    this.updateHighlights();
  }

  disconnectedCallback() {
    highlightManager.unregister(this);
    this._disconnectOwnedRanges();

    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
    }

    this._slot.removeEventListener('slotchange', this._onSlotChange);
    this._input.removeEventListener('input', this._onInput);
    this._input.removeEventListener('keydown', this._onKeyDown);
    this._input.removeEventListener('keyup', this._onKeyUp);
    this._input.removeEventListener('focus', this._onFocus);
    this._input.removeEventListener('blur', this._onBlur);
    this._input.removeEventListener('click', this._onClick);
    this._clearBtn.removeEventListener('mousedown', this._onClearMouseDown);
    this._clearBtn.removeEventListener('click', this._onClearClick);

    document.removeEventListener('click', this._onGlobalClick);
    document.removeEventListener('selectionchange', this._onSelectionChange);
    window.removeEventListener('resize', this._onGlobalResizeOrScroll);
    window.removeEventListener('scroll', this._onGlobalResizeOrScroll);

    this.hideSuggestions();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'value') {
      if (this._input.value !== (newValue || '')) {
        this._input.value = newValue || '';
        this._updateClearButton();
        this.updateHighlights();
        if (this._internals) {
          this._internals.setFormValue(this._input.value);
        }
      }
    } else if (name === 'placeholder') {
      this._input.placeholder = newValue || '';
      this._syncAccessibleName();
    } else if (name === 'aria-label' || name === 'aria-labelledby') {
      this._syncAccessibleName();
    } else if (name === 'disabled') {
      this._input.disabled = newValue !== null;
    } else if (name === 'readonly') {
      this._input.readOnly = newValue !== null;
    } else if (name === 'autofocus') {
      this._input.autofocus = newValue !== null;
    } else if (name === 'required') {
      this._input.required = newValue !== null;
    } else if (name === 'name') {
      if (this._internals) {
        this._internals.setFormValue(this._input.value);
      }
    } else if (name === 'highlight-quotes') {
      this.updateHighlights();
    } else if (name === 'operators') {
      if (this._settingOperatorsAttribute) return;
      if (newValue === null) {
        this._operators = [...RichInput.operators];
        if (this._operators.length > 0) {
          this._settingOperatorsAttribute = true;
          this.setAttribute('operators', this._operators.join(' '));
          this._settingOperatorsAttribute = false;
        }
      } else {
        this._operators = normalizeOperators(newValue);
        const normalizedAttr = this._operators.join(' ');
        if (newValue !== normalizedAttr) {
          this._settingOperatorsAttribute = true;
          this.setAttribute('operators', normalizedAttr);
          this._settingOperatorsAttribute = false;
        }
      }
      this.updateHighlights();
      if (this._isPopoverOpen()) {
        this.updateSuggestions('operators-changed');
      }
    } else if (name === 'combinators') {
      if (this._settingCombinatorsAttribute) return;
      if (newValue === null) {
        this._combinators = [...RichInput.combinators];
        if (this._combinators.length > 0) {
          this._settingCombinatorsAttribute = true;
          this.setAttribute('combinators', this._combinators.join(' '));
          this._settingCombinatorsAttribute = false;
        }
      } else {
        this._combinators = normalizeCombinators(newValue);
        const normalizedAttr = this._combinators.join(' ');
        if (newValue !== normalizedAttr) {
          this._settingCombinatorsAttribute = true;
          this.setAttribute('combinators', normalizedAttr);
          this._settingCombinatorsAttribute = false;
        }
      }
      this.updateHighlights();
      if (this._isPopoverOpen()) {
        this.updateSuggestions('combinators-changed');
      }
    }
  }

  _syncAccessibleName() {
    if (!this._input) return;
    if (this.hasAttribute('aria-label')) {
      this._input.setAttribute('aria-label', this.getAttribute('aria-label'));
    } else if (this._internals?.labels?.length > 0) {
      const labelText = Array.from(this._internals.labels)
        .map((l) => l.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (labelText) {
        this._input.setAttribute('aria-label', labelText);
      }
    } else if (this.hasAttribute('placeholder')) {
      this._input.setAttribute('aria-label', this.getAttribute('placeholder'));
    } else {
      this._input.setAttribute('aria-label', 'Search');
    }
  }

  // --- Form Associated Lifecycle ---
  formResetCallback() {
    this.value = this.getAttribute('value') || '';
  }

  formDisabledCallback(disabled) {
    this._input.disabled = disabled;
  }

  checkValidity() {
    return this._internals ? this._internals.checkValidity() : this._input.checkValidity();
  }

  reportValidity() {
    return this._internals ? this._internals.reportValidity() : this._input.reportValidity();
  }

  get validity() {
    return this._internals ? this._internals.validity : this._input.validity;
  }

  get validationMessage() {
    return this._internals ? this._internals.validationMessage : this._input.validationMessage;
  }

  // --- Public Properties ---
  get value() {
    return this._input ? this._input.value : '';
  }

  set value(val) {
    const nextVal = String(val ?? '');
    if (this._input.value !== nextVal) {
      this._input.value = nextVal;
      this._updateClearButton();
      this.updateHighlights();
      if (this._internals) {
        this._internals.setFormValue(nextVal);
      }
    }
  }

  get placeholder() {
    return this._input.placeholder;
  }

  set placeholder(val) {
    this._input.placeholder = val;
  }

  get disabled() {
    return this._input.disabled;
  }

  set disabled(val) {
    this._input.disabled = Boolean(val);
    if (val) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(val) {
    if (val) this.setAttribute('name', val);
    else this.removeAttribute('name');
  }

  get selectionStart() {
    return this._input.selectionStart;
  }

  set selectionStart(val) {
    this._input.selectionStart = val;
  }

  get selectionEnd() {
    return this._input.selectionEnd;
  }

  set selectionEnd(val) {
    this._input.selectionEnd = val;
  }

  get selectionDirection() {
    return this._input.selectionDirection;
  }

  set selectionDirection(val) {
    this._input.selectionDirection = val;
  }

  get operators() {
    return [...this._operators];
  }

  set operators(val) {
    if (val === null || val === undefined) {
      this._operators = [...RichInput.operators];
      this._settingOperatorsAttribute = true;
      if (this._operators.length > 0) {
        this.setAttribute('operators', this._operators.join(' '));
      } else {
        this.removeAttribute('operators');
      }
      this._settingOperatorsAttribute = false;
    } else {
      this._operators = normalizeOperators(val);
      this._settingOperatorsAttribute = true;
      this.setAttribute('operators', this._operators.join(' '));
      this._settingOperatorsAttribute = false;
    }
    this.updateHighlights();
    if (this._isPopoverOpen()) {
      this.updateSuggestions('operators-changed');
    }
  }

  getOperators() {
    return this.operators;
  }

  setOperators(val) {
    this.operators = val;
  }

  get combinators() {
    return [...this._combinators];
  }

  set combinators(val) {
    if (val === null || val === undefined) {
      this._combinators = [...RichInput.combinators];
      this._settingCombinatorsAttribute = true;
      if (this._combinators.length > 0) {
        this.setAttribute('combinators', this._combinators.join(' '));
      } else {
        this.removeAttribute('combinators');
      }
      this._settingCombinatorsAttribute = false;
    } else {
      this._combinators = normalizeCombinators(val);
      this._settingCombinatorsAttribute = true;
      this.setAttribute('combinators', this._combinators.join(' '));
      this._settingCombinatorsAttribute = false;
    }
    this.updateHighlights();
    if (this._isPopoverOpen()) {
      this.updateSuggestions('combinators-changed');
    }
  }

  getCombinators() {
    return this.combinators;
  }

  setCombinators(val) {
    this.combinators = val;
  }

  // --- Public Methods ---
  focus(options) {
    this._isFocused = true;
    this._input.focus(options);
  }

  blur() {
    this._isFocused = false;
    this._input.blur();
  }

  select() {
    this._input.select();
  }

  setSelectionRange(start, end, direction) {
    this._input.setSelectionRange(start, end, direction);
  }

  getParsedQuery() {
    return parseSearchQuery(this._input.value, this.operators, this.combinators);
  }

  getKeywords() {
    return Array.from(this._configuredKeywords.values());
  }

  getCurrentOpaqueRange() {
    return this._getCurrentOpaqueRange();
  }

  // --- Datalist Configuration Discovery ---
  _loadDatalists() {
    const datalists = this.querySelectorAll('datalist');
    const newMap = new Map();

    for (const dl of datalists) {
      const id = dl.id ? dl.id.trim() : null;
      if (!id) continue;

      const idLower = id.toLowerCase();
      const rawLabel = dl.hasAttribute('label') ? dl.getAttribute('label').trim() : null;
      const label = rawLabel || id.charAt(0).toUpperCase() + id.slice(1);
      const dataType = dl.dataset.type || dl.getAttribute('type') || 'string';

      const options = [];
      const optElements = dl.querySelectorAll('option');

      for (const opt of optElements) {
        const textContent = opt.textContent.trim();
        const value = opt.hasAttribute('value') ? opt.getAttribute('value') : textContent;
        const optLabel = opt.getAttribute('label') || textContent || value;
        const imgEl = opt.querySelector('img');
        if (value) {
          options.push({
            value,
            label: optLabel,
            text: textContent || value,
            element: opt,
            image: imgEl ? imgEl.cloneNode(true) : null,
          });
        }
      }

      newMap.set(idLower, {
        id,
        idLower,
        label,
        rawLabel,
        dataType,
        options,
      });

      highlightManager.recordKeyword(idLower);
    }

    this._configuredKeywords = newMap;
  }

  // --- Injected <style> Synchronization ---
  _syncInjectedStyles() {
    const styleEls = this.querySelectorAll('style');
    let customCss = '';
    for (const styleEl of styleEls) {
      if (styleEl.textContent) {
        customCss += styleEl.textContent + '\n';
      }
    }

    let targetStyle = this.shadowRoot.getElementById('ri-injected-styles');
    if (customCss.trim()) {
      if (!targetStyle) {
        targetStyle = document.createElement('style');
        targetStyle.id = 'ri-injected-styles';
        this.shadowRoot.appendChild(targetStyle);
      }
      if (targetStyle.textContent !== customCss) {
        targetStyle.textContent = customCss;
      }
    } else if (targetStyle) {
      targetStyle.remove();
    }
  }

  _onSlotChange() {
    this._loadDatalists();
    this._syncInjectedStyles();
    this.updateHighlights();
  }

  // --- Public Properties ---
  get inputElement() {
    return this._input;
  }

  // --- Highlighting with OpaqueRange & Custom Highlight API ---
  _disconnectOwnedRanges() {
    for (const r of this._ownedRanges) {
      try {
        r.disconnect();
      } catch (e) {}
    }
    this._ownedRanges = [];
    this._invalidRanges = [];
    this._operatorRanges = [];
    this._combinatorRanges = [];
    this._activeKeywordHighlightMap.clear();
  }

  updateHighlights() {
    this._disconnectOwnedRanges();

    if (!isHighlightSupported) {
      return;
    }
    if (!isOpaqueRangeSupported && typeof this._input?.createValueRange !== 'function') {
      return;
    }

    this._syncInjectedStyles();
    syncDocumentHighlightStyles(this.shadowRoot);

    const text = this._input.value;
    if (!text) {
      highlightManager.syncAll();
      return;
    }

    const tokens = parseSearchTokens(text, this.operators, this.combinators);
    const highlightQuotes = this.getAttribute('highlight-quotes') !== 'exclude';

    const isFocused = this._isFocused;

    const caretStart = typeof this._input.selectionStart === 'number' ? this._input.selectionStart : null;
    const caretEnd = typeof this._input.selectionEnd === 'number' ? this._input.selectionEnd : null;
    const selMin = caretStart !== null ? Math.min(caretStart, caretEnd ?? caretStart) : -1;
    const selMax = caretEnd !== null ? Math.max(caretStart ?? caretEnd, caretEnd) : -1;

    for (const token of tokens) {
      if (token.type === 'keyword' && this._configuredKeywords.has(token.keywordLower)) {
        const kw = token.keywordLower;
        const kwConfig = this._configuredKeywords.get(kw);

        if (!this._activeKeywordHighlightMap.has(kw)) {
          this._activeKeywordHighlightMap.set(kw, {
            valueRanges: [],
            keywordRanges: [],
          });
        }

        const bucket = this._activeKeywordHighlightMap.get(kw);

        // 0. Operator prefix range (for ::highlight(rich-input-operator))
        if (token.operator && token.operatorEnd > token.operatorStart && token.operatorEnd <= text.length) {
          try {
            const opRange = this._input.createValueRange(token.operatorStart, token.operatorEnd);
            this._ownedRanges.push(opRange);
            this._operatorRanges.push(opRange);
          } catch (e) {}
        }

        // 1. Value range
        const start = highlightQuotes ? token.valueStart : token.innerStart;
        const end = highlightQuotes ? token.valueEnd : token.innerEnd;

        if (end > start && end <= text.length) {
          try {
            const valRange = this._input.createValueRange(start, end);
            this._ownedRanges.push(valRange);
            bucket.valueRanges.push(valRange);
          } catch (e) {
            console.warn('[rich-input] Range creation error:', e);
          }
        }

        // 2. Keyword prefix range (for ::highlight(rich-input-keyword))
        if (token.keywordEnd > token.keywordStart && token.keywordEnd <= text.length) {
          try {
            const kwRange = this._input.createValueRange(token.keywordStart, token.keywordEnd);
            this._ownedRanges.push(kwRange);
            bucket.keywordRanges.push(kwRange);
          } catch (e) {}
        }

        // 3. Validation: Check if value is part of the datalist
        // Don't mark as invalid if:
        // - Value is empty (user hasn't entered a value yet)
        // - Input is focused and user is currently editing this token (caret is on/within this token)
        const isEditingToken = isFocused && selMin !== -1 && selMax >= token.start && selMin <= token.end;
        const hasValue = Boolean(token.innerValue && token.innerValue.trim().length > 0);

        if (hasValue && !isEditingToken && !isDatalistValue(kwConfig, token.innerValue)) {
          if (end > start && end <= text.length) {
            try {
              const invRange = this._input.createValueRange(start, end);
              this._ownedRanges.push(invRange);
              this._invalidRanges.push(invRange);
            } catch (e) {
              console.warn('[rich-input] Invalid range creation error:', e);
            }
          }
        }
      } else if (token.type === 'keyword') {
        // Unrecognized key:value pair (keyword is not in configured datalists)
        const isEditingToken = isFocused && selMin !== -1 && selMax >= token.start && selMin <= token.end;

        if (!isEditingToken) {
          const start = token.start;
          const end = token.end;
          if (end > start && end <= text.length) {
            try {
              const invRange = this._input.createValueRange(start, end);
              this._ownedRanges.push(invRange);
              this._invalidRanges.push(invRange);
            } catch (e) {
              console.warn('[rich-input] Invalid range creation error:', e);
            }
          }
        }
      } else if (token.type === 'combinator') {
        if (token.end > token.start && token.end <= text.length) {
          try {
            const combRange = this._input.createValueRange(token.start, token.end);
            this._ownedRanges.push(combRange);
            this._combinatorRanges.push(combRange);
          } catch (e) {}
        }
      } else if (token.type === 'text' && token.operator) {
        // Highlight operator while typing an operator prefix before colon (e.g. "-" or "-sty")
        const remainder = token.raw.slice(token.operator.length).toLowerCase();
        const matchesKeywordPrefix =
          remainder.length === 0 ||
          Array.from(this._configuredKeywords.keys()).some((k) => k.startsWith(remainder));
        if (
          matchesKeywordPrefix &&
          token.operatorEnd > token.operatorStart &&
          token.operatorEnd <= text.length
        ) {
          try {
            const opRange = this._input.createValueRange(token.operatorStart, token.operatorEnd);
            this._ownedRanges.push(opRange);
            this._operatorRanges.push(opRange);
          } catch (e) {}
        }
      }
    }

    highlightManager.syncAll();
  }

  getActiveHighlightRanges() {
    return this._activeKeywordHighlightMap;
  }

  getActiveOperatorRanges() {
    return this._operatorRanges;
  }

  getActiveCombinatorRanges() {
    return this._combinatorRanges;
  }

  getActiveInvalidRanges() {
    return this._invalidRanges;
  }

  // --- Suggestions Popover Handling ---
  _onInput(e) {
    this._lastCaretPosition = this._input.selectionStart;
    this._updateClearButton();
    this.updateHighlights();
    this.updateSuggestions('input');

    if (this._internals) {
      this._internals.setFormValue(this._input.value);
    }

    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  }

  _onKeyDown(e) {
    if (this._isPopoverOpen()) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveSelection(1);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveSelection(-1);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (this._selectedIndex >= 0 && this._selectedIndex < this._activeSuggestions.length) {
          e.preventDefault();
          e.stopPropagation();
          this._applySelectedSuggestion();
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideSuggestions();
        return;
      }
    } else {
      if (e.key === 'ArrowDown') {
        // Open suggestions on Down Arrow
        e.preventDefault();
        this.updateSuggestions('arrow');
        return;
      }
    }

    // Enter when popover closed (or no suggestion selected) triggers search/change
    if (e.key === 'Enter') {
      this.hideSuggestions();
      this.dispatchEvent(new CustomEvent('search', {
        bubbles: true,
        composed: true,
        detail: { value: this._input.value, parsed: this.getParsedQuery() }
      }));
    }
  }

  _onKeyUp(e) {
    this._lastCaretPosition = this._input.selectionStart;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      this.updateHighlights();
      this.updateSuggestions('caret');
    }
  }

  _onFocus() {
    this._isFocused = true;
    this._lastCaretPosition = this._input.selectionStart;
    this.updateHighlights();
    this.updateSuggestions('focus');
  }

  _onBlur() {
    this._isFocused = false;
    this._lastCaretPosition = -1;
    if (this._suggestionTimeout) {
      clearTimeout(this._suggestionTimeout);
      this._suggestionTimeout = null;
    }
    this.updateHighlights();
    // Delay closing so click events on popover items can fire
    setTimeout(() => {
      if (this._isFocused) return;
      this.hideSuggestions();
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }, 150);
  }

  _onClick(e) {
    this._isFocused = true;
    if (e && typeof e.clientX === 'number' && typeof this._input?.updateCaretFromPoint === 'function') {
      this._input.updateCaretFromPoint(e.clientX, e.clientY);
    }
    this._lastCaretPosition = this._input.selectionStart;
    this.updateHighlights();
    this.updateSuggestions('click');
  }

  _onSelectionChange() {
    if (!this._isFocused) return;

    const caret = this._input.selectionStart;
    if (this._lastCaretPosition !== caret) {
      this._lastCaretPosition = caret;
      this.updateHighlights();
    }
  }

  _onClearClick() {
    this.value = '';
    this._input.focus();
    this.updateSuggestions('clear');
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  _onGlobalClick(e) {
    if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
      this.hideSuggestions();
    }
  }

  _getCurrentOpaqueRange() {
    if (!this._context) return null;
    if (!isOpaqueRangeSupported && typeof this._input?.createValueRange !== 'function') return null;

    const { mode, token, caretPos } = this._context;

    // 1. If in value mode, find the value's OpaqueRange in active keyword highlights
    if (mode === 'value' && token) {
      const kwData = this._activeKeywordHighlightMap.get(token.keywordLower);
      if (kwData?.valueRanges?.length) {
        const matched = kwData.valueRanges.find(r =>
          r.startOffset === token.valueStart ||
          (r.startOffset <= caretPos && r.endOffset >= token.valueStart)
        );
        if (matched) return matched;
      }
    }

    // 2. If in keyword mode editing an existing keyword token, find keyword's OpaqueRange
    if (mode === 'keyword' && token && token.type === 'keyword') {
      const kwData = this._activeKeywordHighlightMap.get(token.keywordLower);
      if (kwData?.keywordRanges?.length) {
        const targetStart = token.keywordStart ?? token.start;
        const matched = kwData.keywordRanges.find(r =>
          r.startOffset === targetStart ||
          (r.startOffset <= caretPos && r.endOffset >= targetStart)
        );
        if (matched) return matched;
      }
    }

    // 3. Fallback to any owned range matching token.valueStart or token.start
    if (token) {
      const targetStart = mode === 'value' ? token.valueStart : (token.keywordStart ?? token.start);
      const matched = this._ownedRanges.find(r => r.startOffset === targetStart);
      if (matched) return matched;
    }

    return null;
  }

  _onGlobalResizeOrScroll() {
    if (this._isPopoverOpen() && this._context) {
      const currentRange = this._getCurrentOpaqueRange();
      const anchor = currentRange || (this._context.replaceStart !== undefined ? this._context.replaceStart : this._context.caretPos);
      const anchorCoords = getCaretCoordinates(this._input, anchor);
      positionPopover(this._popover, anchorCoords, this._input);
    }
  }

  _updateClearButton() {
    if (!this._clearBtn || !this._input) return;
    this._clearBtn.hidden = this._input.value.length === 0;
  }

  _isPopoverOpen() {
    try {
      return this._popover && this._popover.matches(':popover-open');
    } catch (e) {
      return false;
    }
  }

  updateSuggestions(trigger = 'input') {
    if (this._suggestionTimeout) {
      clearTimeout(this._suggestionTimeout);
      this._suggestionTimeout = null;
    }

    const caretPos = this._input.selectionStart;
    const context = getCaretContext(this._input.value, caretPos, this._configuredKeywords, this.operators, this.combinators);

    // If trigger is arrow and context is 'none', allow suggesting all keywords
    if (trigger === 'arrow' && context.mode === 'none') {
      context.mode = 'keyword';
      context.query = '';
      context.replaceStart = caretPos;
      context.replaceEnd = caretPos;
    }

    this._context = context;
    const suggestions = getSuggestions(context, this._configuredKeywords, this.combinators);

    if (suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    // Value suggestions always show immediately.
    // Keyword suggestions show immediately when:
    // - focusing/clearing an empty field
    // - typing characters that match a keyword (Boolean(context.query))
    // - typing an operator (Boolean(context.operator))
    // - explicitly triggered via the Down Arrow key
    // In other cases (at the start of a new token after a space when the field is not empty),
    // show after a small delay to prevent constant popups when typing regular sentences with spaces.
    const isEmptyField = this._input.value.length === 0;
    const shouldShowImmediately =
      context.mode === 'value' ||
      isEmptyField ||
      Boolean(context.query) ||
      Boolean(context.operator) ||
      trigger === 'arrow';

    if (shouldShowImmediately) {
      this._showSuggestions(suggestions, context, trigger);
    } else {
      if (this._isPopoverOpen()) {
        this.hideSuggestions();
      }
      this._suggestionTimeout = setTimeout(() => {
        this._suggestionTimeout = null;
        const isFocused =
          this._isFocused ||
          this.shadowRoot?.activeElement === this._input ||
          document.activeElement === this ||
          document.activeElement === this._input ||
          Boolean(this.matches?.(':focus-within'));
        if (!isFocused) return;

        const currentCaretPos = this._input.selectionStart;
        const currentContext = getCaretContext(this._input.value, currentCaretPos, this._configuredKeywords, this.operators, this.combinators);
        this._context = currentContext;
        const currentSuggestions = getSuggestions(currentContext, this._configuredKeywords, this.combinators);
        if (currentSuggestions.length === 0) {
          this.hideSuggestions();
          return;
        }
        this._showSuggestions(currentSuggestions, currentContext, trigger);
      }, KEYWORD_SUGGESTION_DELAY);
    }
  }

  _showSuggestions(suggestions, context, trigger) {
    this._activeSuggestions = suggestions;

    // Pre-select first item for quick Enter/Tab when filtering or in value mode or triggered via Down Arrow,
    // but leave unselected (-1) when showing full keyword list at the start of a new token so Enter/Tab aren't hijacked.
    const shouldPreselect =
      context.mode === 'value' ||
      Boolean(context.query) ||
      trigger === 'arrow';
    const existingSelectedIdx = suggestions.findIndex((s) => this._isSuggestionSelected(s));
    this._selectedIndex = existingSelectedIdx !== -1 ? existingSelectedIdx : (shouldPreselect ? 0 : -1); // Highlight matching item or first item for quick Enter/Tab
    this._renderSuggestions();

    // Show popover
    if (!this._isPopoverOpen()) {
      try {
        this._popover.showPopover();
      } catch (e) {}
    }
    this._input.setAttribute('aria-expanded', 'true');

    // Position popover at the start of the current OpaqueRange (or via mirror-div fallback when OpaqueRange is unsupported)
    const currentRange = this._getCurrentOpaqueRange();
    const anchor = currentRange || (context.replaceStart !== undefined ? context.replaceStart : context.caretPos);
    const anchorCoords = getCaretCoordinates(this._input, anchor);
    positionPopover(this._popover, anchorCoords, this._input);
  }

  hideSuggestions() {
    if (this._suggestionTimeout) {
      clearTimeout(this._suggestionTimeout);
      this._suggestionTimeout = null;
    }
    if (this._isPopoverOpen()) {
      try {
        this._popover.hidePopover();
      } catch (e) {}
    }
    this._input.setAttribute('aria-expanded', 'false');
    this._input.removeAttribute('aria-activedescendant');
    this._activeSuggestions = [];
    this._selectedIndex = -1;
  }

  _isSuggestionSelected(sug) {
    if (!this._context || !sug) return false;

    if (sug.type === 'value' && this._context.mode === 'value' && this._context.token) {
      const currentVal = (this._context.token.innerValue ?? '').trim().toLowerCase();
      if (!currentVal) return false;
      const sugVal = (sug.value ?? '').trim().toLowerCase();
      const sugLabel = (sug.label ?? '').trim().toLowerCase();
      const sugDisplay = (sug.display ?? '').trim().toLowerCase();
      return currentVal === sugVal || currentVal === sugLabel || currentVal === sugDisplay;
    }

    if (sug.type === 'keyword' && this._context.mode === 'keyword' && this._context.token?.type === 'keyword') {
      const currentKw = (this._context.token.keywordLower ?? '').trim().toLowerCase();
      if (!currentKw) return false;
      const sugId = (sug.id ?? '').trim().toLowerCase();
      return currentKw === sugId;
    }

    if (sug.type === 'combinator' && this._context.mode === 'keyword' && this._context.token?.type === 'combinator') {
      const currentComb = (this._context.token.combinator ?? '').trim().toLowerCase();
      if (!currentComb) return false;
      const sugComb = (sug.combinator ?? sug.value ?? '').trim().toLowerCase();
      return currentComb === sugComb;
    }

    return false;
  }

  _renderSuggestions() {
    if (this._popoverTitle) {
      let title = 'Suggestions';
      if (this._context?.mode === 'value' && this._context.keywordLower) {
        const kwConfig = this._configuredKeywords.get(this._context.keywordLower);
        if (kwConfig?.rawLabel) {
          title = kwConfig.rawLabel;
        }
      }
      this._popoverTitle.textContent = title;
    }

    this._suggestionsList.replaceChildren();

    this._activeSuggestions.forEach((sug, idx) => {
      const isAct = idx === this._selectedIndex;
      const isSel = this._isSuggestionSelected(sug);
      const li = document.createElement('li');
      li.className = `suggestion-item${isAct ? ' active' : ''}${isSel ? ' selected' : ''}`;
      li.id = `ri-opt-${idx}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', isSel ? 'true' : 'false');
      const parts = ['suggestion-item'];
      if (isAct) parts.push('suggestion-item-active');
      if (isSel) parts.push('suggestion-item-selected');
      li.setAttribute('part', parts.join(' '));

      if (sug.image) {
        const img = sug.image.cloneNode(true);
        img.className = 'suggestion-image';
        const currentPart = img.getAttribute('part');
        img.setAttribute('part', currentPart ? `${currentPart} suggestion-image` : 'suggestion-image');
        li.appendChild(img);
      }

      const content = document.createElement('div');
      content.className = 'suggestion-content';
      content.setAttribute('part', 'suggestion-content');

      const title = document.createElement('span');
      title.className = 'suggestion-title';
      const titlePart =
        sug.type === 'keyword'
          ? 'suggestion-keyword'
          : sug.type === 'combinator'
          ? 'suggestion-combinator'
          : 'suggestion-value';
      title.setAttribute('part', titlePart);
      title.textContent = sug.display;

      const desc = document.createElement('span');
      desc.className = 'suggestion-desc';
      desc.setAttribute('part', 'suggestion-label');
      desc.textContent = (sug.description && sug.description !== sug.display) ? sug.description : '';

      content.appendChild(title);
      if (desc.textContent) content.appendChild(desc);

      li.appendChild(content);

      li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent input blur
      });

      li.addEventListener('click', () => {
        this._selectedIndex = idx;
        this._applySelectedSuggestion();
      });

      li.addEventListener('pointerenter', () => {
        this._selectedIndex = idx;
        this._updateActiveSuggestion();
      });

      this._suggestionsList.appendChild(li);
    });

    this._updateActiveSuggestion();
  }

  _moveSelection(delta) {
    if (this._activeSuggestions.length === 0) return;
    const len = this._activeSuggestions.length;
    if (this._selectedIndex === -1) {
      this._selectedIndex = delta > 0 ? 0 : len - 1;
    } else {
      this._selectedIndex = (this._selectedIndex + delta + len) % len;
    }
    this._updateActiveSuggestion();

    // Scroll active item into view
    const activeEl = this._suggestionsList.children[this._selectedIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  _updateActiveSuggestion() {
    const items = this._suggestionsList.children;
    for (let i = 0; i < items.length; i++) {
      const isAct = i === this._selectedIndex;
      const isSel = this._isSuggestionSelected(this._activeSuggestions[i]);
      items[i].classList.toggle('active', isAct);
      items[i].classList.toggle('selected', isSel);
      items[i].setAttribute('aria-selected', isSel ? 'true' : 'false');
      const parts = ['suggestion-item'];
      if (isAct) parts.push('suggestion-item-active');
      if (isSel) parts.push('suggestion-item-selected');
      items[i].setAttribute('part', parts.join(' '));
      if (isAct) {
        this._input.setAttribute('aria-activedescendant', items[i].id);
      }
    }
    if (this._selectedIndex === -1) {
      this._input.removeAttribute('aria-activedescendant');
    }
  }

  _applySelectedSuggestion() {
    if (this._selectedIndex < 0 || this._selectedIndex >= this._activeSuggestions.length) return;

    const suggestion = this._activeSuggestions[this._selectedIndex];
    const { newValue, newCaret } = applySuggestion(this._input.value, suggestion, this._context);

    this._input.value = newValue;
    this._input.setSelectionRange(newCaret, newCaret);
    this._updateClearButton();
    this.updateHighlights();

    if (this._internals) {
      this._internals.setFormValue(this._input.value);
    }

    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    const selectDetail = {
      type: suggestion.type,
      operator: this._context?.operator || null,
      combinator: suggestion.combinator || (suggestion.type === 'combinator' ? suggestion.value : null),
      keyword: suggestion.keyword || (suggestion.type === 'keyword' ? suggestion.id : null),
      value: suggestion.value || null,
      label: suggestion.label || null,
      query: newValue,
    };
    this.dispatchEvent(new CustomEvent('rich-input-select', {
      bubbles: true,
      composed: true,
      detail: selectDetail,
    }));
    // Immediately show value suggestions when a keyword was selected (e.g. `mix:`),
    // or keyword suggestions when a value or combinator was selected (since cursor is now after a space at a new token)
    this.updateSuggestions(suggestion.type === 'keyword' ? 'keyword-selected' : 'value-selected');
  }
}

