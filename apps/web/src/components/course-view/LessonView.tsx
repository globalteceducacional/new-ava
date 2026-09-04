'use client';

import Link from 'next/link';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppShell } from '@/components/AppShell';
import { Modal } from '@/components/Modal';
import { VideoPlayer } from '@/components/VideoPlayer';
import { LessonCommunityTab } from '@/components/community/LessonCommunityTab';
import { apiFetch } from '@/lib/auth/api';
import {
  MATERIAL_TYPE_LABELS,
  createLessonMaterial,
  deleteLessonMaterial,
  removeLessonVideo,
  reprocessLessonVideo,
  updateLesson,
  updateLessonMaterial,
  uploadLessonVideo,
} from '@/lib/course-editor/lesson-api';
import type { VideoMaterialRow } from '@/lib/course-editor/types';
import { errorMessage } from '@/lib/format';
import {
  getModuleCompletionPercent,
  getWatchedLessonIds,
  isWatchProgressComplete,
  markLessonWatched,
  migrateLocalProgressToServer,
  reportLessonProgress,
  syncLocalCacheFromServer,
} from '@/lib/course-view/lesson-progress';
import { formatDuration } from '@/lib/course-view/format-duration';
import { mediaStatusLabel } from '@/lib/course-view/media-status';
import { touchRecentCourse } from '@/lib/course-view/recent-courses';
import {
  MATERIAL_FORM_KINDS,
  filenameFromUrl,
  isDownloadableMaterial,
  materialFormKindFromType,
  resolveMaterialType,
  suggestTitleFromUrl,
  type MaterialFormKind,
} from '@/lib/course-view/material-helpers';

type PlaylistItem = {
  id: string;
  title: string;
  sortOrder: number;
  materialCount: number;
  durationSec?: number | null;
  mediaAsset?: { id: string; status: string; progressPercent?: number } | null;
};

type CourseModulePlaylist = {
  id: string;
  title: string;
  sortOrder: number;
  videos: PlaylistItem[];
};

type LessonActivity = {
  id: string;
  title: string;
  kind: 'ACTIVITY' | 'QUIZ';
  moduleId: string | null;
  moduleTitle: string | null;
  dueDate: string | null;
};

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  materials: VideoMaterialRow[];
  mediaAsset: {
    id: string;
    status: string;
    progressPercent?: number;
    errorMessage?: string | null;
  } | null;
  module: { id: string; title: string };
  course: { id: string; title: string; synopsis?: string | null };
  playlist: PlaylistItem[];
  courseModules?: CourseModulePlaylist[];
  activities?: LessonActivity[];
  prev: PlaylistItem | null;
  next: PlaylistItem | null;
};

type LessonTab = 'about' | 'materials' | 'community';

type Props = {
  videoId: string;
  /** Habilita edição da aula, do vídeo e dos materiais. */
  editable?: boolean;
  /** Rota da página do curso (aluno ou admin). */
  courseHref: (courseId: string) => string;
  /** Rota de outra aula da mesma playlist. */
  lessonHref: (videoId: string) => string;
  /** Rota da atividade (entrega). */
  activityHref?: (activityId: string) => string;
  /** Rota do quiz. */
  quizHref?: (quizId: string) => string;
  /** Base da comunidade (default aluno). */
  communityBasePath?: string;
};

/** Extrai número e nome limpo do título do módulo (seed: "Módulo N — Nome"). */
function moduleDisplay(title: string, index: number) {
  const match = title.match(/^Módulo\s+(\d+)\s*[—\-–]\s*(.+)$/i);
  if (match) {
    return { number: Number(match[1]), name: match[2].trim() };
  }
  return { number: index + 1, name: title };
}

/** Anel de progresso (%) ao redor do número do módulo. */
function ModuleProgressRing({ percent, number }: { percent: number; number: number }) {
  const size = 46;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <span
      className={clamped >= 100 ? 'module-progress-ring is-complete' : 'module-progress-ring'}
      aria-label={`${clamped}% concluído`}
      title={`${clamped}% concluído`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="module-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="module-progress-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="module-progress-num">{number}</span>
    </span>
  );
}

/** Material da aula: título primeiro, conteúdo abaixo, tudo alinhado à esquerda. */
function MaterialLink({ material }: { material: VideoMaterialRow }) {
  const typeLabel = MATERIAL_TYPE_LABELS[material.type] ?? material.type;
  const title = material.title?.trim() || typeLabel;

  let body: ReactNode = null;

  if (material.type === 'QUIZ' && material.refId) {
    body = (
      <Link className="btn btn-secondary btn-sm" href={`/aluno/quiz/${material.refId}`}>
        Abrir quiz
      </Link>
    );
  } else if (material.type === 'LINK' && material.url) {
    body = (
      <a className="lesson-material-url" href={material.url} target="_blank" rel="noreferrer">
        {material.url}
      </a>
    );
  } else if (isDownloadableMaterial(material.type) && material.url) {
    const filename = filenameFromUrl(material.url, title || 'material');
    body = (
      <span className="lesson-material-actions">
        <a
          className="btn btn-secondary btn-sm"
          href={material.url}
          target="_blank"
          rel="noreferrer"
        >
          Abrir no navegador
        </a>
        <a
          className="btn btn-primary btn-sm"
          href={material.url}
          download={filename}
          target="_blank"
          rel="noreferrer"
        >
          Baixar
        </a>
      </span>
    );
  }

  return (
    <div className="lesson-material-row">
      <strong className="lesson-material-title">{title}</strong>
      {body ? <div className="lesson-material-body">{body}</div> : null}
    </div>
  );
}

export function LessonView({
  videoId,
  editable = false,
  courseHref,
  lessonHref,
  activityHref = (id) => `/aluno/atividade/${id}`,
  quizHref = (id) => `/aluno/quiz/${id}`,
  communityBasePath = '/aluno/comunidade',
}: Props) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab>('about');
  /** Módulos expandidos na playlist lateral. */
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  /** % e aulas assistidas por módulo (cache local + servidor). */
  const [progressTick, setProgressTick] = useState(0);
  const reportedCompleteRef = useRef<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<VideoMaterialRow | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKind, setFormKind] = useState<MaterialFormKind>('LINK');
  const [formRefId, setFormRefId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<Lesson>(`/module-videos/${videoId}`);
    setLesson(data);
    touchRecentCourse(data.course.id);
    const moduleIds = data.playlist.map((m) => m.id);
    const serverProgress = await migrateLocalProgressToServer({
      courseId: data.course.id,
      moduleIds,
    });
    if (serverProgress) syncLocalCacheFromServer(serverProgress);
    // Recalcula anéis/% da playlist (visto = 90% do vídeo).
    setProgressTick((n) => n + 1);
    setExpandedModules({ [data.module.id]: true });
    if (data.mediaAsset?.status === 'READY') {
      const play = await apiFetch<{ playlistUrl: string }>(`/media/${data.mediaAsset.id}/playback`);
      setPlaylistUrl(play.playlistUrl);
    } else {
      setPlaylistUrl(null);
    }
  }, [videoId]);

  function markCurrentLessonWatched() {
    if (!lesson) return;
    if (markLessonWatched(lesson.module.id, lesson.id)) {
      setProgressTick((n) => n + 1);
    }
  }

  function handleVideoProgress(currentTime: number, duration: number) {
    if (!lesson) return;
    if (!isWatchProgressComplete(currentTime, duration)) return;
    // Evita spam: só reporta uma vez por aula na sessão atual.
    if (reportedCompleteRef.current === lesson.id) {
      markCurrentLessonWatched();
      return;
    }
    reportedCompleteRef.current = lesson.id;
    void reportLessonProgress({
      moduleVideoId: lesson.id,
      moduleId: lesson.module.id,
      currentTime,
      duration,
    }).then((res) => {
      if (res?.completed) setProgressTick((n) => n + 1);
      if (res?.courseCompleted) {
        setNotice('Curso concluído! Seu certificado está disponível em Certificados.');
      }
    });
  }

  useEffect(() => {
    if (!videoId) return;
    setPlaylistUrl(null);
    void (async () => {
      try {
        await load();
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Falha ao carregar aula'));
      }
    })();
  }, [videoId, load]);

  useEffect(() => {
    const status = lesson?.mediaAsset?.status;
    if (status !== 'PROCESSING' && status !== 'UPLOADING') return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [lesson?.mediaAsset?.status, load]);

  async function perform(action: () => Promise<void>, ok: string, fail: string) {
    setBusy(true);
    try {
      await action();
      setNotice(ok);
      setError(null);
      await load();
      return true;
    } catch (e) {
      setError(errorMessage(e, fail));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    if (!lesson) return;
    setFormTitle(lesson.title);
    setFormDesc(lesson.description ?? '');
    setFile(null);
    setEditOpen(true);
  }

  function openMaterialCreate() {
    setEditingMaterial(null);
    setFormTitle('');
    setFormUrl('');
    setFormKind('LINK');
    setFormRefId('');
    setMaterialOpen(true);
  }

  function openMaterialEdit(material: VideoMaterialRow) {
    setEditingMaterial(material);
    setFormTitle(material.title);
    setFormUrl(material.url ?? '');
    setFormKind(materialFormKindFromType(material.type));
    setFormRefId(material.refId ?? '');
    setMaterialOpen(true);
  }

  async function saveLesson(e: FormEvent) {
    e.preventDefault();
    if (!lesson) return;
    const sendingFile = file;
    setUploadPercent(sendingFile ? 0 : null);
    const ok = await perform(
      async () => {
        await updateLesson(lesson.course.id, lesson.module.id, lesson.id, {
          title: formTitle,
          description: formDesc || null,
        });
        if (sendingFile) {
          if (lesson.mediaAsset) await removeLessonVideo(lesson.mediaAsset.id);
          await uploadLessonVideo(lesson.id, sendingFile, (pct) => setUploadPercent(pct));
        }
      },
      sendingFile
        ? 'Aula salva. O vídeo está na fila de processamento.'
        : 'Aula salva.',
      'Falha ao salvar a aula',
    );
    setUploadPercent(null);
    if (ok) {
      setEditOpen(false);
      setFile(null);
    }
  }

  async function dropVideo() {
    if (!lesson?.mediaAsset) return;
    if (!window.confirm('Remover o vídeo desta aula?')) return;
    await perform(
      () => removeLessonVideo(lesson.mediaAsset!.id).then(() => undefined),
      'Vídeo removido.',
      'Falha ao remover vídeo',
    );
  }

  async function reprocessVideo() {
    if (!lesson?.mediaAsset) return;
    if (
      !window.confirm(
        'Reprocessar este vídeo? O original é convertido para H.264 (compatível com o navegador). Não precisa reenviar o arquivo.',
      )
    ) {
      return;
    }
    await perform(
      () => reprocessLessonVideo(lesson.mediaAsset!.id).then(() => undefined),
      'Vídeo na fila de reprocessamento.',
      'Falha ao reprocessar vídeo',
    );
  }

  async function saveMaterial(e: FormEvent) {
    e.preventDefault();
    if (!lesson) return;
    const type = resolveMaterialType(formKind, formUrl);
    const title =
      formTitle.trim() ||
      (formKind === 'LINK' && formUrl ? suggestTitleFromUrl(formUrl) : formTitle.trim());
    if (!title) {
      setError('Informe um título para o material.');
      return;
    }
    if (formKind !== 'QUIZ' && !formUrl.trim()) {
      setError('Informe a URL do material.');
      return;
    }
    const payload = {
      type,
      title,
      url: formKind === 'QUIZ' ? undefined : formUrl.trim() || undefined,
      refId: formKind === 'QUIZ' ? formRefId.trim() || undefined : undefined,
    };
    const ok = await perform(
      async () => {
        if (editingMaterial) {
          await updateLessonMaterial(
            lesson.course.id,
            lesson.module.id,
            lesson.id,
            editingMaterial.id,
            {
              type: payload.type,
              title: payload.title,
              url: formKind === 'QUIZ' ? null : formUrl.trim() || null,
            },
          );
        } else {
          await createLessonMaterial(lesson.course.id, lesson.module.id, lesson.id, payload);
        }
      },
      editingMaterial ? 'Material atualizado.' : 'Material adicionado.',
      'Falha ao salvar material',
    );
    if (ok) {
      setMaterialOpen(false);
      setActiveTab('materials');
    }
  }

  async function dropMaterial(material: VideoMaterialRow) {
    if (!lesson) return;
    if (!window.confirm(`Excluir o material "${material.title}"?`)) return;
    await perform(
      () =>
        deleteLessonMaterial(lesson.course.id, lesson.module.id, lesson.id, material.id).then(
          () => undefined,
        ),
      'Material excluído.',
      'Falha ao excluir material',
    );
  }

  const courseModules = useMemo(() => {
    if (!lesson) return [] as CourseModulePlaylist[];
    if (lesson.courseModules?.length) return lesson.courseModules;
    // Fallback se a API antiga ainda não devolver courseModules.
    return [
      {
        id: lesson.module.id,
        title: lesson.module.title,
        sortOrder: 0,
        videos: lesson.playlist,
      },
    ];
  }, [lesson]);

  /** Próxima aula do módulo, ou primeira do módulo seguinte. Some no último. */
  const nextCta = useMemo(() => {
    if (!lesson) return null;
    const modules = courseModules.filter((mod) => mod.videos.length > 0);
    const modIdx = modules.findIndex((mod) => mod.id === lesson.module.id);
    if (modIdx < 0) return null;

    const videos = modules[modIdx].videos;
    const vidIdx = videos.findIndex((v) => v.id === lesson.id);
    if (vidIdx >= 0 && vidIdx < videos.length - 1) {
      return {
        id: videos[vidIdx + 1].id,
        label: 'Próximo conteúdo →',
      };
    }

    const nextModule = modules[modIdx + 1];
    const firstOfNext = nextModule?.videos[0];
    if (!firstOfNext) return null;
    return {
      id: firstOfNext.id,
      label: 'Próximo Módulo →',
    };
  }, [lesson, courseModules]);

  const openModuleId =
    Object.entries(expandedModules).find(([, open]) => open)?.[0] ?? lesson?.module.id ?? null;

  /** Atividades/quizzes só do módulo expandido na playlist. */
  const moduleActivities = useMemo(() => {
    const all = lesson?.activities ?? [];
    if (!openModuleId) return [];
    return all.filter((item) => item.moduleId === openModuleId);
  }, [lesson?.activities, openModuleId]);

  const courseSynopsis = lesson?.course.synopsis?.trim() || '';
  const aboutText = lesson?.description?.trim() || courseSynopsis;

  const moduleMeta = useMemo(() => {
    if (!lesson) return { number: 1, name: '' };
    const idx = courseModules.findIndex((m) => m.id === lesson.module.id);
    return moduleDisplay(lesson.module.title, idx >= 0 ? idx : 0);
  }, [lesson, courseModules]);

  const status = lesson?.mediaAsset?.status;

  // progressTick força releitura do localStorage após marcar assistida.
  const modulePercents = useMemo(() => {
    void progressTick;
    const map: Record<string, number> = {};
    for (const mod of courseModules) {
      map[mod.id] = getModuleCompletionPercent(
        mod.id,
        mod.videos.map((v) => v.id),
      );
    }
    return map;
  }, [courseModules, progressTick]);

  const watchedByModule = useMemo(() => {
    void progressTick;
    const map: Record<string, Set<string>> = {};
    for (const mod of courseModules) {
      map[mod.id] = new Set(getWatchedLessonIds(mod.id));
    }
    return map;
  }, [courseModules, progressTick]);

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) =>
      prev[moduleId] === true ? { [moduleId]: false } : { [moduleId]: true },
    );
  }

  return (
    <AppShell
      title={lesson?.course.title ?? 'Aula'}
      titleHref={lesson?.course.id ? courseHref(lesson.course.id) : undefined}
    >
      {error ? (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {notice}
        </div>
      ) : null}

      <div className="lesson-layout">
        <div className="stack">
          <header className="lesson-crumb-bar">
            <p className="lesson-crumb">
              <span className="lesson-crumb-module">{moduleMeta.name || 'Módulo'}</span>
              <span className="lesson-crumb-sep" aria-hidden="true">
                /
              </span>
              <span className="lesson-crumb-lesson">{lesson?.title ?? 'Carregando…'}</span>
            </p>
            {editable && lesson ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={openEdit}
              >
                Editar aula
              </button>
            ) : null}
          </header>

          {!lesson?.mediaAsset ? (
            <div className="player">
              <div className="player-fake">
                <div>Nenhum vídeo vinculado a esta aula</div>
                <p
                  className="small"
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    margin: '0.35rem 0 0',
                  }}
                >
                  {editable
                    ? 'Use “Editar aula” para enviar o arquivo (até 1 GB).'
                    : 'O professor ainda não publicou o vídeo.'}
                </p>
              </div>
            </div>
          ) : status === 'READY' && playlistUrl ? (
            <VideoPlayer
              playlistUrl={playlistUrl}
              onProgress={handleVideoProgress}
              onEnded={markCurrentLessonWatched}
            />
          ) : (
            <div className="player">
              <div className="player-fake">
                <div>
                  {status === 'FAILED' ? 'Falha ao processar o vídeo' : 'Vídeo sendo processado'}
                </div>
                <p
                  className="small"
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    margin: '0.35rem 0 0',
                  }}
                >
                  {status === 'FAILED'
                    ? (lesson.mediaAsset.errorMessage ?? 'Envie o arquivo novamente.')
                    : 'Transcodificação HLS em andamento — atualize em instantes.'}
                </p>
              </div>
            </div>
          )}

          {editable && lesson?.mediaAsset ? (
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy || status === 'PROCESSING' || status === 'UPLOADING'}
                onClick={() => void reprocessVideo()}
              >
                Reprocessar vídeo
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-danger-text"
                disabled={busy}
                onClick={() => void dropVideo()}
              >
                Remover vídeo desta aula
              </button>
            </div>
          ) : null}

          <div className="lesson-tabs panel">
            <div className="lesson-tabs-nav" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'about'}
                className={activeTab === 'about' ? 'lesson-tab lesson-tab-active' : 'lesson-tab'}
                onClick={() => setActiveTab('about')}
              >
                Sobre a aula
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'materials'}
                className={
                  activeTab === 'materials' ? 'lesson-tab lesson-tab-active' : 'lesson-tab'
                }
                onClick={() => setActiveTab('materials')}
              >
                Materiais
                {lesson?.materials.length ? (
                  <span className="lesson-tab-count">{lesson.materials.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'community'}
                className={
                  activeTab === 'community' ? 'lesson-tab lesson-tab-active' : 'lesson-tab'
                }
                onClick={() => setActiveTab('community')}
              >
                Comunidade
              </button>
              {editable && activeTab === 'materials' ? <span className="spacer" /> : null}
              {editable && activeTab === 'materials' && lesson ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={openMaterialCreate}
                >
                  + Material
                </button>
              ) : null}
            </div>

            <div className="lesson-tabs-body" role="tabpanel">
              {activeTab === 'about' ? (
                aboutText ? (
                  <p className="lesson-desc lesson-desc-wide">{aboutText}</p>
                ) : (
                  <p className="muted small" style={{ margin: 0 }}>
                    {editable
                      ? 'Sem descrição — use “Editar aula” ou os dados do curso.'
                      : 'Esta aula ainda não tem descrição.'}
                  </p>
                )
              ) : null}

              {activeTab === 'materials' ? (
                lesson?.materials.length ? (
                  <ul className="lesson-materials-list">
                    {lesson.materials.map((m) => (
                      <li key={m.id}>
                        {editable ? (
                          <div className="lesson-material-row lesson-material-editable">
                            <div className="lesson-material-main">
                              <strong className="lesson-material-title">{m.title}</strong>
                              <div className="lesson-material-body">
                                {m.type === 'LINK' && m.url ? (
                                  <a
                                    className="lesson-material-url"
                                    href={m.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {m.url}
                                  </a>
                                ) : m.url ? (
                                  <span className="lesson-material-actions">
                                    <a
                                      className="btn btn-secondary btn-sm"
                                      href={m.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Abrir
                                    </a>
                                    {isDownloadableMaterial(m.type) ? (
                                      <a
                                        className="btn btn-primary btn-sm"
                                        href={m.url}
                                        download={filenameFromUrl(m.url, m.title)}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Baixar
                                      </a>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="small muted">Sem URL</span>
                                )}
                              </div>
                            </div>
                            <span className="cell-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => openMaterialEdit(m)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => void dropMaterial(m)}
                              >
                                Excluir
                              </button>
                            </span>
                          </div>
                        ) : (
                          <MaterialLink material={m} />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state">Nenhum material nesta aula ainda.</div>
                )
              ) : null}

              {activeTab === 'community' ? (
                lesson ? (
                  <LessonCommunityTab
                    courseId={lesson.course.id}
                    moduleVideoId={lesson.id}
                    lessonTitle={lesson.title}
                    communityBasePath={communityBasePath}
                  />
                ) : null
              ) : null}
            </div>
          </div>
        </div>

        <div className="lesson-sidebar">
          <aside className="panel lesson-playlist-panel">
            <div className="panel-head">
              <div>
                <h2>Conteúdo</h2>
                <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
                  {courseModules.length
                    ? `${courseModules.length} módulo${courseModules.length === 1 ? '' : 's'}`
                    : '—'}
                </p>
              </div>
            </div>

            <div className="lesson-course-playlist">
              {courseModules.map((mod, modIndex) => {
                const meta = moduleDisplay(mod.title, modIndex);
                const percent = modulePercents[mod.id] ?? 0;
                const watched = watchedByModule[mod.id] ?? new Set<string>();
                const moduleDuration = formatDuration(
                  mod.videos.reduce((sum, v) => sum + (v.durationSec ?? 0), 0),
                );
                const isOpen = expandedModules[mod.id] === true;
                const isCurrentModule = mod.id === lesson?.module.id;

                return (
                  <section
                    key={mod.id}
                    className={
                      isCurrentModule
                        ? 'playlist-module playlist-module-current'
                        : 'playlist-module'
                    }
                  >
                    <button
                      type="button"
                      className="playlist-module-head"
                      aria-expanded={isOpen}
                      onClick={() => toggleModule(mod.id)}
                    >
                      <ModuleProgressRing percent={percent} number={meta.number} />
                      <span className="playlist-module-info">
                        <strong>{meta.name}</strong>
                        <span className="playlist-module-meta">
                          {mod.videos.length} aula
                          {mod.videos.length === 1 ? '' : 's'}
                          {moduleDuration ? ` • ${moduleDuration}` : ''}
                          {percent > 0 ? ` • ${percent}%` : ''}
                        </span>
                      </span>
                      <span className="playlist-module-chevron" aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </span>
                    </button>

                    {isOpen ? (
                      <ul className="playlist-lessons">
                        {mod.videos.map((item, index) => {
                          const current = item.id === lesson?.id;
                          const done = watched.has(item.id);
                          const notReady = !item.mediaAsset || item.mediaAsset.status !== 'READY';
                          const duration = formatDuration(item.durationSec);
                          return (
                            <li key={item.id}>
                              <Link
                                className={[
                                  'playlist-lesson',
                                  current ? 'is-current' : '',
                                  done ? 'is-done' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                href={lessonHref(item.id)}
                              >
                                <span
                                  className={`playlist-idx${current ? ' playing' : ''}${done && !current ? ' done' : ''}`}
                                  aria-hidden="true"
                                >
                                  {current ? '▶' : done ? '✓' : index + 1}
                                </span>
                                <span className="playlist-info">
                                  <strong>{item.title}</strong>
                                  {notReady ? (
                                    <span
                                      className={
                                        item.mediaAsset?.status === 'FAILED'
                                          ? 'playlist-lesson-meta playlist-status-proc'
                                          : 'playlist-lesson-meta'
                                      }
                                    >
                                      {item.mediaAsset
                                        ? mediaStatusLabel(
                                            item.mediaAsset.status,
                                            item.mediaAsset.progressPercent,
                                          )
                                        : 'sem vídeo'}
                                    </span>
                                  ) : null}
                                </span>
                                {duration ? (
                                  <span className="playlist-duration">{duration}</span>
                                ) : null}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {nextCta ? (
              <div
                className="panel-body lesson-playlist-footer"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <Link className="btn btn-primary btn-block" href={lessonHref(nextCta.id)}>
                  {nextCta.label}
                </Link>
              </div>
            ) : null}
          </aside>

          <aside className="panel lesson-activities-panel">
            <div className="panel-head">
              <div>
                <h2>Atividades do Módulo</h2>
              </div>
            </div>
            {moduleActivities.length ? (
              <ul className="module-list playlist lesson-activities-list">
                {moduleActivities.map((item) => {
                  const href = item.kind === 'QUIZ' ? quizHref(item.id) : activityHref(item.id);
                  const kindLabel = item.kind === 'QUIZ' ? 'Quiz' : 'Atividade';
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link href={href}>
                        <span className="playlist-idx" aria-hidden="true">
                          {item.kind === 'QUIZ' ? '?' : '✎'}
                        </span>
                        <span className="playlist-info">
                          <strong>{item.title}</strong>
                          <span className="small muted">{kindLabel}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="panel-body">
                <p className="small muted" style={{ margin: 0 }}>
                  Nenhuma atividade neste módulo.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={editOpen}
        title="Editar aula"
        onClose={() => setEditOpen(false)}
        preventClose={busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="lesson-view-form"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy
                ? file
                  ? `Enviando${uploadPercent != null ? ` ${uploadPercent}%` : '…'}`
                  : 'Salvando…'
                : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="lesson-view-form" onSubmit={saveLesson}>
          {busy && file ? (
            <div className="alert alert-info" role="status" style={{ marginBottom: '1rem' }}>
              {uploadPercent != null && uploadPercent >= 100
                ? 'Upload concluído. Aguardando o servidor gravar o arquivo…'
                : `Enviando vídeo… ${uploadPercent ?? 0}% — não feche esta janela.`}
              <div className="upload-track" aria-hidden>
                <div
                  className="upload-fill"
                  style={{ width: `${uploadPercent ?? 0}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="lv-title">Título</label>
            <input
              id="lv-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="lv-desc">Descrição</label>
            <textarea
              id="lv-desc"
              rows={4}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lv-file">
              {lesson?.mediaAsset
                ? 'Substituir vídeo (mp4/webm/mov)'
                : 'Enviar vídeo (mp4/webm/mov)'}
            </label>
            <input
              id="lv-file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
              Até 1 GB por vídeo.
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        open={materialOpen}
        title={editingMaterial ? 'Editar material' : 'Novo material da aula'}
        onClose={() => setMaterialOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setMaterialOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="lesson-view-material"
              className="btn btn-primary"
              disabled={busy}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="lesson-view-material" onSubmit={saveMaterial}>
          <div className="field">
            <label htmlFor="lvm-kind">Tipo</label>
            <select
              id="lvm-kind"
              value={formKind}
              onChange={(e) => setFormKind(e.target.value as MaterialFormKind)}
            >
              {MATERIAL_FORM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
              {MATERIAL_FORM_KINDS.find((k) => k.value === formKind)?.hint}
            </p>
          </div>
          {formKind === 'QUIZ' ? (
            <>
              <div className="field">
                <label htmlFor="lvm-title">Título</label>
                <input
                  id="lvm-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lvm-ref">ID do questionário</label>
                <input
                  id="lvm-ref"
                  value={formRefId}
                  onChange={(e) => setFormRefId(e.target.value)}
                  required
                  placeholder="id do quiz"
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="lvm-url">
                  {formKind === 'LINK' ? 'URL do link' : 'URL do arquivo'}
                </label>
                <input
                  id="lvm-url"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  required
                  placeholder="https://"
                />
              </div>
              <div className="field">
                <label htmlFor="lvm-title">
                  Título {formKind === 'LINK' ? <span className="muted">(opcional)</span> : null}
                </label>
                <input
                  id="lvm-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required={formKind !== 'LINK'}
                  placeholder={
                    formKind === 'LINK' ? 'Ex.: Material de apoio' : 'Ex.: Slides da aula (PDF)'
                  }
                />
              </div>
            </>
          )}
        </form>
      </Modal>
    </AppShell>
  );
}
