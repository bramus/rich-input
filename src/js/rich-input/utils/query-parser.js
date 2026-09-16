/**
 * Query tokenizer and parser for <rich-input>
 * Handles keyword:value tokenization, caret context inspection, and suggestion application.
 */

/**
 * Parses raw search input into token objects.
 * @param {string} inputStr
 * @returns {Array<Object>}
 */
export function parseSearchTokens(inputStr) {
  if (typeof inputStr !== 'string') return [];

  const tokens = [];
  let i = 0;
  const len = inputStr.length;

  while (i < len) {
    // 1. Whitespace
    if (/\s/.test(inputStr[i])) {
      const wsStart = i;
      while (i < len && /\s/.test(inputStr[i])) {
        i++;
      }
      tokens.push({
        type: 'whitespace',
        raw: inputStr.slice(wsStart, i),
        start: wsStart,
        end: i,
      });
      continue;
    }

    const tokenStart = i;

    // 2. Check for keyword pattern: [a-zA-Z0-9_-]+:
    const remaining = inputStr.slice(i);
    const colonMatch = remaining.match(/^([a-zA-Z0-9_-]+):/);

    if (colonMatch) {
      const keyword = colonMatch[1];
      const keywordStart = i;
      const colonIndex = i + keyword.length;
      i += colonMatch[0].length; // Move index past ':'

      const valueStart = i;
      let quoted = false;
      let quoteChar = '';
      let isClosed = false;
      let innerStart = i;
      let innerEnd = i;

      if (i < len && (inputStr[i] === '"' || inputStr[i] === "'")) {
        // Quoted string value
        quoted = true;
        quoteChar = inputStr[i];
        i++; // skip opening quote
        innerStart = i;

        while (i < len && inputStr[i] !== quoteChar) {
          i++;
        }
        innerEnd = i;

        if (i < len && inputStr[i] === quoteChar) {
          isClosed = true;
          i++; // skip closing quote
        }
      } else {
        // Unquoted value: until next whitespace or end
        innerStart = i;
        while (i < len && !/\s/.test(inputStr[i])) {
          i++;
        }
        innerEnd = i;
        isClosed = true;
      }

      const rawValue = inputStr.slice(valueStart, i);
      const innerValue = inputStr.slice(innerStart, innerEnd);

      tokens.push({
        type: 'keyword',
        raw: inputStr.slice(tokenStart, i),
        start: tokenStart,
        end: i,
        keyword,
        keywordLower: keyword.toLowerCase(),
        keywordStart,
        keywordEnd: colonIndex + 1,
        colonIndex,
        valueStart,
        valueEnd: i,
        rawValue,
        innerValue,
        innerStart,
        innerEnd,
        quoted,
        quoteChar,
        isClosed,
      });
    } else {
      // 3. Plain text token (single word or unfinished keyword)
      while (i < len && !/\s/.test(inputStr[i])) {
        i++;
      }
      tokens.push({
        type: 'text',
        raw: inputStr.slice(tokenStart, i),
        start: tokenStart,
        end: i,
      });
    }
  }

  return tokens;
}

/**
 * Parses search query into a structured object with keywords and free text.
 * @param {string} inputStr
 * @returns {{ raw: string, text: string, keywords: Record<string, string[]>, tokens: Array<Object> }}
 */
export function parseSearchQuery(inputStr) {
  const tokens = parseSearchTokens(inputStr);
  const keywords = {};
  const textWords = [];

  for (const token of tokens) {
    if (token.type === 'keyword') {
      const kw = token.keywordLower;
      if (!keywords[kw]) {
        keywords[kw] = [];
      }
      keywords[kw].push(token.innerValue);
    } else if (token.type === 'text') {
      textWords.push(token.raw);
    }
  }

  return {
    raw: inputStr,
    text: textWords.join(' '),
    keywords,
    tokens,
  };
}

/**
 * Determines caret context and what autocomplete suggestions are appropriate.
 * @param {string} inputStr
 * @param {number} caretPos
 * @param {Map<string, Object>|Object} configuredKeywords
 * @returns {Object}
 */
export function getCaretContext(inputStr, caretPos, configuredKeywords) {
  if (typeof inputStr !== 'string') inputStr = '';
  caretPos = Math.max(0, Math.min(caretPos || 0, inputStr.length));

  const tokens = parseSearchTokens(inputStr);

  // Find token at caret
  let activeToken = null;
  for (const token of tokens) {
    if (caretPos >= token.start && caretPos <= token.end) {
      activeToken = token;
      break;
    }
  }

  // If caret is in whitespace or empty input (at the start of a new token)
  if (!activeToken || activeToken.type === 'whitespace') {
    return {
      mode: 'keyword',
      query: '',
      replaceStart: caretPos,
      replaceEnd: caretPos,
      caretPos,
      tokens,
    };
  }

  // 1. Caret is within a keyword token
  if (activeToken.type === 'keyword') {
    if (caretPos <= activeToken.colonIndex) {
      // User is editing the keyword name (filter based on full keyword name, not caret position)
      const query = activeToken.keyword;
      return {
        mode: 'keyword',
        query,
        replaceStart: activeToken.start,
        replaceEnd: activeToken.colonIndex + 1,
        caretPos,
        token: activeToken,
        tokens,
      };
    } else {
      // User is editing the keyword value (filter based on full value string, not caret position)
      const isQuoted = activeToken.quoted;
      const value = activeToken.innerValue;

      return {
        mode: 'value',
        keyword: activeToken.keyword,
        keywordLower: activeToken.keywordLower,
        valuePrefix: value,
        query: value,
        quoted: isQuoted,
        quoteChar: activeToken.quoteChar || '"',
        isClosed: activeToken.isClosed,
        replaceStart: activeToken.valueStart,
        replaceEnd: activeToken.valueEnd,
        caretPos,
        token: activeToken,
        tokens,
      };
    }
  }

  // 2. Caret is within a plain text token (filter based on full word, not caret position)
  if (activeToken.type === 'text') {
    const query = activeToken.raw;
    return {
      mode: 'keyword',
      query,
      replaceStart: activeToken.start,
      replaceEnd: activeToken.end,
      caretPos,
      token: activeToken,
      tokens,
    };
  }

  return {
    mode: 'none',
    caretPos,
    tokens,
  };
}

/**
 * Generates suggestions for the given caret context.
 * @param {Object} context
 * @param {Map<string, Object>} configuredKeywords
 * @returns {Array<Object>}
 */
export function getSuggestions(context, configuredKeywords) {
  if (!context || context.mode === 'none') return [];

  const suggestions = [];

  if (context.mode === 'keyword') {
    const q = (context.query || '').toLowerCase().trim();
    for (const [id, kw] of configuredKeywords.entries()) {
      const idLower = id.toLowerCase();
      const labelLower = (kw.label || '').toLowerCase();
      const matches = !q || idLower.startsWith(q) || labelLower.startsWith(q);

      if (matches) {
        suggestions.push({
          type: 'keyword',
          id: kw.id,
          label: kw.label || kw.id,
          display: `${kw.id}:`,
          insertText: `${kw.id}:`,
          description: kw.label || kw.id,
          dataType: kw.dataType || 'string',
        });
      }
    }
  } else if (context.mode === 'value') {
    const kwConfig = configuredKeywords.get(context.keywordLower);
    if (!kwConfig) return [];

    const prefix = (context.valuePrefix || '').toLowerCase();

    for (const opt of kwConfig.options) {
      const valLower = (opt.value || '').toLowerCase();
      const lblLower = (opt.label || '').toLowerCase();
      const txtLower = (opt.text || '').toLowerCase();
      const matches = !prefix || valLower.includes(prefix) || lblLower.includes(prefix) || txtLower.includes(prefix);

      if (matches) {
        // Needs quotes if option contains spaces, or if already quoted, or if contains colons
        const needsQuotes = context.quoted || opt.value.includes(' ') || opt.value.includes(':');
        const quoteChar = context.quoteChar || '"';
        const formatted = needsQuotes ? `${quoteChar}${opt.value}${quoteChar}` : opt.value;
        const displayText = opt.text || opt.value;

        suggestions.push({
          type: 'value',
          keyword: kwConfig.id,
          keywordLabel: kwConfig.label || kwConfig.id,
          value: opt.value,
          label: opt.label || opt.value,
          display: displayText,
          insertText: formatted,
          description: (opt.label && opt.label !== opt.value && opt.label !== displayText) ? opt.label : '',
          dataType: kwConfig.dataType || 'string',
          element: opt.element,
          image: opt.image,
        });
      }
    }
  }

  return suggestions;
}

/**
 * Applies a selected suggestion to the current input string.
 * @param {string} inputStr
 * @param {Object} suggestion
 * @param {Object} context
 * @returns {{ newValue: string, newCaret: number }}
 */
export function applySuggestion(inputStr, suggestion, context) {
  const replaceStart = context.replaceStart;
  const replaceEnd = context.replaceEnd;

  const before = inputStr.slice(0, replaceStart);
  let after = inputStr.slice(replaceEnd);
  let insertText = suggestion.insertText;

  if (suggestion.type === 'keyword') {
    // When inserting a keyword like `mix:`, do not add trailing space so user can immediately type value
    // If after text starts with colon, remove it to avoid `mix::`
    if (after.startsWith(':')) {
      after = after.slice(1);
    } else if (context.token?.type !== 'keyword' && after.length > 0 && !/^\s/.test(after)) {
      // Ensure space before following token so it doesn't become the value of this keyword
      after = ' ' + after;
    }
    const newValue = before + insertText + after;
    const newCaret = before.length + insertText.length;
    return { newValue, newCaret };
  }

  // When inserting a value (e.g. `"We Play House Recordings"`)
  // Add a trailing space if after does not already start with whitespace
  const hasLeadingSpaceAfter = /^\s/.test(after);
  if (after.length === 0 || !hasLeadingSpaceAfter) {
    insertText += ' ';
  }

  const newValue = before + insertText + after;
  const newCaret = before.length + insertText.length + (hasLeadingSpaceAfter ? 1 : 0);
  return { newValue, newCaret };
}

/**
 * Checks whether a given value matches any option in the keyword configuration.
 * @param {Object} kwConfig
 * @param {string} value
 * @returns {boolean}
 */
export function isDatalistValue(kwConfig, value) {
  if (!kwConfig || !Array.isArray(kwConfig.options) || kwConfig.options.length === 0) {
    return true;
  }
  const val = (value ?? '').trim().toLowerCase();
  if (!val) {
    return true;
  }
  return kwConfig.options.some((opt) => {
    const optVal = (opt.value ?? '').trim().toLowerCase();
    const optLabel = (opt.label ?? '').trim().toLowerCase();
    const optText = (opt.text ?? '').trim().toLowerCase();
    return optVal === val || optLabel === val || optText === val;
  });
}
