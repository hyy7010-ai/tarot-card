/**
 * 把解读的纯文本切成块，好让每张牌的话和它挂的那条数字并排摆。
 *
 * 这是「一份证据，两种看法」第一次真的出现在屏幕上。
 * 在这之前两种看法是两个先后访问的页面，你永远看不到同一个数字被两种方式
 * 并排说出来 —— 那个想法只存在于 README 的一句话里。
 *
 * 解析的规矩和 parseChat.ts 完全一致：**宁可少认，不要认错**。
 * 认不出结构就返回 null，由界面原样显示纯文本 ——
 * 把模型写的话硬切错位，比不切难看得多，也更容易骗到人。
 *
 * 模型输出的形状（见 reading.ts 的 prompt）：
 *
 *   此次解读仅基于牌意…                    ← intro
 *
 *   起因 · 权杖二（正位）· 证据 01          ← heading，末尾的编号是挂的证据
 *   TA 开启了 60% 的对话。这说明…            ← body
 *
 *   现状 · 倒吊人（正位）· 证据 02
 *   …
 *
 *   这三张牌连起来…                         ← outro
 */

export interface ReadingBlock {
  /** 牌阵位置名，例如「起因」。用来和第几张牌对上 */
  position: string;
  /** 标题整行，原样保留（含牌名和正逆） */
  heading: string;
  /** 这一段解读 */
  body: string;
  /**
   * 挂在哪几条证据上（1 起数，来自「证据 03，04」）。没挂就是空数组。
   *
   * ⚠️ 是数组不是单值：实测模型经常一张牌挂两条（「· 证据 02，05」），
   *    只取第一个会把另一条悄悄吞掉 —— 而「一牌一证」这条规矩的意义
   *    正是让人能追溯每句话的出处，吞掉就等于没有出处。
   */
  facts: number[];
}

export interface ParsedReading {
  intro: string;
  blocks: ReadingBlock[];
  outro: string;
}

/** 模型写的分隔点可能是这几种，全认 */
const DOT = '[·・･•]';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 「证据 03」「证据03」「证据 02，05」「证据 1、2 和 3」都认 */
function factsOf(line: string): number[] {
  const m = line.match(/证据\s*([\d\s,，、和与]+)/);
  if (!m) return [];
  const seen = new Set<number>();
  for (const d of m[1].match(/\d{1,2}/g) ?? []) {
    const n = Number(d);
    if (n > 0) seen.add(n);
  }
  return [...seen];
}

export function parseReading(
  text: string,
  positions: readonly string[],
): ParsedReading | null {
  if (!text.trim() || positions.length === 0) return null;

  /*
    ⚠️ 长的位置名必须排在前面。
       关系牌阵里同时有「你」和「你们之间」，正则的 | 是**从左往右取第一个能匹配的**，
       「你」在前就会把「你们之间 · 圣杯二」切成位置「你」+ 牌名「们之间 · 圣杯二」。
  */
  const names = [...positions].sort((a, b) => b.length - a.length).map(escapeRe);
  const head = new RegExp(`^\\s*(${names.join('|')})\\s*${DOT}\\s*(\\S.*)$`);

  const intro: string[] = [];
  const blocks: ReadingBlock[] = [];
  /** 当前块正文之后、下一个标题之前的那些行 */
  let between: string[] = [];
  let cur: ReadingBlock | null = null;
  // 'body' 收正文，'between' 收正文后面那段（末尾那段就是总结）
  let mode: 'body' | 'between' = 'body';

  for (const line of text.split('\n')) {
    const m = line.match(head);
    if (m) {
      // 上一块正文后面还跟着东西，说明它不是总结，归还给上一块
      if (cur && between.length) {
        cur.body = [cur.body, between.join('\n').trim()].filter(Boolean).join('\n\n');
      }
      between = [];
      cur = { position: m[1], heading: line.trim(), body: '', facts: factsOf(line) };
      blocks.push(cur);
      mode = 'body';
      continue;
    }
    if (!cur) {
      intro.push(line);
      continue;
    }
    if (mode === 'body') {
      // 空行 = 这一块的正文到此为止（prompt 要求每块就一段）
      if (!line.trim()) { mode = 'between'; continue; }
      cur.body = cur.body ? `${cur.body}\n${line}` : line;
      continue;
    }
    between.push(line);
  }

  // 一块都没认出来 —— 不猜，交回去原样显示
  if (!blocks.length) return null;

  return {
    intro: intro.join('\n').trim(),
    blocks,
    outro: between.join('\n').trim(),
  };
}
