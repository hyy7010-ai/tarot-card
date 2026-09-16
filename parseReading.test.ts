import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReading } from './parseReading';

const THREE = ['起因', '现状', '走向'];
const LOVE = ['你', 'TA', '你们之间', '挡在中间的', '走向'];

test('有证据编号：切出三块，编号挂对', () => {
  const r = parseReading(`起因 · 权杖二（正位）· 证据 01
TA 开启了 60% 的对话。

现状 · 倒吊人（正位）· 证据 02
你的回复中位数 2 分钟。

走向 · 权杖八（正位）· 证据 03
文字量极度不对等。

总结：失衡度 80/100。`, THREE)!;

  assert.equal(r.blocks.length, 3);
  assert.deepEqual(r.blocks.map(b => b.position), ['起因', '现状', '走向']);
  assert.deepEqual(r.blocks.map(b => b.facts), [[1], [2], [3]]);
  assert.equal(r.blocks[0].body, 'TA 开启了 60% 的对话。');
  assert.equal(r.outro, '总结：失衡度 80/100。');
});

test('只有牌意：没有证据编号，fact 全是 null，开场白进 intro', () => {
  const r = parseReading(`此次解读仅基于牌意，没有现实事实支撑。

起因 · 圣杯侍从（逆位）
牌面上是一个年轻人拿着杯子。

现状 · 圣杯二（逆位）
两个人原本面对面站着。`, THREE)!;

  assert.equal(r.intro, '此次解读仅基于牌意，没有现实事实支撑。');
  assert.equal(r.blocks.length, 2);
  assert.deepEqual(r.blocks.map(b => b.facts), [[], []]);
  assert.equal(r.outro, '');
});

test('⚠️ 长位置名优先：「你们之间」不许被「你」抢先切成两半', () => {
  const r = parseReading(`你 · 星星（正位）
你这张牌讲的是希望。

你们之间 · 圣杯二（正位）
两个杯子递过去。`, LOVE)!;

  assert.deepEqual(r.blocks.map(b => b.position), ['你', '你们之间']);
  assert.equal(r.blocks[1].heading, '你们之间 · 圣杯二（正位）');
});

test('正文里以位置名开头但没有分隔点的句子，不算标题', () => {
  const r = parseReading(`起因 · 太阳（正位）
走向不明的时候，这张牌讲的是先把事情看清楚。
现状也一样。`, THREE)!;

  assert.equal(r.blocks.length, 1);
  assert.match(r.blocks[0].body, /走向不明的时候/);
  assert.match(r.blocks[0].body, /现状也一样/);
});

test('认不出结构就返回 null，交回去原样显示 —— 宁可少认，不要认错', () => {
  assert.equal(parseReading('模型今天不按格式写，整段都是散文。', THREE), null);
  assert.equal(parseReading('', THREE), null);
  assert.equal(parseReading('起因 · 太阳', []), null);
});

test('流式写到一半：标题一写完就成块，正文随后灌进去', () => {
  const r = parseReading(`起因 · 权杖二（正位）· 证据 01
TA 开启了 60% 的对话。

现状 · 倒吊人（正`, THREE)!;

  // 第二块的标题刚够格，正文还没到 —— 这正是边写边显示该有的样子
  assert.equal(r.blocks.length, 2);
  assert.deepEqual(r.blocks[0].facts, [1]);
  assert.equal(r.blocks[1].position, '现状');
  assert.equal(r.blocks[1].body, '');
});

test('标题只写了半个位置名时，不会误切', () => {
  const r = parseReading(`起因 · 权杖二（正位）
TA 开启了 60% 的对话。

现`, THREE)!;

  assert.equal(r.blocks.length, 1);
});

test('正文有多段时，中间那些归还给它自己，不被当成总结', () => {
  const r = parseReading(`起因 · 太阳（正位）
第一段。

第二段还是在说起因。

现状 · 月亮（正位）
只有一段。

这才是总结。`, THREE)!;

  assert.equal(r.blocks.length, 2);
  assert.match(r.blocks[0].body, /第二段还是在说起因/);
  assert.equal(r.outro, '这才是总结。');
});

test('⚠️ 一张牌挂多条证据：实测模型会写「证据 02，05」，不许只认第一条', () => {
  const r = parseReading(`起因 · 愚者（正位）· 证据 01
一段。

现状 · 权杖皇后（正位）· 证据 03，04
一段。

走向 · 恋人（逆位）· 证据 02、05 和 01
一段。`, THREE)!;

  assert.deepEqual(r.blocks.map(b => b.facts), [[1], [3, 4], [2, 5, 1]]);
});
