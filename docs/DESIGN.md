# ChériChef design: Kitchen garden

ChériChef's one visual style, introduced 29 October 2026 to replace "Midnight kitchen".
The reference was the Pa'lais site ([palais.bio](https://www.palais.bio/)) and its
[Refero style sheet](https://styles.refero.design/style/5ef5e1ff-3cb3-4383-9f66-26474409d9ae).
This file records what the reference does, why it works, where the old design fell short,
and the system that replaced it. The code lives in `public/app.css`, the view functions in
`public/app.js`, the clip-path shapes in `public/index.html` and the drawings in `public/art/`.

---

## 1. The reference, taken apart

Everything below was measured on the live site (desktop, 1440 px wide), not guessed from
screenshots.

### 1.1 Colour: one colour for meaning, the rest for mood

| Token | Hex | What it does on palais.bio |
| --- | --- | --- |
| Deep indigo | `#234386` | Every headline, every line of body copy, nav, filled buttons, the filter band and the footer |
| Cream paper | `#fbf9f6` | Page canvas and hero |
| White | `#ffffff` | Cards, inset panels, alternate sections |
| Burnt orange | `#ed7328` | The big recipe-carousel shape, outlined buttons, "STEP 1" labels |
| Honey gold | `#ffc400` | Blobs behind photos, the "Cuisine" half-band |
| Mint sage | `#a2d3a6` | Blobs, the "Spreads" half-band, the newsletter band |
| Sky blue | `#6aa8dc` | Line-art washes, the FAQ and store-finder cards, the ingredients panel tint |
| Warm sand | `#d2b68c` | Illustration details, small blobs |

**Why it works.** There is exactly one structural colour. Anything indigo is information or an
action; anything warm is atmosphere. Because the warm colours never carry text or buttons, the
page can be very colourful without becoming noisy: your eye learns in one screen that indigo =
read/click, orange/gold/sage = feeling. The palette is also food-native (citrus, herbs, crust,
cream), so photographed food sits inside it instead of fighting it.

### 1.2 Type: four voices with strict jobs

| Voice | Pa'lais font | Measured use | Job |
| --- | --- | --- | --- |
| Condensed caps | hwt-artz (wood type) | 46 px / 40 px line, section titles; 32 px card titles | Shouts the topic. Short, punchy, always uppercase |
| Hand lettering | Delivery Note | 58 px / 52 px hero subline, 16 px card titles | Says it warmly, right under the caps |
| Tracked labels | Sonder Sans Black, ITC Avant Garde | 12 px, 0.16–0.2 em tracking, uppercase | Buttons, nav, eyebrows. Never sentences |
| Geometric body | Axiforma | 14–16 px, 0.03–0.06 em tracking | Everything you read |

**Why it works.** The pairing "CAPS headline + handwritten line underneath" (often with dash
marks: `— and non-dairy! —`) is the whole brand in miniature: modern food-magazine structure,
handmade warmth. Each voice has one job, so no font ever competes with another. The airy body
tracking makes paragraphs feel light even in indigo.

### 1.3 Shape: nothing is a plain rectangle

* **Organic blobs** behind photos and at section edges, single flat colours, never gradients.
* **Wavy section edges.** Sections never meet on a straight line; the filter band and the
  footer have wavy tops and bottoms.
* **Hand-cut frames.** Recipe photos, the header CTA, inputs and cards are clipped with
  hand-drawn `clip-path: path(...)` rectangles, so each looks cut out with scissors.
* **Pills for buttons** (radius 4 rem), small radii for cards (8 px), 16 px for tags.

The tension that makes it feel premium rather than childish: the *grid* is rigid and calm
(1200 px column, generous whitespace, strict alignment); only the *edges* are hand-made.

### 1.4 Illustration: engraved botanical line art

Indigo outline drawings (cashews, leaves, a ladle, herbs), 1–1.5 px strokes with hatching,
no fills. They bleed off the viewport edge, overlap section boundaries, are rotated a few
degrees and appear at very different scales. They are connective tissue: they tie one section
to the next and fill empty corners without adding content.

### 1.5 Layout and rhythm

Home page, top to bottom: cream split hero ("A COOKBOOK FOR TWO" plus a handwritten line, centred
in the space left of the video; the scroll cue sits at the content edge in line with the logo; no
buttons; the food video (portrait clip, muted, looping; poster only under reduced motion; a cream fade at its
top under the header) takes the right 41% of the width, leftmost at mid-height, ending above the
hero's foot, with a gold blob behind it (wide beside the top, a narrow band down the side) that
turns and morphs like the orange one; a tall, irregular sage shape sways and drifts at the left
edge; an upright bouquet of drawings (spoon, whisk, rosemary, thyme, bay, mint) stands centred on the
page, its stems running down behind the intro's 124 px rippling wave) → white statement paragraph with an outlined button → recipe carousel
sitting on a huge orange blob → centred "SPREADY, SAUCY" statement → sage | gold split band
→ community (Instagram cards on a pink blob) → two sky blob cards → sage newsletter band
→ indigo footer. The rhythm is cream, white, colour, white, colour, indigo: never two coloured
bands in a row, and every coloured band is entered through a wave.

### 1.6 Components worth copying

* **Header**: a thin right-aligned utility row, 38 px, like the reference's "For professionals | EN" (a magnifier
  that opens into a search field, then "● Preview kitchen | Sign in / join" in the preview or profile and sign-out
  when signed in; the preview's longer note is a tooltip) above the
  main bar (wordmark, menu in Rubik 800 at 12 px with 40 px gaps, and a hand-cut indigo rectangle as the one call to
  action). Like the reference it sits transparent on the page and scrolls away; scrolling back up brings it back on
  cream (`header-away` / `scrolled` body classes set in `app.js`). On wide screens the home hero runs up behind both
  rows, so the hero video reaches the top of the window. Below 1100 px the menu becomes a full-screen cream overlay
  opened by an indigo "MENU" disc.
* **Filled CTA**: indigo pill, white tracked 12 px caps, ~20 × 30 px padding, no shadow.
* **Outlined CTA**: 2 px orange border, orange caps, an arrow inside a disc that sits on the
  left border and slides in 9 px on hover.
* **Recipe card**: hand-cut photo; white circular diet icons top-left; white pill with clock
  and handwritten "25 min" top-right; difficulty pill bottom-right; condensed caps title below
  (or over the photo in the carousel).
* **Filter band**: full-bleed indigo band with wavy edges, white uppercase dropdown labels with
  chevrons, a "Delete all filters" link, then the result count in handwriting.
* **Recipe page**: steps on the left as `— STEP 1` orange labels over plain paragraphs;
  ingredients on the right in a sky-tinted hand-cut panel with indigo hairline rows.
* **Footer**: indigo, white wordmark, uppercase tracked column titles, airy tracked links,
  outlined circular social icons.

### 1.7 Motion catalogue

| Motion | Measured | Effect |
| --- | --- | --- |
| Blobs | `blob-turn` 30 s linear rotate, `blob-skew` and `blob-scale` 15 s | The page breathes even when idle |
| Hovers | 0.3 s `cubic-bezier(.3,.95,.33,.98)` | Quick start, very soft landing; never bouncy |
| Recipe hover | photo scales to 1.1 inside its fixed frame | Food "comes closer" without the card moving |
| Outlined CTA | arrow disc slides from the border into the button | Signals direction |
| Scroll cue | 56 px outlined circle, arrow bounces every 3.6 s | Invites scrolling on a tall hero |
| Page change | white panel with a 160 px wave edge sweeps over the page | Navigation feels like turning a page |
| Carousel | Swiper with slight 3D tilt following the pointer, `WaveCards` nudge keyframes | Shows the row is draggable |
| Reveal | sections fade and slide up as they enter | Pacing on a long page |

### 1.8 How the scroll motion is built (recorded 30 October 2026)

Measured on the live home page by sampling every moving element's transform at 400 px scroll
steps, capturing frames of a scroll pass, and reading the site's own scripts:

* **Rellax parallax.** Four layers carry `data-rellax-speed`: a line-art composition (speed 4)
  moves *faster* than the page, about 0.26 px per px scrolled; the bagel cut-out (−1), a cashew
  (−1.7) and another cashew (−2) move *slower*, 0.09–0.2 px per px. The offset is linear in
  scroll, so far layers lag and near layers rush past, which is where the depth comes from.
* **Photographed cut-outs.** About ten real food photos without background (chives 614×915,
  a pasta bowl 840×720, bagels, toast, a mushroom, crumbs, cashews) lie across section edges,
  bleed off the viewport and overlap the next section. They carry the realism; the line art
  carries the charm.
* **Wavify edges.** Section edges are SVG paths redrawn every frame from 3–4 sine "bones"
  (amplitude 40–80, speed 0.06–0.25), so the boundaries ripple slowly like liquid.
* **Morphing blobs** (anime.js path morphing) and **magnetic buttons** (`.magnetic`: the
  button follows the pointer by up to 25 px with a 1 s Power4 ease, then settles back).

### 1.9 What we deliberately do not copy

* **Contrast failures.** Orange text on cream measures 2.8:1 and white body text on the orange
  shape 3.0:1; the recipe steps are set in a pale blue-grey. All fail WCAG AA for body text.
* **Six fonts and paid licences.** hwt-artz, Delivery Note, Sandman, Axiforma, Avant Garde and
  Sonder are commercial; six families is also too much to load for an app used daily.
* **12 px tracked microcopy** for real information, text over busy video, and a page-blocking
  transition on every click. Fine for a brand site visited once; wrong for a tool used every day.

---

## 2. Where Midnight kitchen fell short

Measured against the reference, without softening it:

1. **Wrong mood for food.** A navy `#101a33` canvas made the app read as a night-time product.
   Food (illustrated or photographed) looked heavy on it, and user photos sat in dark holes.
2. **No colour discipline.** Lemon `#ffd43b` was both the primary button and decoration; four
   saturated cover colours plus tomato, basil and sky all competed with the actions. Nothing
   told the eye what to read first.
3. **One loud voice.** Unbounded (wide, rounded, 54 px) was used for every headline. It reads as
   tech start-up, not cookbook, and with no second voice there was no warmth or hierarchy.
4. **Warmth hidden, not removed.** The markup still rendered eyebrows, handwritten notes and a
   sidebar note, and `pop.css` hid them with `display: none`. The copy existed; the design threw
   it away.
5. **Generic shape language.** Everything was an 18–28 px rounded rectangle, and sections were
   separated only by spacing on one flat background. No rhythm, no bands, no edges.
6. **Sticker illustrations.** Filled cartoon produce on navy is fun once, but it fights food
   imagery and does not scale down to quiet corners the way line art does.
7. **Cartoon motion.** Overshooting `cubic-bezier(.2,.9,.3,1.35)` springs everywhere.
8. **Hard-to-change CSS.** Four stylesheets (`social.css` → `palettes.css` → `social-ui.css` →
   `pop.css`, ~1,500 lines) overrode each other, the old sidebar was turned into a top bar with
   `display: contents`, and every rule was scoped to `[data-palette="pop"]`.

---

## 3. The new system

### 3.1 Colour tokens (`:root` in `app.css`)

| Token | Value | Rule |
| --- | --- | --- |
| `--indigo` | `#234386` | All text, lines, buttons, nav, footer, filter band. The only filled-button colour |
| `--muted` | `#4f6799` | Secondary text. 5.3:1 on cream, 5.6:1 on white |
| `--cream` | `#fbf9f6` | Canvas, heroes, reviews band |
| `--white` | `#ffffff` | Content bands, cards, dialogs |
| `--orange` | `#ed7328` | Shapes, outlined-button borders, underline accents, the active-nav bar |
| `--orange-ink` | `#b04f15` | The only orange used *as text* (step labels, outlined-button text): 4.7:1 |
| `--gold` `--sage` `--blush` `--sky` `--sand` | reference values (+ blush `#f3b6c4`, from the site's community blob) | Shapes, cover panels and bands only |
| `--sky-wash` | `#e4eef8` | Ingredients panel, notices, import box |

Cover colours keep their stored values (`rose`, `olive`, `ochre`, `terracotta`) so no data
changes; `toneOf()` in `app.js` paints them as blush, sage, gold and orange. People get a stable
tone from their id (`toneFor()`), used for avatars and person cards.

Indigo text on every accent passes AA for the sizes used: sage 5.6:1, gold 5.9:1, blush 5.5:1,
sky 3.7:1 (only used behind large caps), orange 3.2:1 (only behind large caps). White text on
orange is limited to the 46 px+ carousel headline; the paragraph there carries a subtle text
shadow, and on narrow screens the band becomes a solid orange block with no image behind it.

### 3.2 Type

Six free faces (SIL OFL), self-hosted because the CSP allows same-origin fonts only, latin subsets,
~190 KB in all. Each stands in for one of the reference's commercial faces. They were chosen on
30 October 2026 with a side-by-side tryout against palais.bio ("Closest to Pa'lais").

| Role | Token | Font | Reference face | Use |
| --- | --- | --- | --- | --- |
| Headlines | `--display` | **Londrina Solid** Black | Sandman Fill | Hero (`.display`, up to 86 px), page titles (`h1`, up to 78 px), big home section titles (up to 88 px); line height 0.8 |
| Titles | `--title` | **Big Shoulders Display** 800 | HWT Artz | `h2` (up to 46 px), `h3` and card titles (up to 32 px), recipe title, amounts in lists |
| Handwriting | `--script` | **Caveat Brush** | Delivery Note | Hero line (up to 56 px), taglines (up to 32 px), kickers with dashes, time pills |
| Labels | `--label` | **Rubik** 600–800 | Sonder Sans Black Rough | Buttons (800, 12 px, 0.13 em, 64 px tall, 24 × 48 px padding), menu (800, 12 px, 0.07 em), form labels, chips |
| Statements | `--statement` | **Questrial** | ITC Avant Garde | Intro statement (up to 24 px / 1.67, 0.13 em), ledes (0.1 em) |
| Body | `--sans` | **Outfit** | Axiforma | Everything you read (16 px / 1.7, 0.03 em); band copy 13 px on a 2.1 line |

Every title is uppercase. Script is never used in buttons, menus or form chrome. Footer headings are
Rubik 900 at 16 px tracked 0.1 em; footer links 13/24 px tracked 0.12 em at 62 % white (4.7:1 on
indigo; the reference's 58 % falls just under 4.5:1); legal links 12 px Questrial caps.

### 3.2a Spacing

Measured on the reference (1440 px): about 190 px above and below ordinary sections, 260–286 px
before the big statement sections, about 100 px between rows of cards. Tokens in `app.css`:
`--section` (88–190 px), `--section-lg` (112–260 px), `--section-sm` (56–96 px) and `--row-gap`
(56–100 px), all fluid with the viewport so phones get roughly half. The home page grew from
3,795 px to about 4,700 px for six sections, about 790 px per section against the reference's 800.

### 3.3 Shape

* `blob(shape, tone)` in `app.js` draws one of five hand-drawn organic paths inline.
* `wave(tone)` puts a wavy top edge on a section (`wave-bottom` flips it); each section owns its
  top edge, filled with its own colour, so neighbours can be any colour.
* `index.html` defines the shared clip paths once: four hand-cut frames (`#cut-a`…`#cut-d`,
  alternated with `:nth-child` so neighbouring cards never match), the hero's wavy edge, the
  split-band edges, and small wave strips. Elements use `clip-path: url(#…)`, which works with
  the strict CSP (no inline styles).
* Pills for buttons (32 px), 8 px for cards and inputs, 16 px for chips.

### 3.4 Illustration, food and media

All imagery is supplied by hand: engravings (SVG), top-view food cut-outs, the hero video, the logo
and demo photos. Until a file exists its place is a labelled dashed slot (`slot()`, `float()`,
`food()` and `noPhoto()` in `app.js`) at the size and position the file will take. The full list of
files and where each goes is in `docs/PALAIS-GAP-ANALYSIS.md` ("Asset manifest").

Placement follows the reference: few, large, half off a screen edge or across a section seam, never
over text, mostly still.

### 3.5 Components

* **Header**: thin right-aligned utility row (magnifier that opens into an underlined search on
  focus or while it holds a query; preview label and sign-in link, or profile chip and sign out) above a
  sticky main bar (wordmark, tracked nav with an orange dot on hover and an orange bar when
  active, indigo CTA). Below 1100 px the nav becomes a full-screen cream menu opened by an indigo
  "MENU" disc.
* **Buttons**: `.primary` (indigo pill), `.outline` (orange border, arrow disc), `.light`
  (white pill for coloured bands), default (indigo outline), `.subtle`, `.danger`.
* **Recipe card**: hand-cut photo (zooms to 1.1 and tilts towards the pointer on hover); on the
  photo only a white leaf disc top-left for meat-free recipes (`dietIcon()`) and the handwritten
  time pill top-right; caps title below (plus "from <cookbook>" in search results). No category,
  rating or tag chips on cards: those live on the recipe page.
* **Recipe tile** (home carousel, `recipeTile()`): a square hand-cut photo up to 459 px with
  everything printed on it: the leaf disc top-left (meat-free only), time pill top-right and
  the caps title in white bottom-left over a soft indigo fade. The track ends at the column edge
  and earlier tiles hang off the left of the window; it opens one tile in on wide screens. Small
  indigo chevrons sit under it. The orange shape behind it is about 1,570 × 1,210 px and rises
  into the intro.
* **Feature card** (home): no photo. A `--sky-deep` (#3d73b4) blob stretched to the card (about
  486 × 400 px) that slowly morphs, over a second blob peeking out underneath (gold under "Find a
  recipe", blush under "Cook as a pair"); white caps title, 15 px white text and a white pill. The
  deeper blue keeps white text at 4.9:1. On phones the card gets extra top and bottom room and a
  narrower text column so everything stays inside the blob.
* **Bring-a-recipe band** (home): sage band with a rippling top, a dish cut-out and a gold
  "pass it on!" sticker crossing its top edge; hand-cut white link field and indigo submit. The
  link is handed to the recipe editor's own import.
* **Split bands**: caps titles at 46 px stay indigo, not white as on the reference: white on
  sage or gold is about 1.6:1 and unreadable.
* **Cookbook card**: never a photo. A square hand-cut mat holding a drawn book (`cookbookCover()`):
  a cover in the cookbook's tone with a darker spine and two cream page edges, the name in
  Big Shoulders caps and "from … kitchen" in the script hand printed on it, and a round cream
  sticker hanging off the bottom-right corner carrying one line drawing (`s-*` art, picked from the
  cookbook id). Type scales with the cover (container units). Below: the caps title with the
  follow heart or "Ours" beside it, then "from … kitchen". No description, avatars, rating or count.
  On the cookbook page the same book sits straight on a pale wash of its colour.
* **Community cards** (home, `.community-cards`): the same cookbook cards inside white snapshot
  borders, tilted -5° / 3° / -2° at staggered heights with their borders overlapping, on a large
  blush blob with a sky blob behind the plant drawing at the left. Hover straightens and lifts a
  card. Tilts use `rotate` (the scroll reveal animates `translate`); one column on phones.
* **Grids**: recipes and cookbooks run three square cards per row (two below 900 px, one below
  720 px), 64 px gutters, about 100 px between rows. A recipe card shows only its category, time and
  rating on the photo and the title below; search results add "from <cookbook>".
* **Other recipes**: the recipe page ends with a centred "— OTHER RECIPES —" in the display face
  and three cards, the same cookbook's first.
* **Small drawings** (`sprinkle()`): single line-art items, 40–120 px, rotated by hand, in open space
  and side margins, never under text; at most three large compositions per page.
* **Page hero**: copy centred in the left column: a big handwritten line with dashes, caps
  title, short tracked paragraph, actions or form. At the right, two cut-outs on layered blobs (the
  page tone and sand); at the left edge a small cut-out on a gold blob; the drawing bleeds off the
  top left. A wave hands over to the white content band.
* **Filter band** (search), **ingredients panel**, **step labels**, **meal plan** (gold hand-cut
  panel), **reviews** (cream band, hand-cut white form card), **dialogs** (cream header,
  sticky action bar), **toast** (indigo pill).

### 3.6 Motion

* Ease `--ease: cubic-bezier(.3,.95,.33,.98)` (the reference's) for hovers; `--ease-out` for
  entrances. Nothing overshoots.
* Ambient: blobs breathe (18 s) and slowly turn (60 s); drawings sway.
* Page change: a cream panel with a gold wavy edge sweeps up off the screen (0.8 s) while the
  new page's hero copy rises in, staggered by 70 ms.
* `public/motion.js` (all of it off under reduced motion):
  * **Parallax**: anything with `data-speed` is offset by (distance of its section's centre from
    the viewport centre) × speed. Drawings and some blobs use speeds from −0.08 (slower, far) to 0.15
    (faster, near); meal photos stay put or drift by at most 0.06.
  * **Reveal**: headings, cards, steps, panels fade and rise once as they scroll in, staggered
    across grid columns (IntersectionObserver, so it works in every browser).
  * **Shape drift**: a path with `data-morph="d1|d2|d3"` (same commands in each) eases from one
    outline to the next every ~8 s while on screen (the hero's sage shape, which also sways 7°;
    `data-watch` points at the element to observe when the path lives in a clip path). The loop restarts whenever something
    comes into view, so waves and shapes move before the first scroll.
  * **Rippling edges**: every wave edge is redrawn each frame from sine waves while on screen.
  * **Morphing blobs**: large blobs ease between two of the hand-drawn shapes.
  * **Magnetic buttons**: filled, outlined and round buttons lean up to ~20 px toward the pointer.
  * **Press sparks**: every button (any `<button>` or `a.button`) pops when pressed (squish to
    0.9, overshoot to 1.05, about 0.4 s) and throws a burst from the press point (its centre from the
    keyboard): an orange ring plus 10–14 strokes and dots in orange, gold, indigo, deep blue and blush,
    flying 30–80 px and fading at the end (`burst()` in `motion.js`). Smaller throw for small buttons.
    The burst sits in a fixed layer (inside the open dialog when there is one), so it outlives
    the redraw a click causes. Listens in the capture phase, before the app may disable the button.
  * The redraw code (`patch()` in `app.js`) keeps each element's parallax offset and revealed
    state, so redraws never make content blink.
* Hover: photo zoom, arrow nudges.
* `prefers-reduced-motion: reduce` turns all of it off, including the page wave.

### 3.7 Accessibility decisions

All text meets WCAG AA on its background; orange text uses `--orange-ink`; focus is a 2.5 px
indigo outline (white on indigo bands); decorative SVGs and drawings are `aria-hidden`; follow
buttons expose `aria-pressed`; the menu button exposes `aria-expanded`; the carousel is a
keyboard-scrollable region with labelled previous/next buttons; inputs keep visible labels.

---

## 4. Page by page

| Page | Before | After |
| --- | --- | --- |
| Discover | Navy hero with sticker collage; two uniform grids | Split hero with the video in a wavy gold-rimmed shape, intro statement, recipe carousel on an orange blob, centred "Saved, shared, savoured" statement with edge photos on blobs, sage/gold split bands with rippling tops, community cookbooks as tilted snapshot cards on a blush blob, two morphing blob feature cards, sage "bring a recipe home" band, indigo footer |
| Our cookbooks / Following | Heading + grid | Gold/blush page hero with whisk/olive drawing, wave into a white grid |
| Cookbook | Coloured banner | Tone page hero with the cover in a blob, handwritten "from … kitchen", fact row, centred dashed "THE RECIPES INSIDE" |
| Recipe | Paper sheet on navy | Cream hero (kicker, caps title, handwritten description, chips, fact row with servings) beside a hand-cut photo on a tone blob; steps with orange `— STEP n` labels; sticky sky ingredients panel with round tick boxes; cream reviews band |
| Friends | Form + grids | Sky page hero holding the add-friend form; cream hand-cut person cards with toned avatars |
| Search | Filters in a row | Gold hero, indigo wavy filter band, handwritten result counts |
| Shopping list | Two panels | Sage hero holding the cookbook picker; cream hand-cut list with orange strike-through; gold meal-plan panel |
| Profile | Card | Centred hero with the avatar in a blob |
| Sign in | Dark split | Cream art side (blobs, drawings, display headline) with a wavy edge into a white form side |
| Privacy / Terms | Dark | Cream page, white sheet, the same type system (`legal.css`, still script-free) |

---

## 5. Working with it

* **New colour?** Don't. Add a tone class only if a new kind of *shape* needs one.
* **New section?** Give it `band band-white|band-cream|…` and `${wave('white')}` for its top
  edge; alternate white and cream; never put two coloured bands next to each other.
* **New drawing?** Add a stroke-only SVG in `public/art/` (stroke `#234386`, no fills), then an
  `.art-<name>` rule with its `--art` URL and `aspect-ratio`.
* **New headline?** Use `heading(title, { kicker, tagline })`; keep titles short enough to sit
  in condensed caps.
* **Fonts**: licences are in `public/fonts/LICENSE.txt`.

## 6. Known gaps

* Real food photography is what makes the reference sing. The demo uses illustrated plates;
  real cookbooks will look best once people upload overhead, natural-light photos.
* There is no dark theme; the style is built on cream paper.
