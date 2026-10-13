import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CATEGORIES, UNITS, GRAMS_PER_UNIT } from './public/recipe-config.js';
export { CATEGORIES } from './public/recipe-config.js';
import { examples } from './examples.js';

export const DIETS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free'];
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
  return { title, description, category, diet, servings, minutes, ingredients, instructions, sourceUrl, sourceCaloriesPerServing, color: COLORS.includes(input.color) ? input.color : COLORS[CATEGORIES.indexOf(category) % COLORS.length] };
}

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, diet TEXT NOT NULL,
      servings INTEGER NOT NULL, minutes INTEGER NOT NULL,
      ingredients TEXT NOT NULL, instructions TEXT NOT NULL,
      color TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );`);
  // Additive migrations preserve saved recipes when an existing database is opened.
  const columns = new Set(db.prepare('PRAGMA table_info(recipes)').all().map(column => column.name));
  if (!columns.has('source_url')) db.exec("ALTER TABLE recipes ADD COLUMN source_url TEXT NOT NULL DEFAULT ''");
  if (!columns.has('source_calories')) db.exec('ALTER TABLE recipes ADD COLUMN source_calories REAL');
  db.prepare("UPDATE recipes SET category = 'Snack' WHERE category = 'Dessert'").run();
  db.prepare("UPDATE recipes SET category = 'Dinner' WHERE category = 'Other'").run();
  function decode(row) {
    if (!row) return null;
    return { ...row, sourceUrl: row.source_url, sourceCaloriesPerServing: row.source_calories, ingredients: JSON.parse(row.ingredients), instructions: JSON.parse(row.instructions) };
  }
  const fields = ['title', 'description', 'category', 'diet', 'servings', 'minutes', 'ingredients', 'instructions', 'color', 'source_url', 'source_calories'];
  function values(recipe) { return fields.map(field => ['ingredients', 'instructions'].includes(field) ? JSON.stringify(recipe[field]) : field === 'source_url' ? recipe.sourceUrl : field === 'source_calories' ? recipe.sourceCaloriesPerServing : recipe[field]); }
  const repository = {
    db,
    list({ q = '', category = '', diet = '', maxMinutes = '' } = {}) {
      const clauses = [], params = [];
      if (q) {
        clauses.push(`(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(recipes.ingredients) WHERE json_extract(value, '$.name') LIKE ? ESCAPE '\\'))`);
        const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
        params.push(pattern, pattern, pattern);
      }
      if (category) { clauses.push('category = ?'); params.push(category); }
      if (diet) { clauses.push('diet = ?'); params.push(diet); }
      if (maxMinutes) {
        const minutes = Number(maxMinutes);
        number(minutes, 'Maximum time', 1, 1440, true);
        clauses.push('minutes <= ?'); params.push(minutes);
      }
      return db.prepare(`SELECT * FROM recipes ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC`).all(...params).map(decode);
    },
    get(id) { return decode(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id)); },
    create(input) {
      const recipe = validateRecipe(input);
      const result = db.prepare(`INSERT INTO recipes (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...values(recipe));
      return repository.get(Number(result.lastInsertRowid));
    },
    update(id, input) {
      const recipe = validateRecipe(input);
      const previous = repository.get(id);
      if (previous && (previous.servings !== recipe.servings || ingredientSignature(previous.ingredients) !== ingredientSignature(recipe.ingredients))) recipe.sourceCaloriesPerServing = null;
      const result = db.prepare(`UPDATE recipes SET ${fields.map(field => `${field} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(...values(recipe), id);
      return result.changes ? repository.get(id) : null;
    },
    remove(id) { return db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0; },
    loadExamples() {
      db.exec('BEGIN');
      try {
        const inserted = [];
        for (const recipe of examples) {
          if (!db.prepare('SELECT id FROM recipes WHERE title = ?').get(recipe.title)) inserted.push(repository.create(recipe));
        }
        db.exec('COMMIT');
        return inserted;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); }
  };
  return repository;
}

export function ingredientSignature(ingredients) {
  return JSON.stringify(ingredients.map(i => [i.name.trim().toLowerCase(), i.quantity, i.unit, i.kcalPer100g ?? null, i.kcalPerUnit ?? null]));
}
