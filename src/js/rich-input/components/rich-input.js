/**
 * <rich-input> Custom Element
 * Keyword-based autocomplete input field powered by OpaqueRange and Custom Highlight API.
 */

import { parseSearchTokens, parseSearchQuery, getCaretContext, getSuggestions, applySuggestion } from '../utils/query-parser.js';
import { highlightManager, isOpaqueRangeSupported, isHighlightSupported } from '../utils/highlights.js';
import { getCaretCoordinates, positionPopover } from '../utils/positioning.js';

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
  }

  .search-input::placeholder {
    color: var(--ri-placeholder-color, var(--rs-placeholder-color, #9ca3af));
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
    role="listbox"
    aria-label="Search suggestions"
  >
    <div part="suggestions-header" class="popover-header">
      <span part="suggestions-title" class="popover-title">Suggestions</span>
    </div>
    <ul part="suggestions-list" class="suggestions-list" role="presentation"></ul>
  </div>

  <slot style="display: none;"></slot>
</div>
`;

export class RichInput extends HTMLElement {
  static formAssociated = true;

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
    ];
  }

  constructor() {
    super();

    this._internals = this.attachInternals ? this.attachInternals() : null;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._input = this.shadowRoot.querySelector('.search-input');
    this._popover = this.shadowRoot.querySelector('.popover');
    this._popoverTitle = this.shadowRoot.querySelector('.popover-title');
    this._suggestionsList = this.shadowRoot.querySelector('.suggestions-list');
    this._clearBtn = this.shadowRoot.querySelector('.clear-button');
    this._slot = this.shadowRoot.querySelector('slot:not([name])');

    this._configuredKeywords = new Map();
    this._activeSuggestions = [];
    this._selectedIndex = -1;
    this._context = null;
    this._ownedRanges = [];
    this._activeKeywordHighlightMap = new Map();

    // Bound listeners for easy cleanup
    this._onInput = this._onInput.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onClearClick = this._onClearClick.bind(this);
    this._onSlotChange = this._onSlotChange.bind(this);
    this._onGlobalClick = this._onGlobalClick.bind(this);
    this._onGlobalResizeOrScroll = this._onGlobalResizeOrScroll.bind(this);
  }

  connectedCallback() {
    highlightManager.register(this);

    // Parse initial datalists
    this._loadDatalists();

    // Listen to changes on light DOM datalists
    this._slot.addEventListener('slotchange', this._onSlotChange);
    this._mutationObserver = new MutationObserver(() => {
      this._loadDatalists();
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
    this._clearBtn.addEventListener('click', this._onClearClick);

    // Global events
    document.addEventListener('click', this._onGlobalClick);
    window.addEventListener('resize', this._onGlobalResizeOrScroll);
    window.addEventListener('scroll', this._onGlobalResizeOrScroll, { passive: true });

    // Sync initial attributes
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
    this._clearBtn.removeEventListener('click', this._onClearClick);

    document.removeEventListener('click', this._onGlobalClick);
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

  // --- Public Methods ---
  focus(options) {
    this._input.focus(options);
  }

  blur() {
    this._input.blur();
  }

  select() {
    this._input.select();
  }

  setSelectionRange(start, end, direction) {
    this._input.setSelectionRange(start, end, direction);
  }

  getParsedQuery() {
    return parseSearchQuery(this._input.value);
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

  _onSlotChange() {
    this._loadDatalists();
    this.updateHighlights();
  }

  // --- Highlighting with OpaqueRange & Custom Highlight API ---
  _disconnectOwnedRanges() {
    for (const r of this._ownedRanges) {
      try {
        r.disconnect();
      } catch (e) {}
    }
    this._ownedRanges = [];
    this._activeKeywordHighlightMap.clear();
  }

  updateHighlights() {
    this._disconnectOwnedRanges();

    if (!isOpaqueRangeSupported || !isHighlightSupported) {
      return;
    }

    const text = this._input.value;
    if (!text) {
      highlightManager.syncAll();
      return;
    }

    const tokens = parseSearchTokens(text);
    const highlightQuotes = this.getAttribute('highlight-quotes') !== 'exclude';

    for (const token of tokens) {
      if (token.type === 'keyword' && this._configuredKeywords.has(token.keywordLower)) {
        const kw = token.keywordLower;

        if (!this._activeKeywordHighlightMap.has(kw)) {
          this._activeKeywordHighlightMap.set(kw, {
            valueRanges: [],
            keywordRanges: [],
          });
        }

        const bucket = this._activeKeywordHighlightMap.get(kw);

        // 1. Value range
        const start = highlightQuotes ? token.valueStart : token.innerStart;
        const end = highlightQuotes ? token.valueEnd : token.innerEnd;

        if (end >= start && end <= text.length) {
          try {
            const valRange = this._input.createValueRange(start, end);
            this._ownedRanges.push(valRange);
            bucket.valueRanges.push(valRange);
          } catch (e) {
            console.warn('[rich-input] Range creation error:', e);
          }
        }

        // 2. Keyword prefix range (for ::highlight(rich-input-keyword) and ::highlight(rich-search-keyword))
        if (token.keywordEnd > token.keywordStart && token.keywordEnd <= text.length) {
          try {
            const kwRange = this._input.createValueRange(token.keywordStart, token.keywordEnd);
            this._ownedRanges.push(kwRange);
            bucket.keywordRanges.push(kwRange);
          } catch (e) {}
        }
      }
    }

    highlightManager.syncAll();
  }

  getActiveHighlightRanges() {
    return this._activeKeywordHighlightMap;
  }

  // --- Suggestions Popover Handling ---
  _onInput(e) {
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

    // Enter when popover closed triggers search/change
    if (e.key === 'Enter') {
      this.dispatchEvent(new CustomEvent('search', {
        bubbles: true,
        composed: true,
        detail: { value: this._input.value, parsed: this.getParsedQuery() }
      }));
    }
  }

  _onKeyUp(e) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      this.updateSuggestions('caret');
    }
  }

  _onFocus() {
    // Optionally open suggestions if context matches
    if (this._input.value.length > 0) {
      this.updateSuggestions('focus');
    }
  }

  _onBlur() {
    // Delay closing so click events on popover items can fire
    setTimeout(() => {
      this.hideSuggestions();
      this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }, 150);
  }

  _onClick() {
    this.updateSuggestions('click');
  }

  _onClearClick() {
    this.value = '';
    this._input.focus();
    this.hideSuggestions();
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  _onGlobalClick(e) {
    if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
      this.hideSuggestions();
    }
  }

  _getCurrentOpaqueRange() {
    if (!this._context || !isOpaqueRangeSupported) return null;

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
    const caretPos = this._input.selectionStart;
    const context = getCaretContext(this._input.value, caretPos, this._configuredKeywords);

    // If trigger is arrow and context is 'none', allow suggesting all keywords
    if (trigger === 'arrow' && context.mode === 'none') {
      context.mode = 'keyword';
      context.query = '';
      context.replaceStart = caretPos;
      context.replaceEnd = caretPos;
    }

    this._context = context;
    const suggestions = getSuggestions(context, this._configuredKeywords);

    if (suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this._activeSuggestions = suggestions;
    this._selectedIndex = 0; // Pre-select first item for quick Enter/Tab
    this._renderSuggestions();

    // Show popover
    if (!this._isPopoverOpen()) {
      try {
        this._popover.showPopover();
        this._input.setAttribute('aria-expanded', 'true');
      } catch (e) {}
    }

    // Position popover at the start of the current OpaqueRange
    const currentRange = this._getCurrentOpaqueRange();
    const anchor = currentRange || (context.replaceStart !== undefined ? context.replaceStart : context.caretPos);
    const anchorCoords = getCaretCoordinates(this._input, anchor);
    positionPopover(this._popover, anchorCoords, this._input);
  }

  hideSuggestions() {
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
      const li = document.createElement('li');
      li.className = `suggestion-item${idx === this._selectedIndex ? ' active' : ''}`;
      li.id = `ri-opt-${idx}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === this._selectedIndex ? 'true' : 'false');
      li.setAttribute('part', `suggestion-item${idx === this._selectedIndex ? ' suggestion-item-active' : ''}`);

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
      title.setAttribute('part', sug.type === 'keyword' ? 'suggestion-keyword' : 'suggestion-value');
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
    this._selectedIndex = (this._selectedIndex + delta + len) % len;
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
      items[i].classList.toggle('active', isAct);
      items[i].setAttribute('aria-selected', isAct ? 'true' : 'false');
      if (isAct) {
        this._input.setAttribute('aria-activedescendant', items[i].id);
      }
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
      keyword: suggestion.keyword || suggestion.id,
      value: suggestion.value || null,
      label: suggestion.label || null,
      query: newValue,
    };
    this.dispatchEvent(new CustomEvent('rich-input-select', {
      bubbles: true,
      composed: true,
      detail: selectDetail,
    }));
    this.dispatchEvent(new CustomEvent('rich-search-select', {
      bubbles: true,
      composed: true,
      detail: selectDetail,
    }));

    // If a keyword was selected (e.g. `mix:`), immediately show value suggestions
    if (suggestion.type === 'keyword') {
      this.updateSuggestions('keyword-selected');
    } else {
      this.hideSuggestions();
    }
  }
}

export class RichSearch extends RichInput {}

