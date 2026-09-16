/**
 * 这份样本能算什么、不能算什么。
 *
 * 存在的理由只有一个：**报告不许假装完整**。
 *
 * 照着截图敲出来的记录没有逐条时间戳，于是回复间隔、等待次数、谁在开启对话
 * 全都算不出来。这时候如果界面照常显示「让你等超过 24 小时：0 次」，
 * 那是在撒谎 —— 真相是"不知道"，不是"零次"。
 *
 * 所以不可计算的指标要被显式标出来，并且在算失衡度之前先从输入里抹掉，
 * 免得一个算不出来的维度悄悄参与了打分。
 */
import type { RelationshipMetrics } from './metrics';

export type MetricKey = 'latency' | 'waiting' | 'trend' | 'initiation' | 'span';

export interface Coverage {
  hasTimestamps: boolean;
  /** 不可计算的指标。key 与报告里的行一一对应 */
  unavailable: { key: MetricKey; label: string; reason: string }[];
}

const NO_TIME = '这份记录没有逐条时间';

export function coverageOf(hasTimestamps: boolean): Coverage {
  if (hasTimestamps) return { hasTimestamps: true, unavailable: [] };
  return {
    hasTimestamps: false,
    unavailable: [
      { key: 'initiation', label: '谁在开启对话', reason: NO_TIME },
      { key: 'latency', label: '回复速度中位数', reason: NO_TIME },
      { key: 'waiting', label: '让对方等待超过 24 小时', reason: NO_TIME },
      { key: 'trend', label: '回复速度的变化趋势', reason: NO_TIME },
      { key: 'span', label: '记录跨了多少天', reason: NO_TIME },
    ],
  };
}

export const isUnavailable = (c: Coverage, k: MetricKey) =>
  c.unavailable.some(u => u.key === k);

/**
 * 把算不出来的字段抹成 null / 0，再交给 computeImbalance。
 *
 * 不抹的话，一个由序号时间戳伪造出来的「谁在开启对话」会照常参与打分，
 * 而用户看到的是一个他无法追溯来源的分数。
 */
export function maskForCoverage(m: RelationshipMetrics, c: Coverage): RelationshipMetrics {
  if (c.hasTimestamps) return m;
  return {
    ...m,
    myInitiationShare: null,
    otherLatencyTrendPct: null,
    me: { ...m.me, medianReplyMinutes: null, leftOtherWaiting: 0, initiations: 0 },
    other: { ...m.other, medianReplyMinutes: null, leftOtherWaiting: 0, initiations: 0 },
  };
}
