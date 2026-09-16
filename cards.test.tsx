import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync } from 'node:fs';
import { TAROT_CARDS } from './cards.js';
import { ILLUSTRATED } from './illustrated.js';
import { TarotGlyph, identifyCard, cardCode } from './TarotArt.js';
import { promptFor } from './tarotArtDirection.js';

test('78 张牌的 code 与牌名都唯一', () => {
  assert.equal(TAROT_CARDS.length, 78);
  assert.equal(new Set(TAROT_CARDS.map(c => c.name)).size, 78);
  assert.equal(new Set(TAROT_CARDS.map(c => cardCode(c.name))).size, 78);
});

test('78 张牌都能画出线稿，且不是空图形', () => {
  for (const c of TAROT_CARDS) {
    const svg = renderToStaticMarkup(<TarotGlyph name={c.name} />);
    assert.ok(/<(path|circle)/.test(svg), `${c.name} 没有画出任何图形`);
  }
});

test('22 张大阿卡纳各有自己的符号，没有悄悄退回「星星」', () => {
  const majors = TAROT_CARDS.filter(c => identifyCard(c.name).suit === 'major');
  assert.equal(majors.length, 22);
  const shapes = new Set(majors.map(c => renderToStaticMarkup(<TarotGlyph name={c.name} />)));
  assert.equal(shapes.size, 22, '有大阿卡纳画成了同一个图形');
});

test('16 张宫廷牌各有自己的剪影，四个位阶两两不同', () => {
  const courts = TAROT_CARDS.filter(c => identifyCard(c.name).court);
  assert.equal(courts.length, 16);
  // 同花色的四个位阶必须画得出区别，否则线稿等于没画
  for (const suit of ['权杖', '圣杯', '宝剑', '星币']) {
    const shapes = new Set(
      courts.filter(c => c.name.startsWith(suit))
        .map(c => renderToStaticMarkup(<TarotGlyph name={c.name} />)),
    );
    assert.equal(shapes.size, 4, `${suit} 的宫廷牌有重样`);
  }
});

test('逐张都有罗马数字 / 拉丁名 / 提示词', () => {
  for (const c of TAROT_CARDS) {
    const id = identifyCard(c.name);
    assert.ok(id.index !== '' && id.index != null, `${c.name} 缺序号`);
    assert.ok(id.latin, `${c.name} 缺拉丁名`);
    assert.ok(promptFor(c.name).length > 40, `${c.name} 提示词太短`);
  }
});

test('public/tarot 里的每个图都对得上一张牌', () => {
  const codes = new Set(TAROT_CARDS.map(c => cardCode(c.name)));
  const files = readdirSync('public/tarot').filter(f => f.endsWith('.jpg'));
  // 不锁死数量：出一张图就多一张，写死会让每次新增都误报
  assert.ok(files.length >= 23, `插画只剩 ${files.length} 张，像是丢文件了`);
  assert.ok(files.length <= 78, '插画比牌还多');
  for (const f of files) {
    assert.ok(codes.has(f.replace(/\.jpg$/, '')), `${f} 对不上任何一张牌`);
  }
  // 大阿卡纳应该是齐的
  for (let i = 0; i <= 21; i++) {
    assert.ok(files.includes(`m${String(i).padStart(2, '0')}.jpg`), `缺 m${i}`);
  }
});

test('ILLUSTRATED 名单必须和 public/tarot 一致', () => {
  const files = readdirSync('public/tarot')
    .filter(f => f.endsWith('.jpg')).map(f => f.replace(/\.jpg$/, '')).sort();
  assert.deepEqual([...ILLUSTRATED].sort(), files,
    '出了新图要把 code 加进 illustrated.ts，否则抽不到它');
  const codes = new Set(TAROT_CARDS.map(c => cardCode(c.name)));
  for (const c of ILLUSTRATED) assert.ok(codes.has(c), `${c} 对不上任何一张牌`);
});
