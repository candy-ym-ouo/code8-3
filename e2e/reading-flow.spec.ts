import { expect, test } from '@playwright/test';

test('new user can create a book and keep a dog ear', async ({ page }) => {
  const email = `acceptance-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill('acceptance-password');
  await page.getByLabel('确认密码').fill('acceptance-password');
  await page.getByRole('button', { name: '创建账号' }).click();

  await expect(page.getByRole('heading', { name: '我的书' })).toBeVisible();
  await page.getByRole('link', { name: '添加第一本书' }).click();
  await page.getByLabel('书名').fill('验收测试书');
  await page.getByLabel('总页数').fill('300');
  await page.getByRole('button', { name: '保存书目' }).click();

  await expect(page.getByRole('heading', { name: '验收测试书' })).toBeVisible();
  await page.getByRole('button', { name: '记一次折角' }).click();
  await page.getByLabel('页码').fill('42');
  await page.getByLabel('折角原因（可选）').fill('这一页与当下有关。');
  await page.getByRole('button', { name: '保存痕迹' }).click();

  await expect(page.getByText('第 42 页').first()).toBeVisible();
  await expect(page.getByText('这一页与当下有关。')).toBeVisible();
});

test('pause reason and stage notes survive multiple readings', async ({ page }) => {
  const email = `stages-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码', { exact: true }).fill('acceptance-password');
  await page.getByLabel('确认密码').fill('acceptance-password');
  await page.getByRole('button', { name: '创建账号' }).click();

  await page.getByRole('link', { name: '添加第一本书' }).click();
  await page.getByLabel('书名').fill('多轮阅读验证书');
  await page.getByRole('button', { name: '保存书目' }).click();

  // 第一轮：开始 -> 暂停（带原因和备注）
  await page.getByRole('button', { name: '开始阅读' }).click();
  await page.getByRole('button', { name: '暂时搁置' }).click();
  await expect(page.getByRole('heading', { name: '为什么暂时放下' })).toBeVisible();
  await page.getByLabel('暂停原因（可选）').fill('被别的事打断');
  await page.getByLabel('阶段备注（可选）').fill('读到第三章');
  await page.getByRole('button', { name: '改为“暂时搁置”' }).click();
  await expect(page.getByText('暂停原因：被别的事打断').first()).toBeVisible();

  // 继续读 -> 读完第一轮
  await page.getByRole('button', { name: '继续阅读' }).click();
  await page.getByRole('button', { name: '标记为读完' }).click();
  await page.getByRole('button', { name: '被触动' }).click();
  await page.getByRole('button', { name: '保存完成感受' }).click();
  await expect(page.getByText('完成感受已保存')).toBeVisible();

  // 再读一次，开启第二轮
  await page.getByRole('button', { name: '重新阅读' }).click();
  await page.getByLabel('阶段备注（可选）').fill('第二次翻开，注意到新细节');
  await page.getByRole('button', { name: '改为“阅读中”' }).click();

  // 两段阶段经历都还在，按轮次区分
  await page.getByRole('tab', { name: /阶段经历/ }).click();
  await expect(page.getByText('第 2 轮 · 阅读中')).toBeVisible();
  await expect(page.getByText('第 1 轮 · 暂时搁置')).toBeVisible();
  await expect(page.getByText('读到第三章')).toBeVisible();
  await expect(page.getByText('第二次翻开，注意到新细节')).toBeVisible();

  // 时间线也保留了暂停原因
  await page.getByRole('tab', { name: '本书时间线' }).click();
  await expect(page.getByText(/暂停：被别的事打断/).first()).toBeVisible();
});
