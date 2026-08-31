import type { Metadata } from 'next';
import { LoginForm } from '@/components/LoginForm';

export const metadata: Metadata = {
  title: 'Entrar · AVA Globaltec',
};

export default function LoginPage() {
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div>
          <div className="brand" style={{ marginBottom: '2.5rem' }}>
            <span className="brand-mark">A</span>
            <div>
              <div className="brand-name">AVA Globaltec</div>
              <div className="brand-sub" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Ambiente Virtual de Aprendizagem
              </div>
            </div>
          </div>
          <h1 className="auth-brand-hero">
            AVA
            <br />
            Globaltec
          </h1>
          <p style={{ marginTop: '1.25rem' }}>
            Cursos do catálogo, vinculados à sua instituição — conteúdo e vídeo no servidor da
            empresa.
          </p>
        </div>
        <p
          className="small"
          style={{
            color: 'rgba(255,255,255,0.55)',
            margin: 0,
            position: 'relative',
            zIndex: 1,
          }}
        >
          Self-hosted · JWT · multi-instituição
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Acesso</p>
          <h1>Entrar na conta</h1>
          <p className="small">Use o e-mail institucional ou usuário cadastrado.</p>
          <LoginForm />
          <div className="alert alert-info" style={{ marginTop: '1.25rem' }}>
            Demo: <code>aluno</code> · senha <code>123456</code>
          </div>
        </div>
      </section>
    </div>
  );
}
