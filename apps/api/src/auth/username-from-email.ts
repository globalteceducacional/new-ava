/** Username 3–32: letra/número no início; minúsculas, ponto, hífen, underscore. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function usernameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? 'aluno').toLowerCase();
  let base = local.replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '');
  if (!base || !/^[a-z0-9]/.test(base)) {
    base = `aluno${base.replace(/^[._-]+/, '')}`;
  }
  if (base.length < 3) {
    base = `${base}ava`;
  }
  base = base.slice(0, 32).replace(/[._-]+$/, '');
  if (!USERNAME_PATTERN.test(base)) {
    return 'aluno';
  }
  return base;
}
