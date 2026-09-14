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

function isRangeCollapsed(range) {
  if (!range) return true;
  if (range.collapsed === true) return true;
  if (typeof range.startOffset === 'number' && typeof range.endOffset === 'number') {
    if (range.startOffset === range.endOffset && range.startContainer === range.endContainer) {
      return true;
    }
  }
  return false;
}

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
    if (!isHighlightSupported) return;

    // Aggregate ranges across all active instances
    const rangesByKeyword = new Map();
    const allKeywordRanges = [];
    const allValueRanges = [];
    const allInvalidRanges = [];

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

      if (typeof inst.getActiveInvalidRanges === 'function') {
        const invRanges = inst.getActiveInvalidRanges();
        if (invRanges && invRanges.length > 0) {
          allInvalidRanges.push(...invRanges);
        }
      }
    }

    // 1. Set/update individual keyword highlights (e.g. ::highlight(label))
    for (const kw of this.registeredKeywords) {
      const ranges = rangesByKeyword.get(kw) || [];
      let hl = CSS.highlights.get(kw);
      if (!hl) {
        try {
          hl = new Highlight();
          CSS.highlights.set(kw, hl);
        } catch (e) {}
      }
      if (hl) {
        hl.clear();
        for (const r of ranges) {
          try {
            if (isRangeCollapsed(r)) continue;
            hl.add(r);
          } catch (e) {}
        }
      }
    }

    // 2. Set generic highlights
    let kwHl = CSS.highlights.get('rich-input-keyword');
    if (!kwHl) {
      try {
        kwHl = new Highlight();
        CSS.highlights.set('rich-input-keyword', kwHl);
      } catch (e) {}
    }
    if (kwHl) {
      kwHl.clear();
      for (const r of allKeywordRanges) {
        try {
          if (isRangeCollapsed(r)) continue;
          kwHl.add(r);
        } catch (e) {}
      }
    }

    let valHl = CSS.highlights.get('rich-input-value');
    if (!valHl) {
      try {
        valHl = new Highlight();
        CSS.highlights.set('rich-input-value', valHl);
      } catch (e) {}
    }
    if (valHl) {
      valHl.clear();
      for (const r of allValueRanges) {
        try {
          if (isRangeCollapsed(r)) continue;
          valHl.add(r);
        } catch (e) {}
      }
    }

    // 3. Set invalid highlights (rich-input-invalid)
    let invHl = CSS.highlights.get('rich-input-invalid');
    if (!invHl) {
      try {
        invHl = new Highlight();
        CSS.highlights.set('rich-input-invalid', invHl);
      } catch (e) {}
    }
    if (invHl) {
      try {
        invHl.priority = 10;
      } catch (e) {}
      invHl.clear();
      for (const r of allInvalidRanges) {
        try {
          if (isRangeCollapsed(r)) continue;
          invHl.add(r);
        } catch (e) {}
      }
    }
  }
}

export const highlightManager = new HighlightRegistryManager();
