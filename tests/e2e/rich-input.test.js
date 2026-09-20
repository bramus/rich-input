import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../src');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost');
        let pathname = decodeURIComponent(reqUrl.pathname);
        if (pathname === '/') pathname = '/index.html';

        const filePath = path.join(rootDir, pathname);
        // Prevent directory traversal outside rootDir
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('<rich-input> End-to-End Browser Tests (Puppeteer + WebDriver BiDi)', () => {
  let serverInfo;
  let browser;
  let page;

  before(async () => {
    serverInfo = await startStaticServer(SRC_DIR);
    browser = await puppeteer.launch({
      protocol: 'webDriverBiDi',
      headless: true,
    });
    page = await browser.newPage();
    await page.goto(serverInfo.url, { waitUntil: 'networkidle0' });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverInfo?.server) {
      await new Promise((resolve) => serverInfo.server.close(resolve));
    }
  });

  it('renders the custom element and parses the initial query value', async () => {
    const state = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      return {
        isDefined: Boolean(customElements.get('rich-input')),
        value: el.value,
        parsed: el.getParsedQuery(),
      };
    });

    assert.equal(state.isDefined, true);
    assert.equal(state.value, 'ambient artist:"Aphex Twin" label:"Warp Records"');
    assert.deepEqual(Object.keys(state.parsed), ['raw', 'tokens']);
    assert.equal(state.parsed.raw, 'ambient artist:"Aphex Twin" label:"Warp Records"');
    const kwTokens = state.parsed.tokens.filter((t) => t.type === 'keyword');
    assert.equal(kwTokens.length, 2);
    assert.equal(kwTokens[0].keyword, 'artist');
    assert.equal(kwTokens[0].innerValue, 'Aphex Twin');
    assert.equal(kwTokens[1].keyword, 'label');
    assert.equal(kwTokens[1].innerValue, 'Warp Records');
  });

  it('clears the input when clicking the shadow DOM clear button', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const clearBtn = el.shadowRoot.querySelector('.clear-button');
      clearBtn.click();
    });

    const valueAfterClear = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const clearBtn = el.shadowRoot.querySelector('.clear-button');
      return {
        value: el.value,
        isClearHidden: clearBtn.hasAttribute('hidden'),
      };
    });

    assert.equal(valueAfterClear.value, '');
    assert.equal(valueAfterClear.isClearHidden, true);
  });

  it('opens keyword suggestions on typing and completes keyword selection via Enter', async () => {
    // Focus the internal input and type 'la'
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.value = '';
      el.focus();
    });

    await page.keyboard.type('la');

    // Check that popover is open and showing 'label:' suggestion
    const popoverState = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const popover = el.shadowRoot.querySelector('.popover');
      const items = Array.from(el.shadowRoot.querySelectorAll('.suggestion-item')).map((item) =>
        item.textContent.trim()
      );
      return {
        isOpen: popover.matches(':popover-open'),
        items,
      };
    });

    assert.equal(popoverState.isOpen, true);
    assert.ok(
      popoverState.items.some((text) => text.includes('label:')),
      `Expected suggestions to include "label:", got: ${JSON.stringify(popoverState.items)}`
    );

    // Press Enter to accept the pre-selected keyword suggestion ('label:')
    await page.keyboard.press('Enter');

    const valueAfterKeyword = await page.evaluate(() => {
      return document.querySelector('#demo-search').value;
    });

    assert.equal(valueAfterKeyword, 'label:');
  });

  it('filters value suggestions and quotes multi-word values automatically', async () => {
    // Now that input is 'label:', type 'We' (prefix of 'We Play House Recordings')
    await page.keyboard.type('We');

    const valueSuggestions = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const popover = el.shadowRoot.querySelector('.popover');
      const items = Array.from(el.shadowRoot.querySelectorAll('.suggestion-title')).map((t) =>
        t.textContent.trim()
      );
      return {
        isOpen: popover.matches(':popover-open'),
        items,
      };
    });

    assert.equal(valueSuggestions.isOpen, true);
    assert.deepEqual(valueSuggestions.items, ['We Play House Recordings']);

    // Accept the value suggestion via Enter
    await page.keyboard.press('Enter');

    const finalState = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      return {
        value: el.value,
        parsed: el.getParsedQuery(),
      };
    });

    assert.equal(finalState.value, 'label:"We Play House Recordings" ');
    const finalKeywords = finalState.parsed.tokens.filter((t) => t.type === 'keyword');
    assert.equal(finalKeywords.length, 1);
    assert.equal(finalKeywords[0].keyword, 'label');
    assert.equal(finalKeywords[0].innerValue, 'We Play House Recordings');
  });

  it('updates value when clicking a preset button', async () => {
    await page.evaluate(() => {
      const presetBtn = document.querySelector('.preset-buttons button[data-preset*="Larry Heard"]');
      presetBtn.click();
    });

    const state = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      return {
        value: el.value,
        parsed: el.getParsedQuery(),
      };
    });

    assert.equal(state.value, 'artist:"Larry Heard" style:"Deep House"');
    const presetKeywords = state.parsed.tokens.filter((t) => t.type === 'keyword');
    assert.equal(presetKeywords.length, 2);
    assert.equal(presetKeywords[0].keyword, 'artist');
    assert.equal(presetKeywords[0].innerValue, 'Larry Heard');
    assert.equal(presetKeywords[1].keyword, 'style');
    assert.equal(presetKeywords[1].innerValue, 'Deep House');
  });

  it('integrates with standard HTML <form> and FormData via ElementInternals', async () => {
    const formValue = await page.evaluate(() => {
      const form = document.querySelector('#example-form form');
      if (!form) return null;
      const ri = form.querySelector('rich-input');
      ri.value = 'label:Defected year:2026';
      const data = new FormData(form);
      return data.get(ri.getAttribute('name'));
    });

    assert.equal(formValue, 'label:Defected year:2026');
  });

  it('supports ArrowDown/ArrowUp keyboard navigation and Escape to close suggestions', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.value = 'year:';
      el.focus();
    });

    // Trigger suggestions via ArrowDown
    await page.keyboard.press('ArrowDown');

    const firstSelected = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const activeItem = el.shadowRoot.querySelector('.suggestion-item.active');
      return activeItem ? activeItem.textContent.trim() : null;
    });

    assert.ok(firstSelected && firstSelected.includes('2026'));

    // Move to second item via ArrowDown
    await page.keyboard.press('ArrowDown');

    const secondSelected = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const activeItem = el.shadowRoot.querySelector('.suggestion-item.active');
      return activeItem ? activeItem.textContent.trim() : null;
    });

    assert.ok(secondSelected && secondSelected.includes('2025'));

    // Close popover with Escape
    await page.keyboard.press('Escape');

    const isPopoverOpen = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      return el.shadowRoot.querySelector('.popover').matches(':popover-open');
    });

    assert.equal(isPopoverOpen, false);
  });

  it('detects invalid keyword values and creates invalid highlight ranges when blurred', async () => {
    const invalidCount = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.value = 'year:1800 unknown:foo';
      el.blur();
      el.updateHighlights();
      return el.getActiveInvalidRanges().length;
    });

    assert.equal(invalidCount, 2);
  });

  it('supports operator autocompletion and creates rich-input-operator highlight ranges', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.value = '';
      el.focus();
    });

    await page.keyboard.type('-sty');

    const popoverState = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const popover = el.shadowRoot.querySelector('.popover');
      const items = Array.from(el.shadowRoot.querySelectorAll('.suggestion-item')).map((item) =>
        item.textContent.trim()
      );
      return {
        isOpen: popover.matches(':popover-open'),
        items,
      };
    });

    assert.equal(popoverState.isOpen, true);
    assert.ok(popoverState.items.some((text) => text.includes('style:')));

    // Accept keyword suggestion (`style:`) -> should become `-style:`
    await page.keyboard.press('Enter');

    const valueAfterKeyword = await page.evaluate(() => {
      return document.querySelector('#demo-search').value;
    });
    assert.equal(valueAfterKeyword, '-style:');

    // Type value prefix `Ac` and accept `Acid`
    await page.keyboard.type('Ac');

    await page.keyboard.press('Enter');

    const result = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const operatorRanges = el.getActiveOperatorRanges();
      const highlight = CSS.highlights.get('rich-input-operator');
      return {
        value: el.value,
        operatorRangesCount: operatorRanges.length,
        hasHighlight: Boolean(highlight && highlight.size > 0),
        parsedQuery: el.getParsedQuery(),
      };
    });

    assert.equal(result.value, '-style:"Acid House" ');
    assert.equal(result.operatorRangesCount, 1);
    assert.equal(result.hasHighlight, true);
    const opKwTokens = result.parsedQuery.tokens.filter((t) => t.type === 'keyword');
    assert.equal(opKwTokens.length, 1);
    assert.equal(opKwTokens[0].operator, '-');
    assert.equal(opKwTokens[0].keyword, 'style');
    assert.equal(opKwTokens[0].innerValue, 'Acid House');
  });

  it('applies global operators to newly created instances while keeping existing instances and local overrides independent', async () => {
    const testResult = await page.evaluate(() => {
      const RichInputClass = customElements.get('rich-input');
      const existingEl = document.querySelector('#demo-search');

      // 1. Verify initial defaults on class and existing instance
      const initialClassOperators = [...RichInputClass.operators];
      const initialExistingInstanceOperators = [...existingEl.operators];

      // 2. Change global operators on RichInput class
      RichInputClass.operators = ['-', '+'];
      const globalAfterChange = [...RichInputClass.operators];

      // Existing instance should NOT be mutated by global change
      const existingAfterGlobalChange = [...existingEl.operators];

      // 3. Create a new instance without custom operators -> should inherit new global operators ['-', '+']
      const newInheritedEl = document.createElement('rich-input');
      newInheritedEl.innerHTML = '<datalist id="style"><option value="Acid"></option></datalist>';
      document.body.appendChild(newInheritedEl);
      const newInheritedOperators = [...newInheritedEl.operators];

      newInheritedEl.value = '+style:Acid';
      newInheritedEl.updateHighlights();
      const newInheritedRangesCount = newInheritedEl.getActiveOperatorRanges().length;

      // Existing instance with value '+style:Acid' should NOT highlight '+' because its operators are still ['-']
      existingEl.value = '+style:Acid';
      existingEl.updateHighlights();
      const existingRangesForPlus = existingEl.getActiveOperatorRanges().length;

      // 4. Create a new instance WITH custom operators via attribute
      const newCustomAttrEl = document.createElement('rich-input');
      newCustomAttrEl.setAttribute('operators', '! ~');
      newCustomAttrEl.innerHTML = '<datalist id="style"><option value="Acid"></option></datalist>';
      document.body.appendChild(newCustomAttrEl);
      const newCustomAttrOperators = [...newCustomAttrEl.operators];

      newCustomAttrEl.value = '~style:Acid';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForTilde = newCustomAttrEl.getActiveOperatorRanges().length;

      newCustomAttrEl.value = '+style:Acid';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForPlus = newCustomAttrEl.getActiveOperatorRanges().length;

      // 5. Modify local operators via JS property on newInheritedEl
      newInheritedEl.operators = ['?'];
      const afterLocalPropSet = [...newInheritedEl.operators];
      const reflectedAttr = newInheritedEl.getAttribute('operators');

      // Verify global and other instances were not affected
      const globalUnchanged = [...RichInputClass.operators];
      const customAttrUnchanged = [...newCustomAttrEl.operators];

      // Cleanup dynamically created test elements and reset global default
      newInheritedEl.remove();
      newCustomAttrEl.remove();
      RichInputClass.operators = ['-'];

      return {
        initialClassOperators,
        initialExistingInstanceOperators,
        globalAfterChange,
        existingAfterGlobalChange,
        newInheritedOperators,
        newInheritedRangesCount,
        existingRangesForPlus,
        newCustomAttrOperators,
        customAttrRangesForTilde,
        customAttrRangesForPlus,
        afterLocalPropSet,
        reflectedAttr,
        globalUnchanged,
        customAttrUnchanged,
      };
    });

    assert.deepEqual(testResult.initialClassOperators, ['-']);
    assert.deepEqual(testResult.initialExistingInstanceOperators, ['-']);
    assert.deepEqual(testResult.globalAfterChange, ['-', '+']);
    // Existing instance keeps its operators when global changes
    assert.deepEqual(testResult.existingAfterGlobalChange, ['-']);
    assert.equal(testResult.existingRangesForPlus, 0);

    // Newly created instance inherits the new global operators
    assert.deepEqual(testResult.newInheritedOperators, ['-', '+']);
    assert.equal(testResult.newInheritedRangesCount, 1);

    // Newly created instance with custom attribute uses only its custom operators
    assert.deepEqual(testResult.newCustomAttrOperators, ['!', '~']);
    assert.equal(testResult.customAttrRangesForTilde, 1);
    assert.equal(testResult.customAttrRangesForPlus, 0);

    // Local property change updates only that instance and reflects to attribute
    assert.deepEqual(testResult.afterLocalPropSet, ['?']);
    assert.equal(testResult.reflectedAttr, '?');
    assert.deepEqual(testResult.globalUnchanged, ['-', '+']);
    assert.deepEqual(testResult.customAttrUnchanged, ['!', '~']);
  });

  it('syncs operators between JS property and DOM attribute including default rewrite, DevTools normalization, empty string, and attribute removal', async () => {
    const testResult = await page.evaluate(() => {
      const el = document.createElement('rich-input');
      el.innerHTML = '<datalist id="style"><option value="Acid"></option></datalist>';
      document.body.appendChild(el);

      // 0. Upon connection without an operators attribute, <rich-input> is rewritten with default operators="-"
      const initialHasAttr = el.hasAttribute('operators');
      const initialAttr = el.getAttribute('operators');
      const initialProp = [...el.operators];

      // 1. Setting via JS writes back to DOM attribute
      el.operators = ['-', '~'];
      const jsSetAttr = el.getAttribute('operators');
      const jsSetProp = [...el.operators];

      // 2. Setting empty array or empty string via JS writes operators="" and sets empty array (no operators)
      el.operators = [];
      const emptyJsAttr = el.getAttribute('operators');
      const hasEmptyJsAttr = el.hasAttribute('operators');
      const emptyJsProp = [...el.operators];

      el.value = '-style:Acid';
      el.updateHighlights();
      const rangesWhenDisabled = el.getActiveOperatorRanges().length;

      // 3. Changing attribute in DOM updates instance operators
      el.setAttribute('operators', '! +');
      const domSetProp = [...el.operators];
      el.value = '!style:Acid';
      el.updateHighlights();
      const rangesAfterDomSet = el.getActiveOperatorRanges().length;

      // 4. Changing attribute in DOM with duplicate tokens or repeated characters (e.g. DevTools edit "- - +" or "~~ +") normalizes and rewrites attribute
      el.setAttribute('operators', '- - +');
      const normalizedDashAttr = el.getAttribute('operators');
      const normalizedDashProp = [...el.operators];

      el.setAttribute('operators', '~~ +');
      const normalizedTildeAttr = el.getAttribute('operators');
      const normalizedTildeProp = [...el.operators];

      // 5. Setting attribute to empty string in DOM sets operators to empty array (no operators)
      el.setAttribute('operators', '');
      const domEmptyAttr = el.getAttribute('operators');
      const domEmptyProp = [...el.operators];
      const rangesAfterDomEmpty = el.getActiveOperatorRanges().length;

      // 6. Removing attribute in DOM resets to default operators AND rewrites <rich-input operators="-">
      el.removeAttribute('operators');
      const afterRemoveHasAttr = el.hasAttribute('operators');
      const afterRemoveAttr = el.getAttribute('operators');
      const afterRemoveProp = [...el.operators];
      el.value = '-style:Acid';
      el.updateHighlights();
      const rangesAfterRemove = el.getActiveOperatorRanges().length;

      el.remove();

      return {
        initialHasAttr,
        initialAttr,
        initialProp,
        jsSetAttr,
        jsSetProp,
        emptyJsAttr,
        hasEmptyJsAttr,
        emptyJsProp,
        rangesWhenDisabled,
        domSetProp,
        rangesAfterDomSet,
        normalizedDashAttr,
        normalizedDashProp,
        normalizedTildeAttr,
        normalizedTildeProp,
        domEmptyAttr,
        domEmptyProp,
        rangesAfterDomEmpty,
        afterRemoveHasAttr,
        afterRemoveAttr,
        afterRemoveProp,
        rangesAfterRemove,
      };
    });

    // 0. Initial connection rewrites <rich-input> as <rich-input operators="-">
    assert.equal(testResult.initialHasAttr, true);
    assert.equal(testResult.initialAttr, '-');
    assert.deepEqual(testResult.initialProp, ['-']);

    // 1. JS setter reflects to attribute
    assert.equal(testResult.jsSetAttr, '- ~');
    assert.deepEqual(testResult.jsSetProp, ['-', '~']);

    // 2. JS setter with empty array reflects operators="" and disables operators
    assert.equal(testResult.hasEmptyJsAttr, true);
    assert.equal(testResult.emptyJsAttr, '');
    assert.deepEqual(testResult.emptyJsProp, []);
    assert.equal(testResult.rangesWhenDisabled, 0);

    // 3. DOM setAttribute updates operators
    assert.deepEqual(testResult.domSetProp, ['!', '+']);
    assert.equal(testResult.rangesAfterDomSet, 1);

    // 4. DevTools edit normalization ("- - +" -> "- +", "~~ +" -> "~ +")
    assert.equal(testResult.normalizedDashAttr, '- +');
    assert.deepEqual(testResult.normalizedDashProp, ['-', '+']);
    assert.equal(testResult.normalizedTildeAttr, '~ +');
    assert.deepEqual(testResult.normalizedTildeProp, ['~', '+']);

    // 5. DOM setAttribute('operators', '') sets empty array (no operators)
    assert.equal(testResult.domEmptyAttr, '');
    assert.deepEqual(testResult.domEmptyProp, []);
    assert.equal(testResult.rangesAfterDomEmpty, 0);

    // 6. DOM removeAttribute('operators') reverts to default operators and rewrites operators="-"
    assert.equal(testResult.afterRemoveHasAttr, true);
    assert.equal(testResult.afterRemoveAttr, '-');
    assert.deepEqual(testResult.afterRemoveProp, ['-']);
    assert.equal(testResult.rangesAfterRemove, 1);
  });

  it('does not mark unconfigured operator prefixes (-year:2024, ~year:2024, !year:2024) as invalid keywords', async () => {
    const invalidCount = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.setAttribute('operators', '+');
      el.value = 'ambient artist:"Aphex Twin" label:"Warp Records" -year:2024 ~year:2024 !year:2024';
      el.blur();
      el.updateHighlights();
      const countWithPlus = el.getActiveInvalidRanges().length;

      el.setAttribute('operators', '');
      el.updateHighlights();
      const countWithEmpty = el.getActiveInvalidRanges().length;

      // Reset attribute
      el.removeAttribute('operators');
      return { countWithPlus, countWithEmpty };
    });

    assert.equal(invalidCount.countWithPlus, 0);
    assert.equal(invalidCount.countWithEmpty, 0);
  });

  it('supports combinator autocompletion and creates rich-input-combinator highlight ranges', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.setAttribute('combinators', 'AND OR NOT');
      el.value = 'artist:"Aphex Twin" ';
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });

    await page.keyboard.type('O');

    const popoverState = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const popover = el.shadowRoot.querySelector('.popover');
      const items = Array.from(el.shadowRoot.querySelectorAll('.suggestion-item')).map((item) =>
        item.textContent.trim()
      );
      return {
        isOpen: popover.matches(':popover-open'),
        items,
      };
    });

    assert.equal(popoverState.isOpen, true);
    assert.ok(popoverState.items.some((text) => text.includes('OR')));

    // Accept combinator suggestion (`OR`) -> should become `artist:"Aphex Twin" OR `
    await page.keyboard.press('Enter');

    const result = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const combinatorRanges = el.getActiveCombinatorRanges();
      const highlight = CSS.highlights.get('rich-input-combinator');
      return {
        value: el.value,
        combinatorRangesCount: combinatorRanges.length,
        hasHighlight: Boolean(highlight && highlight.size > 0),
        parsedQuery: el.getParsedQuery(),
      };
    });

    assert.equal(result.value, 'artist:"Aphex Twin" OR ');
    assert.equal(result.combinatorRangesCount, 1);
    assert.equal(result.hasHighlight, true);
    const combTokens = result.parsedQuery.tokens.filter((t) => t.type === 'combinator');
    assert.deepEqual(combTokens.map((t) => t.combinator), ['OR']);
  });

  it('applies global combinators to newly created instances while keeping existing instances and local overrides independent', async () => {
    const testResult = await page.evaluate(() => {
      const RichInputClass = customElements.get('rich-input');
      const existingEl = document.createElement('rich-input');
      document.body.appendChild(existingEl);

      // 1. Verify initial defaults on class (empty array) and existing instance
      const initialClassCombinators = [...RichInputClass.combinators];
      const initialExistingInstanceCombinators = [...existingEl.combinators];
      const initialHasAttr = existingEl.hasAttribute('combinators');

      // 2. Change global combinators on RichInput class
      RichInputClass.combinators = ['AND', 'OR'];
      const globalAfterChange = [...RichInputClass.combinators];

      // Existing instance should NOT be mutated by global change
      const existingAfterGlobalChange = [...existingEl.combinators];

      // 3. Create a new instance without custom combinators -> should inherit new global combinators ['AND', 'OR'] and write attribute
      const newInheritedEl = document.createElement('rich-input');
      document.body.appendChild(newInheritedEl);
      const newInheritedCombinators = [...newInheritedEl.combinators];
      const newInheritedAttr = newInheritedEl.getAttribute('combinators');

      newInheritedEl.value = 'artist:Aphex OR label:Warp';
      newInheritedEl.updateHighlights();
      const newInheritedRangesCount = newInheritedEl.getActiveCombinatorRanges().length;

      // Existing instance with value 'artist:Aphex OR label:Warp' should NOT highlight 'OR' because its combinators are []
      existingEl.value = 'artist:Aphex OR label:Warp';
      existingEl.updateHighlights();
      const existingRangesForOr = existingEl.getActiveCombinatorRanges().length;

      // 4. Create a new instance WITH custom combinators via attribute
      const newCustomAttrEl = document.createElement('rich-input');
      newCustomAttrEl.setAttribute('combinators', 'XOR NOR');
      document.body.appendChild(newCustomAttrEl);
      const newCustomAttrCombinators = [...newCustomAttrEl.combinators];

      newCustomAttrEl.value = 'artist:Aphex XOR label:Warp';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForXor = newCustomAttrEl.getActiveCombinatorRanges().length;

      newCustomAttrEl.value = 'artist:Aphex OR label:Warp';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForOr = newCustomAttrEl.getActiveCombinatorRanges().length;

      // 5. Modify local combinators via JS property on newInheritedEl
      newInheritedEl.combinators = ['NOT'];
      const afterLocalPropSet = [...newInheritedEl.combinators];
      const reflectedAttr = newInheritedEl.getAttribute('combinators');

      // Verify global and other instances were not affected
      const globalUnchanged = [...RichInputClass.combinators];
      const customAttrUnchanged = [...newCustomAttrEl.combinators];

      // Cleanup dynamically created test elements and reset global default
      existingEl.remove();
      newInheritedEl.remove();
      newCustomAttrEl.remove();
      RichInputClass.combinators = [];

      return {
        initialClassCombinators,
        initialExistingInstanceCombinators,
        initialHasAttr,
        globalAfterChange,
        existingAfterGlobalChange,
        newInheritedCombinators,
        newInheritedAttr,
        newInheritedRangesCount,
        existingRangesForOr,
        newCustomAttrCombinators,
        customAttrRangesForXor,
        customAttrRangesForOr,
        afterLocalPropSet,
        reflectedAttr,
        globalUnchanged,
        customAttrUnchanged,
      };
    });

    assert.deepEqual(testResult.initialClassCombinators, []);
    assert.deepEqual(testResult.initialExistingInstanceCombinators, []);
    assert.equal(testResult.initialHasAttr, false);
    assert.deepEqual(testResult.globalAfterChange, ['AND', 'OR']);
    assert.deepEqual(testResult.existingAfterGlobalChange, []);
    assert.equal(testResult.existingRangesForOr, 0);

    // Newly created instance inherits the new global combinators and reflects attribute
    assert.deepEqual(testResult.newInheritedCombinators, ['AND', 'OR']);
    assert.equal(testResult.newInheritedAttr, 'AND OR');
    assert.equal(testResult.newInheritedRangesCount, 1);

    // Newly created instance with custom attribute uses only its custom combinators
    assert.deepEqual(testResult.newCustomAttrCombinators, ['XOR', 'NOR']);
    assert.equal(testResult.customAttrRangesForXor, 1);
    assert.equal(testResult.customAttrRangesForOr, 0);

    // Local property change updates only that instance and reflects to attribute
    assert.deepEqual(testResult.afterLocalPropSet, ['NOT']);
    assert.equal(testResult.reflectedAttr, 'NOT');
    assert.deepEqual(testResult.globalUnchanged, ['AND', 'OR']);
    assert.deepEqual(testResult.customAttrUnchanged, ['XOR', 'NOR']);
  });

  it('syncs combinators between JS property and DOM attribute including normalization and removal', async () => {
    const testResult = await page.evaluate(() => {
      const el = document.createElement('rich-input');
      document.body.appendChild(el);

      // 0. Default combinators is empty array [], so no combinators attribute is added on connection
      const initialHasAttr = el.hasAttribute('combinators');
      const initialProp = [...el.combinators];

      // 1. Setting via JS writes back to DOM attribute
      el.combinators = ['AND', 'OR'];
      const jsSetAttr = el.getAttribute('combinators');
      const jsSetProp = [...el.combinators];

      // 2. Setting unnormalized attribute in DOM normalizes and rewrites attribute
      el.setAttribute('combinators', 'AND   OR  AND   NOT');
      const normalizedAttr = el.getAttribute('combinators');
      const normalizedProp = [...el.combinators];

      // 3. Removing attribute resets to default combinators ([])
      el.removeAttribute('combinators');
      const afterRemoveHasAttr = el.hasAttribute('combinators');
      const afterRemoveProp = [...el.combinators];

      el.remove();

      return {
        initialHasAttr,
        initialProp,
        jsSetAttr,
        jsSetProp,
        normalizedAttr,
        normalizedProp,
        afterRemoveHasAttr,
        afterRemoveProp,
      };
    });

    assert.equal(testResult.initialHasAttr, false);
    assert.deepEqual(testResult.initialProp, []);

    assert.equal(testResult.jsSetAttr, 'AND OR');
    assert.deepEqual(testResult.jsSetProp, ['AND', 'OR']);

    assert.equal(testResult.normalizedAttr, 'AND OR NOT');
    assert.deepEqual(testResult.normalizedProp, ['AND', 'OR', 'NOT']);

    assert.equal(testResult.afterRemoveHasAttr, false);
    assert.deepEqual(testResult.afterRemoveProp, []);
  });

  it('supports delimiters configuration and highlights delimiters via ::highlight(rich-input-delimiter)', async () => {
    const state = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.combinators = ['AND', 'OR', 'NOT'];
      el.value = '(label:"We Play House Recordings" year:2026 ) OR (year:2024 style:"Deep House")';
      el.updateHighlights();

      const delimHighlight = CSS.highlights?.get('rich-input-delimiter');
      const delimRanges = el.getActiveDelimiterRanges();
      const invalidRanges = el.getActiveInvalidRanges();
      const parsed = el.getParsedQuery();

      return {
        hasHighlightEntry: Boolean(delimHighlight),
        allRangesInHighlight: delimHighlight ? delimRanges.every((r) => delimHighlight.has(r)) : false,
        delimRangesCount: delimRanges.length,
        invalidRangesCount: invalidRanges.length,
        parsedKeys: Object.keys(parsed),
        delimiters: parsed.tokens.filter((t) => t.type === 'delimiter').map((t) => t.delimiter),
        combinators: parsed.tokens.filter((t) => t.type === 'combinator').map((t) => t.combinator),
        keywords: parsed.tokens.filter((t) => t.type === 'keyword').map((t) => ({ key: t.keyword, value: t.innerValue })),
      };
    });

    assert.equal(state.hasHighlightEntry, true);
    assert.equal(state.delimRangesCount, 4);
    assert.equal(state.allRangesInHighlight, true);
    assert.equal(state.invalidRangesCount, 0, 'Keywords adjacent to delimiters should not be marked invalid');
    assert.deepEqual(state.parsedKeys, ['raw', 'tokens']);
    assert.deepEqual(state.delimiters, ['(', ')', '(', ')']);
    assert.deepEqual(state.combinators, ['OR']);
    assert.deepEqual(state.keywords, [
      { key: 'label', value: 'We Play House Recordings' },
      { key: 'year', value: '2026' },
      { key: 'year', value: '2024' },
      { key: 'style', value: 'Deep House' },
    ]);
  });

  it('isolates global vs local delimiters correctly across existing and newly created instances', async () => {
    const testResult = await page.evaluate(() => {
      const RichInputClass = customElements.get('rich-input');
      const existingEl = document.querySelector('#example-form rich-input');

      // 1. Check initial defaults (DEFAULT_DELIMITERS is ['()'])
      const initialClassDelimiters = [...RichInputClass.delimiters];
      const initialExistingInstanceDelimiters = [...existingEl.delimiters];
      const initialAttr = existingEl.getAttribute('delimiters');

      // 2. Change global delimiters on the RichInput class
      RichInputClass.delimiters = '{} []';

      // Existing instance should NOT be mutated when global default changes
      const globalAfterChange = [...RichInputClass.delimiters];
      const existingAfterGlobalChange = [...existingEl.delimiters];

      // 3. Create a new instance WITHOUT custom delimiters attribute -> should inherit new global default
      const newInheritedEl = document.createElement('rich-input');
      document.body.appendChild(newInheritedEl);
      const newInheritedDelimiters = [...newInheritedEl.delimiters];
      const newInheritedAttr = newInheritedEl.getAttribute('delimiters');

      newInheritedEl.value = '{artist:"Aphex Twin"} [year:2024]';
      newInheritedEl.updateHighlights();
      const newInheritedRangesCount = newInheritedEl.getActiveDelimiterRanges().length;

      // Existing instance with value '{artist:"Aphex Twin"}' should NOT highlight '{' or '}' because its delimiters are ['()']
      existingEl.value = '{artist:"Aphex Twin"}';
      existingEl.updateHighlights();
      const existingRangesForBraces = existingEl.getActiveDelimiterRanges().length;

      // 4. Create a new instance WITH custom delimiters via attribute
      const newCustomAttrEl = document.createElement('rich-input');
      newCustomAttrEl.setAttribute('delimiters', '<>');
      document.body.appendChild(newCustomAttrEl);
      const newCustomAttrDelimiters = [...newCustomAttrEl.delimiters];

      newCustomAttrEl.value = '<artist:"Aphex Twin">';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForAngles = newCustomAttrEl.getActiveDelimiterRanges().length;

      newCustomAttrEl.value = '(artist:"Aphex Twin")';
      newCustomAttrEl.updateHighlights();
      const customAttrRangesForParens = newCustomAttrEl.getActiveDelimiterRanges().length;

      // 5. Modify local delimiters via JS property on newInheritedEl
      newInheritedEl.delimiters = ['()'];
      const afterLocalPropSet = [...newInheritedEl.delimiters];
      const reflectedAttr = newInheritedEl.getAttribute('delimiters');

      // Verify global and other instances were not affected
      const globalUnchanged = [...RichInputClass.delimiters];
      const customAttrUnchanged = [...newCustomAttrEl.delimiters];

      // Cleanup dynamically created test elements and reset global default
      newInheritedEl.remove();
      newCustomAttrEl.remove();
      RichInputClass.delimiters = ['()'];

      return {
        initialClassDelimiters,
        initialExistingInstanceDelimiters,
        initialAttr,
        globalAfterChange,
        existingAfterGlobalChange,
        newInheritedDelimiters,
        newInheritedAttr,
        newInheritedRangesCount,
        existingRangesForBraces,
        newCustomAttrDelimiters,
        customAttrRangesForAngles,
        customAttrRangesForParens,
        afterLocalPropSet,
        reflectedAttr,
        globalUnchanged,
        customAttrUnchanged,
      };
    });

    assert.deepEqual(testResult.initialClassDelimiters, ['()']);
    assert.deepEqual(testResult.initialExistingInstanceDelimiters, ['()']);
    assert.equal(testResult.initialAttr, '()');
    assert.deepEqual(testResult.globalAfterChange, ['{}', '[]']);
    assert.deepEqual(testResult.existingAfterGlobalChange, ['()']);
    assert.equal(testResult.existingRangesForBraces, 0);

    // Newly created instance inherits the new global delimiters and reflects attribute
    assert.deepEqual(testResult.newInheritedDelimiters, ['{}', '[]']);
    assert.equal(testResult.newInheritedAttr, '{} []');
    assert.equal(testResult.newInheritedRangesCount, 4);

    // Newly created instance with custom attribute uses only its custom delimiters
    assert.deepEqual(testResult.newCustomAttrDelimiters, ['<>']);
    assert.equal(testResult.customAttrRangesForAngles, 2);
    assert.equal(testResult.customAttrRangesForParens, 0);

    // Local property change updates only that instance and reflects to attribute
    assert.deepEqual(testResult.afterLocalPropSet, ['()']);
    assert.equal(testResult.reflectedAttr, '()');
    assert.deepEqual(testResult.globalUnchanged, ['{}', '[]']);
    assert.deepEqual(testResult.customAttrUnchanged, ['<>']);
  });

  it('syncs delimiters between JS property and DOM attribute including default writeback, normalization, empty string, and removal', async () => {
    const testResult = await page.evaluate(() => {
      const el = document.createElement('rich-input');
      document.body.appendChild(el);

      // 0. Default delimiters is ['()'], so delimiters="()" attribute is written on connection
      const initialAttr = el.getAttribute('delimiters');
      const initialProp = [...el.delimiters];

      // 1. Setting via JS writes back to DOM attribute
      el.delimiters = ['{}', '()', '[]'];
      const jsSetAttr = el.getAttribute('delimiters');
      const jsSetProp = [...el.delimiters];

      // 2. Setting unnormalized attribute in DOM normalizes and rewrites attribute
      el.setAttribute('delimiters', '{}   ()  {}   []');
      const normalizedAttr = el.getAttribute('delimiters');
      const normalizedProp = [...el.delimiters];

      // 3. Setting empty string disables delimiters
      el.setAttribute('delimiters', '');
      const emptyAttr = el.getAttribute('delimiters');
      const emptyProp = [...el.delimiters];

      // 4. Removing attribute resets to default delimiters (['()']) and writes back delimiters="()"
      el.removeAttribute('delimiters');
      const afterRemoveAttr = el.getAttribute('delimiters');
      const afterRemoveProp = [...el.delimiters];

      el.remove();

      return {
        initialAttr,
        initialProp,
        jsSetAttr,
        jsSetProp,
        normalizedAttr,
        normalizedProp,
        emptyAttr,
        emptyProp,
        afterRemoveAttr,
        afterRemoveProp,
      };
    });

    assert.equal(testResult.initialAttr, '()');
    assert.deepEqual(testResult.initialProp, ['()']);

    assert.equal(testResult.jsSetAttr, '{} () []');
    assert.deepEqual(testResult.jsSetProp, ['{}', '()', '[]']);

    assert.equal(testResult.normalizedAttr, '{} () []');
    assert.deepEqual(testResult.normalizedProp, ['{}', '()', '[]']);

    assert.equal(testResult.emptyAttr, '');
    assert.deepEqual(testResult.emptyProp, []);

    assert.equal(testResult.afterRemoveAttr, '()');
    assert.deepEqual(testResult.afterRemoveProp, ['()']);
  });

  it('toggles operators, combinators, and delimiters and switches between HTML and JS code in the syntax demo (#example-syntax)', async () => {
    const result = await page.evaluate(() => {
      const syntaxInput = document.getElementById('syntax-demo-input');
      const liveMarkupEl = document.getElementById('syntax-live-markup');
      const partsBreakdownEl = document.getElementById('syntax-parts-breakdown');
      const opChips = document.querySelectorAll('#syntax-operators-chips .syntax-chip');
      const combChips = document.querySelectorAll('#syntax-combinators-chips .syntax-chip');
      const delimChips = document.querySelectorAll('#syntax-delimiters-chips .syntax-chip');
      const jsTabBtn = document.querySelector('.syntax-code-tab[data-lang="js"]');

      const initialOperators = [...syntaxInput.operators];
      const initialCombinators = [...syntaxInput.combinators];
      const initialDelimiters = [...syntaxInput.delimiters];
      const initialMarkup = liveMarkupEl.textContent;
      const initialPartCardsCount = partsBreakdownEl.querySelectorAll('.syntax-part-card').length;

      // Toggle the '!' operator chip, 'NOT' combinator chip, and '[]' delimiter chip
      const bangChip = Array.from(opChips).find((btn) => btn.textContent.includes('!'));
      bangChip.click();
      const notChip = Array.from(combChips).find((btn) => btn.textContent.includes('NOT'));
      notChip.click();
      const bracketChip = Array.from(delimChips).find((btn) => btn.textContent.includes('[]'));
      bracketChip.click();

      const updatedOperators = [...syntaxInput.operators];
      const updatedCombinators = [...syntaxInput.combinators];
      const updatedDelimiters = [...syntaxInput.delimiters];
      const updatedHtmlMarkup = liveMarkupEl.textContent;

      // Switch to JS code tab
      jsTabBtn.click();
      const jsCodeOutput = liveMarkupEl.textContent;

      return {
        initialOperators,
        initialCombinators,
        initialDelimiters,
        initialMarkup,
        initialPartCardsCount,
        updatedOperators,
        updatedCombinators,
        updatedDelimiters,
        updatedHtmlMarkup,
        jsCodeOutput,
      };
    });

    assert.deepEqual(result.initialOperators, ['-']);
    assert.deepEqual(result.initialCombinators, ['AND', 'OR']);
    assert.deepEqual(result.initialDelimiters, ['()']);
    assert.equal(result.initialPartCardsCount, 4);
    assert.ok(result.initialMarkup.includes('operators="-"'));
    assert.ok(result.initialMarkup.includes('combinators="AND OR"'));
    assert.ok(result.initialMarkup.includes('delimiters="()"'));

    assert.deepEqual(result.updatedOperators, ['-', '!']);
    assert.deepEqual(result.updatedCombinators, ['AND', 'OR', 'NOT']);
    assert.deepEqual(result.updatedDelimiters, ['()', '[]']);
    assert.ok(result.updatedHtmlMarkup.includes('operators="- !"'));
    assert.ok(result.updatedHtmlMarkup.includes('combinators="AND OR NOT"'));
    assert.ok(result.updatedHtmlMarkup.includes('delimiters="() []"'));
    assert.ok(result.jsCodeOutput.includes('input.operators = ["-","!"];'));
    assert.ok(result.jsCodeOutput.includes('input.combinators = ["AND","OR","NOT"];'));
    assert.ok(result.jsCodeOutput.includes('input.delimiters = ["()","[]"];'));
  });

  it('dispatches rich-input-select, search, and change events with expected details', async () => {
    await page.evaluate(() => {
      window.__testEvents = {
        selects: [],
        searches: [],
        changes: 0,
      };
      const el = document.querySelector('#demo-search');
      el.addEventListener('rich-input-select', (e) => window.__testEvents.selects.push(e.detail));
      el.addEventListener('search', (e) => window.__testEvents.searches.push(e.detail));
      el.addEventListener('change', () => window.__testEvents.changes++);
      el.value = '';
      el.focus();
    });

    // Type `-yr` -> no match, clear and type `-ye` -> matches `year:`
    await page.keyboard.type('-ye');
    await page.keyboard.press('Enter'); // Accepts `-year:` (rich-input-select for keyword)

    // Type `2026` and accept via Enter (rich-input-select for value)
    await page.keyboard.type('2026');
    await page.keyboard.press('Enter');

    // Close suggestions with Escape, then press Enter to trigger `search` event
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');

    // Click clear button to trigger `change` event
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.shadowRoot.querySelector('.clear-button').click();
    });

    const events = await page.evaluate(() => window.__testEvents);

    assert.equal(events.selects.length, 2);
    assert.equal(events.selects[0].type, 'keyword');
    assert.equal(events.selects[0].operator, '-');
    assert.equal(events.selects[0].keyword, 'year');
    assert.equal(events.selects[0].query, '-year:');

    assert.equal(events.selects[1].type, 'value');
    assert.equal(events.selects[1].operator, '-');
    assert.equal(events.selects[1].keyword, 'year');
    assert.equal(events.selects[1].value, '2026');
    assert.equal(events.selects[1].query, '-year:2026 ');

    assert.equal(events.searches.length, 1);
    assert.equal(events.searches[0].value, '-year:2026 ');
    assert.equal(events.searches[0].parsed.tokens.filter((t) => t.type === 'keyword')[0].innerValue, '2026');

    assert.ok(events.changes >= 1);
  });

  it('supports form reset (formResetCallback), fieldset disabling (formDisabledCallback), and disconnectedCallback cleanup', async () => {
    const result = await page.evaluate(() => {
      const form = document.createElement('form');
      const fieldset = document.createElement('fieldset');
      const ri = document.createElement('rich-input');
      ri.setAttribute('name', 'custom_q');
      ri.setAttribute('value', 'year:2025');
      ri.innerHTML = `<datalist id="year"><option value="2025"></option><option value="2026"></option></datalist>`;

      fieldset.appendChild(ri);
      form.appendChild(fieldset);
      document.body.appendChild(form);

      const initialValue = ri.value;
      ri.value = 'year:2026';
      const dirtyValue = ri.value;

      // 1. Test formResetCallback
      form.reset();
      const afterResetValue = ri.value;

      // 2. Test formDisabledCallback via fieldset.disabled
      fieldset.disabled = true;
      const disabledWhenFieldsetDisabled = ri.disabled;
      fieldset.disabled = false;
      const disabledWhenFieldsetEnabled = ri.disabled;

      // 3. Test disconnectedCallback cleanup from highlightManager
      ri.value = 'year:2025';
      ri.updateHighlights();
      const activeRangesBeforeRemove = ri.getActiveHighlightRanges().get('year')?.valueRanges?.length || 0;
      form.remove();
      const activeRangesAfterRemove = ri.getActiveHighlightRanges().size;

      return {
        initialValue,
        dirtyValue,
        afterResetValue,
        disabledWhenFieldsetDisabled,
        disabledWhenFieldsetEnabled,
        activeRangesBeforeRemove,
        activeRangesAfterRemove,
      };
    });

    assert.equal(result.initialValue, 'year:2025');
    assert.equal(result.dirtyValue, 'year:2026');
    assert.equal(result.afterResetValue, 'year:2025');
    assert.equal(result.disabledWhenFieldsetDisabled, true);
    assert.equal(result.disabledWhenFieldsetEnabled, false);
    assert.equal(result.activeRangesBeforeRemove, 1);
    assert.equal(result.activeRangesAfterRemove, 0);
  });

  it('dynamically updates keywords, suggestions, and highlights when datalists are added, and renders rich option images with part="suggestion-image"', async () => {
    const result = await page.evaluate(async () => {
      const el = document.querySelector('#demo-search');
      const hadBpmBefore = el.getKeywords().some((k) => k.idLower === 'bpm');

      // Click the demo's "+ Dynamically Add bpm Datalist Filter" button
      const addBpmBtn = document.getElementById('btn-add-filter');
      addBpmBtn.click();

      // Wait a microtask/tick for slotchange & MutationObserver
      await new Promise((r) => setTimeout(r, 50));

      const hasBpmAfter = el.getKeywords().some((k) => k.idLower === 'bpm');
      el.value = 'bpm:125';
      el.updateHighlights();
      const bpmHighlightCount = CSS.highlights.get('bpm')?.size || 0;

      // Check rich option image rendering for label:
      el.value = 'label:';
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.updateSuggestions('input');

      const suggestionImages = Array.from(
        el.shadowRoot.querySelectorAll('.suggestion-item img[part~="suggestion-image"]')
      );

      return {
        hadBpmBefore,
        hasBpmAfter,
        bpmHighlightCount,
        suggestionImagesCount: suggestionImages.length,
        firstImgAlt: suggestionImages[0]?.getAttribute('alt') || '',
      };
    });

    assert.equal(result.hadBpmBefore, false);
    assert.equal(result.hasBpmAfter, true);
    assert.ok(result.bpmHighlightCount >= 1);
    assert.ok(result.suggestionImagesCount > 0);
    assert.ok(result.firstImgAlt.includes('Logo'));
  });

  it('supports Tab key and mouse click suggestion acceptance, outside click popover dismissal, and aria-selected / suggestion-item-selected echoing', async () => {
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.value = '';
      el.focus();
    });

    // 1. Accept keyword suggestion via Tab key
    await page.keyboard.type('ye');
    await page.keyboard.press('Tab');

    const afterTabKeyword = await page.evaluate(() => document.querySelector('#demo-search').value);
    assert.equal(afterTabKeyword, 'year:');

    // 2. Accept value suggestion via mouse click on suggestion item
    await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      const items = Array.from(el.shadowRoot.querySelectorAll('.suggestion-item'));
      const item2024 = items.find((li) => li.textContent.includes('2024'));
      item2024.click();
    });

    const afterMouseClickValue = await page.evaluate(() => document.querySelector('#demo-search').value);
    assert.equal(afterMouseClickValue, 'year:2024 ');

    // 3. Place caret back inside `year:2024` and verify `2024` is marked with `aria-selected="true"` and `suggestion-item-selected`
    const selectedEchoState = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.setSelectionRange(7, 7); // inside `2024`
      el.updateSuggestions('caret');
      const selectedItem = el.shadowRoot.querySelector('.suggestion-item.selected');
      return {
        hasSelectedItem: Boolean(selectedItem),
        ariaSelected: selectedItem?.getAttribute('aria-selected'),
        partAttr: selectedItem?.getAttribute('part') || '',
        text: selectedItem?.textContent.trim() || '',
      };
    });

    assert.equal(selectedEchoState.hasSelectedItem, true);
    assert.equal(selectedEchoState.ariaSelected, 'true');
    assert.ok(selectedEchoState.partAttr.includes('suggestion-item-selected'));
    assert.ok(selectedEchoState.text.includes('2024'));

    // 4. Click outside <rich-input> to dismiss open popover
    const isClosedAfterOutsideClick = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      document.body.click();
      return !el.shadowRoot.querySelector('.popover').matches(':popover-open');
    });

    assert.equal(isClosedAfterOutsideClick, true);
  });

  it('suppresses invalid highlight ranges while editing a token and supports highlight-quotes="exclude"', async () => {
    const result = await page.evaluate(() => {
      const el = document.querySelector('#demo-search');
      el.focus();
      el.value = 'year:1800';
      el.setSelectionRange(9, 9); // caret at end of `year:1800` while focused
      el.updateHighlights();
      const invalidWhileEditing = el.getActiveInvalidRanges().length;

      // Move caret to another token or blur -> should now mark `year:1800` as invalid
      el.value = 'year:1800 ';
      el.setSelectionRange(10, 10);
      el.updateHighlights();
      const invalidAfterMovingCaret = el.getActiveInvalidRanges().length;

      // Test highlight-quotes="exclude" vs default
      el.value = 'artist:"Aphex Twin"';
      el.removeAttribute('highlight-quotes');
      el.updateHighlights();
      const rangeIncludeQuotes = el.getActiveHighlightRanges().get('artist').valueRanges[0];
      const lenIncludeQuotes = rangeIncludeQuotes.endOffset - rangeIncludeQuotes.startOffset;

      el.setAttribute('highlight-quotes', 'exclude');
      el.updateHighlights();
      const rangeExcludeQuotes = el.getActiveHighlightRanges().get('artist').valueRanges[0];
      const lenExcludeQuotes = rangeExcludeQuotes.endOffset - rangeExcludeQuotes.startOffset;
      el.removeAttribute('highlight-quotes');

      return {
        invalidWhileEditing,
        invalidAfterMovingCaret,
        lenIncludeQuotes,
        lenExcludeQuotes,
      };
    });

    assert.equal(result.invalidWhileEditing, 0);
    assert.equal(result.invalidAfterMovingCaret, 1);
    assert.equal(result.lenIncludeQuotes, '"Aphex Twin"'.length);
    assert.equal(result.lenExcludeQuotes, 'Aphex Twin'.length);
  });

  it('has no named slots, keeps unnamed slot for <style> and <datalist>, and supports ::part(icon) customization via CSS content and background', async () => {
    const result = await page.evaluate(async () => {
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        rich-input#test-emoji-icon::part(icon) {
          content: "🎵";
        }
        rich-input#test-bg-icon::part(icon) {
          background: url("data:image/svg+xml,%3Csvg id='custom-svg' xmlns='http://www.w3.org/2000/svg'/%3E") no-repeat center / contain;
        }
      `;
      document.head.appendChild(styleEl);

      const elEmoji = document.createElement('rich-input');
      elEmoji.id = 'test-emoji-icon';
      elEmoji.setAttribute('aria-label', 'Custom Catalog Search');
      elEmoji.setAttribute('readonly', '');
      elEmoji.innerHTML = `
        <style>::highlight(customkw) { background-color: rgb(12, 34, 56); }</style>
        <datalist id="customkw"><option value="foo"></option></datalist>
      `;
      document.body.appendChild(elEmoji);

      const elBg = document.createElement('rich-input');
      elBg.id = 'test-bg-icon';
      document.body.appendChild(elBg);

      await new Promise((r) => setTimeout(r, 30));

      const namedSlotCount = elEmoji.shadowRoot.querySelectorAll('slot[name]').length;
      const defaultSlot = elEmoji.shadowRoot.querySelector('slot:not([name])');
      const defaultSlotAssignedCount = defaultSlot ? defaultSlot.assignedElements().length : 0;
      const emojiIcon = elEmoji.shadowRoot.querySelector('[part="icon"]');
      const emojiIconCs = getComputedStyle(emojiIcon);
      const emojiIconBefore = getComputedStyle(emojiIcon, '::before');

      const bgIcon = elBg.shadowRoot.querySelector('[part="icon"]');
      const bgIconCs = getComputedStyle(bgIcon);

      const injectedStyle = elEmoji.shadowRoot.getElementById('ri-injected-styles');

      elEmoji.placeholder = 'Updated placeholder';
      elEmoji.disabled = true;
      const isDisabled = elEmoji.disabled && elEmoji.hasAttribute('disabled');
      elEmoji.disabled = false;
      elEmoji.removeAttribute('readonly');

      elEmoji.value = 'customkw:foo';
      elEmoji.focus();
      elEmoji.select();
      const selectedLength = elEmoji.selectionEnd - elEmoji.selectionStart;
      const ariaLabel = elEmoji.inputElement.getAttribute('aria-label');

      const out = {
        namedSlotCount,
        defaultSlotAssignedCount,
        emojiBgImage: emojiIconCs.backgroundImage,
        emojiBeforeContent: emojiIconBefore.content,
        customBgHasSvg: bgIconCs.backgroundImage.includes('custom-svg'),
        hasInjectedStyle: Boolean(injectedStyle && injectedStyle.textContent.includes('::highlight(customkw)')),
        placeholder: elEmoji.placeholder,
        isDisabled,
        selectedLength,
        ariaLabel,
      };

      elEmoji.remove();
      elBg.remove();
      styleEl.remove();
      return out;
    });

    assert.equal(result.namedSlotCount, 0);
    assert.equal(result.defaultSlotAssignedCount, 2);
    assert.equal(result.emojiBgImage, 'none');
    assert.equal(result.emojiBeforeContent, '"🎵"');
    assert.equal(result.customBgHasSvg, true);
    assert.equal(result.hasInjectedStyle, true);
    assert.equal(result.placeholder, 'Updated placeholder');
    assert.equal(result.isDisabled, true);
    assert.equal(result.selectedLength, 'customkw:foo'.length);
    assert.equal(result.ariaLabel, 'Custom Catalog Search');
  });

  it('positions popover with mirror-div measurement and viewport clamping, and supports contenteditable adapter fallback', async () => {
    const result = await page.evaluate(async () => {
      const { getCaretLeftWithMirrorDiv, positionPopover } = await import(
        './js/rich-input/utils/positioning.js'
      );
      const { setupContentEditableAdapter, getSingleTextNode } = await import(
        './js/rich-input/utils/contenteditable-adapter.js'
      );

      const input = document.querySelector('#demo-search').inputElement;
      input.value = 'artist:"Aphex Twin"';
      const leftAtStart = getCaretLeftWithMirrorDiv(input, 0);
      const leftAtEnd = getCaretLeftWithMirrorDiv(input, input.value.length);

      // Test positionPopover viewport right-edge clamp & bottom-edge flip
      const dummyPopover = document.createElement('div');
      Object.defineProperty(dummyPopover, 'offsetWidth', { value: 300 });
      Object.defineProperty(dummyPopover, 'offsetHeight', { value: 200 });
      document.body.appendChild(dummyPopover);

      positionPopover(dummyPopover, {
        left: window.innerWidth + 500,
        top: window.innerHeight - 10,
        bottom: window.innerHeight - 2,
        height: 20,
      });
      const clampedLeft = parseInt(dummyPopover.style.left, 10);
      const flippedTop = parseInt(dummyPopover.style.top, 10);
      dummyPopover.remove();

      // Test contenteditable adapter
      const ceDiv = document.createElement('div');
      document.body.appendChild(ceDiv);
      setupContentEditableAdapter(ceDiv);
      ceDiv.value = 'label:Warp';
      ceDiv.setSelectionRange(2, 6);
      const selStart = ceDiv.selectionStart;
      const selEnd = ceDiv.selectionEnd;
      const domRange = ceDiv.createValueRange(6, 10);
      const rangeText = domRange.toString();
      const singleNode = getSingleTextNode(ceDiv);
      ceDiv.remove();

      return {
        mirrorProgressesRight: leftAtEnd > leftAtStart,
        clampedLeftValid: clampedLeft <= window.innerWidth - 300 - 12,
        flippedTopValid: flippedTop < window.innerHeight - 200,
        selStart,
        selEnd,
        rangeText,
        isTextNode: singleNode.nodeType === Node.TEXT_NODE,
      };
    });

    assert.equal(result.mirrorProgressesRight, true);
    assert.equal(result.clampedLeftValid, true);
    assert.equal(result.flippedTopValid, true);
    assert.equal(result.selStart, 2);
    assert.equal(result.selEnd, 6);
    assert.equal(result.rangeText, 'Warp');
    assert.equal(result.isTextNode, true);
  });
});
