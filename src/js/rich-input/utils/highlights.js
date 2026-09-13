/**
 * Highlight manager for <rich-input>
 * Uses the OpaqueRange API and CSS Custom Highlight API to apply syntax highlighting.
 */

export const isOpaqueRangeSupported =
  typeof HTMLInputElement !== 'undefined' &&
  typeof HTMLInputElement.prototype.createValueRange === 'function';

export const isHighlightSupported =
  typeof window !== 'undefined' &&
  typeof window.Highlight !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  'highlights' in CSS;

class HighlightRegistryManager {
  constructor() {
    this.instances = new Set();
    this.registeredKeywords = new Set();
  }

  register(instance) {
    this.instances.add(instance);
  }

  unregister(instance) {
    this.instances.delete(instance);
    this.syncAll();
  }

  recordKeyword(keyword) {
    if (keyword) {
      this.registeredKeywords.add(keyword.toLowerCase());
    }
  }

  syncAll() {
    if (!isHighlightSupported || !isOpaqueRangeSupported) return;

    // Aggregate ranges across all active instances
    const rangesByKeyword = new Map();
    const allKeywordRanges = [];
    const allValueRanges = [];

    for (const inst of this.instances) {
      const instanceRanges = inst.getActiveHighlightRanges();
      for (const [kw, data] of instanceRanges.entries()) {
        const kwLower = kw.toLowerCase();
        this.registeredKeywords.add(kwLower);

        if (!rangesByKeyword.has(kwLower)) {
          rangesByKeyword.set(kwLower, []);
        }

        if (data.valueRanges && data.valueRanges.length > 0) {
          rangesByKeyword.get(kwLower).push(...data.valueRanges);
          allValueRanges.push(...data.valueRanges);
        }

        if (data.keywordRanges && data.keywordRanges.length > 0) {
          allKeywordRanges.push(...data.keywordRanges);
        }
      }
    }

    // 1. Set/update individual keyword highlights (e.g. ::highlight(label))
    for (const kw of this.registeredKeywords) {
      const ranges = rangesByKeyword.get(kw);
      if (ranges && ranges.length > 0) {
        try {
          CSS.highlights.set(kw, new Highlight(...ranges));
        } catch (e) {
          console.warn(`[rich-input] Failed to register highlight for "${kw}":`, e);
        }
      } else {
        CSS.highlights.delete(kw);
      }
    }

    // 2. Set generic highlights
    if (allKeywordRanges.length > 0) {
      try {
        const kwHl = new Highlight(...allKeywordRanges);
        CSS.highlights.set('rich-input-keyword', kwHl);
      } catch (e) {}
    } else {
      CSS.highlights.delete('rich-input-keyword');
    }

    if (allValueRanges.length > 0) {
      try {
        const valHl = new Highlight(...allValueRanges);
        CSS.highlights.set('rich-input-value', valHl);
      } catch (e) {}
    } else {
      CSS.highlights.delete('rich-input-value');
    }
  }
}

export const highlightManager = new HighlightRegistryManager();
