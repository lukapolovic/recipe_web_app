import { GRAMS_PER_UNIT } from './recipe-config.js';
export { UNITS } from './recipe-config.js';

// Constructing Intl formatters is costly; every ingredient row reuses this one.
const quantityFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
export function formatQuantity(value) {
  return quantityFormat.format(value);
}

export function nutritionFor(recipe, servings = recipe.servings) {
  if (recipe.sourceCaloriesPerServing != null) return {
    total: recipe.sourceCaloriesPerServing * servings, perServing: recipe.sourceCaloriesPerServing,
    complete: true, known: recipe.ingredients.length, count: recipe.ingredients.length, source: 'website',
  };
  const measurable = recipe.ingredients.filter(i => i.kcalPer100g != null && GRAMS_PER_UNIT[i.unit] || i.kcalPerUnit != null);
  const total = measurable.reduce((sum, i) => sum + i.quantity * (i.kcalPer100g != null && GRAMS_PER_UNIT[i.unit] ? GRAMS_PER_UNIT[i.unit] * i.kcalPer100g / 100 : i.kcalPerUnit), 0);
  return { total: total * servings / recipe.servings, perServing: total / recipe.servings,
    complete: measurable.length === recipe.ingredients.length, known: measurable.length, count: recipe.ingredients.length, source: 'ingredients' };
}

// The shopping list adds ingredients up across recipes; see shopping-list.js.
export { shoppingList, checkKey } from './shopping-list.js';

export function displayAmount(quantity, unit) {
  if (unit === 'g' && quantity >= 1000) return `${formatQuantity(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${formatQuantity(quantity / 1000)} l`;
  return `${formatQuantity(quantity)} ${unit === 'piece' ? (quantity === 1 ? 'piece' : 'pieces') : unit}`;
}

// A shopping-list row's amount as a shopper reads it (rounded; "to serve" for garnishes).
export const amountLabel = row => row.amount ?? displayAmount(row.quantity, row.unit);
