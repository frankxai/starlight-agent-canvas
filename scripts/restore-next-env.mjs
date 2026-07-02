import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextEnvPath = path.join(repoRoot, 'apps', 'web', 'next-env.d.ts');
const desired = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;

let current = '';
try {
  current = await readFile(nextEnvPath, 'utf8');
} catch {
  // Create the generated shim when a fresh checkout has not created it yet.
}

if (current !== desired) {
  await writeFile(nextEnvPath, desired, 'utf8');
  console.log(`Restored ${path.relative(repoRoot, nextEnvPath)} for dev route types.`);
}
