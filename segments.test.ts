import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAt, timeRange } from './segments';
import type { ChatMessage } from './types';

const DAY = 86400000;
const T0 = Date.parse('2026-01-01T09:00:00Z');

/**
 * 造一段对话：n 条，我和 TA 交替，间隔 gap 分钟，从 start 开始。
 *
 * ⚠️ 间隔要给够：metrics.ts 除了 MIN_MESSAGES=20 还有 MIN_SPAN_DAYS=3。
 *    第一版按 5 分钟一条造数据，40 条只跨 3 小时，于是两段都被正确地判成
 *    「记录仅跨 0 天」—— 是测试数据不对，不是代码不对。
 */
function chat(n: number, start: number, gapMin: number, myLen = 20, otherLen = 20): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${start}-${i}`,
    senderId: i % 2 === 0 ? 'me' : 'other',
    text: 'x'.repeat(i % 2 === 0 ? myLen : otherLen),
    timestamp: start + i * gapMin * 60000,
  }));
}

test('切成两段，各算各的', () => {
  // 前段：双方都写 20 字。后段：我写 60 字，TA 写 3 字 —— 后段该更失衡
  const msgs = [...chat(40, T0, 180), ...chat(40, T0 + 60 * DAY, 180, 60, 3)];
  const r = splitAt(msgs, 'me', T0 + 30 * DAY, true)!;

  assert.equal(r.before.count, 40);
  assert.equal(r.after.count, 40);
  assert.ok(r.before.imbalance, '前段应该算得出');
  assert.ok(r.after.imbalance, '后段应该算得出');
  assert.ok(
    r.after.imbalance!.score > r.before.imbalance!.score,
    `后段该更失衡，实际 前${r.before.imbalance!.score} 后${r.after.imbalance!.score}`,
  );
  assert.equal(r.delta, r.after.imbalance!.score - r.before.imbalance!.score);
});

test('⚠️ 某一段太短就不给分数，而不是给一个看着像真的数', () => {
  // 后段只有 6 条，达不到 MIN_MESSAGES=20
  const msgs = [...chat(40, T0, 180), ...chat(6, T0 + 60 * DAY, 180)];
  const r = splitAt(msgs, 'me', T0 + 30 * DAY, true)!;

  assert.ok(r.before.imbalance, '前段够长');
  assert.equal(r.after.imbalance, null, '后段太短，不许给分');
  assert.ok(r.after.reason, '要说出为什么算不出');
  assert.equal(r.delta, null, '有一段算不出，差值就没有意义');
});

test('没有逐条时间戳就切不了 —— 截图/手敲的记录上不了时间线', () => {
  const msgs = chat(40, T0, 180);
  assert.equal(splitAt(msgs, 'me', T0 + 10 * DAY, false), null);
});

test('切点落在范围外时返回 null，而不是返回一个空段', () => {
  const msgs = chat(40, T0, 180);
  assert.equal(splitAt(msgs, 'me', T0 - DAY, true), null, '切点在最早之前');
  assert.equal(splitAt(msgs, 'me', T0 + 999 * DAY, true), null, '切点在最晚之后');
});

test('读不出时间的消息被丢掉，不硬塞进某一段', () => {
  const msgs: ChatMessage[] = [
    ...chat(40, T0, 180),
    { id: 'bad', senderId: 'me', text: '坏时间戳', timestamp: '不是时间' },
    ...chat(40, T0 + 60 * DAY, 180),
  ];
  const r = splitAt(msgs, 'me', T0 + 30 * DAY, true)!;
  assert.equal(r.before.count + r.after.count, 80, '那条坏的不该出现在任何一段里');
});

test('timeRange：全挤在同一时刻时不给范围（手敲记录退化成序号）', () => {
  const same: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
    id: `s${i}`, senderId: 'me', text: 'x', timestamp: T0,
  }));
  assert.equal(timeRange(same), null);
  assert.deepEqual(timeRange(chat(10, T0, 60)), { from: T0, to: T0 + 9 * 3600000 });
});
