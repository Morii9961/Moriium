import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Marked, type marked } from 'marked';
import {
  MARKED_MEMBERS_TIPTAP_READS,
  createIsolatedMarked,
  missingMarkedMembers,
} from './marked-instance.ts';
import { measureMoriiumMarkdownRoundTrip } from './roundtrip.ts';

const SAMPLE = '# Heading\n\nInline $H_0$ and text.\n\n::github{repo="Morii9961/Moriium"}\n';

/**
 * A marked instance that records which members are read from the outside.
 *
 * Methods are handed back bound to the raw instance, so marked's own internal
 * property reads run against the target and are not mistaken for reads by
 * Tiptap. Only what Tiptap touches directly is recorded.
 */
function watchReads(): { instance: typeof marked; target: Marked; reads: Set<string> } {
  const reads = new Set<string>();
  const target = new Marked();
  const instance = new Proxy(target, {
    get(object, property) {
      if (typeof property === 'string') reads.add(property);
      const value = Reflect.get(object, property);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });

  return { instance: instance as unknown as typeof marked, target, reads };
}

describe('the injected marked instance', () => {
  it('provides every member Tiptap reads', () => {
    assert.deepEqual(missingMarkedMembers(new Marked()), []);
    assert.doesNotThrow(() => createIsolatedMarked());
  });

  it('reports a stripped instance rather than passing it through', () => {
    assert.deepEqual(missingMarkedMembers({}), [...MARKED_MEMBERS_TIPTAP_READS]);
  });

  it('is never read through a member only the marked namespace provides', () => {
    const { instance, target, reads } = watchReads();
    const report = measureMoriiumMarkdownRoundTrip(SAMPLE, instance);

    // Prove the watcher saw real traffic before trusting what it did not see.
    assert.ok(report.markdown.includes('$H_0$'));
    for (const member of ['use', 'setOptions', 'Lexer', 'defaults']) {
      assert.ok(reads.has(member), `Tiptap did not read ${member}`);
    }

    // The assertion in marked-instance.ts holds exactly while Tiptap reads
    // nothing a Marked instance lacks; `getDefaults` is the only such member
    // today. Calling the instance would throw, so the round trip above having
    // produced output rules that out too.
    assert.deepEqual(
      [...reads].filter((member) => !(member in target)),
      [],
      'Tiptap now reads a member the `typeof marked` assertion does not cover; ' +
        'recheck marked-instance.ts before trusting any round-trip number.',
    );
  });
});
