/**
 * 没配 key 时的示例文案。
 *
 * 存在的唯一理由：让整条流程在没有 GEMINI_API_KEY 时也能走完，好看界面。
 *
 * ⚠️ 它不是模型输出，是按模板拼的字符串。所以它当然「遵守」prompt 里那些规矩
 *    （不推翻报告、一牌一证、不造数字）—— 用它验证不了真模型会不会遵守，
 *    那件事只有配上 key 真跑一次才知道。
 *
 * 每段开头的标记不要删：文案会渲染进和真解读同一个框，没有标记就分不出真假。
 */
import { TAROT_CARDS } from './cards';
import type { RelationshipMetrics, Imbalance } from './metrics';
import type { DrawnCard, Verdict } from './reading';

const MARK = '［示例文案 · 未接入模型］\n\n';

export function mockTarotReading(
  question: string,
  cards: DrawnCard[],
  facts: string[],
  verdict: Verdict | null,
) {
  /*
    没有聊天记录 = 只读牌，不是「拒答」。
    格式照 reading.ts 里那份 only-prompt 的要求：位置 · 牌名（正逆）换行接解读，
    而且**主语一律是牌**，一句都不许写成「你们怎么样」——
    示例文案和真解读渲染进同一个框，形状不一样就演示不出真实体验。
  */
  if (!facts.length) {
    const lines = cards.map(c => {
      const meaning = TAROT_CARDS.find(t => t.name === c.name)?.meaning ?? '';
      return `${c.position} · ${c.name}（${c.reversed ? '逆位' : '正位'}）\n`
        + `${c.name}讲的是${meaning}。`
        + (c.reversed ? '逆位时这股力没有走出去，停在原地打转。' : '');
    });
    return MARK + '这次没有接入聊天记录，下面只有牌意，没有事实支撑。\n\n'
      + `你问的是「${question}」。\n\n${lines.join('\n\n')}`;
  }

  const lines = cards.map((c, i) => {
    // 一牌一证：第 i 张牌挂到第 i 条证据上，证据不够就绕回第一条
    const n = facts.length ? (i % facts.length) + 1 : 1;
    return `【${c.position}】${c.name}${c.reversed ? '（逆位）' : ''}——对应证据 ${String(n).padStart(2, '0')}：${facts[n - 1]}。`
      + '牌只是把这条数字换个说法，没有多说什么。';
  });

  const head = verdict
    ? `恋爱分析已经给出结论：失衡度 ${verdict.score}，${verdict.band}，${verdict.lean}`
      + `${verdict.driver ? `，最主要的失衡来自「${verdict.driver}」` : ''}。`
      + '下面三张牌不推翻它 —— 牌是随机的，数字不是。'
    : '恋爱分析没有出结论，下面只有牌意。';

  return MARK + `你问的是「${question}」。\n\n${head}\n\n${lines.join('\n\n')}`;
}

export function mockRelationshipAnalysis(
  m: RelationshipMetrics,
  imb: Imbalance,
  otherName: string,
) {
  if (!m.sufficient) {
    return MARK + (m.insufficientReason || '还没有可分析的记录') + '。样本不足时不出结论。';
  }
  const lean = imb.leaning === 'me' ? '你投入得更多'
    : imb.leaning === 'other' ? `${otherName}投入得更多` : '两边大致持平';
  const parts = [
    `${m.totalMessages} 条消息、跨 ${m.spanDays} 天，失衡度 ${imb.score}，${lean}。`,
    imb.topDriver ? `最主要的差距在「${imb.topDriver.label}」。` : '',
    m.myInitiationShare !== null
      ? `对话有 ${Math.round(m.myInitiationShare * 100)}% 由你开启。` : '',
    m.me.medianReplyMinutes !== null && m.other.medianReplyMinutes !== null
      ? `同一段对话里你的回复中位数是 ${m.me.medianReplyMinutes} 分钟，${otherName}是 ${m.other.medianReplyMinutes} 分钟。` : '',
    m.other.leftOtherWaiting > 0
      ? `另外有 ${m.other.leftOtherWaiting} 次，${otherName}让你等了超过 24 小时。` : '',
    '这些数字覆盖不到的事——TA的动机、线下发生了什么、有没有别的联系方式——看不到，就不猜。',
  ];
  return MARK + parts.filter(Boolean).join('');
}
