import { writeFileSync } from 'node:fs';
import { TAROT_CARDS } from './cards.js';
import { promptFor, MASTER_STYLE, NEGATIVE } from './tarotArtDirection.js';
import { cardCode } from './TarotArt.js';

const lines: string[] = [
  '# 真心塔罗 · 78 张插画提示词',
  '# 用法：把每行「提示词」投给生成器，产出图按「文件名」存到 public/tarot/',
  '# 尺寸：2:3 竖版（如 1024×1536）',
  '',
  `## 母样式（所有牌共用）`,
  MASTER_STYLE,
  '',
  `## 反向提示词`,
  NEGATIVE,
  '',
  '## 逐张',
];
for (const c of TAROT_CARDS) {
  lines.push(`### ${cardCode(c.name)}.webp — ${c.name}`);
  lines.push(promptFor(c.name));
  lines.push('');
}
writeFileSync('tarot-prompts.md', lines.join('\n'));
const json = TAROT_CARDS.map(c => ({ file: `${cardCode(c.name)}.jpg`, name: c.name, prompt: promptFor(c.name) }));
writeFileSync('tarot-prompts.json', JSON.stringify(json, null, 2));
console.log(`导出 ${TAROT_CARDS.length} 条 → tarot-prompts.md / tarot-prompts.json`);
