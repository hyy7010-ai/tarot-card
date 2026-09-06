/**
 * 恋爱分析的深度解读（服务端专用）。
 *
 * 和塔罗共用一条铁律：**数值一律不由模型产生**。
 * metrics.ts 已经把数字算完了，模型只负责把这些数字读成一段话。
 * ⚠️ 只能在服务端 import —— GEMINI_API_KEY 不能进前端 bundle。
 */
import { getAI } from './gemini';
import type { RelationshipMetrics, Imbalance } from './metrics';

export const analysisSystemInstruction = `
你是【真心 / RealHeart】的关系分析师。
你的语气：冷静、克制、事实优先。不安慰，也不刻薄。

规则：
1. **不许产生任何新数值**。你看到的每个数字都已经算好了，只能引用，不能推算、不能四舍五入成别的数、不能估计。
2. **每个结论都要挂到给定的指标上**，并说清是哪一项支撑了它。
3. **承认样本的边界**。指标覆盖不到的事（对方的动机、线下发生了什么、有没有别的联系方式），直说看不到，不要猜。
4. **不给情感建议，不劝和也不劝分**。只把这段关系此刻的形状描述清楚，让人自己判断。
5. 中文，不用小标题，不用列表，四到六句话。
`;

export async function generateRelationshipAnalysis(
  metrics: RelationshipMetrics,
  imbalance: Imbalance,
  otherName: string,
) {
  const model = 'gemini-3-flash-preview';
  const s = metrics.me;
  const o = metrics.other;
  const prompt = `
【对方称呼】: ${otherName}
【样本】: ${metrics.totalMessages} 条，跨 ${metrics.spanDays} 天

【已算好的指标 —— 只能引用，不能推算】
- 投入失衡：${imbalance.band}（倾向：${imbalance.leaning === 'me' ? '我投入更多' : imbalance.leaning === 'other' ? `${otherName}投入更多` : '大致持平'}）
- 我开启对话占比：${metrics.myInitiationShare === null ? '无法计算' : `${Math.round(metrics.myInitiationShare * 100)}%`}
- 同一段对话内的回复中位数：我 ${s.medianReplyMinutes ?? '—'} 分钟，${otherName} ${o.medianReplyMinutes ?? '—'} 分钟
- 平均每条字数：我 ${s.avgLength}，${otherName} ${o.avgLength}
- 提问次数：我 ${s.questionCount}，${otherName} ${o.questionCount}
- 让对方等超过 24 小时：我 ${s.leftOtherWaiting} 次，${otherName} ${o.leftOtherWaiting} 次
- ${otherName}回复速度的变化：${metrics.otherLatencyTrendPct === null ? '样本不足' : `${metrics.otherLatencyTrendPct > 0 ? '变慢' : '变快'} ${Math.abs(metrics.otherLatencyTrendPct)}%`}

请按系统规则输出一段解读。
`;
  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
    config: { systemInstruction: analysisSystemInstruction, temperature: 0.5 },
  });
  return response.text;
}
