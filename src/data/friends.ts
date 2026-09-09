import type { Language } from './site';

export interface FriendLink {
  name: string;
  url: `https://${string}` | `http://${string}`;
  description?: Partial<Record<Language, string>>;
}

// Add approved links in display order. Omit descriptions without a translation.
// Example: { name: 'Site name', url: 'https://example.com', description: { zh: '简介' } }
export const FRIENDS: readonly FriendLink[] = [];
