import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Weapon } from '../../src/data';
import { clean, imageUrl, downloadImage } from './images';
import { classes, slots, fetchPage, experimentalTable, type ClassName, type Slot } from './wiki';

// Fixed utility slots have no alternatives to randomize.
const excludedWeapons = new Set(['disguise kit', 'construct', 'demolish']);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetDirectory = path.join(projectRoot, 'public/images/weapons/standard');
const outputFile = path.join(projectRoot, 'src/data/weapons.generated.ts');
type Catalog = Record<string, Partial<Record<Slot, Weapon[]>>>;
type ScrapedWeapon = {
  classNames: ClassName[];
  slot: Slot;
  name: string;
  remoteImage: string;
  stock: boolean;
};

function tableGrid(table: Element): Element[][] {
  // Expand merged cells so column lookup also works in tables with rowspans and colspans.
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

function weaponFromCell(
  cell: Element,
): { name: string; remoteImage: string; stock: boolean } | null {
  const links = [...cell.querySelectorAll("a[href*='/wiki/']")].filter(
    (link) =>
      !/File:|Special:|Category:|Template:/i.test(
        `${link.getAttribute('href')} ${link.getAttribute('title')}`,
      ),
  );
  const link = links.at(-1);
  const name = clean(link?.textContent || link?.getAttribute('title') || '');
  const remoteImage = imageUrl(cell.querySelector('img'));
  return name && remoteImage
    ? { name, remoteImage, stock: /\bStock\b/.test(cell.textContent || '') }
    : null;
}

function readWeaponTable(table: Element) {
  const grid = tableGrid(table);
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.tagName === 'TH'));
  const headers = (grid[headerIndex] ?? []).map((cell) =>
    clean(cell.textContent ?? '').toLowerCase(),
  );
  const weaponColumn = Math.max(
    0,
    headers.findIndex((text) => /^(weapon|item)$|weapon name/.test(text)),
  );
  const weapons = [];
  for (const row of grid.slice(Math.max(0, headerIndex + 1))) {
    const cell = row[weaponColumn];
    const weapon = cell && weaponFromCell(cell);
    if (weapon) weapons.push(weapon);
  }
  return weapons;
}

function readExperimentalNames(document: Document): Set<string> {
  const names = new Set<string>();
  for (const cell of experimentalTable(document).querySelectorAll('td')) {
    const name = clean(cell.textContent ?? '');
    if (name && !classes.some((className) => className === name)) names.add(name);
  }
  return names;
}

function parseWeapons(document: Document, experimentalNames: Set<string>): ScrapedWeapon[] {
  const output = document.querySelector('.mw-parser-output') ?? document.body;
  const weapons = new Map<string, ScrapedWeapon>();
  let currentClasses: ClassName[] = [];
  let currentSlot: Slot | undefined;
  let inWeaponList = false;

  for (const element of output.children) {
    const heading = clean(element.textContent ?? '');
    if (element.tagName === 'H2') {
      if (/Weapons List/i.test(heading)) inWeaponList = true;
      if (/Trivia|Community-Only/i.test(heading)) inWeaponList = false;
      const className = classes.find((name) => heading.includes(name));
      if (className || /All Classes/i.test(heading)) {
        currentClasses = /All Classes/i.test(heading) ? [...classes] : className ? [className] : [];
        currentSlot = undefined;
        inWeaponList = true;
      }
    }
    if (!inWeaponList) continue;
    if (element.tagName === 'H3') {
      currentSlot = slots.find((slot) => heading.includes(slot)) ?? currentSlot;
    }
    if (element.tagName !== 'TABLE' || !element.classList.contains('wikitable')) continue;
    if (!currentSlot || !currentClasses.length) continue;

    for (const weapon of readWeaponTable(element)) {
      if (excludedWeapons.has(weapon.name.toLowerCase()) || experimentalNames.has(weapon.name))
        continue;
      const key = [weapon.name, currentSlot, currentClasses.join()].join('\0');
      weapons.set(key, { ...weapon, classNames: currentClasses, slot: currentSlot });
    }
  }
  return [...weapons.values()];
}

async function downloadImages(weapons: ScrapedWeapon[]): Promise<Map<string, string>> {
  await mkdir(assetDirectory, { recursive: true });
  // Deduplicate before starting workers so shared images cannot be downloaded concurrently.
  const unique = new Map<string, ScrapedWeapon>();
  for (const weapon of weapons) {
    if (!unique.has(weapon.remoteImage)) unique.set(weapon.remoteImage, weapon);
  }
  const queue = [...unique.values()];
  const images = new Map<string, string>();
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const weapon = queue[next++];
      const file = await downloadImage(weapon.name, weapon.remoteImage, assetDirectory);
      images.set(weapon.remoteImage, file);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return images;
}

function buildCatalog(weapons: ScrapedWeapon[], images: Map<string, string>): Catalog {
  const catalog: Catalog = {};
  for (const name of classes) catalog[name] = {};
  for (const weapon of weapons) {
    const file = images.get(weapon.remoteImage);
    if (!file) throw new Error(`Missing downloaded image for ${weapon.name}`);
    for (const className of weapon.classNames) {
      const items = (catalog[className][weapon.slot] ??= []);
      if (items.some((item) => item.name === weapon.name)) continue;
      items.push({
        name: weapon.name,
        image: `images/weapons/standard/${file}`,
        ...(weapon.stock ? { stock: true } : {}),
      });
    }
  }
  for (const classWeapons of Object.values(catalog)) {
    for (const items of Object.values(classWeapons))
      items.sort((a, b) => a.name.localeCompare(b.name));
  }
  return catalog;
}

async function main() {
  const [standard, experimental] = await Promise.all([
    fetchPage('Weapons'),
    fetchPage('Item_Qualities/Experimental'),
  ]);
  const weapons = parseWeapons(standard.document, readExperimentalNames(experimental.document));
  if (weapons.length < 100)
    throw new Error(
      `Refusing to replace generated data: only ${weapons.length} weapons were scraped.`,
    );

  const images = await downloadImages(weapons);
  const catalog = buildCatalog(weapons, images);
  const source = `// Generated by pnpm scrape:standard. Do not edit manually.\n\nimport type { WeaponCatalog } from './index';\n\nexport const weapons: WeaponCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
  await writeFile(outputFile, source, 'utf8');

  const expectedFiles = new Set(images.values());
  for (const file of await readdir(assetDirectory)) {
    if (!expectedFiles.has(file)) await rm(path.join(assetDirectory, file));
  }
  console.log(
    `Generated ${weapons.length} weapon rows in ${path.relative(projectRoot, outputFile)}.`,
  );
}

await main();
