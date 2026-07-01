import { randomUUID } from 'node:crypto';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'canvas';
}

export function makeId(prefix: string, hint?: string): string {
  const stem = hint ? slugify(hint) : prefix;
  return `${prefix}-${stem}-${randomUUID().slice(0, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
