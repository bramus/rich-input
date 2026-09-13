/**
 * <rich-search> entry point
 * Defines <rich-search> custom element and exports RichSearch class & parser utilities.
 */

import { RichSearch } from './components/rich-search.js';
import { parseSearchTokens, parseSearchQuery, getCaretContext, getSuggestions, applySuggestion } from './utils/query-parser.js';
import { highlightManager, isOpaqueRangeSupported, isHighlightSupported } from './utils/highlights.js';
import { getCaretCoordinates, positionPopover } from './utils/positioning.js';

if (typeof customElements !== 'undefined' && !customElements.get('rich-search')) {
  customElements.define('rich-search', RichSearch);
}

export {
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
  positionPopover,
};

export default RichSearch;
