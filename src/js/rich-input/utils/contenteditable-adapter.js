/**
 * ContentEditable adapter for <rich-input>
 *
 * In browsers that do not support the OpaqueRange API (HTMLInputElement.createValueRange)
 * but DO support the CSS Custom Highlight API (Safari 17.2+, Firefox 141+), this adapter
 * enables using a single-line [contenteditable] element inside <rich-input>.
 *
 * This exposes standard DOM Text nodes so standard DOM Range objects can be created
 * and registered with CSS.highlights, delivering on-the-fly syntax highlighting.
 */

import { isOpaqueRangeSupported, isHighlightSupported } from './highlights.js';

export const isContentEditableFallbackActive = !isOpaqueRangeSupported && isHighlightSupported;

/**
 * Calculates character offset of a container + offset within an element.
 *
 * @param {HTMLElement} el
 * @param {Node} container
 * @param {number} offset
 * @returns {number|null}
 */
export function getOffsetInElement(el, container, offset) {
  if (!el || !container) return null;
  if (!el.contains(container) && el !== container) return null;

  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(container, offset);
    return range.toString().length;
  } catch (e) {
    return null;
  }
}

/**
 * Derives caret character offset directly from viewport client coordinates.
 * Uses WebKit document.caretRangeFromPoint and W3C document.caretPositionFromPoint.
 *
 * @param {HTMLElement} el
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number|null}
 */
export function getCaretOffsetFromPoint(el, clientX, clientY) {
  if (typeof document === 'undefined') return null;

  // 1. WebKit/Blink standard: document.caretRangeFromPoint (supported in Safari)
  if (typeof document.caretRangeFromPoint === 'function') {
    try {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (range && range.startContainer) {
        const offset = getOffsetInElement(el, range.startContainer, range.startOffset);
        if (offset !== null) return offset;
      }
    } catch (e) {}
  }

  // 2. W3C standard: document.caretPositionFromPoint (supported in Firefox & modern WebKit)
  if (typeof document.caretPositionFromPoint === 'function') {
    try {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode) {
        const offset = getOffsetInElement(el, pos.offsetNode, pos.offset);
        if (offset !== null) return offset;
      }
    } catch (e) {}
  }

  return null;
}

/**
 * Gets the current character caret offset inside a contenteditable element.
 * Pierces Shadow DOM boundaries via shadowRoot.getSelection() and Selection.getComposedRanges().
 *
 * @param {HTMLElement} el
 * @param {boolean} isStart Whether to get selection start (true) or end (false)
 * @returns {number}
 */
export function getCaretCharacterOffset(el, isStart = true) {
  if (typeof window === 'undefined') return 0;

  const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
  let range = null;

  // 1. Try ShadowRoot.getSelection() if supported
  if (root && typeof root.getSelection === 'function') {
    try {
      const shadowSel = root.getSelection();
      if (shadowSel && shadowSel.rangeCount > 0) {
        range = shadowSel.getRangeAt(0);
      }
    } catch (e) {}
  }

  // 2. Try window.getSelection().getComposedRanges() (W3C standard in Safari 17+, Chrome)
  const sel = window.getSelection ? window.getSelection() : null;
  if (!range && sel && typeof sel.getComposedRanges === 'function' && root) {
    try {
      const composed = sel.getComposedRanges({ shadowRoots: [root] });
      if (composed && composed.length > 0) {
        range = composed[0];
      }
    } catch (e) {}
  }

  // 3. Fallback to standard window.getSelection()
  if (!range && sel && sel.rangeCount > 0) {
    try {
      range = sel.getRangeAt(0);
    } catch (e) {}
  }

  if (range) {
    const container = isStart ? range.startContainer : range.endContainer;
    const offset = isStart ? range.startOffset : range.endOffset;
    const pos = getOffsetInElement(el, container, offset);
    if (pos !== null) {
      el._lastCaretOffset = pos;
      return pos;
    }
  }

  return typeof el._lastCaretOffset === 'number' ? el._lastCaretOffset : 0;
}

/**
 * Sets the caret or selection character range inside a contenteditable element.
 *
 * @param {HTMLElement} el
 * @param {number} start
 * @param {number} [end]
 */
export function setCaretCharacterOffset(el, start, end = start) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const textNode = getSingleTextNode(el);
  const len = (textNode.textContent || '').length;
  const s = Math.max(0, Math.min(start ?? 0, len));
  const e = Math.max(0, Math.min(end ?? s, len));

  el._lastCaretOffset = s;

  const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
  const sel = (root && typeof root.getSelection === 'function') ? root.getSelection() : window.getSelection();
  if (!sel) return;

  // setBaseAndExtent works natively across WebKit, Gecko, and Blink
  if (typeof sel.setBaseAndExtent === 'function') {
    try {
      sel.setBaseAndExtent(textNode, s, textNode, e);
      return;
    } catch (err) {}
  }

  try {
    const range = document.createRange();
    range.setStart(textNode, s);
    range.setEnd(textNode, e);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (err) {}
}

/**
 * Ensures the element has exactly one child Text node and returns it.
 *
 * @param {HTMLElement} el
 * @returns {Text}
 */
export function getSingleTextNode(el) {
  if (!el.firstChild) {
    const tn = document.createTextNode('');
    el.appendChild(tn);
    return tn;
  }

  if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) {
    return el.firstChild;
  }

  el.normalize();
  if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) {
    return el.firstChild;
  }

  // Strip elements (<br>, <div>) inserted by contenteditable
  const text = el.textContent || '';
  el.textContent = text;
  return el.firstChild || el.appendChild(document.createTextNode(''));
}

/**
 * Configures an HTMLElement as a contenteditable input adapter.
 *
 * @param {HTMLElement} el
 * @param {HTMLElement} host
 * @returns {HTMLElement}
 */
export function setupContentEditableAdapter(el, host) {
  el._lastCaretOffset = 0;

  // 1. Enforce plaintext-only editing (Firefox falls back to true)
  el.setAttribute('contenteditable', 'plaintext-only');
  if (el.contentEditable !== 'plaintext-only') {
    el.setAttribute('contenteditable', 'true');
  }

  // 2. Track caret offset on mouse click, pointer, keyboard, and selection interactions
  const updateCaret = (e) => {
    if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      const offset = getCaretOffsetFromPoint(el, e.clientX, e.clientY);
      if (offset !== null) {
        el._lastCaretOffset = offset;
        return;
      }
    }
    const fromSel = getCaretCharacterOffset(el, true);
    if (typeof fromSel === 'number') {
      el._lastCaretOffset = fromSel;
    }
  };

  el.addEventListener('pointerdown', updateCaret);
  el.addEventListener('mousedown', updateCaret);
  el.addEventListener('pointerup', updateCaret);
  el.addEventListener('mouseup', updateCaret);
  el.addEventListener('click', updateCaret);
  el.addEventListener('keyup', updateCaret);

  if (typeof document !== 'undefined') {
    const onSelectionChange = () => {
      const root = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
      const activeEl = root && root.activeElement ? root.activeElement : document.activeElement;
      if (activeEl === el || el.contains(activeEl)) {
        const offset = getCaretCharacterOffset(el, true);
        if (typeof offset === 'number') {
          el._lastCaretOffset = offset;
        }
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
  }

  // 3. Prevent linebreaks on Enter (single-line input behavior)
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  });

  // 5. Strip linebreaks from pasted content
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const clipboard = e.clipboardData || window.clipboardData;
    const text = (clipboard?.getData('text/plain') || '').replace(/\r?\n/g, ' ');
    if (text) {
      if (typeof document.execCommand === 'function') {
        document.execCommand('insertText', false, text);
      } else {
        const start = el.selectionStart;
        const current = el.textContent || '';
        el.textContent = current.slice(0, start) + text + current.slice(el.selectionEnd);
        setCaretCharacterOffset(el, start + text.length);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // 6. Clean empty element so :empty matches data-placeholder
  el.addEventListener('input', () => {
    if (!el.textContent) {
      el.replaceChildren();
      el._lastCaretOffset = 0;
    } else {
      el._lastCaretOffset = getCaretCharacterOffset(el, true);
    }
  });

  // 7. Define HTMLInputElement-compatible properties and methods
  Object.defineProperty(el, 'value', {
    get() {
      return el.textContent || '';
    },
    set(val) {
      const next = val || '';
      if (el.textContent !== next) {
        el.textContent = next;
        el._lastCaretOffset = Math.min(el._lastCaretOffset || 0, next.length);
      }
    },
    configurable: true,
  });

  Object.defineProperty(el, 'placeholder', {
    get() {
      return el.getAttribute('data-placeholder') || '';
    },
    set(val) {
      if (val) {
        el.setAttribute('data-placeholder', val);
      } else {
        el.removeAttribute('data-placeholder');
      }
    },
    configurable: true,
  });

  Object.defineProperty(el, 'disabled', {
    get() {
      return el.hasAttribute('disabled') || el.contentEditable === 'false';
    },
    set(val) {
      if (val) {
        el.setAttribute('disabled', '');
        el.setAttribute('contenteditable', 'false');
      } else {
        el.removeAttribute('disabled');
        el.setAttribute('contenteditable', 'plaintext-only');
        if (el.contentEditable !== 'plaintext-only') {
          el.setAttribute('contenteditable', 'true');
        }
      }
    },
    configurable: true,
  });

  Object.defineProperty(el, 'readOnly', {
    get() {
      return el.contentEditable === 'false';
    },
    set(val) {
      if (val) {
        el.setAttribute('contenteditable', 'false');
      } else {
        el.setAttribute('contenteditable', 'plaintext-only');
        if (el.contentEditable !== 'plaintext-only') {
          el.setAttribute('contenteditable', 'true');
        }
      }
    },
    configurable: true,
  });

  Object.defineProperty(el, 'selectionStart', {
    get() {
      return getCaretCharacterOffset(el, true);
    },
    set(val) {
      const currentEnd = getCaretCharacterOffset(el, false);
      const nextEnd = Math.max(val, currentEnd);
      setCaretCharacterOffset(el, val, nextEnd);
    },
    configurable: true,
  });

  Object.defineProperty(el, 'selectionEnd', {
    get() {
      return getCaretCharacterOffset(el, false);
    },
    set(val) {
      const currentStart = getCaretCharacterOffset(el, true);
      const nextStart = Math.min(val, currentStart);
      setCaretCharacterOffset(el, nextStart, val);
    },
    configurable: true,
  });

  Object.defineProperty(el, 'selectionDirection', {
    value: 'forward',
    writable: true,
    configurable: true,
  });

  el.setSelectionRange = function (start, end) {
    setCaretCharacterOffset(el, start, end);
  };

  el.select = function () {
    setCaretCharacterOffset(el, 0, (el.textContent || '').length);
  };

  el.updateCaretFromPoint = function (clientX, clientY) {
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const offset = getCaretOffsetFromPoint(el, clientX, clientY);
      if (offset !== null) {
        el._lastCaretOffset = offset;
        return el._lastCaretOffset;
      }
    }
    const offset = getCaretCharacterOffset(el, true);
    if (typeof offset === 'number') {
      el._lastCaretOffset = offset;
    }
    return el._lastCaretOffset;
  };

  // 8. createValueRange implementation returning a standard DOM Range over the text node
  el.createValueRange = function (start, end) {
    const textNode = getSingleTextNode(el);
    const len = (textNode.textContent || '').length;
    const s = Math.max(0, Math.min(start ?? 0, len));
    const e = Math.max(0, Math.min(end ?? s, len));

    const range = new Range();
    range.setStart(textNode, s);
    range.setEnd(textNode, e);
    range.disconnect = () => {};
    return range;
  };

  el.checkValidity = () => true;
  el.reportValidity = () => true;
  el.validity = { valid: true };
  el.validationMessage = '';

  return el;
}
