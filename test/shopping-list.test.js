import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shoppingList, checkKey, amountLabel } from '../public/recipe-math.js';

// A real 119-line list: every row of an old shopping list, fed back in as one recipe.
const big = JSON.parse(readFileSync(new URL('./fixtures/big-shopping-list.json', import.meta.url), 'utf8'));

const plan = (ingredients, { servings = 1, planned = servings } = {}) =>
  shoppingList([{ id: 'r', title: 'Test', servings, ingredients }], [{ recipeId: 'r', servings: planned }]);
const line = (name, quantity, unit, note) => ({ name, quantity, unit, ...(note ? { note } : {}) });
const rowsOf = (rows, name) => rows.filter(row => row.name.toLocaleLowerCase('en') === name);
const only = (rows, name) => { const found = rowsOf(rows, name); assert.equal(found.length, 1, `expected one "${name}" row, got ${found.map(r => r.amount)}`); return found[0]; };

test('the big list collapses its duplicates and says every amount the way a shopper reads it', () => {
  const rows = plan(big.ingredients);
  assert.equal(rows.length, 91, 'was 119 rows before ingredients were matched up');
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);

  assert.equal(only(rows, 'rolled oats').amount, '2½ cup', 'old fashioned oats, old fashioned rolled oats and rolled oats are one thing');
  assert.equal(only(rows, 'green onion').amount, '7 pieces', 'green onion, green onions and spring onions');
  assert.equal(only(rows, 'chicken breasts').amount, '960 g', 'boneless skinless chicken breasts (18 oz) and chicken breast');
  assert.equal(only(rows, 'salmon').amount, '1.12 kg', 'salmon and salmon fillets');
  assert.equal(only(rows, 'butter').amount, '2¼ tbsp', 'tbsp and tsp add up, and Butter is butter');
  assert.equal(only(rows, 'milk').amount, '1½ cup');
  assert.equal(only(rows, 'almond milk').amount, '2½ cup', 'almond milk is not milk');
  assert.equal(only(rows, 'lemon juice').amount, '2¼ tbsp', 'lemon juice and freshly squeezed lemon juice');
  assert.equal(only(rows, 'dill').amount, '2 tsp', 'chopped dill and fresh dill');
  assert.equal(only(rows, 'beef broth').amount, '775 ml', 'beef broth in cups and beef stock in ml');
  assert.equal(only(rows, 'olive oil').amount, '9½ tbsp', 'light olive oil adds to olive oil');
  assert.equal(only(rows, 'cream cheese').amount, '130 g', 'light cream cheese (4.5 oz)');
  assert.equal(only(rows, 'whole-grain tortillas').amount, '8 pieces', 'whole wheat and whole-grain tortillas');
  assert.equal(only(rows, 'onion').amount, '1 piece', 'half an onion and half a medium onion');
  assert.equal(only(rows, 'carrot').amount, '2 pieces', '1 carrot and half a large carrot round up to whole carrots');
  assert.equal(only(rows, 'lemon').amount, '3 pieces', '2.5 lemons');
  assert.equal(only(rows, 'banana').amount, '1 piece', 'half a large banana');
  assert.equal(only(rows, 'strawberries').amount, '1 pint', '"pint fresh strawberries, 0.5" is half a pint');
  assert.equal(only(rows, 'chopped tomatoes').amount, '600 g', 'tin chopped tomatoes and chopped tomatoes');
  assert.equal(only(rows, 'tomato').amount, '12 pieces', 'canned chopped tomatoes are not fresh tomatoes');
  assert.deepEqual(rowsOf(rows, 'garlic').map(row => row.amount).sort(), ['2 tsp', '7 pieces'], 'garlic and garlic cloves add up; minced garlic by the spoon is a separate measure');

  const maple = only(rows, 'maple syrup');
  assert.equal(maple.amount, '3¼ tbsp', '"honey or maple syrup" joins the maple syrup already on the list');
  assert.ok(maple.notes.includes('or honey'));
  assert.equal(rowsOf(rows, 'honey or maple syrup').length, 0);

  const yogurt = rowsOf(rows, 'greek yogurt');
  assert.deepEqual(yogurt.map(row => row.amount).sort(), ['130 g', '1½ cup'], 'Greek yogurt in cups (nonfat, plain) and in grams');
  assert.deepEqual(yogurt.find(row => row.unit === 'cup').notes, ['nonfat', 'plain']);
});

test('salt and pepper become separate rows, and "to serve" and optional lines say so', () => {
  const rows = plan(big.ingredients);
  assert.equal(only(rows, 'salt').amount, '2 tsp');
  assert.equal(only(rows, 'black pepper').amount, '1¼ tsp', 'includes "black pepper0.25tsp" and the pepper in "Salt and pepper"');
  assert.equal(rowsOf(rows, 'salt and pepper').length + rowsOf(rows, 'salt & pepper').length, 0);
  assert.equal(only(rows, 'basil leaves').amount, 'to serve');
  assert.equal(only(rows, 'parmesan shavings').amount, 'to serve');
  assert.equal(only(rows, 'sesame seeds').amount, 'a pinch');
  assert.equal(only(rows, 'parsley').amount, '¼ cup', 'a pinch of parsley on top of a quarter cup is still a quarter cup');
  assert.ok(only(rows, 'cinnamon').notes.includes('optional'), '"(if desired)" is a note, not part of the name');
  assert.ok(only(rows, 'red wine').notes.includes('optional'));
  assert.ok(!only(rows, 'chia seeds').notes.includes('optional'), 'chia seeds are optional in one recipe and needed in another');
  assert.equal(only(rows, 'chia seeds').amount, '4¼ tbsp');
});

test('no row is left with prep text, brackets or stray numbers in its name, or a fraction of an item', () => {
  for (const row of plan(big.ingredients)) {
    assert.doesNotMatch(row.name, /[(),\d]/, `"${row.name}" still carries prep text`);
    // Canned "chopped tomatoes" keep their name on purpose: they are a product, not a prep step.
    assert.doesNotMatch(row.name, /^(?:finely|fresh|chopped(?! tomato)|minced|diced|sliced|grated|halved|large|medium|small|nonfat|plain|old)\b/i, `"${row.name}" still starts with a descriptor`);
    if (row.unit === 'piece') assert.match(row.amount, /^[1-9]\d* pieces?$|^to serve$/, `${row.name}: ${row.amount}`);
    assert.ok(row.amount && !/\d\.\d{3}/.test(row.amount), `${row.name} has an unrounded amount: ${row.amount}`);
  }
});

test('amounts are rounded for the shop but the row keeps the exact figure', () => {
  const [pound] = plan([line('Asparagus', 1, 'lb')]);
  assert.equal(pound.quantity, 453.59237);
  assert.equal(pound.unit, 'g');
  assert.equal(pound.amount, '455 g');
  assert.equal(plan([line('Flour', 1.5, 'kg'), line('Flour', 250, 'g')])[0].amount, '1.75 kg');
  assert.equal(plan([line('Flour', 12.4, 'g')])[0].amount, '12 g');
  assert.equal(amountLabel({ quantity: 2, unit: 'cup' }), '2 cup', 'rows from elsewhere still read sensibly');
});

test('volumes convert between spoons, cups and millilitres and show the unit a shop would use', () => {
  assert.equal(plan([line('Oil', 1, 'tbsp'), line('Oil', 2, 'tsp')])[0].amount, '1¾ tbsp');
  assert.equal(plan([line('Oil', 2, 'tsp'), line('Oil', 1, 'tsp')])[0].amount, '1 tbsp', 'three teaspoons are a tablespoon');
  assert.equal(plan([line('Milk', 1.5, 'cup'), line('Milk', 1, 'tbsp')])[0].amount, '1½ cup');
  assert.equal(plan([line('Milk', 2, 'cup'), line('Milk', 100, 'ml')])[0].amount, '575 ml');
  assert.equal(plan([line('Milk', 1, 'cup'), line('Milk', 1, 'l')])[0].amount, '1.24 l');
  assert.equal(plan([line('Salt', 1, 'pinch'), line('Salt', 0.25, 'tsp')])[0].amount, '¼ tsp');
});

test('whole items round up once, after adding, and different measures are not mixed', () => {
  assert.equal(plan([line('Onion', 0.5, 'piece'), line('Medium onion', 0.5, 'piece', 'finely chopped')])[0].amount, '1 piece');
  assert.equal(plan([line('Onion', 0.5, 'piece')])[0].amount, '1 piece');
  assert.equal(plan([line('Onion', 1, 'piece'), line('Onions', 0.5, 'piece')])[0].amount, '2 pieces');
  const rice = plan([line('Rice', 200, 'g'), line('Rice', 1, 'cup'), line('Rice', 2, 'piece')]);
  assert.deepEqual(rice.map(row => row.amount).sort(), ['1 cup', '2 pieces', '200 g']);
});

test('matching ignores case, plurals, spelling, size and prep, but not different products', () => {
  const same = plan([line('Tomatoes', 1, 'piece'), line('tomato', 1, 'piece'), line('Large tomato', 1, 'piece')]);
  assert.equal(same.length, 1);
  assert.equal(same[0].amount, '3 pieces');
  assert.equal(plan([line('Greek yoghurt', 100, 'g'), line('Greek yogurt', 100, 'g')])[0].amount, '200 g');
  assert.equal(plan([line('Berries', 1, 'cup'), line('Berry', 1, 'cup')])[0].amount, '2 cup');
  assert.equal(plan([line('Asparagus', 100, 'g'), line('Asparagus', 100, 'g')])[0].name, 'Asparagus', 'asparagus does not lose its s');
  assert.equal(plan([line('Dried thyme', 1, 'tsp'), line('Thyme', 1, 'tsp')]).length, 2, 'dried and fresh are different things to buy');
  assert.equal(plan([line('Ground beef', 200, 'g'), line('Beef', 200, 'g')]).length, 2);
  assert.equal(plan([line('Light brown sugar', 1, 'cup'), line('Brown sugar', 1, 'cup')]).length, 2, '"light" only drops off where it means low-fat');
});

test('"X or Y" joins a matching row, and stands alone when nothing matches', () => {
  assert.equal(plan([line('Honey or maple syrup', 2, 'tbsp')])[0].name, 'Honey or maple syrup');
  const joined = plan([line('Honey or maple syrup', 2, 'tbsp'), line('Honey', 1, 'tbsp')]);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].amount, '3 tbsp');
  assert.deepEqual(joined[0].notes, ['or maple syrup']);
});

test('notes are tidied: split, de-duplicated and stripped of stray brackets', () => {
  const [garlic] = plan([line('Garlic', 6, 'piece', 'cloves, minced · cloves'), line('Garlic cloves', 1, 'piece', 'peeled, and finely chopped')]);
  assert.deepEqual(garlic.notes, ['cloves', 'minced', 'peeled', 'finely chopped']);
  assert.deepEqual(plan([line('Cinnamon', 1, 'tsp', 'if desired)')])[0].notes, ['optional']);
});

test('servings scale the amounts, and a tick survives only while the shown amount stays the same', () => {
  const ingredients = [line('Milk', 1, 'cup'), line('Eggs', 2, 'piece')];
  const at = (planned) => plan(ingredients, { servings: 100, planned });
  const [eggs99, milk99] = at(99), [eggs100, milk100] = at(100);
  assert.equal(milk99.amount, '1 cup');
  assert.equal(milk99.quantity < milk100.quantity, true, 'the exact amount still moves');
  assert.equal(checkKey(milk99), checkKey(milk100), 'but the shopper sees the same amount, so the tick stays');
  assert.equal(eggs99.amount, '2 pieces');
  assert.equal(checkKey(eggs99), checkKey(eggs100));
  assert.notEqual(checkKey(plan(ingredients, { servings: 1, planned: 3 })[0]), checkKey(plan(ingredients, { servings: 1, planned: 1 })[0]), 'a changed amount unticks the row');
});

test('amounts add across recipes, each scaled to its own servings', () => {
  const recipes = [
    { id: 'a', title: 'A', servings: 2, ingredients: [line('Rice', 100, 'g'), line('Onion', 1, 'piece')] },
    { id: 'b', title: 'B', servings: 4, ingredients: [line('rice', 0.2, 'kg'), line('Onions', 1, 'piece')] },
  ];
  const rows = shoppingList(recipes, [{ recipeId: 'a', servings: 4 }, { recipeId: 'b', servings: 2 }, { recipeId: 'gone', servings: 9 }]);
  assert.equal(only(rows, 'rice').amount, '300 g');
  assert.equal(only(rows, 'onion').amount, '3 pieces');
  assert.deepEqual(only(rows, 'rice').recipes, ['A', 'B']);
});
