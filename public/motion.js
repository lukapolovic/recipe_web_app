// Scroll and ambient motion for the kitchen-garden style (docs/DESIGN.md, "Motion"), modelled on the reference
// site's Rellax parallax, Wavify edges, morphing blobs and magnetic buttons:
//  - parallax: elements with data-speed drift against the scroll (positive = faster than the page, negative = slower);
//  - reveal: content fades and rises once as it scrolls into view;
//  - wave edges ripple and the large blobs slowly morph while they are on screen; a path with data-morph="d1|d2|d3"
//    (same commands in each) drifts through its shapes, watched through data-watch when it lives in a clip path;
//  - the main buttons lean towards the pointer, and recipe and cookbook photos tilt towards it in 3D;
//  - every button pops and throws a little burst of sparks when pressed.
// Nothing here runs for people who ask for reduced motion; without this script every element simply shows.

const REVEAL = ['.heading', '.statement', '.split-copy', '.recipes-band-copy', '.carousel', '.cookbook-card', '.recipe-grid > .recipe-card', '.person-card',
  '.review-card', '.review-form', '.instructions-list > li', '.ingredients-panel', '.shopping-paper', '.meal-plan', '.page-content .empty-state', '.invitation'].join(',');
const MAGNETIC = '.button.primary, .button.light, .button.outline, .scroll-cue, .carousel-button, .menu-button, .follow-button';
const TILT = '.recipe-photo, .book-cover';
const TILT_DEG = 7;
const PRESSABLE = 'button, a.button';
const SPARK_TONES = ['--orange', '--gold', '--indigo', '--sky-deep', '--blush'];
const NUMBER = /-?\d*\.?\d+/g;

export function startMotion(blobShapes) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver !== 'function') return;
  document.documentElement.classList.add('motion');

  // Blob shapes that share one command structure can morph into each other.
  const template = blobShapes[0].replace(NUMBER, '#');
  const morphable = blobShapes.filter(d => d.replace(NUMBER, '#') === template).map(d => d.match(NUMBER).map(Number));

  let layers = [], waves = [], blobs = [], morphs = [], frame = 0;
  const onScreen = new Set();
  const seen = new WeakSet();
  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? onScreen.add(entry.target) : onScreen.delete(entry.target);
    // The loop stops when nothing is on screen, so restart it as soon as something is (not only on scroll).
    if (onScreen.size) request();
  }, { rootMargin: '120px 0px' });
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in-view'); reveal.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  // Pages are redrawn in place, so look for new elements after every change to the DOM.
  function scan() {
    layers = [...document.querySelectorAll('[data-speed]')].map(el => ({ el, speed: Number(el.dataset.speed) || 0, box: el.closest('section, footer, .split-band') || el.parentElement }));
    waves = [...document.querySelectorAll('svg.wave path')].map((path, i) => ({ path, svg: path.ownerSVGElement, phase: i * 1.7 }));
    blobs = [];
    for (const path of document.querySelectorAll('svg.blob path')) {
      const svg = path.ownerSVGElement, from = Number(svg.dataset.shape);
      if (!(from < morphable.length) || blobShapes[from].replace(NUMBER, '#') !== template || svg.getBoundingClientRect().width < 220) continue;
      blobs.push({ path, svg, a: morphable[from], b: morphable[(from + 1) % morphable.length], phase: from * 2.1 });
    }
    morphs = [...document.querySelectorAll('path[data-morph]')].map((path, i) => {
      const shapes = path.dataset.morph.split('|'), watch = path.dataset.watch ? document.querySelector(path.dataset.watch) : path.ownerSVGElement;
      return watch && { path, svg: watch, template: shapes[0].replace(NUMBER, '#'), shapes: shapes.map(d => d.match(NUMBER).map(Number)), phase: i * 1.3 };
    }).filter(Boolean);
    for (const { svg } of [...waves, ...blobs, ...morphs]) visibility.observe(svg);
    for (const el of document.querySelectorAll(REVEAL)) if (!seen.has(el) && !el.classList.contains('in-view')) { seen.add(el); reveal.observe(el); }
    request();
  }
  let scanQueued = false;
  new MutationObserver(() => { if (!scanQueued) { scanQueued = true; requestAnimationFrame(() => { scanQueued = false; scan(); }); } })
    .observe(document.body, { childList: true, subtree: true });

  function parallax() {
    const vh = innerHeight, factor = innerWidth < 720 ? 0.5 : 1;
    for (const { el, speed, box } of layers) {
      const rect = box.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > vh * 2) continue;
      const offset = (rect.top + rect.height / 2 - vh / 2) * speed * factor;
      el.style.translate = `0 ${offset.toFixed(1)}px`;
    }
  }
  function ripple(time) {
    for (const { path, svg, phase } of waves) {
      if (!onScreen.has(svg)) continue;
      const ys = [0, 1, 2, 3, 4].map(i => 44 + Math.sin(time * 0.0007 + i * 1.35 + phase) * 15 + Math.sin(time * 0.0011 + i * 2.1) * 6);
      let d = `M0 ${ys[0].toFixed(1)}`;
      for (let i = 1; i < 5; i++) d += `C${(i - 1) * 360 + 180} ${ys[i - 1].toFixed(1)} ${i * 360 - 180} ${ys[i].toFixed(1)} ${i * 360} ${ys[i].toFixed(1)}`;
      path.setAttribute('d', `${d}V90H0Z`);
    }
    for (const { path, svg, a, b, phase } of blobs) {
      if (!onScreen.has(svg)) continue;
      const mix = (Math.sin(time * 0.00045 + phase) + 1) * 0.35;
      let i = 0;
      path.setAttribute('d', template.replace(/#/g, () => { const n = a[i] + (b[i] - a[i]) * mix; i++; return n.toFixed(1); }));
    }
    // About eight seconds from one shape to the next, eased, then on to the following one.
    for (const { path, svg, template, shapes, phase } of morphs) {
      if (!onScreen.has(svg)) continue;
      const t = time * 0.000125 + phase, k = Math.floor(t), ease = (1 - Math.cos(Math.PI * (t - k))) / 2;
      const a = shapes[k % shapes.length], b = shapes[(k + 1) % shapes.length];
      let i = 0;
      path.setAttribute('d', template.replace(/#/g, () => { const n = a[i] + (b[i] - a[i]) * ease; i++; return +n.toFixed(4); }));
    }
  }
  function tick(time) {
    parallax();
    ripple(time);
    frame = onScreen.size ? requestAnimationFrame(tick) : 0;
  }
  function request() { if (!frame) frame = requestAnimationFrame(tick); }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request, { passive: true });

  // Magnetic buttons: the button follows the pointer a little, then settles back.
  // Photo cards: the photo tilts towards the pointer (its image also zooms, in app.css), then settles back.
  if (matchMedia('(pointer: fine)').matches) {
    let current = null, tilted = null;
    document.addEventListener('pointermove', event => {
      const card = event.target.closest?.(TILT);
      if (tilted && tilted !== card) { tilted.style.transform = ''; tilted = null; }
      if (card) {
        tilted = card;
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-y * TILT_DEG).toFixed(2)}deg) rotateY(${(x * TILT_DEG).toFixed(2)}deg)`;
      }
      const target = event.target.closest?.(MAGNETIC);
      if (current && current !== target) { current.style.translate = ''; current = null; }
      if (!target) return;
      current = target;
      const box = target.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width - 0.5) * Math.min(22, box.width * 0.18);
      const y = ((event.clientY - box.top) / box.height - 0.5) * Math.min(16, box.height * 0.35);
      target.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      if (current) { current.style.translate = ''; current = null; }
      if (tilted) { tilted.style.transform = ''; tilted = null; }
    });
  }
  // Press feedback: the button squishes and springs back, and strokes, dots and a ring fly out from where it was
  // pressed (its centre for the keyboard). Sparks live in a fixed layer, so they outlive a redraw caused by the click.
  document.addEventListener('click', event => {
    const target = event.target.closest?.(PRESSABLE);
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    target.animate({ scale: [1, 0.9, 1.05, 1] }, { duration: 420, easing: 'cubic-bezier(.3, .7, .4, 1)' });
    const box = target.getBoundingClientRect();
    const keyboard = event.detail === 0 || (!event.clientX && !event.clientY);
    burst(keyboard ? box.left + box.width / 2 : event.clientX, keyboard ? box.top + box.height / 2 : event.clientY,
      box.width > 120 ? 1 : 0.65, target.closest('dialog[open]') || document.body);
  }, true); // capture: run before the app's own handler, which may disable the button while it saves
  scan();
}

// A burst of sparks at a point on screen; size scales the throw for small buttons.
function burst(x, y, size, host) {
  const root = getComputedStyle(document.documentElement);
  const tones = SPARK_TONES.map(name => root.getPropertyValue(name).trim()).filter(Boolean);
  const layer = document.createElement('div');
  layer.className = 'spark-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${x}px`;
  layer.style.top = `${y}px`;
  host.append(layer);
  const count = size < 1 ? 10 : 14, pieces = [];
  const ring = document.createElement('span');
  ring.className = 'spark-ring';
  ring.style.borderColor = tones[0];
  layer.append(ring);
  // Easing sits on each keyframe, so pieces fly out fast at full colour and only fade over the last stretch.
  pieces.push(ring.animate([
    { scale: 0.3, opacity: 1, easing: 'cubic-bezier(.2, .8, .3, 1)' },
    { scale: 1.6 * size, opacity: 0.85, offset: 0.4 },
    { scale: 2.2 * size, opacity: 0 },
  ], { duration: 560 }));
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    spark.className = i % 3 === 2 ? 'spark spark-dot' : 'spark';
    spark.style.background = tones[i % tones.length];
    layer.append(spark);
    const angle = (360 / count) * i + (Math.random() - 0.5) * 22;
    const far = (48 + Math.random() * 34) * size;
    pieces.push(spark.animate([
      { transform: `rotate(${angle}deg) translateY(-10px) scaleY(.4)`, opacity: 1, easing: 'cubic-bezier(.12, .8, .3, 1)' },
      { transform: `rotate(${angle}deg) translateY(${(-far * 0.85).toFixed(1)}px) scaleY(1)`, opacity: 1, offset: 0.55, easing: 'ease-in' },
      { transform: `rotate(${angle}deg) translateY(${(-far).toFixed(1)}px) scaleY(.2)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 160 }));
  }
  // Remove once every piece has flown; the timeout also covers a background tab, where animations are paused.
  Promise.all(pieces.map(piece => piece.finished)).catch(() => {}).finally(() => layer.remove());
  setTimeout(() => layer.remove(), 1500);
}
