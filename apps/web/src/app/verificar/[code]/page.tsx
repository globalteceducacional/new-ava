'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/auth/session';

type VerifyResult = {
  valid: boolean;
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: string;
  workloadHours: number;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function downloadPublicPdf(code: string) {
  const res = await fetch(
    `${getApiBaseUrl()}/certificates/verify/${encodeURIComponent(code)}/pdf`,
    { cache: 'no-store', credentials: 'omit' },
  );
  if (!res.ok) throw new Error('Falha ao baixar o PDF');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificado-${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VerificarCertificadoPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? '')
    .trim()
    .toUpperCase();
  const [data, setData] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError('Informe um código de verificação.');
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${getApiBaseUrl()}/certificates/verify/${encodeURIComponent(code)}`,
          { credentials: 'omit' },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            message?: string | string[];
          } | null;
          const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
          throw new Error(msg ?? 'Certificado não encontrado');
        }
        setData((await res.json()) as VerifyResult);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : 'Não foi possível consultar o certificado');
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  return (
    <main className="verify-page">
      <div className="verify-card">
        <p className="eyebrow">AVA Globaltec</p>
        <h1>Verificar certificado</h1>
        <p className="muted">Confira se o documento foi emitido por esta plataforma.</p>

        {code ? (
          <p className="verify-code-chip">
            Código: <strong>{code}</strong>
          </p>
        ) : null}

        {loading ? <p className="muted">Consultando…</p> : null}
        {error ? <div className="alert alert-danger">{error}</div> : null}

        {data?.valid ? (
          <div className="verify-result">
            <p className="eyebrow verify-valid">Certificado válido</p>
            <h2>{data.studentName}</h2>
            <p>
              Concluiu o curso <strong>{data.courseTitle}</strong>
              {data.workloadHours > 0 ? (
                <>
                  {' '}
                  · carga horária de <strong>{data.workloadHours}h</strong>
                </>
              ) : null}
            </p>
            <p className="muted">Emitido em {formatDate(data.issuedAt)}</p>
            <div className="verify-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={downloading}
                onClick={() => {
                  setDownloading(true);
                  setError(null);
                  void downloadPublicPdf(data.code)
                    .catch((e: unknown) => {
                      setError(e instanceof Error ? e.message : 'Não foi possível baixar o PDF');
                    })
                    .finally(() => setDownloading(false));
                }}
              >
                {downloading ? 'Baixando…' : 'Baixar PDF'}
              </button>
              <Link className="btn btn-secondary" href="/login">
                Entrar no AVA
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && !data && !error ? <p className="muted">Nenhum resultado.</p> : null}
      </div>
    </main>
  );
}
