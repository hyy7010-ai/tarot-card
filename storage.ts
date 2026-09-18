/**
 * 这份聊天记录要不要留在这台设备上，由用户自己决定。
 *
 * 默认**不留**：不选就只活在内存里，关掉标签页就没了。
 * 选了才写进 localStorage，而且首页永远给一个「删掉」的出口。
 *
 * 写进去的是解析后的 ChatMessage[]，也就是聊天原文。
 * 所以这个开关必须说清楚它意味着什么，不能含糊成一句「记住我」。
 */
import type { ChatMessage } from './types';

const KEY = 'realheart.session.v1';

export interface StoredSession {
  messages: ChatMessage[];
  myUid: string;
  otherName: string;
  /** 这份记录有没有逐条时间戳；旧版本存的没有这个字段，读回来当 true */
  hasTimestamps?: boolean;
  /** 存下来的时间，首页要显示「什么时候导入的」 */
  savedAt: number;
}

export function saveSession(s: Omit<StoredSession, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* 隐私模式 / 配额满：存不下就当没存，不打断用户 */
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredSession;
    // 结构对不上就当没有 —— 宁可让人重新导入，也不要拿半个对象去算指标
    if (!Array.isArray(v?.messages) || typeof v?.myUid !== 'string') return null;
    return v;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* 同上 */ }
}


/* ---------------------------------------------------------------------------
 * 解读历史
 *
 * 存在的理由，来自这个产品最初的那个挫败：
 * 拿聊天记录去问 ChatGPT，问题不是它答得不好，是**它留不住** ——
 * 问多了变慢，新开一个会话就全忘了。
 *
 * 而这个应用之前犯了一模一样的毛病：它记住了聊天记录，却忘掉你问过的每一个
 * 问题和每一段解读（`reset()` 里一句 setReading(null) 就没了）。
 *
 * 攒起来之后多出来的那样东西，是单次抽牌给不了的：
 * **你问题的变化本身就是答案。** 一月问「TA还在意我吗」、三月问「我该退回来吗」，
 * 那条线比任何一次解读都硬。所以这里连当时的失衡度和证据一起存 ——
 * 三个月后重新导一次记录，80 变成 62 还是 91，是数出来的，不是谁说的。
 *
 * 和聊天记录的存储策略不同，这里**默认就存**：
 * 聊天原文是敏感的、所以要用户主动选；而解读是你自己要留的东西，
 * 不留下来这个功能就不存在。代价是必须让删除随手可及 —— 见 deleteReading / clearReadings。
 * ------------------------------------------------------------------------- */

const READINGS_KEY = 'realheart.readings.v1';

/**
 * 最多留 50 条。localStorage 通常只有 5MB，而一次解读带全文和证据大约 1–2KB，
 * 50 条够用到「看得出变化」，又不至于哪天写满了静默失败。
 */
const MAX_READINGS = 50;

export interface StoredReading {
  id: string;
  /** 抽这一次的时间 */
  at: number;
  question: string;
  /** 牌阵名，例如「关系牌阵」 */
  spread: string;
  cards: { name: string; reversed: boolean; position: string }[];
  /** 解读全文。存原文不存摘要 —— 摘要是二次加工，而这里要的是当时到底说了什么 */
  text: string;
  /** 当时那几条证据。没接记录时是空数组 */
  facts: string[];
  /** 当时的失衡度。没接记录时是 null */
  imbalance: { score: number; band: string } | null;
}

export function saveReading(r: Omit<StoredReading, 'id' | 'at'>): void {
  try {
    const all = loadReadings();
    const one: StoredReading = {
      ...r,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
    };
    // 新的放前面，超出上限就从最旧的砍
    localStorage.setItem(READINGS_KEY, JSON.stringify([one, ...all].slice(0, MAX_READINGS)));
  } catch {
    /* 隐私模式 / 配额满：存不下就当没存，不打断用户 */
  }
}

/** 新的在前。结构对不上的条目直接丢掉，不拿半个对象去渲染 */
export function loadReadings(): StoredReading[] {
  try {
    const raw = localStorage.getItem(READINGS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((r: StoredReading) =>
      r && typeof r.id === 'string' && typeof r.text === 'string' && Array.isArray(r.cards));
  } catch {
    return [];
  }
}

export function deleteReading(id: string): void {
  try {
    localStorage.setItem(READINGS_KEY, JSON.stringify(loadReadings().filter(r => r.id !== id)));
  } catch { /* 同上 */ }
}

export function clearReadings(): void {
  try { localStorage.removeItem(READINGS_KEY); } catch { /* 同上 */ }
}
