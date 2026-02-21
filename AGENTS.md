# AGENTS.md

## WebDevTools+

An iPhone and iPad Safari browser extension that allows you to check and test a variety of web development tools.

## Browser Support

- This app only supports iOS 16 and later.
- No need for Firefox or Chromium specific code.

## HTML

- Buttons should always have a type attribute
- All pages should have a header, main and footer element
- Always prefer using Bootstrap utility classes over custom CSS
- Switches should always have the `switch` attribute and the `role="switch"` attribute

## Accordions

Accordions are built with details/summary elements but use Bootstrap's CSS. The markup is like this:

```html
 <div class="accordion border-bottom-0">
    <details class="accordion-item border-bottom-0" name="accordion">
      <summary class="accordion-button rounded-top">
        <h2 class="accordion-header user-select-none">Accordion Title 1</h2>
      </summary>
      <div class="accordion-body border-bottom">
        <p>Accordion content.</p>
      </div>
    </details>
  </div>
```

## SVGs

- SVG files should be optimized using SVGO.
- SVGs should be formatted with Prettier.
