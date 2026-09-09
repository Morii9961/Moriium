export type Point = { x: number; y: number };
export const prism: Point[] = [
  { x: 450, y: 135 },
  { x: 315, y: 435 },
  { x: 680, y: 405 },
];
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const unit = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y);
  return { x: a.x / length, y: a.y / length };
};
export function refract(
  direction: Point,
  normal: Point,
  ratio: number,
): Point | null {
  const n =
    dot(direction, normal) > 0 ? { x: -normal.x, y: -normal.y } : normal;
  const cosine = -dot(direction, n);
  const discriminant = 1 - ratio * ratio * (1 - cosine * cosine);
  if (discriminant < 0) return null;
  const factor = ratio * cosine - Math.sqrt(discriminant);
  return unit({
    x: ratio * direction.x + factor * n.x,
    y: ratio * direction.y + factor * n.y,
  });
}
export function intersect(origin: Point, direction: Point, skip = -1) {
  let closest: {
    point: Point;
    normal: Point;
    edge: number;
    distance: number;
  } | null = null;
  for (let edge = 0; edge < prism.length; edge++) {
    if (edge === skip) continue;
    const start = prism[edge]!;
    const end = prism[(edge + 1) % prism.length]!;
    const segment = sub(end, start);
    const denominator = cross(direction, segment);
    if (Math.abs(denominator) < 1e-8) continue;
    const delta = sub(start, origin);
    const distance = cross(delta, segment) / denominator;
    const position = cross(delta, direction) / denominator;
    if (distance <= 0.001 || position < 0 || position > 1) continue;
    if (!closest || distance < closest.distance) {
      closest = {
        point: {
          x: origin.x + distance * direction.x,
          y: origin.y + distance * direction.y,
        },
        normal: unit({ x: -segment.y, y: segment.x }),
        edge,
        distance,
      };
    }
  }
  return closest;
}

// A geometric refraction study, not a calibrated optical instrument.
// Dispersion is deliberately enlarged so the relationships remain visible on mobile.
export function traceRay(degrees: number, wavelength: number) {
  const angle = (degrees * Math.PI) / 180;
  let direction: Point = { x: Math.cos(angle), y: Math.sin(angle) };
  const target = { x: 390, y: 269 };
  const origin = {
    x: target.x - direction.x * 950,
    y: target.y - direction.y * 950,
  };
  const entry = intersect(origin, direction);
  const points: Point[] = [origin];
  if (!entry) return { points, outgoing: false };
  points.push(entry.point);
  const index = 1.46 + 0.12 * (1 - wavelength);
  const inside = refract(direction, entry.normal, 1 / index);
  if (!inside) return { points, outgoing: false };
  direction = inside;
  let previous = entry;
  for (let bounce = 0; bounce < 4; bounce++) {
    const exit = intersect(previous.point, direction, previous.edge);
    if (!exit) break;
    points.push(exit.point);
    const outside = refract(direction, exit.normal, index);
    if (outside) {
      points.push({
        x: exit.point.x + outside.x * 1600,
        y: exit.point.y + outside.y * 1600,
      });
      return { points, outgoing: true };
    }
    const projection = 2 * dot(direction, exit.normal);
    direction = unit({
      x: direction.x - projection * exit.normal.x,
      y: direction.y - projection * exit.normal.y,
    });
    previous = exit;
  }
  return { points, outgoing: false };
}

export function drawOptics(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
  mood: number,
) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.scale(width / 1000, height / 620);

  context.strokeStyle = "rgba(178,204,214,.15)";
  context.lineWidth = 0.7;
  context.beginPath();
  context.arc(485, 305, 225, -0.35, Math.PI * 1.18);
  context.stroke();
  context.setLineDash([3, 8]);
  for (const [a, b] of [
    [
      { x: 120, y: 520 },
      { x: 905, y: 195 },
    ],
    [
      { x: 450, y: 60 },
      { x: 450, y: 535 },
    ],
  ]) {
    context.beginPath();
    context.moveTo(a!.x, a!.y);
    context.lineTo(b!.x, b!.y);
    context.stroke();
  }
  context.setLineDash([]);

  const offset = { x: 43, y: -31 };
  context.beginPath();
  prism.forEach((p, i) =>
    i === 0
      ? context.moveTo(p.x + offset.x, p.y + offset.y)
      : context.lineTo(p.x + offset.x, p.y + offset.y),
  );
  context.closePath();
  context.strokeStyle = "rgba(192,215,224,.4)";
  context.stroke();
  for (const p of prism) {
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + offset.x, p.y + offset.y);
    context.stroke();
  }

  // The family of rays shares one incident axis, with a wavelength-dependent index.
  const rays = 112;
  context.globalCompositeOperation = "screen";
  for (let i = 0; i < rays; i++) {
    const t = i / (rays - 1);
    const ray = traceRay(angle, t);
    const hue =
      mood === 1 ? 200 - t * 44 : mood === 2 ? 62 - t * 45 : 225 - t * 186;
    const saturation = mood === 1 ? 18 : 38;
    for (let segment = 1; segment < ray.points.length; segment++) {
      const a = ray.points[segment - 1]!;
      const b = ray.points[segment]!;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      if (segment === 1) {
        context.strokeStyle =
          mood === 2 ? "rgba(242,219,176,.018)" : "rgba(218,234,234,.018)";
        context.lineWidth = 2.5;
      } else {
        const beam = context.createLinearGradient(a.x, a.y, b.x, b.y);
        beam.addColorStop(0, `hsla(${hue},${saturation}%,72%,.26)`);
        beam.addColorStop(0.43, `hsla(${hue},${saturation}%,65%,.12)`);
        beam.addColorStop(1, `hsla(${hue},${saturation}%,60%,0)`);
        context.strokeStyle = beam;
        context.lineWidth = segment === ray.points.length - 1 ? 2 : 1;
      }
      context.stroke();
    }
  }
  context.globalCompositeOperation = "source-over";
  const surface = context.createLinearGradient(310, 150, 670, 445);
  surface.addColorStop(0, "rgba(190,222,231,.2)");
  surface.addColorStop(0.5, "rgba(225,239,234,.04)");
  surface.addColorStop(1, "rgba(181,211,224,.12)");
  context.beginPath();
  prism.forEach((p, i) =>
    i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y),
  );
  context.closePath();
  context.fillStyle = surface;
  context.fill();
  context.strokeStyle = "rgba(213,234,237,.84)";
  context.lineWidth = 1;
  context.stroke();

  // Small edge highlights give the transparent plane thickness without bloom.
  for (const p of prism) {
    context.beginPath();
    context.arc(p.x, p.y, 2, 0, Math.PI * 2);
    context.fillStyle = "#d8e8e7";
    context.fill();
  }
  context.restore();
}
