/**
 * Query tokenizer and parser for <rich-input>
 * Handles keyword:value tokenization, caret context inspection, and suggestion application.
 */

export const DEFAULT_OPERATORS = ['-'];
export const DEFAULT_COMBINATORS = [];

/**
 * Normalizes an operators configuration (string or array) into an array of non-empty operator strings.
 * @param {string|string[]|null|undefined} operators
 * @returns {string[]}
 */
export function normalizeOperators(operators) {
  if (operators === undefined) {
    return [...DEFAULT_OPERATORS];
  }
  if (operators === null || operators === '') {
    return [];
  }
  const rawList = Array.isArray(operators)
    ? operators
    : typeof operators === 'string'
      ? operators.split(/\s+/)
      : [];

  const result = [];
  const seen = new Set();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const parts = item.trim().split(/\s+/).filter(Boolean);
    for (let part of parts) {
      part = part.replace(/^(.)\1+$/, '$1');
      if (!seen.has(part)) {
        seen.add(part);
        result.push(part);
      }
    }
  }
  return result;
}

/**
 * Normalizes a combinators configuration (string or array) into an array of non-empty combinator strings.
 * @param {string|string[]|null|undefined} combinators
 * @returns {string[]}
 */
export function normalizeCombinators(combinators) {
  if (combinators === undefined) {
    return [...DEFAULT_COMBINATORS];
  }
  if (combinators === null || combinators === '') {
    return [];
  }
  const rawList = Array.isArray(combinators)
    ? combinators
    : typeof combinators === 'string'
      ? combinators.split(/\s+/)
      : [];

  const result = [];
  const seen = new Set();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const parts = item.trim().split(/\s+/).filter(Boolean);
    for (const part of parts) {
      if (!seen.has(part)) {
        seen.add(part);
        result.push(part);
      }
    }
  }
  return result;
}

/**
 * Matches if a string starts with any of the configured operators (longest match first).
 * @param {string} str
 * @param {string[]} normalizedOperators
 * @returns {string|null}
 */
function matchOperator(str, normalizedOperators) {
  if (!str || !normalizedOperators || normalizedOperators.length === 0) {
    return null;
  }
  const sorted = [...normalizedOperators].sort((a, b) => b.length - a.length);
  for (const op of sorted) {
    if (str.startsWith(op)) {
      return op;
    }
  }
  return null;
}

export const DEFAULT_DELIMITERS = ['()'];

/**
 * Normalizes delimiters input into a deduplicated array of delimiter pair strings (e.g. ['()', '{}', '[]']).
 * @param {string|string[]|null|undefined} delimiters
 * @returns {string[]}
 */
export function normalizeDelimiters(delimiters) {
  if (delimiters === undefined) {
    return [...DEFAULT_DELIMITERS];
  }
  if (delimiters === null || delimiters === '') {
    return [];
  }
  const rawList = Array.isArray(delimiters)
    ? delimiters
    : typeof delimiters === 'string'
      ? delimiters.split(/\s+/)
      : [];

  const flatTokens = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const parts = item.trim().split(/\s+/).filter(Boolean);
    flatTokens.push(...parts);
  }

  const result = [];
  const seen = new Set();

  for (let i = 0; i < flatTokens.length; i++) {
    let token = flatTokens[i];
    if (token.length === 1 && i + 1 < flatTokens.length && flatTokens[i + 1].length === 1) {
      token = token + flatTokens[i + 1];
      i++;
    } else if (token.length > 2) {
      token = token.replace(/(.)\1+/g, '$1');
    }
    if (token.length >= 2 && !seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result;
}

function buildDelimiterEntries(normalizedDelims) {
  const entries = [];
  if (!normalizedDelims || normalizedDelims.length === 0) return entries;
  for (const pair of normalizedDelims) {
    if (typeof pair !== 'string' || pair.length < 2) continue;
    const open = pair[0];
    const close = pair[pair.length - 1];
    entries.push({ delimiter: open, role: 'open', pair });
    if (close !== open) {
      entries.push({ delimiter: close, role: 'close', pair });
    }
  }
  return entries;
}

function matchDelimiter(str, delimEntries) {
  if (!str || !delimEntries || delimEntries.length === 0) return null;
  for (const entry of delimEntries) {
    if (str.startsWith(entry.delimiter)) {
      return entry;
    }
  }
  return null;
}

/**
 * Parses raw search input into token objects.
 * @param {string} inputStr
 * @param {string|string[]} [operators=DEFAULT_OPERATORS]
 * @param {string|string[]} [combinators=DEFAULT_COMBINATORS]
 * @param {string|string[]} [delimiters=DEFAULT_DELIMITERS]
 * @returns {Array<Object>}
 */
export function parseSearchTokens(
  inputStr,
  operators = DEFAULT_OPERATORS,
  combinators = DEFAULT_COMBINATORS,
  delimiters = DEFAULT_DELIMITERS
) {
  if (typeof inputStr !== 'string') return [];

  const normalizedOps = normalizeOperators(operators);
  const normalizedCombs = normalizeCombinators(combinators);
  const normalizedDelims = normalizeDelimiters(delimiters);
  const delimEntries = buildDelimiterEntries(normalizedDelims);
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

    // 1b. Delimiter
    const matchedDelim = matchDelimiter(inputStr.slice(i), delimEntries);
    if (matchedDelim) {
      tokens.push({
        type: 'delimiter',
        delimiter: matchedDelim.delimiter,
        role: matchedDelim.role,
        pair: matchedDelim.pair,
        raw: matchedDelim.delimiter,
        start: i,
        end: i + matchedDelim.delimiter.length,
      });
      i += matchedDelim.delimiter.length;
      continue;
    }

    const tokenStart = i;

    // 2. Check for optional operator followed by keyword pattern: [a-zA-Z0-9][a-zA-Z0-9_-]*:
    const remaining = inputStr.slice(i);
    const matchedOp = matchOperator(remaining, normalizedOps);
    let colonMatch = null;
    let opLen = 0;

    if (matchedOp) {
      const afterOp = remaining.slice(matchedOp.length);
      const afterOpMatch = afterOp.match(/^([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
      if (afterOpMatch) {
        colonMatch = afterOpMatch;
        opLen = matchedOp.length;
      }
    } else {
      colonMatch = remaining.match(/^([a-zA-Z0-9][a-zA-Z0-9_-]*):/);
    }

    if (colonMatch) {
      const keyword = colonMatch[1];
      const operator = matchedOp || null;
      const operatorStart = operator ? tokenStart : null;
      const operatorEnd = operator ? tokenStart + opLen : null;
      const keywordStart = tokenStart + opLen;
      const colonIndex = keywordStart + keyword.length;
      i = colonIndex + 1; // Move index past ':'

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
        // Unquoted value: until next whitespace, delimiter, or end
        innerStart = i;
        while (
          i < len &&
          !/\s/.test(inputStr[i]) &&
          !matchDelimiter(inputStr.slice(i), delimEntries)
        ) {
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
        operator,
        operatorStart,
        operatorEnd,
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
      // 3. Standalone word token (combinator or plain text)
      while (
        i < len &&
        !/\s/.test(inputStr[i]) &&
        !matchDelimiter(inputStr.slice(i), delimEntries)
      ) {
        i++;
      }
      const raw = inputStr.slice(tokenStart, i);
      if (normalizedCombs.includes(raw)) {
        tokens.push({
          type: 'combinator',
          combinator: raw,
          raw,
          start: tokenStart,
          end: i,
        });
      } else {
        const textOp = matchOperator(raw, normalizedOps);
        const textToken = {
          type: 'text',
          raw,
          start: tokenStart,
          end: i,
        };
        if (textOp) {
          textToken.operator = textOp;
          textToken.operatorStart = tokenStart;
          textToken.operatorEnd = tokenStart + textOp.length;
        }
        tokens.push(textToken);
      }
    }
  }

  return tokens;
}

/**
 * Parses search query into a structured object with the raw string and lexical tokens.
 * @param {string} inputStr
 * @param {string|string[]} [operators=DEFAULT_OPERATORS]
 * @param {string|string[]} [combinators=DEFAULT_COMBINATORS]
 * @param {string|string[]} [delimiters=DEFAULT_DELIMITERS]
 * @returns {{ raw: string, tokens: Array<Object> }}
 */
export function parseSearchQuery(
  inputStr,
  operators = DEFAULT_OPERATORS,
  combinators = DEFAULT_COMBINATORS,
  delimiters = DEFAULT_DELIMITERS
) {
  const tokens = parseSearchTokens(inputStr, operators, combinators, delimiters);

  return {
    raw: inputStr,
    tokens,
  };
}

/**
 * Determines caret context and what autocomplete suggestions are appropriate.
 * @param {string} inputStr
 * @param {number} caretPos
 * @param {Map<string, Object>|Object} configuredKeywords
 * @param {string|string[]} [operators=DEFAULT_OPERATORS]
 * @param {string|string[]} [combinators=DEFAULT_COMBINATORS]
 * @param {string|string[]} [delimiters=DEFAULT_DELIMITERS]
 * @returns {Object}
 */
export function getCaretContext(
  inputStr,
  caretPos,
  configuredKeywords,
  operators = DEFAULT_OPERATORS,
  combinators = DEFAULT_COMBINATORS,
  delimiters = DEFAULT_DELIMITERS
) {
  if (typeof inputStr !== 'string') inputStr = '';
  caretPos = Math.max(0, Math.min(caretPos || 0, inputStr.length));

  const tokens = parseSearchTokens(inputStr, operators, combinators, delimiters);

  // Find token at caret (skip whitespace and delimiter boundary tokens)
  let activeToken = null;
  for (const token of tokens) {
    if (token.type === 'whitespace' || token.type === 'delimiter') continue;
    if (caretPos >= token.start && caretPos <= token.end) {
      activeToken = token;
      break;
    }
  }

  // If caret is in whitespace, delimiter, or empty input (at the start of a new token)
  if (!activeToken || activeToken.type === 'whitespace' || activeToken.type === 'delimiter') {
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
      const context = {
        mode: 'keyword',
        query,
        replaceStart: activeToken.keywordStart,
        replaceEnd: activeToken.colonIndex + 1,
        caretPos,
        token: activeToken,
        tokens,
      };
      if (activeToken.operator) {
        context.operator = activeToken.operator;
      }
      return context;
    } else {
      // User is editing the keyword value (filter based on full value string, not caret position)
      const isQuoted = activeToken.quoted;
      const value = activeToken.innerValue;

      const context = {
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
      if (activeToken.operator) {
        context.operator = activeToken.operator;
      }
      return context;
    }
  }

  // 2. Caret is within a combinator token
  if (activeToken.type === 'combinator') {
    return {
      mode: 'keyword',
      query: activeToken.raw,
      replaceStart: activeToken.start,
      replaceEnd: activeToken.end,
      caretPos,
      token: activeToken,
      tokens,
    };
  }

  // 3. Caret is within a plain text token (filter based on full word, not caret position)
  if (activeToken.type === 'text') {
    if (activeToken.operator) {
      const query = activeToken.raw.slice(activeToken.operator.length);
      return {
        mode: 'keyword',
        operator: activeToken.operator,
        query,
        replaceStart: activeToken.operatorEnd,
        replaceEnd: activeToken.end,
        caretPos,
        token: activeToken,
        tokens,
      };
    }
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
 * @param {string|string[]} [configuredCombinators=DEFAULT_COMBINATORS]
 * @returns {Array<Object>}
 */
export function getSuggestions(context, configuredKeywords, configuredCombinators = DEFAULT_COMBINATORS) {
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

    if (!context.operator) {
      const normalizedCombs = normalizeCombinators(configuredCombinators);
      if (normalizedCombs.length > 0) {
        let shouldIncludeCombinators = true;
        if (!q && Array.isArray(context.tokens)) {
          const precedingTokens = context.tokens.filter(
            (t) => t.type !== 'whitespace' && t.end <= context.replaceStart
          );
          const lastPreceding = precedingTokens[precedingTokens.length - 1];
          // Don't suggest combinators at the very start of an empty query (unless typing a query prefix),
          // immediately after another combinator, or immediately after an opening delimiter
          if (
            precedingTokens.length === 0 ||
            lastPreceding?.type === 'combinator' ||
            (lastPreceding?.type === 'delimiter' && lastPreceding?.role === 'open')
          ) {
            shouldIncludeCombinators = false;
          }
        }
        if (shouldIncludeCombinators) {
          for (const comb of normalizedCombs) {
            const combLower = comb.toLowerCase();
            if (!q || combLower.startsWith(q)) {
              suggestions.push({
                type: 'combinator',
                id: comb,
                combinator: comb,
                label: comb,
                display: comb,
                insertText: comb,
                description: 'Combinator',
              });
            }
          }
        }
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

  const followingToken = Array.isArray(context.tokens)
    ? context.tokens.find((t) => t.start === replaceEnd)
    : null;
  const isFollowedByCloseDelimiter =
    followingToken?.type === 'delimiter' && followingToken?.role === 'close';

  if (suggestion.type === 'keyword') {
    // When inserting a keyword like `mix:`, do not add trailing space so user can immediately type value
    // If after text starts with colon, remove it to avoid `mix::`
    if (after.startsWith(':')) {
      after = after.slice(1);
    } else if (
      context.token?.type !== 'keyword' &&
      after.length > 0 &&
      !/^\s/.test(after) &&
      !isFollowedByCloseDelimiter
    ) {
      // Ensure space before following token so it doesn't become the value of this keyword
      after = ' ' + after;
    }
    const newValue = before + insertText + after;
    const newCaret = before.length + insertText.length;
    return { newValue, newCaret };
  }

  // When inserting a value (e.g. `"We Play House Recordings"`)
  // Add a trailing space if after does not already start with whitespace or a closing delimiter
  const hasLeadingSpaceAfter = /^\s/.test(after);
  if ((after.length === 0 || !hasLeadingSpaceAfter) && !isFollowedByCloseDelimiter) {
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
