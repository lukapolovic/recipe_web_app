import { CATEGORIES, UNITS, GRAMS_PER_UNIT } from './public/recipe-config.js';
import { PHOTO_ID } from './ids.js';
export { CATEGORIES } from './public/recipe-config.js';

export const DIETS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free'];
export const PROTEINS = ['None', 'Vegetarian', 'Chicken', 'Beef', 'Pork', 'Lamb', 'Turkey', 'Fish', 'Seafood', 'Mixed', 'Other'];
const COLORS = ['sage', 'peach', 'lavender', 'sand'];

export class ValidationError extends Error {}
function invalid(message) { throw new ValidationError(message); }
function string(value, label, max, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function number(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(`${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  return value;
}
export function validateRecipe(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Provide a recipe object.');
  const title = string(input.title, 'Title', 120);
  const description = string(input.description, 'Description', 600, true);
  const category = input.category ?? 'Dinner';
  const diet = input.diet ?? 'None';
  if (!CATEGORIES.includes(category)) invalid('Choose a valid category.');
  if (!DIETS.includes(diet)) invalid('Choose a valid dietary label.');
  const servings = number(input.servings, 'Servings', 1, 100, true);
  const minutes = number(input.minutes, 'Time', 1, 1440, true);
  if (!Array.isArray(input.ingredients) || input.ingredients.length < 1 || input.ingredients.length > 100) invalid('Add between 1 and 100 ingredients.');
  const ingredients = input.ingredients.map(i => {
    if (!i || typeof i !== 'object') invalid('Each ingredient must be an object.');
    const name = string(i.name, 'Ingredient name', 120);
    const quantity = number(i.quantity, 'Ingredient quantity', 0.001, 1000000);
    if (!UNITS.includes(i.unit)) invalid('Choose a valid ingredient unit.');
    const note = string(i.note, 'Ingredient note', 200, true);
    const kcalPer100g = i.kcalPer100g == null ? null : number(i.kcalPer100g, 'Calories per 100 g', 0, 1000);
    if (kcalPer100g != null && !GRAMS_PER_UNIT[i.unit]) invalid('Calories per 100 g require an ingredient measured by weight.');
    const kcalPerUnit = i.kcalPerUnit == null ? null : number(i.kcalPerUnit, 'Calories per unit', 0, 100000);
    let nutritionMatch = null;
    if (i.nutritionMatch) {
      nutritionMatch = { fdcId: number(i.nutritionMatch.fdcId, 'Food ID', 1, Number.MAX_SAFE_INTEGER, true), description: string(i.nutritionMatch.description, 'Matched food', 400), portion: string(i.nutritionMatch.portion, 'Matched portion', 200, true) };
    }
    return { name, quantity, unit: i.unit, note, kcalPer100g, kcalPerUnit, nutritionMatch };
  });
  if (!Array.isArray(input.instructions) || input.instructions.length < 1 || input.instructions.length > 100) invalid('Add between 1 and 100 instruction steps.');
  const instructions = input.instructions.map(step => string(step, 'Instruction', 2000));
  const sourceUrl = string(input.sourceUrl, 'Source link', 2000, true);
  if (sourceUrl) {
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { invalid('Source link must be a valid web URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) invalid('Source link must be an http:// or https:// URL without credentials.');
  }
  const sourceCaloriesPerServing = input.sourceCaloriesPerServing == null ? null : number(input.sourceCaloriesPerServing, 'Source calories per serving', 0, 100000);
  if (sourceCaloriesPerServing != null && !sourceUrl) invalid('Published calories must include a source link.');
  const imageId = string(input.imageId, 'Photo ID', 36, true);
  if (imageId && !PHOTO_ID.test(imageId)) invalid('Choose a valid recipe photo.');
  return { imageId, title, description, category, diet, servings, minutes, ingredients, instructions, sourceUrl, sourceCaloriesPerServing, color: COLORS.includes(input.color) ? input.color : COLORS[CATEGORIES.indexOf(category) % COLORS.length] };
}

export function ingredientSignature(ingredients) {
  return JSON.stringify(ingredients.map(i => [i.name.trim().toLowerCase(), i.quantity, i.unit, i.kcalPer100g ?? null, i.kcalPerUnit ?? null]));
}

// A recipe in a shared cookbook: the base recipe plus its protein and labels.
export function validateSocialRecipe(input) {
  const recipe = validateRecipe(input);
  const meatType = input.meatType || 'None';
  if (!PROTEINS.includes(meatType)) invalid('Choose a valid meat or protein type.');
  const labels = input.tags ?? [];
  if (!Array.isArray(labels) || labels.length > 12) invalid('Choose up to 12 recipe labels.');
  const tags = [...new Set(labels.map(tag => string(tag, 'Recipe label', 40).toLowerCase()))];
  return { ...recipe, meatType, tags };
}

// Editing a saved recipe: a published calorie figure only describes the
// ingredients and servings it was published with, so it is dropped when they change.
export function reviseRecipe(previous, next) {
  const changed = previous.servings !== next.servings || ingredientSignature(previous.ingredients) !== ingredientSignature(next.ingredients);
  return changed ? { ...next, sourceCaloriesPerServing: null } : next;
}
