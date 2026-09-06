import { computeRelationshipMetrics as compute, computeImbalance, IMBALANCE_LABEL, investmentSharePercent } from './metrics';
import type { ChatMessage } from './types';

/**
 * metrics.ts 的测试。无需测试框架：
 *   npm test
 * 内部用 tsc 编译后交给 node 直接跑。
 */

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ✅ ${name} = ${JSON.stringify(got)}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}\n       期望 ${JSON.stringify(want)}\n       实际 ${JSON.stringify(got)}`);
  }
}

const T = Date.parse('2026-01-01T10:00:00Z');
/** T 之后 min 分钟的 ISO 时间戳 */
const at = (min: number) => new Date(T + min * 60_000).toISOString();
const msg = (senderId: string, text: string, min: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: `${senderId}-${min}`, senderId, text, timestamp: at(min), ...extra });

// ---------------------------------------------------------------
console.log('\n【用例 1】手算已知答案');
// 1. me  0min    "在吗？"        3 字，提问
// 2. you 5min    "在"            → you 回复延迟 5min
// 3. me  6min    "今天天气不错"   → me  回复延迟 1min
// 4. you 126min  "嗯"            → you 回复延迟 120min
// 5. me  1800min "早"            → 距上条 27.9h：me 重新发起，且让对方等了 >24h
const m1 = compute([
  msg('me', '在吗？', 0),
  msg('you', '在', 5),
  msg('me', '今天天气不错', 6),
  msg('you', '嗯', 126),
  msg('me', '早', 1800),
], 'me');

eq('me.messageCount', m1.me.messageCount, 3);
eq('me.avgLength（10 字 / 3 条）', m1.me.avgLength, 3.3);
eq('me.questionCount', m1.me.questionCount, 1);
eq('me.initiations', m1.me.initiations, 2);
eq('me.medianReplyMinutes', m1.me.medianReplyMinutes, 1);
eq('me.leftOtherWaiting', m1.me.leftOtherWaiting, 1);
eq('other.messageCount', m1.other.messageCount, 2);
eq('other.avgLength', m1.other.avgLength, 1);
eq('other.initiations', m1.other.initiations, 0);
eq('other.medianReplyMinutes（5 与 120 的中位）', m1.other.medianReplyMinutes, 62.5);
eq('other.leftOtherWaiting', m1.other.leftOtherWaiting, 0);
eq('myInitiationShare', m1.myInitiationShare, 1);
eq('lengthRatio', m1.lengthRatio, 3.3);
eq('spanDays（30 小时）', m1.spanDays, 1.3);
eq('趋势样本不足 → null', m1.otherLatencyTrendPct, null);
eq('sufficient', m1.sufficient, false);
eq('insufficientReason', m1.insufficientReason, '消息仅 5 条，不足 20 条');

// ---------------------------------------------------------------
console.log('\n【用例 2】边界情况');
eq('空数组不崩溃', compute([], 'me').sufficient, false);
eq('空数组 totalMessages', compute([], 'me').totalMessages, 0);
eq('系统消息（破冰语）被排除', compute([
  msg('system', '✨ 灵魂匹配已建立', 0),
  msg('me', 'hi', 1),
], 'me').totalMessages, 1);
eq('无法解析的时间戳被丢弃', compute([
  { id: 'bad', senderId: 'me', text: 'a', timestamp: 'not-a-date' },
  msg('me', 'b', 1),
], 'me').totalMessages, 1);
eq('只有单方发言判为样本不足', compute(
  Array.from({ length: 30 }, (_, i) => msg('me', 'x', i * 300)), 'me',
).insufficientReason, '只有单方发言');
eq('兼容 Firestore Timestamp', compute([
  { id: 'ts', senderId: 'me', text: 'a', timestamp: { seconds: Math.floor(T / 1000), nanoseconds: 0 } },
], 'me').totalMessages, 1);
eq('图片消息计入条数但不计字数', compute([
  msg('me', 'https://x/y.png', 0, { type: 'image' }),
], 'me').me.avgLength, 0);

// ---------------------------------------------------------------
console.log('\n【用例 3】30 天真实场景：我热切 / 对方逐渐冷淡');
const many: ChatMessage[] = [];
for (let d = 0; d < 30; d++) {
  const base = d * 1440 + 600;
  many.push(msg('me', '早呀，今天有什么安排吗？', base));
  // 对方回复延迟从 5 分钟线性拉长到 400 分钟
  const lag = Math.round(5 + (d / 29) * 395);
  many.push(msg('you', '嗯', base + lag));
  many.push(msg('me', '那我们周末要不要一起去看那个展？我看评价挺好的', base + lag + 2));
  if (d % 3 !== 2) many.push(msg('you', '再说吧', base + lag + 90));
}
const m3 = compute(many, 'me');
eq('样本充足', m3.sufficient, true);
eq('我发起了绝大多数对话', m3.myInitiationShare! > 0.8, true);
eq('对方回复明显更慢', m3.other.medianReplyMinutes! > m3.me.medianReplyMinutes! * 10, true);
eq('我的消息长得多', m3.lengthRatio! > 5, true);
eq('只有我在提问', m3.other.questionCount === 0 && m3.me.questionCount > 0, true);
eq('对方回复速度在变慢（趋势为正）', m3.otherLatencyTrendPct! > 0, true);
console.log('\n  实际输出：');
console.log(JSON.stringify(m3, null, 2).split('\n').map(l => '  ' + l).join('\n'));


// ---------------------------------------------------------------
console.log('\n【用例 4】投入失衡度');
// 完全对称的会话 → 应判为基本均衡
const sym: ChatMessage[] = [];
for (let d = 0; d < 12; d++) {
  const base = d * 1440 + 600;
  sym.push(msg(d % 2 === 0 ? 'me' : 'you', '今天过得怎么样呀', base));
  sym.push(msg(d % 2 === 0 ? 'you' : 'me', '还不错，你呢一切都好吗', base + 5));
}
const bSym = computeImbalance(compute(sym, 'me'));
eq('对称会话 → 均衡', bSym.band, 'balanced');
eq('对称会话 → 无方向', bSym.leaning, null);
eq('对称会话分数很低', bSym.score < 25, true);

// 严重单边：我热切、对方冷淡（复用用例 3 的数据）
const bSkew = computeImbalance(m3);
eq('单边会话 → 严重失衡', bSkew.band, 'severe');
eq('方向指向我投入更多', bSkew.leaning, 'me');
eq('分数落在 75-100', bSkew.score >= 75 && bSkew.score <= 100, true);
eq('主要失衡来源存在', bSkew.topDriver !== null, true);
eq('四个维度都参与了计算', bSkew.drivers.length, 4);
console.log('    实际:', JSON.stringify({ score: bSkew.score, band: IMBALANCE_LABEL[bSkew.band], top: bSkew.topDriver?.label }));

// 样本不足时不应崩
const bEmpty = computeImbalance(compute([], 'me'));
eq('空数据不崩溃', bEmpty.score, 0);
eq('空数据 → 均衡且无方向', bEmpty.band + '/' + String(bEmpty.leaning), 'balanced/null');
eq('空数据无维度', bEmpty.drivers.length, 0);

// 边界：比值刚好 1:1 与 5:1
eq('对称维度得 0 分', computeImbalance(compute([
  msg('me','你好呀朋友们',0), msg('you','你好呀朋友们',5),
  msg('me','你好呀朋友们',10), msg('you','你好呀朋友们',15),
], 'me')).drivers.find(d=>d.key==='length')?.score, 0);


// ---------------------------------------------------------------
console.log('\n【用例 5】对照条占比 investmentSharePercent');
const sp = investmentSharePercent;
eq('持平 → 50', sp(10, 10), 50);
eq('我 30 / 对方 3 → 91', sp(30, 3), 91);
eq('我 0 / 对方 10 → 夹到 6（不是 0，否则看起来像没渲染）', sp(0, 10), 6);
eq('我 10 / 对方 0 → 夹到 94（不盖住对方标签）', sp(10, 0), 94);
eq('双方都为 0 → 50（不是 NaN）', sp(0, 0), 50);
// lowerIsMore：回复延迟越小代表投入越多，方向极易写反
eq('延迟 我2 / 他88，lowerIsMore → 我占 94', sp(2, 88, true), 94);
eq('延迟 我88 / 他2，lowerIsMore → 我占 6', sp(88, 2, true), 6);
eq('lowerIsMore 持平仍是 50', sp(5, 5, true), 50);
eq('非法输入不返回 NaN', Number.isFinite(sp(NaN, 5)), true);

// ---------------------------------------------------------------
console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 存在失败'}：${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
