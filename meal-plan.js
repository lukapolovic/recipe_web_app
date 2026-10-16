import { ValidationError } from './recipe-model.js';
import { UUID } from './ids.js';

function invalid(message) { throw new ValidationError(message); }

// A cookbook's shared shopping list: which recipes at what servings, plus the
// ticked-off rows. `version` is the compare-and-swap token for concurrent edits.
export function validateMealPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Provide an object.');
  const { cart, checked, version } = input;
  if (!Number.isSafeInteger(version) || version < 0 || !Array.isArray(cart) || cart.length > 100 || !checked || typeof checked !== 'object' || Array.isArray(checked) || Object.keys(checked).length > 1000) invalid('Provide a valid shopping list.');
  const entries = cart.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('Provide an object.');
    if (!Number.isInteger(item.servings) || item.servings < 1 || item.servings > 100) invalid('Choose between 1 and 100 servings.');
    if (typeof item.recipeId !== 'string' || !UUID.test(item.recipeId)) invalid('Choose a valid item.');
    return { recipeId: item.recipeId, servings: item.servings };
  });
  if (new Set(entries.map(item => item.recipeId)).size !== entries.length) invalid('Add each recipe to the shopping list only once.');
  if (Object.entries(checked).some(([key, value]) => key.length > 500 || typeof value !== 'boolean')) invalid('Provide valid shopping list checkboxes.');
  return { cart: entries, checked: { ...checked }, version };
}
