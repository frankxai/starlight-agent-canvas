import { copyFile, mkdir } from 'node:fs/promises';
import { guideResources } from '../dist/guides.js';

// Built resources are package-relative. Never search ancestor repositories at runtime.
const target = new URL('../dist/guides/', import.meta.url);
await mkdir(target, { recursive: true });
for (const guide of guideResources) {
  if (!/^docs\/[a-z-]+\.md$/.test(guide.file)) throw new Error('Invalid packaged guide name.');
  await copyFile(new URL(`../../../${guide.file}`, import.meta.url), new URL(guide.file.slice(5), target));
}
