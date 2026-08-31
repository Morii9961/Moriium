import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

// DESIGN.md is the canonical visual constitution, but prose cannot go red. These
// tests make the parts of it that are numbers checkable: the two locked palettes,
// the layout widths, the motion timings, and the accessibility floor that
// section 18.2 left open for implementation to resolve.

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The declarations inside one selector block of tokens.css. */
function tokenBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} is missing from tokens.css`);
  const body = css.slice(start, css.indexOf('\n  }', start));
  const values = new Map();
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    values.set(match[1], match[2].trim().replace(/\s+/g, ' '));
  }
  return values;
}

test('the two locked Moriium Blue palettes are transcribed, not reinterpreted', async () => {
  const tokens = await read('src/styles/tokens.css');
  const light = tokenBlock(tokens, ':root');
  const dark = tokenBlock(tokens, ":root[data-theme='dark']");

  // DESIGN.md section 4.1, 雾霾蓝.
  assert.deepEqual(
    [
      light.get('--color-bg-primary'),
      light.get('--color-bg-secondary'),
      light.get('--color-border-subtle'),
      light.get('--color-border-default'),
      light.get('--color-accent-primary'),
      light.get('--color-accent-secondary'),
      light.get('--color-accent-highlight'),
      light.get('--color-interactive-hover'),
      light.get('--color-interactive-selected'),
      light.get('--color-progress'),
    ],
    ['#f2f5f9', '#b8c4d1', '#e6eaf0', '#d3e0ee', '#5a7daa', '#85a1c2', '#aec3da', '#e5e7eb', '#e3ecf8', '#5a7daa'],
  );

  // DESIGN.md section 4.1, 深渊蓝.
  assert.deepEqual(
    [
      dark.get('--color-bg-primary'),
      dark.get('--color-bg-secondary'),
      dark.get('--color-bg-elevated'),
      dark.get('--color-border-subtle'),
      dark.get('--color-border-default'),
      dark.get('--color-accent-primary'),
      dark.get('--color-accent-secondary'),
      dark.get('--color-accent-highlight'),
      dark.get('--color-interactive-hover'),
      dark.get('--color-interactive-selected'),
      dark.get('--color-progress'),
    ],
    ['#0b0c14', '#0d1220', '#151a27', '#151a27', '#1c2760', '#162043', '#1f2c6a', '#2a3a8c', '#1c2760', '#1f2c6a', '#2a3a8c'],
  );
});

test('reading ink clears WCAG AA in both themes', async () => {
  const tokens = await read('src/styles/tokens.css');

  for (const [selector, expectation] of [
    [':root', { canvas: '#f2f5f9' }],
    [":root[data-theme='dark']", { canvas: '#0b0c14' }],
  ]) {
    const block = tokenBlock(tokens, selector);
    const { canvas } = expectation;
    assert.equal(block.get('--color-bg-primary'), canvas);

    // Body ink is held to AAA, and the auxiliary ink still has to clear AA,
    // because metadata on this site is set small.
    assert.ok(
      contrast(block.get('--color-text-primary'), canvas) >= 7,
      `${selector} --color-text-primary is ${contrast(block.get('--color-text-primary'), canvas).toFixed(2)}:1`,
    );
    assert.ok(
      contrast(block.get('--color-text-secondary'), canvas) >= 4.5,
      `${selector} --color-text-secondary is ${contrast(block.get('--color-text-secondary'), canvas).toFixed(2)}:1`,
    );
    assert.ok(
      contrast(block.get('--color-text-tertiary'), canvas) >= 4.5,
      `${selector} --color-text-tertiary is ${contrast(block.get('--color-text-tertiary'), canvas).toFixed(2)}:1`,
    );
    // The accent is also a text and focus colour, so it is held to the same bar.
    assert.ok(
      contrast(block.get('--color-accent-ink'), canvas) >= 4.5,
      `${selector} --color-accent-ink is ${contrast(block.get('--color-accent-ink'), canvas).toFixed(2)}:1`,
    );
  }
});

test('the brand mark stays visible as a line on both canvases', async () => {
  const tokens = await read('src/styles/tokens.css');
  const light = tokenBlock(tokens, ':root');
  const dark = tokenBlock(tokens, ":root[data-theme='dark']");

  // This is the reason --color-accent-mark exists. Every blue in the 深渊蓝
  // palette is a surface colour; drawing a hairline in one of them on #0B0C14
  // produces an invisible rule, so dark mode draws the same marks in the tint.
  assert.equal(light.get('--color-accent-mark'), 'var(--color-accent-primary)');
  assert.equal(dark.get('--color-accent-mark'), 'var(--color-accent-ink)');

  assert.ok(contrast(light.get('--color-accent-primary'), '#f2f5f9') >= 3);
  assert.ok(contrast(dark.get('--color-accent-ink'), '#0b0c14') >= 3);
  // And the record of why the constitution's own dark accent could not be used.
  assert.ok(contrast(dark.get('--color-accent-highlight'), '#0b0c14') < 3);
});

test('layout and motion tokens match the constitution', async () => {
  const tokens = await read('src/styles/tokens.css');
  const block = tokenBlock(tokens, ':root');

  // DESIGN.md section 6.
  assert.equal(block.get('--layout-text'), '48rem');
  assert.equal(block.get('--layout-media'), '62rem');
  assert.equal(block.get('--layout-gallery'), '76rem');
  assert.equal(block.get('--layout-header'), '64rem');
  assert.equal(block.get('--layout-wide'), '90rem');
  // The constitution's clamp is the gutter. The safe-area terms only widen it
  // on a notched device, and resolve to 0 everywhere else.
  assert.match(block.get('--layout-gutter'), /clamp\(1rem, 4vw, 4\.5rem\)/);
  assert.match(block.get('--layout-gutter'), /env\(safe-area-inset-left, 0px\)/);
  assert.match(block.get('--layout-gutter'), /env\(safe-area-inset-right, 0px\)/);

  // DESIGN.md section 10: fast 180–280ms, medium 360–600ms, strong ease-out.
  const ms = (value) => Number.parseInt(value, 10);
  assert.ok(ms(block.get('--motion-fast')) >= 180 && ms(block.get('--motion-fast')) <= 280);
  assert.ok(ms(block.get('--motion-medium')) >= 360 && ms(block.get('--motion-medium')) <= 600);
  assert.equal(block.get('--motion-ease'), 'cubic-bezier(0.16, 1, 0.3, 1)');

  // DESIGN.md section 5.1: serif reads, sans labels, monospace for code.
  assert.match(block.get('--font-serif'), /LXGW WenKai Screen/);
  assert.match(block.get('--font-serif'), /serif$/);
  assert.match(block.get('--font-sans'), /sans-serif$/);
  assert.match(block.get('--font-mono'), /monospace$/);

  // DESIGN.md section 5.2: body line-height 1.70–1.80.
  const leading = Number.parseFloat(block.get('--leading-body'));
  assert.ok(leading >= 1.7 && leading <= 1.8, `--leading-body is ${leading}`);
});

test('the public site ships none of the design-study stylesheet', async () => {
  const publicDirectories = ['src/layouts', 'src/components'];
  const offenders = [];

  for (const directory of publicDirectories) {
    for (const name of await readdir(new URL(directory, root))) {
      if (name === 'PrototypeLayout.astro') continue; // the study's own shell
      const source = await read(join(directory, name).split('\\').join('/'));
      if (/prototypes\.css|concept-a/.test(source)) offenders.push(`${directory}/${name}`);
    }
  }

  async function walk(directory) {
    const found = [];
    for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'design') continue; // the isolated study tree
        found.push(...(await walk(path)));
      } else if (entry.name.endsWith('.astro')) {
        found.push(path);
      }
    }
    return found;
  }

  for (const path of await walk('src/pages')) {
    const source = await read(path);
    if (/prototypes\.css|concept-a/.test(source)) offenders.push(path);
  }

  assert.deepEqual(offenders, [], `study CSS reached a public route: ${offenders.join(', ')}`);
});

test('the shell loads exactly the three type roles', async () => {
  const layout = await read('src/layouts/BaseLayout.astro');
  const imports = [...layout.matchAll(/^import '([^']+\.css)';$/gm)].map((match) => match[1]);
  const fonts = imports.filter((path) => !path.startsWith('../styles/'));

  assert.deepEqual(fonts.sort(), [
    '@fontsource-variable/noto-sans-sc/wght.css',
    '@fontsource/ibm-plex-mono/latin-400.css',
    'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css',
  ]);
  assert.deepEqual(imports.filter((path) => path.startsWith('../styles/')), [
    '../styles/tokens.css',
    '../styles/base.css',
    '../styles/layout.css',
    '../styles/content.css',
  ]);
});
