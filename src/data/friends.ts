import type { Language } from './site';

export interface FriendLink {
  name: string;
  url: `https://${string}` | `http://${string}`;
  description?: Partial<Record<Language, string>>;
}

// Add approved links in display order. Omit descriptions without a translation.
// Example: { name: 'Site name', url: 'https://example.com', description: { zh: '简介' } }
export const FRIENDS: readonly FriendLink[] = [
  {
    name: 'Enouia',
    url: 'https://enouia.morii9961.top/',
    // The Chinese is the small site's own line, from its og:description.
    description: {
      zh: '窗外很远，手边很近。',
      ja: '窓の外は遠く、手もとは近い。',
      en: 'Far beyond the window, close at hand.',
    },
  },
];
