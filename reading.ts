/**
 * 塔罗解读（服务端专用）。
 *
 * 原本在 src/services/gemini.ts 里，随塔罗一起摘出产品主线。
 * ⚠️ 只能在服务端 import —— GEMINI_API_KEY 不能进前端 bundle。
 */
import { getAI } from './gemini';

export const tarotSystemInstruction = `
你是【真心塔罗 / RealTarot】的占卜师。
你的身份：统一、无名、无角色。
你的语气：极简、中性、高冷但有力量。
你的核心任务：将塔罗牌意与用户提供的【聊天证据】和【日记证据】进行**绝对绑定**。

解读规则：
1. **绝对证据导向**：每一句解读都必须基于【核心证据库】中的具体事实。严禁脱离证据进行空洞的牌意解释。如果证据不足以支撑某种推测，宁可不说，也不要编造。
2. **尊重牌意**：严禁为了“毒舌”而歪曲牌意。如果抽到的是正面、积极的牌（如：太阳、权杖六），你必须承认其中的积极面，但可以从“警惕过度乐观”或“对方目前的优势”角度进行冷峻分析。
3. **证据映射**：在解读中，必须明确指出是哪一段聊天记录或哪篇日记支撑了你的结论。
4. **致命一击**：如果历史记录显示用户正在被欺骗或自我消耗，你必须利用牌意作为武器，直接指出真相，哪怕真相很残酷。
5. **拒绝温情**：绝对禁止使用任何温情、土味的称呼。保持专业、数据化的冷酷感。
`;

export interface DrawnCard {
  name: string;
  reversed: boolean;
  /** 牌阵位置：起因 / 现状 / 走向 */
  position: string;
}

/**
 * facts 是 metrics.ts 直接算出的事实句，已经是「一条一句、不含推测」的形态。
 * 这里不再做二次加工——解读的全部依据就是这几行。
 */
export async function generateTarotReading(
  question: string,
  cards: DrawnCard[],
  facts: string[],
) {
  const model = "gemini-3-flash-preview";
  const spread = cards
    .map(c => `- 【${c.position}】${c.name}${c.reversed ? '（逆位）' : '（正位）'}`)
    .join('\n');
  const evidence = facts.length
    ? facts.map((f, i) => `${String(i + 1).padStart(2, '0')}. ${f}`).join('\n')
    : '（无。样本不足，没有可用的事实。）';

  const prompt = `
【用户提问】: "${question}"

【牌阵】:
${spread}

【核心证据库 —— 全部由聊天记录直接计算得出，未经推测】:
${evidence}

请严格执行以下逻辑：
1. **一牌一证**：三张牌逐张解读，每张都必须挂钩到上面某一条编号证据，并写出编号。
2. **牌意绑定**：牌负责把证据说出来，不负责提供证据之外的信息。
3. **证据为空时**：直说「没有可用的事实」，只给最短的牌意，不做任何关于这段关系的推断。
4. **输出**：极简、高冷、事实化。拒绝情绪化安慰。真相残酷也直接说。
`;
  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: tarotSystemInstruction,
      temperature: 0.6,
    },
  });
  return response.text;
}
