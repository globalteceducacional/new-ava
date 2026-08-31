import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hash + verify senha correta', async () => {
    const hash = await hashPassword('Ava@123456');
    expect(hash).toMatch(/^\$argon2/);
    await expect(verifyPassword(hash, 'Ava@123456')).resolves.toBe(true);
  });

  it('verify senha incorreta retorna false', async () => {
    const hash = await hashPassword('Ava@123456');
    await expect(verifyPassword(hash, 'errada')).resolves.toBe(false);
  });
});
