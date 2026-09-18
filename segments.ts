/**
 * 把一份聊天记录从某个时间点切成两段，各算各的。
 *
 * 为什么要有它：`失衡度 80` 是一个点，而关系是有阶段的。
 * 同一份三年的记录，「整体 80」和「前半年 41、后两年半 78」是完全不同的两件事，
 * 后者才说得出发生过什么。
 *
 * ⚠️ 这不是新概念，是把已有的东西推广了一下 ——
 *    `metrics.ts` 里的 otherLatencyTrendPct 早就在从**正中间**切一刀比前后，
 *    只是切点写死、而且只看回复速度。这里把「切在哪」交给用户，
 *    把「切完算什么」交给原来那套完整指标。
 *
 * 分工是这个模块存在的理由，也是它和产品立场一致的地方：
 *   **用户负责问哪里**（这个点之前之后变了没有），
 *   **代码负责答多少**（两段各自的数字）。
 * 用户写的标签只是个名字，一个字都不参与计算，也不发给模型。
 */
import {
  computeRelationshipMetrics, computeImbalance, toMillis,
  type RelationshipMetrics, type Imbalance,
} from './metrics';
import { coverageOf, maskForCoverage } from './coverage';
import type { ChatMessage } from './types';

export interface Segment {
  /** 「之前」/「之后」 */
  side: 'before' | 'after';
  /** 这一段的消息条数 */
  count: number;
  /** 这一段第一条和最后一条的时间 */
  from: number;
  to: number;
  metrics: RelationshipMetrics;
  /** 样本不足时为 null —— 一段太短就不给它一个看着像真的分数 */
  imbalance: Imbalance | null;
  /** 算不出的原因。能算就是 null */
  reason: string | null;
}

export interface SplitResult {
  before: Segment;
  after: Segment;
  /** 失衡度的变化。任一段算不出就是 null */
  delta: number | null;
}

/** 整份记录的时间范围。没有可用时间戳就返回 null（滑块也就没法给） */
export function timeRange(messages: ChatMessage[]): { from: number; to: number } | null {
  const ts = messages.map(m => toMillis(m.timestamp)).filter((x): x is number => x !== null);
  if (ts.length < 2) return null;
  const from = Math.min(...ts);
  const to = Math.max(...ts);
  // 全部挤在同一时刻（手敲记录退化成的序号时间）切了也没意义
  return to - from > 0 ? { from, to } : null;
}

function makeSegment(
  side: Segment['side'],
  msgs: ChatMessage[],
  myUid: string,
  hasTimestamps: boolean,
): Segment {
  const raw = computeRelationshipMetrics(msgs, myUid);
  // 和整份报告同一条规矩：算不出的字段先抹掉，再让它参与打分
  const cov = coverageOf(hasTimestamps);
  const metrics = maskForCoverage(raw, cov);
  const ts = msgs.map(m => toMillis(m.timestamp)).filter((x): x is number => x !== null);

  return {
    side,
    count: msgs.length,
    from: ts.length ? Math.min(...ts) : 0,
    to: ts.length ? Math.max(...ts) : 0,
    metrics,
    /*
      样本不足就**不给分数**。
      切太碎时每段都凑不够 MIN_MESSAGES，硬给一个 73 会让人以为那是测出来的。
      这和 coverage.ts 是同一条规矩：宁可说算不出。
    */
    imbalance: metrics.sufficient ? computeImbalance(metrics) : null,
    reason: metrics.sufficient ? null : (metrics.insufficientReason || '这一段太短'),
  };
}

/**
 * 在 `at` 处切开。返回 null 表示这份记录根本切不了
 * （没有逐条时间，或者切点落在范围外导致某一段是空的）。
 */
export function splitAt(
  messages: ChatMessage[],
  myUid: string,
  at: number,
  hasTimestamps: boolean,
): SplitResult | null {
  if (!hasTimestamps) return null;

  const before: ChatMessage[] = [];
  const after: ChatMessage[] = [];
  for (const m of messages) {
    const t = toMillis(m.timestamp);
    if (t === null) continue;          // 读不出时间的丢掉，不硬塞进某一段
    (t < at ? before : after).push(m);
  }
  // 一边是空的说明切点在范围外，那不是「分段」，是原样
  if (!before.length || !after.length) return null;

  const b = makeSegment('before', before, myUid, hasTimestamps);
  const a = makeSegment('after', after, myUid, hasTimestamps);

  return {
    before: b,
    after: a,
    // 只有两段都算得出，差值才有意义
    delta: b.imbalance && a.imbalance ? a.imbalance.score - b.imbalance.score : null,
  };
}
