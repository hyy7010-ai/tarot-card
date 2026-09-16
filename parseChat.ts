/**
 * 把粘贴进来的聊天记录解析成 ChatMessage[]。
 *
 * 唯一的设计原则和这个产品其余部分一致：**宁可少认，不要认错**。
 * 解析不出来的行原样报回去（`unparsed`），由界面告诉用户"这些没读懂"，
 * 而不是猜一个时间戳硬塞进去 —— 那会污染 metrics.ts 算出的每一个数字。
 *
 * 支持的形态（微信 / QQ / WhatsApp / 手打）：
 *   1. `2026-08-01 10:00:00 张三`          换行后跟内容
 *   2. `[2026-08-01 10:00] 张三: 内容`     单行
 *   3. `张三 2026/8/1 10:00`               换行后跟内容
 *   4. `张三: 内容`                        照着截图敲的，没有时间
 *   5. `[2026/8/1, 10:00:00] 张三: 内容`   WhatsApp 导出
 */
import type { ChatMessage } from './types';

export interface ParseResult {
  messages: ChatMessage[];
  /**
   * 这份样本有没有**逐条时间戳**。
   *
   * 照着截图敲出来的记录通常没有 —— 微信只在间隔较大时才插一条时间。
   * 没有时间戳就算不了回复间隔、等待次数、开启对话，
   * 这件事必须一路传到报告里，不能让报告假装完整。
   */
  hasTimestamps: boolean;
  /** 出现过的发言人，按首次出现排序 */
  speakers: string[];
  /** 没读懂的行，原样保留，供界面如实告知 */
  unparsed: string[];
}

/** 日期时间：宽松匹配 2026-08-01 10:00(:00) 和 2026/8/1 10:00 */
const DT = String.raw`(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?`;

/** 形态 2：[时间] 名字: 内容 —— 单行就是一条完整消息 */
const INLINE = new RegExp(String.raw`^\s*[\[［]?${DT}[\]］]?\s*(.+?)\s*[:：]\s*(.*)$`);
/** 形态 1：时间在前，名字在后，内容另起一行 */
const HEAD_TIME_FIRST = new RegExp(String.raw`^\s*[\[［]?${DT}[\]］]?\s+(.+?)\s*$`);
/** 形态 4：`名字: 内容` —— 照着截图敲的，没有时间 */
const NAME_ONLY = /^\s*([^\s:：，。！？]{1,12})\s*[:：]\s*(\S.*)$/;

/** 形态 3：名字在前，时间在后，内容另起一行 */
const HEAD_NAME_FIRST = new RegExp(String.raw`^\s*(.+?)\s+${DT}\s*$`);

/**
 * WhatsApp 导出。单独认，因为它和上面几种差在两个地方：
 * 日期和时间之间是**逗号**，而且日期顺序随手机的地区设置变
 * （`[2026/8/1, 10:00:00]` / `[1/8/2026, 10:00:00 AM]` / `2026/8/1, 10:00 - 名字: 内容`）。
 *
 * 它值得单独写，是因为这是唯一一个「一键导出聊天记录」真实存在的平台 ——
 * 微信导不出来，手打的又没有时间戳。
 */
const WA = new RegExp(
  String.raw`^\s*[\[［]?\s*(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})[,，]?\s+` +
  String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])[Mm])?\s*[\]］]?\s*` +
  String.raw`(?:[-–—]\s+)?(.+?)\s*[:：]\s*(.*)$`,
);

type DateOrder = 'ymd' | 'dmy' | 'mdy' | 'unknown';

/**
 * 整份记录扫一遍，定下 WhatsApp 那三个数字谁是年月日。
 *
 * 1/8 到底是 1 月 8 号还是 8 月 1 号，单看一行分不出来 —— 猜错就是整整
 * 七个月的误差，回复间隔全废。所以只在**能确定**时才认：
 * 有任何一行的首位 > 12 就是日在前，次位 > 12 就是月在前。
 * 两者都没有时只剩一种安全情况：整份记录只有一天，那天怎么解释都是同一天。
 * 其余一律返回 unknown，让时间戳作废、退回序号 —— 宁可少认，不要认错。
 */
function dateOrderOf(triples: [number, number, number][]): DateOrder {
  if (!triples.length) return 'unknown';
  if (triples.every(([a]) => a >= 1000)) return 'ymd';
  if (triples.some(([a]) => a > 12)) return 'dmy';
  if (triples.some(([, b]) => b > 12)) return 'mdy';
  return new Set(triples.map(t => t.join('/'))).size === 1 ? 'dmy' : 'unknown';
}

function waTs(
  a: number, b: number, c: number, h: number, mi: number, se: number,
  ap: string | undefined, order: DateOrder,
): number | null {
  if (order === 'unknown') return null;
  let y: number, mo: number, d: number;
  if (order === 'ymd') { y = a; mo = b; d = c; }
  else if (order === 'dmy') { d = a; mo = b; y = c; }
  else { mo = a; d = b; y = c; }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = h;
  if (ap) {
    const pm = /p/i.test(ap);
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  const t = new Date(y, mo - 1, d, hh, mi, se).getTime();
  return Number.isFinite(t) ? t : null;
}

function toTs(y: string, mo: string, d: string, h: string, mi: string, se?: string): number | null {
  const t = new Date(+y, +mo - 1, +d, +h, +mi, se ? +se : 0).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 名字里不该出现这些，用来把「内容行」和「头部行」区分开 */
const NOT_A_NAME = /[，。！？,.!?]|^\s*$/;

/**
 * 无时间戳记录的序号基准与步长。只保序，不代表任何真实时刻。
 *
 * 步长取 7 小时，超过 metrics.ts 的 6 小时会话间隔 —— 这不是凑数，是刻意的：
 * 这样 metrics 自己就会把回复间隔和趋势判成「无样本」返回 null，
 * 而不是算出一串看似合理的假数字。剩下会被污染的只有「谁在开启对话」，
 * 由 coverage.ts 明确标成不可计算。
 */
const ORDINAL_BASE = Date.UTC(2000, 0, 1);
const ORDINAL_STEP = 7 * 60 * 60 * 1000;

export function parseChat(raw: string): ParseResult {
  // WhatsApp 的导出里夹着方向标记和窄空格，肉眼看不见但会让正则整行匹配不上
  const lines = (raw ?? '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .split(/\r?\n/);
  // 日期顺序得先把整份记录看完才能定，所以在逐行解析之前先扫一遍
  const waTriples: [number, number, number][] = [];
  for (const l of lines) {
    const m = l.match(WA);
    if (m && !NOT_A_NAME.test(m[8])) waTriples.push([+m[1], +m[2], +m[3]]);
  }
  const waOrder = dateOrderOf(waTriples);
  const messages: ChatMessage[] = [];
  const speakers: string[] = [];
  const unparsed: string[] = [];

  /** 当前正在收内容的那条消息 */
  let open: { sender: string; ts: number; buf: string[] } | null = null;
  /** 整份记录里出现过真实时间戳吗 */
  let sawTime = false;

  const seeSpeaker = (n: string) => { if (!speakers.includes(n)) speakers.push(n); };
  const flush = () => {
    if (!open) return;
    const text = open.buf.join('\n').trim();
    // 空消息（只有头部没有内容）不计入：它会让「平均字数」失真
    if (text) {
      messages.push({
        id: `p${messages.length}`,
        senderId: open.sender,
        text,
        timestamp: open.ts,
        type: 'text',
      });
    }
    open = null;
  };

  for (const line of lines) {
    if (!line.trim()) { open?.buf.push(''); continue; }

    const inline = line.match(INLINE);
    if (inline) {
      const [, y, mo, d, h, mi, se, name, text] = inline;
      const ts = toTs(y, mo, d, h, mi, se);
      if (ts !== null && !NOT_A_NAME.test(name)) {
        flush(); sawTime = true;
        seeSpeaker(name);
        open = { sender: name, ts, buf: [text] };
        continue;
      }
    }

    const wa = line.match(WA);
    if (wa) {
      const [, a, b, c, h, mi, se, ap, name, text] = wa;
      if (!NOT_A_NAME.test(name)) {
        const ts = waTs(+a, +b, +c, +h, +mi, se ? +se : 0, ap, waOrder);
        flush();
        seeSpeaker(name);
        // 日期顺序定不下来时不认这个时间，退回序号：
        // coverage.ts 会把依赖时间的指标标成不可计算，而不是算出假间隔
        if (ts !== null) { sawTime = true; open = { sender: name, ts, buf: [text] }; }
        else open = { sender: name, ts: ORDINAL_BASE + messages.length * ORDINAL_STEP, buf: [text] };
        continue;
      }
    }

    const t1 = line.match(HEAD_TIME_FIRST);
    if (t1) {
      const [, y, mo, d, h, mi, se, name] = t1;
      const ts = toTs(y, mo, d, h, mi, se);
      if (ts !== null && !NOT_A_NAME.test(name)) {
        flush(); sawTime = true;
        seeSpeaker(name);
        open = { sender: name, ts, buf: [] };
        continue;
      }
    }

    const t3 = line.match(HEAD_NAME_FIRST);
    if (t3) {
      const [, name, y, mo, d, h, mi, se] = t3;
      const ts = toTs(y, mo, d, h, mi, se);
      if (ts !== null && !NOT_A_NAME.test(name)) {
        flush(); sawTime = true;
        seeSpeaker(name);
        open = { sender: name, ts, buf: [] };
        continue;
      }
    }

    // 无时间戳形态只在整份记录都没出现过时间戳时才启用，
    // 否则「李四：好的」这种正文会被误判成新消息头
    if (!sawTime) {
      const n = line.match(NAME_ONLY);
      if (n && !NOT_A_NAME.test(n[1])) {
        flush();
        seeSpeaker(n[1]);
        // 序号当时间：只用来保持顺序，绝不用来算间隔 ——
        // coverage.ts 会把所有依赖时间的指标标成不可计算
        open = { sender: n[1], ts: ORDINAL_BASE + messages.length * ORDINAL_STEP, buf: [n[2]] };
        continue;
      }
    }

    // 不是头部行：要么是上一条的内容，要么是读不懂的孤行
    if (open) open.buf.push(line);
    else unparsed.push(line);
  }
  flush();

  return { messages, speakers, unparsed, hasTimestamps: sawTime };
}
