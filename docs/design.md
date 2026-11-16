# Design system

crnpay looks like a stream overlay you write yourself: calm, structured pages around one loud thing, the Alert that goes on air. Spend boldness on the Alert and the primary action; keep everything else quiet.

Reference prototypes live in `design/`. They show the look, but they are not source code to copy: build real pages from shared components that follow the rules below.

## Colour

Colours are defined once as CSS custom properties and referenced by role. Components never use raw colour values.

| Role       | Character          | Use                                                                   |
| ---------- | ------------------ | --------------------------------------------------------------------- |
| paper      | cool light grey    | page background. Never warm cream                                     |
| raised     | lighter than paper | inputs, chips, surfaces that sit on paper                             |
| ink        | deep navy          | text, borders, selected states. Never pure black or tinted near-black |
| ink-soft   | muted ink          | hints, secondary text                                                 |
| line       | light ink          | idle borders and dividers                                             |
| signal     | magenta            | the one primary action per screen, focus rings. Nothing else          |
| caution    | amber              | warnings where a mistake loses money (exact amount, network)          |
| final      | green              | the Confirmed state only                                              |
| error      | red                | validation errors, blocking banners, the LIVE badge                   |
| alert-name | bright yellow      | the Nickname in an Alert                                              |

Alert text sits on top of video, so it uses white and alert-name with a dark outline. It never uses the page palette for its background.

## Typography

Three families, each with one job:

- **Display** (Unbounded): Streamer name, headings, amounts in Alerts, the primary button. Never body text.
- **Text** (Golos Text): all body and interface text. It is designed for Cyrillic, so Russian and English look equally good.
- **Mono** (JetBrains Mono): only machine strings, where telling 0 from O and l from 1 matters: addresses, exact amounts, the amount input. Never labels.

Rules:

- Use a small type scale defined as tokens. Don't invent sizes per component.
- Use sentence case everywhere. No all-caps labels, no tracked-out eyebrows.
- Don't accent one word in a headline with a different colour, weight or style.
- Counters and timers use tabular numerals.

## Layout

- **Every screen fits the viewport without vertical scrolling**, in every state and both languages, at least at 1366×720 and 375×812. Adding content means taking space from something else.
- Under that pressure, hide secondary copy on small screens before you shrink the primary content.
- Content is left-aligned. The only centred element is the Alert.
- Two columns from 720px wide, one column below. Phones get a 16px side gutter, and the page never scrolls sideways.
- Structure carries meaning: borders mark interactive or grouped things, and there are no decorative dividers, numbering or labels.
- Radii follow hierarchy: frames are larger than controls, and controls are larger than small badges.

## Components

- **Choices** show every option at once (chips, not dropdowns) when the list is short. A Token chip shows the Token logo, the asset and the network. The same asset on two networks is two chips.
- **Token logos** are stored in the project, not loaded from third-party hosts.
- **Fields** have a label above and a hint below. A validation error replaces the hint and doesn't add a line. Length-limited fields show a counter.
- **Blocking errors** (rate limit, Token unavailable) take the place of the action they block instead of being added above the form.
- **Copy buttons** briefly change to "Copied" after a click, then return to their label.
- **Warnings about money** use caution, sit next to the value they're about, and say what to do.
- **Status** is one line that changes in place, with a coloured dot for its state. It is not a stepper.
- **Primary button** text says what happens and includes the amount when one is known, for example "Donate 10 USDT".

## Alert

- There is **one Alert component**, used by both the donation page preview and the Alert page, so the preview always matches what airs.
- Its background is transparent and it sits centred in its frame.
- The content is "Nickname — amount TOKEN", with the message below. The Nickname is in alert-name and everything else is white, with a dark outline or shadow so it reads over any video.
- Sizes are relative to the frame width (container or viewport units), so the preview and the OBS source keep the same proportions.
- With no Nickname it shows "Аноним". Alert text is always Russian.
- It plays one entrance animation and no sound.

## Motion

- Motion only shows a change: the Alert entrance, a state changing, a copy confirmation. There are no entrance animations on page sections and no hover animations on every element.
- Respect `prefers-reduced-motion` by turning off all non-essential animation.

## Copy

- Use the glossary terms the Donor sees (Donation, Token, Nickname, Payment instructions), in plain, active, sentence-case language.
- Errors say what happened and how to fix it, with exact limits ("Enter at least 0.01 XMR."). They never apologise.
- Every Donor-facing string exists in both the English and the Russian dictionaries. The Donor's message and Nickname are shown as written and never translated.

## Accessibility

- Every interactive element has a visible focus ring in signal.
- Every input has a label. Errors are linked to their input with `aria-describedby` and mark it with `aria-invalid`.
- Status changes are announced with `aria-live`.
- Text contrast meets WCAG AA on paper and on raised surfaces.
