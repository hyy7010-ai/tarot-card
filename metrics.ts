import type { ChatMessage } from './types';

/**
 * 关系指标层
 *
 * 从聊天记录里算出可验证的客观事实，不做任何解读、不调用模型。
 * 上层（恋爱分析报告）只能基于这里的输出说话，避免模型凭语感编造。
 *
 * 纯函数、零依赖，可在浏览器或服务端运行。
 */

/** 间隔超过这个时长，视为一段新对话的开始，而不是一次回复 */
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;
/** 对方隔了这么久才接话，记为一次「晾着」 */
const UNANSWERED_MS = 24 * 60 * 60 * 1000;
/** 样本下限：低于此量的结论没有意义 */
const MIN_MESSAGES = 20;
const MIN_SPAN_DAYS = 3;
/** 趋势对比每半段至少需要的回复样本数 */
const MIN_TREND_SAMPLES = 4;

export interface SideMetrics {
  /** 消息条数 */
  messageCount: number;
  /** 平均每条字数 */
  avgLength: number;
  /** 提问条数（含 ? 或 ？） */
  questionCount: number;
  /** 发起过多少段对话 */
  initiations: number;
  /** 回复延迟中位数（分钟）；无有效样本时为 null */
  medianReplyMinutes: number | null;
  /** 让对方等待超过 24 小时的次数 */
  leftOtherWaiting: number;
}

export interface RelationshipMetrics {
  /** 样本是否足以支撑结论 */
  sufficient: boolean;
  /** 样本不足时说明原因 */
  insufficientReason?: string;
  /** 记录跨度（天） */
  spanDays: number;
  totalMessages: number;
  me: SideMetrics;
  other: SideMetrics;
  /** 我发起的对话占比 0~1；无对话段时为 null */
  myInitiationShare: number | null;
  /** 我的平均消息长度 ÷ 对方的；对方为 0 时为 null */
  lengthRatio: number | null;
  /**
   * 对方回复延迟的变化：后半段中位数相对前半段的百分比。
   * 正数 = 回得更慢了。样本不足时为 null。
   */
  otherLatencyTrendPct: number | null;
}

/** 把 ISO 字符串 / 毫秒数 / Firestore Timestamp 统一成毫秒 */
function toMillis(ts: unknown): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof ts === 'object') {
    const o = ts as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.toDate === 'function') return o.toDate().getTime();
    if (typeof o.seconds === 'number') return o.seconds * 1000;
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

interface Normalized {
  uid: string;
  ts: number;
  length: number;
  isQuestion: boolean;
}

/** 一个人连续说的一串话算一「轮」 */
interface Turn {
  uid: string;
  firstTs: number;
  lastTs: number;
}

function emptySide(): SideMetrics {
  return {
    messageCount: 0,
    avgLength: 0,
    questionCount: 0,
    initiations: 0,
    medianReplyMinutes: null,
    leftOtherWaiting: 0,
  };
}

/**
 * @param messages 一段会话的全部消息（顺序无所谓，内部会排序）
 * @param myUid    「我」的 uid，其余发送者一律归为对方
 */
export function computeRelationshipMetrics(
  messages: ChatMessage[],
  myUid: string,
): RelationshipMetrics {
  // 系统消息（破冰语等）不是任何一方说的，必须排除，否则会污染发起率
  const normalized: Normalized[] = [];
  for (const m of messages) {
    if (!m || m.senderId === 'system' || !m.senderId) continue;
    const ts = toMillis(m.timestamp);
    if (ts === null) continue;
    const text = m.text ?? '';
    normalized.push({
      uid: m.senderId,
      ts,
      // 图片/语音没有文本，长度记 0 但仍计入条数
      length: m.type === 'text' || m.type === undefined ? text.length : 0,
      isQuestion: /[?？]/.test(text),
    });
  }
  normalized.sort((a, b) => a.ts - b.ts);

  const me = emptySide();
  const other = emptySide();
  const side = (uid: string) => (uid === myUid ? me : other);

  const charTotal: Record<'me' | 'other', number> = { me: 0, other: 0 };
  for (const n of normalized) {
    const s = side(n.uid);
    s.messageCount += 1;
    if (n.isQuestion) s.questionCount += 1;
    charTotal[n.uid === myUid ? 'me' : 'other'] += n.length;
  }
  me.avgLength = me.messageCount ? round(charTotal.me / me.messageCount) : 0;
  other.avgLength = other.messageCount ? round(charTotal.other / other.messageCount) : 0;

  const spanMs = normalized.length > 1
    ? normalized[normalized.length - 1].ts - normalized[0].ts
    : 0;
  const spanDays = round(spanMs / 86_400_000);

  // 合并连续同一人的消息为「轮」。
  // 关键：只有间隔在会话窗口内才合并 —— 否则「昨晚最后一句」和「今早第一句」
  // 会被并成一轮，中间那段静默就消失了，重新发起也就永远算不到。
  const turns: Turn[] = [];
  for (const n of normalized) {
    const last = turns[turns.length - 1];
    if (last && last.uid === n.uid && n.ts - last.lastTs <= SESSION_GAP_MS) {
      last.lastTs = n.ts;
    } else {
      turns.push({ uid: n.uid, firstTs: n.ts, lastTs: n.ts });
    }
  }

  // 回复延迟 / 发起 / 晾着
  const latencies: { me: number[]; other: number[] } = { me: [], other: [] };
  const otherLatencySeries: { ts: number; ms: number }[] = [];

  if (turns.length > 0) side(turns[0].uid).initiations += 1;
  for (let i = 1; i < turns.length; i++) {
    const gap = turns[i].firstTs - turns[i - 1].lastTs;
    const responder = turns[i].uid;
    if (gap > SESSION_GAP_MS) {
      // 隔太久，算重新发起而不是回复
      side(responder).initiations += 1;
      // 先说话的是 turns[i-1]，隔了很久才接话的是 responder —— 让对方干等的是后者
      if (gap > UNANSWERED_MS) side(responder).leftOtherWaiting += 1;
    } else {
      latencies[responder === myUid ? 'me' : 'other'].push(gap);
      if (responder !== myUid) otherLatencySeries.push({ ts: turns[i].firstTs, ms: gap });
    }
  }

  const toMinutes = (ms: number | null) => (ms === null ? null : round(ms / 60_000));
  me.medianReplyMinutes = toMinutes(median(latencies.me));
  other.medianReplyMinutes = toMinutes(median(latencies.other));

  const totalInitiations = me.initiations + other.initiations;
  const myInitiationShare = totalInitiations
    ? round(me.initiations / totalInitiations, 3)
    : null;
  const lengthRatio = other.avgLength ? round(me.avgLength / other.avgLength, 2) : null;

  // 对方回复速度的变化趋势：按时间对半切，比中位数
  let otherLatencyTrendPct: number | null = null;
  if (otherLatencySeries.length >= MIN_TREND_SAMPLES * 2) {
    const half = Math.floor(otherLatencySeries.length / 2);
    const early = median(otherLatencySeries.slice(0, half).map(x => x.ms));
    const late = median(otherLatencySeries.slice(half).map(x => x.ms));
    if (early && late) otherLatencyTrendPct = round(((late - early) / early) * 100);
  }

  const totalMessages = normalized.length;
  let insufficientReason: string | undefined;
  if (totalMessages < MIN_MESSAGES) {
    insufficientReason = `消息仅 ${totalMessages} 条，不足 ${MIN_MESSAGES} 条`;
  } else if (spanDays < MIN_SPAN_DAYS) {
    insufficientReason = `记录仅跨 ${spanDays} 天，不足 ${MIN_SPAN_DAYS} 天`;
  } else if (me.messageCount === 0 || other.messageCount === 0) {
    insufficientReason = '只有单方发言';
  }

  return {
    sufficient: !insufficientReason,
    insufficientReason,
    spanDays,
    totalMessages,
    me,
    other,
    myInitiationShare,
    lengthRatio,
    otherLatencyTrendPct,
  };
}

// ---------------------------------------------------------------------------
// 投入失衡度
// ---------------------------------------------------------------------------

export type ImbalanceBand = 'balanced' | 'mild' | 'clear' | 'severe';

export interface Imbalance {
  /** 0–100，越高越失衡 */
  score: number;
  band: ImbalanceBand;
  /** 各维度得分，用于指出主要失衡来源 */
  drivers: { key: string; label: string; score: number }[];
  /** 失衡最严重的维度 */
  topDriver: { key: string; label: string; score: number } | null;
  /** 失衡方向：'me' = 我投入更多，'other' = 对方投入更多，null = 均衡 */
  leaning: 'me' | 'other' | null;
}

/** 把「我 : 对方」的比值映射到 0–100 的偏离度。相等为 0，一方是另一方 5 倍以上为 100 */
function ratioToScore(mine: number, theirs: number): number {
  if (mine <= 0 && theirs <= 0) return 0;
  const hi = Math.max(mine, theirs);
  const lo = Math.min(mine, theirs);
  if (hi === 0) return 0;
  const ratio = lo === 0 ? 5 : hi / lo;      // 一方为 0 视为 5 倍
  return Math.round(Math.min(100, ((Math.min(ratio, 5) - 1) / 4) * 100));
}

const BANDS: { max: number; band: ImbalanceBand }[] = [
  { max: 25, band: 'balanced' },
  { max: 50, band: 'mild' },
  { max: 75, band: 'clear' },
  { max: 101, band: 'severe' },
];

export const IMBALANCE_LABEL: Record<ImbalanceBand, string> = {
  balanced: '基本均衡',
  mild: '轻微失衡',
  clear: '明显失衡',
  severe: '严重失衡',
};

/**
 * 由指标算出投入失衡度。纯函数、可测，绝不经过模型——
 * 这个数字要能被追问「怎么算出来的」，所以口径必须固定。
 */
export function computeImbalance(m: RelationshipMetrics): Imbalance {
  const drivers: { key: string; label: string; score: number }[] = [];

  if (m.myInitiationShare !== null) {
    // 发起率：偏离 50% 的程度，全由一方发起为 100
    drivers.push({
      key: 'initiation',
      label: '谁在开启对话',
      score: Math.round(Math.abs(m.myInitiationShare - 0.5) * 2 * 100),
    });
  }
  if (m.me.medianReplyMinutes !== null && m.other.medianReplyMinutes !== null) {
    drivers.push({
      key: 'latency',
      label: '回复速度',
      score: ratioToScore(m.me.medianReplyMinutes, m.other.medianReplyMinutes),
    });
  }
  if (m.me.avgLength > 0 || m.other.avgLength > 0) {
    drivers.push({ key: 'length', label: '消息长度', score: ratioToScore(m.me.avgLength, m.other.avgLength) });
  }
  if (m.me.questionCount > 0 || m.other.questionCount > 0) {
    drivers.push({ key: 'questions', label: '提问次数', score: ratioToScore(m.me.questionCount, m.other.questionCount) });
  }

  const score = drivers.length
    ? Math.round(drivers.reduce((a, d) => a + d.score, 0) / drivers.length)
    : 0;
  const band = BANDS.find(b => score < b.max)!.band;
  const topDriver = drivers.length
    ? drivers.reduce((a, b) => (b.score > a.score ? b : a))
    : null;

  // 方向：看「我」是否在多数维度上投入更多
  let mine = 0, theirs = 0;
  if (m.myInitiationShare !== null) (m.myInitiationShare > 0.5 ? mine++ : theirs++);
  if (m.me.medianReplyMinutes !== null && m.other.medianReplyMinutes !== null)
    (m.me.medianReplyMinutes < m.other.medianReplyMinutes ? mine++ : theirs++);
  if (m.me.avgLength !== m.other.avgLength) (m.me.avgLength > m.other.avgLength ? mine++ : theirs++);
  if (m.me.questionCount !== m.other.questionCount) (m.me.questionCount > m.other.questionCount ? mine++ : theirs++);
  const leaning = band === 'balanced' ? null : mine > theirs ? 'me' : theirs > mine ? 'other' : null;

  return { score, band, drivers, topDriver, leaning };
}

/**
 * 「我」在某一维度上的投入占比（0–100），用于对照条的填充宽度。
 *
 * lowerIsMore：该维度数值越小代表投入越多（回复延迟就是这样——
 * 回得越快说明越在意）。这个方向极易写反，所以抽成纯函数并加测试锁住。
 */
export function investmentSharePercent(
  mine: number,
  theirs: number,
  lowerIsMore = false,
): number {
  const total = mine + theirs;
  if (!Number.isFinite(total) || total <= 0) return 50;   // 双方都为 0 时视为持平
  const raw = (mine / total) * 100;
  const pct = lowerIsMore ? 100 - raw : raw;
  // 夹到 6–94：两端留一点，避免 0% 看起来像没渲染、100% 盖住对方标签
  return Math.round(Math.max(6, Math.min(94, pct)));
}
