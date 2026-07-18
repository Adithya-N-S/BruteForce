import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(__dirname, '..');
const seedDir = resolve(pkgDir, 'data', 'seed');
const monorepoSeed = resolve(pkgDir, '..', 'data', 'seed');
const files = ['entities.json', 'edges.json', 'source_records.json', 'sanctions_list.json'];

mkdirSync(seedDir, { recursive: true });

for (const file of files) {
  const src = resolve(monorepoSeed, file);
  const dest = resolve(seedDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied seed: ${file}`);
  } else {
    console.warn(`Warning: Seed file not found: ${src}`);
  }
}
