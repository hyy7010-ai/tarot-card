import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, RotateCw } from 'lucide-react';
import TarotCard, { TarotCardBack, type CardSize } from './TarotCard';
import { parseReading } from './parseReading';
import { ChatMessage } from './types';
import { TAROT_CARDS } from './cards';
import { ILLUSTRATED } from './illustrated';
import { cardCode } from './TarotArt';
import {
  computeRelationshipMetrics, computeImbalance, IMBALANCE_LABEL,
  RelationshipMetrics, Imbalance,
} from './metrics';

/**
 * 真心塔罗
 *
 * 流程刻意分四步，核心约束是：解读必须落在证据上。
 *   1 提问   2 抽牌（仪式）   3 证据（指标层算出的事实）   4 解读
 *
 * 「证据」这一屏在解读之前出现，是整个设计的关键——先让用户看见事实，
 * 再让牌面去说这些事实，牌就成了外壳而不是玄学来源。
 */

type Step = 'ask' | 'draw' | 'reading';

/**
 * 把流式响应逐段读出来，边到边显示。
 *
 * 服务端返回的是纯文本流：第一个字一两秒就到，而不是等模型写完整段（免费档实测十几秒）。
 * 出错时服务端还没发头，所以仍然是 JSON + 人话，这里照旧解析。
 */
async function readStream(r: Response, onChunk: (all: string) => void) {
  if (!r.ok) {
    const d = await r.json().catch(() => ({} as { error?: string }));
    throw new Error(d.error || `请求失败（${r.status}）`);
  }
  if (!r.body) return (await r.text());
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let all = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    all += dec.decode(value, { stream: true });
    onChunk(all);
  }
  return all;
}

/**
 * 牌阵。
 *
 * 每个牌阵**自带它的格子坐标**，不共用一行 flex。
 * 原因是排版：375px 手机减掉边距只剩 327px，三张 92px 的牌加间距刚好卡满
 * （2+1 折行那个 bug 就是这么来的）。五张一行放不下，十张更不可能，
 * 所以位置必须各自声明落在第几列第几行，由 CSS grid 摆。
 *
 * positions 的**顺序是抽牌顺序**，col/row 只管显示 ——
 * 凯尔特十字里这两者本来就不一致（第 10 张画在右上角，但它是最后抽的）。
 *
 * card 是这个牌阵该用多大的牌：列数越多牌越小，否则横着放不下。
 * fluid 的牌宽度交给格子，只保持 2:3，所以任何列数在任何屏宽都不会溢出。
 */
export interface SpreadPos {
  key: string;
  label: string;
  hint: string;
  /**
   * 第几列，可以是半格（1.5 = 落在第 1、2 列正中间）。
   * 原图里常有「两张牌夹在三张牌中间」的排法（X 牌阵、感情修复），
   * 只认整数列就只能把列数加倍、牌缩成一半 —— 手机上那就是 57px 的牌。
   */
  col: number;
  row: number;
  /** 凯尔特十字的第 2 张：横压在第 1 张上面，这是这个牌阵的签名 */
  cross?: boolean;
}

export interface Spread {
  key: string;
  name: string;
  /** 选牌阵时那一行说明 */
  note: string;
  cols: number;
  rows: number;
  card: CardSize;
  /**
   * 每列的像素预算，决定整个牌阵有多宽、牌有多大。
   * 列数越多这个值越小 —— 否则 10 张牌在桌面上会堆到近 900px 高，得缩放才看得全。
   */
  colWidth: number;
  /**
   * 宽屏（lg）每列的预算，不写就和 colWidth 一样。
   * colWidth 是照手机定的：感情牌阵用 100，于是电脑上一个三列牌阵只占 400px 宽的一条，
   * 两边空着一大片。手机上的宽度本来就被屏幕卡死，只放大宽屏不会把手机变长。
   */
  lgColWidth?: number;
  positions: SpreadPos[];
}

/** 半格靠这个实现：网格是 2×cols 个子列，每张牌跨两个，col 1.5 就从第 2 个子列起 */
const colSpan = (col: number) => `${col * 2 - 1} / span 2`;

/**
 * 一个牌阵要在一屏里摆完，所以牌宽还得受**行数**管着，不只受列数管。
 * 每行的高度 = 牌高（宽 × 1.5）+ 标签和行距，反过来就是牌最宽能有多宽。
 *
 * 手机实测（390×844）：页头占掉约 220px，每行的标签和行距约 35px，留给牌阵约 600px。
 * 三行时这个上限比屏宽还宽，等于不起作用；四行压到 76px，翻牌那一屏底部落在 826px。
 * 宽屏实测（1440×900）：翻开屏页头约 130px，行距大一档（约 50px），留给牌阵约 760px。
 * 宽屏的翻牌屏每张牌下面还多一行说明，三行以上仍要滚一下 —— 凯尔特十字原来就是这样。
 * 不加这条，宽屏放大之后三行的牌阵在笔记本上就已经露不全最后一行。
 *
 * 下限 floor：手机 68 —— 再窄「圣杯皇后」这种四字牌名在牌面上就折行了；
 * 宽屏 110 —— 宽屏的牌名是 md 的大字号加一行英文名，再窄就和罗马数字叠在一起。
 * 所以五行的 X 牌阵在手机上多出半行，四五行的牌阵在宽屏上要滚一下，这是牌面看得清的代价。
 *
 * 平板（sm 到 lg 之间）不压：那里牌名已经换成大字号，压窄了正好撞上上面那个问题，
 * 而平板也不是这个产品的主力形态。
 */
const cardMax = (rows: number, budget: number, rowExtra: number, floor: number) =>
  Math.max(floor, Math.floor((budget / rows - rowExtra) / 1.5));

/**
 * 牌阵网格的宽度上限。手机、平板、宽屏各一个，写成 CSS 变量交给带断点的 max-w 类去切 ——
 * 内联 style 的 maxWidth 没法带断点。
 */
function gridWidth(sp: Spread, scale = 1) {
  // 列间沟：手机 gap-x-2（8px），宽屏 sm:gap-x-4（16px）
  const base = sp.cols * sp.colWidth * scale;
  const phone = Math.min(base, sp.cols * cardMax(sp.rows, 600, 35, 68) + (sp.cols - 1) * 8);
  const wide = Math.min(
    sp.cols * (sp.lgColWidth ?? sp.colWidth) * scale,
    sp.cols * cardMax(sp.rows, 760, 50, 110) + (sp.cols - 1) * 16,
  );
  return { '--sw': `${phone}px`, '--sw-sm': `${base}px`, '--sw-lg': `${wide}px` } as React.CSSProperties;
}

export const SPREADS: Spread[] = [
  {
    key: 'one', name: '一张牌', note: '一个问题，一张牌',
    cols: 1, rows: 1, colWidth: 210, card: 'lg',
    positions: [
      { key: 'now', label: '此刻', hint: '你问的这件事，现在是什么样', col: 1, row: 1 },
    ],
  },
  {
    key: 'three', name: '三张牌', note: '起因 · 现状 · 走向',
    cols: 3, rows: 1, colWidth: 150, card: 'md',
    positions: [
      { key: 'past', label: '起因', hint: '这段关系是怎么走到今天的', col: 1, row: 1 },
      { key: 'present', label: '现状', hint: '此刻真正在发生什么', col: 2, row: 1 },
      { key: 'future', label: '走向', hint: '照这个模式下去会怎样', col: 3, row: 1 },
    ],
  },
  {
    /*
      关系牌阵是这几个里**唯一能和 metrics.ts 对上**的：
      那边算出来的每一项都是「我 vs TA」的一对数（开启占比、回复中位数、每条字数……），
      而这个牌阵正好有「你」和「TA」两个独立位置。通用牌阵没有这个性质。
    */
    key: 'love', name: '关系牌阵', note: '你 · TA · 你们之间 · 挡在中间的 · 走向',
    cols: 3, rows: 3, colWidth: 140, card: 'md',
    positions: [
      { key: 'me', label: '你', hint: '你在这段关系里是什么状态', col: 1, row: 1 },
      { key: 'other', label: 'TA', hint: 'TA 在这段关系里是什么状态', col: 3, row: 1 },
      { key: 'between', label: '你们之间', hint: '你们之间实际在发生什么', col: 2, row: 2 },
      { key: 'block', label: '挡在中间的', hint: '是什么卡住了', col: 1, row: 3 },
      { key: 'trend', label: '走向', hint: '照这个模式下去会怎样', col: 3, row: 3 },
    ],
  },
  {
    /*
      ⚠️ 凯尔特十字是按要求加的，我提过不推荐：10 张在手机上排版极紧，
         而且它是「深度占卜」的形状，和这个产品「证据导向、不玄学」的立场相反。
         保留这段注释是为了让后来的人知道这是个**已经权衡过的决定**，不是顺手加的。
      左边三列是十字，第四列是竖着那根「杖」。
    */
    key: 'celtic', name: '凯尔特十字', note: '10 张 · 完整牌阵，手机上牌会比较小',
    cols: 4, rows: 4, colWidth: 106, card: 'sm',
    positions: [
      { key: 'now', label: '现况', hint: '事情现在的样子', col: 2, row: 2 },
      { key: 'cross', label: '阻碍', hint: '横在前面的是什么', col: 2, row: 2, cross: true },
      { key: 'root', label: '根源', hint: '底下埋着什么', col: 2, row: 3 },
      { key: 'past', label: '过去', hint: '刚过去的那一段', col: 1, row: 2 },
      { key: 'crown', label: '可能', hint: '你心里想的那个结果', col: 2, row: 1 },
      { key: 'future', label: '未来', hint: '接下来会走到哪', col: 3, row: 2 },
      { key: 'self', label: '你自己', hint: '你在这件事里的位置', col: 4, row: 4 },
      { key: 'around', label: '周围', hint: '别人和环境的影响', col: 4, row: 3 },
      { key: 'hope', label: '期待与恐惧', hint: '你最盼的和最怕的', col: 4, row: 2 },
      { key: 'result', label: '结果', hint: '这条线走到头的样子', col: 4, row: 1 },
    ],
  },
  /*
    以下是感情专题牌阵，形状照原图摆，原图是错位排的地方就近落到格子上。
    label 要短（窄屏一行 14px 只放得下五六个字），也是模型读到的位置名，所以得自己能说明白；
    原图上那句完整的问题放在 hint 里。
    手机上牌和牌堆里的一样大（92px）：列宽 100 = 牌宽 + 列间沟。再大三行就是 690px，手机上翻牌得一路往下滑。
    宽屏另给 lgColWidth 130，牌用 md —— md 在手机上和 sm 一样，到 sm: 以上牌名才放大，配得上放大的牌。
  */
  {
    key: 'revive', name: '复活我的爱人', note: '感情 · 复合 · 分手真因 · 5 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'feel', label: 'TA的感情', hint: '对方对我的感情', col: 1, row: 1 },
      { key: 'contact', label: '会联系我吗', hint: '对方是否会主动联系我', col: 2, row: 1 },
      { key: 'reunite', label: '想复合吗', hint: 'TA 还想复合吗', col: 3, row: 1 },
      { key: 'reason', label: '分手真因', hint: '对方内心最真实的分手原因', col: 1, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'revive2', name: '复活爱人 2.0', note: '分手想法 · 挽回态度 · 新的人 · 6 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'breakup', label: '分手的想法', hint: 'TA 怎么看这次分手', col: 1, row: 1 },
      { key: 'feel', label: '现在的感情', hint: 'TA 现在对我的感情', col: 2, row: 1 },
      { key: 'contact', label: '会联系我吗', hint: 'TA 还会主动联系我吗', col: 3, row: 1 },
      { key: 'winback', label: '挽回的态度', hint: '如果我去挽回，TA 会是什么态度', col: 1, row: 2 },
      { key: 'others', label: '接触新人', hint: 'TA 是否在接触新的人', col: 2, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'cold-shoulder', name: '热脸贴冷屁股', note: '变心 · 不理我 · 持续多久 · 5 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'changed', label: '变心了吗', hint: 'TA 是否变心', col: 1, row: 1 },
      { key: 'ignore', label: '为何不理我', hint: 'TA 为什么不理我', col: 2, row: 1 },
      { key: 'howlong', label: '会持续多久', hint: '这种情况会持续多久', col: 3, row: 1 },
      { key: 'continue', label: '还能继续吗', hint: '这段关系还可以继续吗', col: 1, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 3, row: 2 },
    ],
  },
  {
    key: 'cold-heart', name: '你的心，好冰冷', note: '为何绝情 · 会不会改变态度 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'why', label: '为何绝情', hint: 'TA 为什么对我这么绝情', col: 2, row: 1 },
      { key: 'thought', label: '真实想法', hint: 'TA 对这段关系真实的想法', col: 1, row: 2 },
      { key: 'feel', label: '现在的情感', hint: 'TA 现在对我的情感', col: 2, row: 2 },
      { key: 'change', label: '会改变吗', hint: 'TA 会改变态度吗', col: 3, row: 2 },
      { key: 'todo', label: '我该怎么做', hint: '我现在应该怎么做', col: 2, row: 3 },
    ],
  },
  {
    key: 'tug', name: '极限拉扯', note: '这段关系是否值得 · 6 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'need', label: '你的需求', hint: '你在这段关系里到底要什么', col: 2, row: 3 },
      { key: 'hesitate', label: 'TA犹豫的原因', hint: '是什么让 TA 迟迟不定', col: 1, row: 2 },
      { key: 'stuck', label: '停滞的根源', hint: '关系卡住不动的根源', col: 3, row: 2 },
      { key: 'third', label: '第三方介入', hint: '是否有第三方介入', col: 1, row: 1 },
      { key: 'turn', label: '转机', hint: '什么时候会有转机', col: 2, row: 1 },
      { key: 'todo', label: '我该如何做', hint: '接下来我该怎么做', col: 3, row: 1 },
    ],
  },
  {
    key: 'pursuit', name: '求爱之路', note: '好感 · 推进 · 能不能在一起 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'interest', label: '好感程度', hint: 'TA 对我有兴趣吗，好感有多少', col: 2, row: 1 },
      { key: 'image', label: '我在TA眼中', hint: '在 TA 眼里我是个什么样的人', col: 1, row: 2 },
      { key: 'push', label: '会主动推进吗', hint: 'TA 会主动推进关系吗', col: 2, row: 2 },
      { key: 'develop', label: '能更进一步吗', hint: '朋友能不能暧昧，暧昧能不能在一起', col: 3, row: 2 },
      { key: 'todo', label: '下一步怎么走', hint: '如果想更进一步，我该怎么做', col: 2, row: 3 },
    ],
  },
  {
    key: 'first-sight', name: '一见钟情', note: '第一眼 · 还会见面吗 · 5 张',
    cols: 2, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'first', label: '第一眼', hint: '第一眼见到我时，TA 心里在想什么', col: 2, row: 1 },
      { key: 'develop', label: '想发展吗', hint: 'TA 是否想和我进一步发展', col: 1, row: 2 },
      { key: 'meet', label: '还会见面吗', hint: '我们还会再见面吗', col: 2, row: 2 },
      { key: 'attitude', label: '相处的态度', hint: 'TA 打算怎么和我相处，对我什么态度', col: 1, row: 3 },
      { key: 'want', label: '想见我吗', hint: 'TA 想见我吗', col: 2, row: 3 },
    ],
  },
  {
    key: 'lovebrain', name: '恋爱脑五连问', note: '理想型 · 喜欢我什么 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'looks', label: '理想型外貌', hint: 'TA 的理想型长什么样、什么身材', col: 2, row: 1 },
      { key: 'type', label: '理想型性格', hint: 'TA 理想中的伴侣是什么性格', col: 1, row: 2 },
      { key: 'me', label: '我的外貌', hint: 'TA 眼中我的外貌，是不是 TA 的理想型', col: 2, row: 2 },
      { key: 'why', label: '喜欢我什么', hint: 'TA 为什么喜欢我', col: 3, row: 2 },
      { key: 'physical', label: '生理吸引', hint: 'TA 对我有没有生理上的喜欢', col: 2, row: 3 },
    ],
  },
  {
    key: 'lovebrain2', name: '恋爱脑 2.0', note: 'TA 和前任 · 放下了吗 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'then', label: '对前任如何', hint: '和前任在一起时，TA 对前任怎么样', col: 2, row: 1 },
      { key: 'why', label: '为何分手', hint: 'TA 和前任为什么分手', col: 1, row: 2 },
      { key: 'mode', label: '相处模式', hint: 'TA 和前任是怎么相处的', col: 3, row: 2 },
      { key: 'over', label: '放下了吗', hint: 'TA 是否已经放下前任', col: 1, row: 3 },
      { key: 'place', label: '前任的地位', hint: '前任在 TA 心里是什么位置', col: 3, row: 3 },
    ],
  },
  /*
    下面九个照第二批原图摆。原图上的「他」「对方」「占卜者」一律改成「TA」「你」，和上面一致。
    原图里两张牌夹在三张中间的地方用半格（col 带 .5）摆，不加列数 —— 列一多手机上牌就缩成一条。
  */
  {
    key: 'venus', name: '维纳斯之爱', note: '双方真心 · 未来心境 · 8 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'myheart', label: '你的真心', hint: '你对这段感情的真心', col: 1, row: 2 },
      { key: 'theirheart', label: 'TA的真心', hint: 'TA 对这段感情的真心', col: 3, row: 2 },
      { key: 'myinfl', label: '你受的影响', hint: '你在这段感情里受到的影响', col: 2, row: 1 },
      { key: 'theirinfl', label: 'TA受的影响', hint: 'TA 在这段感情里受到的影响', col: 2, row: 2 },
      { key: 'block', label: '问题阻碍', hint: '你们之间的问题和阻碍', col: 2, row: 3 },
      { key: 'result', label: '结果', hint: '这段感情的结果', col: 2, row: 4 },
      { key: 'myfuture', label: '你未来心境', hint: '你以后的心境', col: 1, row: 3 },
      { key: 'theirfuture', label: 'TA未来心境', hint: 'TA 以后的心境', col: 3, row: 3 },
    ],
  },
  {
    /* 原图中间是 7 横压在 8 上，和凯尔特十字同一个画法，所以 7 用 cross —— 它的标签也因此不在格子里显示 */
    key: 'sincere', name: '是否真心', note: '真心 · 隐瞒 · 背叛过吗 · 8 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'sincere', label: '真心吗', hint: 'TA 对你是否真心', col: 1, row: 2 },
      { key: 'real', label: '真实的TA', hint: '真实的 TA 是什么样', col: 1, row: 3 },
      { key: 'thought', label: '真实想法', hint: 'TA 对你的真实想法', col: 3, row: 2 },
      { key: 'status', label: 'TA以为的现状', hint: 'TA 以为你们的感情现在是什么样', col: 3, row: 3 },
      { key: 'circle', label: '身边人看你', hint: 'TA 身边的人怎么看你', col: 2, row: 1 },
      { key: 'hide', label: '有无隐瞒', hint: 'TA 对你有没有隐瞒，隐瞒的是什么', col: 2, row: 3 },
      { key: 'betray', label: '背叛过吗', hint: 'TA 是否背叛过这段感情', col: 2, row: 2, cross: true },
      { key: 'future', label: 'TA未来的样子', hint: 'TA 以后在这段关系里会是什么样子', col: 2, row: 2 },
    ],
  },
  {
    key: 'mirror-rival', name: '破镜重圆 · 有情敌', note: '你 · 前任 · 情敌 · 策略 · 11 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mypast', label: '你的过去', hint: '你的过去', col: 1, row: 1 },
      { key: 'mynow', label: '你的现状', hint: '你的现状', col: 2, row: 1 },
      { key: 'result', label: '复合的结果', hint: '复合的结果', col: 3, row: 1 },
      { key: 'expast', label: '前任过去', hint: '前任的过去', col: 1, row: 2 },
      { key: 'exnow', label: '前任现状', hint: '前任的现状', col: 2, row: 2 },
      { key: 'exview', label: '前任的看法', hint: '前任怎么看你，复合有没有可能', col: 3, row: 2 },
      { key: 'rivalpast', label: '情敌过去', hint: '情敌的过去', col: 1, row: 3 },
      { key: 'rivalnow', label: '情敌现状', hint: '情敌的现状', col: 2, row: 3 },
      { key: 'clash', label: '交锋的未来', hint: '情敌与你交锋的未来', col: 3, row: 3 },
      { key: 'edge', label: '情敌优势', hint: '情敌的优势，也就是你的劣势', col: 1.5, row: 4 },
      { key: 'todo', label: '策略建议', hint: '你该用什么策略', col: 2.5, row: 4 },
    ],
  },
  {
    key: 'lover', name: '爱人', note: '关心 · 忠诚 · 结婚 · 金钱 · 10 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'care', label: '关心你吗', hint: 'TA 关心你吗', col: 2, row: 1 },
      { key: 'stable', label: '稳定吗', hint: '你们稳定吗', col: 3, row: 2 },
      { key: 'seek', label: '共同追求', hint: '你们所追求的', col: 2, row: 2 },
      { key: 'loyal', label: '忠诚可靠吗', hint: 'TA 忠诚、可靠吗', col: 1, row: 2 },
      { key: 'attract', label: '吸引的原因', hint: '你们互相吸引的原因', col: 3, row: 3 },
      { key: 'marry', label: '想过结婚吗', hint: 'TA 有考虑过结婚吗', col: 2, row: 3 },
      { key: 'traits', label: '优点缺点', hint: 'TA 的优点和缺点', col: 1, row: 3 },
      { key: 'money', label: '分享金钱', hint: '彼此能不能互相分享金钱', col: 3, row: 4 },
      { key: 'stay', label: '停留或离开', hint: 'TA 会为你停留还是离开', col: 2, row: 4 },
      { key: 'result', label: '结果', hint: '这段关系的结果', col: 1, row: 4 },
    ],
  },
  {
    /*
      照原图：左边一竖是 TA 的（犹豫 / 阻力 / 留恋），右边一竖是你的，
      中间上下是「影响了 TA / 影响了你」，两张看法夹在正中，底下三张收尾。
      四列加半格：「影响了TA」「是否真诚」落在正中间（2.5），底下三张错开半格。
    */
    key: 'repair', name: '感情修复', note: '双方的犹豫 · 阻力 · 留恋 · 13 张',
    cols: 4, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'theirview', label: 'TA的看法', hint: 'TA 怎么看待这段感情', col: 2, row: 2 },
      { key: 'myview', label: '你的看法', hint: '你怎么看待这段感情', col: 3, row: 2 },
      { key: 'theirinfl', label: '影响了TA', hint: '这段感情影响了 TA 什么', col: 2.5, row: 1 },
      { key: 'myinfl', label: '影响了你', hint: '这段感情影响了你什么', col: 2.5, row: 3 },
      { key: 'myhesitate', label: '你的犹豫', hint: '你对这段感情犹豫在哪里', col: 4, row: 1 },
      { key: 'theirhesitate', label: 'TA的犹豫', hint: 'TA 对这段感情犹豫在哪里', col: 1, row: 1 },
      { key: 'theirstay', label: 'TA的留恋', hint: 'TA 对这段感情留恋什么', col: 1, row: 3 },
      { key: 'mystay', label: '你的留恋', hint: '你对这段感情留恋什么', col: 4, row: 3 },
      { key: 'theirpush', label: 'TA的阻力', hint: '是什么阻力让 TA 想放弃这段感情', col: 1, row: 2 },
      { key: 'mypush', label: '你的阻力', hint: '是什么阻力让你想放弃这段感情', col: 4, row: 2 },
      { key: 'fix', label: '如何修复', hint: '这段感情要怎么修复', col: 1.5, row: 4 },
      { key: 'month', label: '下月趋势', hint: '这段感情未来一个月的趋势', col: 3.5, row: 4 },
      { key: 'honest', label: '是否真诚', hint: '这段感情是否完全真诚', col: 2.5, row: 4 },
    ],
  },
  {
    key: 'mirror', name: '破镜重圆', note: '双方现状 · 态度 · 能否复合 · 7 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1, row: 1 },
      { key: 'block', label: '分开的原因', hint: '你们在一起时的阻碍，或者分开的原因', col: 2, row: 1 },
      { key: 'myattitude', label: '你的态度', hint: '你对这段感情的态度', col: 3, row: 1 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 1, row: 2 },
      { key: 'theirattitude', label: 'TA的态度', hint: 'TA 看待这段感情的态度', col: 2, row: 2 },
      { key: 'others', label: '有新感情吗', hint: 'TA 是否已经开始了新的感情', col: 3, row: 2 },
      { key: 'result', label: '能复合吗', hint: '能不能成功复合', col: 2, row: 3 },
    ],
  },
  {
    /* 原图是一个 X：1→4 从左上斜到右下，5→8 从右上斜到左下 */
    key: 'breakup', name: '分手探寻', note: '分手原因 · 双方想法 · 结局 · 8 张',
    cols: 4, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1, row: 1 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 2, row: 2 },
      { key: 'base', label: '感情基础', hint: '你们的感情基础', col: 3, row: 3 },
      { key: 'reason', label: '分手原因', hint: '分手的原因', col: 4, row: 4 },
      { key: 'mythought', label: '你的想法', hint: '你的想法', col: 4, row: 1 },
      { key: 'theirthought', label: 'TA的想法', hint: 'TA 的想法', col: 3, row: 2 },
      { key: 'todo', label: '建议', hint: '建议', col: 2, row: 3 },
      { key: 'end', label: '结局', hint: '最后的结局', col: 1, row: 4 },
    ],
  },
  {
    /* 原图是 V 字，四层要七列，手机上牌会小到看不清；收成三列三行的 U，顺序和左右两臂不变 */
    key: 'future-lover', name: '未来恋人', note: '是不是正缘 · 7 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'who', label: 'TA是怎样的人', hint: 'TA 是一个怎样的人', col: 1, row: 1 },
      { key: 'appeared', label: '出现了吗', hint: 'TA 是否已经出现', col: 1, row: 2 },
      { key: 'sign', label: '相遇的提示', hint: '遇到 TA 时会有什么提示或特点', col: 1, row: 3 },
      { key: 'attract', label: '如何吸引TA', hint: '怎么吸引 TA 向你靠近', col: 2, row: 3 },
      { key: 'challenge', label: '会有的挑战', hint: '和 TA 在一起会遇到什么挑战', col: 3, row: 3 },
      { key: 'gain', label: '会收获什么', hint: '和 TA 在一起会收获什么', col: 3, row: 2 },
      { key: 'trend', label: '未来趋势', hint: '未来发展的趋势', col: 3, row: 1 },
    ],
  },
  {
    /* 原图是五列的 X；三列加半格就能摆出同一个 X，手机上牌还是三列的大小 */
    key: 'x-reunite', name: 'X 牌阵 · 复合', note: '复合的阻碍 · 双方想法 · 10 张',
    cols: 3, rows: 5, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'past', label: '你们过去', hint: '你们的过去', col: 1, row: 1 },
      { key: 'mynow', label: '你的现状', hint: '你现在的状况', col: 1.5, row: 2 },
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 2, row: 3 },
      { key: 'mythought', label: '你的想法', hint: '你对复合的想法', col: 2.5, row: 4 },
      { key: 'theirthought', label: 'TA的想法', hint: 'TA 对复合的想法', col: 3, row: 5 },
      { key: 'block', label: '阻碍你的', hint: '阻碍你的是什么', col: 3, row: 1 },
      { key: 'help', label: '帮助你的', hint: '能帮到你的是什么', col: 2.5, row: 2 },
      { key: 'unknown', label: '未知的事', hint: '你还不知道的事', col: 1.5, row: 4 },
      { key: 'result', label: '结果', hint: '复合的结果', col: 1, row: 5 },
      { key: 'guide', label: '指引', hint: '指引牌', col: 2, row: 1 },
    ],
  },
  /*
    第三批，暧昧 / 单恋专题。原图写「我」的保留「我」（和第一批一样），「他」「对方」改成「TA」；
    原图本来就写「你」的（真心表露）保留「你」。
    原图里有两张横放、两张斜放的牌（真心把戏、暧昧交织），它们不压在别的牌上，只是摆拍的姿势，
    这里一律竖放 —— 横压只留给真的叠在另一张上面的 cross。
  */
  {
    key: 'one-way', name: '情感单向状态', note: '了解我多少 · 期待 · 想确认关系吗 · 6 张',
    cols: 3, rows: 2, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'know', label: '了解我多少', hint: 'TA 了解我的程度', col: 1, row: 1 },
      { key: 'expect', label: '对我的期待', hint: 'TA 对我的期待', col: 2, row: 1 },
      { key: 'define', label: '怎么定义关系', hint: 'TA 如何定义我们的关系', col: 3, row: 1 },
      { key: 'feel', label: '对我的感觉', hint: 'TA 对我的感觉', col: 1, row: 2 },
      { key: 'sincere', label: '是不是真心', hint: 'TA 是不是真心', col: 2, row: 2 },
      { key: 'confirm', label: '想确认关系吗', hint: 'TA 想和我确认关系吗', col: 3, row: 2 },
    ],
  },
  {
    /* 原图和上一个同名，按前面的惯例叫 2.0。形状是从左上往右下错落的一条折线 */
    key: 'one-way2', name: '情感单向状态 2.0', note: '喜不喜欢我 · 为何退步 · 该主动吗 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'like', label: '喜不喜欢我', hint: 'TA 喜不喜欢我', col: 1.5, row: 1 },
      { key: 'retreat', label: 'TA为何退步', hint: 'TA 为什么往后退了', col: 2.5, row: 2 },
      { key: 'warm', label: '还能升温吗', hint: '这段感情还能升温吗', col: 3, row: 3 },
      { key: 'active', label: '我该主动吗', hint: '我该不该主动', col: 1, row: 2 },
      { key: 'develop', label: '关系发展', hint: '这段关系接下来会怎么发展', col: 2, row: 3 },
    ],
  },
  {
    /* 原图 6 落在正中、比 2 和 3 低半行；放在中间一行，正好是这个牌阵的核心 */
    key: 'flirt-probe', name: '暧昧试探', note: '理想型 · 底线 · 能突破吗 · 6 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'ideal', label: 'TA的理想型', hint: 'TA 的理想型是什么样', col: 2, row: 1 },
      { key: 'bottom', label: 'TA的底线', hint: 'TA 的底线是什么', col: 1, row: 2 },
      { key: 'attract', label: '容易吸引TA的', hint: '什么样的人、什么特质容易吸引 TA', col: 3, row: 2 },
      { key: 'pace', label: '暧昧节奏', hint: 'TA 的暧昧节奏', col: 1, row: 3 },
      { key: 'break', label: '关系能突破吗', hint: '我们的关系能突破吗', col: 3, row: 3 },
      { key: 'realfeel', label: '真实感受', hint: 'TA 对我的真实感受', col: 2, row: 2 },
    ],
  },
  {
    key: 'first-meet', name: '初相识', note: '第一印象 · 有没有好感 · 怎么相处 · 6 张',
    cols: 2, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'impression', label: '第一印象', hint: 'TA 对我的第一印象', col: 1, row: 1 },
      { key: 'offend', label: '有冒犯到吗', hint: '我有没有冒犯到 TA 的地方', col: 2, row: 1 },
      { key: 'like', label: '有没有好感', hint: 'TA 对我有没有好感', col: 1, row: 2 },
      { key: 'next', label: '对我的下一步', hint: 'TA 对我的下一步打算', col: 2, row: 2 },
      { key: 'develop', label: '能发展吗', hint: '我们有没有发展的可能', col: 1, row: 3 },
      { key: 'howto', label: '该如何相处', hint: '我该怎么和 TA 相处', col: 2, row: 3 },
    ],
  },
  {
    key: 'heart-game', name: '真心把戏', note: '放下过往 · 依赖 · 当恋爱对象吗 · 8 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'past', label: '放下过往了吗', hint: 'TA 放下过往了吗', col: 2, row: 1 },
      { key: 'body', label: '身体吸引力', hint: '我的身体对 TA 的吸引力', col: 1, row: 2 },
      { key: 'depend', label: '情感依赖', hint: 'TA 对我的情感依赖程度', col: 3, row: 2 },
      { key: 'worry', label: '有无顾虑', hint: 'TA 对这段关系是否有顾虑', col: 2, row: 3 },
      { key: 'judge', label: '如何评价我', hint: 'TA 如何评价我', col: 2, row: 2 },
      { key: 'decide', label: 'TA的决定', hint: '这段关系，TA 的决定是什么', col: 1, row: 3 },
      { key: 'others', label: '和别人聊吗', hint: 'TA 有没有和别人聊', col: 3, row: 3 },
      { key: 'lover', label: '当恋爱对象吗', hint: 'TA 有没有把我当「恋爱对象」来发展', col: 2, row: 4 },
    ],
  },
  {
    /* 原图最后三张共用一个问题「我们的关系会到哪一步」，按从左到右拆成眼前、接下来、最后 */
    key: 'flirt-filter', name: '暧昧滤镜', note: '双方的滤镜 · 替代品吗 · 会到哪一步 · 7 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'myfilter', label: '我对TA的滤镜', hint: '我对 TA 有什么滤镜', col: 2, row: 1 },
      { key: 'standin', label: '我是替代品吗', hint: '我是不是别人的替代品', col: 1, row: 2 },
      { key: 'wish', label: 'TA希望的爱', hint: 'TA 所希望的爱是什么样', col: 3, row: 2 },
      { key: 'theirfilter', label: 'TA对我的滤镜', hint: 'TA 对我有什么滤镜', col: 2, row: 3 },
      { key: 'step1', label: '眼前这一步', hint: '我们的关系会到哪一步：眼前这一步', col: 1, row: 4 },
      { key: 'step2', label: '接下来', hint: '我们的关系会到哪一步：再往后走', col: 2, row: 4 },
      { key: 'step3', label: '最后到哪', hint: '我们的关系会到哪一步：最后停在哪', col: 3, row: 4 },
    ],
  },
  {
    key: 'heart-reveal', name: '真心表露', note: '隐瞒 · 误会 · 暧昧的方向 · 5 张',
    cols: 3, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'hide', label: '刻意隐瞒', hint: 'TA 刻意隐瞒的迹象', col: 2, row: 1 },
      { key: 'misread', label: '你误会TA的', hint: '你可能误会 TA 的地方', col: 1, row: 2 },
      { key: 'imagine', label: '如何想象你们', hint: 'TA 如何想象你们', col: 3, row: 2 },
      { key: 'sign', label: '喜欢的迹象', hint: 'TA 如果喜欢你，会出现的迹象', col: 2, row: 3 },
      { key: 'direction', label: '暧昧的方向', hint: '这段暧昧真实的方向', col: 2, row: 2 },
    ],
  },
  {
    key: 'love-trace', name: '恋爱寻踪', note: '是否喜欢 · 目的 · 会在一起吗 · 6 张',
    cols: 2, rows: 3, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'plan', label: '对我的打算', hint: 'TA 对我的打算', col: 1, row: 1 },
      { key: 'like', label: '是否喜欢', hint: 'TA 是否喜欢我', col: 2, row: 1 },
      { key: 'intent', label: 'TA的目的', hint: 'TA 接近我的目的、意图', col: 1, row: 2 },
      { key: 'date', label: '想跟我谈吗', hint: 'TA 想跟我谈恋爱吗', col: 2, row: 2 },
      { key: 'others', label: '有跟别人聊吗', hint: 'TA 有没有在跟别人聊', col: 1, row: 3 },
      { key: 'together', label: '会在一起吗', hint: '我们会在一起吗', col: 2, row: 3 },
    ],
  },
  {
    /* 「三方」是原图的说法，指第三方 */
    key: 'flirt-weave', name: '暧昧交织', note: 'TA · 我 · 第三方 · 会选择我吗 · 7 张',
    cols: 3, rows: 4, colWidth: 100, lgColWidth: 130, card: 'md',
    positions: [
      { key: 'theirnow', label: 'TA的现状', hint: 'TA 现在的状况', col: 2, row: 1 },
      { key: 'tome', label: '对我的感觉', hint: 'TA 对我的感觉', col: 1, row: 2 },
      { key: 'tothird', label: '对三方的感觉', hint: 'TA 对第三方的感觉', col: 3, row: 2 },
      { key: 'menext', label: '对我的下一步', hint: 'TA 对我的下一步', col: 1.5, row: 3 },
      { key: 'thirdnext', label: '对三方下一步', hint: 'TA 对第三方的下一步', col: 2.5, row: 3 },
      { key: 'choose', label: '会选择我吗', hint: 'TA 会选择我吗', col: 1, row: 4 },
      { key: 'where', label: '会走到哪一步', hint: '我们会走到哪一步', col: 3, row: 4 },
    ],
  },
];

const PRESET_QUESTIONS = [
  'TA到底还在意我吗',
  '我是不是在自我消耗',
  '这段关系值不值得继续',
  '我该主动还是该退回来',
];

/**
 * 报告指出的主要失衡来源 → 一个直接对着它的问题。
 * 塔罗是跟着恋爱分析来的：报告已经指出问题在哪，选题就不该从零开始问。
 *
 * ⚠️ 措辞必须只说指标真正测到的东西。
 *    `latency` 测的是「回得慢」（中位数差距），不是「越来越慢」——
 *    后者是另一个指标 otherLatencyTrendPct，样本常常不足。
 *    问题里塞进一个数据不支持的前提，模型就会顺着那个前提编下去。
 */
const DRIVER_QUESTION: Record<string, string> = {
  initiation: '为什么每次都是我先开口',
  latency: 'TA为什么总是隔很久才回',
  length: 'TA是不是在敷衍我',
  questions: 'TA到底想不想了解我',
};

/** 只有趋势指标真的成立时，才敢问「越来越慢」 */
const TREND_QUESTION = 'TA是不是在慢慢退出';

/**
 * 牌堆的几何：**一个圆盘**，不是扇形。
 *
 * 为什么不是扇形 —— 这是一路踩过来才看清的：
 * 51 张摊在 70° 的弧上，每张只能露 9.9px；摊在 360° 的整圆上，每张露 51px。
 * 同样的半径，圆盘的周长是扇形弧长的 5 倍。
 * 之前一直在跟「每张只露 2.9px」较劲（先加牌缘、又改竖弧），
 * 而根本原因是那个形状只占整圆的 1/5。
 *
 * 丢掉的东西要如实记一笔：**摊成扇形是塔罗师的手势，圆盘不是**。
 * 换掉它的理由是扇形当时也没真的在表演那个手势 —— 露 9px 看着是一把梳子。
 *
 * 代码也因此简单了一大截：不再需要支点百分比、inset、两套轴，
 * 就是绕容器中心转一圈。r 是牌心到圆心的距离，按各档屏宽给死：
 *   外径 = r + 牌高/2，容器得装得下这个外径的两倍。
 */
/** 圆盘半径的上下限。上限是别让牌稀疏到不像一叠，下限是再小就挤成一坨 */
const RING_R = { min: 56, max: 150 } as const;

/**
 * 由可用宽度反算牌心半径。
 *
 * 固定半径服务不了所有屏宽：375px 手机塞不下桌面那个盘，320px 手机连 94 都塞不下。
 * 外接角在 hypot(R + 牌高/2, 牌宽/2) 处，令它等于可用半宽，反解出 R。
 */
function ringRadius(available: number) {
  const half = available / 2;
  const inner = Math.sqrt(Math.max(0, half * half - (FAN_CARD.w / 2) ** 2)) - FAN_CARD.h / 2;
  return Math.max(RING_R.min, Math.min(RING_R.max, inner));
}

/**
 * 扇形里那张牌的像素尺寸。跟着 TarotCard 的 SIZE.sm 走：w-[92px] + aspect-[2/3]。
 * 写死在这里是因为命中判定要用它算支点位置，而 sm 这一档本来就不是响应式的。
 */
const FAN_CARD = { w: 92, h: 138 } as const;


/**
 * 牌堆只放有插画的牌。
 *
 * 55 张小阿卡纳还没出图，走矢量线稿。线稿再怎么对齐母样式也不是同一套牌，
 * 三张里混进一张就会显得整副牌不齐。宁可只用 23 张真图 ——
 * 大阿卡纳牌阵本身就是正经的塔罗实践。出完图把 code 加进 illustrated.ts 即可。
 */
const DECK = TAROT_CARDS.filter(c => ILLUSTRATED.includes(cardCode(c.name)));

/** 洗牌后抽 n 张不重复的牌，各自随机正逆位 */
function drawCards(n: number) {
  const pool = [...DECK];
  const out: { name: string; reversed: boolean }[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push({ name: pool[idx].name, reversed: Math.random() < 0.4 });
    pool.splice(idx, 1);
  }
  return out;
}

/** 分钟 → 人话。事实要一眼读懂，「1540 分钟」不是给人看的 */
function humanMinutes(min: number): string {
  if (min < 60) return `${min} 分钟`;
  if (min < 60 * 24) {
    const h = min / 60;
    return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} 小时`;
  }
  const d = min / 1440;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)} 天`;
}

/** 变化幅度：超过一倍就用倍数说，「慢了 2120%」没人能瞬间换算 */
function humanChange(pct: number): string {
  const abs = Math.abs(pct);
  return abs >= 100 ? `${(abs / 100 + 1).toFixed(1).replace(/\.0$/, '')} 倍` : `${abs}%`;
}

/** 把指标翻译成一行一句的事实陈述——不解读，只陈述 */
function factsFrom(m: RelationshipMetrics, otherName: string): string[] {
  if (!m.sufficient) return [];
  const f: string[] = [];
  if (m.myInitiationShare !== null) {
    f.push(`${Math.round(m.myInitiationShare * 100)}% 的对话是你开启的`);
  }
  if (m.me.medianReplyMinutes !== null && m.other.medianReplyMinutes !== null) {
    // metrics.ts 把「隔夜才接话」算作重新发起、不计进延迟，所以这个中位数只覆盖同一段对话内的回复。
    // 不加这句限定，它会和下面「让你等了超过 24 小时」看起来自相矛盾。
    f.push(`同一段对话里，你的回复中位数 ${humanMinutes(m.me.medianReplyMinutes)}，${otherName}是 ${humanMinutes(m.other.medianReplyMinutes)}`);
  }
  if (m.lengthRatio !== null && m.lengthRatio > 1.5) {
    f.push(`你平均每条 ${m.me.avgLength} 字，对方 ${m.other.avgLength} 字`);
  }
  if (m.me.questionCount > 0 && m.other.questionCount * 2 < m.me.questionCount) {
    f.push(`你提问 ${m.me.questionCount} 次，对方 ${m.other.questionCount} 次`);
  }
  if (m.other.leftOtherWaiting > 0) {
    f.push(`对方有 ${m.other.leftOtherWaiting} 次让你等了超过 24 小时`);
  }
  if (m.otherLatencyTrendPct !== null && Math.abs(m.otherLatencyTrendPct) > 20) {
    const dir = m.otherLatencyTrendPct > 0 ? '慢' : '快';
    f.push(`对方回复速度比前半段${dir}了 ${humanChange(m.otherLatencyTrendPct)}`);
  }
  return f;
}

interface TarotProps {
  /** 要解读的会话消息；没有就只能抽牌，不出证据 */
  messages?: ChatMessage[];
  myUid?: string;
  otherName?: string;
  /**
   * 恋爱分析已经算好的结果。塔罗跟着报告走 ——
   * 传进来就用报告那一份，保证两屏说的是同一件事；不传才自己算（独立使用时）。
   */
  metrics?: RelationshipMetrics;
  imbalance?: Imbalance;
  onBack?: () => void;
}

/**
 * 解读的正文 —— **「一份证据，两种看法」第一次同屏**。
 *
 * 左边是牌的说法，右边紧挨着它挂的那条数字。同一件事，两种讲法，并排摆着。
 * 在这之前两种看法是两个先后访问的页面，你永远看不到它们对照 ——
 * 那个想法只活在 README 的一句话里。
 *
 * 窄屏放不下两栏就退成上下，证据在下面用一道朱红竖线带住，关系不丢。
 */
function ReadingBody({
  text, positions, facts,
}: { text: string; positions: readonly string[]; facts: string[] }) {
  const parsed = useMemo(() => parseReading(text, positions), [text, positions]);

  // 认不出结构就原样显示。硬切错位比不切难看得多，也更容易骗到人（见 parseReading.ts）
  if (!parsed) {
    return <p className="whitespace-pre-wrap text-[14px] leading-[2]">{text}</p>;
  }

  return (
    <div className="space-y-7">
      {parsed.intro && (
        <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-ink-mid">{parsed.intro}</p>
      )}

      {parsed.blocks.map((b, i) => {
        // 模型偶尔会引一条不存在的编号，越界的直接丢掉，不显示空行
        const cited = b.facts
          .map(n => ({ n, text: facts[n - 1] }))
          .filter(f => !!f.text);
        return (
          <article key={i} className="border-t border-ink/15 pt-6 first:border-t-0 first:pt-0">
            <div className="sm:grid sm:grid-cols-[1fr_15rem] sm:gap-8">
              <div>
                <p className="font-serif text-[16px] font-semibold leading-snug">{b.heading}</p>
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[2]">{b.body}</p>
              </div>

              {cited.length > 0 && (
                /*
                  证据这一侧全部走等宽 —— 它是「算出来的」那一种声音，
                  和左边模型写的那段在材质上就分得开，不用贴标签说明。
                */
                <aside className="mt-5 space-y-3 border-l-2 border-vermilion pl-4 sm:mt-1 sm:border-l sm:border-ink/25">
                  {cited.map(f => (
                    <div key={f.n}>
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-vermilion">
                        证据 {String(f.n).padStart(2, '0')}
                      </p>
                      <p className="mt-2 font-mono text-[12px] leading-[1.85] tabular-nums text-ink">
                        {f.text}
                      </p>
                    </div>
                  ))}
                </aside>
              )}
            </div>
          </article>
        );
      })}

      {parsed.outro && (
        <p className="whitespace-pre-wrap border-t border-ink/15 pt-6 text-[14px] leading-[2]">
          {parsed.outro}
        </p>
      )}
    </div>
  );
}

export default function Tarot({
  messages = [], myUid = '', otherName = '对方',
  metrics: metricsProp, imbalance: imbalanceProp, onBack,
}: TarotProps) {
  const [step, setStep] = useState<Step>('ask');
  const [question, setQuestion] = useState('');
  /** 选中的牌阵。默认三张 —— 它是这个产品原本绑定的形状，也是报头写着的那个 */
  const [spreadKey, setSpreadKey] = useState('three');
  // 牌堆摊在桌上，由用户自己点；drawn 是他挑走的那三张，不再由系统发
  const [fan, setFan] = useState<{ name: string; reversed: boolean }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [shuffling, setShuffling] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [readingError, setReadingError] = useState<string | null>(null);
  const [loadingReading, setLoadingReading] = useState(false);
  // 重试的触发器。不能靠 setStep('reading') —— 值没变，effect 不会重跑
  const [attempt, setAttempt] = useState(0);

  const metrics = useMemo(
    () => metricsProp ?? computeRelationshipMetrics(messages, myUid),
    [metricsProp, messages, myUid],
  );
  const imbalance = useMemo(
    () => imbalanceProp ?? computeImbalance(metrics),
    [imbalanceProp, metrics],
  );
  /** 报告的一句话结论。证据屏和解读都挂在它上面 */
  const verdict = useMemo(() => {
    if (!metrics.sufficient) return null;
    const lean = imbalance.leaning === 'me' ? '你投入得更多'
      : imbalance.leaning === 'other' ? `${otherName}投入得更多` : '大致持平';
    return {
      score: imbalance.score,
      band: IMBALANCE_LABEL[imbalance.band],
      lean,
      driver: imbalance.topDriver?.label ?? null,
    };
  }, [metrics.sufficient, imbalance, otherName]);
  /** 报告指出问题在哪，选题就从那里开始 */
  const presets = useMemo(() => {
    const seeded: string[] = [];
    const byDriver = imbalance.topDriver && DRIVER_QUESTION[imbalance.topDriver.key];
    if (byDriver) seeded.push(byDriver);
    // 「他是不是在退出」只在趋势指标真的算得出、且确实变慢时才问
    if ((metrics.otherLatencyTrendPct ?? 0) > 20) seeded.push(TREND_QUESTION);
    return seeded.length
      ? [...seeded, ...PRESET_QUESTIONS.filter(q => !seeded.includes(q))].slice(0, 4)
      : PRESET_QUESTIONS;
  }, [imbalance.topDriver, metrics.otherLatencyTrendPct]);
  const facts = useMemo(() => factsFrom(metrics, otherName), [metrics, otherName]);
  const drawn = useMemo(() => picked.map(i => fan[i]).filter(Boolean), [picked, fan]);

  // 扇形的弧宽得跟着屏幕走：手机上照桌面的角度扇会直接溢出屏幕
  /*
    媒体查询的 wide / side 两个 state 删掉了：
    半径改成由实测宽度反算之后，JS 侧不再需要知道「现在是哪一档屏幕」——
    两栏布局是纯 CSS（lg:flex），圆盘大小跟着容器走。少两个订阅、少两次重渲染。
  */
  /*
    圆盘按**实测可用宽度**定半径，不写死。
    ResizeObserver 盯着外层那个满宽的壳子（不是盘本身 —— 盘的尺寸由 R 决定，
    盯它自己会绕成循环）。
  */
  const ringWrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = ringWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWrapW(e.contentRect.width));
    ro.observe(el);
    setWrapW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [step, shuffling]);
  /** 牌心到圆心的距离 */
  const R = ringRadius(wrapW || 320);

  /*
    牌阵和它的张数。以前这两样写死成 POSITIONS 和字面量 3，
    散落在 8 个地方（抽满的判断、翻完的判断、三处文案、两处布局）。
    现在只有这一个来源 —— 加牌阵不用再去找那 8 处。
  */
  const spread = useMemo(
    () => SPREADS.find(s => s.key === spreadKey) ?? SPREADS[1],
    [spreadKey],
  );
  const need = spread.positions.length;
  /** 还在从牌堆里挑。窄屏这时只显示小地图，见抽牌屏 */
  const drawing = !shuffling && picked.length < need;
  /** 解析解读用的位置名。身份要稳定，否则 ReadingBody 里的 useMemo 每次都白做 */
  const positionLabels = useMemo(() => spread.positions.map(p => p.label), [spread]);

  /**
   * 滑动选牌。
   *
   * 手机上每张牌只露 2.9px（51 张铺在 374px 的弧上，几何上限，材质救不了）。
   * 靠点是选不准的，所以改成**指尖扫过**：手指划到哪张，哪张就升到最上面并抬起来，
   * 整张牌背露出来，松手就是选它。
   *
   * ⚠️ 命中判定**不能用 document.elementFromPoint**。
   *    被选中的牌会抬起 30px —— 一抬起来就从手指底下挪开了，
   *    命中目标随之改变、牌落回去、又被命中……来回抖。
   *    改成纯几何：牌全都绕同一个支点转，那么「手指相对支点的角度」直接就是牌的角度，
   *    反解出序号即可。这个算法不读任何牌的位置，所以抬起来也不会反馈回来。
   */
  const fanBoxRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  /** 51 张牌的 DOM。滑动时直接改它们的 style，不经过 React */
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /*
    手指底下是第几张 —— **故意不是 state**。

    上一版它是 state，于是每次移动都要重渲染 51 个 motion 组件，
    再由 51 个 JS 弹簧逐帧写 transform。牌堆是这个界面里唯一会同时动几十个元素的
    地方，motion 那点编排能力在这里换不回代价。

    现在：序号存 ref，变化时只动受影响的那几张的行内 style，
    React 在整个滑动过程中一次都不重渲染。
  */
  const focusRef = useRef<number | null>(null);
  /** 发牌散开播完没有。播的时候 CSS 动画压着 transform，这时候改行内值会在动画结束时跳一下 */
  const dealtRef = useRef(false);

  /** 拨开的窗口：窗口外的牌 part 恒为 0，一个字节都不用碰 */
  const PART_WINDOW = 3;
  const LIFT = 30;

  const angleOf = (i: number) =>
    fan.length > 1 ? (360 * i) / fan.length : 0;

  /**
   * 第 i 张牌在「focus 是第 f 张」时该摆成什么样。
   * 首次渲染的行内 transform 和滑动时写进去的，必须出自这同一个函数 ——
   * 两份公式迟早会差一点，差出来就是滑动开始时的一次跳动。
   */
  const cardTransform = (i: number, f: number | null) => {
    const on = f === i;
    /*
      手指底下那张之外，左右邻居往两边让一点，做出「拨开」的手感。

      ⚠️ 幅度必须拿「每张牌占多少度」来量。51 张铺 40°，一张只占 0.8°。
         第一版给了 4°，等于把最近的邻居推开 5 张的距离，扇形被撕出一个口子。
         1.2° 约等于一张半，才是「让开」。
    */
    const part = f === null || on
      ? 0
      : Math.sign(i - f) * 1.2 * Math.max(0, 1 - Math.abs(i - f) / PART_WINDOW);
    /*
      径向排布：先把牌摆到容器正中，绕自身中心转到该去的方向，再沿着**转过之后的
      「上」**推出 R —— 于是牌自然朝外，抬起也只是把 R 加大一点，方向自动是往外的。

      顺序不能换：translateY 必须在 rotate 之后，才是「在牌自己的坐标系里往外」。
      写在 rotate 前面就变成屏幕坐标系的正上方，下半圈的牌会往圆心里缩。
    */
    return `translate(-50%, -50%) rotate(${(angleOf(i) + part).toFixed(3)}deg) translateY(${-(R + (on ? LIFT : 0))}px)`;
  };

  /**
   * 换一张 focus。**只碰新旧焦点各自窗口内的那几张**，最多 14 个元素，
   * 其余 37 张一个字节都不动。
   */
  const applyFocus = (next: number | null) => {
    const prev = focusRef.current;
    if (prev === next || !dealtRef.current) return;
    focusRef.current = next;
    const touched = new Set<number>();
    for (const c of [prev, next]) {
      if (c === null) continue;
      for (let d = -PART_WINDOW; d <= PART_WINDOW; d++) {
        const j = c + d;
        if (j >= 0 && j < fan.length) touched.add(j);
      }
    }
    for (const j of touched) {
      const el = cardRefs.current[j];
      if (!el) continue;
      el.style.transform = cardTransform(j, next);
      /*
        「露出整张牌」只能靠 z-index —— 靠把邻居转开需要约 24° 才让得出一张牌的宽度，
        那等于把整个扇形拆了。
      */
      el.style.zIndex = String(j === next ? fan.length + 1 : j);
    }
  };

  const indexAt = (clientX: number, clientY: number): number | null => {
    const box = fanBoxRef.current;
    if (!box || fan.length < 2) return null;
    const r = box.getBoundingClientRect();
    /*
      圆心就是容器正中，所以「手指相对圆心的方向」直接就是牌的角度，反解出序号。
      这个算法不读任何牌的位置，所以牌被推出来也不会反馈回来把命中目标带跑。

      0° 是正上方，顺时针为正 —— 和 cardTransform 里 rotate 的方向必须一致。
    */
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    // 圆心附近方向是没意义的（半径越小角度抖得越厉害），太靠里就不认
    if (dist < R * 0.35) return null;
    let deg = Math.atan2(clientX - cx, cy - clientY) * (180 / Math.PI);
    if (deg < 0) deg += 360;                         // 归一到 [0,360)
    const step = 360 / fan.length;
    const raw = Math.round(deg / step) % fan.length;
    // 已经抽走的牌在圈上留了空档，就近找一张还在的。环形要绕回去，不是夹在两端
    for (let d = 0; d < fan.length; d++) {
      for (const j of [(raw - d + fan.length) % fan.length, (raw + d) % fan.length]) {
        if (!picked.includes(j)) return j;
      }
    }
    return null;
  };

  /*
    不再需要 rAF 节流：applyFocus 现在只是几次行内赋值，
    而 transform / z-index 都不会让布局失效，所以 getBoundingClientRect 读的是缓存值。
    顺带一个好处 —— 这条路径彻底不依赖 rAF，在动画被节流的环境里照样能选牌。
  */
  const trackPointer = (e: React.PointerEvent) => applyFocus(indexAt(e.clientX, e.clientY));

  const startDraw = () => {
    setShuffling(true);
    setFan([]);
    setPicked([]);
    setRevealed([]);
    dealtRef.current = false;
    focusRef.current = null;
    setStep('draw');
    // 洗牌的 900ms 是刻意留的：仪式感来自等待
    setTimeout(() => {
      // 整副都摊上去，一次铺完 —— 十几张看着不像一副牌
      setFan(drawCards(DECK.length));
      setShuffling(false);
      // CSS 发牌动画 560ms + 最大 0.55s 延迟。播完之前不许改行内 transform，
      // 否则动画结束时会从关键帧的终点跳到新值
      setTimeout(() => { dealtRef.current = true; }, 1200);
    }, 900);
  };

  /** 从牌堆里挑一张，落到下一个空位。已挑过的、或已经抽满这个牌阵的，都不再响应 */
  const pick = (i: number) => {
    // 先把邻居归位：被抽走那张的左右还停在「让开」的角度上，不复位就留下一道歪缝
    applyFocus(null);
    setPicked(prev => (prev.includes(i) || prev.length >= need ? prev : [...prev, i]));
  };

  // 必须用函数式更新：连点两张牌时，第二次点击拿到的 revealed 还是旧值，
  // 直接 [...revealed, i] 会丢掉前一张，流程就永远凑不满三张。
  const reveal = (i: number) =>
    setRevealed(prev => (prev.includes(i) ? prev : [...prev, i]));

  // 三张都翻开后再进解读，留 900ms 让最后一张翻完
  useEffect(() => {
    if (revealed.length < need) return;
    const t = setTimeout(() => setStep('reading'), 900);
    return () => clearTimeout(t);
  }, [revealed.length, need]);

  // 解读只在服务端生成：客户端不持有 GEMINI_API_KEY
  useEffect(() => {
    if (step !== 'reading' || reading || loadingReading) return;
    let cancelled = false;
    setLoadingReading(true);
    setReadingError(null);
    fetch('/api/tarot/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        cards: drawn.map((c, i) => ({ ...c, position: spread.positions[i].label })),
        facts,
        // 报告的结论一并带上：牌可以换个说法，但不能和恋爱分析打架
        verdict,
      }),
    })
      // 边到边显示：不等整段写完
      .then(r => readStream(r, all => { if (!cancelled) setReading(all); }))
      .catch(e => { if (!cancelled) setReadingError(e.message); })
      .finally(() => { if (!cancelled) setLoadingReading(false); });
    return () => { cancelled = true; };
  }, [step, attempt]);

  const reset = () => {
    setStep('ask');
    setQuestion('');
    dealtRef.current = false;
    focusRef.current = null;
    setFan([]);
    setPicked([]);
    setRevealed([]);
    setReading(null);
    setReadingError(null);
  };

  return (
    <div className="paper-grain relative flex flex-1 flex-col overflow-y-auto scrollbar-hide bg-paper">
      {/*
        抽牌这一步在宽屏是两栏（牌阵 + 圆盘牌堆），3xl 装不下：
        768 − 内边距 96 − 牌堆 440 − 间距 40 = 192，凯尔特十字本该 424，被压掉一半。
        只有这一步放宽，提问和解读仍然是适合阅读的 3xl 单栏宽度。
      */}
      <div className={`relative z-[1] mx-auto w-full flex-1 px-7 pt-8 pb-24 md:px-12 ${
        step === 'draw' ? 'max-w-3xl lg:max-w-5xl' : 'max-w-3xl'
      }`}>
        {/* 报头和恋爱分析同一套：这是同一份印刷品的两页 */}
        <header className="mb-8">
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2.5">
            <div className="flex items-center gap-2">
              {/* 首屏独立运行时没有可返回的地方，就不画一个按不动的按钮 */}
              {!(step === 'ask' && !onBack) && (
                <button
                  onClick={step === 'ask' ? onBack : reset}
                  aria-label={step === 'ask' ? '返回' : '重新开始'}
                  className="-ml-1.5 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                >
                  <ArrowLeft size={17} />
                </button>
              )}
              <h1 className="font-serif text-[21px] font-semibold tracking-[0.02em]">真心塔罗</h1>
            </div>
            <p className="text-right font-mono text-[9px] leading-[1.7] tracking-[0.13em] text-ink-mid">
              REALHEART TAROT
              <br />
              {/*
                只写名字和张数。位置列表放不进报头 ——
                「关系牌阵 · 你 · TA · 你们之间 · 挡在中间的 · 走向」会把「真心塔罗」挤成两行。
                完整的位置说明在选牌阵那一格里，那里有地方。
              */}
              {spread.name} · {need} 张
            </p>
          </div>
          {/* 步骤：走到哪一步就点亮到哪一步 */}
          <div className="flex items-center gap-2 pt-2.5">
            {(['ask', 'draw', 'reading'] as Step[]).map((st, i) => {
              const done = (['ask', 'draw', 'reading'] as Step[]).indexOf(step) >= i;
              return (
                <React.Fragment key={st}>
                  {i > 0 && <div className={`h-px w-6 ${done ? 'bg-vermilion/60' : 'bg-ink/20'}`} />}
                  <span className={`font-mono text-[8.5px] uppercase tracking-[0.2em] ${done ? 'text-vermilion' : 'text-ink-faint'}`}>
                    {['question', 'draw', 'reading'][i]}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </header>

        <div className="relative flex-1">
          {/* ---------------- 1 提问 ---------------- */}
          {step === 'ask' && (
            <motion.div
              key="ask"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-8"
            >
              {/*
                选牌阵。放在提问之前：先定形状，再定问题 ——
                一张牌和十张牌该问的问题不是一回事。
                用和预设问题同一套细线网格，不新引入一种控件形状。
              */}
              <div>
                <p className="pb-2 text-[12.5px] text-ink-mid">用哪个牌阵</p>
                <div className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/15">
                  {SPREADS.map((sp, i) => (
                    <button
                      key={sp.key}
                      onClick={() => setSpreadKey(sp.key)}
                      // 总数是奇数时最后一个占满一行，不然网格末尾会露出一块灰底
                      className={`px-3 py-3 text-left transition-colors ${
                        i === SPREADS.length - 1 && i % 2 === 0 ? 'col-span-2 ' : ''
                      }${
                        sp.key === spreadKey
                          ? 'bg-ink text-paper'
                          : 'bg-paper hover:bg-paper-raised'
                      }`}
                    >
                      <span className="block font-serif text-[15px] font-semibold">{sp.name}</span>
                      <span className={`mt-1 block text-[11px] leading-snug ${
                        sp.key === spreadKey ? 'text-paper/70' : 'text-ink-faint'
                      }`}>{sp.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  你想弄清楚什么
                </h2>
                <p className="mt-4 text-[13.5px] leading-[1.9] text-ink-mid">
                  牌只负责把话说出来。真正的答案来自你们之间已经发生的事。
                </p>
              </div>

              <div className="relative">
                {/*
                  不再是一个带边框的浅色方盒 —— 那是通用表单控件的形状，
                  一出现就把整页攒的编辑感抵消掉。这里只留一道书写线：
                  和章节标题下那根线、报告里的点引线是同一套东西。
                  16px 不只是为了层级，也是 iOS 上聚焦不触发自动放大的下限。
                */}
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={2}
                  placeholder="把问题写清楚一点，越具体越准"
                  className="w-full resize-none border-x-0 border-t-0 border-b-[1.5px] border-ink/30 bg-transparent px-0 py-2 text-[16px] leading-[1.9] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-vermilion"
                />
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-ink-mid">或者从这些开始</p>
                {/*
                  原来是 flex-wrap，四条问题长短不一 → 两列右边缘参差、行高不齐，
                  看着像没排完。presets 恒为 4 条（见 PRESET_QUESTIONS / slice(0,4)），
                  所以直接用 2×2 细线网格：等宽、对齐，和报告页的表格是同一套语言。
                  gap-px + 底色 = 网格线，不用给每个格子画边框。
                */}
                <div className="grid grid-cols-2 gap-px border border-ink/15 bg-ink/15">
                  {presets.map(q => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className={`px-3 py-3.5 text-center text-xs leading-snug transition-colors ${
                        question === q
                          ? 'bg-ink text-paper'
                          : 'bg-paper text-ink-mid hover:bg-paper-raised hover:text-ink'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* 证据可用性——诚实地先说清楚 */}
              <div className={`border-l-2 pl-3.5 ${metrics.sufficient ? 'border-ink' : 'border-vermilion/40'}`}>
                <div className="flex-1 min-w-0">
                  {/*
                    一条记录都没接的人和记录太短的人，要分开说。
                    对前者写「消息仅 0 条，不足 20 条」是在报一个他没犯的错 ——
                    他压根没打算导入，独立抽牌本来就是塔罗支持的用法。
                  */}
                  <p className="font-mono text-[11px] tracking-[0.06em]">
                    {metrics.sufficient
                      ? `已读取 ${metrics.totalMessages} 条记录，跨 ${metrics.spanDays} 天`
                      : metrics.totalMessages === 0 ? '这次只有牌意' : '证据不足'}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-[1.9] text-ink-mid">
                    {verdict
                      ? `恋爱分析的结论是「${verdict.band}·${verdict.lean}」${verdict.driver ? `，主要来自「${verdict.driver}」` : ''}。牌只会换个说法说这件事。`
                      : metrics.totalMessages === 0
                      ? '还没有接入聊天记录，牌就只有牌意，说不出你们之间的任何事实。想让它绑着你的数字说话，先做一份恋爱分析。'
                      : `${metrics.insufficientReason}。仍然可以抽牌，但只有牌意，没有事实支撑。`}
                  </p>
                </div>
              </div>

              <button
                onClick={startDraw}
                disabled={!question.trim()}
                /*
                  禁用态原来是 disabled:opacity-25 —— 一整块黑填充降到 25%，
                  在纸底上就是一块大灰板，而它是屏幕上最大的元素。
                  改成描边态：没填问题时只有一道细线，填了才落成实心墨块。
                */
                className="flex w-full items-center justify-center gap-2 border border-ink bg-ink py-4 font-mono text-[10px] uppercase tracking-[0.34em] text-paper transition-colors disabled:border-ink/20 disabled:bg-transparent disabled:text-ink-faint"
              >
                开始抽牌
              </button>
            </motion.div>
          )}

          {/* ---------------- 2 抽牌 ---------------- */}
          {step === 'draw' && (
            <motion.div
              key="draw"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-6"
            >
              <div>
                <h2 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  {shuffling ? '洗牌'
                    : picked.length < need ? `从牌堆里选 ${need} 张`
                    : revealed.length < need ? `依次翻开这 ${need} 张` : ''}
                </h2>
                <p className="mt-3.5 text-[13.5px] text-ink-mid">{question}</p>
              </div>

              {shuffling ? (
                <div className="flex items-center justify-center h-[300px]">
                  {/* 洗牌：一叠牌在原地抖，底下两张露边，看得出是「一叠」而不是一张 */}
                  <div className="relative scale-[1.7] sm:scale-100">
                    {[8, 4].map((d, k) => (
                      <div key={k} className="absolute inset-0 opacity-40"
                        style={{ transform: `translate(${d}px, ${d}px) rotate(${d / 2}deg)` }}>
                        <TarotCardBack size="lg" />
                      </div>
                    ))}
                    <motion.div
                      animate={{ rotate: [0, -6, 6, 0], y: [0, -8, 0] }}
                      transition={{ duration: 0.45, repeat: Infinity }}
                      className="relative"
                    >
                      <TarotCardBack size="lg" />
                    </motion.div>
                  </div>
                </div>
              ) : (
                /*
                  宽屏分两栏：牌阵在左，牌堆在右。
                  竖排时牌阵一高（十字 837px）牌堆就掉出屏幕，
                  得滚下去选、再滚上来看落在哪 —— 两栏之后两者始终在同一屏里。
                  items-start 很重要：两栏各自顶对齐，不让矮的牌阵被拉长。
                */
                <div className="space-y-5 lg:flex lg:items-start lg:gap-10 lg:space-y-0">
                  {/*
                    各个位置：先空着摆出来，让人看见牌会落到哪。

                    用 grid 不用 flex：每个位置自己声明第几列第几行，
                    十字、菱形这些形状 flex 排不出来。列宽用 minmax(0,1fr)，
                    牌再配 fluid —— 于是 1/3/5/10 张在任何屏宽都自动缩到放得下。
                  */}
                  <div className="lg:min-w-0 lg:flex-1">
                  {/*
                    窄屏抽牌时只摆一张「小地图」：页头 + 问题 230px、牌堆 373px，
                    留给牌阵的只有一百来 px，大牌阵三行就是 690px，牌堆必然被挤到屏幕外，
                    得滑下去抽、再滑上来看。小地图保留形状，每格只写序号 ——
                    下一张落到哪个位置，牌堆底下那行字已经说了。
                    抽满之后牌堆退场，换回下面的大牌阵翻牌。宽屏是两栏，用不着这个。
                  */}
                  {drawing && (
                    <div
                      className="mx-auto grid w-max gap-y-1.5 lg:hidden"
                      style={{ gridTemplateColumns: `repeat(${spread.cols * 2}, 15px)` }}
                    >
                      {spread.positions.map((pos, i) => (
                        <div
                          key={pos.key}
                          className={`mx-[3px] flex aspect-[2/3] items-center justify-center rounded-[3px] border font-mono text-[9px] tabular-nums transition-colors ${
                            i < picked.length ? 'border-ink bg-ink text-paper'
                              : i === picked.length ? 'border-vermilion bg-paper-raised text-vermilion'
                              : 'border-ink/20 bg-paper-raised text-ink-faint'
                          }`}
                          style={{
                            gridColumn: colSpan(pos.col),
                            gridRow: pos.row,
                            ...(pos.cross ? { zIndex: 1, transform: 'rotate(90deg) scale(0.78)' } : null),
                          }}
                        >{i + 1}</div>
                      ))}
                    </div>
                  )}
                  <div
                    className={`mx-auto grid max-w-[var(--sw)] justify-center gap-x-2 gap-y-1.5 sm:gap-x-4 sm:gap-y-5 sm:max-w-[var(--sw-sm)] lg:max-w-[var(--sw-lg)] ${drawing ? 'hidden lg:grid' : ''}`}
                    style={{
                      gridTemplateColumns: `repeat(${spread.cols * 2}, minmax(0, 1fr))`,
                      ...gridWidth(spread),
                    }}
                  >
                    {spread.positions.map((pos, i) => {
                      const card = drawn[i];
                      const isNext = picked.length === i;
                      return (
                        <div
                          key={pos.key}
                          className={pos.cross ? '' : 'space-y-1 lg:space-y-2'}
                          style={{
                            gridColumn: colSpan(pos.col),
                            gridRow: pos.row,
                            /*
                              「阻碍」和「现况」占同一格，横压在上面 —— 这是凯尔特十字的签名。

                              ⚠️ 旋转只能加在**牌**上，不能加在整格上。
                                 加在整格上，标签和「点一下翻开」会跟着竖过来，
                                 而且会和现况的标签叠在一起。
                              这一格也因此不渲染标签和说明：同一格里两份文字必然打架，
                              横着的那张本身就说明了它是哪一个。
                            */
                            ...(pos.cross ? { zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: '100%' } : null),
                          }}
                        >
                          {!pos.cross && (
                          <div className="text-center">
                            {/* 原来这里还有一行 ORIGIN / PRESENT / TREND，是中文标签的拉丁复读，纯装饰 */}
                            <p className={`font-serif text-[14px] font-semibold transition-colors max-lg:leading-tight ${
                              card || isNext ? 'text-ink' : 'text-ink-faint'
                            }`}>{pos.label}</p>
                          </div>
                          )}
                          {/*
                            ⚠️ 横压那张必须缩。牌是 2:3，转 90° 之后宽度变成原来的 1.5 倍，
                               原样放会撑出格子、盖住左右两张。
                               0.78 之后宽度约 1.17 格，多出来的那点正好落进列间沟里 ——
                               压过去一点是对的（实体牌就是这样），盖住邻居不是。
                          */}
                          <div style={pos.cross ? { transform: 'rotate(90deg) scale(0.78)' } : undefined}>

                          {card ? (
                            /* 落位：从牌堆方向弹上来，再交给翻牌 */
                            <motion.div
                              // 同上：不从 opacity 0 起，否则抽到的三张牌在被节流的环境里是隐形的
                              initial={{ y: 120, scale: 0.75 }}
                              animate={{ y: 0, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                              onClick={() => reveal(i)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(i); }
                              }}
                              // 扇形里的牌是带 aria-label 的 button，翻牌却是个裸 div：
                              // 同一个流程里两套标准，键盘用户走到这一步就卡死了
                              role="button"
                              tabIndex={revealed.includes(i) ? -1 : 0}
                              aria-label={revealed.includes(i) ? `${pos.label}：${card.name}` : `翻开${pos.label}这张牌`}
                              className="relative cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-vermilion/70 sm:rounded-[1.75rem]"
                              style={{ perspective: 1000 }}
                            >
                              {/* 翻牌：用 3D rotateY，牌背与牌面各占一半 */}
                              <motion.div
                                animate={{ rotateY: revealed.includes(i) ? 180 : 0 }}
                                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                                style={{ transformStyle: 'preserve-3d' }}
                                className="relative"
                              >
                                <div className="backface-hidden">
                                  <TarotCardBack size={spread.card} fluid />
                                </div>
                                <div className="absolute inset-0 backface-hidden"
                                  style={{ transform: 'rotateY(180deg)' }}>
                                  <TarotCard name={card.name} reversed={card.reversed} size={spread.card} fluid />
                                </div>
                              </motion.div>
                            </motion.div>
                          ) : (
                            /*
                              空位用细线，不用虚线大框：虚线空框是「表单没填完」的语言。
                              尺寸跟着 md 走（和落位后的牌一致）—— 这一屏的主角是牌堆，
                              三个空框占满首屏会把唯一能操作的东西挤到屏幕外。
                            */
                            <div className={`relative flex aspect-[2/3] w-full items-center justify-center border bg-paper-raised transition-colors ${
                              isNext ? 'border-vermilion' : 'border-ink/20'
                            }`}>
                              {/*
                                原来内层是一圈 border-dotted —— 虚线空框是「表单没填完」的语言，
                                和一副牌没有任何关系。换成牌背那个同心徽记的极淡拓印：
                                空位于是变成「这里要落一张牌」，而不是「这里有个字段没填」。
                              */}
                              <svg viewBox="0 0 100 150" aria-hidden="true"
                                className="pointer-events-none absolute inset-0 h-full w-full text-ink opacity-[0.11]">
                                <g fill="none" stroke="currentColor" strokeWidth="0.7">
                                  <circle cx="50" cy="75" r="26" />
                                  <circle cx="50" cy="75" r="17" />
                                  <path d="M50 49l16 26-16 26-16-26z" />
                                  <path d="M24 75h52M50 49v52" />
                                </g>
                              </svg>
                              {isNext && (
                                <motion.span
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.8, repeat: Infinity }}
                                  /* 徽记拓印的十字线正好穿过正中，标签要垫一块纸把线扣掉才读得出 */
                                  className="relative bg-paper-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-vermilion"
                                >下一张</motion.span>
                              )}
                            </div>
                          )}

                          </div>
                          {/*
                            min-h 锁两行：各位置的 hint 长短不一，不锁高同一行的底边会参差。
                            窄屏不显示这一行：空位的 hint 只在抽牌时出现，而窄屏抽牌看的是小地图；
                            剩下的「点一下翻开」标题已经说了，却要占两行高 —— 三行牌阵就因为它放不进一屏。
                          */}
                          {!pos.cross && (
                            <p className={`text-center text-[10px] leading-relaxed text-ink-faint max-lg:hidden ${
                              spread.cols <= 3 ? 'min-h-[2.9em]' : ''
                            }`}>
                              {card && !revealed.includes(i) ? '点一下翻开' : card ? '' : pos.hint}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>

                  {/* 牌堆：摊成扇形，自己点。宽屏它是右栏，窄屏它在牌阵下面 */}
                  <AnimatePresence>
                    {picked.length < need && (
                      <motion.div
                        key="fan"
                        exit={{ opacity: 0, y: 40, transition: { duration: 0.35 } }}
                        /* 右栏宽度必须装得下整个圆盘：直径 = (R + 牌高/2) × 2 = hypot(140+69, 46)×2 ≈ 428 */
                        className="space-y-4 lg:w-[440px] lg:shrink-0 lg:space-y-3"
                      >
                        {/*
                          高度按「牌高 + 两端抬起的高度」给：
                          手机 138 + 18 = 156，桌面 138 + 74 = 212。
                          原来手机写的是 136px，比需要的短 19px，牌会顶出框外。
                        */}
                        {/* 满宽壳子：只为被 ResizeObserver 量出可用宽度，盘的半径由它反算 */}
                        <div ref={ringWrapRef} className="w-full">
                        <div
                          ref={fanBoxRef}
                          /*
                            高度 = 抬起 30px + 牌高 138 + 下探量（桌面 108、手机 45）。
                            下探量：牌绕下方远处的支点转，转到两端时下角会比底边更低，
                            而容器是 overflow-hidden —— 不留这段，底边就被切成一条平口。
                            顶部不用留：支点在下方，旋转只会让牌更低，不会更高。
                          */
                          /*
                            竖弧的框：窄而高。
                            高度给足弧长（支点在右边 5 倍牌宽处，70° 弧约 500px）
                            加上两端牌的外接高度；宽度只要装下牌加上弧的矢高。
                          */
                          /* 正方形，边长 = 外接角 ×2。外面那层满宽壳子负责被实测 */
                          className="relative mx-auto"
                          // 用 style 给尺寸：R 是跟着屏宽变的数字，不是 Tailwind 类名能表达的

                          /*
                            指针统一在容器上收，不在每张牌上收：
                            51 张牌只露 3px，逐张挂 pointerenter 在手机上根本进不去。
                            pan-y 而不是 none —— none 会让整页在牌堆上方滑不动，
                            用户想往下滚就被困住了。横向归我们，纵向还给页面。
                          */
                          style={{
                            /*
                              边长按**外接角**算，不是按半牌高。
                              牌指向圆心外侧，外边缘在 R + h/2 处，但那条边的两个角
                              还各偏出 w/2 —— 真正的外接半径是 hypot(R + h/2, w/2)。
                              按 R + h/2 给会少 5px，牌角就探出容器。
                            */
                            width: Math.hypot(R + FAN_CARD.h / 2, FAN_CARD.w / 2) * 2,
                            height: Math.hypot(R + FAN_CARD.h / 2, FAN_CARD.w / 2) * 2,

                            /*
                              圆盘是绕着转的，横竖都归我们 —— 但 none 会让整页在牌堆上
                              滑不动，用户想往下滚就被困住。留 pan-y 把纵向还给页面，
                              绕圈的手势主要是横向分量，够用。
                            */
                            touchAction: 'pan-y',
                          }}
                          onPointerDown={e => {
                            draggingRef.current = true;
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                            trackPointer(e);
                          }}
                          onPointerMove={trackPointer}
                          onPointerUp={e => {
                            const hit = indexAt(e.clientX, e.clientY);
                            draggingRef.current = false;
                            if (hit !== null) pick(hit);
                            else applyFocus(null);
                          }}
                          onPointerCancel={() => { draggingRef.current = false; applyFocus(null); }}
                          onPointerLeave={() => { if (!draggingRef.current) applyFocus(null); }}
                        >
                          {fan.map((c, i) => {
                            if (picked.includes(i)) return null;
                            // 发牌从中间往两边散开，不是从最左边排队进来
                            const deal = Math.min(0.55, Math.abs(angleOf(i)) * 0.006);
                            return (
                              <button
                                key={i}
                                ref={el => { cardRefs.current[i] = el; }}
                                type="button"
                                aria-label={`抽第 ${picked.length + 1} 张`}
                                // 键盘走 onKeyDown：指针的选牌在容器的 onPointerUp 上，
                                // 两边都挂 onClick 会让一次触摸选两张
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); }
                                }}
                                onFocus={() => applyFocus(i)}
                                className={`fan-card absolute rounded-xl focus-visible:outline-none
                                  focus-visible:ring-2 focus-visible:ring-vermilion/70 ${
                                    'fan-card-deal'
                                  }`}
                                style={{
                                  // 圆盘不用 transform-origin 做支点：先摆到正中，再由 rotate+translateY 推出去
                                  left: '50%',
                                  top: '50%',
                                  /*
                                    初始位置和 applyFocus 写进去的必须出自同一个 cardTransform，
                                    两份公式差一点，滑动开始时就会跳一下。
                                  */
                                  transform: cardTransform(i, null),
                                  animationDelay: `${deal}s`,
                                  zIndex: i,
                                }}
                              >
                                {/* 圆盘上后一张压住前一张的右半，露的仍是左缘 */}
                                <TarotCardBack size="sm" edge />
                              </button>
                            );
                          })}
                        </div>
                        </div>
                        <div className="space-y-1.5 text-center">
                          <p className="text-[12.5px] text-ink-mid">
                            滑过牌堆挑一张，它会落到
                            {/* 抽满那一刻 picked.length === need，越界一下就是白屏。退场动画期间这段仍可能被读到 */}
                            <span className="font-serif font-semibold text-ink">{spread.positions[picked.length]?.label ?? ''}</span>
                            <span className="mx-2 text-ink-faint">·</span>
                            <span className="font-mono tabular-nums text-ink-faint">{picked.length} / {need}</span>
                          </p>
                          {/*
                            牌堆全在弧上，只是屏幕装不下。这件事不说，用户不会想到去拖。

                            ⚠️ 这里以前写「整副 51 张」——「整副」是"完整的一副"，
                            而完整的塔罗是 78 张。宝剑只有 1 张、星币 0 张，
                            懂塔罗的人抽几轮就会发现这两个花色几乎不出现。
                            差多少就写多少，不拿一个词把缺口糊过去。
                          */}
                          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
                            <span className="tabular-nums">牌堆 {fan.length} 张</span>
                            {fan.length < TAROT_CARDS.length && (
                              <span className="tabular-nums">
                                <span className="mx-1.5">·</span>
                                满副 {TAROT_CARDS.length}，插画还在补
                              </span>
                            )}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* ---------------- 3 证据 + 解读 ---------------- */}
          {step === 'reading' && (
            <motion.div
              key="reading"
              initial={{ y: 12 }} animate={{ y: 0 }}
              className="space-y-8"
            >
              {/*
                抽牌屏的主角是牌堆，**这一屏的主角是抽到的牌** —— 它们是整个仪式的回报。
                和抽牌屏用同一套格子坐标：同一个牌阵在两屏上是同一个形状，
                翻完之后牌还在原地，不会跳成另一种排法。
              */}
              <div
                className="mx-auto grid max-w-[var(--sw)] justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-5 sm:max-w-[var(--sw-sm)] lg:max-w-[var(--sw-lg)]"
                style={{
                  gridTemplateColumns: `repeat(${spread.cols * 2}, minmax(0, 1fr))`,
                  // 翻开屏是回报，给大一档
                  ...gridWidth(spread, 1.25),
                }}
              >
                {drawn.map((c, i) => {
                  const pos = spread.positions[i];
                  return (
                    <div
                      key={i}
                      className="space-y-2.5"
                      style={{
                        gridColumn: colSpan(pos.col),
                        gridRow: pos.row,
                        // 同抽牌屏：只转牌，不转字
                        ...(pos.cross ? { zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: '100%' } : null),
                      }}
                    >
                      {!pos.cross && (
                        <p className="text-center font-serif text-[14px] font-semibold">{pos.label}</p>
                      )}
                      <div style={pos.cross ? { transform: 'rotate(90deg) scale(0.78)' } : undefined}>
                        <TarotCard name={c.name} reversed={c.reversed} size={spread.card} fluid />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 证据先行 */}
              <section className="space-y-3">
                {/* 没有分析结果时不能挂出处，那是在给牌意找一个不存在的来源 */}
                <h3 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  证据
                  {verdict && <span className="ml-2 text-[11px] font-normal text-ink-faint">来自恋爱分析</span>}
                </h3>

                {/* 报告的结论原样搬过来。牌只负责换个说法，不能另起一套结论 */}
                {verdict && (
                  <div className="border-l-2 border-vermilion/40 pl-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-[30px] font-semibold leading-none tabular-nums text-vermilion">
                        {verdict.score}
                      </span>
                      <span className="font-serif text-[13px] font-semibold">{verdict.band}</span>
                      <span className="text-[11px] text-ink-mid">{verdict.lean}</span>
                    </div>
                    {verdict.driver && (
                      <p className="mt-2 text-[11px] leading-[1.85] text-ink-mid">
                        最主要的失衡来自<span className="text-ink">「{verdict.driver}」</span>。
                      </p>
                    )}
                    {/* 报告里那条限定要跟过来：同一个分数，不能在这里失去它的边界 */}
                    <p className="mt-2 text-[10.5px] leading-[1.85] text-ink-faint">
                      它只量了投入的对称性，看不到对方的处境和动机。
                    </p>
                  </div>
                )}
                {facts.length > 0 ? (
                  <ul className="space-y-2">
                    {facts.map((f, i) => (
                      <motion.li
                        key={i}
                        initial={{ x: -8 }} animate={{ x: 0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        className="flex items-start gap-3 border-b border-ink/15 py-3"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-vermilion">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[13px] leading-[1.85]">{f}</span>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <div className="border-l-2 border-ink/25 pl-3.5">
                    <p className="font-mono text-[12px]">
                      {metrics.totalMessages === 0 ? '没有接入聊天记录' : metrics.insufficientReason}
                    </p>
                    <p className="mt-2 text-[11px] leading-[1.85] text-ink-mid">
                      {metrics.totalMessages === 0
                        ? <>这次的解读只有牌意，不含你们之间的任何事实。<br />想让牌绑着你的数字说话，先做一份恋爱分析。</>
                        : <>样本不足时不出结论。<br />想让牌绑着你的数字说话，先做一份恋爱分析。</>}
                    </p>
                  </div>
                )}
                {/*
                  一条证据都没有时这句话本身就是假的，所以零证据时不写出处。
                  也不在这里重复「只有牌意」—— 上面那个朱红块已经说过一遍了。
                */}
                {facts.length > 0 && (
                  <p className="text-[10px] leading-relaxed text-ink-faint">
                    以上全部由聊天记录直接计算得出，未经任何推测。
                  </p>
                )}
              </section>

              {/* 解读位 —— 走服务端，客户端不持有密钥 */}
              <section className="space-y-3">
                <h3 className="border-b-[1.5px] border-ink/70 pb-2.5 font-serif text-[20px] font-semibold tracking-[0.01em] sm:text-[23px]">
                  解读
                </h3>
                <div className="pt-4">
                  {loadingReading ? (
                    <div className="flex items-center gap-2.5 text-ink-faint">
                      <motion.span
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        className="h-1 w-1 rounded-full bg-vermilion"
                      />
                      {/* 没有记录时没有证据可对，说「对证据」是在描述一件不会发生的事 */}
                      <span className="text-[13px]">
                        {facts.length ? '正在把证据和牌面对上…' : `正在读这 ${need} 张牌…`}
                      </span>
                    </div>
                  ) : readingError ? (
                    <div className="space-y-3">
                      <p className="text-[13px] text-vermilion">{readingError}</p>
                      <button
                        onClick={() => { setReading(null); setReadingError(null); setAttempt(a => a + 1); }}
                        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
                      >
                        重试
                      </button>
                    </div>
                  ) : reading ? (
                    <ReadingBody text={reading} positions={positionLabels} facts={facts} />
                  ) : (
                    <p className="text-[12px] text-ink-faint">暂无解读。</p>
                  )}
                </div>
              </section>

              {/*
                次要动作，不给通栏按钮 —— 通栏的尺寸很重、幽灵描边的对比很轻，
                两个信号互相打架。收成一条自己宽度的文字按钮，靠左跟着正文的轴线。
                上面留一道细线：它不属于解读那一节，紧贴着会被读成解读的一部分。
              */}
              <div className="border-t border-ink/15 pt-6" />
              <button
                onClick={reset}
                className="group inline-flex items-center gap-2 border-b border-ink/25 pb-1 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-mid transition-colors hover:border-ink hover:text-ink"
              >
                <RotateCw size={12} className="transition-transform group-hover:-rotate-90" /> 再抽一次
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
