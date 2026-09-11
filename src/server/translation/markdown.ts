// Splitting Markdown into what a translator may read and what it must not.
//
// The translation service takes an array of strings and answers with an array
// of the same length, so protected material is simply never put in the array.
// That is deliberately different from the usual approach of substituting
// sentinel tokens and hoping they survive: a sentinel the engine rewrites or
// drops corrupts the document silently, while a piece that was never sent
// cannot come back wrong.
//
// What must not be translated is everything whose meaning is its exact bytes:
// code, diagram source, mathematics, and directive markers whose attributes
// carry quoting and identifiers. Prose between those survives as prose.

export type Piece = {
  readonly text: string;
  /** False for material reproduced byte for byte. */
  readonly translatable: boolean;
};

/** ``` or ~~~ with any attribute tail, e.g. ```ts title="x" {3}. */
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
/** A display-math delimiter on its own line. */
const MATH_FENCE = /^\s*\$\$\s*$/;
/** :::name{...} opening a container, or ::: closing one. */
const CONTAINER = /^\s*:::/;
/** ::name{...} on its own line: a leaf directive that is only attributes. */
const LEAF_DIRECTIVE = /^\s*::[A-Za-z][\w-]*(\{.*\})?\s*$/;

/**
 * Splits Markdown into ordered pieces, marking each as translatable or not.
 *
 * Line-based rather than mdast-based on purpose. The body has to come back out
 * byte-identical apart from the prose, and a parse-then-print round trip
 * normalises whitespace, list markers and emphasis characters that the author
 * chose. Reassembly here is concatenation, so anything not translated is
 * untouched by construction.
 */
export function splitForTranslation(markdown: string): Piece[] {
  const lines = markdown.split('\n');
  const pieces: Piece[] = [];
  let prose: string[] = [];
  let verbatim: string[] = [];

  const flushProse = (): void => {
    if (prose.length === 0) return;
    // A blank-line-separated run of prose travels as one piece so the engine
    // sees whole sentences; splitting per line would translate fragments.
    pieces.push({ text: prose.join('\n'), translatable: true });
    prose = [];
  };
  const flushVerbatim = (): void => {
    if (verbatim.length === 0) return;
    pieces.push({ text: verbatim.join('\n'), translatable: false });
    verbatim = [];
  };
  const keep = (line: string): void => {
    flushProse();
    verbatim.push(line);
  };

  let fence: string | null = null;
  let inMath = false;

  for (const line of lines) {
    if (fence !== null) {
      keep(line);
      // A fence closes on a run of the same character, at least as long as the
      // one that opened it, with nothing after it. An attribute tail means a
      // new fence, not a closing one.
      const closing = FENCE.exec(line);
      const marker = closing?.[2] ?? '';
      const tail = closing?.[3] ?? '';
      if (marker.startsWith(fence.slice(0, 1)) && marker.length >= fence.length && tail.trim() === '') {
        fence = null;
      }
      continue;
    }
    if (inMath) {
      keep(line);
      if (MATH_FENCE.test(line)) inMath = false;
      continue;
    }

    const opening = FENCE.exec(line);
    if (opening?.[2]) {
      fence = opening[2];
      keep(line);
      continue;
    }
    if (MATH_FENCE.test(line)) {
      inMath = true;
      keep(line);
      continue;
    }
    // Container markers are syntax; the prose between them is not, so only the
    // marker lines are kept back.
    if (CONTAINER.test(line) || LEAF_DIRECTIVE.test(line)) {
      keep(line);
      continue;
    }

    if (line.trim() === '') {
      // A blank line ends a prose run and is itself structure.
      keep(line);
      continue;
    }
    flushVerbatim();
    prose.push(line);
  }

  flushProse();
  flushVerbatim();
  return pieces;
}

/**
 * Puts translated prose back where it came from.
 *
 * The service answers positionally, so a short or long array would shift every
 * later piece onto the wrong slot and produce a plausible-looking document with
 * paragraphs in the wrong places. That is worse than a failure, so it is one.
 */
export function reassemble(pieces: readonly Piece[], translations: readonly string[]): string {
  const expected = pieces.filter((piece) => piece.translatable).length;
  if (translations.length !== expected) {
    throw new Error(
      `The translation service returned ${translations.length} pieces, expected ${expected}.`,
    );
  }
  let next = 0;
  return pieces
    .map((piece) => (piece.translatable ? translations[next++]! : piece.text))
    .join('\n');
}
