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
});
