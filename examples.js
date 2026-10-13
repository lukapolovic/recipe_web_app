// Optional starter recipes, added only when the user chooses "Load examples".
export const examples = [
  {
    title: 'Lemon & chickpea bowl', description: 'A bright, everyday bowl with crunchy cucumber, creamy feta and a lemon dressing.',
    category: 'Lunch', diet: 'Vegetarian', minutes: 20, servings: 2,
    ingredients: [
      { name: 'Chickpeas, cooked', quantity: 400, unit: 'g', kcalPer100g: 164 },
      { name: 'Cucumber', quantity: 200, unit: 'g', kcalPer100g: 15 },
      { name: 'Feta', quantity: 80, unit: 'g', kcalPer100g: 265 },
      { name: 'Olive oil', quantity: 20, unit: 'g', kcalPer100g: 884 },
      { name: 'Lemon', quantity: 1, unit: 'piece', note: 'juice and zest' }
    ],
    instructions: ['Drain and rinse the chickpeas. Dice the cucumber and crumble the feta.', 'Whisk olive oil with lemon juice and zest. Season to taste.', 'Toss everything together and serve.'], color: 'sage'
  },
  {
    title: 'Roasted tomato pasta', description: 'Sweet roasted tomatoes, garlic and basil. A little effort, a very good dinner.',
    category: 'Dinner', diet: 'Vegan', minutes: 35, servings: 4,
    ingredients: [
      { name: 'Pasta, dry', quantity: 400, unit: 'g', kcalPer100g: 371 },
      { name: 'Cherry tomatoes', quantity: 600, unit: 'g', kcalPer100g: 18 },
      { name: 'Olive oil', quantity: 30, unit: 'g', kcalPer100g: 884 },
      { name: 'Garlic', quantity: 4, unit: 'piece', note: 'cloves, peeled' },
      { name: 'Basil', quantity: 10, unit: 'g', kcalPer100g: 23 }
    ], instructions: ['Heat the oven to 200°C. Toss tomatoes and garlic with olive oil in a roasting dish.', 'Roast for 25 minutes, until the tomatoes soften and burst.', 'Cook the pasta according to the packet. Reserve a little cooking water, then drain.', 'Mash the roasted garlic and tomatoes. Toss with pasta, basil and a splash of pasta water.'], color: 'peach'
  },
  {
    title: 'Blueberry overnight oats', description: 'Make breakfast the night before. Cool, creamy oats with a handful of berries.',
    category: 'Breakfast', diet: 'Vegetarian', minutes: 10, servings: 2,
    ingredients: [
      { name: 'Rolled oats', quantity: 100, unit: 'g', kcalPer100g: 389 },
      { name: 'Milk', quantity: 250, unit: 'ml' },
      { name: 'Greek yogurt', quantity: 150, unit: 'g', kcalPer100g: 97 },
      { name: 'Blueberries', quantity: 100, unit: 'g', kcalPer100g: 57 },
      { name: 'Honey', quantity: 15, unit: 'g', kcalPer100g: 304 }
    ], instructions: ['Mix the oats, milk, yogurt and honey in two jars.', 'Cover and refrigerate for at least 6 hours or overnight (in addition to the 10-minute prep time).', 'Top with blueberries before serving.'], color: 'lavender'
  },
  {
    title: 'Ginger chicken & rice', description: 'A comforting one-pan chicken dinner with fresh ginger and tender broccoli.',
    category: 'Dinner', diet: 'None', minutes: 30, servings: 3,
    ingredients: [
      { name: 'Chicken breast', quantity: 450, unit: 'g', kcalPer100g: 120 },
      { name: 'Rice, dry', quantity: 225, unit: 'g', kcalPer100g: 365 },
      { name: 'Broccoli', quantity: 300, unit: 'g', kcalPer100g: 34 },
      { name: 'Ginger', quantity: 20, unit: 'g', kcalPer100g: 80 },
      { name: 'Soy sauce', quantity: 2, unit: 'tbsp' },
      { name: 'Olive oil', quantity: 15, unit: 'g', kcalPer100g: 884 }
    ], instructions: ['Cook the rice according to the packet.', 'Slice the chicken and grate the ginger. Cut the broccoli into small florets.', 'Heat oil in a pan. Cook chicken and ginger, then add broccoli, soy sauce and a splash of water.', 'Cover and cook until the broccoli is tender and the chicken reaches 74°C in the center. Serve over rice.'], color: 'sand'
  },
  {
    title: 'Creamy mushroom toast', description: 'Golden mushrooms over crisp sourdough, finished with a spoon of yogurt.',
    category: 'Lunch', diet: 'Vegetarian', minutes: 15, servings: 2,
    ingredients: [
      { name: 'Mushrooms', quantity: 300, unit: 'g', kcalPer100g: 22 },
      { name: 'Sourdough bread', quantity: 160, unit: 'g', kcalPer100g: 250 },
      { name: 'Greek yogurt', quantity: 60, unit: 'g', kcalPer100g: 97 },
      { name: 'Olive oil', quantity: 15, unit: 'g', kcalPer100g: 884 },
      { name: 'Garlic', quantity: 1, unit: 'piece', note: 'clove, minced' }
    ], instructions: ['Slice the mushrooms. Heat oil in a pan and fry mushrooms until golden.', 'Add the garlic and cook for another minute. Remove from heat and stir in yogurt.', 'Toast the bread and spoon the mushrooms over it. Season to taste.'], color: 'sand'
  },
  {
    title: 'Peanut butter energy bites', description: 'A small, no-bake treat for the afternoon. Keep a batch in the fridge.',
    category: 'Snack', diet: 'Vegan', minutes: 15, servings: 6,
    ingredients: [
      { name: 'Rolled oats', quantity: 120, unit: 'g', kcalPer100g: 389 },
      { name: 'Peanut butter', quantity: 100, unit: 'g', kcalPer100g: 588 },
      { name: 'Maple syrup', quantity: 50, unit: 'g', kcalPer100g: 260 },
      { name: 'Dark chocolate', quantity: 40, unit: 'g', kcalPer100g: 598 }
    ], instructions: ['Finely chop the chocolate. Mix with oats, peanut butter and maple syrup.', 'Roll into 12 small balls (2 per serving).', 'Chill for 30 minutes to firm up, in addition to the prep time. Keep refrigerated.'], color: 'peach'
  }
];
