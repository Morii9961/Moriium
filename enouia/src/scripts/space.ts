const slider = document.querySelector<HTMLInputElement>('#memory');
const photo = document.querySelector<HTMLElement>('.photo-layer');
const divider = document.querySelector<HTMLElement>('.compare-line');
const output = document.querySelector<HTMLOutputElement>('#memory-value');
const controls = document.querySelector<HTMLElement>('.comparison-controls');
const scene = document.querySelector<HTMLElement>('.comparison');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

if (slider && photo && divider && output && controls && scene) {
  let manual = false;
  let pending = false;
  const render = (value: number) => {
    const amount = Math.max(0, Math.min(100, Math.round(value)));
    photo.style.clipPath = `inset(0 ${amount}% 0 0)`;
    divider.style.left = `${100 - amount}%`;
    divider.style.opacity = amount === 0 || amount === 100 ? '0' : '1';
    slider.value = String(amount);
    output.value = `记住 ${amount}%`;
    slider.setAttribute('aria-valuetext', `记住 ${amount}%，看见 ${100 - amount}%`);
  };
  controls.hidden = false;
  render(Number(slider.value));
  slider.addEventListener('input', () => {
    manual = true;
    render(Number(slider.value));
  });
  // Once focused, scrolling must never fight keyboard or touch input.
  slider.addEventListener('focus', () => { manual = true; });
  const followScroll = () => {
    if (manual || reduced.matches || pending || document.hidden) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (manual || reduced.matches || document.hidden) return;
      const box = scene.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return;
      const progress = (window.innerHeight * .9 - box.top) / (window.innerHeight * .7);
      render(15 + Math.max(0, Math.min(1, progress)) * 70);
    });
  };
  window.addEventListener('scroll', followScroll, { passive: true });
  window.addEventListener('resize', followScroll, { passive: true });
  reduced.addEventListener('change', () => {
    if (reduced.matches && !manual) render(45);
  });
}
