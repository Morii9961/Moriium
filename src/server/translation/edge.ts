// The translation service.
//
// Morii chose the endpoint Microsoft Edge uses for its own page translation,
// the same one the previous Twilight site reached through translate.js. It is
// free and undocumented: there is no contract, no published terms for calling
// it from a server, and no notice if it changes. Two consequences are designed
// for here rather than discovered later.
//
// First, it resets connections. Measured against the live endpoint, three of
// four opening attempts returned ECONNRESET before any byte arrived, while a
// later run of twelve requests succeeded twelve times. So a single attempt is
// not evidence of anything and every call retries with backoff.
//
// Second, a failure must never produce a partial article. Every caller here
// fails closed: no translation at all is a variant that stays unavailable,
// which the site already knows how to show. Half a translation would be a
// published page.

import { AdminError } from '../errors.ts';

export type SiteLanguage = 'zh' | 'ja' | 'en';

export const EDGE_TRANSLATE_URL =
  'https://edge.microsoft.com/translate/translatetext?from={from}&to={to}&isEnterpriseClient=false';

/**
 * The service's own language ids.
 *
 * `zh` is not one of them. Sending it is not rejected -- the endpoint answers
 * with the source text unchanged, which reads like a translator that decided
 * the text was already Japanese.
 */
const SERVICE_LANGUAGE: Record<SiteLanguage, string> = {
  zh: 'zh-CHS',
  ja: 'ja',
  en: 'en',
};

export function serviceLanguage(lang: SiteLanguage): string {
  return SERVICE_LANGUAGE[lang];
}

export const MAX_ATTEMPTS = 5;

type EdgeReply = readonly { readonly translations?: readonly { readonly text?: string }[] }[];

export type TranslateOptions = {
  readonly from: SiteLanguage;
  readonly to: SiteLanguage;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Translates an ordered array of strings, or throws.
 *
 * The endpoint answers positionally, so the reply is checked to be the same
 * length as the request before any of it is believed.
 */
export async function translateTexts(
  texts: readonly string[],
  options: TranslateOptions,
): Promise<string[]> {
  if (texts.length === 0) return [];

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  const url = EDGE_TRANSLATE_URL.replace('{from}', serviceLanguage(options.from)).replace(
    '{to}',
    serviceLanguage(options.to),
  );

  let last: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(texts),
      });
      if (!response.ok) {
        last = new Error(`The translation service answered HTTP ${response.status}.`);
      } else {
        return readTranslations(await response.text(), texts.length);
      }
    } catch (error) {
      // A reply that does not answer every piece is a fault in the reply, not
      // in the connection, and retrying would only ask the same question again.
      if (error instanceof AdminError) throw error;
      last = error;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(250 * 2 ** (attempt - 1));
  }

  throw new AdminError(
    'translation-failed',
    '翻译服务没有响应，未生成译文。',
    { cause: last },
  );
}

function readTranslations(body: string, expected: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new AdminError('translation-failed', '翻译服务返回了无法读取的响应。', { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length !== expected) {
    throw new AdminError(
      'translation-failed',
      `翻译服务返回了 ${Array.isArray(parsed) ? parsed.length : 0} 段，应为 ${expected} 段。`,
    );
  }
  return (parsed as EdgeReply).map((entry, index) => {
    const text = entry?.translations?.[0]?.text;
    if (typeof text !== 'string') {
      throw new AdminError('translation-failed', `翻译服务的第 ${index + 1} 段没有译文。`);
    }
    return text;
  });
}
