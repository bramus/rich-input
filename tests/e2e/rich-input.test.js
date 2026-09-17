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
    assert.equal(state.parsed.text, 'ambient');
    assert.deepEqual(state.parsed.keywords, {
      artist: ['Aphex Twin'],
      label: ['Warp Records'],
    });
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
    assert.deepEqual(finalState.parsed.keywords, {
      label: ['We Play House Recordings'],
    });
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
    assert.deepEqual(state.parsed.keywords, {
      artist: ['Larry Heard'],
      style: ['Deep House'],
    });
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
    assert.deepEqual(result.parsedQuery.keywords['-style'], ['Acid']);
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
});





