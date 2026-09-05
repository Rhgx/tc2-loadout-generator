import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const clean = (value = '') =>
  value
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const slug = (value: string) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function imageUrl(image: Element | null): string {
  const raw = image?.getAttribute('data-src') || image?.getAttribute('src') || '';
  const absolute = raw.startsWith('//')
    ? `https:${raw}`
    : raw.startsWith('/')
      ? `https://typicalcolors2.fandom.com${raw}`
      : raw;
  if (!absolute.includes('static.wikia.nocookie.net')) return absolute;
  const url = new URL(absolute);
  const revision = url.pathname.indexOf('/revision/latest');
  if (revision >= 0) url.pathname = url.pathname.slice(0, revision + '/revision/latest'.length);
  url.search = '';
  return url.toString();
}

export function imageFilename(name: string, url: string): string {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
  return `${slug(name)}-${hash}.webp`;
}

export function encodeWeaponImage(bytes: Buffer): Promise<Buffer> {
  // Normalize transparent margins so CSS fits the visible weapon, not its original canvas.
  return sharp(bytes)
    .trim({ background: '#00000000', threshold: 1 })
    .webp({ quality: 85, effort: 5 })
    .toBuffer();
}

export async function downloadImage(name: string, url: string, directory: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image request failed with ${response.status}: ${url}`);
  const image = await encodeWeaponImage(Buffer.from(await response.arrayBuffer()));
  const file = imageFilename(name, url);
  await writeFile(path.join(directory, file), image);
  return file;
}
