import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

const wikiApi = 'https://typicalcolors2.fandom.com/api.php?action=parse&page=Weapons&prop=text&format=json&origin=*';
const experimentalWikiApi = 'https://typicalcolors2.fandom.com/api.php?action=parse&page=Item_Qualities/Experimental&prop=text&format=json&origin=*';
const classes = ['Flanker', 'Trooper', 'Arsonist', 'Annihilator', 'Brute', 'Mechanic', 'Doctor', 'Marksman', 'Agent'] as const;
const slots = ['Primary', 'Secondary', 'Melee', 'PDA'] as const;
// Fixed utility slots have no alternatives to randomize.
const excludedWeapons = new Set(['disguise kit', 'construct', 'demolish']);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDirectory = path.join(projectRoot, 'public', 'images', 'weapons-generated');
const outputFile = path.join(projectRoot, 'src', 'data', 'weapons.generated.ts');

type ClassName = typeof classes[number];
type Slot = typeof slots[number];
type Weapon = { name: string; image: string; stock?: boolean };
type Catalog = Record<ClassName, Partial<Record<Slot, Weapon[]>>>;

const clean = (value = '') => value.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
const slug = (value: string) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function imageUrl(image: Element | null): string {
  const raw = image?.getAttribute('data-src') || image?.getAttribute('src') || '';
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw.startsWith('/') ? `https://typicalcolors2.fandom.com${raw}` : raw;
  if (!absolute.includes('static.wikia.nocookie.net')) return absolute;
  const url = new URL(absolute);
  const revision = url.pathname.indexOf('/revision/latest');
  if (revision >= 0) url.pathname = url.pathname.slice(0, revision + '/revision/latest'.length);
  url.search = '';
  return url.toString();
}

function tableGrid(table: Element): Element[][] {
  const grid: Element[][] = [];
  [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')].forEach((row, rowIndex) => {
    grid[rowIndex] ||= [];
    let column = 0;
    [...row.children].forEach((cell) => {
      while (grid[rowIndex][column]) column += 1;
      const rowSpan = Number(cell.getAttribute('rowspan') || 1);
      const colSpan = Number(cell.getAttribute('colspan') || 1);
      for (let y = 0; y < rowSpan; y += 1) {
        grid[rowIndex + y] ||= [];
        for (let x = 0; x < colSpan; x += 1) grid[rowIndex + y][column + x] = cell;
      }
      column += colSpan;
    });
  });
  return grid;
}

function weaponFromCell(cell: Element): { name: string; remoteImage: string; stock: boolean } | null {
  const links = [...cell.querySelectorAll("a[href*='/wiki/']")]
    .filter((link) => !/File:|Special:|Category:|Template:/i.test(`${link.getAttribute('href')} ${link.getAttribute('title')}`));
  const link = links.at(-1);
  const name = clean(link?.textContent || link?.getAttribute('title') || '');
  const remoteImage = imageUrl(cell.querySelector('img'));
  return name && remoteImage ? { name, remoteImage, stock: /\bStock\b/.test(cell.textContent || '') } : null;
}

async function scrape(): Promise<Array<{ classNames: string[]; slot: Slot; name: string; remoteImage: string; stock: boolean }>> {
  const [response, experimentalResponse] = await Promise.all([fetch(wikiApi), fetch(experimentalWikiApi)]);
  if (!response.ok) throw new Error(`TC2 wiki request failed with ${response.status}`);
  if (!experimentalResponse.ok) throw new Error(`TC2 experimental wiki request failed with ${experimentalResponse.status}`);
  const json = await response.json() as { parse?: { text?: { '*': string } } };
  const experimentalJson = await experimentalResponse.json() as { parse?: { text?: { '*': string } } };
  const html = json.parse?.text?.['*'];
  if (!html) throw new Error('TC2 wiki returned no rendered HTML.');

  const document = new JSDOM(html).window.document;
  const experimentalDocument = new JSDOM(experimentalJson.parse?.text?.['*'] || '').window.document;
  const experimentalTable = [...experimentalDocument.querySelectorAll('table.wikitable')]
    .find((table) => table.textContent?.includes('Experimental quality items'));
  if (!experimentalTable) throw new Error('Could not identify Experimental-quality items while scraping normal weapons.');
  const experimentalNames = new Set(
    [...experimentalTable.querySelectorAll('td')]
      .map((cell) => clean(cell.textContent || ''))
      .filter((name) => name && !classes.includes(name as ClassName)),
  );
  const output = document.querySelector('.mw-parser-output') || document.body;
  const weapons: Array<{ classNames: string[]; slot: Slot; name: string; remoteImage: string; stock: boolean }> = [];
  let currentClasses: string[] = [];
  let currentSlot: Slot | null = null;
  let inWeaponList = false;

  [...output.children].forEach((element) => {
    const heading = clean(element.textContent || '');
    if (element.tagName === 'H2') {
      if (/Weapons List/i.test(heading)) inWeaponList = true;
      if (/Trivia|Community-Only/i.test(heading)) inWeaponList = false;
      const className = classes.find((name) => heading.includes(name));
      if (className) { currentClasses = [className]; currentSlot = null; inWeaponList = true; }
      if (/All Classes/i.test(heading)) { currentClasses = [...classes]; currentSlot = null; inWeaponList = true; }
    }
    if (!inWeaponList) return;
    if (element.tagName === 'H3') currentSlot = slots.find((slot) => heading.includes(slot)) || currentSlot;
    if (element.tagName !== 'TABLE' || !element.classList.contains('wikitable') || !currentSlot || !currentClasses.length) return;

    const grid = tableGrid(element);
    const headerIndex = grid.findIndex((row) => row.some((cell) => cell.tagName === 'TH'));
    const headers = (grid[headerIndex] || []).map((cell) => clean(cell.textContent || '').toLowerCase());
    const weaponColumn = Math.max(0, headers.findIndex((text) => /^(weapon|item)$|weapon name/.test(text)));
    grid.slice(Math.max(0, headerIndex + 1)).forEach((row) => {
      const weapon = row[weaponColumn] && weaponFromCell(row[weaponColumn]);
      if (weapon) weapons.push({ ...weapon, classNames: currentClasses, slot: currentSlot! });
    });
  });

  const allowedWeapons = weapons.filter((weapon) => (
    !excludedWeapons.has(weapon.name.toLowerCase()) && !experimentalNames.has(weapon.name)
  ));
  const unique = [...new Map(allowedWeapons.map((weapon) => [`${weapon.name}\0${weapon.slot}\0${weapon.classNames.join()}`, weapon])).values()];
  if (unique.length < 100) throw new Error(`Refusing to replace generated data: only ${unique.length} weapons were scraped.`);
  return unique;
}

async function localize(weapons: Awaited<ReturnType<typeof scrape>>): Promise<Catalog> {
  await mkdir(assetDirectory, { recursive: true });
  const files = new Set<string>();
  const imageByUrl = new Map<string, string>();
  let cursor = 0;

  async function worker() {
    while (cursor < weapons.length) {
      const weapon = weapons[cursor++];
      if (imageByUrl.has(weapon.remoteImage)) continue;
      const hash = createHash('sha1').update(weapon.remoteImage).digest('hex').slice(0, 10);
      const file = `${slug(weapon.name)}-${hash}.webp`;
      const response = await fetch(weapon.remoteImage);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}: ${weapon.remoteImage}`);
      const webp = await sharp(Buffer.from(await response.arrayBuffer())).webp({ quality: 85, effort: 5 }).toBuffer();
      await writeFile(path.join(assetDirectory, file), webp);
      files.add(file);
      imageByUrl.set(weapon.remoteImage, `images/weapons-generated/${file}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  const catalog = Object.fromEntries(classes.map((className) => [className, {}])) as Catalog;
  weapons.forEach((weapon) => weapon.classNames.forEach((className) => {
    if (!classes.includes(className as ClassName)) return;
    const target = catalog[className as ClassName];
    target[weapon.slot] ||= [];
    if (!target[weapon.slot]!.some((item) => item.name === weapon.name)) {
      target[weapon.slot]!.push({ name: weapon.name, image: imageByUrl.get(weapon.remoteImage)!, ...(weapon.stock ? { stock: true } : {}) });
    }
  }));
  Object.values(catalog).forEach((classWeapons) => Object.values(classWeapons).forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name))));

  await Promise.all((await readdir(assetDirectory)).filter((file) => !files.has(file)).map((file) => rm(path.join(assetDirectory, file))));
  return catalog;
}

const scraped = await scrape();
const catalog = await localize(scraped);
const source = `// Generated by pnpm scrape. Do not edit manually.\n\nimport type { WeaponCatalog } from '../data';\n\nexport const weapons: WeaponCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
await writeFile(outputFile, source, 'utf8');
console.log(`Generated ${scraped.length} weapon rows in ${path.relative(projectRoot, outputFile)}.`);
