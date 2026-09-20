/**
 * <rich-input> Demo Application Controller
 */

import { RichInput, isOpaqueRangeSupported, isHighlightSupported, isContentEditableFallbackActive, getCaretCoordinates } from './rich-input/index.js';

export class RichInputDemoApp {
  constructor() {
    this.demoSearch = document.getElementById('demo-search');
    this.playground = document.getElementById('playground-search');
    this.tokensContainer = document.getElementById('playground-tokens');
    this.jsonOutput = document.getElementById('playground-json');
    this.caretInfo = document.getElementById('playground-caret');
    this.apiBanner = document.getElementById('api-banner');
    this.demoForm = document.getElementById('demo-form');
    this.formResult = document.getElementById('form-result');
    this.addFilterBtn = document.getElementById('btn-add-filter');
    this.syntaxInput = document.getElementById('syntax-demo-input');

    this.init();
  }

  init() {
    this._checkBrowserSupport();
    this._setupPlayground();
    this._setupPresets();
    this._setupFormDemo();
    this._setupDynamicFilterDemo();
    this._setupSyntaxDemo();
    this._setupScrollspy();
  }

  _checkBrowserSupport() {
    if (!this.apiBanner) return;

    if (isOpaqueRangeSupported && isHighlightSupported) {
      this.apiBanner.className = 'api-banner supported';
      this.apiBanner.innerHTML = `
        <span class="api-banner-badge">Active</span>
        <span><strong>OpaqueRange API & CSS Custom Highlight API:</strong> Supported in this browser. Native caret coordinates and <code>::highlight()</code> syntax highlighting on <code>&lt;input&gt;</code> are fully operational.</span>
      `;
    } else if (isHighlightSupported) {
      this.apiBanner.className = 'api-banner fallback';
      this.apiBanner.innerHTML = `
        <span class="api-banner-badge">Fallback</span>
        <span><strong>OpaqueRange API not available:</strong> The component falls back to an adapted <code>[contenteditable]</code> element for in-input <code>::highlight()</code> syntax highlighting, and a mirror-div text measurement fallback to position the popover.</span>
      `;
    } else {
      this.apiBanner.className = 'api-banner unsupported';
      this.apiBanner.innerHTML = `
        <span class="api-banner-badge">Notice</span>
        <span><strong>OpaqueRange API & CSS Custom Highlight API not available:</strong> The component falls back to a hidden mirror-div text measurement trick to position the popover. No highlighting is done.</span>
      `;
    }
  }

  _setupPlayground() {
    if (!this.playground) return;

    const updateInspector = () => {
      const parsed = this.playground.getParsedQuery();
      const input = this.playground.inputElement || this.playground.shadowRoot.querySelector('.search-input');
      const caretPos = input ? input.selectionStart : 0;
      const coords = input ? getCaretCoordinates(input, caretPos) : { left: 0, top: 0, bottom: 0 };

      // Render tokens
      if (this.tokensContainer) {
        this.tokensContainer.replaceChildren();
        if (parsed.tokens.length === 0 || (parsed.tokens.length === 1 && parsed.tokens[0].type === 'whitespace')) {
          const emptySpan = document.createElement('span');
          emptySpan.style.color = '#94a3b8';
          emptySpan.style.fontStyle = 'italic';
          emptySpan.textContent = 'No tokens yet. Start typing!';
          this.tokensContainer.appendChild(emptySpan);
        } else {
          parsed.tokens.forEach((t) => {
            if (t.type === 'whitespace') return;

            const span = document.createElement('span');
            span.className = `token-pill pill-${t.type}`;

            if (t.type === 'keyword') {
              const strong = document.createElement('strong');
              strong.textContent = `${t.operator || ''}${t.keyword}:`;
              span.appendChild(strong);
              if (t.innerValue) {
                span.appendChild(document.createTextNode(` "${t.innerValue}"`));
              } else {
                span.appendChild(document.createTextNode(' '));
                const em = document.createElement('em');
                em.textContent = '(empty)';
                span.appendChild(em);
              }
            } else if (t.type === 'combinator') {
              const strong = document.createElement('strong');
              strong.textContent = t.combinator;
              span.appendChild(strong);
            } else if (t.type === 'delimiter') {
              const strong = document.createElement('strong');
              strong.textContent = t.delimiter;
              span.appendChild(strong);
            } else {
              span.textContent = `text: "${t.raw}"`;
            }
            this.tokensContainer.appendChild(span);
          });
        }
      }

      // Render JSON
      if (this.jsonOutput) {
        this.jsonOutput.textContent = JSON.stringify(parsed, null, 2);
      }

      // Render caret info
      if (this.caretInfo) {
        const activeHighlights = Array.from(CSS.highlights ? CSS.highlights.keys() : []);
        this.caretInfo.innerHTML = `
          <span><strong>Caret index:</strong> ${caretPos}</span> · 
          <span><strong>Viewport rect:</strong> X: ${Math.round(coords.left)}, Y: ${Math.round(coords.bottom)}</span> · 
          <span><strong>Active highlights:</strong> ${activeHighlights.length ? activeHighlights.join(', ') : 'none'}</span> · 
          <span><strong>Highlight engine:</strong> ${isOpaqueRangeSupported ? 'OpaqueRange (native)' : (isHighlightSupported ? 'contenteditable + Custom Highlights' : 'Mirror div')}</span>
        `;
      }
    };

    this.playground.addEventListener('input', updateInspector);
    this.playground.addEventListener('rich-input-select', updateInspector);
    this.playground.addEventListener('keyup', updateInspector);
    this.playground.addEventListener('click', updateInspector);

    updateInspector();
  }

  _setupPresets() {
    const buttons = document.querySelectorAll('[data-preset]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-preset');
        const target = btn.closest('.card')?.querySelector('rich-input') || this.demoSearch || this.playground;
        if (target) {
          target.value = query;
          target.focus();
          target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
      });
    });
  }

  _setupFormDemo() {
    if (!this.demoForm || !this.formResult) return;

    this.demoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(this.demoForm);
      const query = formData.get('q');
      const searchEl = this.demoForm.querySelector('rich-input');
      const parsed = searchEl ? searchEl.getParsedQuery() : null;

      this.formResult.hidden = false;
      this.formResult.style.minWidth = '0';
      this.formResult.replaceChildren();

      const header = document.createElement('div');
      header.style.fontWeight = '600';
      header.style.marginBottom = '0.5rem';
      header.textContent = 'Form Submitted successfully!';

      const submittedLine = document.createElement('div');
      const submittedStrong = document.createElement('strong');
      submittedStrong.textContent = 'Submitted Value (FormData):';
      const submittedPre = document.createElement('pre');
      submittedPre.style.overflowX = 'auto';
      submittedPre.style.margin = '0.25rem 0 0';
      submittedPre.textContent = query || '(empty)';
      submittedLine.append(submittedStrong, submittedPre);

      const tokensLine = document.createElement('div');
      tokensLine.style.marginTop = '0.75rem';
      const tokensStrong = document.createElement('strong');
      tokensStrong.textContent = 'Parsed Tokens:';
      const tokensPre = document.createElement('pre');
      tokensPre.style.overflowX = 'auto';
      tokensPre.style.margin = '0.25rem 0 0';
      tokensPre.textContent = JSON.stringify(parsed?.tokens || [], null, 2);
      tokensLine.append(tokensStrong, tokensPre);

      this.formResult.append(header, submittedLine, tokensLine);
    });
  }

  _setupDynamicFilterDemo() {
    if (!this.addFilterBtn) return;

    let added = false;
    this.addFilterBtn.addEventListener('click', () => {
      if (added) {
        return;
      }

      const targets = document.querySelectorAll('rich-input');
      if (targets.length === 0) return;

      const createBpmDatalist = () => {
        const dl = document.createElement('datalist');
        dl.id = 'bpm';
        dl.setAttribute('label', 'Beats Per Minute (BPM)');
        dl.dataset.type = 'number';

        const bpms = Array.from({ length: 30 }, (_, i) => 110 + i); // Range from 110 to 140
        for (const val of bpms) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = `${val} BPM`;
          dl.appendChild(opt);
        }
        return dl;
      };

      targets.forEach((target) => {
        if (!target.querySelector('#bpm, datalist[id="bpm"]')) {
          target.appendChild(createBpmDatalist());
        }
      });

      added = true;
      this.addFilterBtn.disabled = true;
      this.addFilterBtn.textContent = '✓ Filter "bpm" Added';
    });
  }

  _setupSyntaxDemo() {
    if (!this.syntaxInput) return;

    const opChipsEl = document.getElementById('syntax-operators-chips');
    const combChipsEl = document.getElementById('syntax-combinators-chips');
    const delimChipsEl = document.getElementById('syntax-delimiters-chips');

    const liveCodeEl = document.getElementById('syntax-live-code') || document.getElementById('syntax-live-markup');
    const codeTabBtns = document.querySelectorAll('.syntax-code-tab');
    const partsBreakdownEl = document.getElementById('syntax-parts-breakdown');

    const availableOperators = ['-', '~', '+', '!', '^'];
    const availableCombinators = ['AND', 'OR', 'NOT', 'XOR', '&&', '||'];
    const availableDelimiters = ['()', '[]', '{}', '<>'];

    const activeOperators = new Set(this.syntaxInput.operators || ['-', '~', '+']);
    const activeCombinators = new Set(this.syntaxInput.combinators || ['AND', 'OR', 'NOT']);
    const activeDelimiters = new Set(this.syntaxInput.delimiters || ['()', '[]', '{}']);

    let currentCodeLang = 'html';

    const syncToComponent = () => {
      this.syntaxInput.operators = Array.from(activeOperators);
      this.syntaxInput.combinators = Array.from(activeCombinators);
      this.syntaxInput.delimiters = Array.from(activeDelimiters);
      renderAll();
    };

    const renderChips = (container, pool, activeSet) => {
      if (!container) return;
      container.replaceChildren();
      pool.forEach((item) => {
        const isActive = activeSet.has(item);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `syntax-chip${isActive ? ' is-active' : ''}`;
        btn.setAttribute('aria-pressed', String(isActive));

        const status = document.createElement('span');
        status.className = 'syntax-chip-status';
        status.textContent = isActive ? '✓' : '+';

        const label = document.createElement('span');
        label.textContent = item;

        btn.append(status, label);
        btn.addEventListener('click', () => {
          if (activeSet.has(item)) {
            activeSet.delete(item);
          } else {
            activeSet.add(item);
          }
          syncToComponent();
        });
        container.appendChild(btn);
      });
    };

    const createPartCard = (title, count, pillNodes) => {
      const card = document.createElement('div');
      card.className = 'syntax-part-card';

      const header = document.createElement('div');
      header.className = 'syntax-part-title';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = title;
      const countBadge = document.createElement('span');
      countBadge.className = 'syntax-part-count';
      countBadge.textContent = String(count);
      header.append(titleSpan, countBadge);

      const itemsBox = document.createElement('div');
      itemsBox.className = 'syntax-part-items';
      if (pillNodes.length === 0) {
        const empty = document.createElement('span');
        empty.style.fontSize = '0.78rem';
        empty.style.color = 'var(--text-muted)';
        empty.style.fontStyle = 'italic';
        empty.textContent = 'None in query';
        itemsBox.appendChild(empty);
      } else {
        pillNodes.forEach((n) => itemsBox.appendChild(n));
      }

      card.append(header, itemsBox);
      return card;
    };

    const renderAll = () => {
      renderChips(opChipsEl, availableOperators, activeOperators);
      renderChips(combChipsEl, availableCombinators, activeCombinators);
      renderChips(delimChipsEl, availableDelimiters, activeDelimiters);

      const opsList = Array.from(activeOperators);
      const combsList = Array.from(activeCombinators);
      const delimsList = Array.from(activeDelimiters);
      const currentVal = this.syntaxInput.value;

      // 1. Switchable Live Code (HTML or JS)
      if (liveCodeEl) {
        if (currentCodeLang === 'js') {
          liveCodeEl.textContent = [
            `const input = document.querySelector('rich-input');`,
            ``,
            `// Configure instance properties dynamically:`,
            `input.operators = ${JSON.stringify(opsList)};`,
            `input.combinators = ${JSON.stringify(combsList)};`,
            `input.delimiters = ${JSON.stringify(delimsList)};`,
            ``,
            `// Or set defaults globally for all <rich-input> instances:`,
            `RichInput.operators = ${JSON.stringify(opsList)};`,
            `RichInput.combinators = ${JSON.stringify(combsList)};`,
            `RichInput.delimiters = ${JSON.stringify(delimsList)};`,
          ].join('\n');
        } else {
          const escapedVal = currentVal.replace(/'/g, '&#39;');
          liveCodeEl.textContent = [
            `<rich-input`,
            `  operators="${opsList.join(' ')}"`,
            `  combinators="${combsList.join(' ')}"`,
            `  delimiters="${delimsList.join(' ')}"`,
            `  value='${escapedVal}'`,
            `>`,
            `  <datalist id="artist" label="Artist">...</datalist>`,
            `  <datalist id="label" label="Record Label">...</datalist>`,
            `  <datalist id="style" label="Style">...</datalist>`,
            `  <datalist id="year" label="Year" data-type="number">...</datalist>`,
            `</rich-input>`,
          ].join('\n');
        }
      }

      const parsed = this.syntaxInput.getParsedQuery();

      // 2. Parsed Query Parts Breakdown
      if (partsBreakdownEl) {
        partsBreakdownEl.replaceChildren();

        const operatorPills = [];
        const combinatorPills = [];
        const delimiterPills = [];
        const filterAndTextPills = [];

        parsed.tokens.forEach((t) => {
          if (t.type === 'whitespace') return;

          if (t.type === 'keyword') {
            if (t.operator) {
              const opPill = document.createElement('span');
              opPill.className = 'token-pill pill-keyword';
              const strong = document.createElement('strong');
              strong.textContent = t.operator;
              opPill.append(strong, document.createTextNode(` on ${t.keyword}:${t.innerValue || ''}`));
              operatorPills.push(opPill);
            }
            const kwPill = document.createElement('span');
            kwPill.className = 'token-pill pill-keyword';
            const kwStrong = document.createElement('strong');
            kwStrong.textContent = `${t.operator || ''}${t.keyword}:`;
            kwPill.append(kwStrong, document.createTextNode(` "${t.innerValue || ''}"`));
            filterAndTextPills.push(kwPill);
          } else if (t.type === 'combinator') {
            const cPill = document.createElement('span');
            cPill.className = 'token-pill pill-keyword';
            const strong = document.createElement('strong');
            strong.textContent = t.combinator;
            cPill.appendChild(strong);
            combinatorPills.push(cPill);
          } else if (t.type === 'delimiter') {
            const dPill = document.createElement('span');
            dPill.className = 'token-pill pill-keyword';
            const strong = document.createElement('strong');
            strong.textContent = t.delimiter;
            dPill.append(strong, document.createTextNode(` (${t.role}, pair ${t.pair})`));
            delimiterPills.push(dPill);
          } else if (t.type === 'text') {
            const txtPill = document.createElement('span');
            txtPill.className = 'token-pill pill-text';
            txtPill.textContent = `text: "${t.raw}"`;
            filterAndTextPills.push(txtPill);
          }
        });

        partsBreakdownEl.append(
          createPartCard('Operators Matched', operatorPills.length, operatorPills),
          createPartCard('Combinators Matched', combinatorPills.length, combinatorPills),
          createPartCard('Delimiters Matched', delimiterPills.length, delimiterPills),
          createPartCard('Keywords & Free Text', filterAndTextPills.length, filterAndTextPills)
        );
      }
    };

    codeTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        currentCodeLang = btn.getAttribute('data-lang') || 'html';
        codeTabBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        renderAll();
      });
    });

    // When clicking preset buttons inside #example-syntax, auto-enable syntax items used in the preset
    const syntaxCard = this.syntaxInput.closest('.card');
    if (syntaxCard) {
      syntaxCard.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-preset') || '';
          if (q.includes('XOR')) activeCombinators.add('XOR');
          if (q.includes('&&')) activeCombinators.add('&&');
          if (q.includes('!style')) activeOperators.add('!');
          if (q.includes('{')) activeDelimiters.add('{}');
          syncToComponent();
        });
      });
    }

    this.syntaxInput.addEventListener('input', renderAll);
    this.syntaxInput.addEventListener('rich-input-select', renderAll);
    this.syntaxInput.addEventListener('keyup', renderAll);
    this.syntaxInput.addEventListener('click', renderAll);

    renderAll();
  }

  _setupScrollspy() {
    const navLinks = document.querySelectorAll('.sidenav-list a');
    const sections = Array.from(navLinks).map((link) => {
      const id = link.getAttribute('href').replace('#', '');
      return document.getElementById(id);
    }).filter(Boolean);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach((link) => {
              if (link.getAttribute('href') === `#${id}`) {
                link.classList.add('is-active');
              } else {
                link.classList.remove('is-active');
              }
            });
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach((sec) => observer.observe(sec));
  }
}

// Auto-instantiate on DOM load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new RichInputDemoApp());
  } else {
    new RichInputDemoApp();
  }
}
