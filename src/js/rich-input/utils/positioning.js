/**
 * Caret measurement and popover positioning for <rich-input>
 * Uses OpaqueRange.getBoundingClientRect() with hidden mirror div fallback.
 */

import { isOpaqueRangeSupported } from './highlights.js';

let mirrorDiv = null;

/**
 * Gets or creates the reusable hidden mirror div for measuring text width in the input.
 * @returns {HTMLDivElement|null}
 */
function getMirrorDiv() {
  if (typeof document === 'undefined') return null;

  if (!mirrorDiv || !mirrorDiv.isConnected) {
    mirrorDiv = document.createElement('div');
    mirrorDiv.id = 'rich-input-mirror';
    mirrorDiv.setAttribute('aria-hidden', 'true');
    mirrorDiv.style.position = 'absolute';
    mirrorDiv.style.top = '-9999px';
    mirrorDiv.style.left = '-9999px';
    mirrorDiv.style.visibility = 'hidden';
    mirrorDiv.style.pointerEvents = 'none';
    mirrorDiv.style.whiteSpace = 'pre';
    mirrorDiv.style.display = 'inline-block';
    mirrorDiv.style.width = 'auto';
    mirrorDiv.style.height = 'auto';
    mirrorDiv.style.margin = '0';
    mirrorDiv.style.padding = '0';
    mirrorDiv.style.border = '0';
    (document.body || document.documentElement).appendChild(mirrorDiv);
  }

  return mirrorDiv;
}

/**
 * Fallback measurement using a hidden mirror div for browsers that don't support OpaqueRange.
 * Sets the div's text content to the input's partial text (or full text) up to the target
 * character offset to figure out the left position to use for the popover.
 *
 * @param {HTMLInputElement} input
 * @param {number|OpaqueRange} [target] Character offset or range
 * @returns {number} Viewport-relative left position in pixels
 */
export function getCaretLeftWithMirrorDiv(input, target) {
  const inputRect = input.getBoundingClientRect();
  const value = input.value || '';

  // Determine character offset
  let offset = value.length;
  if (typeof target === 'number') {
    offset = target;
  } else if (target && typeof target.startOffset === 'number') {
    offset = target.startOffset;
  } else if (typeof input.selectionStart === 'number') {
    offset = input.selectionStart;
  }
  offset = Math.max(0, Math.min(offset, value.length));

  // Input's text or partial text up to target offset
  const textContent = value.slice(0, offset);

  const mirror = getMirrorDiv();
  if (!mirror) {
    return inputRect.left;
  }

  // Copy computed font and text layout styles from the input
  const computed = window.getComputedStyle(input);
  mirror.style.fontFamily = computed.fontFamily;
  mirror.style.fontSize = computed.fontSize;
  mirror.style.fontWeight = computed.fontWeight;
  mirror.style.fontStyle = computed.fontStyle;
  mirror.style.fontVariant = computed.fontVariant;
  mirror.style.fontStretch = computed.fontStretch;
  mirror.style.letterSpacing = computed.letterSpacing;
  mirror.style.wordSpacing = computed.wordSpacing;
  mirror.style.textTransform = computed.textTransform;
  mirror.style.textIndent = computed.textIndent;
  mirror.style.direction = computed.direction;

  // Set the text content of the hidden div
  mirror.textContent = textContent;

  const textWidth = mirror.getBoundingClientRect().width;
  const isRtl = computed.direction === 'rtl';

  let left;
  if (isRtl) {
    const borderRight = parseFloat(computed.borderRightWidth) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    left = inputRect.right - borderRight - paddingRight - textWidth + (input.scrollLeft || 0);
  } else {
    const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    left = inputRect.left + borderLeft + paddingLeft + textWidth - (input.scrollLeft || 0);
  }

  // Clamp within input bounds
  return Math.max(inputRect.left, Math.min(left, inputRect.right));
}

/**
 * Gets caret or range coordinates relative to viewport.
 * Accepts either an OpaqueRange instance or a character offset number.
 * @param {HTMLInputElement} input
 * @param {number|OpaqueRange} [target] Caret position number or OpaqueRange
 * @returns {{ left: number, top: number, bottom: number, height: number, isCaret: boolean }}
 */
export function getCaretCoordinates(input, target) {
  const inputRect = input.getBoundingClientRect();

  // For browsers that don't support OpaqueRange to position the popover,
  // do the trick with a hidden div and setting its text contents to the input's
  // text (or partial text) to figure out the left position to use for the popover.
  if (!isOpaqueRangeSupported) {
    const left = getCaretLeftWithMirrorDiv(input, target);
    return {
      left,
      top: inputRect.top,
      bottom: inputRect.bottom,
      height: inputRect.height,
      isCaret: false,
    };
  }

  // When OpaqueRange is supported, use native OpaqueRange measurement
  let rect = null;
  let tempRange = null;

  if (target && typeof target.getBoundingClientRect === 'function') {
    try {
      const r = target.getBoundingClientRect();
      if (r.height > 0 || r.width > 0 || r.left > 0) {
        rect = r;
      }
    } catch (e) {}
  } else if (typeof input.createValueRange === 'function' && input.value.length > 0) {
    try {
      const pos = Math.max(0, Math.min(typeof target === 'number' ? target : 0, input.value.length));
      tempRange = input.createValueRange(pos, pos);
      const r = tempRange.getBoundingClientRect();
      if (r.height > 0 || r.width > 0 || r.left > 0) {
        rect = r;
      }
    } catch (e) {}
  }

  // Clean up temporary measurement range
  if (tempRange) {
    try {
      tempRange.disconnect();
    } catch (e) {}
  }

  if (rect) {
    // Keep caret left within input bounds
    const left = Math.max(inputRect.left, Math.min(rect.left, inputRect.right));
    const bottom = rect.bottom > 0 ? rect.bottom : inputRect.bottom;
    const top = rect.top > 0 ? rect.top : inputRect.top;
    return {
      left,
      top,
      bottom,
      height: rect.height || inputRect.height,
      isCaret: true,
    };
  }

  return {
    left: inputRect.left,
    top: inputRect.top,
    bottom: inputRect.bottom,
    height: inputRect.height,
    isCaret: false,
  };
}

/**
 * Alias for getCaretCoordinates that clearly conveys range support.
 */
export const getRangeCoordinates = getCaretCoordinates;

/**
 * Positions popover at caret or input element.
 * @param {HTMLElement} popover
 * @param {{ left: number, top: number, bottom: number, height: number }} caretCoords
 * @param {HTMLInputElement} inputElement
 */
export function positionPopover(popover, caretCoords, inputElement) {
  if (!popover) return;

  if (!caretCoords && inputElement) {
    caretCoords = getCaretCoordinates(inputElement);
  }
  if (!caretCoords) return;

  const popoverWidth = popover.offsetWidth || 280;
  const popoverHeight = popover.offsetHeight || 220;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = caretCoords.left;

  // Viewport right edge clamp
  if (left + popoverWidth > viewportWidth - 12) {
    left = viewportWidth - popoverWidth - 12;
  }
  // Viewport left edge clamp
  if (left < 12) {
    left = 12;
  }

  let top = caretCoords.bottom + 6;

  // Viewport bottom edge flip
  if (top + popoverHeight > viewportHeight - 12) {
    const spaceAbove = caretCoords.top - 6;
    if (spaceAbove >= popoverHeight) {
      top = spaceAbove - popoverHeight;
    }
  }

  popover.style.margin = '0';
  popover.style.inset = 'auto';
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}
