/**
 * 恋爱分析的深度解读（服务端专用）。
 *
 * 和塔罗共用一条铁律：**数值一律不由模型产生**。
 * metrics.ts 已经把数字算完了，模型只负责把这些数字读成一段话。
 * ⚠️ 只能在服务端 import —— GEMINI_API_KEY 不能进前端 bundle。
 */
import { getAI } from './gemini';
import { IMBALANCE_LABEL, type RelationshipMetrics, type Imbalance } from './metrics';

export const analysisSystemInstruction = `
你是【真心 / RealHeart】的关系分析师。
你的语气：冷静、克制、事实优先。不安慰，也不刻薄。

规则：
1. **不许产生任何新数值**。你看到的每个数字都已经算好了，只能引用，不能推算、不能四舍五入成别的数、不能估计。
2. **每个结论都要挂到给定的指标上**，并说清是哪一项支撑了它。
3. **承认样本的边界**。指标覆盖不到的事（对方的动机、线下发生了什么、有没有别的联系方式），直说看不到，不要猜。
   标着「这份样本算不出来」的指标，**一个字都不许提**，更不许推测它可能是多少 ——
   那是不知道，不是零。
4. **测到的事要下结论，测不到的事要明确拒答**。两件事都要硬，不许揉成一句温吞的话。
   - 对**测到的**：用陈述句直接说。严禁「可能」「也许」「倾向于」「某种程度上」
     这类对冲词，也不要用「让你自己判断」把结论推回给用户 ——
     指标已经算出来了，还含糊就是浪费。
   - 对**测不到的**（对方的动机、以后会怎样）：直说看不到，然后停，
     不要给一个模糊的替代判断来填这个空。
   同样禁止反方向的宽慰：指标显示对方投入明显更少时，
   不许写「其实对方也在乎」「可能只是忙」这类证据不支持的话。
   用户来这里是想知道真话，不是来被安慰的。
   不劝和也不劝分，不预测结局 —— 那是编造，不是克制。
5. **不许给数字改单位、改含义**。给你的是多少就是多少：分是分，次是次，
   百分比是那一项自己的百分比。不许把变化幅度说成「概率」，
   不许把 80 分写成 80%，不许把中位数说成平均数。
6. **称呼**：提到对方一律用给定的称呼或「TA」，不要写「他」「她」——
   聊天记录里看不出性别，界面上也从不这样写。
7. **只用中文表述**。给你的指标里若出现英文标识（band、severe 之类），一律不许出现在正文里——
   那是内部字段，用户看不懂。
8. 中文，不用小标题，不用列表，四到六句话。
`;

/**
 * 一次性和流式共用同一个型号和同一份 prompt，别让两份各自漂移。
 *
 * 原来是 gemini-3-flash-preview：免费额度很快用完，报告页的「深度解读」直接 429。
 * 换成和塔罗解读同一个型号、同样关掉思考 —— 这一段是照着算好的数字写四到六句话，
 * 用不上推理，关掉之后首字也快得多（实测见 reading.ts 的 TAROT_MODEL）。
 */
const ANALYSIS_MODEL = 'gemini-2.5-flash';
const ANALYSIS_CONFIG = { temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } } as const;

function analysisPrompt(
  metrics: RelationshipMetrics,
  imbalance: Imbalance,
  otherName: string,
) {
  const s = metrics.me;
  const o = metrics.other;
  const prompt = `
【对方称呼】: ${otherName}
【样本】: ${metrics.totalMessages} 条${metrics.spanDays > 0 ? `，跨 ${metrics.spanDays} 天` : ''}

【已算好的指标 —— 只能引用，不能推算】
- 投入失衡：${IMBALANCE_LABEL[imbalance.band]}（${imbalance.score} 分，倾向：${imbalance.leaning === 'me' ? '我投入更多' : imbalance.leaning === 'other' ? `${otherName}投入更多` : '大致持平'}）
- 最主要的失衡来源：${imbalance.topDriver?.label ?? '无'}
- 我开启对话占比：${metrics.myInitiationShare === null ? '这份样本算不出来' : `${Math.round(metrics.myInitiationShare * 100)}%`}
- 同一段对话内的回复中位数：${s.medianReplyMinutes === null || o.medianReplyMinutes === null
    ? '这份样本算不出来'
    : `我 ${s.medianReplyMinutes} 分钟，${otherName} ${o.medianReplyMinutes} 分钟`}
- 平均每条字数：我 ${s.avgLength}，${otherName} ${o.avgLength}
- 提问次数：我 ${s.questionCount}，${otherName} ${o.questionCount}
- 让对方等超过 24 小时：我 ${s.leftOtherWaiting} 次，${otherName} ${o.leftOtherWaiting} 次
- ${otherName}回复速度的变化（后半段的回复中位数相对前半段，这是变化幅度，不是概率、不是比例）：${
    metrics.otherLatencyTrendPct === null ? '样本不足'
    : metrics.otherLatencyTrendPct === 0 ? '没有变化'
    : `${metrics.otherLatencyTrendPct > 0 ? '变慢' : '变快'}了 ${Math.abs(metrics.otherLatencyTrendPct)}%`}

请按系统规则输出一段解读。
`;
  return prompt;
}

export async function generateRelationshipAnalysis(
  metrics: RelationshipMetrics,
  imbalance: Imbalance,
  otherName: string,
) {
  const response = await getAI().models.generateContent({
    model: ANALYSIS_MODEL,
    contents: analysisPrompt(metrics, imbalance, otherName),
    config: { systemInstruction: analysisSystemInstruction, ...ANALYSIS_CONFIG },
  });
  return response.text;
}

/**
 * 流式版本。和上面同一个 prompt、同一套规则，只是逐段吐字。
 * 免费档一次解读要十几秒，流式让第一个字一两秒就到。
 */
export async function* streamRelationshipAnalysis(
  metrics: RelationshipMetrics,
  imbalance: Imbalance,
  otherName: string,
) {
  const stream = await getAI().models.generateContentStream({
    model: ANALYSIS_MODEL,
    contents: analysisPrompt(metrics, imbalance, otherName),
    config: { systemInstruction: analysisSystemInstruction, ...ANALYSIS_CONFIG },
  });
  for await (const chunk of stream) {
    const t = chunk.text;
    if (t) yield t;
  }
}
