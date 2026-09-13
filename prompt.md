Create me a rich search component `<rich-search>` that can automplete values for keyword-bases searches.

The component is and acts like a regular `<input type=text>` so you can type in just text. But when typing in specific keywords it should add suggestions for those keywords. Those keyword-searches are in the form  of `keyword:value`

As an example, some keywords and values one could entere for a music application are:
- genre:"<string>"
- style:"<string>"
- year:<number>
- label:"<string>"
- artist:"<string>"
- mix:"<string>"
- mixid:number
- playlist:"<string>"
- playlistid:number

An example search string could be something like `label:"We Play House Recordings" year:2026 playlist:"WPH Classics"`.

The search field should be able to autocomplete:
- The keywords. E.g. when I type in `m` at the start of a new word, it should suggest `mix:` and `mixid:` which I can choose from a list of suggested options.
- The values for those keywords. E.g. when I start typing `label:"K|` (with | being the current cursor position), then it should suggest the labels “Kranky” and “Keinemusik”.

The configuration of all this happens through `<datalist>` elements that are placed inside the `<rich-search>` element. E.g. this could be the list that suggest values for `mix`:

```html
<datalist id=mix label=Mix>
  <option value="Defected"></option>
  <option value="Keinemusik"></option>
  <option value="Kranky"></option>
  <option value="Ninja Tune"></option>
  <option value="We Play House Recordings"></option>
  <option value="XL Recordings"></option>
</datalist>
```

Technically, implement this using the OpaqueRange API. Check these resources for info:
- https://chromestatus.com/feature/6297362687066112
- https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/OpaqueRange/explainer.md
- https://olliewilliams.xyz/blog/opaquerange/

Styling of the values using the Custom Highlights API should be possible (e.g. `::highlight(label)` can be used to style the value set in label:"We Play House Recordings"). Styling of the input itself should be done using `::part()`.

Follow the project structure as seen in the projects https://github.com/bramus/hic-pageflip and https://github.com/bramus/mermaid-element. Also use the same demo structure and style.