# UI text is formatted with FormatJS

Donor-facing strings live in typed dictionaries, one per language, written as ICU messages and formatted with FormatJS `intl-messageformat` on both the server and the page. The first version used a hand-written `{placeholder}` replacer, but Russian needs three plural forms ("1 подтверждение", "2 подтверждения", "5 подтверждений"), and ICU plural rules handle them correctly without us writing per-language logic. i18next was rejected as heavier than one page with a few dozen strings needs; a tiny replacer like rosetta was rejected because it has no plural support.

## Consequences

- Messages follow ICU syntax: an ASCII apostrophe escapes, so dictionaries use the typographic ’ in text.
- Token amounts are passed to messages as strings, never numbers, so ICU number formatting can't round or regroup them.
