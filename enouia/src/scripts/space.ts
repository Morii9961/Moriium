import { drawOptics } from "./optics";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const pointer = matchMedia(
  "(hover: hover) and (pointer: fine) and (min-width: 768px)",
);
const motionToggle =
  document.querySelector<HTMLButtonElement>(".motion-toggle");
let manualStill = false;
let refreshBridge = () => {};
const isStill = () => reduced.matches || manualStill;
function updateMotion() {
  document.documentElement.dataset.still = String(isStill());
  if (motionToggle)
    motionToggle.setAttribute("aria-pressed", String(isStill()));
  const courtyard = document.querySelector<HTMLElement>(".courtyard");
  if (isStill() && courtyard) courtyard.style.removeProperty("transform");
  if (isStill())
    document
      .querySelectorAll(".point-ring")
      .forEach((ring) =>
        ring.getAnimations().forEach((animation) => animation.cancel()),
      );
  refreshBridge();
}
if (motionToggle) {
  motionToggle.hidden = false;
  motionToggle.addEventListener("click", () => {
    if (reduced.matches) return;
    manualStill = !manualStill;
    updateMotion();
  });
}
reduced.addEventListener("change", () => {
  if (motionToggle) {
    motionToggle.disabled = reduced.matches;
    motionToggle.title = reduced.matches ? "遵循系统的减少动态效果设置" : "";
  }
  updateMotion();
});
if (motionToggle) {
  motionToggle.disabled = reduced.matches;
  motionToggle.title = reduced.matches ? "遵循系统的减少动态效果设置" : "";
}
updateMotion();

// One construction line carries the greenhouse observation into the optical study.
const bridge = document.querySelector<SVGElement>(".passage-bridge");
if (bridge) {
  let pending = false;
  const paintBridge = () => {
    pending = false;
    if (isStill()) {
      bridge.style.removeProperty("clip-path");
      return;
    }
    const bounds = bridge.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(1, (innerHeight * 0.8 - bounds.top) / bounds.height),
    );
    bridge.style.clipPath = `inset(0 0 ${(1 - progress) * 100}% 0)`;
  };
  refreshBridge = () => {
    if (!pending && !document.hidden) {
      pending = true;
      requestAnimationFrame(paintBridge);
    }
  };
  addEventListener("scroll", refreshBridge, { passive: true });
  addEventListener("resize", refreshBridge, { passive: true });
  document.addEventListener("visibilitychange", refreshBridge);
  refreshBridge();
}

const courtyard = document.querySelector<HTMLElement>(".courtyard");
if (courtyard) {
  let depthFrame = 0;
  let horizontal = 0;
  let vertical = 0;
  courtyard.addEventListener("pointermove", (event) => {
    if (isStill() || !pointer.matches) return;
    const bounds = courtyard.getBoundingClientRect();
    horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    if (!depthFrame)
      depthFrame = requestAnimationFrame(() => {
        depthFrame = 0;
        if (!isStill() && pointer.matches)
          courtyard.style.transform = `perspective(1100px) rotateY(${horizontal * 3}deg) rotateX(${-vertical * 2}deg)`;
      });
  });
  courtyard.addEventListener("pointerleave", () => {
    cancelAnimationFrame(depthFrame);
    depthFrame = 0;
    courtyard.style.removeProperty("transform");
  });
  pointer.addEventListener("change", () =>
    courtyard.style.removeProperty("transform"),
  );
}

const points = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-observation]"),
];
const observationCopy =
  document.querySelector<HTMLElement>("#observation-copy");
if (points.length && observationCopy) {
  document.querySelector<HTMLElement>(".place-points")!.hidden = false;
  document.querySelector<HTMLElement>("[data-points-hint]")!.hidden = false;
  for (const point of points)
    point.addEventListener("click", (event) => {
      points.forEach((other) =>
        other.setAttribute("aria-pressed", String(point === other)),
      );
      observationCopy.textContent = point.dataset.copy || "";
      // Keep keyboard and reduced-motion feedback immediate.
      if (!isStill() && event.detail > 0) {
        const ring = point.querySelector(".point-ring");
        ring?.getAnimations().forEach((animation) => animation.cancel());
        ring?.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.12)" },
            { transform: "scale(1)" },
          ],
          { duration: 180, easing: "ease-out" },
        );
      }
    });
}

const canvas = document.querySelector<HTMLCanvasElement>("#light-canvas");
const slider = document.querySelector<HTMLInputElement>("#light-angle");
const angleOutput = document.querySelector<HTMLOutputElement>("#angle-value");
const moodButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-light]"),
];
if (canvas && slider && angleOutput) {
  const context = canvas.getContext("2d");
  if (context) {
    let angle = Number(slider.value);
    let mood = 0;
    let frame = 0;
    let visible = false;
    const stage = canvas.parentElement!;
    const observation =
      document.querySelector<HTMLElement>("#light-observation");
    const notes = [
      [
        "晨光斜着进来，颜色在另一边散开了。",
        "晨光里，几种颜色刚刚分开。再转一点看看。",
        "晨光转向这边，落下来的颜色也跟着换了位置。",
      ],
      [
        "阴天的光斜过去了，边缘还有一层很淡的蓝。",
        "阴天的颜色挨得很近，要多看一会儿。",
        "方向换了，阴天的颜色还是淡淡的。",
      ],
      [
        "日暮的光斜着落下，这边多了一点暖色。",
        "换成日暮，玻璃旁边也暖了一点。",
        "再往这边转，暖色落到了另一处。",
      ],
    ];
    function updateObservation() {
      const band = angle < -18 ? 0 : angle > 18 ? 2 : 1;
      const text = notes[mood]![band]!;
      // Announce only a meaningful band change, not every slider increment.
      if (observation && observation.textContent !== text)
        observation.textContent = text;
    }
    function draw() {
      frame = 0;
      if (!visible || document.hidden || !context || !canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (width === 0 || height === 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawOptics(context, width, height, angle, mood);
      stage.classList.add("is-ready");
    }
    function schedule() {
      if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
    }
    slider.addEventListener("input", () => {
      angle = Number(slider.value);
      angleOutput.textContent = `${angle < 0 ? "−" : ""}${Math.abs(angle)}°`;
      slider.setAttribute("aria-valuetext", `${angle} 度`);
      updateObservation();
      schedule();
    });
    for (const button of moodButtons)
      button.addEventListener("click", () => {
        mood = Number(button.dataset.light);
        updateObservation();
        moodButtons.forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
        schedule();
      });
    new ResizeObserver(schedule).observe(stage);
    new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) schedule();
      },
      { rootMargin: "150px" },
    ).observe(stage);
    document.addEventListener("visibilitychange", schedule);
    document.querySelector<HTMLElement>(".light-controls")!.hidden = false;
  }
}

const rearrange = document.querySelector<HTMLButtonElement>("#rearrange");
const tableComment = document.querySelector<HTMLElement>("#table-comment");
const objects = [...document.querySelectorAll<SVGElement>(".table-object")];
const arrangements = [
  {
    angles: [-9, 12, -11],
    positions: [
      [4, -5],
      [-3, 9],
      [2, -6],
    ],
    text: "纸鸟有一点歪。就让它歪着吧。",
  },
  {
    angles: [7, -7, 16],
    positions: [
      [-3, 5],
      [4, -4],
      [-4, 2],
    ],
    text: "蓝玻璃挪过来以后，这边的颜色刚刚好。",
  },
  {
    angles: [-3, 4, -5],
    positions: [
      [2, 3],
      [-2, 0],
      [3, -4],
    ],
    text: "嗯，还是不用太整齐。",
  },
  {
    angles: [0, 0, 0],
    positions: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    text: "绕了一圈，又回到这里了。",
  },
];
let arrangement = 0;
if (rearrange && tableComment) {
  document.querySelector<HTMLElement>(".table-controls")!.hidden = false;
  rearrange.addEventListener("click", (event) => {
    const state = arrangements[arrangement % arrangements.length]!;
    // Keyboard actions change position immediately; pointer actions may transition.
    const instant = isStill() || event.detail === 0;
    objects.forEach((object, i) => {
      const position = state.positions[i]!;
      object.style.transition = instant ? "none" : "";
      object.style.transform = `translate(${position[0]}%,${position[1]}%) rotate(${state.angles[i]}deg)`;
    });
    tableComment.textContent = state.text;
    arrangement++;
  });
}
