import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, validateRecipe, ValidationError } from '../database.js';
import { createApp } from '../server.js';
import { shoppingList, nutritionFor } from '../public/recipe-math.js';

function fixture(overrides = {}) {
  return {
    title: 'Tomato rice', description: 'A simple dinner', category: 'Dinner', diet: 'Vegan', minutes: 25, servings: 2,
    ingredients: [{ name: 'Rice', quantity: 200, unit: 'g', kcalPer100g: 365 }, { name: 'Tomatoes', quantity: 0.5, unit: 'kg', kcalPer100g: 18 }],
    instructions: ['Cook the rice.', 'Add the tomatoes.'], ...overrides
  };
}

test('recipes persist across database restarts; edits and deletes persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pantry-test-'));
  const path = join(directory, 'recipes.sqlite');
  try {
    let repository = openDatabase(path);
    const recipe = repository.create(fixture());
    repository.close();
    repository = openDatabase(path);
    assert.equal(repository.get(recipe.id).title, 'Tomato rice');
    assert.deepEqual(repository.get(recipe.id).ingredients, validateRecipe(fixture()).ingredients);
    repository.update(recipe.id, fixture({ title: 'Updated rice', servings: 4 }));
    assert.equal(repository.get(recipe.id).servings, 4);
    assert.equal(repository.remove(recipe.id), true);
    assert.equal(repository.remove(recipe.id), false);
    repository.close();
    repository = openDatabase(path);
    assert.deepEqual(repository.list(), []);
    repository.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('search finds ingredients, filters combine, and SQL wildcards are literal', () => {
  const repository = openDatabase(':memory:');
  try {
    repository.create(fixture());
    repository.create(fixture({ title: '100% Oats', category: 'Breakfast', diet: 'Vegetarian', minutes: 10, ingredients: [{ name: 'Oats', quantity: 100, unit: 'g' }] }));
    assert.equal(repository.list({ q: 'tomato', category: 'Dinner', diet: 'Vegan', maxMinutes: '30' }).length, 1);
    assert.equal(repository.list({ q: 'rice', maxMinutes: '15' }).length, 0);
    assert.equal(repository.list({ q: '%' }).length, 1);
    assert.equal(repository.list({ q: "' OR 1=1 --" }).length, 0);
    assert.throws(() => repository.list({ maxMinutes: '-1' }), ValidationError);
  } finally { repository.close(); }
});

test('example loading is opt-in and repeatable without duplicating recipes', () => {
  const repository = openDatabase(':memory:');
  try {
    assert.equal(repository.list().length, 0);
    assert.equal(repository.loadExamples().length, 6);
    assert.equal(repository.loadExamples().length, 0);
    assert.equal(repository.list().length, 6);
  } finally { repository.close(); }
});

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

test('HTTP API supports CRUD and filters, rejects bad input, and protects local files', async () => {
  const { server } = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', value, headers = {}) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: value === undefined ? undefined : JSON.stringify(value) });
  try {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Pantry/);
    let response = await request('/api/recipes', 'POST', fixture());
    assert.equal(response.status, 201);
    const recipe = await response.json();
    response = await request('/api/recipes?q=tomatoes&diet=Vegan&maxMinutes=30');
    assert.equal((await response.json()).length, 1);
    response = await request(`/api/recipes/${recipe.id}`, 'PUT', fixture({ title: 'New title' }));
    assert.equal((await response.json()).title, 'New title');
    assert.equal((await request('/api/recipes', 'POST', fixture({ servings: 0 }))).status, 400);
    assert.equal((await fetch(`${base}/api/recipes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await request('/api/recipes', 'POST', fixture(), { Origin: 'https://other.example' })).status, 403);
    assert.equal((await fetch(`${base}/api/recipes`, { method: 'POST', body: JSON.stringify(fixture()) })).status, 415);
    assert.equal((await request('/database.js')).status, 404);
    assert.equal((await request('/data/recipes.sqlite')).status, 404);
    assert.equal((await request('/api/recipes/999')).status, 404);
    assert.equal((await request(`/api/recipes/${recipe.id}`, 'DELETE')).status, 200);
    assert.equal((await request(`/api/recipes/${recipe.id}`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
