import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from './answers';

test('答案之书：整整 1000 页、一句不重复、一眼读得完', () => {
  assert.equal(ANSWERS.length, 1000);
  // 去掉标点和空格再比：「再等等看」和「再等等，看」算同一句
  const norm = (s: string) => s.replace(/[，。、！？：；\s…「」]/g, '');
  const dup = ANSWERS.filter((a, i) => ANSWERS.findIndex(b => norm(b) === norm(a)) !== i);
  assert.deepEqual(dup, [], '有重复的页');
  for (const a of ANSWERS) assert.ok([...a].length <= 16, `太长：${a}`);
});

test('答案之书：提到对方只说 TA，不写他 / 她', () => {
  for (const a of ANSWERS) assert.ok(!/[他她]/.test(a), `用了性别代词：${a}`);
});
