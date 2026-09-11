type AuthVisualProps = {
  /** Texto do painel esquerdo. */
  lead?: string;
};

const DEFAULT_LEAD =
  'Cursos do catálogo no servidor da empresa — com instituição você vê a grade; sem ela, o catálogo livre.';

export function AuthVisual({ lead = DEFAULT_LEAD }: AuthVisualProps) {
  return (
    <section className="auth-visual">
      <div>
        <h1 className="auth-brand-hero">
          AVA
          <br />
          Globaltec
        </h1>
        <p style={{ marginTop: '1.25rem' }}>{lead}</p>
      </div>
    </section>
  );
}
