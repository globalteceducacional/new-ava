import { test, expect } from '@playwright/test';

const PASSWORD = '123456';

const profiles = [
  {
    login: 'aluno',
    path: '/aluno',
    nav: ['Início', 'Comunidades', 'Certificados', 'Cursos', 'Grade Curricular'],
  },
  {
    login: 'professor',
    path: '/professor',
    nav: ['Meus cursos', 'Comunidades'],
    menu: ['Editor', 'Correções'],
  },
  {
    login: 'instituicao',
    path: '/instituicao',
    nav: ['Painel', 'Comunidades'],
    menu: ['Vincular cursos', 'Usuários'],
  },
  {
    login: 'admin',
    path: '/master',
    nav: ['Painel', 'Catálogo', 'Comunidades', 'Instituições', 'Usuários', 'Auditoria'],
  },
] as const;

for (const profile of profiles) {
  test(`login ${profile.login} → shell correto`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail ou usuário').fill(profile.login);
    await page.getByLabel('Senha').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(new RegExp(profile.path));
    for (const label of profile.nav) {
      await expect(page.getByRole('navigation').getByText(label, { exact: true })).toBeVisible();
    }
    if ('menu' in profile) {
      await page.getByRole('button', { name: 'Mais opções' }).click();
      for (const label of profile.menu) {
        await expect(page.getByRole('menu').getByText(label)).toBeVisible();
      }
    }
  });
}

test('logout limpa sessão e protege rota', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail ou usuário').fill('aluno');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/aluno/);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/aluno');
  await expect(page).toHaveURL(/\/login/);
});
