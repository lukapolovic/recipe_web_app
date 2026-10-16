import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSocialRecipe, reviseRecipe, ValidationError } from '../recipe-model.js';
import { validateMealPlan } from '../meal-plan.js';

const RECIPE = '33333333-3333-4333-8333-333333333333';
const base = { title: 'Tomato rice', description: '', category: 'Dinner', diet: 'Vegan', servings: 2, minutes: 25, instructions: ['Cook.'], ingredients: [{ name: 'Rice', quantity: 200, unit: 'g' }] };

test('social recipes default their protein, normalize labels and reject bad ones', () => {
  const recipe = validateSocialRecipe({ ...base, tags: ['Weeknight', 'weeknight', ' Quick '] });
  assert.equal(recipe.meatType, 'None');
  assert.deepEqual(recipe.tags, ['weeknight', 'quick']);
  assert.deepEqual(validateSocialRecipe(base).tags, []);
  for (const changes of [{ meatType: 'Alien' }, { tags: Array(13).fill('x') }, { tags: 'x' }, { tags: [''] }, { servings: 0 }]) {
    assert.throws(() => validateSocialRecipe({ ...base, ...changes }), ValidationError);
  }
});

test('a published calorie figure survives only while ingredients and servings are unchanged', () => {
  const saved = validateSocialRecipe({ ...base, sourceUrl: 'https://example.com/r', sourceCaloriesPerServing: 300 });
  assert.equal(reviseRecipe(saved, saved).sourceCaloriesPerServing, 300);
  assert.equal(reviseRecipe(saved, { ...saved, title: 'Renamed' }).sourceCaloriesPerServing, 300);
  assert.equal(reviseRecipe(saved, { ...saved, servings: 4 }).sourceCaloriesPerServing, null);
  const heavier = { ...saved, ingredients: [{ ...saved.ingredients[0], quantity: 250 }] };
  assert.equal(reviseRecipe(saved, heavier).sourceCaloriesPerServing, null);
});

test('meal plans keep recipe references and checkbox keys, and reject malformed lists', () => {
  const plan = validateMealPlan({ cart: [{ recipeId: RECIPE, servings: 4, extra: 1 }], checked: { rice_g: true }, version: 7 });
  assert.deepEqual(plan, { cart: [{ recipeId: RECIPE, servings: 4 }], checked: { rice_g: true }, version: 7 });
  const valid = { cart: [], checked: {}, version: 0 };
  for (const changes of [
    { version: -1 }, { version: 1.5 }, { cart: Array(101).fill({ recipeId: RECIPE, servings: 1 }) }, { checked: [] },
    { checked: { rice_g: 2 } }, { cart: [{ recipeId: 1, servings: 2 }] }, { cart: [{ recipeId: RECIPE, servings: 0 }] },
    { cart: [{ recipeId: RECIPE, servings: 1 }, { recipeId: RECIPE, servings: 2 }] },
  ]) assert.throws(() => validateMealPlan({ ...valid, ...changes }), ValidationError);
  assert.throws(() => validateMealPlan(null), ValidationError);
});
