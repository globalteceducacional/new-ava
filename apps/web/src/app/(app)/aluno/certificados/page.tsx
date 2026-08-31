'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/auth/api';
import { getApiBaseUrl, getStoredAccessToken } from '@/lib/auth/session';
import { errorMessage } from '@/lib/format';

type CertificateRow = {
  id: string;
  code: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  workloadHours: number;
  issuedAt: string;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function downloadCertificate(id: string, code: string) {
  const token = getStoredAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${getApiBaseUrl()}/certificates/${id}/download`, {
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Falha ao baixar o PDF');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificado-${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AlunoCertificadosPage() {
  const [items, setItems] = useState<CertificateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setItems(await apiFetch<CertificateRow[]>('/certificates/mine'));
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar certificados'));
      }
    })();
  }, []);

  async function onDownload(row: CertificateRow) {
    setBusyId(row.id);
    setError(null);
    try {
      await downloadCertificate(row.id, row.code);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível baixar'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell title="Certificados">
      <div className="page-header">
        <div>
          <h1>Certificados</h1>
          <p className="muted">Emitidos automaticamente ao concluir todas as aulas de um curso.</p>
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {!error && items.length === 0 ? (
        <div className="empty-state">
          Você ainda não tem certificados. Conclua um curso assistindo todas as aulas.
        </div>
      ) : null}

      <ul className="cert-list">
        {items.map((row) => (
          <li key={row.id} className="cert-card">
            <div className="cert-card-head">
              <h2 className="cert-card-title">{row.courseTitle}</h2>
              <time className="cert-card-date muted small" dateTime={row.issuedAt}>
                {formatDate(row.issuedAt)}
              </time>
            </div>
            <div className="cert-card-meta muted small">
              <span>
                Código <code className="cert-code">{row.code}</code>
              </span>
              {row.workloadHours > 0 ? <span>{row.workloadHours}h</span> : null}
            </div>
            <div className="cert-card-actions">
              <Link className="btn btn-secondary btn-sm" href={`/verificar/${row.code}`}>
                Verificar
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busyId === row.id}
                onClick={() => void onDownload(row)}
              >
                {busyId === row.id ? 'Baixando…' : 'Baixar PDF'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
