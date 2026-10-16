import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { extractHtml, extractText, parseIngredient, ImportError } from '../recipe-import.js';
import { fetchPublicHtml, parsePublicUrl, isPublicAddress } from '../public-fetch.js';
import { validateRecipe, ValidationError } from '../recipe-model.js';
import { nutritionFor, shoppingList } from '../public/recipe-math.js';
import { createApp } from '../server.js';

const structured = {
  '@context': 'https://schema.org', '@type': ['Recipe'], name: 'Simple oat shake', recipeCategory: 'Smoothie', recipeYield: '2 servings', totalTime: 'PT5M',
  recipeIngredient: ['100 g rolled oats', '½ cup milk', '1 banana'],
  recipeInstructions: [{ '@type': 'HowToSection', name: 'Blend', itemListElement: [{ '@type': 'HowToStep', text: '<p>Blend everything.</p>' }, { '@type': 'HowToStep', text: 'Pour into glasses.' }] }],
  nutrition: { calories: '220 kcal' }
};
const html = `<html><body><nav>Subscribe</nav><h1>Lots of stories</h1><p>Unrelated blog boilerplate.</p><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, structured] })}</script></body></html>`;
const text = 'Simple oat shake\nServings: 2\nTime: 5 minutes\nA story about breakfast.\nIngredients\n100 g rolled oats\n½ cup milk\n1 banana\nInstructions\n1. Blend everything.\n2. Pour into glasses.\nNotes\nSubscribe to my newsletter.';

test('JSON-LD import finds nested recipes, removes article text, and flattens instruction sections', () => {
  const result = extractHtml(html, 'https://example.com/shake');
  assert.equal(result.recipe.title, 'Simple oat shake');
  assert.equal(result.recipe.category, 'Shake');
  assert.equal(result.recipe.servings, 2);
  assert.equal(result.recipe.minutes, 5);
  assert.deepEqual(result.recipe.instructions, ['Blend everything.', 'Pour into glasses.']);
  assert.equal(result.recipe.ingredients[1].quantity, 0.5);
  assert.equal(result.recipe.sourceCaloriesPerServing, 220);
  assert.equal(result.recipe.description, '');
  assert.doesNotThrow(() => validateRecipe(result.recipe));
});

test('plain-text import keeps recipe sections and discards notes and article text', () => {
  const result = extractText(text);
  assert.equal(result.recipe.category, 'Shake');
  assert.equal(result.recipe.minutes, 5);
  assert.equal(result.recipe.ingredients.length, 3);
  assert.deepEqual(result.recipe.instructions, ['Blend everything.', 'Pour into glasses.']);
  assert.throws(() => extractText('Just an article with no recipe headings.'), ImportError);
});

test('microdata and recipe-card text fallback work without structured JSON', () => {
  const microdata = '<div itemtype="https://schema.org/Recipe"><h1 itemprop="name">Rice bowl</h1><span itemprop="recipeYield">2 servings</span><time itemprop="totalTime" datetime="PT20M"></time><p itemprop="recipeIngredient">100 g rice</p><ol itemprop="recipeInstructions"><li>Cook rice.</li></ol></div>';
  assert.equal(extractHtml(microdata).recipe.title, 'Rice bowl');
  const card = '<body><nav>Navigation</nav><div class="wprm-recipe"><h1>Rice bowl</h1><h2>Ingredients</h2><p>100 g rice</p><h2>Instructions</h2><p>Cook rice.</p></div><footer>Subscribe</footer></body>';
  const result = extractHtml(card);
  assert.deepEqual(result.recipe.instructions, ['Cook rice.']);
});

test('ingredient parsing handles mixed fractions and explicit units, and flags ambiguous amounts', () => {
  for (const [input, amount, unit] of [['1½ cups oats', 1.5, 'cup'], ['1 1/2 tbsp oil', 1.5, 'tbsp'], ['200g tomatoes, diced', 200, 'g'], ['2 ounces oats', 2, 'oz'], ['1 banana', 1, 'piece']]) {
    const result = parseIngredient(input);
    assert.equal(result.ingredient.quantity, amount, input);
    assert.equal(result.ingredient.unit, unit, input);
  }
  assert.equal(parseIngredient('200g tomatoes, diced').ingredient.note, 'diced');
  assert.equal(parseIngredient('Salt to taste').ingredient.quantity, null);
  assert.equal(parseIngredient('1 can tomatoes').ingredient.quantity, null);
  assert.ok(parseIngredient('1-2 cups milk').warnings.length);
});

test('public URL validation rejects private networks, encoded loopback and unsupported protocols', () => {
  for (const url of ['file:///etc/passwd', 'http://localhost', 'http://127.1', 'http://2130706433', 'http://10.0.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://192.168.1.1', 'http://user:pass@example.com', 'https://example.com:3000']) assert.throws(() => parsePublicUrl(url), ImportError);
  for (const ip of ['127.0.0.1', '169.254.169.254', '172.16.3.1', '10.0.0.1', '100.64.0.1', '198.19.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(parsePublicUrl('https://example.com/recipe#section').href, 'https://example.com/recipe');
});
function fakeRequest({ status = 200, headers = { 'content-type': 'text/html' }, content = '<h1>Recipe</h1>', inspect = () => {} } = {}) {
  return (_url, options, callback) => {
    inspect(options);
    const request = new EventEmitter();
    request.end = () => setImmediate(() => {
      const response = Readable.from([Buffer.from(content)]);
      response.statusCode = status; response.headers = headers; callback(response);
    });
    return request;
  };
}

test('recipe fetch pins the DNS answer and validates every redirect before connecting', async () => {
  let lookups = 0;
  const resolveHost = async () => { lookups++; return [{ address: '93.184.216.34', family: 4 }]; };
  const result = await fetchPublicHtml('https://example.com/recipe', { resolveHost, requestFor: () => fakeRequest({ inspect: options => options.lookup('example.com', { all: true }, (_error, addresses) => assert.equal(addresses[0].address, '93.184.216.34')) }) });
  assert.match(result.html, /Recipe/);
  assert.equal(lookups, 1);
  await assert.rejects(fetchPublicHtml('https://example.com/recipe', { resolveHost, requestFor: () => fakeRequest({ status: 302, headers: { location: 'http://127.0.0.1/admin' } }) }), ImportError);
  await assert.rejects(fetchPublicHtml('https://example.com/recipe', { resolveHost: async () => [{ address: '10.0.0.1', family: 4 }] }), ImportError);
  await assert.rejects(fetchPublicHtml('https://example.com/recipe', { resolveHost, requestFor: () => fakeRequest({ status: 403 }) }), /HTTP 403/);
});

test('per-unit calories and imperial shopping amounts calculate', () => {
  assert.equal(nutritionFor({ servings: 2, ingredients: [{ quantity: 2, unit: 'piece', kcalPerUnit: 100 }] }).perServing, 100);
  assert.ok(Math.abs(shoppingList([{ id: 1, servings: 1, title: 'Oats', ingredients: [{ name: 'Oats', unit: 'oz', quantity: 1 }] }], [{ recipeId: 1, servings: 1 }])[0].quantity - 28.349523125) < 0.00001);
});

test('imported source calories scale with servings, and unsafe recipe fields are rejected', () => {
  const recipe = extractHtml(html, 'https://example.com/shake').recipe;
  assert.equal(recipe.sourceCaloriesPerServing, 220);
  assert.equal(nutritionFor(recipe, 3).total, 660);
  assert.throws(() => validateRecipe({ ...recipe, category: 'Dessert' }), ValidationError);
  assert.throws(() => validateRecipe({ ...recipe, sourceUrl: 'javascript:alert(1)' }), ValidationError);
});

test('demo HTTP imports create reviewable drafts without saving, and failed imports allow a paste fallback', async () => {
  const { server } = createApp({ fetchHtml: async url => {
    if (url.includes('blocked')) throw new ImportError('Website blocked importing.');
    return { html, url };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/import`;
  const request = input => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  try {
    let response = await request({ url: 'https://example.com/recipe' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).recipe.category, 'Shake');
    response = await request({ url: 'https://example.com/blocked' });
    assert.equal(response.status, 422);
    response = await request({ text });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).recipe.instructions.length, 2);
    assert.equal((await request({ text: 'No recipe' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
