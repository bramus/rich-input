/**
 * <rich-input> entry point
 * Defines <rich-input> custom element and exports RichInput class & parser utilities.
 */

import { RichInput } from './components/rich-input.js';
import { parseSearchTokens, parseSearchQuery, getCaretContext, getSuggestions, applySuggestion, isDatalistValue } from './utils/query-parser.js';
import { highlightManager, isOpaqueRangeSupported, isHighlightSupported } from './utils/highlights.js';
import { getCaretCoordinates, getRangeCoordinates, positionPopover, getCaretLeftWithMirrorDiv } from './utils/positioning.js';
import { setupContentEditableAdapter, isContentEditableFallbackActive } from './utils/contenteditable-adapter.js';

if (typeof customElements !== 'undefined') {
  if (!customElements.get('rich-input')) {
    customElements.define('rich-input', RichInput);
  }
}

export {
  RichInput,
  parseSearchTokens,
  parseSearchQuery,
  getCaretContext,
  getSuggestions,
  applySuggestion,
  isDatalistValue,
  highlightManager,
  isOpaqueRangeSupported,
  isHighlightSupported,
  isContentEditableFallbackActive,
  setupContentEditableAdapter,
  getCaretCoordinates,
  getRangeCoordinates,
  positionPopover,
  getCaretLeftWithMirrorDiv,
};

export default RichInput;
