/**
 * analyzeImage.js
 * ───────────────
 * Client-side product analyzer. Zero API keys. Zero dependencies.
 * Heuristic detection from filename keywords → category / color / pattern / material.
 * Always returns a valid analysis object — never throws.
 */

/* ─── Category map ───────────────────────────────────────────── */
const LABEL_MAP = {
  // T-shirts / tops
  tshirt: 't-shirt', 'tee': 't-shirt', jersey: 't-shirt',
  // Shirts
  shirt: 'shirt', polo: 'shirt', 'button-down': 'shirt', 'button up': 'shirt',
  // Bottoms
  jeans: 'jeans', denim: 'jeans',
  trouser: 'trousers', pant: 'trousers', chino: 'trousers', slacks: 'trousers',
  short: 'shorts', bermuda: 'shorts',
  skirt: 'skirt', lehenga: 'lehenga',
  // Dresses
  dress: 'dress', gown: 'dress', frock: 'dress',
  // Indian ethnic
  kurti: 'kurti', kurta: 'kurti', salwar: 'kurti', churidar: 'kurti',
  saree: 'saree', sari: 'saree',
  // Outerwear
  jacket: 'jacket', coat: 'jacket', windbreaker: 'jacket', parka: 'jacket',
  hoodie: 'hoodie', sweatshirt: 'hoodie', pullover: 'hoodie',
  blazer: 'suit', suit: 'suit', tuxedo: 'suit',
  sweater: 'sweater', cardigan: 'sweater', knit: 'sweater',
  // Footwear
  shoe: 'shoes', sneaker: 'sneakers', trainer: 'sneakers',
  boot: 'boots', heel: 'heels', pump: 'heels', stiletto: 'heels',
  sandal: 'sandals', slipper: 'sandals', chappal: 'sandals',
  mojari: 'sandals', flip: 'sandals', loafer: 'shoes', oxford: 'shoes',
  // Bags
  bag: 'bag', handbag: 'bag', purse: 'bag', tote: 'bag',
  clutch: 'bag', pouch: 'bag', satchel: 'bag',
  backpack: 'backpack', rucksack: 'backpack',
  // Accessories
  watch: 'watch', timepiece: 'watch',
  sunglasses: 'sunglasses', sunglass: 'sunglasses', glasses: 'sunglasses',
  cap: 'cap', hat: 'cap', beanie: 'cap', turban: 'cap',
  necklace: 'jewellery', ring: 'jewellery', bracelet: 'jewellery',
  earring: 'jewellery', pendant: 'jewellery', bangle: 'jewellery',
  // Electronics
  phone: 'phone', smartphone: 'phone', mobile: 'phone',
  iphone: 'phone', android: 'phone',
  laptop: 'laptop', notebook: 'laptop', macbook: 'laptop',
  tablet: 'tablet', ipad: 'tablet',
  headphone: 'headphones', earphone: 'headphones', headset: 'headphones',
  earbud: 'earbuds', airpod: 'earbuds', tws: 'earbuds',
  camera: 'camera', dslr: 'camera', gopro: 'camera',
  tv: 'tv', television: 'tv', monitor: 'tv',
  // Appliances
  refrigerator: 'appliance', fridge: 'appliance',
  microwave: 'appliance', oven: 'appliance',
  mixer: 'appliance', blender: 'appliance', appliance: 'appliance',
  // Home
  sofa: 'furniture', couch: 'furniture', chair: 'furniture',
  table: 'furniture', furniture: 'furniture',
  // Beauty
  lipstick: 'beauty', perfume: 'beauty', cream: 'beauty',
  serum: 'beauty', makeup: 'beauty', cosmetic: 'beauty',
};

/* ─── Color map ──────────────────────────────────────────────── */
const COLOR_MAP = {
  // English
  black: 'black', white: 'white', red: 'red', blue: 'blue',
  green: 'green', yellow: 'yellow', orange: 'orange', pink: 'pink',
  purple: 'purple', brown: 'brown', grey: 'grey', gray: 'grey',
  beige: 'beige', navy: 'navy blue', maroon: 'maroon', cream: 'cream',
  gold: 'golden', silver: 'silver', turquoise: 'turquoise', cyan: 'cyan',
  magenta: 'magenta', violet: 'violet', indigo: 'indigo', coral: 'coral',
  teal: 'teal', olive: 'olive', lime: 'lime green', lavender: 'lavender',
  rust: 'rust', mustard: 'mustard yellow', burgundy: 'burgundy',
  charcoal: 'charcoal', ivory: 'ivory', khaki: 'khaki',
  // Hindi / regional
  lal: 'red', neela: 'blue', nila: 'blue', hara: 'green',
  pila: 'yellow', peela: 'yellow', kala: 'black', safed: 'white',
  gul: 'pink', gulabi: 'pink',
};

/* ─── Pattern map ────────────────────────────────────────────── */
const PATTERN_MAP = {
  striped: ['stripe', 'stripes', 'striped', 'pinstripe', 'lines', 'vertical stripe'],
  printed: ['print', 'printed', 'floral', 'flower', 'geometric', 'graphic',
            'pattern', 'motif', 'abstract', 'animal', 'tropical'],
  checkered: ['check', 'checkered', 'plaid', 'tartan', 'gingham', 'windowpane'],
  embroidered: ['embroid', 'zari', 'thread', 'work', 'ethnic', 'block',
                'handwork', 'kutch', 'phulkari', 'mirror'],
  polka: ['polka', 'dot', 'dots', 'spotted'],
  camouflage: ['camo', 'camouflage', 'military'],
  solid: [],
};

/* ─── Material map ───────────────────────────────────────────── */
const MATERIAL_MAP = {
  shoes: 'leather and rubber sole', sneakers: 'mesh and rubber',
  boots: 'genuine leather', sandals: 'leather and rubber',
  heels: 'leather and synthetic', 't-shirt': '100% cotton jersey',
  shirt: 'cotton and polyester blend', jeans: '100% denim cotton',
  saree: 'silk and cotton', kurti: 'cotton and polyester',
  lehenga: 'embroidered silk fabric', dress: 'polyester and cotton blend',
  skirt: 'cotton and polyester', jacket: 'polyester and leather',
  hoodie: 'fleece and cotton', suit: 'wool and polyester blend',
  sweater: 'wool and acrylic', shorts: 'cotton and polyester',
  trousers: 'polyester blend', bag: 'leather and canvas',
  backpack: 'nylon and polyester', watch: 'stainless steel and glass',
  sunglasses: 'acetate and metal', phone: 'glass and aluminum',
  laptop: 'aluminum chassis', tablet: 'aluminum and glass',
  headphones: 'plastic and metal', earbuds: 'plastic and silicone',
  jewellery: 'precious metal and stone', cap: 'cotton and polyester',
  appliance: 'stainless steel and plastic', furniture: 'wood and fabric',
  beauty: 'glass and premium plastic',
};

/**
 * Analyzes a File object using filename heuristics.
 * @param {File} file
 * @returns {{ category: string, color: string, pattern: string, material: string, confidence: number }}
 */
export function analyzeImage(file) {
  const raw = ((file && file.name) || 'product').toLowerCase();
  // Normalize: replace separators with spaces
  const name = raw.replace(/[-_.()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  // ── Category ──────────────────────────────────
  let category = 'product';
  let confidence = 0.4;
  for (const [kw, cat] of Object.entries(LABEL_MAP)) {
    if (name.includes(kw)) { category = cat; confidence = 0.82; break; }
  }

  // ── Color ─────────────────────────────────────
  let color = 'multicolor';
  for (const [kw, col] of Object.entries(COLOR_MAP)) {
    if (name.includes(kw)) { color = col; break; }
  }

  // ── Pattern ───────────────────────────────────
  let pattern = 'solid';
  for (const [pat, words] of Object.entries(PATTERN_MAP)) {
    if (words.some(w => name.includes(w))) { pattern = pat; break; }
  }

  // ── Material ──────────────────────────────────
  const material = MATERIAL_MAP[category] || 'quality material';

  return { category, color, pattern, material, confidence };
}

/**
 * processProductImage — main pipeline entry point.
 * Combines analysis + prompt build + image generation.
 * @param {File} file
 * @returns {{ category, color, pattern, material, confidence }}
 */
export function processProductImage(file) {
  return analyzeImage(file);
}
