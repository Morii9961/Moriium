export interface ReaderFeatures {
  lightbox: boolean;
  mermaid: boolean;
  music: boolean;
  video: boolean;
  math: boolean;
  copyProtection: boolean;
}

export function detectReaderFeatures(body: string, copyProtection = false): ReaderFeatures {
  return {
    lightbox: /!\[[^\]]*\]\([^)]+\)/.test(body),
    mermaid: /```mermaid\s/.test(body),
    music: /::music\{/.test(body),
    video: /::video\{/.test(body),
    math: /(^|[^\\])\$\$?[\s\S]*?\$\$?/.test(body),
    copyProtection,
  };
}
