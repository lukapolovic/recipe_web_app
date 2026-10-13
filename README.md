# Pantry — recipe web app

A local recipe collection and meal planner, built with Node.js, SQLite, HTML/CSS/JavaScript and Cheerio for recipe-page parsing.

## Run

Install **Node.js 22.5 or newer**, then:

```sh
cd /Users/Luka/Documents/recipe_web_app
npm install
npm start
```

Open **http://127.0.0.1:3000**. Stop the server with Ctrl+C. `npm run dev` restarts it when source files change; refresh the browser after frontend changes. Node 22 prints an experimental SQLite warning; the startup scripts include the required flag.

## Features

- Add, view, edit, and delete recipes saved in SQLite.
- Search recipe titles and ingredients. The only meal filters are **Breakfast, Lunch, Snack, Shake, Dinner**, plus an All recipes reset.
- Add recipes from a **public website link**, **pasted text**, or **manual entry**.
- Imports keep ingredients and instructions, remove article/advertising text, and open an editable draft before saving. Instructions display as bullet points.
- Ingredient quantities support fractions, metric weights/volumes, US cups/spoons and ounces/pounds. Ambiguous package sizes and missing amounts require review, rather than guessing.
- Calories use the source website's per-serving estimate when available. Otherwise, USDA FoodData Central is queried for ingredient estimates. You can also choose **Estimate calories** in the recipe editor.
- Scale servings, build a meal cart, generate a combined shopping list, check off items, download text, or print unchecked items.
- Six editable example recipes are available through **Load examples** on an empty collection.

## Recipe imports

**Add recipe → From a link** reads Schema.org Recipe JSON-LD first, then microdata or recognizable recipe-card/Ingredients/Instructions sections. Only public HTTP/HTTPS pages are accepted. Redirects and DNS destinations are checked; local/private networks cannot be requested. Pages are limited to 4 MB and 15 seconds. Page scripts are never executed, and the importer does not bypass site blocks, logins or paywalls.

Some sites block automated access or render their recipe only in JavaScript. If importing fails, choose **Paste text**, including Ingredients and Instructions (or Directions/Method) headings. The parser is deterministic and does not use an AI service. For messy text without clear sections, paste the recipe into the Codex chat for cleanup, then paste the cleaned version into the app.

Review the recipe title, meal type, base servings, time, ingredient names/quantities, and calorie matches before saving. The importer defaults unknown servings to 2 and unknown time to 30 minutes and flags these defaults. Unparsed quantities remain blank and must be entered or the ingredient removed before saving. Recipe import itself never saves a recipe to the database.

The original source link is retained. Source calorie values are marked **source estimate**. Changing ingredient names, quantities, units, calorie values, or base servings clears the old source calorie estimate, so edited recipes cannot keep a stale total. Cooking instructions stay as written when servings change; adjust equipment and cooking times yourself.

## Calories and USDA access

Pantry automatically uses USDA's public **DEMO_KEY** for initial testing. It is limited to **30 requests per hour and 50 per day per IP**. Search plus portion lookup may use two requests per ingredient. For regular use, get a free personal key at <https://fdc.nal.usda.gov/api-key-signup>, copy `.env.example` to `.env`, and set:

```text
USDA_API_KEY=your_key_here
```

Restart the server after changing `.env`. This file is excluded from Git. Keys are used only by the server; they are never sent to the browser. Ingredient names are sent to USDA when looking up calories. Source estimates need no USDA lookup. Source/USDA calls require an internet connection; saved recipes and meal planning work offline while the local server runs.

Nutrition behavior:

- Values are estimates. Matched food descriptions and portion assumptions appear in the editor for review.
- USDA matches use Foundation/SR Legacy foods. Generic ambiguous ingredients such as “milk” or “flour” need a more specific name or manual calorie values.
- Weight units (`g`, `kg`, `oz`, `lb`) calculate directly from kcal per 100 g.
- Other units calculate only when USDA supplies an unambiguous gram weight for that portion, or when you enter kcal per unit manually. No generic cup-to-gram or ml-to-gram assumptions are made.
- Existing ingredient calorie values are retained. Lookups handle up to 12 missing ingredients at a time and cache food matches in memory for 24 hours.
- Missing matches, API failures and limits keep the draft intact. Missing ingredients are explicitly marked **partial** in totals; they are never represented as zero-calorie ingredients.
- Published website calories are assumed to be per source serving and flagged for review. Individual ingredient values are not reverse-engineered from a published recipe total.
- Example recipe calorie values are illustrative. Dietary labels are user supplied and not verified.

USDA documentation: <https://fdc.nal.usda.gov/api-guide/>. Recipe metadata: <https://schema.org/Recipe>.

## Data and shopping-list rules

Recipes are stored in `data/recipes.sqlite`, which is created automatically and excluded from Git. The meal cart and checked items live in this browser's local storage. Changing a shopping quantity unchecks affected items.

Shopping-list names merge ignoring case and extra spaces. Weights (`g`, `kg`, `oz`, `lb`) combine as grams; volumes (`ml`, `l`) combine as millilitres. Other units remain separate. Ingredient aliases (e.g. “tomato” vs “tomatoes”) are not inferred; use consistent names. Preparation notes are preserved.

Back up `data/` while the server is stopped. Existing databases are migrated automatically to retain recipes and add source information. Old Dessert recipes become Snack; Other becomes Dinner.

Optional settings in `.env` or the process environment: `PORT` (default 3000), `HOST` (default 127.0.0.1), `DATABASE_PATH` (default `data/recipes.sqlite`).

This is a single-user local app with no authentication. Keep the default loopback host. Shared/public deployment needs authentication, backups and suitable hosting/storage.

## Verify

```sh
npm test
```

Tests use temporary databases and mocked external responses. They cover persistence, CRUD, filters, validation, scaling, shopping aggregation, imported source nutrition, structured/heading-based recipe parsing, fractions, blocked/private URLs and redirects, USDA matching, caching, portion ambiguity, rate limits and import API drafts. Live recipe and USDA checks are performed separately, so normal tests do not require internet or consume API limits.

## API

Same-origin JSON endpoints:

- `GET/POST /api/recipes`
- `GET/PUT/DELETE /api/recipes/:id`
- `POST /api/import` with `{ "url": "https://..." }` or `{ "text": "..." }`; returns a recipe draft and review warnings.
- `POST /api/nutrition` with a valid recipe; returns updated ingredients and lookup warnings.
- `POST /api/examples`

Recipe writes are server-validated and use parameterized SQL. The list endpoint retains optional `q`, `category`, `diet`, and `maxMinutes` query parameters for API clients; the UI exposes only the five meal categories and text search.
