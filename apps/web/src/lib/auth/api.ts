import { clearSession, getApiBaseUrl, getStoredAccessToken, refreshAccessToken } from './session';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function ensureFreshAccess(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  // Cookie HttpOnly `ava_access` é a fonte principal; Bearer só se legado existir.
  const token = getStoredAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const renewed = await ensureFreshAccess();
    if (renewed) {
      return apiFetch<T>(path, init, true);
    }
    clearSession();
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type UploadProgressFn = (percent: number) => void;

/**
 * POST multipart com progresso (XHR). Mesmos cookies/401 do apiFetch.
 * Use para vídeos grandes — fetch não expõe upload progress.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  onProgress?: UploadProgressFn,
  retried = false,
): Promise<T> {
  const run = () =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getApiBaseUrl()}${path}`);
      xhr.withCredentials = true;
      const token = getStoredAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (ev) => {
        if (!onProgress || !ev.lengthComputable || ev.total <= 0) return;
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new ApiError('Falha de rede no envio', 0));
      xhr.onabort = () => reject(new ApiError('Envio cancelado', 0));
      xhr.send(body);
    });

  const { status, text } = await run();

  if (status === 401 && !retried && !path.startsWith('/auth/')) {
    const renewed = await ensureFreshAccess();
    if (renewed) {
      return apiUpload<T>(path, body, onProgress, true);
    }
    clearSession();
  }

  if (status < 200 || status >= 300) {
    let message = `Erro ${status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) message = parsed.message.join(', ');
      else if (parsed.message) message = parsed.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, status);
  }

  if (status === 204 || !text) return undefined as T;
  return JSON.parse(text) as T;
}
