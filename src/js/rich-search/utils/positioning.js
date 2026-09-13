/**
 * Caret measurement and popover positioning for <rich-search>
 * Uses OpaqueRange.getBoundingClientRect() with input fallback.
 */

/**
 * Gets caret or range coordinates relative to viewport.
 * Accepts either an OpaqueRange instance or a character offset number.
 * @param {HTMLInputElement} input
 * @param {number|OpaqueRange} [target] Caret position number or OpaqueRange
 * @returns {{ left: number, top: number, bottom: number, height: number, isCaret: boolean }}
 */
export function getCaretCoordinates(input, target) {
  const inputRect = input.getBoundingClientRect();
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
