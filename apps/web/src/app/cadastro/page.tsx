import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthVisual } from '@/components/AuthVisual';
import { RegisterForm } from '@/components/RegisterForm';

export const metadata: Metadata = {
  title: 'Criar conta · AVA Globaltec',
};

export default function CadastroPage() {
  return (
    <div className="auth-page">
      <AuthVisual lead="Crie sua conta de aluno sem instituição e acesse o catálogo publicado quando quiser." />
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Cadastro</p>
          <h1>Criar conta de aluno</h1>
          <p className="small">Conta pessoal, sem vínculo com instituição.</p>
          <RegisterForm />
          <p className="auth-switch">
            Já tem conta? <Link href="/login">Entrar</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
