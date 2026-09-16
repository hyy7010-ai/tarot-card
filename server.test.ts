import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { safePath } from './server';

const ROOT = path.resolve('/srv/app/dist');

test('正常路径解到 dist 里面', () => {
  assert.equal(safePath('/index.html', ROOT), path.join(ROOT, 'index.html'));
  assert.equal(safePath('/assets/index-abc123.js', ROOT), path.join(ROOT, 'assets/index-abc123.js'));
  assert.equal(safePath('/tarot/m06.jpg', ROOT), path.join(ROOT, 'tarot/m06.jpg'));
  assert.equal(safePath('/', ROOT), ROOT);
});

test('⚠️ 路径穿越必须挡住 —— 这台机器上就有一个装着 GEMINI_API_KEY 的 .env', () => {
  for (const evil of [
    '/../.env',
    '/../../../../etc/passwd',
    '/assets/../../.env',
    '/%2e%2e/%2e%2e/.env',          // 编码过的 ..
    '/%2e%2e%2f%2e%2e%2f.env',      // 连斜杠一起编码
  ]) {
    assert.equal(safePath(evil, ROOT), null, `没挡住：${evil}`);
  }
});

test('坏编码和 NUL 直接拒掉，不往下走', () => {
  assert.equal(safePath('/%', ROOT), null);
  assert.equal(safePath('/%zz', ROOT), null);
  assert.equal(safePath('/a%00.html', ROOT), null);
});

test('名字以 dist 开头的**兄弟目录**不算 dist 里面', () => {
  // path.resolve 之后是 /srv/app/dist-secret/...，用 startsWith(root) 判断会漏
  assert.equal(safePath('/../dist-secret/key.txt', ROOT), null);
});
