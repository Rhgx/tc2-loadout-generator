import { JSDOM } from 'jsdom';

export const classes = [
  'Flanker',
  'Trooper',
  'Arsonist',
  'Annihilator',
  'Brute',
  'Mechanic',
  'Doctor',
  'Marksman',
  'Agent',
] as const;
export type ClassName = (typeof classes)[number];
export const slots = ['Primary', 'Secondary', 'Melee', 'PDA'] as const;
export type Slot = (typeof slots)[number];

export async function fetchPage(
  page: string,
): Promise<{ document: Document; categories: string[] }> {
  const url = new URL('https://typicalcolors2.fandom.com/api.php');
  url.search = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'text|categories',
    format: 'json',
    origin: '*',
  }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TC2 wiki request failed with ${response.status}: ${page}`);
  const json: unknown = await response.json();
  if (!json || typeof json !== 'object' || !('parse' in json)) {
    throw new Error(`TC2 wiki returned no page data for ${page}.`);
  }
  const parsed = json.parse;
  if (!parsed || typeof parsed !== 'object' || !('text' in parsed)) {
    throw new Error(`TC2 wiki returned no rendered HTML for ${page}.`);
  }
  const text = parsed.text;
  if (
    !text ||
    typeof text !== 'object' ||
    !('*' in text) ||
    typeof text['*'] !== 'string' ||
    !text['*']
  ) {
    throw new Error(`TC2 wiki returned invalid rendered HTML for ${page}.`);
  }
  const categories: string[] = [];
  if ('categories' in parsed && Array.isArray(parsed.categories)) {
    for (const category of parsed.categories) {
      if (
        category &&
        typeof category === 'object' &&
        '*' in category &&
        typeof category['*'] === 'string'
      ) {
        categories.push(category['*']);
      }
    }
  }
  return { document: new JSDOM(text['*']).window.document, categories };
}

export function experimentalTable(document: Document): Element {
  const table = [...document.querySelectorAll('table.wikitable')].find((candidate) =>
    candidate.textContent?.includes('Experimental quality items'),
  );
  if (!table) throw new Error('Experimental items table was not found.');
  return table;
}
