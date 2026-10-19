// Baby recipes by age stage (6-12 months), for Insights -> Recipes.
//
// Safety rules here follow the CDC ("When, What, and How to Introduce
// Solid Foods" and "Foods and Drinks to Avoid or Limit") and the AAP
// (HealthyChildren.org, "When to introduce egg, peanut butter and other
// common food allergens"). Every recipe has no added salt, sugar or honey,
// and allergens only ever appear in baby-safe forms (thinned peanut
// butter, fully cooked egg, plain pasteurized yogurt).

export const STAGES = [
  {
    key: 'purees',
    label: '6 mo',
    name: '6 months',
    texture: 'Smooth purées',
    desc: 'Completely smooth and runny, like thick cream. Single foods first, so you can tell what she likes and spot any reaction.',
  },
  {
    key: 'mashes',
    label: '7–8 mo',
    name: '7–8 months',
    texture: 'Thick mashes',
    desc: 'Thicker, with small soft lumps. Mix foods she has already tried, and keep adding iron-rich foods.',
  },
  {
    key: 'finger',
    label: '9–12 mo',
    name: '9–12 months',
    texture: 'Soft finger foods',
    desc: 'Soft pieces she can pick up herself. Squash-test every piece between your thumb and finger before serving.',
  },
];

export const SAFETY_RULES = [
  'One new food at a time. Wait 3 to 5 days before the next one.',
  "No honey, cow's milk to drink, or juice before 12 months.",
  'No added salt or sugar.',
  'Always sit with her while she eats. Cut round foods small.',
];

// Which stage to open on, from her age in months (decimal). Before 6
// months it still opens on purées, with a readiness note on the page.
export function stageIndexForAge(decimalMonths) {
  if (decimalMonths == null) return 0;
  if (decimalMonths < 7) return 0;
  if (decimalMonths < 9) return 1;
  return 2;
}

const FIRST_TIME = name => [
  `Try ${name} at home, early in the day, so you can watch her for the next 2 hours.`,
  'Hives, vomiting or swelling: stop and call her pediatrician. Trouble breathing or a swollen face: call 911.',
];

export const RECIPES = [
  // ---------- 6 months: smooth purées ----------
  {
    id: 'sweet-potato-puree',
    stage: 0,
    title: 'Sweet potato purée',
    art: 'potato',
    minutes: 25,
    makes: '~8 portions',
    goodFor: 'Vitamin A',
    tags: ['first'],
    texture: 'Completely smooth, no lumps. Runny enough to slide off a tipped spoon.',
    ingredients: ['1 medium sweet potato (about 8 oz)', '2 to 5 tbsp breast milk, formula, or the cooking water'],
    steps: [
      ['Peel and cube', 'Wash, peel and cut the sweet potato into 1-inch cubes so they cook evenly.'],
      ['Steam until very soft', 'Steam 12 to 15 minutes, until a fork slides in with no push. Boiling works too; save the water.'],
      ['Blend smooth', 'Blend with 2 tbsp milk or cooking water. Add 1 tbsp at a time until there are no lumps at all.'],
      ['Cool and test', 'Let it cool to lukewarm. Stir well and test a drop on the inside of your wrist.'],
      ['Start small', 'Offer 1 to 2 teaspoons. Stop when she turns her head or closes her mouth.'],
    ],
    storage: [
      'Fridge: sealed container, up to 3 days.',
      'Freezer: ice-cube tray, then a freezer bag, up to 3 months. Thaw overnight in the fridge.',
      "Spoon a portion into a bowl. Don't feed from the storage container, since her spoon spoils what's left.",
    ],
  },
  {
    id: 'iron-oatmeal',
    stage: 0,
    title: 'Iron-fortified oatmeal',
    art: 'bowl',
    minutes: 3,
    makes: '1 portion',
    goodFor: 'Iron',
    tags: ['iron', 'first'],
    texture: 'Thin and runny at first. Make it a little thicker each week as she gets the hang of it.',
    ingredients: ['1 tbsp iron-fortified infant oat cereal', '4 to 5 tbsp breast milk or formula'],
    steps: [
      ['Warm the milk', "Use milk at room temperature or gently warmed in a bowl of warm water. Don't microwave breast milk."],
      ['Stir in the cereal', 'Sprinkle the cereal into the milk while stirring, so no dry clumps form.'],
      ['Let it settle', 'Wait 1 minute. It thickens as it sits; stir in a little more milk if it gets pasty.'],
      ['Check the temperature', 'Test a drop on the inside of your wrist. It should feel barely warm.'],
      ['Start small', 'Offer 1 to 2 teaspoons. Over the weeks, use less milk for a thicker texture.'],
    ],
    storage: [
      'Make it fresh each time.',
      'Throw away anything left in the bowl she ate from.',
    ],
    note: 'Oat, barley or multigrain cereal is a better everyday pick than rice cereal, which can carry more arsenic.',
  },
  {
    id: 'peanut-oatmeal',
    stage: 0,
    title: 'Peanut oatmeal',
    art: 'bowl-peanut',
    minutes: 5,
    makes: '1 portion',
    goodFor: 'Iron',
    tags: ['allergen-peanut', 'iron'],
    allergen: {
      name: 'peanut',
      notes: ['Severe eczema or an egg allergy? Ask her pediatrician before trying peanut.', ...FIRST_TIME('peanut')],
    },
    texture: 'Smooth and runny, one even color with no streaks of peanut butter.',
    ingredients: [
      '2 tbsp iron-fortified infant oat cereal',
      '4 to 5 tbsp warm breast milk or formula',
      '2 tsp smooth peanut butter, no added salt or sugar',
      '2 to 3 tsp warm water',
    ],
    steps: [
      ['Thin the peanut butter', 'Stir the peanut butter with the warm water until it is runny and smooth, with no thick globs.'],
      ['Make the oatmeal', 'Stir the cereal into the milk until smooth and runny, like thick cream.'],
      ['Mix together', 'Stir the thinned peanut butter into the oatmeal until it is one even color.'],
      ['Offer a tiny taste first', 'Give a little on the tip of the spoon. Wait 10 minutes and watch her. If all is well, feed the rest at her pace.'],
      ['Keep it in her week', 'Once it goes well, keep serving peanut a few times a week. Regular exposure matters.'],
    ],
    storage: ['Make it fresh each time.', 'Throw away anything left in the bowl she ate from.'],
    never: 'Never give whole peanuts or a spoonful of thick peanut butter. Both can choke her.',
  },
  {
    id: 'avocado-mash',
    stage: 0,
    title: 'Avocado mash',
    art: 'avocado',
    minutes: 3,
    makes: '1–2 portions',
    goodFor: 'Healthy fats',
    tags: ['no-cook'],
    texture: 'Smooth and soft. Thin it with milk until it slides off the spoon.',
    ingredients: ['1/4 ripe avocado', '1 to 2 tbsp breast milk or formula'],
    steps: [
      ['Pick a ripe one', 'It should give a little when you press it gently. Hard avocados mash into lumps.'],
      ['Scoop', 'Cut the avocado in half and scoop out about a quarter with a spoon.'],
      ['Mash smooth', 'Mash with a fork until there are no lumps, or blend for a few seconds.'],
      ['Thin it', 'Stir in milk 1 tbsp at a time until it is runny enough for a spoon.'],
      ['Serve right away', 'Avocado browns within minutes once mashed, so make it just before feeding.'],
    ],
    storage: [
      'Best made fresh.',
      'Leftover avocado: keep the pit in, wrap tightly, fridge up to 1 day.',
    ],
  },

  // ---------- 7-8 months: thick mashes ----------
  {
    id: 'lentil-carrot-mash',
    stage: 1,
    title: 'Red lentil & carrot mash',
    art: 'carrot',
    minutes: 25,
    makes: '~6 portions',
    goodFor: 'Iron, protein',
    tags: ['iron'],
    texture: 'Thick, with small soft lumps that melt on the tongue.',
    ingredients: ['1/4 cup dried red lentils', '1 medium carrot', '1 cup water'],
    steps: [
      ['Rinse the lentils', 'Rinse in a sieve until the water runs clear. Pick out any tiny stones.'],
      ['Dice the carrot', 'Peel the carrot and cut it into small 1/2-inch pieces.'],
      ['Simmer', 'Simmer lentils, carrot and water, covered, for 15 to 20 minutes, until the lentils fall apart and the carrot is fork-soft. Add a splash of water if it dries out.'],
      ['Mash', 'Mash with a fork, leaving small soft lumps. If she is new to lumps, blend it briefly first.'],
      ['Cool and test', 'Let it cool to lukewarm and test a drop on your wrist before serving.'],
    ],
    storage: [
      'Fridge: sealed container, up to 3 days.',
      'Freezer: ice-cube tray, then a freezer bag, up to 3 months.',
    ],
  },
  {
    id: 'scrambled-egg',
    stage: 1,
    title: 'Soft scrambled egg',
    art: 'egg',
    minutes: 5,
    makes: '1 portion',
    goodFor: 'Protein, iron',
    tags: ['allergen-egg', 'iron'],
    allergen: { name: 'egg', notes: FIRST_TIME('egg') },
    texture: 'Fully cooked, then mashed into small soft pieces. No wet or runny egg.',
    ingredients: [
      '1 egg',
      '1 tsp unsalted butter or oil',
      '1 tbsp breast milk or formula (optional, for a softer mash)',
    ],
    steps: [
      ['Whisk', 'Whisk the egg (and milk, if using) until the yolk and white are fully mixed.'],
      ['Cook low and slow', 'Melt the butter over low heat, pour in the egg and stir gently.'],
      ['Cook it all the way', 'Keep stirring until there are no wet or shiny parts left. Fully cooked egg is the safe way for babies.'],
      ['Mash', 'Mash with a fork into small soft pieces. Stir in a little milk if it seems dry.'],
      ['Start small', 'Begin with a teaspoon or two. Over time she can work up to about a third of an egg.'],
    ],
    storage: ['Best served fresh.', 'Fridge: sealed container, up to 3 days.'],
  },
  {
    id: 'banana-yogurt',
    stage: 1,
    title: 'Banana yogurt mash',
    art: 'banana',
    minutes: 3,
    makes: '1 portion',
    goodFor: 'Calcium',
    tags: ['allergen-dairy', 'no-cook'],
    allergen: { name: 'dairy', notes: FIRST_TIME('yogurt') },
    texture: 'Thick and creamy with small soft banana lumps.',
    ingredients: ['1/2 ripe banana', '2 tbsp plain whole-milk yogurt, pasteurized, no added sugar'],
    steps: [
      ['Mash the banana', 'Mash with a fork, leaving small soft lumps. Very ripe, spotty bananas mash best.'],
      ['Stir in yogurt', 'Fold in the yogurt until creamy.'],
      ['Serve', 'Serve right away. Yogurt is fine before 12 months; cow’s milk as a drink is not.'],
    ],
    storage: ['Make it fresh. Banana browns quickly once mashed.'],
  },

  // ---------- 9-12 months: soft finger foods ----------
  {
    id: 'banana-oat-pancakes',
    stage: 2,
    title: 'Banana oat pancakes',
    art: 'pancake',
    minutes: 15,
    makes: '8 mini pancakes',
    goodFor: 'Energy',
    tags: ['finger', 'allergen-egg'],
    allergen: { name: 'egg', notes: ["Only once she has already had egg without a reaction."] },
    texture: 'Soft and springy, cut into strips she can hold.',
    ingredients: ['1 ripe banana', '1 egg', '1/4 cup quick oats', '1 tsp unsalted butter or oil'],
    steps: [
      ['Make the batter', 'Blend the banana, egg and oats until smooth. Or mash the banana, whisk in the egg, and stir in the oats.'],
      ['Let it rest', 'Wait 5 minutes so the oats soften and the batter thickens.'],
      ['Cook small', 'Heat a pan on medium-low with the butter. Spoon in 1 tbsp of batter per pancake.'],
      ['Flip and finish', 'Cook about 2 minutes until the edges set, flip, then 1 to 2 minutes more until there is no wet batter inside.'],
      ['Cut to size', 'Cool, then cut into strips about the size of your finger so she can hold them.'],
    ],
    storage: [
      'Fridge: sealed container, up to 3 days.',
      'Freezer: up to 2 months, with parchment between pancakes. Warm through and cool before serving.',
    ],
  },
  {
    id: 'roasted-veggie-sticks',
    stage: 2,
    title: 'Soft roasted veggie sticks',
    art: 'sticks',
    minutes: 35,
    makes: '2–3 portions',
    goodFor: 'Vitamins A & C',
    tags: ['finger'],
    texture: 'Very soft. Each stick should squash easily between your thumb and finger.',
    ingredients: ['1 medium sweet potato', '1 zucchini', '1 tsp olive oil'],
    steps: [
      ['Heat the oven', 'Heat the oven to 400°F and line a tray with parchment.'],
      ['Cut into sticks', 'Peel the sweet potato. Cut it and the zucchini into sticks about the size of your finger.'],
      ['Oil, no salt', 'Toss the sticks with the oil. Skip the salt.'],
      ['Roast until soft', 'Roast 25 to 30 minutes, turning halfway, until very soft all the way through.'],
      ['Squash test', 'Cool, then press each stick between your thumb and finger. If any stick resists, roast a few more minutes.'],
    ],
    storage: ['Fridge: sealed container, up to 3 days. Serve cool or barely warm.'],
  },
  {
    id: 'turkey-meatballs',
    stage: 2,
    title: 'Turkey & veggie mini meatballs',
    art: 'balls',
    minutes: 30,
    makes: '~16 meatballs',
    goodFor: 'Iron, protein',
    tags: ['finger', 'iron'],
    texture: 'Soft and moist. Cut into small pieces or press flat. Round foods are a choking risk.',
    ingredients: [
      '1/2 lb ground turkey',
      '1/4 cup grated zucchini, squeezed dry',
      '1/4 cup finely grated carrot',
      '2 tbsp quick oats',
    ],
    steps: [
      ['Heat the oven', 'Heat the oven to 400°F and line a tray with parchment.'],
      ['Mix gently', 'Mix everything with clean hands until just combined. Overmixing makes them tough.'],
      ['Roll small', 'Roll into 1-inch balls, about 16 in total, and space them out on the tray.'],
      ['Bake through', 'Bake 15 to 18 minutes, until the inside reaches 165°F on a thermometer with no pink left.'],
      ['Cut before serving', 'Cool, then cut each one into quarters or press it flat. Never serve them whole and round.'],
    ],
    storage: [
      'Fridge: sealed container, up to 3 days.',
      'Freezer: up to 3 months.',
      'Wash hands, boards and counters after touching raw turkey.',
    ],
  },
];

export const TAGS = {
  first: { text: 'Great first food', tone: 'ok' },
  'no-cook': { text: 'No cooking', tone: 'ok' },
  iron: { text: 'Iron', tone: 'iron' },
  finger: { text: 'Finger food', tone: 'pink' },
  'allergen-peanut': { text: 'Allergen: peanut', tone: 'allergen' },
  'allergen-egg': { text: 'Allergen: egg', tone: 'allergen' },
  'allergen-dairy': { text: 'Allergen: dairy', tone: 'allergen' },
};

export function recipesForStage(stage) {
  return RECIPES.filter(r => r.stage === stage);
}

export function recipeById(id) {
  return RECIPES.find(r => r.id === id) || null;
}
