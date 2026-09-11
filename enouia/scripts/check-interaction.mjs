import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';

// Exercise the built browser module without substituting a copy of its logic.
const assets = new URL('../dist/_astro/', import.meta.url);
const scripts = (await readdir(assets)).filter(name => name.endsWith('.js'));
assert.equal(scripts.length, 1);
const code = await readFile(new URL(scripts[0], assets), 'utf8');
function setup(reduce = false) {
  const makeElement = () => ({
    style: {}, value: '45', hidden: true, events: {}, attributes: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect() { return { top: 200, bottom: 800 }; },
  });
  const selectors = ['#memory', '.photo-layer', '.compare-line', '#memory-value', '.comparison-controls', '.comparison'];
  const elements = Object.fromEntries(selectors.map(name => [name, makeElement()]));
  const media = { matches: reduce, events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
  const window = { innerHeight: 900, events: {}, matchMedia: () => media, addEventListener(name, callback) { this.events[name] = callback; } };
  const document = { hidden: false, querySelector: selector => elements[selector] };
  const queue = [];
  vm.runInNewContext(code, { window, document, requestAnimationFrame: callback => queue.push(callback) });
  return { elements, window, media, document, flush: () => { while (queue.length) queue.shift()(); } };
}
const state = setup();
const slider = state.elements['#memory'];
assert.equal(state.elements['.comparison-controls'].hidden, false);
assert.equal(state.elements['.photo-layer'].style.clipPath, 'inset(0 45% 0 0)');
state.window.events.scroll(); state.flush();
assert.notEqual(slider.value, '45');
slider.events.focus();
slider.value = '73'; slider.events.input();
state.window.events.scroll(); state.flush();
assert.equal(slider.value, '73', 'Scrolling must not override manual input');
assert.equal(state.elements['#memory-value'].value, '记住 73%');
assert.equal(slider.attributes['aria-valuetext'], '记住 73%，看见 27%');
slider.value = '120'; slider.events.input();
assert.equal(slider.value, '100');
assert.equal(state.elements['.compare-line'].style.opacity, '0');
slider.value = '-5'; slider.events.input();
assert.equal(slider.value, '0');
const calm = setup(true);
calm.window.events.scroll(); calm.flush();
assert.equal(calm.elements['#memory'].value, '45', 'Reduced motion must disable scroll changes');
const hidden = setup(); hidden.document.hidden = true;
hidden.window.events.scroll(); hidden.flush();
assert.equal(hidden.elements['#memory'].value, '45');
console.log('Built interaction checked: initial state, scroll, manual ownership, labels, endpoints, reduced motion, hidden document.');
