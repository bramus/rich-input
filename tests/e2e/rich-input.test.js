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

    assert.equal(result.value, '-style:Acid ');
    assert.equal(result.operatorRangesCount, 1);
    assert.equal(result.hasHighlight, true);
    const opKwTokens = result.parsedQuery.tokens.filter((t) => t.type === 'keyword');
    assert.equal(opKwTokens.length, 1);
    assert.equal(opKwTokens[0].operator, '-');
    assert.equal(opKwTokens[0].keyword, 'style');
    assert.equal(opKwTokens[0].innerValue, 'Acid');
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
      const existingEl = document.querySelector('#form-search'); // form-search has no combinators attribute

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
});





