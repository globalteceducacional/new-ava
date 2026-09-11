import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthVisual } from '@/components/AuthVisual';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = {
  title: 'Entrar · AVA Globaltec',
};

export default function LoginPage() {
  return (
    <div className="auth-page">
      <AuthVisual />
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Acesso</p>
          <h1>Entrar na conta</h1>
          <p className="small">Use o e-mail ou usuário cadastrado.</p>
          <LoginForm />
          <p className="auth-switch">
            Não tem conta? <Link href="/cadastro">Criar conta de aluno</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
