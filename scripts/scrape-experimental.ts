import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

const pageName = 'Item_Qualities/Experimental';
const apiRoot = 'https://typicalcolors2.fandom.com/api.php';
const classes = ['Flanker', 'Trooper', 'Arsonist', 'Annihilator', 'Brute', 'Mechanic', 'Doctor', 'Marksman', 'Agent'] as const;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(projectRoot, 'public', 'images', 'experimental-generated');
const outputFile = path.join(projectRoot, 'src', 'data', 'experimental.generated.ts');

type ClassName = typeof classes[number];
type Slot = 'Primary' | 'Secondary' | 'Melee' | 'PDA';
type Item = { className: ClassName; name: string; imageUrl: string; page: string; slot?: Slot };

const clean = (value = '') => value.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
const slug = (value: string) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normalizeImageUrl(image: Element | null): string {
  const raw = image?.getAttribute('data-src') || image?.getAttribute('src') || '';
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw.startsWith('/') ? `https://typicalcolors2.fandom.com${raw}` : raw;
  if (!absolute.includes('static.wikia.nocookie.net')) return absolute;
  const url = new URL(absolute);
  const revision = url.pathname.indexOf('/revision/latest');
  if (revision >= 0) url.pathname = url.pathname.slice(0, revision + '/revision/latest'.length);
  url.search = '';
  return url.toString();
}

async function fetchRenderedPage(page: string): Promise<{ html: string; categories: string[] }> {
  const url = `${apiRoot}?action=parse&page=${encodeURIComponent(page)}&prop=text|categories&format=json&origin=*`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TC2 wiki request failed with ${response.status}: ${page}`);
  const json = await response.json() as { parse?: { text?: { '*': string }; categories?: Array<{ '*': string }> } };
  const html = json.parse?.text?.['*'];
  if (!html) throw new Error(`TC2 wiki returned no rendered HTML for ${page}.`);
  return { html, categories: json.parse?.categories?.map((category) => category['*']) || [] };
}

function parseItems(html: string): Item[] {
  const document = new JSDOM(html).window.document;
  const table = [...document.querySelectorAll('table.wikitable')]
    .find((candidate) => candidate.textContent?.includes('Experimental quality items'));
  if (!table) throw new Error('Experimental items table was not found.');

  const items: Item[] = [];
  let currentClass: ClassName | undefined;
  table.querySelectorAll('tr').forEach((row) => {
    [...row.children].forEach((cell) => {
      const text = clean(cell.textContent || '');
      const className = classes.find((name) => text === name);
      if (className) { currentClass = className; return; }
      if (!currentClass || cell.tagName !== 'TD') return;
      const links = [...cell.querySelectorAll("a[href*='/wiki/']")];
      const weaponLink = links.findLast((link) => clean(link.textContent || link.getAttribute('title') || '') === text);
      const imageUrl = normalizeImageUrl(cell.querySelector('img'));
      const page = weaponLink?.getAttribute('title') || text;
      if (text && page && imageUrl) items.push({ className: currentClass, name: text, imageUrl, page });
    });
  });
  return [...new Map(items.map((item) => [`${item.className}\0${item.name}`, item])).values()];
}

function slotFromCategories(categories: string[]): Slot | undefined {
  const normalized = categories.map((category) => category.replace(/_/g, ' '));
  if (normalized.some((category) => /Primary Weapons/i.test(category))) return 'Primary';
  if (normalized.some((category) => /Secondary Weapons/i.test(category))) return 'Secondary';
  if (normalized.some((category) => /Melee Weapons/i.test(category))) return 'Melee';
  if (normalized.some((category) => /PDA Weapons/i.test(category))) return 'PDA';
}

async function addSlots(items: Item[]): Promise<Array<Item & { slot: Slot }>> {
  return Promise.all(items.map(async (item) => {
    const { categories } = await fetchRenderedPage(item.page);
    const slot = slotFromCategories(categories);
    if (!slot) throw new Error(`Could not determine a slot for ${item.name} from its wiki categories.`);
    return { ...item, slot };
  }));
}

async function generate() {
  const { html } = await fetchRenderedPage(pageName);
  const items = await addSlots(parseItems(html));
  if (items.length < 15) throw new Error(`Refusing to replace experimental data: only ${items.length} items were scraped.`);

  await mkdir(assetDirectory, { recursive: true });
  const expectedFiles = new Set<string>();
  const localized = await Promise.all(items.map(async (item) => {
    const hash = createHash('sha1').update(item.imageUrl).digest('hex').slice(0, 10);
    const file = `${slug(item.name)}-${hash}.webp`;
    expectedFiles.add(file);
    const response = await fetch(item.imageUrl);
    if (!response.ok) throw new Error(`Image request failed with ${response.status}: ${item.imageUrl}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path.join(assetDirectory, file), await sharp(bytes).webp({ quality: 85, effort: 5 }).toBuffer());
    return { ...item, image: `images/experimental-generated/${file}` };
  }));

  const catalog = Object.fromEntries(classes.map((className) => [className, {}])) as Record<string, Record<string, unknown[]>>;
  localized.forEach((item) => {
    catalog[item.className][item.slot] ||= [];
    catalog[item.className][item.slot].push({ name: item.name, image: item.image });
  });
  await Promise.all((await readdir(assetDirectory)).filter((file) => !expectedFiles.has(file)).map((file) => rm(path.join(assetDirectory, file))));

  const source = `// Generated by pnpm scrape:experimental. Do not edit manually.\n\nimport type { PartialWeaponCatalog } from '../data';\n\nexport const experimentalWeapons: PartialWeaponCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
  await writeFile(outputFile, source, 'utf8');
  console.log(`Generated ${localized.length} experimental weapons in ${path.relative(projectRoot, outputFile)}.`);
}

await generate();
