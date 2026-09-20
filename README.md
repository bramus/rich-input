# rich-input

> A rich input field `<rich-input>` with keyword-based autocomplete and in-input highlighting powered by `<datalist>`, the **OpaqueRange API**, and the **CSS Custom Highlight API**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Custom Elements](https://img.shields.io/badge/Web_Components-Custom_Elements_v1-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)

The `<rich-input>` component is a rich input field that acts like a standard `<input type="text">` so users can type ordinary text or search terms, but enhances it with contextual autocomplete and in-input highlighting for structured queries with `keyword:value` filters, prefix `operators` (e.g. `-`), boolean `combinators` (e.g. `AND`, `OR`), and grouping `delimiters` (e.g. `()`), such as `(label:"We Play House Recordings" OR year:2026) AND -style:"Acid House"`.

---

## Features

- **Standard Input Ergonomics**: Acts and feels like a regular `<input type="text">` with standard value access, selection ranges, and events.
- **Contextual Autocomplete**:
  - **Keywords**: Typing at the start of a token or after an operator/delimiter (e.g. typing `a` or `-s`) suggests configured keywords like `artist:` and `-style:`.
  - **Combinators**: Typing a configured boolean combinator (e.g. `A` or `O` when `combinators="AND OR"` is set) suggests `AND` and `OR`.
  - **Values**: Typing within a keyword value (e.g. `label:"K` or `label:K`) suggests matching options like `"Keinemusik"` and `"Kranky"`.
- **Configurable Operators, Combinators & Delimiters**: Configure prefix operators (`operators="- ~ +"`), boolean combinators (`combinators="AND OR NOT"`), and grouping delimiter pairs (`delimiters="() [] {}"`) per instance via HTML attributes / JS properties, or globally via static properties on `RichInput`.
- **Range-Based Positioning via OpaqueRange**: Positions autocomplete dropdown popovers anchored to the start of the active `OpaqueRange` (e.g. at the opening quotation mark of a value) using `range.getBoundingClientRect()`, rather than shifting with the cursor (with a hidden mirror-div fallback in unsupported browsers).
- **Native In-Input Highlighting via CSS Custom Highlight API**: Highlights keyword values, operators, combinators, delimiters, and invalid tokens inside the `<input>` control using standard CSS rules like `::highlight(label)`, `::highlight(rich-input-operator)`, `::highlight(rich-input-combinator)`, and `::highlight(rich-input-delimiter)` without brittle mirror-div overlays.
- **Declarative Configuration via `<datalist>`**: Configure keywords and options purely in HTML by nesting standard `<datalist>` elements with `<option>` tags inside `<rich-input>`.
- **Rich Option Markup**: Embed custom HTML markup (such as logos, images, icons, and avatars) directly inside `<option>` elements for rich, visual suggestion popovers.
- **Form Associated**: Implements `static formAssociated = true` and `ElementInternals` to participate seamlessly in `<form>` submission, `FormData`, and form reset lifecycles.
- **Shadow Parts Theming (`::part`)**: Full CSS customizability using `::part(input)`, `::part(control)`, `::part(popover)`, `::part(suggestion-item)`, etc.
- **Accessible (W3C Combobox Pattern)**: ARIA 1.2 compliant combobox with keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape`), `aria-expanded`, and `aria-activedescendant`.
- **Graceful Fallback**: Automatically feature-detects browser capabilities. In browsers with no `OpaqueRange` support but with CSS Custom Highlight API support (e.g. Safari 17.2+, Firefox 141+), it falls back to an adapted `[contenteditable]` element to provide in-input syntax highlighting via standard DOM `Range`s. In environments without `OpaqueRange`, dropdown popovers are positioned using a hidden mirror-div measurement fallback.

---

## Component Anatomy & Shadow Parts

The visual below illustrates the internal Shadow DOM elements, exposed CSS Shadow Parts (`::part`), and CSS Custom Highlight pseudo-elements (`::highlight`), showing how they relate to one another:

<p align="center">
  <img src="assets/rich-input-parts.svg" alt="<rich-input> Component Anatomy, Shadow Parts, and Highlight Pseudos" width="100%">
</p>

- `<rich-input>`: The host custom element wrapping the control, datalists, and suggestions popover.
- `::part(control)`: The outer input container enclosing the icon, input, and clear button.
- `::part(icon)`: The leading icon element (defaults to a search magnifying glass, customizable via CSS `content` or `background`).
- `::highlight(<keyword>)`: Target pseudo-element for styling keyword values via the CSS Custom Highlight API (e.g. `::highlight(label)`, `::highlight(year)`).
- `::highlight(rich-input-operator)`: Target pseudo-element for styling keyword operators (e.g. `-` in `-style:"Acid House"`).
- `::highlight(rich-input-combinator)`: Target pseudo-element for styling query combinators (e.g. `OR` in `artist:"Aphex Twin" OR label:"Defected"`).
- `::highlight(rich-input-delimiter)`: Target pseudo-element for styling grouping delimiters (e.g. `(` and `)` in `(artist:"Aphex Twin" OR label:"Defected")`).
- `::highlight(rich-input-keyword)`: Target pseudo-element for styling keyword prefixes (e.g. `label:`, `year:`).
- `::highlight(rich-input-invalid)`: Target pseudo-element for marking unrecognized keywords or invalid keyword values (not in datalist) with a squiggly underline.
- `::part(clear-button)`: The clear button (visible when text is present).
- `::part(popover)`: The autocomplete dropdown popover container anchored to the start of the active range via `OpaqueRange` (or mirror-div fallback).
- `::part(suggestions-header)`: The header bar at the top of the suggestions popover.
- `::part(suggestions-list)`: The `<ul>` container holding autocomplete suggestion items.
- `::part(suggestion-item)`: Each suggestion `<li>` row.
- `::part(suggestion-item-active)`: The currently focused / hovered suggestion row.
- `::part(suggestion-item-selected)`: The suggestion row matching the value currently echoed in the input.
- `::part(suggestion-image)`: The circular logo, icon, or avatar image prepended to rich suggestions.
- `::part(suggestion-keyword)`: The keyword label text inside a keyword suggestion.
- `::part(suggestion-combinator)`: The combinator label text inside a combinator suggestion.
- `::part(suggestion-value)`: The value label text inside a value suggestion.

---

## Quick Start

### 1. Installation

Install via npm:

```bash
npm install rich-input
```

Or import directly in your HTML/JavaScript bundle:

```javascript
import 'rich-input';
```

Or via CDN:

```html
<script type="module" src="https://esm.sh/rich-input"></script>
```

### 2. Basic Usage

Nest `<datalist>` elements inside `<rich-input>` to configure keywords and autocomplete suggestions, and optionally configure `operators`, `combinators`, and `delimiters`:

```html
<rich-input
  operators="-"
  combinators="AND OR"
  delimiters="()"
  placeholder="Search music catalog..."
>
  <datalist id="label" label="Record Label">
    <option value="Defected"></option>
    <option value="House"></option>
    <option value="Keinemusik"></option>
    <option value="Kranky"></option>
    <option value="Madhouse Records"></option>
    <option value="Ninja Tune"></option>
    <option value="Warp Records"></option>
    <option value="We Play House Recordings"></option>
    <option value="XL Recordings"></option>
  </datalist>

  <datalist id="year" label="Release Year" data-type="number">
    <option value="2026"></option>
    <option value="2025"></option>
    <option value="2024"></option>
  </datalist>

  <datalist id="style" label="Style">
    <option value="Acid House"></option>
    <option value="Deep House"></option>
    <option value="Dub Techno"></option>
  </datalist>
</rich-input>
```

---

## Datalist & Syntax Configuration

Configuration is defined by attributes on `<rich-input>` and standard HTML `<datalist>` elements placed inside the `<rich-input>` element:

| Element / Attribute | Type | Description |
|---|---|---|
| `<rich-input operators="...">` | `string` | Optional space-separated list of single-character prefix operators (e.g. `operators="- ~ +"`). Defaults to `"-"` (negative filter). Set `operators=""` to disable operators. |
| `<rich-input combinators="...">` | `string` | Optional space-separated list of boolean query combinators (e.g. `combinators="AND OR NOT"`). Defaults to `""` (empty array). |
| `<rich-input delimiters="...">` | `string` | Optional space-separated list of two-character opening/closing delimiter pairs (e.g. `delimiters="() [] {}"`). Defaults to `"()"` (parentheses). Set `delimiters=""` to disable delimiters. |
| `<datalist id="...">` | `string` | **Required.** The keyword identifier used in queries (e.g. `id="artist"` produces `artist:`). Case-insensitive. |
| `<datalist label="...">` | `string` | Human-readable label displayed in suggestion headers. Defaults to capitalized `id`. |
| `<datalist data-type="...">` | `string` | Optional data type (`"string"` or `"number"`). |
| `<option value="...">` | `string` | The suggested value. If the value contains spaces, quotes are automatically added when inserted (e.g. `"We Play House Recordings"`). |
| `<option label="...">` | `string` | Optional descriptive label shown alongside the value. |
| `<option>` children | `Node` | Optional image (`<img>`) prepended to the suggested value. |

Datalists and syntax attributes can be added, updated, or removed dynamically at runtime; `<rich-input>` observes changes via `attributeChangedCallback` and `MutationObserver`.

### Configuring Operators, Combinators & Delimiters via JavaScript

In addition to HTML attributes, you can configure `operators`, `combinators`, and `delimiters` per instance or globally on the `RichInput` class (which sets the default for newly created instances that do not specify a local override):

```javascript
import { RichInput } from '@bramus/rich-input';

// Set global defaults for newly created <rich-input> elements
RichInput.operators = ['-', '+'];
RichInput.combinators = ['AND', 'OR', 'NOT'];
RichInput.delimiters = ['()', '[]'];

// Or configure an individual instance via properties or methods
const input = document.querySelector('rich-input');
input.operators = ['-'];
input.combinators = ['AND', 'OR'];
input.delimiters = ['()'];

// Reset an instance or global setting back to defaults by assigning null
input.operators = null;
```

---

## Rich Option Markup (`<img>` Support)

Options inside a `<datalist>` can include an `<img>` element to display thumbnails, avatars, or record label logos in the autocomplete suggestions popover:

```html
<datalist id="label" label="Record Label">
  <option value="We Play House Recordings">
    <img src="assets/we-play-house-recordings.jpg" height="50" width="50" alt="WPH">
    We Play House Recordings
  </option>
  <option value="Defected">
    <img src="assets/defected.jpg" height="50" width="50" alt="Defected">
    Defected
  </option>
</datalist>
```

When `<rich-input>` parses a `<datalist>`, it clones any `<img>` found inside `<option>` and renders it inside the corresponding suggestion row with `part="suggestion-image"`. You can style these images from your stylesheet using `::part(suggestion-image)`:

```css
rich-input::part(suggestion-image) {
  width: 2.5em;
  height: 2.5em;
  border-radius: 50%;
  object-fit: cover;
}
```

---

## Customizing the Leading Icon via `::part(icon)`

By default, `<rich-input>` renders a leading search magnifying glass icon exposed as `::part(icon)`. You can customize or replace this icon using either the CSS `content` property (for example, to display an emoji) or the CSS `background` property (to display a custom SVG or image):

```css
/* Option 1: Show an emoji or text via the CSS content property */
rich-input::part(icon) {
  content: "🎵";
}

/* Option 2: Show a custom SVG/image via the CSS background property */
rich-input::part(icon) {
  background: url("music-note.svg") no-repeat center / contain;
}
```

---

## The OpaqueRange API

The [OpaqueRange API](https://chromestatus.com/feature/6297362687066112) is a web platform standard introduced in Chromium 152 (Google Chrome, Microsoft Edge) that enables range-based operations over the text content of form controls (`<input>` and `<textarea>`).

Before `OpaqueRange`, web authors had to clone form controls into hidden `<div>`s to measure caret coordinates or apply highlights. `OpaqueRange` provides native access:

```javascript
// Measure exact caret coordinates inside <input>
const range = input.createValueRange(caretPos, caretPos);
const rect = range.getBoundingClientRect();

// Anchor autocomplete popover at caret
popover.style.left = `${rect.left}px`;
popover.style.top = `${rect.bottom + 4}px`;

// Highlight syntax directly inside <input>
const valueRange = input.createValueRange(valStart, valEnd);
const highlight = new Highlight(valueRange);
CSS.highlights.set('label', highlight);
```

`<rich-input>` automatically checks `typeof HTMLInputElement.prototype.createValueRange === 'function'`. On supported browsers (Chromium 152+), caret tracking and `::highlight()` are applied natively via `OpaqueRange`.

In browsers without `OpaqueRange` that support the CSS Custom Highlight API (such as Safari 17.2+ and Firefox 141+), `<rich-input>` automatically falls back to an adapted single-line `[contenteditable]` element inside its shadow DOM. This exposes standard DOM `Text` nodes so standard `Range` objects can be created and passed to `CSS.highlights`, delivering on-the-fly `::highlight()` syntax highlighting across browsers. In environments lacking range positioning, popover dropdowns are positioned using a hidden mirror `<div>` text measurement fallback.

---

## Styling Highlights with the CSS Custom Highlight API

Values corresponding to configured keywords are registered into the global `CSS.highlights` registry and styled using standard CSS `::highlight(keyword)` pseudo-elements in your stylesheet:

```css
/* Style the value set in label:"Warp Records" */
::highlight(label) {
  background-color: oklch(0.92 0.08 240);
  color: oklch(0.28 0.14 240);
  text-decoration: 2px underline solid oklch(0.5 0.15 240 / 0.5);
}

/* Style numeric year values like year:2026 */
::highlight(year) {
  background-color: oklch(0.93 0.1 85);
  color: oklch(0.35 0.14 85);
}

/* Style artist names */
::highlight(artist) {
  background-color: oklch(0.92 0.1 320);
  color: oklch(0.32 0.14 320);
}

/* Generic prefix highlight for operators (e.g. "-" in "-style:Acid") */
::highlight(rich-input-operator) {
  color: #e11d48;
  text-shadow: 0 0 1px rgba(225, 29, 72, 0.2);
}

/* Generic highlight for combinators (e.g. "OR" in "artist:Aphex OR label:Defected") */
::highlight(rich-input-combinator) {
  color: #7c3aed;
  text-shadow: 0 0 1px rgba(124, 58, 237, 0.2);
}

/* Generic highlight for delimiters (e.g. "(" and ")") */
::highlight(rich-input-delimiter) {
  color: #0284c7;
  text-shadow: 0 0 1px rgba(2, 132, 199, 0.25);
}

/* Generic prefix highlight for keyword labels (e.g. "label:", "year:") */
::highlight(rich-input-keyword) {
  color: #64748b;
  text-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
}

/* Invalid highlight (squiggly underline for unrecognized keywords or values not present in datalist) */
::highlight(rich-input-invalid) {
  text-decoration: underline wavy #ef4444;
  text-decoration-skip-ink: none;
}
```

In browsers using the `[contenteditable]` fallback inside Shadow DOM (such as Safari and Firefox), `<rich-input>` automatically syncs document-level `::highlight()` rules into its shadow stylesheet so that highlighting works across shadow boundaries without extra markup.

For self-contained widgets or instance-specific style overrides, `<rich-input>` also supports an optional embedded `<style>` block as a direct child, which is automatically injected into the shadow root:

```html
<rich-input value='artist:"Aphex Twin" label:"Warp Records"'>
  <style>
    ::highlight(label) {
      background-color: #dbeafe;
      color: #1e40af;
    }
  </style>
  <datalist id="label" label="Record Label">...</datalist>
</rich-input>
```

> **Note:** Supported CSS properties on `::highlight()` include `color`, `background-color`, `text-decoration`, `text-shadow`, `-webkit-text-stroke-color`, `-webkit-text-stroke-width`, and `-webkit-text-fill-color`.

---

## Styling the Input with Shadow Parts (`::part`)

Every internal element of `<rich-input>` is exposed via `::part()`:

```css
/* Style the outer control container */
rich-input::part(control) {
  border-radius: 9999px;
  border: 2px solid #2563eb;
  padding: 0 1.25rem;
  background: #ffffff;
}

/* Style the native text input */
rich-input::part(input) {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
}

/* Style the suggestions popover */
rich-input::part(popover) {
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
}

/* Style active suggestion item */
rich-input::part(suggestion-item-active) {
  background-color: #dbeafe;
}
```

### Available Shadow Parts

| Part Name | Description |
|---|---|
| `::part(control)` | The wrapper container enclosing the search icon, input, and clear button |
| `::part(input)` | The internal native `<input type="text">` |
| `::part(icon)` | The leading icon element (defaults to a search magnifying glass, customizable via CSS `content` or `background`) |
| `::part(clear-button)` | The clear button (visible when text is present) |
| `::part(popover)` | The autocomplete popover container |
| `::part(suggestions-header)` | The header bar at the top of the popover |
| `::part(suggestions-list)` | The `<ul>` list element |
| `::part(suggestion-item)` | Each suggestion `<li>` item |
| `::part(suggestion-item-active)` | The currently focused / hovered suggestion item |
| `::part(suggestion-item-selected)` | The suggestion item matching the value currently echoed in the input |
| `::part(suggestion-keyword)` | Keyword name element in suggestion items |
| `::part(suggestion-combinator)` | Combinator name element in suggestion items |
| `::part(suggestion-value)` | Value element in suggestion items |
| `::part(suggestion-content)` | The content container inside each suggestion item |
| `::part(suggestion-image)` | Image or icon element rendered inside rich suggestion items |

---

## JavaScript API

### Properties

- `value` (`string`): Gets or sets the search input value. Updates highlights and form value automatically.
- `operators` (`string[] | string`): Gets or sets the prefix operators (e.g. `['-', '~', '+']` or `'- ~ +'`) for this instance. Defaults to `RichInput.operators` (`['-']`). Setting to `null` clears the instance override and falls back to the global configuration.
- `RichInput.operators` (`string[] | string`): Static getter and setter to configure global default operators for all instances without a local override.
- `combinators` (`string[] | string`): Gets or sets the query combinators (e.g. `['AND', 'OR', 'NOT']` or `'AND OR NOT'`) for this instance. Defaults to `RichInput.combinators` (`[]`). Setting to `null` clears the instance override and falls back to the global configuration.
- `RichInput.combinators` (`string[] | string`): Static getter and setter to configure global default combinators for all instances without a local override.
- `delimiters` (`string[] | string`): Gets or sets the delimiter pairs (e.g. `['()', '{}', '[]']` or `'{} () []'`) for this instance. Defaults to `RichInput.delimiters` (`['()']`). Setting to `null` clears the instance override and falls back to the global configuration.
- `RichInput.delimiters` (`string[] | string`): Static getter and setter to configure global default delimiter pairs for all instances without a local override.
- `placeholder` (`string`): Gets or sets the input placeholder text.
- `disabled` (`boolean`): Disables or enables the input control.
- `name` (`string`): Form field name when submitted inside a `<form>`.
- `selectionStart` / `selectionEnd` (`number`): Text selection / cursor indices.

### Methods

- `getParsedQuery()`: Returns a parsed object containing the `raw` query string and an ordered `tokens` array (`keyword`, `combinator`, `delimiter`, `text`, and `whitespace` tokens):
  ```json
  {
    "raw": "(artist:\"Aphex Twin\" OR year:2026) AND -style:\"Acid House\"",
    "tokens": [
      { "type": "delimiter", "raw": "(", "delimiter": "(", "pair": "()", "role": "open", "start": 0, "end": 1 },
      { "type": "keyword", "operator": null, "keyword": "artist", "innerValue": "Aphex Twin", "start": 1, "end": 20 },
      { "type": "whitespace", "raw": " ", "start": 20, "end": 21 },
      { "type": "combinator", "raw": "OR", "combinator": "OR", "start": 21, "end": 23 },
      { "type": "whitespace", "raw": " ", "start": 23, "end": 24 },
      { "type": "keyword", "operator": null, "keyword": "year", "innerValue": "2026", "start": 24, "end": 33 },
      { "type": "delimiter", "raw": ")", "delimiter": ")", "pair": "()", "role": "close", "start": 33, "end": 34 },
      { "type": "whitespace", "raw": " ", "start": 34, "end": 35 },
      { "type": "combinator", "raw": "AND", "combinator": "AND", "start": 35, "end": 38 },
      { "type": "whitespace", "raw": " ", "start": 38, "end": 39 },
      { "type": "keyword", "operator": "-", "keyword": "style", "innerValue": "Acid House", "start": 39, "end": 58 }
    ]
  }
  ```
- `getKeywords()`: Returns an array of configured keyword definitions from the datalists.
- `getOperators()` / `setOperators(operators)`: Gets or sets the operators for this instance (or globally via `RichInput.getOperators()` / `RichInput.setOperators(operators)`).
- `getCombinators()` / `setCombinators(combinators)`: Gets or sets the combinators for this instance (or globally via `RichInput.getCombinators()` / `RichInput.setCombinators(combinators)`).
- `getDelimiters()` / `setDelimiters(delimiters)`: Gets or sets the delimiters for this instance (or globally via `RichInput.getDelimiters()` / `RichInput.setDelimiters(delimiters)`).
- `getActiveValueRanges()` / `getActiveKeywordRanges()` / `getActiveOperatorRanges()` / `getActiveCombinatorRanges()` / `getActiveDelimiterRanges()` / `getActiveInvalidRanges()`: Returns the active highlight range descriptors for each token category.
- `focus(options)`: Focuses the internal input.
- `blur()`: Removes focus from the internal input.
- `select()`: Selects all text inside the input.
- `setSelectionRange(start, end, direction)`: Sets caret or selection range.

### Events

- `input`: Dispatched when the search value changes (bubbles, composed).
- `change`: Dispatched on blur or when a search change is committed.
- `search`: Dispatched when the user presses `Enter` with suggestions closed.
- `rich-input-select`: Dispatched when an autocomplete suggestion is selected.
  - `event.detail`: `{ type, operator, keyword, value, label, query }`

---

## Form Integration

`<rich-input>` supports native `<form>` submission through standard `ElementInternals`:

```html
<form id="search-form" action="/search" method="GET">
  <rich-input name="q" placeholder="Search tracks...">
    <datalist id="genre" label="Genre">
      <option value="House"></option>
      <option value="Techno"></option>
    </datalist>
  </rich-input>
  <button type="submit">Search</button>
</form>

<script>
  const form = document.getElementById('search-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    console.log('Submitted query:', data.get('q'));
  });
</script>
```

---

## Building from Source

```bash
# Build ./dist package
npm run build

# Start local demo server
npm start
```

---

## License

[MIT](LICENSE) © [Bramus Van Damme](https://www.bram.us/)
