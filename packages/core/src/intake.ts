export type DetectedIntakeKind = 'youtube' | 'video' | 'image' | 'url' | 'text';

export interface DetectedIntakeItem {
  kind: DetectedIntakeKind;
  title: string;
  body: string;
  url?: string;
  attachedText?: string;
}

export interface DetectedIntakePlan {
  raw: string;
  urls: string[];
  notes: string;
  items: DetectedIntakeItem[];
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_FILE_PATTERN = /\.(mp4|m4v|mov|webm|mkv)(\?.*)?$/i;
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;
const VIDEO_HOSTS = [
  'loom.com',
  'vimeo.com',
  'wistia.com',
  'tiktok.com',
  'twitch.tv',
  'dailymotion.com',
  'streamable.com',
  'frame.io',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'drive.google.com',
  'dropbox.com',
];

export function extractIntakeUrls(value: string): string[] {
  return Array.from(new Set((value.match(URL_PATTERN) ?? [])
    .map((item) => item.replace(/[),.;]+$/, ''))
    .filter(Boolean)));
}

export function isYoutubeVideoId(value: string): boolean {
  return YOUTUBE_ID_PATTERN.test(value.trim());
}

export function normalizeYoutubeReference(value: string): string {
  const trimmed = value.trim();
  return isYoutubeVideoId(trimmed) ? `https://www.youtube.com/watch?v=${trimmed}` : trimmed;
}

export function isYoutubeLink(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch {
    return false;
  }
}

export function isKnownVideoLink(value: string): boolean {
  if (isYoutubeLink(value)) return true;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return VIDEO_HOSTS.some((knownHost) => host === knownHost || host.endsWith(`.${knownHost}`))
      || VIDEO_FILE_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isKnownImageLink(value: string): boolean {
  try {
    return IMAGE_FILE_PATTERN.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function removeUrls(value: string, urls: string[]): string {
  return urls.reduce((text, url) => text.replace(url, ' '), value).replace(/\s+/g, ' ').trim();
}

function hostTitle(value: string, fallback: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || fallback;
  } catch {
    return fallback;
  }
}

function textTitle(value: string): string {
  const first = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'Pasted source';
  return first.length > 72 ? `${first.slice(0, 69)}...` : first;
}

export function detectIntakeText(value: string): DetectedIntakePlan {
  const raw = value.trim();
  if (!raw) return { raw, urls: [], notes: '', items: [] };

  const urls = isYoutubeVideoId(raw) ? [normalizeYoutubeReference(raw)] : extractIntakeUrls(raw);
  const youtubeUrls = urls.filter(isYoutubeLink);
  const videoUrls = urls.filter((item) => !isYoutubeLink(item) && isKnownVideoLink(item));
  const imageUrls = urls.filter((item) => !isYoutubeLink(item) && !isKnownVideoLink(item) && isKnownImageLink(item));
  const webUrls = urls.filter((item) => !isYoutubeLink(item) && !isKnownVideoLink(item) && !isKnownImageLink(item));
  const notes = removeUrls(raw, urls);
  const singleMediaWithAttachedText = urls.length === 1 && (youtubeUrls.length === 1 || videoUrls.length === 1 || imageUrls.length === 1);
  const items: DetectedIntakeItem[] = [];

  for (const url of youtubeUrls) {
    items.push({
      kind: 'youtube',
      title: `YouTube ${hostTitle(url, 'source')}`,
      body: singleMediaWithAttachedText ? notes : '',
      url,
      attachedText: singleMediaWithAttachedText ? notes : '',
    });
  }

  for (const url of videoUrls) {
    items.push({
      kind: 'video',
      title: `Video ${hostTitle(url, 'source')}`,
      body: singleMediaWithAttachedText ? notes : '',
      url,
      attachedText: singleMediaWithAttachedText ? notes : '',
    });
  }

  for (const url of imageUrls) {
    items.push({
      kind: 'image',
      title: `Image ${hostTitle(url, 'source')}`,
      body: singleMediaWithAttachedText ? notes : '',
      url,
      attachedText: singleMediaWithAttachedText ? notes : '',
    });
  }

  for (const url of webUrls) {
    items.push({
      kind: 'url',
      title: hostTitle(url, 'URL source'),
      body: '',
      url,
    });
  }

  if ((notes.length > 24 && !singleMediaWithAttachedText) || !urls.length) {
    const body = urls.length ? notes : raw;
    items.push({
      kind: 'text',
      title: textTitle(body),
      body,
    });
  }

  return { raw, urls, notes, items };
}
