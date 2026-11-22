import { GRAMS_PER_UNIT } from './recipe-config.js';

// Metric or imperial: the two ways an amount can be read. The shopping list and the recipe page share them, so
// one choice ("Metric | Imperial" button) changes every figure the same way.
//
// Metric reads in g and kg, ml and l. Imperial reads in oz and lb, and in the US cups and spoons the recipes
// already use. A pinch and whole items (pieces, cloves, tins) read the same in both.

export const SYSTEMS = ['metric', 'imperial'];

export const ML = { ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, cup: 236.5882365, pinch: 4.92892159375 / 16 };

// The units that belong to one system. Anything else (pinch, piece, tin ...) has no other form.
const SYSTEM_OF = { g: 'metric', kg: 'metric', ml: 'metric', l: 'metric', oz: 'imperial', lb: 'imperial', tsp: 'imperial', tbsp: 'imperial', cup: 'imperial' };

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const roundTo = (value, step) => Math.round(value / step) * step;

// --- Fractions -------------------------------------------------------------

const QUARTERS = [[0, ''], [0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '']];
const HALVES = [[0, ''], [0.5, '½'], [1, '']];
// What a set of measuring cups holds.
const CUPS = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

// "1½": the nearest of the fractions, never less than the smallest one.
function mixed(value, fractions) {
  let whole = Math.floor(value), glyph = '';
  const rest = value - whole;
  let best = fractions[0];
  for (const fraction of fractions) if (Math.abs(fraction[0] - rest) < Math.abs(best[0] - rest)) best = fraction;
  if (best[0] === 1) whole += 1; else glyph = best[1];
  return whole || glyph ? `${whole || ''}${glyph}` : fractions[1][1];
}

// --- Metric ----------------------------------------------------------------

// Whole units under 50, then steps of 5, then steps of 10 from a thousand. Volumes under 5 ml keep half a
// millilitre, so half a teaspoon is "2.5 ml" and not "2 ml".
function metric(value, small, big, fine = false) {
  const rounded = value >= 1000 ? roundTo(value, 10) : value >= 50 ? roundTo(value, 5)
    : fine && value < 5 ? Math.max(0.5, roundTo(value, 0.5)) : Math.max(1, Math.round(value));
  return rounded >= 1000 ? `${numberFormat.format(rounded / 1000)} ${big}` : `${numberFormat.format(rounded)} ${small}`;
}

// --- The two readings of a weight and of a volume --------------------------
//
// Each returns the figure as `{ unit, quantity, amount }`: the unit it is read in, the exact quantity in that unit,
// and the amount rounded the way a person reads it.

export function weightIn(grams, system) {
  if (system !== 'imperial') return { unit: 'g', quantity: grams, amount: metric(grams, 'g', 'kg') };
  const ounces = grams / GRAMS_PER_UNIT.oz;
  if (roundTo(ounces, ounces < 1 ? 0.25 : 0.5) < 16) return { unit: 'oz', quantity: ounces, amount: `${mixed(ounces, ounces < 1 ? QUARTERS : HALVES)} oz` };
  // From a pound up: "1 lb 2 oz", to the nearest ounce.
  const whole = Math.round(ounces), pounds = Math.floor(whole / 16), rest = whole % 16;
  return { unit: 'lb', quantity: grams / GRAMS_PER_UNIT.lb, amount: rest ? `${pounds} lb ${rest} oz` : `${pounds} lb` };
}

export function volumeIn(ml, system) {
  const teaspoons = ml / ML.tsp;
  // Under a quarter teaspoon is a pinch, in either system.
  if (teaspoons < 0.25) return { unit: 'pinch', quantity: ml / ML.pinch, amount: 'a pinch' };
  if (system !== 'imperial') return { unit: 'ml', quantity: ml, amount: metric(ml, 'ml', 'l', true) };
  if (roundTo(teaspoons, 0.25) < 3) return { unit: 'tsp', quantity: teaspoons, amount: `${mixed(teaspoons, QUARTERS)} tsp` };
  if (roundTo(ml / ML.tbsp, 0.25) < 8) return { unit: 'tbsp', quantity: ml / ML.tbsp, amount: `${mixed(ml / ML.tbsp, QUARTERS)} tbsp` };
  return { unit: 'cup', quantity: ml / ML.cup, amount: `${mixed(ml / ML.cup, CUPS)} cup` };
}

// One recipe ingredient in the chosen system, or null when it already is in it, or has no other form:
// the recipe page then shows it exactly as written.
export function convertAmount(quantity, unit, system) {
  const from = SYSTEM_OF[unit];
  if (!from || from === system || !(quantity > 0)) return null;
  return (GRAMS_PER_UNIT[unit] ? weightIn(quantity * GRAMS_PER_UNIT[unit], system) : volumeIn(quantity * ML[unit], system)).amount;
}
