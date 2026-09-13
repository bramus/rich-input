/**
 * <rich-input> entry point
 * Defines <rich-input> custom element and exports RichInput class & parser utilities.
 */

import { RichInput, RichSearch } from './components/rich-input.js';
import { parseSearchTokens, parseSearchQuery, getCaretContext, getSuggestions, applySuggestion } from './utils/query-parser.js';
import { highlightManager, isOpaqueRangeSupported, isHighlightSupported } from './utils/highlights.js';
import { getCaretCoordinates, getRangeCoordinates, positionPopover } from './utils/positioning.js';

if (typeof customElements !== 'undefined') {
  if (!customElements.get('rich-input')) {
    customElements.define('rich-input', RichInput);
  }
  if (!customElements.get('rich-search')) {
    customElements.define('rich-search', RichSearch);
  }
}

export {
  RichInput,
  RichSearch,
  parseSearchTokens,
  parseSearchQuery,
  getCaretContext,
  getSuggestions,
  applySuggestion,
  highlightManager,
  isOpaqueRangeSupported,
  isHighlightSupported,
  getCaretCoordinates,
  getRangeCoordinates,
  positionPopover,
};

export default RichInput;
