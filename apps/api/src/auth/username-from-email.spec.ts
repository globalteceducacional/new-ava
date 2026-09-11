import { usernameFromEmail } from './username-from-email';

describe('usernameFromEmail', () => {
  it('usa a parte local do e-mail', () => {
    expect(usernameFromEmail('Maria.Silva@escola.com')).toBe('maria.silva');
  });

  it('sanitiza caracteres inválidos e prefixo', () => {
    expect(usernameFromEmail('...ok_user@x.com')).toBe('ok_user');
  });

  it('completa se ficar curto demais', () => {
    expect(usernameFromEmail('ab@x.com')).toBe('abava');
  });

  it('cai em aluno quando a local não serve', () => {
    expect(usernameFromEmail('+++@x.com')).toBe('aluno');
  });
});
