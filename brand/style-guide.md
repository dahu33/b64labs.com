# b64labs style guide

How b64labs looks and sounds. The live site in `public/` is the reference: if this guide and `public/css/site.css` disagree, fix one of them.

## The idea

A base64 character is six bits, and a hexagon has six sides. When each side can be on or off, a hexagon is a character. Everything follows from that: the mark, the hexagon grid on the mountain, the decoding text, the button, and the base64 jokes.

## Name

- Write **b64labs**: lowercase, one word, with no space or capital, even at the start of a sentence.
- In page titles, put the page name first and the brand last: `Not found · b64labs`. The home page puts the brand first: `b64labs — Useful things, built with love.`

## Mark

![The b64labs logo](logo/logo.svg)

The mark is a hexagon with the sides of `b` lit. In base64, `b` is `011011`. Read the sides clockwise from the top, with the top side as the most significant bit: top off, upper right on, lower right on, bottom off, lower left on, upper left on. That leaves two chevrons facing outward, `‹ ›`. It is also a real cell on the mountain, the highest one that reads `b`.

The wordmark is drawn by hand, not set in a font. Its letters are single strokes made from the same hexagon geometry. The "4" is the one exception: it is a filled outline, so its top stays cut flat, just above the other letters, however the file is cropped.

### Files

Every version is in [`logo/`](logo) as SVG, with a PNG copy in [`logo/png/`](logo/png). The logo PNGs are 2400 px wide and the others are 1024 px. All the PNGs have transparent backgrounds except the icon. Use the SVG whenever you can. Each file is cropped tight to the artwork, so add the clear space yourself.

| File | Colours | Use on |
| --- | --- | --- |
| `logo.svg` | Accent mark, ink wordmark | Dark backgrounds. **The default.** |
| `logo-on-light.svg` | Accent mark, `#06080b` wordmark | Light backgrounds, such as documents, invoices and other people's sites. |
| `logo-mono-light.svg` | All ink | Dark backgrounds or photos where the accent would clash, and one-colour printing on dark. |
| `logo-mono-dark.svg` | All `#06080b` | Light backgrounds that need one colour: one-colour printing, stamps, engraving. |
| `mark.svg` | Accent | Places too small or too square for the full logo. |
| `mark-mono-light.svg` | Ink | Like `mark.svg`, in one colour, on dark. |
| `mark-mono-dark.svg` | `#06080b` | Like `mark.svg`, in one colour, on light. |
| `icon.svg` | Accent mark on a `#06080b` square | Avatars and app icons. It's square with no rounded corners, because the platform rounds or circles it. The mark fits inside the circle. |

These files are for the site, not for sharing:

| File | Use |
| --- | --- |
| `public/logo.svg` | A copy of `logo/logo.svg`, served at b64labs.com/logo.svg. Keep the two identical. |
| `public/favicon.svg` | The mark on a rounded background tile. Its strokes are a little thicker so they hold up at 16 px. |
| `public/apple-touch-icon.png` | 180 × 180 home-screen icon. |
| `public/og.jpg` | 1200 × 630 social share image. |

The site header (`public/index.html`) draws the same logo inline, using `currentColor`.

**Lockup.** The mark sits to the left of the wordmark. The wordmark is about 86% of the mark's height, with a gap of about half the mark's width between them. In the site header, the mark is 22 px tall, the wordmark is 19 px tall, and the gap is 12 px. There is no stacked version: when the logo won't fit side by side, use the mark alone.

**Colour.** On dark backgrounds, use the mark in accent and the wordmark in ink. On light backgrounds, keep the accent mark and make the wordmark `#06080b`. When only one colour is possible, use a mono file.

**Clear space.** Keep at least half the mark's height clear on every side of the lockup.

**Minimum size.** Keep the mark at least 16 px tall, and the full lockup at least 14 px tall. Below that, use the mark alone.

**Don't:**

- Rotate the mark. It stops being `b`: a 60° turn reads `101101`, which is `t`, and a 120° turn reads `2`. Mirroring it is harmless, because `b` is symmetric, but there's no reason to.
- Fill the missing sides, add a closed outline, or put the mark in a box (except for the favicon and icon tiles).
- Recolour it with anything outside the palette, or add gradients, shadows or glows.
- Set "b64labs" in Martian Mono in place of the drawn wordmark.

## Colour

The site is dark only, with no light theme (`color-scheme: dark`). Only the logo has versions for light backgrounds, for use on other people's pages and on paper.

| Token | Value | Contrast on `--bg` | Role |
| --- | --- | --- | --- |
| `--bg` | `#06080b` | — | Every background. Gradients fade to it, never to pure black. |
| `--ink` | `#ece9e2` | 16.5:1 | Headings, the wordmark, input text, and emphasis. A warm off-white, never `#fff`. |
| `--dim` | `#a3a9ae` | 8.4:1 | Body paragraphs, labels and status messages. Most running text is this colour. |
| `--faint` | `#7c838a` | 5.2:1 | Footer, fine print, and text that is still encoded. |
| `--line` | `--ink` at 15% | — | Hairline rules, field borders, and unlit hexagon sides. |
| `--hot` | `#ff5b2e` | 6.5:1 | The accent: the mark, lit hexagon sides, focus rings, hover, text selection, and the button's chevrons. |

Use the accent sparingly. It marks something that is on, active or the brand itself. Keep it off large areas and body text. When the accent is a background, as in a text selection, the text on it is `--bg`, with a contrast of 6.5:1.

**Terrain ramp.** The mountain's contour lines run from cool to warm with height. Use these colours only for elevation or other data that has a direction, never for the interface:

`#213b5e` → `#5785b0` → `#a8c2d6` → `#ffb380` → `#ff4f21`

## Type

There is one family: [Martian Mono](https://github.com/evilmartians/mono). It is self-hosted as a variable font (`public/fonts/martian-mono.woff2`, weights 100–800, widths 75–112.5%) under the SIL Open Font License. The fallbacks are `ui-monospace, 'SF Mono', Menlo, monospace`.

There are two settings. Display text is light, normal width and tightly tracked, so it reads as drawn lines. Body text is slightly narrow at a weight of 340, so it stays quiet.

| Role | Size | Line height | Weight | Width | Tracking |
| --- | --- | --- | --- | --- | --- |
| Display (hero headline, "Say hello.") | `clamp(2.1rem, 5.1vw, 5.25rem)` | 1.08 | 200 | 100% | −0.075em |
| Heading (the beliefs) | `clamp(1.625rem, 3.6vw, 3.25rem)` | 1.15 | 200 | 100% | −0.075em |
| Subheading | `clamp(1.375rem, 2.6vw, 2.5rem)` | 1.15 | 200 | 100% | −0.075em |
| Lead | `clamp(1.375rem, 2.1vw, 2rem)` | 1.15 | 200 | 100% | −0.075em |
| Input | 1rem (16 px) | 1.65 | 340 | 87.5% | 0 |
| Body | 0.875rem (14 px) | 1.65 | 340 | 87.5% | 0 |
| Small (nav, labels, status) | 0.75rem (12 px) | 1.65 | 340 | 87.5% | 0 |
| Caption | 0.6875rem (11 px) | 1.75 | 340 | 87.5% | 0 |
| Fine print (footer) | 0.625rem (10 px) | 1.7 | 340 | 87.5% | 0 |

- For emphasis in running text, use weight 500 in `--ink`. Don't use italics or the accent.
- Use sentence case everywhere. Don't use all caps.
- Keep line lengths short: 17ch for the hero headline, about 45ch for paragraphs.
- Use typographic quotes (“b”) and a non-breaking space to keep the last two words of a heading together.

## Layout

- **Gutter:** `clamp(20px, 4.2vw, 64px)` on both sides, everywhere.
- **Sections** take at least the full screen height (`100svh`) and leave a lot of empty space. Each section shows one idea.
- **Columns:** a two-column split at a 5:6 ratio, which collapses to one column below 820 px.
- **Separators:** separate rows with 1 px `--line` hairlines. Don't use cards, boxes, shadows or rounded corners.
- The page sits over the terrain canvas. Text that overlaps the terrain gets a gradient to `--bg` behind it, not a solid panel.

## Graphic language

- **Hexagons** are flat-topped. Their sides are numbered clockwise from the top, and side 0 is the most significant bit. `public/js/hex.js` has the geometry and draws any character's lit sides.
- **Lit sides** are `--hot`. **Unlit sides** are drawn as a 1 px "ghost" in `--line`, or omitted.
- **Data is the decoration.** Patterns should encode something real, such as the elevation, the message being typed, or the logo letter. Don't use random noise or stock imagery.

## Components

- **Button:** the label between the mark's two chevrons, in `--hot`, with no box. On hover, the chevrons move 5 px apart. Disabled buttons drop to 50% opacity.
- **Form fields:** each field is a row between hairlines, with a `--dim` label on the left and borderless input text. On focus, the row's rule and its label turn `--hot`. There is no box and no rounded corners.
- **Focus ring:** a 1.5 px `--hot` outline, offset 4 px.
- **Status messages:** small text in `--dim`, next to the control they describe.

## Motion

- **Decoding:** text arrives as random base64 characters and resolves from left to right into the real words, column by column. The headline takes 1.5 s and words take 0.8 s. A word re-encoding on hover takes 0.42 s.
- **Easing:** smootherstep for scripted motion, and `cubic-bezier(0.2, 0.8, 0.2, 1)` for small interface movement. Colour changes take 0.2–0.4 s.
- **Reduced motion:** when `prefers-reduced-motion` is set, show the final state at once. No decoding, transitions or smooth scrolling.
- Screen readers always get the plain text through `aria-label`, never the scrambled text.

## Voice

Short, plain and warm, with a dry sense of humour. Talk to the reader the way you would talk to a curious friend.

- **Short sentences, ending with full stops,** including headings: "Say hello.", "Received.", "Six sides. Six bits. One character."
- **Concrete beats clever.** Say what the thing is and what it does: "A small lab making apps and maybe, one day, objects you can hold."
- **Don't overpromise.** Say "First releases soon," not "Revolutionising…".
- **Humans, not systems.** "A human will read it."
- **Errors say what happened and what to do next:** "That didn't go through. Try again in a minute."
- **Base64 is the in-joke.** Use it sparingly and make it reward curiosity, like the 404 page ("NDA0: That's base64 for 404.") and the hidden comment in the home page's source. Always explain it or make it optional.
- Use British spelling: colour, neighbouring.
- Don't use exclamation marks, emoji or jargon.

### Words we use

| Word | Line |
| --- | --- |
| passion | Making things we want to use ourselves. |
| engineering | Understand the problem. Build, test, refine. |
| practical | Start with a real need. Keep things simple. |

**Tagline:** Useful things, built with love.

## Credits

The terrain uses USGS 3DEP and SRTM elevation data, served through Mapzen Terrain Tiles. Wherever the terrain appears, credit it: "Elevation data: Mapzen Terrain Tiles, courtesy of the U.S. Geological Survey." Martian Mono is by Evil Martians, under the SIL Open Font License (`public/fonts/OFL.txt`).
