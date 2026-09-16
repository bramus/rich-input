import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSearchTokens,
  parseSearchQuery,
  getCaretContext,
  getSuggestions,
  applySuggestion,
  isDatalistValue,
} from '../../src/js/rich-input/utils/query-parser.js';

describe('query-parser unit tests', () => {
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
      assert.equal(tokens[0].keyword, 'year');
      assert.equal(tokens[0].keywordLower, 'year');
      assert.equal(tokens[0].rawValue, '2026');
      assert.equal(tokens[0].innerValue, '2026');
      assert.equal(tokens[0].quoted, false);
      assert.equal(tokens[0].isClosed, true);
      assert.equal(tokens[0].start, 0);
      assert.equal(tokens[0].end, 9);
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
  });

  describe('parseSearchQuery()', () => {
    it('aggregates free text and grouped keyword values', () => {
      const input = 'ambient artist:"Aphex Twin" LABEL:Warp artist:"Four Tet" deep';
      const result = parseSearchQuery(input);

      assert.equal(result.raw, input);
      assert.equal(result.text, 'ambient deep');
      assert.deepEqual(result.keywords, {
        artist: ['Aphex Twin', 'Four Tet'],
        label: ['Warp'],
      });
      assert.ok(Array.isArray(result.tokens));
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

    it('returns keyword mode when caret is before or at colon of a keyword token', () => {
      const ctx = getCaretContext('label:Warp', 3);
      assert.equal(ctx.mode, 'keyword');
      assert.equal(ctx.query, 'label');
      assert.equal(ctx.replaceStart, 0);
      assert.equal(ctx.replaceEnd, 6);
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
    ]);

    it('returns matching keyword suggestions in keyword mode', () => {
      const ctx = getCaretContext('la', 2);
      const suggestions = getSuggestions(ctx, configuredKeywords);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].type, 'keyword');
      assert.equal(suggestions[0].id, 'label');
      assert.equal(suggestions[0].insertText, 'label:');
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

    it('applies a value suggestion and appends a trailing space', () => {
      const input = 'label:We';
      const ctx = getCaretContext(input, 8);
      const suggestion = { type: 'value', insertText: '"We Play House Recordings"' };
      const { newValue, newCaret } = applySuggestion(input, suggestion, ctx);

      assert.equal(newValue, 'label:"We Play House Recordings" ');
      assert.equal(newCaret, 33);
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
