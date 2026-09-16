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
