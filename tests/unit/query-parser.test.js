import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPERATORS,
  normalizeOperators,
  DEFAULT_COMBINATORS,
  normalizeCombinators,
  parseSearchTokens,
  parseSearchQuery,
  getCaretContext,
  getSuggestions,
  applySuggestion,
  isDatalistValue,
} from '../../src/js/rich-input/utils/query-parser.js';

describe('query-parser unit tests', () => {
  describe('normalizeOperators()', () => {
    it('returns default operators ["-"] when undefined', () => {
      assert.deepEqual(normalizeOperators(undefined), DEFAULT_OPERATORS);
      assert.deepEqual(normalizeOperators(undefined), ['-']);
    });

    it('returns empty array for null or empty string', () => {
      assert.deepEqual(normalizeOperators(null), []);
      assert.deepEqual(normalizeOperators(''), []);
      assert.deepEqual(normalizeOperators('   '), []);
    });

    it('parses space-separated strings and arrays with deduplication and collapses repeated characters', () => {
      assert.deepEqual(normalizeOperators('- ~ +'), ['-', '~', '+']);
      assert.deepEqual(normalizeOperators(['-', '~', '+', '-']), ['-', '~', '+']);
      assert.deepEqual(normalizeOperators(['- ~', '!=']), ['-', '~', '!=']);
      assert.deepEqual(normalizeOperators('- - +'), ['-', '+']);
      assert.deepEqual(normalizeOperators('~~ +'), ['~', '+']);
      assert.deepEqual(normalizeOperators('--- ~~~ +++'), ['-', '~', '+']);
    });
  });

  describe('normalizeCombinators()', () => {
    it('returns default combinators [] when undefined', () => {
      assert.deepEqual(normalizeCombinators(undefined), DEFAULT_COMBINATORS);
      assert.deepEqual(normalizeCombinators(undefined), []);
    });

    it('returns empty array for null or empty string', () => {
      assert.deepEqual(normalizeCombinators(null), []);
      assert.deepEqual(normalizeCombinators(''), []);
      assert.deepEqual(normalizeCombinators('   '), []);
    });

    it('parses space-separated strings and arrays with deduplication', () => {
      assert.deepEqual(normalizeCombinators('AND OR NOT'), ['AND', 'OR', 'NOT']);
      assert.deepEqual(normalizeCombinators(['AND', 'OR', 'NOT', 'AND']), ['AND', 'OR', 'NOT']);
      assert.deepEqual(normalizeCombinators(['AND OR', 'XOR']), ['AND', 'OR', 'XOR']);
    });
  });

  describe('parseSearchTokens()', () => {
    it('returns an empty array for non-string or empty input', () => {
      assert.deepEqual(parseSearchTokens(null), []);
      assert.deepEqual(parseSearchTokens(undefined), []);
      assert.deepEqual(parseSearchTokens(123), []);
      assert.deepEqual(parseSearchTokens(''), []);
    });

    it('parses plain text and whitespace tokens', () => {
      const tokens = parseSearchTokens('ambient house');
      assert.equal(tokens.length, 3);
      assert.deepEqual(tokens[0], {
        type: 'text',
        raw: 'ambient',
        start: 0,
        end: 7,
      });
      assert.deepEqual(tokens[1], {
        type: 'whitespace',
        raw: ' ',
        start: 7,
        end: 8,
      });
      assert.deepEqual(tokens[2], {
        type: 'text',
        raw: 'house',
        start: 8,
        end: 13,
      });
    });

    it('parses unquoted keyword:value tokens', () => {
      const tokens = parseSearchTokens('year:2026');
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0].type, 'keyword');
      assert.equal(tokens[0].operator, null);
      assert.equal(tokens[0].keyword, 'year');
      assert.equal(tokens[0].keywordLower, 'year');
      assert.equal(tokens[0].rawValue, '2026');
      assert.equal(tokens[0].innerValue, '2026');
      assert.equal(tokens[0].quoted, false);
      assert.equal(tokens[0].isClosed, true);
      assert.equal(tokens[0].start, 0);
      assert.equal(tokens[0].end, 9);
    });

    it('parses negative keyword:value tokens with default "-" operator', () => {
      const tokens = parseSearchTokens('-style:Acid');
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0].type, 'keyword');
      assert.equal(tokens[0].operator, '-');
      assert.equal(tokens[0].operatorStart, 0);
      assert.equal(tokens[0].operatorEnd, 1);
      assert.equal(tokens[0].keyword, 'style');
      assert.equal(tokens[0].keywordLower, 'style');
      assert.equal(tokens[0].keywordStart, 1);
      assert.equal(tokens[0].keywordEnd, 7);
      assert.equal(tokens[0].colonIndex, 6);
      assert.equal(tokens[0].valueStart, 7);
      assert.equal(tokens[0].valueEnd, 11);
      assert.equal(tokens[0].innerValue, 'Acid');
    });

    it('parses custom operators when configured', () => {
      const tokens = parseSearchTokens('~style:Acid +year:2026 !=label:"Warp Records"', '- ~ + !=');
      const kwTokens = tokens.filter((t) => t.type === 'keyword');
      assert.equal(kwTokens.length, 3);

      assert.equal(kwTokens[0].operator, '~');
      assert.equal(kwTokens[0].keyword, 'style');
      assert.equal(kwTokens[0].innerValue, 'Acid');

      assert.equal(kwTokens[1].operator, '+');
      assert.equal(kwTokens[1].keyword, 'year');
      assert.equal(kwTokens[1].innerValue, '2026');

      assert.equal(kwTokens[2].operator, '!=');
      assert.equal(kwTokens[2].operatorStart, 23);
      assert.equal(kwTokens[2].operatorEnd, 25);
      assert.equal(kwTokens[2].keyword, 'label');
      assert.equal(kwTokens[2].innerValue, 'Warp Records');
    });

    it('treats -key:value and ~key:value as plain text tokens when their prefix is not in configured operators', () => {
      const tokens = parseSearchTokens('-year:2024 ~year:2024 !year:2024 +year:2024', '+');
      const nonWhitespace = tokens.filter((t) => t.type !== 'whitespace');
      assert.equal(nonWhitespace.length, 4);
      assert.equal(nonWhitespace[0].type, 'text');
      assert.equal(nonWhitespace[0].raw, '-year:2024');
      assert.equal(nonWhitespace[1].type, 'text');
      assert.equal(nonWhitespace[1].raw, '~year:2024');
      assert.equal(nonWhitespace[2].type, 'text');
      assert.equal(nonWhitespace[2].raw, '!year:2024');
      assert.equal(nonWhitespace[3].type, 'keyword');
      assert.equal(nonWhitespace[3].operator, '+');
      assert.equal(nonWhitespace[3].keyword, 'year');
    });

    it('parses double-quoted and single-quoted keyword values', () => {
      const tokens = parseSearchTokens('label:"Warp Records" artist:\'Aphex Twin\'');
      const kwTokens = tokens.filter((t) => t.type === 'keyword');
      assert.equal(kwTokens.length, 2);

      assert.equal(kwTokens[0].keyword, 'label');
      assert.equal(kwTokens[0].rawValue, '"Warp Records"');
      assert.equal(kwTokens[0].innerValue, 'Warp Records');
      assert.equal(kwTokens[0].quoted, true);
      assert.equal(kwTokens[0].quoteChar, '"');
      assert.equal(kwTokens[0].isClosed, true);

      assert.equal(kwTokens[1].keyword, 'artist');
      assert.equal(kwTokens[1].rawValue, "'Aphex Twin'");
      assert.equal(kwTokens[1].innerValue, 'Aphex Twin');
      assert.equal(kwTokens[1].quoted, true);
      assert.equal(kwTokens[1].quoteChar, "'");
      assert.equal(kwTokens[1].isClosed, true);
    });

    it('handles unclosed quoted values', () => {
      const tokens = parseSearchTokens('label:"We Play House');
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0].type, 'keyword');
      assert.equal(tokens[0].innerValue, 'We Play House');
      assert.equal(tokens[0].quoted, true);
      assert.equal(tokens[0].isClosed, false);
    });

    it('handles keyword with empty value after colon', () => {
      const tokens = parseSearchTokens('label:');
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0].type, 'keyword');
      assert.equal(tokens[0].keyword, 'label');
      assert.equal(tokens[0].innerValue, '');
      assert.equal(tokens[0].rawValue, '');
    });

    it('parses standalone combinator tokens when configured', () => {
      const tokens = parseSearchTokens(
        'artist:"Aphex Twin" OR label:"Defected" AND -style:Acid',
        DEFAULT_OPERATORS,
        'AND OR NOT'
      );
      const combTokens = tokens.filter((t) => t.type === 'combinator');
      assert.equal(combTokens.length, 2);
      assert.equal(combTokens[0].combinator, 'OR');
      assert.equal(combTokens[0].raw, 'OR');
      assert.equal(combTokens[1].combinator, 'AND');
      assert.equal(combTokens[1].raw, 'AND');
    });
  });

  describe('parseSearchQuery()', () => {
    it('aggregates free text and grouped keyword values including operators', () => {
      const input = 'ambient artist:"Aphex Twin" LABEL:Warp -style:Acid artist:"Four Tet" deep';
      const result = parseSearchQuery(input);

      assert.equal(result.raw, input);
      assert.equal(result.text, 'ambient deep');
      assert.deepEqual(result.combinators, []);
      assert.deepEqual(result.keywords, {
        artist: ['Aphex Twin', 'Four Tet'],
        label: ['Warp'],
        '-style': ['Acid'],
      });
      assert.ok(Array.isArray(result.tokens));
    });

    it('collects matched combinators and excludes them from free text', () => {
      const input = 'ambient artist:"Aphex Twin" OR label:"Defected"';
      const result = parseSearchQuery(input, DEFAULT_OPERATORS, 'AND OR NOT');

      assert.equal(result.raw, input);
      assert.equal(result.text, 'ambient');
      assert.deepEqual(result.combinators, ['OR']);
      assert.deepEqual(result.keywords, {
        artist: ['Aphex Twin'],
        label: ['Defected'],
      });
    });
  });

  describe('getCaretContext()', () => {
    it('returns keyword mode when input is empty or caret is in whitespace', () => {
      const ctxEmpty = getCaretContext('', 0);
      assert.equal(ctxEmpty.mode, 'keyword');
      assert.equal(ctxEmpty.query, '');

      const ctxWs = getCaretContext('year:2026 ', 10);
      assert.equal(ctxWs.mode, 'keyword');
      assert.equal(ctxWs.query, '');
      assert.equal(ctxWs.replaceStart, 10);
      assert.equal(ctxWs.replaceEnd, 10);
    });

    it('returns keyword mode when caret is inside plain text token', () => {
      const ctx = getCaretContext('art', 2);
      assert.equal(ctx.mode, 'keyword');
      assert.equal(ctx.query, 'art');
      assert.equal(ctx.replaceStart, 0);
      assert.equal(ctx.replaceEnd, 3);
    });

    it('returns keyword mode when caret is inside a combinator token', () => {
      const ctx = getCaretContext('artist:Aphex OR', 14, new Map(), DEFAULT_OPERATORS, 'AND OR NOT');
      assert.equal(ctx.mode, 'keyword');
      assert.equal(ctx.query, 'OR');
      assert.equal(ctx.replaceStart, 13);
      assert.equal(ctx.replaceEnd, 15);
    });

    it('returns keyword mode with operator when typing an operator prefix', () => {
      const ctxOpOnly = getCaretContext('-', 1);
      assert.equal(ctxOpOnly.mode, 'keyword');
      assert.equal(ctxOpOnly.operator, '-');
      assert.equal(ctxOpOnly.query, '');
      assert.equal(ctxOpOnly.replaceStart, 1);
      assert.equal(ctxOpOnly.replaceEnd, 1);

      const ctxOpText = getCaretContext('-st', 3);
      assert.equal(ctxOpText.mode, 'keyword');
      assert.equal(ctxOpText.operator, '-');
      assert.equal(ctxOpText.query, 'st');
      assert.equal(ctxOpText.replaceStart, 1);
      assert.equal(ctxOpText.replaceEnd, 3);
    });

    it('returns keyword mode when caret is before or at colon of a keyword token', () => {
      const ctx = getCaretContext('label:Warp', 3);
      assert.equal(ctx.mode, 'keyword');
      assert.equal(ctx.query, 'label');
      assert.equal(ctx.replaceStart, 0);
      assert.equal(ctx.replaceEnd, 6);

      const ctxNeg = getCaretContext('-label:Warp', 4);
      assert.equal(ctxNeg.mode, 'keyword');
      assert.equal(ctxNeg.operator, '-');
      assert.equal(ctxNeg.query, 'label');
      assert.equal(ctxNeg.replaceStart, 1);
      assert.equal(ctxNeg.replaceEnd, 7);
    });

    it('returns value mode when caret is in the value part of a keyword token', () => {
      const ctx = getCaretContext('label:"We Play"', 10);
      assert.equal(ctx.mode, 'value');
      assert.equal(ctx.keyword, 'label');
      assert.equal(ctx.keywordLower, 'label');
      assert.equal(ctx.valuePrefix, 'We Play');
      assert.equal(ctx.quoted, true);
      assert.equal(ctx.replaceStart, 6);
      assert.equal(ctx.replaceEnd, 15);

      const ctxNeg = getCaretContext('-style:Ac', 9);
      assert.equal(ctxNeg.mode, 'value');
      assert.equal(ctxNeg.operator, '-');
      assert.equal(ctxNeg.keyword, 'style');
      assert.equal(ctxNeg.keywordLower, 'style');
      assert.equal(ctxNeg.valuePrefix, 'Ac');
      assert.equal(ctxNeg.replaceStart, 7);
      assert.equal(ctxNeg.replaceEnd, 9);
    });
  });

  describe('getSuggestions()', () => {
    const configuredKeywords = new Map([
      [
        'label',
        {
          id: 'label',
          label: 'Record Label',
          dataType: 'string',
          options: [
            { value: 'Warp Records', label: 'Warp Records' },
            { value: 'Defected', label: 'Defected' },
            { value: 'We Play House Recordings', label: 'WPH' },
          ],
        },
      ],
      [
        'year',
        {
          id: 'year',
          label: 'Release Year',
          dataType: 'number',
          options: [
            { value: '2026', label: 'Current Year' },
            { value: '1999', label: 'Classic' },
          ],
        },
      ],
      [
        'style',
        {
          id: 'style',
          label: 'Style',
          dataType: 'string',
          options: [
            { value: 'Acid', label: 'Acid' },
            { value: 'Deep House', label: 'Deep House' },
          ],
        },
      ],
    ]);

    it('returns matching keyword suggestions in keyword mode', () => {
      const ctx = getCaretContext('la', 2);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'keyword');
      assert.equal(suggestions[0].id, 'label');
      assert.equal(suggestions[0].insertText, 'label:');
    });

    it('returns matching combinator suggestions when typing a combinator prefix', () => {
      const ctx = getCaretContext('label:Warp O', 12, configuredKeywords, DEFAULT_OPERATORS, 'AND OR NOT');
      const suggestions = getSuggestions(ctx, configuredKeywords, 'AND OR NOT');
      const combSug = suggestions.find((s) => s.type === 'combinator');
      assert.ok(combSug);
      assert.equal(combSug.combinator, 'OR');
      assert.equal(combSug.insertText, 'OR');
    });

    it('returns matching keyword suggestions when prefixed by an operator', () => {
      const ctx = getCaretContext('-st', 3);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'keyword');
      assert.equal(suggestions[0].id, 'style');
      assert.equal(suggestions[0].insertText, 'style:');
    });

    it('matches keyword suggestions by label as well as id', () => {
      const ctx = getCaretContext('rel', 3);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].id, 'year');
    });

    it('returns matching value suggestions with automatic quoting for spaces', () => {
      const ctx = getCaretContext('label:We', 8);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'value');
      assert.equal(suggestions[0].value, 'We Play House Recordings');
      assert.equal(suggestions[0].insertText, '"We Play House Recordings"');
    });

    it('returns matching value suggestions when keyword has an operator prefix', () => {
      const ctx = getCaretContext('-style:Ac', 9);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'value');
      assert.equal(suggestions[0].value, 'Acid');
      assert.equal(suggestions[0].insertText, 'Acid');
    });

    it('does not quote single-word values unless already quoted', () => {
      const ctxUnquoted = getCaretContext('label:Def', 9);
      const suggestionsUnquoted = getSuggestions(ctxUnquoted, configuredKeywords);
      assert.equal(suggestionsUnquoted[0].insertText, 'Defected');

      const ctxQuoted = getCaretContext('label:"Def', 10);
      const suggestionsQuoted = getSuggestions(ctxQuoted, configuredKeywords);
      assert.equal(suggestionsQuoted[0].insertText, '"Defected"');
    });
  });

  describe('applySuggestion()', () => {
    it('applies a keyword suggestion without trailing space and positions caret after colon', () => {
      const input = 'la';
      const ctx = getCaretContext(input, 2);
      const suggestion = { type: 'keyword', insertText: 'label:' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, 'label:');
      assert.equal(newCaret, 6);
    });

    it('applies a combinator suggestion and appends a trailing space', () => {
      const input = 'label:Warp O';
      const ctx = getCaretContext(input, 12, new Map(), DEFAULT_OPERATORS, 'AND OR NOT');
      const suggestion = { type: 'combinator', combinator: 'OR', insertText: 'OR' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, 'label:Warp OR ');
      assert.equal(newCaret, 14);
    });

    it('preserves operator prefix when applying a keyword suggestion', () => {
      const input = '-st';
      const ctx = getCaretContext(input, 3);
      const suggestion = { type: 'keyword', insertText: 'style:' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, '-style:');
      assert.equal(newCaret, 7);
    });

    it('applies a value suggestion and appends a trailing space', () => {
      const input = 'label:We';
      const ctx = getCaretContext(input, 8);
      const suggestion = { type: 'value', insertText: '"We Play House Recordings"' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, 'label:"We Play House Recordings" ');
      assert.equal(newCaret, 33);
    });

    it('preserves operator and keyword when applying a value suggestion', () => {
      const input = '-style:Ac';
      const ctx = getCaretContext(input, 9);
      const suggestion = { type: 'value', insertText: 'Acid' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, '-style:Acid ');
      assert.equal(newCaret, 12);
    });

    it('preserves existing following tokens when applying a suggestion in the middle of input', () => {
      const input = 'label:Def year:2026';
      const ctx = getCaretContext(input, 9);
      const suggestion = { type: 'value', insertText: 'Defected' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, 'label:Defected year:2026');
      assert.equal(newCaret, 15);
    });
  });

  describe('isDatalistValue()', () => {
    const kwConfig = {
      options: [
        { value: 'Warp Records', label: 'Warp' },
        { value: '2026', text: 'Twenty Twenty-Six' },
      ],
    };

    it('returns true for empty values or configs without options', () => {
      assert.equal(isDatalistValue(null, 'anything'), true);
      assert.equal(isDatalistValue({ options: [] }, 'anything'), true);
      assert.equal(isDatalistValue(kwConfig, ''), true);
      assert.equal(isDatalistValue(kwConfig, '   '), true);
    });

    it('returns true when value matches option value, label, or text case-insensitively', () => {
      assert.equal(isDatalistValue(kwConfig, 'warp records'), true);
      assert.equal(isDatalistValue(kwConfig, 'WARP'), true);
      assert.equal(isDatalistValue(kwConfig, 'twenty twenty-six'), true);
    });

    it('returns false when value does not match any option', () => {
      assert.equal(isDatalistValue(kwConfig, 'Unknown Label'), false);
    });
  });
});
