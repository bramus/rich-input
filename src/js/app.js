/**
 * <rich-search> Demo Application Controller
 */

import { RichSearch, isOpaqueRangeSupported, isHighlightSupported, getCaretCoordinates } from './rich-search/index.js';

export class RichSearchDemoApp {
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

    this.init();
  }

  init() {
    this._checkBrowserSupport();
    this._setupPlayground();
    this._setupPresets();
    this._setupFormDemo();
    this._setupDynamicFilterDemo();
    this._setupScrollspy();
  }

  _checkBrowserSupport() {
    if (!this.apiBanner) return;

    if (isOpaqueRangeSupported && isHighlightSupported) {
      this.apiBanner.className = 'api-banner supported';
      this.apiBanner.innerHTML = `
        <span class="api-banner-badge">Active</span>
        <span><strong>OpaqueRange API & CSS Custom Highlight API:</strong> Supported in this browser. Native caret coordinates and <code>::highlight()</code> syntax highlighting are fully operational.</span>
      `;
    } else {
      this.apiBanner.className = 'api-banner unsupported';
      this.apiBanner.innerHTML = `
        <span class="api-banner-badge">Notice</span>
        <span><strong>OpaqueRange API:</strong> Not detected in this browser engine. The component is gracefully falling back to standard element-relative positioning. Use Chromium 152+ (Chrome/Edge) to experience native caret anchoring and input text highlighting.</span>
      `;
    }
  }

  _setupPlayground() {
    if (!this.playground) return;

    const updateInspector = () => {
      const parsed = this.playground.getParsedQuery();
      const input = this.playground.shadowRoot.querySelector('input');
      const caretPos = input ? input.selectionStart : 0;
      const coords = input ? getCaretCoordinates(input, caretPos) : { left: 0, top: 0, bottom: 0 };

      // Render tokens
      if (this.tokensContainer) {
        this.tokensContainer.innerHTML = '';
        if (parsed.tokens.length === 0 || (parsed.tokens.length === 1 && parsed.tokens[0].type === 'whitespace')) {
          this.tokensContainer.innerHTML = '<span style="color: #94a3b8; font-style: italic;">No tokens yet. Start typing!</span>';
        } else {
          parsed.tokens.forEach((t) => {
            if (t.type === 'whitespace') return;

            const span = document.createElement('span');
            span.className = `token-pill pill-${t.type}`;

            if (t.type === 'keyword') {
              span.innerHTML = `<strong>${t.keyword}:</strong> ${t.innerValue ? `"${t.innerValue}"` : '<em>(empty)</em>'}`;
            } else {
              span.textContent = `text: "${t.raw}"`;
            }
            this.tokensContainer.appendChild(span);
          });
        }
      }

      // Render JSON
      if (this.jsonOutput) {
        this.jsonOutput.textContent = JSON.stringify({
          raw: parsed.raw,
          freeText: parsed.text,
          keywords: parsed.keywords,
          tokenCount: parsed.tokens.filter(t => t.type !== 'whitespace').length,
          activeHighlights: Array.from(CSS.highlights ? CSS.highlights.keys() : []),
        }, null, 2);
      }

      // Render caret info
      if (this.caretInfo) {
        this.caretInfo.innerHTML = `
          <span><strong>Caret index:</strong> ${caretPos}</span> · 
          <span><strong>Viewport rect:</strong> X: ${Math.round(coords.left)}, Y: ${Math.round(coords.bottom)}</span> · 
          <span><strong>OpaqueRange anchor:</strong> ${coords.isCaret ? '✓ Active' : 'Fallback'}</span>
        `;
      }
    };

    this.playground.addEventListener('input', updateInspector);
    this.playground.addEventListener('rich-search-select', updateInspector);
    this.playground.addEventListener('keyup', updateInspector);
    this.playground.addEventListener('click', updateInspector);

    updateInspector();
  }

  _setupPresets() {
    const buttons = document.querySelectorAll('[data-preset]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-preset');
        const target = btn.closest('.card')?.querySelector('rich-search') || this.demoSearch || this.playground;
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
      const searchEl = this.demoForm.querySelector('rich-search');
      const parsed = searchEl ? searchEl.getParsedQuery() : null;

      this.formResult.hidden = false;
      this.formResult.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 0.25rem;">Form Submitted successfully!</div>
        <div><strong>Submitted Value (FormData):</strong> <code>${query || '(empty)'}</code></div>
        <div style="margin-top: 0.25rem;"><strong>Parsed Keywords:</strong> <code>${JSON.stringify(parsed?.keywords || {})}</code></div>
      `;
    });
  }

  _setupDynamicFilterDemo() {
    if (!this.addFilterBtn) return;

    let added = false;
    this.addFilterBtn.addEventListener('click', () => {
      if (added) {
        alert('Dynamic filter "bpm" has already been added!');
        return;
      }

      const targets = document.querySelectorAll('rich-search');
      if (targets.length === 0) return;

      const createBpmDatalist = () => {
        const dl = document.createElement('datalist');
        dl.id = 'bpm';
        dl.setAttribute('label', 'Beats Per Minute (BPM)');
        dl.dataset.type = 'number';

        const bpms = ['120', '124', '126', '128', '130', '132', '140'];
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

      alert('Added <datalist id="bpm"> to all <rich-search> instances! You can now type "b" to autocomplete "bpm:" with values 120, 124, 126, 128, etc.');
    });
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
    document.addEventListener('DOMContentLoaded', () => new RichSearchDemoApp());
  } else {
    new RichSearchDemoApp();
  }
}
