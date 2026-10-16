import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecipe, ValidationError } from '../recipe-model.js';
import { shoppingList, nutritionFor } from '../public/recipe-math.js';

function fixture(overrides = {}) {
  return {
    title: 'Tomato rice', description: 'A simple dinner', category: 'Dinner', diet: 'Vegan', minutes: 25, servings: 2,
    ingredients: [{ name: 'Rice', quantity: 200, unit: 'g', kcalPer100g: 365 }, { name: 'Tomatoes', quantity: 0.5, unit: 'kg', kcalPer100g: 18 }],
    instructions: ['Cook the rice.', 'Add the tomatoes.'], ...overrides
  };
}

test('shopping list scales servings, merges compatible units, preserves other units and notes', () => {
  const recipes = [
    { ...fixture(), id: 1, ingredients: [{ name: ' Rice ', quantity: 200, unit: 'g', note: 'dry' }, { name: 'Milk', quantity: 250, unit: 'ml' }, { name: 'Rice', quantity: 1, unit: 'cup' }] },
    { ...fixture(), id: 2, title: 'Second rice', servings: 4, ingredients: [{ name: 'rice', quantity: 1, unit: 'kg', note: 'dry' }, { name: 'Milk', quantity: 1, unit: 'l' }] }
  ];
  const rows = shoppingList(recipes, [{ recipeId: 1, servings: 4 }, { recipeId: 2, servings: 2 }, { recipeId: 999, servings: 1 }]);
  assert.equal(rows.find(r => r.name === 'Rice' && r.unit === 'g').quantity, 900);
  assert.equal(rows.find(r => r.name === 'Milk').quantity, 1000);
  assert.equal(rows.find(r => r.unit === 'cup').quantity, 2);
  assert.deepEqual(rows.find(r => r.unit === 'g').notes, ['dry']);
  assert.equal(rows.find(r => r.unit === 'g').recipes.length, 2);
});

test('nutrition scales with servings and marks missing calorie values as partial', () => {
  const complete = nutritionFor(fixture(), 4);
  assert.equal(complete.perServing, 410);
  assert.equal(complete.total, 1640);
  assert.equal(complete.complete, true);
  const partial = nutritionFor(fixture({ ingredients: [{ name: 'Rice', quantity: 200, unit: 'g', kcalPer100g: 365 }, { name: 'Oil', quantity: 1, unit: 'tbsp' }] }));
  assert.equal(partial.complete, false);
  assert.equal(partial.known, 1);
  assert.equal(partial.perServing, 365);
  assert.equal(nutritionFor(fixture({ ingredients: [{ name: 'Water', quantity: 100, unit: 'g', kcalPer100g: 0 }] })).complete, true);
});

test('validation rejects unusable quantities, invalid units, and inappropriate calorie measurements', () => {
  for (const changes of [
    { title: '  ' }, { servings: 0 }, { servings: 1.5 }, { minutes: -1 }, { ingredients: [] },
    { ingredients: [null] }, { ingredients: [{ name: 'Rice', quantity: -3, unit: 'g' }] },
    { ingredients: [{ name: 'Rice', quantity: 1, unit: 'unknown' }] },
    { ingredients: [{ name: 'Milk', quantity: 100, unit: 'ml', kcalPer100g: 50 }] },
    { instructions: [' '] }, { diet: 'Made-up' }
  ]) assert.throws(() => validateRecipe(fixture(changes)), ValidationError);
});

