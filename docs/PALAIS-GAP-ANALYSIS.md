# ChériChef vs palais.bio: gap analysis

Side-by-side pass on 30 October 2026, both at 1440 × 900, scrolled section by section with real
scrolling, plus computed styles read from both pages. Numbers are measured, not estimated.
Work through these one at a time; tick them off here.

Legend: **[asset]** needs a file from you (we put a labelled placeholder until then),
**[code]** I can fix, **[decide]** needs your call first.

---

## A. Assets: the biggest quality gap

Everything that reads "cheap" on our page is a picture, not the layout.

1. **Hero media** [asset]. Palais: a looping, colour-graded brand video (1763 × 929, cooking in a
   real kitchen) masked into an organic shape that fills the right ~60 % and runs behind the
   header to the top and right edges. Ours: the flat vector demo plate (`lemon-chicken.svg`) in a
   frame that starts under the header. A flat illustration in the hero sets the whole site's
   perceived quality.
2. **Floating food cut-outs** [asset]. Palais: about 10 studio cut-outs shot for the brand (toast
   with cucumber, bagels, pasta bowl, chives, mushroom, broccoli floret, crumbs, cashews), same
   light, same angle, same white balance, real contact shadows, sharp edges at 2× size. Ours:
   Unsplash photos from different shoots, cut out automatically; mixed light and colour, soft or
   fringed edges, no real shadow. They look pasted on.
3. **Line art** [asset]. Palais: hand-engraved botanical illustrations (dense hatching and
   cross-hatching, varied line weight, 350–690 px, composed scenes: a knife with herbs and a cashew;
   a ladle in a leafy branch; a gravy boat; flowering stems). Ours: generated outlines with one
   uniform stroke and almost no shading, 70–300 px. They read as icons, not illustration.
4. **Recipe and cookbook imagery** [asset]. Palais recipe cards are real overhead food photos. Ours
   (demo kitchen) are flat vector plates on every card, cover and hero. The app will always look
   clip-art until the demo has real photos.
5. **Logo** [asset]. Palais has a drawn wordmark (`pa'lais` with its tagline lock-up, 164 × 75).
   Ours is the word "ChériChef" typed in Caveat. A custom wordmark (SVG) is needed.
6. **Supporting decoration** [asset]:
   - pink brush strokes behind the intro illustration;
   - engraved line art printed in a darker orange *inside* the orange shape (tone on tone);
   - the yellow speech-bubble sticker ("All cream, no cow");
   - duotone (sky-blue) photos inside the two hand-cut cards ("Pa'lais finder", "Got any
     questions?").

   We have none of these.

## B. Typography

7. **Display face** [decide]. Palais section titles use *Sandman Fill*: heavy, rounded, hand-cut
   caps, 86–88 px with a very tight 0.66–0.82 line height ("GROW YOUR PLANT KITCHEN",
   "INCREDIBLE RECIPES", "SPREADY, SAUCY", "YOU ARE"). Ours: Bebas Neue, 80 px, 0.9 line height:
   thinner, mechanical, more condensed. This is the single biggest type difference; the page
   looks lighter and more generic because of it.
8. **Second display face** [decide]. Palais uses *hwt-artz* (wood type) at 46 px for secondary
   titles (split bands, cards, newsletter) and 32 px over card photos. We use Bebas for every level,
   so there is no hierarchy between hero titles and card titles.
9. **Script** [decide]. Palais sublines use *Delivery Note* (a fat marker hand): 58 px / 52 px in
   the hero, 32 px under section titles. Ours: Caveat, 40 px and 28 px, a thinner pen hand.
   Theirs is bolder and larger, almost a second headline.
10. **Statement text** [code]. Palais: ITC Avant Garde, 24 px / 40 px, tracking 3.2 px (0.13 em),
    765 px wide. Ours: DM Sans, 22 px / 38.5 px, tracking 1.3 px (0.06 em). Theirs is a geometric
    face with twice the tracking, which is what makes the paragraph feel airy and premium.
11. **Buttons and nav** [decide + code]. Palais: *Sonder Sans Black Rough* (heavy, slightly rough
    caps) at 12 px.
    - Buttons are tracked 1.6 px, padded 24 × 48 px and 63–67 px tall.
    - Nav is tracked only 0.8 px.

    Ours: Jost 600/700 at 12.5 px, tracked 2 px, buttons 52 px tall with 16 × 34 px padding. Ours
    are lighter, smaller and more spaced, so they look generic.
12. **Small text** [code]. Palais band copy is 12 px on a 26 px line (very open). Footer links are
    12 px, tracked 3.2 px, at 58 % white. Ours is 14–15 px with normal tracking.

## C. Layout, spacing, rhythm

13. **Vertical space** [code]. Palais home page is 6,434 px for 8 sections; ours is 3,795 px for 6.
    - Palais paddings: intro 190 / 190 px; "Spready" section 286 px top; hero 260 px bottom.
    - Ours: 40–170 px.

    Ours feels cramped and app-like; theirs feels like a magazine.
14. **Header** [decide]. Palais header is not sticky: it scrolls away, sits transparent over the
    hero, and has a 4-item nav with chevrons (dropdowns), a hand-cut *rectangle* CTA (not a pill),
    and a tiny right-aligned utility row ("For professionals | EN"). Ours is a sticky cream bar
    with blur and a pill CTA. Our utility row carries the demo notice, search, avatar and sign-out,
    which is busy, app-like chrome. Options: (a) non-sticky on the landing page and a compact
    sticky bar only on app pages, or (b) keep sticky everywhere but transparent until scrolled
    and much lighter.
15. **Hero composition** [code, waits on 1]. Palais hero:
    - 991 px tall;
    - title, dots and subline are centred as a block in the left half;
    - the media shape is far bigger, with a thick gold rim (~120 px) and a sage blob on the left;
    - the line art is huge and bleeds off the top and the left edge;
    - the wave at the bottom is 124 px high and animated.

    Ours: 760 px, left-aligned copy, smaller media, thin gold rim, small line art.
16. **Intro** [code + asset]. Palais: a narrow statement (765 px), offset right of centre. A large
    line-art scene with pink brush strokes bleeds off the left. Single cashew drawings are dotted
    around the text, the toast cut-out sits half off the right edge, the chives cut-out at the
    bottom left, and crumbs scatter. Ours: centred text, small doodles, one photo.
17. **Recipes band** [code + asset]:
    - **Orange shape:** about 1,574 × 1,210, covering the right two-thirds and running into the
      next section, with engraved art inside. Ours is smaller and cut flat at the section edge.
    - **Title:** 88 px white Sandman; ours is 66 px Bebas.
    - **Cards:** square photos 459 px wide, hand-cut, no white box, title *over* the photo
      (white wood-type 32 px). Diet icons sit in white circles top-left, a time pill top-right and
      difficulty hats bottom-right. Ours: 290 px white boxed cards with the title below, plus book
      name, tags and rating.
    - **Carousel:** bleeds off the left edge of the viewport; ours sits inside the grid and fades
      on the right.
    - **Arrows:** small indigo chevrons under the carousel; ours are white discs.
18. **Centred statement section** [code]. Palais has a dedicated centred block: Sandman title,
    marker subline with dashes on both sides (`— and non-dairy! —`), a tracked paragraph, and food
    photos on blobs at both edges. Ours: "Cookbooks from the community" with a kicker above, and
    straight into a grid.
19. **Split bands** [code + asset]:
    - **Palais:** green | yellow with animated wavy edges. Product packs overlap both the top and
      bottom edges. White wood-type titles (46 px), 12 px white text, white pill buttons.
    - **Ours:** indigo Bebas 58 px titles, 15 px text, whisk and ladle doodles instead of hero
      objects, and the bottom meets the footer flat.
20. ~~**Community** [code].~~ Done 1 Nov (see Leftovers). Palais: tilted, overlapping social cards on a large pink blob, with a
    light-blue blob and a big plant drawing at the left. Ours: a 4-column grid of cookbook cards
    with cartoon cover panels and circular plate crops. Ours reads like a dashboard, not an
    editorial page.
21. **Hand-cut feature cards** [code + asset]. Palais has two sky-blue hand-cut cards with a duotone
    photo, a white wood-type title, short text and a white pill. We have no equivalent. These are
    good homes for "Find a recipe" and "Invite your partner".
22. **Newsletter-style band** [code + asset]. Palais: sage band, wavy top, a pasta plate and a
    speech-bubble sticker overlapping the top edge, hand-cut white inputs and an indigo hand-cut
    submit. Ours: none. It could become "Bring a recipe home" (paste a link).
23. **Footer** [code]. Palais footer has no wave and no doodles. It has a white wordmark, three
    columns with 16 px rough headings, 12 px links tracked 3.2 px at 58 % white, a hairline, small
    tracked legal links, and outlined social circles. Ours is close but adds a wave and doodles,
    and its type is larger and less tracked.

## D. Shapes and motion

24. **Blobs** [code]. Palais blobs are drawn per section (the hero shape, the orange recipes
    shape, the community pink, the left-edge sage), layered in two colours (gold under sage, peach
    under orange) and sized 500–1,600 px. Ours reuse 5 generic shapes, mostly smaller, in one layer.
25. **Hand-cut edges** [code]. Palais clips cards, buttons (the header CTA), inputs and panels with
    hand-drawn rectangles. Ours clips cards and panels but not buttons or inputs.
26. ~~**Card hover** [code].~~ Done 1 Nov (photos tilt up to 7° towards the pointer, `motion.js`). Palais: the photo zooms 1.1 inside its frame *and* the card tilts in 3D
    toward the pointer. Ours: zoom only.
27. **Already matching** (keep): animated wave edges, magnetic buttons, page-change wave, slow blob
    turn, reveal on scroll, few parallax layers.

## E. App pages (cookbook, recipe, search, people, shopping)

28. **Recipe grids** [code]:
    - **Palais:** 3 large square photo cards per row, title in wood-type caps below, diet icons
      and time only, about 100 px between rows.
    - **Ours:** book name, tags, rating chip and category chip on every card, so they look busy.
29. **Recipe page** [code + asset]:
    - **Palais hero:** a photo slider, an icon row, the title in 46 px wood type, a product
      callout in a sage blob, and round share buttons.
    - **Palais body:** `— STEP 1` orange labels, ingredients in a sky hand-cut panel with
      hairline rows, and a centred `— OTHER RECIPES —` row.
    - **Ours:** the same structure for steps and ingredients (good), but a cartoon hero image and
      no "other recipes" row.
30. **Cookbook covers** [decide]. Our colour panel with a ringed circular crop is our invention and
    looks toy-like next to Palais' photo cards. A cookbook could instead show a hand-cut cover
    photo (from your assets) with the name below, matching recipe cards.
31. **Page heroes** [code + asset]. Palais inner heroes (e.g. "— Cook — PLANTS LIKE A PRO"):
    - a script word with dashes *above* the caps title;
    - a short centred paragraph;
    - two or three food photos sitting on layered blobs (sand, gold, peach) at the right;
    - a chili cut-out on a yellow blob at the left edge.

    Ours: a kicker, a left title, one blob and one dish.

## F. Clutter we added that Palais doesn't have

32. (Utility row slimmed 1 Nov, see Leftovers.) The cream wave curtain plus a sticky header, plus a demo bar, plus search in the header, gives
    four bands of chrome before any content.
33. Too many small doodles per section (cutlery, mushrooms, nuts, garlic, peapod, cherries). Palais
    uses fewer, much larger, much richer illustrations.
34. ~~Chips everywhere (tags, categories, counts, ratings). Palais shows almost no metadata.~~ Done 1 Nov on cards; the recipe page keeps its tags.

---

## Asset manifest (step 1 done: every slot is a labelled placeholder)

The Unsplash cut-outs, the generated line drawings and the vector demo pictures are gone. Each place
they filled (and the logo and hero media) is now a dashed slot whose label names the file below. Drop
files into `public/assets/` with exactly these names; we wire each one in as it arrives. Cut-outs can
come as PNG (I'll convert them to WebP with alpha).

**Brand**: `assets/brand/logo.svg` (indigo), `assets/brand/logo-white.svg` (footer).

**Hero video**: `assets/video/hero.mp4` + `hero.webm` + `hero-poster.jpg`. 1920 × 1080, 10–20 s
seamless loop, ≤ 8 MB, subject in the right two-thirds (the left third sits under the headline).

**Engravings** (`assets/art/*.webp`, one colour, transparent):

| File | Where | Approx. size on screen |
| --- | --- | --- |
| `hero-top-left.svg` | Home hero, bleeding off the top-left | 360 × 360 |
| `hero-bouquet` (was `hero-bottom`) | Home hero, bottom centre, stems behind the wave: spoon, whisk, rosemary, thyme, bay and mint from the sheets, stood up as one bouquet (each piece paper-filled so it hides what is behind) | 340 × 320 |
| `intro-scene.svg` | Home intro, bleeding off the left (+ brush strokes) | 490 × 625 |
| `intro-accent.svg` | Home intro, a single small drawing right of the statement (like the cashews) | 120 × 120 |
| `recipes-tone-on-tone.svg` | Inside the orange shape, top right (printed darker orange) | 360 × 300 |
| `community-plant.svg` | Bottom left of the community section | 300 × 340 |
| `bring-herbs.svg` | Top right of the "bring a recipe home" band | 300 × 300 |
| `cookbooks-hero.svg`, `following-hero.svg`, `friends-hero.svg`, `search-hero.svg`, `shopping-hero.svg`, `profile-hero.svg`, `cookbook-hero.svg` | Page heroes, upper right of the copy | 200 × 250 |
| `recipe-hero.svg` | Recipe page hero, top right | 200 × 250 |
| `sign-in.svg` | Sign-in art side | 280 × 350 |
| `empty-state.svg` | Empty lists | 170 × 210 |

**Cut-outs** (`assets/food/*.webp`, transparent, top view, ~1,000–1,400 px):

| File | Where |
| --- | --- |
| `intro-dish` | Home intro, half off the right edge |
| `intro-herbs` | Home intro, bottom left, crossing into the recipes band (like the chives) |
| `recipes-dish` | Foot of the orange recipes shape, off the right edge |
| `community-dish` | Half off the left edge, across the split-bands/community seam |
| `saved-left`, `saved-right` | Centred statement: one half off each edge, each on its own blob |
| `bring-dish` | Top left of the "bring a recipe home" band, crossing its top edge |
| `split-left`, `split-right` | Overlapping the top-left and bottom-right edges of the green/yellow bands (packshot-style objects) |
| `cookbooks-dish`, `following-dish`, `friends-dish`, `search-dish`, `shopping-dish`, `profile-dish` | One per page hero, top right, half off the edge on the colour blob |
| `cookbooks-dish-2`, `following-dish-2`, `friends-dish-2`, `shopping-dish-2` | Second photo per page hero, lower and further in, on a sand blob (wide screens only) |
| `page-edge` | Shared by every page hero: a small cut-out (a chili, a herb) on a gold blob at the left edge |
| `reviews-dish` | Recipe page, half off the left, across the reviews seam |
| `sign-in-dish` | Sign-in page, bottom left corner |

**Demo photos** (`assets/photos/*.jpg`, square, top view, 1600 × 1600). Recipes:
`lemon-thyme-chicken`, `berry-ricotta-toast`, `our-morning-green-shake`, `jammy-tomato-pasta`,
`woodland-mushroom-risotto`, `honey-mustard-salmon`, `pear-almond-crumble`, `garden-lentil-soup`.

Real (signed-in) recipes and cookbooks without a photo show a plain tone panel saying "No photo
yet"; only the preview kitchen shows photo slots.

## Suggested order

1. ~~Placeholders: take out the weak cut-outs, generated art and vector demo pictures; add the slots.~~ Done 30 Oct.
2. ~~Typography: display, script, button and statement faces.~~ Done 30 Oct (Londrina Solid, Big Shoulders Display, Caveat Brush, Rubik, Questrial, Outfit).
3. ~~Vertical rhythm and section spacing.~~ Done 30 Oct (190 / 260 / 100 px scale).
4. ~~Header behaviour.~~ Done 30 Oct (transparent, scrolls away, returns on scroll up; hand-cut CTA; hero runs behind it).
5. ~~Hero composition.~~ Done 30 Oct (two-line copy, no buttons; 53% media with a separate tapering gold rim; 124 px wave into the intro).
6. ~~Intro, recipes band and carousel cards.~~ Done 31 Oct (459 px square tiles with the title on the photo; carousel bleeding off the left; 1,570 × 1,210 orange shape rising into the intro; intro accent and herb slots).
7. ~~Centred statement, split bands, feature cards, bring-a-recipe band.~~ Done 31 Oct ("Saved, shared, savoured" statement; split bands with rippling tops and bigger objects; two hand-cut duotone feature cards; sage link band wired to the import).
8. ~~Footer.~~ Done 31 Oct (flat top, no rule; wordmark then three 204 px columns; 16 px titles, 13 px tracked links; stacked legal links under the first column).
9. ~~App pages: grids, recipe page, cookbook covers, page heroes.~~ Done 31 Oct (three square cards per row with fewer chips; hand-cut cookbook covers; "Other recipes" row; centred page heroes with photos on layered blobs).
10. Drop in your assets as they arrive. **First batch in 31 Oct** (see below).

### Delivered 31 Oct

From `~/Downloads/Food Photos` (8 images) and `~/Downloads/LineArt Photos` (6 sheets). None had real
transparency, so every file was cut out here: dishes with the macOS Vision foreground mask, line art
by turning paper white transparent and printing the strokes in `--indigo` (the drawing inside the
orange shape in `--orange-ink`). Sheets with several items were split into single items first. The
two smaller line-art sheets carry a "HIGGSFIELD AI" watermark bottom right; only items away from it
were used. Files are transparent WebP at about twice their display size (3.4 MB in all).

* **Filled:** every engraving in the table above and every cut-out except `search-dish-2` (the search
  hero is compact), `split-left` and `intro-herbs`. Those two were taken out on your word: no
  burgers anywhere (the friends page shows the ribs bowl instead), and the bottom-left of the intro
  had no clear space. The hot dog is turned 45° and about 40 % past the right edge.
* **Second review (31 Oct):** removed the hot dog, the steak plate, the orange carrots, the
  orange spoon and the small peppercorns, lentils, beans, chickpeas, knife, whisk and sprig on the
  home page. The bagel moved to the left across the carousel/statement seam; the ramen bowl replaced
  the tart by the community section; the intro drawing is now the smaller whisk-and-tomato sprig,
  angled; the bay leaves and cashews hang off the statement's top-left and bottom-right corners; the
  hero spoon-and-whisk drawing rises from under the intro's wave, clear of the video; the rosemary is
  bigger and leans in, with bay leaves leaning in on the right (both from 1380 px). Placeholder
  stripes no longer leak onto real images in the orange band.
* **Small drawings (16, `assets/art/s-*.webp`):** single items cut from the sheets, scattered in
  open space and side margins (positions under "Sprinkles" in `app.css`). Big compositions stay at
  three on the home page and none elsewhere. A script check confirmed no drawing or cut-out sits
  under text at 375, 1024, 1150, 1280, 1440 and 1920 px on every page; margin drawings only show
  from 1380 px and all small ones hide below 1100 px.
* **Hero video (1 Nov):** your portrait 4K clip (cheese grated into a pan, 13.6 s) as
  `assets/video/hero.webm` (1080 px, 2.4 MB), `hero.mp4` (1080 px, 3.3 MB), `hero-sm.mp4` (640 px,
  1.4 MB, phones and tablets) and `hero-poster.jpg`, no audio. It fills the hero shape's width,
  framed low (`object-position: 50% 68%`), with a cream fade at the top so the header stays readable.
  The server now answers byte-range requests, which Safari needs to play video.
* **Still open:** the logo (`assets/brand/`) and the
  demo recipe photos (none of the dishes matches the sample recipes; the penne would
  suit `jammy-tomato-pasta`). The ASSETS list at the top of `app.js` names what is in; anything
  not on it still shows its labelled slot.

### Leftovers (1 Nov)

Code items from the list above that steps 1–9 did not cover, one at a time:

* ~~#26 card hover tilt.~~ Done.
* ~~#34 chips.~~ Done: cards and carousel tiles show only a leaf disc (meat-free recipes) and the time; the category chip, rating pill and cookbook recipe count are gone.
* ~~#32 chrome.~~ Done: the utility row is one thin right-aligned line (38 px). Search is a magnifier that opens into a field on focus; the preview shows only "● Preview kitchen | Sign in / join" (the longer note is a tooltip); the tagline and the preview's sample-profile chip and sign-out icon are gone.
* ~~#20 community.~~ Done: the three cookbooks sit in white snapshot borders, tilted and overlapping at the borders, on a large blush blob with a sky blob behind the plant drawing; hover straightens a card. One column with gentle tilts on phones.

All code leftovers are done; what remains is the asset list (logo, demo recipe photos).

* **Feature cards (1 Nov, your call):** no photos after all. Each card is now a deep-blue morphing blob over a gold or blush one, so `feature-find` and `feature-invite` are off the asset list.
* **Cookbook covers (1 Nov, your call):** no photos. Every cookbook is drawn as a book in its own colour with its name printed on it and a line-art sticker, like the old cover but in this style; the five cover photos are off the asset list.
