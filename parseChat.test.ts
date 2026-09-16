import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChat } from './parseChat.js';

/**
 * 聊天导出里的时间是**本地时间**，解析器也按本地时间建时间戳。
 * 断言必须用本地字段读回来，用 toISOString() 会被时区偏移带偏。
 */
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

test('形态一：时间在前，内容另起一行', () => {
  const r = parseChat(`2026-08-01 10:00:00 张三
在吗？
2026-08-01 10:20:00 李四
在`);
  assert.equal(r.messages.length, 2);
  assert.deepEqual(r.speakers, ['张三', '李四']);
  assert.equal(r.messages[0].text, '在吗？');
  assert.equal(hhmm(r.messages[0].timestamp as number), '10:00');
  assert.equal(r.unparsed.length, 0);
});

test('形态二：[时间] 名字: 内容 单行', () => {
  const r = parseChat(`[2026-08-01 10:00] 张三: 在吗
[2026-08-01 10:05] 李四：在`);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[1].senderId, '李四');
  assert.equal(r.messages[1].text, '在');
});

test('形态三：名字在前，时间在后', () => {
  const r = parseChat(`张三 2026/8/1 10:00
在吗
李四 2026/8/1 10:30
在`);
  assert.equal(r.messages.length, 2);
  assert.deepEqual(r.speakers, ['张三', '李四']);
});

test('多行消息合并成一条', () => {
  const r = parseChat(`2026-08-01 10:00:00 张三
第一行
第二行`);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].text, '第一行\n第二行');
});

test('只有头部没有内容的消息被丢弃，不拉低平均字数', () => {
  const r = parseChat(`2026-08-01 10:00:00 张三
2026-08-01 10:01:00 李四
在`);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].senderId, '李四');
});

test('读不懂的开头行原样报回，不猜时间戳', () => {
  const r = parseChat(`—— 以下是聊天记录 ——
随便一行
2026-08-01 10:00:00 张三
在吗`);
  assert.deepEqual(r.unparsed, ['—— 以下是聊天记录 ——', '随便一行']);
  assert.equal(r.messages.length, 1);
});

test('带标点的行不会被误判成人名', () => {
  // 「我今天很累，2026/8/1 10:00」这种内容行不该被当成头部
  const r = parseChat(`2026-08-01 10:00:00 张三
我今天很累，2026/8/1 10:00 就睡了`);
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].text, '我今天很累，2026/8/1 10:00 就睡了');
});

test('空输入不抛错', () => {
  for (const v of ['', '   ', undefined as never]) {
    const r = parseChat(v);
    assert.equal(r.messages.length, 0);
    assert.equal(r.speakers.length, 0);
  }
});

test('产出的形状能直接喂给 metrics', async () => {
  const { computeRelationshipMetrics } = await import('./metrics.js');
  const lines: string[] = [];
  for (let d = 0; d < 12; d++) {
    lines.push(`2026-08-${String(d + 1).padStart(2, '0')} 10:00:00 我`, '在吗？今天怎么样');
    lines.push(`2026-08-${String(d + 1).padStart(2, '0')} 11:30:00 他`, '嗯');
  }
  const r = parseChat(lines.join('\n'));
  assert.equal(r.messages.length, 24);
  const m = computeRelationshipMetrics(r.messages, '我');
  assert.equal(m.sufficient, true);
  assert.equal(m.totalMessages, 24);
});

test('无时间戳的记录：`名字: 内容` 也能读，并如实报告没有时间', async () => {
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) { lines.push('我: 在吗？今天怎么样'); lines.push('他: 嗯'); }
  const r = parseChat(lines.join('\n'));
  assert.equal(r.hasTimestamps, false);
  assert.equal(r.messages.length, 24);
  assert.deepEqual(r.speakers, ['我', '他']);
});

test('有时间戳时不启用无时间戳形态，正文里的「名字：」不会被误判', async () => {
  const r = parseChat(`2026-08-01 10:00:00 张三
李四：你说得对
2026-08-01 10:05:00 李四
嗯`);
  assert.equal(r.hasTimestamps, true);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[0].text, '李四：你说得对');
});

test('无时间戳时，依赖时间的指标自己就返回 null，不会编出假数字', async () => {
  const { computeRelationshipMetrics } = await import('./metrics.js');
  const { coverageOf, maskForCoverage, isUnavailable } = await import('./coverage.js');
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) { lines.push('我: 在吗？今天怎么样'); lines.push('他: 嗯'); }
  const r = parseChat(lines.join('\n'));
  const m = computeRelationshipMetrics(r.messages, '我');
  assert.equal(m.sufficient, true, '序号步长要足够大，否则会被判样本不足');
  // metrics 自己就算不出来
  assert.equal(m.me.medianReplyMinutes, null);
  assert.equal(m.other.medianReplyMinutes, null);
  assert.equal(m.otherLatencyTrendPct, null);

  const cov = coverageOf(r.hasTimestamps);
  // 开启对话 / 回复速度 / 等待次数 / 趋势 / 跨了多少天 —— 五项都依赖真实时间
  assert.equal(cov.unavailable.length, 5);
  assert.ok(isUnavailable(cov, 'waiting'));
  assert.ok(isUnavailable(cov, 'span'), '跨度也是假的：那是序号步长算出来的');

  // 抹掉之后，被序号污染的「谁在开启对话」不再参与打分
  const masked = maskForCoverage(m, cov);
  assert.equal(masked.myInitiationShare, null);
  assert.equal(masked.other.leftOtherWaiting, 0);
  // 字数和提问仍然是真的
  assert.ok(masked.me.avgLength > masked.other.avgLength);
  assert.ok(masked.me.questionCount > 0);
});

test('有时间戳时 coverage 不遮挡任何指标', async () => {
  const { coverageOf, maskForCoverage } = await import('./coverage.js');
  const { computeRelationshipMetrics } = await import('./metrics.js');
  const lines: string[] = [];
  for (let d = 1; d <= 12; d++) {
    const dd = String(d).padStart(2, '0');
    lines.push(`2026-08-${dd} 09:00 我`, '在吗？今天怎么样');
    lines.push(`2026-08-${dd} 09:40 他`, '嗯');
  }
  const r = parseChat(lines.join('\n'));
  const cov = coverageOf(r.hasTimestamps);
  assert.equal(cov.unavailable.length, 0);
  const m = computeRelationshipMetrics(r.messages, '我');
  assert.deepEqual(maskForCoverage(m, cov), m);
  assert.notEqual(m.other.medianReplyMinutes, null);
});

// ---------------------------------------------------------------------------
// WhatsApp 导出。唯一一个「一键导出」真实存在的平台，之前一条都读不出来。
// ---------------------------------------------------------------------------

const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('WhatsApp：年在前，逗号分隔', () => {
  const r = parseChat(`[2026/8/1, 10:00:00] 我: 在忙吗
[2026/8/1, 10:24:11] 阿泽: 哦是吗`);
  assert.equal(r.messages.length, 2);
  assert.equal(r.hasTimestamps, true);
  assert.deepEqual(r.speakers, ['我', '阿泽']);
  assert.equal(ymd(r.messages[0].timestamp as number), '2026-08-01');
  assert.equal(hhmm(r.messages[1].timestamp as number), '10:24');
  assert.equal(r.unparsed.length, 0);
});

test('WhatsApp：破折号变体，无方括号', () => {
  const r = parseChat(`2026/8/1, 10:00 - 我: 在忙吗
2026/8/1, 10:24 - 阿泽: 哦是吗`);
  assert.equal(r.messages.length, 2);
  assert.equal(r.messages[1].text, '哦是吗');
  assert.equal(r.hasTimestamps, true);
});

test('WhatsApp：12 小时制的 PM 要加 12 小时，12 AM 是零点', () => {
  const r = parseChat(`[1/8/2026, 12:05:00 AM] Me: one
[13/8/2026, 9:30:00 PM] Alex: two`);
  assert.equal(r.messages.length, 2);
  assert.equal(hhmm(r.messages[0].timestamp as number), '00:05');
  assert.equal(hhmm(r.messages[1].timestamp as number), '21:30');
});

test('WhatsApp：日在前（13 只能是日），解析成 8 月 13 日', () => {
  const r = parseChat(`[13/8/2026, 09:00:00] 我: a
[14/8/2026, 09:00:00] 阿泽: b`);
  assert.equal(ymd(r.messages[0].timestamp as number), '2026-08-13');
  assert.equal(r.hasTimestamps, true);
});

test('WhatsApp：月在前（13 在次位），解析成 8 月 13 日', () => {
  const r = parseChat(`[8/13/2026, 09:00:00] 我: a
[8/14/2026, 09:00:00] 阿泽: b`);
  assert.equal(ymd(r.messages[0].timestamp as number), '2026-08-13');
  assert.equal(r.hasTimestamps, true);
});

test('WhatsApp：日月分不清又跨了天，就不认时间戳', () => {
  // 1/8 和 2/8 都在 1–12 内：可能是 1 月 8 日，也可能是 8 月 1 日。
  // 猜错就是七个月的误差，所以宁可作废时间，让报告标成不可计算。
  const r = parseChat(`[1/8/2026, 09:00:00] 我: a
[2/8/2026, 09:00:00] 阿泽: b`);
  assert.equal(r.messages.length, 2, '消息本身照读，只是时间不认');
  assert.equal(r.hasTimestamps, false);
});

test('WhatsApp：分不清但只有一天，那天怎么解释都一样，可以认', () => {
  const r = parseChat(`[1/8/2026, 09:00:00] 我: a
[1/8/2026, 09:40:00] 阿泽: b`);
  assert.equal(r.hasTimestamps, true);
  assert.equal(hhmm(r.messages[1].timestamp as number), '09:40');
});

test('WhatsApp：肉眼看不见的方向标记和窄空格不该挡住解析', () => {
  const r = parseChat('‎[1/8/2026, 9:30:00 PM] Me: hi');
  assert.equal(r.messages.length, 1);
  assert.equal(hhmm(r.messages[0].timestamp as number), '21:30');
});

test('WhatsApp：读不懂的系统行原样报回去，不算进消息', () => {
  const r = parseChat(`Messages and calls are end-to-end encrypted.
[13/8/2026, 10:00:00] 我: 在忙吗`);
  assert.equal(r.messages.length, 1);
  assert.equal(r.unparsed.length, 1);
});
