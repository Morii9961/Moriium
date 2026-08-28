export const DESIGN_CONCEPTS = {
  a: {
    id: 'A',
    name: '时间切片',
    note: '以克制的摄影切片建立首页记忆点，再用横向索引与独立页面承接完整博客内容。',
  },
  b: {
    id: 'B',
    name: '页边手记',
    note: '窄侧栏承担时间与导航，正文在宽阔页边之间保持稳定节奏。',
  },
  c: {
    id: 'C',
    name: '折页长信',
    note: '用贯穿页面的细线形成折页感，让照片、标题和段落沿纵向接续。',
  },
} as const;

export type DesignConcept = keyof typeof DESIGN_CONCEPTS;

export const PROTOTYPE_POSTS = [
  {
    date: '2026.05.10',
    title: '末次共振 -Final Resonance- 引言',
    summary: '关于结构停止回应以后，空间里仍未散去的回响。',
    category: '摄影',
  },
  {
    date: '2026.05.17',
    title: '末次共振 -Final Resonance- 2024篇',
    summary: '城市把过去留在栏杆、窗框、楼梯与反复触碰的表面。',
    category: '摄影',
  },
  {
    date: '2026.05.17',
    title: '末次共振 -Final Resonance- 2025篇',
    summary: '时间彼此接续，像海浪不断奔向同一片卵石海岸。',
    category: '摄影',
  },
  {
    date: '2026.05.17',
    title: '末次共振 -Final Resonance- 2026篇',
    summary: '现在、过去与未来彼此包含，也因此显得不可挽回。',
    category: '摄影',
  },
] as const;

export const PROTOTYPE_CATEGORIES = [
  { name: '摄影', count: 4, note: '城市、时间与观看' },
  { name: '旅行', count: 2, note: '路途、住处与地方记忆' },
  { name: '技术', count: 3, note: '建站、工具与实践记录' },
  { name: '随笔', count: 5, note: '不适合被压缩的日常' },
] as const;

export const PROTOTYPE_NOW = [
  {
    date: '2026.08',
    title: '正在重构 Moriium',
    note: '把旧站留下的阅读能力，放进一个更轻、更长久的静态博客。',
  },
  {
    date: '2026.08',
    title: '正在整理日本行程',
    note: '路线、睡眠和拍摄计划都在缓慢成形。',
  },
] as const;
