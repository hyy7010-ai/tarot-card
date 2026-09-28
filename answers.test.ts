import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from './answers';

test('答案之书：够厚、不重复、一眼读得完', () => {
  assert.ok(ANSWERS.length >= 100, `只有 ${ANSWERS.length} 页`);
  assert.equal(new Set(ANSWERS).size, ANSWERS.length, '有重复的页');
  for (const a of ANSWERS) assert.ok([...a].length <= 16, `太长：${a}`);
});

test('答案之书：提到对方只说 TA，不写他 / 她', () => {
  for (const a of ANSWERS) assert.ok(!/[他她]/.test(a), `用了性别代词：${a}`);
});
