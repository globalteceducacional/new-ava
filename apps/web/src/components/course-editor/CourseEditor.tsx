'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CategoryMultiSelect } from '@/components/CategoryMultiSelect';
import { Modal } from '@/components/Modal';
import { SearchableSelect } from '@/components/SearchableSelect';
import {
  QuizQuestionsEditor,
  emptyQuizQuestion,
  serializeQuizQuestions,
} from '@/components/course-editor/QuizQuestionsEditor';
import { apiFetch } from '@/lib/auth/api';
import type {
  Category,
  Course,
  CourseEnrollment,
  CourseInstitutionLink,
  CourseTeacher,
  Institution,
  UserOption,
} from '@/lib/admin/types';
import { COURSE_STATUS_LABELS } from '@/lib/admin/types';
import { errorMessage, formatDate } from '@/lib/format';
import { mediaStatusLabel } from '@/lib/course-view/media-status';
import {
  MATERIAL_TYPE_LABELS,
  deleteLessonMaterial,
  removeLessonVideo,
  reorderLessons,
  reorderModules,
  reprocessCourseVideos,
  reprocessLessonVideo,
  updateLesson,
  updateLessonMaterial,
  updateModule,
  uploadLessonVideo,
} from '@/lib/course-editor/lesson-api';
import {
  MATERIAL_FORM_KINDS,
  filenameFromUrl,
  isDownloadableMaterial,
  materialFormKindFromType,
  resolveMaterialType,
  suggestTitleFromUrl,
  type MaterialFormKind,
} from '@/lib/course-view/material-helpers';
import {
  WIZARD_STEPS,
  type ActivityRow,
  type CourseEditorCapabilities,
  type CourseEditorMode,
  type ModuleRow,
  type QuizQuestionDraft,
  type QuizRow,
  type VideoMaterialRow,
  type VideoRow,
  type WizardStepId,
} from '@/lib/course-editor/types';

type Props = {
  mode: CourseEditorMode;
  courseId?: string;
  capabilities: CourseEditorCapabilities;
  backHref: string;
  titleFallback?: string;
};

const EMPTY_QUESTION = (): QuizQuestionDraft => emptyQuizQuestion();

/** Converte ISO para o valor de input datetime-local. */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CourseEditor({
  mode,
  courseId: initialCourseId,
  capabilities,
  backHref,
  titleFallback = 'Curso',
}: Props) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(initialCourseId ?? '');
  const [step, setStep] = useState<WizardStepId>('basics');

  const [course, setCourse] = useState<Course | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [teachers, setTeachers] = useState<CourseTeacher[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [links, setLinks] = useState<CourseInstitutionLink[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<UserOption[]>([]);
  const [studentOptions, setStudentOptions] = useState<UserOption[]>([]);

  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [workloadHours, setWorkloadHours] = useState(0);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const steps = useMemo(
    () => WIZARD_STEPS.filter((s) => !s.adminOnly || capabilities.canManageOffer),
    [capabilities.canManageOffer],
  );

  const loadBundle = useCallback(
    async (id: string) => {
      const requests: Promise<unknown>[] = [
        apiFetch<Course>(`/courses/${id}`),
        apiFetch<ModuleRow[]>(`/courses/${id}/modules`),
        apiFetch<ActivityRow[]>(`/courses/${id}/activities`),
        apiFetch<QuizRow[]>(`/courses/${id}/quizzes`),
      ];
      if (capabilities.canManageOffer) {
        requests.push(
          apiFetch<CourseTeacher[]>(`/courses/${id}/teachers`),
          apiFetch<CourseEnrollment[]>(`/courses/${id}/enrollments`),
          apiFetch<CourseInstitutionLink[]>(`/courses/${id}/institutions`),
          apiFetch<Institution[]>('/institutions'),
          apiFetch<UserOption[]>('/users/lookup?role=PROFESSOR'),
          apiFetch<UserOption[]>('/users/lookup?role=ALUNO'),
        );
      }

      const results = await Promise.all(requests);
      const c = results[0] as Course;
      setCourse(c);
      setTitle(c.title);
      setSynopsis(c.synopsis ?? '');
      setWorkloadHours(c.workloadHours ?? 0);
      setCategoryIds(c.categories.map((x) => x.category.id));
      setModules(results[1] as ModuleRow[]);
      setActivities(results[2] as ActivityRow[]);
      setQuizzes(results[3] as QuizRow[]);

      if (capabilities.canManageOffer) {
        setTeachers(results[4] as CourseTeacher[]);
        setEnrollments(results[5] as CourseEnrollment[]);
        setLinks(results[6] as CourseInstitutionLink[]);
        setInstitutions(results[7] as Institution[]);
        setTeacherOptions(results[8] as UserOption[]);
        setStudentOptions(results[9] as UserOption[]);
      }
    },
    [capabilities.canManageOffer],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const cats = await apiFetch<Category[]>('/categories');
      setCategories(cats);
      if (initialCourseId) {
        await loadBundle(initialCourseId);
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Falha ao carregar o editor'));
    } finally {
      setLoading(false);
    }
  }, [initialCourseId, loadBundle]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const hasProcessingMedia = modules.some((mod) =>
    mod.videos.some(
      (v) => v.mediaAsset?.status === 'PROCESSING' || v.mediaAsset?.status === 'UPLOADING',
    ),
  );

  useEffect(() => {
    if (!courseId || !hasProcessingMedia) return;
    const timer = window.setInterval(() => {
      void apiFetch<ModuleRow[]>(`/courses/${courseId}/modules`)
        .then(setModules)
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [courseId, hasProcessingMedia]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  async function run(action: () => Promise<string>, fallback: string) {
    setBusy(true);
    try {
      const msg = await action();
      setNotice(msg);
      setError(null);
      setDirty(false);
      if (courseId) await loadBundle(courseId);
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function saveBasics(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Informe o título do curso.');
      return;
    }
    if (categoryIds.length === 0) {
      setError('Selecione ou crie ao menos uma categoria.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        synopsis: synopsis.trim() || undefined,
        workloadHours: Math.max(0, Math.floor(Number(workloadHours) || 0)),
        categoryIds,
      };
      if (!courseId) {
        const created = await apiFetch<Course>('/courses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setCourseId(created.id);
        setCourse(created);
        setNotice('Curso criado como rascunho. Continue preenchendo o conteúdo.');
        setDirty(false);
        router.replace(
          capabilities.canManageOffer
            ? `/master/catalogo/${created.id}/editor`
            : `/professor/editor?courseId=${created.id}`,
        );
        await loadBundle(created.id);
        setStep('lessons');
      } else {
        await apiFetch(`/courses/${courseId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice('Dados gerais salvos.');
        setDirty(false);
        await loadBundle(courseId);
      }
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível salvar os dados gerais'));
    } finally {
      setBusy(false);
    }
  }

  const lockedWithoutCourse = !courseId;

  return (
    <AppShell title={course?.title ?? titleFallback}>
      <div className="page-header">
        <div>
          <p className="eyebrow">
            <Link href={backHref}>Voltar</Link>
            {course ? ` · ${COURSE_STATUS_LABELS[course.status]}` : ' · Novo'}
          </p>
          <h1>{mode === 'create' && !course ? 'Novo curso' : (course?.title ?? titleFallback)}</h1>
          <p>
            Monte o curso completo: dados, aulas, atividades
            {capabilities.canManageOffer ? ' e oferta' : ''}.
          </p>
        </div>
        {capabilities.canPublish && course ? (
          <div className="row">
            {course.status === 'PUBLISHED' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await apiFetch(`/courses/${courseId}/unpublish`, {
                      method: 'PATCH',
                    });
                    return 'Curso voltou para rascunho.';
                  }, 'Falha ao despublicar')
                }
              >
                Despublicar
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await apiFetch(`/courses/${courseId}/publish`, {
                      method: 'PATCH',
                    });
                    return 'Curso publicado.';
                  }, 'Falha ao publicar')
                }
              >
                Publicar
              </button>
            )}
          </div>
        ) : null}
      </div>

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

      <nav className="wizard-steps" aria-label="Etapas do curso">
        {steps.map((s, index) => {
          const stepIndex = steps.findIndex((x) => x.id === step);
          const done = index < stepIndex;
          const active = s.id === step;
          const disabled = s.id !== 'basics' && lockedWithoutCourse;
          return (
            <button
              key={s.id}
              type="button"
              className={`wizard-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
              disabled={disabled}
              onClick={() => setStep(s.id)}
            >
              <span className="wizard-step-num">{index + 1}</span>
              {s.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="panel">
          <div className="empty-state">Carregando…</div>
        </div>
      ) : null}

      {!loading && step === 'basics' ? (
        <BasicsStep
          title={title}
          synopsis={synopsis}
          workloadHours={workloadHours}
          categoryIds={categoryIds}
          categories={categories}
          busy={busy}
          onTitle={(v) => {
            setTitle(v);
            setDirty(true);
          }}
          onSynopsis={(v) => {
            setSynopsis(v);
            setDirty(true);
          }}
          onWorkloadHours={(v) => {
            setWorkloadHours(v);
            setDirty(true);
          }}
          onCategories={(ids) => {
            setCategoryIds(ids);
            setDirty(true);
          }}
          onCreatedCategory={(c) =>
            setCategories((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
          }
          onSubmit={saveBasics}
        />
      ) : null}

      {!loading && step === 'lessons' && courseId ? (
        <LessonsStep
          courseId={courseId}
          modules={modules}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onNotice={setNotice}
          onReload={() => loadBundle(courseId)}
        />
      ) : null}

      {!loading && step === 'assessments' && courseId ? (
        <AssessmentsStep
          courseId={courseId}
          modules={modules}
          activities={activities}
          quizzes={quizzes}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onNotice={setNotice}
          onReload={() => loadBundle(courseId)}
        />
      ) : null}

      {!loading && step === 'offer' && courseId && capabilities.canManageOffer ? (
        <OfferStep
          courseId={courseId}
          teachers={teachers}
          enrollments={enrollments}
          links={links}
          institutions={institutions}
          teacherOptions={teacherOptions}
          studentOptions={studentOptions}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onNotice={setNotice}
          onReload={() => loadBundle(courseId)}
        />
      ) : null}

      {!loading && lockedWithoutCourse && step !== 'basics' ? (
        <div className="alert alert-warn">
          Salve os dados gerais do curso antes de avançar para as outras etapas.
        </div>
      ) : null}
    </AppShell>
  );
}

function BasicsStep(props: {
  title: string;
  synopsis: string;
  workloadHours: number;
  categoryIds: string[];
  categories: Category[];
  busy: boolean;
  onTitle: (v: string) => void;
  onSynopsis: (v: string) => void;
  onWorkloadHours: (v: number) => void;
  onCategories: (ids: string[]) => void;
  onCreatedCategory: (c: Category) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form className="panel" onSubmit={props.onSubmit}>
      <div className="panel-head">
        <h2>Dados gerais</h2>
      </div>
      <div className="panel-body">
        <div className="field">
          <label htmlFor="course-title">Título</label>
          <input
            id="course-title"
            value={props.title}
            onChange={(e) => props.onTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="Ex.: Programação — Iniciante"
          />
        </div>
        <div className="field">
          <label htmlFor="course-synopsis">Sinopse / descrição</label>
          <textarea
            id="course-synopsis"
            rows={4}
            value={props.synopsis}
            onChange={(e) => props.onSynopsis(e.target.value)}
            maxLength={1000}
            placeholder="Resumo exibido ao aluno"
          />
        </div>
        <div className="field">
          <label htmlFor="course-hours">Carga horária (horas)</label>
          <input
            id="course-hours"
            type="number"
            min={0}
            step={1}
            value={props.workloadHours}
            onChange={(e) =>
              props.onWorkloadHours(Math.max(0, Math.floor(Number(e.target.value) || 0)))
            }
            placeholder="Ex.: 2, 4, 8, 20"
          />
          <p className="muted small" style={{ marginTop: '0.35rem' }}>
            Aparece no certificado (somente horas inteiras).
          </p>
        </div>
        <div className="field">
          <label>Categorias</label>
          <CategoryMultiSelect
            options={props.categories}
            value={props.categoryIds}
            onChange={props.onCategories}
            onCreated={props.onCreatedCategory}
            disabled={props.busy}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={props.busy}>
          {props.busy ? 'Salvando…' : 'Salvar e continuar'}
        </button>
      </div>
    </form>
  );
}

function LessonsStep(props: {
  courseId: string;
  modules: ModuleRow[];
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (v: string | null) => void;
  onNotice: (v: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDesc, setModuleDesc] = useState('');

  /** Módulo destino ao criar uma aula (aberto pelo botão da playlist). */
  const [createLessonModule, setCreateLessonModule] = useState<ModuleRow | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [file, setFile] = useState<File | null>(null);

  /** Aula destino ao criar link de apoio (aberto pelo botão da aula). */
  const [createMaterialTarget, setCreateMaterialTarget] = useState<{
    moduleId: string;
    video: VideoRow;
  } | null>(null);
  const [materialTitle, setMaterialTitle] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialKind, setMaterialKind] = useState<MaterialFormKind>('LINK');
  const [materialRefId, setMaterialRefId] = useState('');

  const [editModule, setEditModule] = useState<ModuleRow | null>(null);
  const [editLesson, setEditLesson] = useState<{
    moduleId: string;
    video: VideoRow;
  } | null>(null);
  const [editMaterial, setEditMaterial] = useState<{
    moduleId: string;
    videoId: string;
    material: VideoMaterialRow;
  } | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKind, setFormKind] = useState<MaterialFormKind>('LINK');
  const [formRefId, setFormRefId] = useState('');

  async function createModule(e: FormEvent) {
    e.preventDefault();
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/modules`, {
        method: 'POST',
        body: JSON.stringify({
          title: moduleTitle,
          description: moduleDesc || undefined,
        }),
      });
      setModuleTitle('');
      setModuleDesc('');
      props.onNotice('Módulo criado. Use “+ Aula neste módulo” na playlist.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao criar módulo'));
    } finally {
      props.onBusy(false);
    }
  }

  function openCreateLesson(mod: ModuleRow) {
    setVideoTitle('');
    setVideoDesc('');
    setFile(null);
    setCreateLessonModule(mod);
  }

  async function createVideo(e: FormEvent) {
    e.preventDefault();
    if (!createLessonModule) return;
    props.onBusy(true);
    try {
      const video = await apiFetch<{ id: string }>(
        `/courses/${props.courseId}/modules/${createLessonModule.id}/videos`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: videoTitle,
            description: videoDesc || undefined,
          }),
        },
      );
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await apiFetch(`/media/upload?moduleVideoId=${video.id}`, {
          method: 'POST',
          body: fd,
        });
        props.onNotice(`Aula criada em “${createLessonModule.title}” e vídeo enviado.`);
      } else {
        props.onNotice(
          `Aula criada em “${createLessonModule.title}”. Você pode enviar o vídeo depois.`,
        );
      }
      setCreateLessonModule(null);
      setVideoTitle('');
      setVideoDesc('');
      setFile(null);
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao criar aula'));
    } finally {
      props.onBusy(false);
    }
  }

  function openCreateMaterial(moduleId: string, video: VideoRow) {
    setMaterialTitle('');
    setMaterialUrl('');
    setMaterialKind('LINK');
    setMaterialRefId('');
    setCreateMaterialTarget({ moduleId, video });
  }

  async function addMaterial(e: FormEvent) {
    e.preventDefault();
    if (!createMaterialTarget) return;
    const { moduleId, video } = createMaterialTarget;
    const type = resolveMaterialType(materialKind, materialUrl);
    const title =
      materialTitle.trim() ||
      (materialKind === 'LINK' && materialUrl ? suggestTitleFromUrl(materialUrl) : '');
    if (!title) {
      props.onError('Informe um título para o material.');
      return;
    }
    if (materialKind !== 'QUIZ' && !materialUrl.trim()) {
      props.onError('Informe a URL do material.');
      return;
    }
    props.onBusy(true);
    try {
      await apiFetch(
        `/courses/${props.courseId}/modules/${moduleId}/videos/${video.id}/materials`,
        {
          method: 'POST',
          body: JSON.stringify({
            type,
            title,
            url: materialKind === 'QUIZ' ? undefined : materialUrl.trim() || undefined,
            refId: materialKind === 'QUIZ' ? materialRefId.trim() || undefined : undefined,
          }),
        },
      );
      props.onNotice(`Material adicionado em “${video.title}”.`);
      setCreateMaterialTarget(null);
      setMaterialTitle('');
      setMaterialUrl('');
      setMaterialRefId('');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao adicionar material'));
    } finally {
      props.onBusy(false);
    }
  }

  async function deleteModule(moduleId: string, title: string) {
    if (!window.confirm(`Excluir o módulo "${title}" e suas aulas?`)) return;
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/modules/${moduleId}`, {
        method: 'DELETE',
      });
      props.onNotice('Módulo excluído.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao excluir módulo'));
    } finally {
      props.onBusy(false);
    }
  }

  async function deleteVideo(moduleId: string, videoId: string, title: string) {
    if (!window.confirm(`Excluir a aula "${title}"?`)) return;
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/modules/${moduleId}/videos/${videoId}`, {
        method: 'DELETE',
      });
      props.onNotice('Aula excluída.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao excluir aula'));
    } finally {
      props.onBusy(false);
    }
  }

  /** Executa a ação, avisa o usuário e recarrega o curso. */
  async function perform(action: () => Promise<void>, ok: string, fail: string) {
    props.onBusy(true);
    try {
      await action();
      props.onNotice(ok);
      props.onError(null);
      await props.onReload();
      return true;
    } catch (err) {
      props.onError(errorMessage(err, fail));
      return false;
    } finally {
      props.onBusy(false);
    }
  }

  function openModuleEdit(mod: ModuleRow) {
    setFormTitle(mod.title);
    setFormDesc(mod.description ?? '');
    setEditModule(mod);
  }

  function openLessonEdit(moduleId: string, video: VideoRow) {
    setFormTitle(video.title);
    setFormDesc(video.description ?? '');
    setReplaceFile(null);
    setEditLesson({ moduleId, video });
  }

  function openMaterialEdit(moduleId: string, videoId: string, material: VideoMaterialRow) {
    setFormTitle(material.title);
    setFormUrl(material.url ?? '');
    setFormKind(materialFormKindFromType(material.type));
    setFormRefId(material.refId ?? '');
    setEditMaterial({ moduleId, videoId, material });
  }

  async function saveModuleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editModule) return;
    const ok = await perform(
      async () => {
        await updateModule(props.courseId, editModule.id, {
          title: formTitle,
          description: formDesc || null,
        });
      },
      'Módulo atualizado.',
      'Falha ao atualizar módulo',
    );
    if (ok) setEditModule(null);
  }

  async function saveLessonEdit(e: FormEvent) {
    e.preventDefault();
    if (!editLesson) return;
    const { moduleId, video } = editLesson;
    const ok = await perform(
      async () => {
        await updateLesson(props.courseId, moduleId, video.id, {
          title: formTitle,
          description: formDesc || null,
        });
        if (replaceFile) {
          if (video.mediaAsset) await removeLessonVideo(video.mediaAsset.id);
          await uploadLessonVideo(video.id, replaceFile);
        }
      },
      replaceFile ? 'Aula atualizada e vídeo enviado para processamento.' : 'Aula atualizada.',
      'Falha ao atualizar aula',
    );
    if (ok) setEditLesson(null);
  }

  async function dropLessonVideo(video: VideoRow) {
    if (!video.mediaAsset) return;
    if (!window.confirm(`Remover o vídeo da aula "${video.title}"?`)) return;
    await perform(
      () => removeLessonVideo(video.mediaAsset!.id).then(() => undefined),
      'Vídeo removido da aula.',
      'Falha ao remover vídeo',
    );
  }

  async function reprocessLesson(video: VideoRow) {
    if (!video.mediaAsset) return;
    if (
      !window.confirm(
        `Reprocessar o vídeo de “${video.title}”? O arquivo original é convertido para H.264 (compatível com o navegador). Não precisa reenviar.`,
      )
    ) {
      return;
    }
    await perform(
      () => reprocessLessonVideo(video.mediaAsset!.id).then(() => undefined),
      'Vídeo na fila de reprocessamento.',
      'Falha ao reprocessar vídeo',
    );
  }

  async function reprocessAllVideos() {
    const count = props.modules.reduce(
      (sum, m) => sum + m.videos.filter((v) => v.mediaAsset).length,
      0,
    );
    if (!count) {
      props.onError('Nenhum vídeo para reprocessar neste curso.');
      return;
    }
    if (
      !window.confirm(
        `Reprocessar ${count} vídeo(s) deste curso? Arquivos em HEVC/H.265 (só áudio no Chrome) serão convertidos para H.264. Pode levar vários minutos.`,
      )
    ) {
      return;
    }
    await perform(
      async () => {
        const res = await reprocessCourseVideos(props.courseId);
        if (!res.queued) {
          throw new Error('Nenhum vídeo pendente para reprocessar.');
        }
      },
      'Vídeos na fila de reprocessamento (H.264). Acompanhe o status na playlist.',
      'Falha ao reprocessar os vídeos do curso',
    );
  }

  async function saveMaterialEdit(e: FormEvent) {
    e.preventDefault();
    if (!editMaterial) return;
    const { moduleId, videoId, material } = editMaterial;
    const type = resolveMaterialType(formKind, formUrl);
    const title =
      formTitle.trim() || (formKind === 'LINK' && formUrl ? suggestTitleFromUrl(formUrl) : '');
    if (!title) {
      props.onError('Informe um título para o material.');
      return;
    }
    const ok = await perform(
      async () => {
        await updateLessonMaterial(props.courseId, moduleId, videoId, material.id, {
          type,
          title,
          url: formKind === 'QUIZ' ? null : formUrl.trim() || null,
        });
      },
      'Material atualizado.',
      'Falha ao atualizar material',
    );
    if (ok) setEditMaterial(null);
  }

  async function dropMaterial(moduleId: string, videoId: string, material: VideoMaterialRow) {
    if (!window.confirm(`Excluir o material "${material.title}"?`)) return;
    await perform(
      () =>
        deleteLessonMaterial(props.courseId, moduleId, videoId, material.id).then(() => undefined),
      'Material excluído.',
      'Falha ao excluir material',
    );
  }

  async function moveModule(mod: ModuleRow, dir: -1 | 1) {
    const ids = props.modules.map((m) => m.id);
    const idx = ids.indexOf(mod.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    await perform(
      () => reorderModules(props.courseId, ids).then(() => undefined),
      'Ordem dos módulos atualizada.',
      'Falha ao reordenar módulos',
    );
  }

  async function moveLesson(mod: ModuleRow, videoId: string, dir: -1 | 1) {
    const ids = mod.videos.map((v) => v.id);
    const idx = ids.indexOf(videoId);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    await perform(
      () => reorderLessons(props.courseId, mod.id, ids).then(() => undefined),
      'Ordem das aulas atualizada.',
      'Falha ao reordenar aulas',
    );
  }

  return (
    <div className="stack">
      <form className="panel" onSubmit={createModule}>
        <div className="panel-head">
          <div>
            <h2>Novo módulo</h2>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Cada módulo é uma playlist. Depois de criar, adicione aulas nele pela lista abaixo.
            </p>
          </div>
        </div>
        <div className="panel-body grid-2">
          <div className="field">
            <label htmlFor="new-mod-title">Título</label>
            <input
              id="new-mod-title"
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-mod-desc">Descrição</label>
            <textarea
              id="new-mod-desc"
              rows={2}
              value={moduleDesc}
              onChange={(e) => setModuleDesc(e.target.value)}
            />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" type="submit" disabled={props.busy}>
              Criar módulo
            </button>
          </div>
        </div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Playlist do curso</h2>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Use “+ Aula neste módulo” e “+ Material nesta aula” — o destino fica implícito pelo
              item em que você clica.
            </p>
          </div>
          <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={props.busy}
              onClick={() => void reprocessAllVideos()}
            >
              Reprocessar todos os vídeos
            </button>
            <span className="badge">
              {props.modules.reduce((sum, m) => sum + m.videos.length, 0)} aula(s)
            </span>
          </div>
        </div>
        {props.modules.map((mod) => (
          <div
            key={mod.id}
            className="editor-item"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0 }}>{mod.title}</h3>
                {mod.description ? (
                  <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
                    {mod.description}
                  </p>
                ) : null}
              </div>
              <div className="cell-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={props.busy}
                  onClick={() => openCreateLesson(mod)}
                >
                  + Aula neste módulo
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={props.busy}
                  onClick={() => void moveModule(mod, -1)}
                  aria-label="Mover módulo para cima"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={props.busy}
                  onClick={() => void moveModule(mod, 1)}
                  aria-label="Mover módulo para baixo"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={props.busy}
                  onClick={() => openModuleEdit(mod)}
                >
                  Editar módulo
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-danger-text"
                  disabled={props.busy}
                  onClick={() => void deleteModule(mod.id, mod.title)}
                >
                  Excluir módulo
                </button>
              </div>
            </div>

            <ul className="module-list" style={{ marginTop: '0.75rem' }}>
              {mod.videos.map((v, index) => (
                <li key={v.id} className="lesson-admin-row">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="playlist-info">
                      <strong>
                        <span className="playlist-idx" aria-hidden="true">
                          {index + 1}
                        </span>{' '}
                        {v.title}
                      </strong>
                      <span className="small muted">
                        {v.mediaAsset ? (
                          <span className="badge">
                            {mediaStatusLabel(v.mediaAsset.status, v.mediaAsset.progressPercent)}
                          </span>
                        ) : (
                          'sem vídeo'
                        )}
                        {v.materials.length ? ` · ${v.materials.length} material(is)` : ''}
                      </span>
                    </div>
                    <div className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={props.busy}
                        onClick={() => openCreateMaterial(mod.id, v)}
                      >
                        + Material nesta aula
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={props.busy}
                        onClick={() => void moveLesson(mod, v.id, -1)}
                        aria-label="Mover aula para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={props.busy}
                        onClick={() => void moveLesson(mod, v.id, 1)}
                        aria-label="Mover aula para baixo"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={props.busy}
                        onClick={() => openLessonEdit(mod.id, v)}
                      >
                        {v.mediaAsset ? 'Editar / trocar vídeo' : 'Editar / enviar vídeo'}
                      </button>
                      {v.mediaAsset ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={
                            props.busy ||
                            v.mediaAsset.status === 'PROCESSING' ||
                            v.mediaAsset.status === 'UPLOADING'
                          }
                          onClick={() => void reprocessLesson(v)}
                        >
                          Reprocessar vídeo
                        </button>
                      ) : null}
                      {v.mediaAsset ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={props.busy}
                          onClick={() => void dropLessonVideo(v)}
                        >
                          Remover vídeo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm btn-danger-text"
                        disabled={props.busy}
                        onClick={() => void deleteVideo(mod.id, v.id, v.title)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  {v.materials.length ? (
                    <ul className="lesson-material-list">
                      {v.materials.map((m) => (
                        <li key={m.id} className="lesson-material-editable">
                          <div className="lesson-material-main">
                            <div className="lesson-material-head">
                              <strong className="lesson-material-title">{m.title}</strong>
                              <span className="lesson-material-kind">
                                {MATERIAL_TYPE_LABELS[m.type] ?? m.type}
                              </span>
                            </div>
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
                              ) : null}
                            </div>
                          </div>
                          <span className="cell-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={props.busy}
                              onClick={() => openMaterialEdit(mod.id, v.id, m)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm btn-danger-text"
                              disabled={props.busy}
                              onClick={() => void dropMaterial(mod.id, v.id, m)}
                            >
                              Excluir
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
              {!mod.videos.length ? (
                <li className="muted small" style={{ padding: '0.75rem 1rem' }}>
                  Nenhuma aula neste módulo.{' '}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={props.busy}
                    onClick={() => openCreateLesson(mod)}
                  >
                    Adicionar a primeira aula
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ))}
        {!props.modules.length ? (
          <div className="empty-state">Crie o primeiro módulo acima para começar a playlist.</div>
        ) : null}
      </div>

      <Modal
        open={createLessonModule !== null}
        title={createLessonModule ? `Nova aula em “${createLessonModule.title}”` : 'Nova aula'}
        onClose={() => setCreateLessonModule(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateLessonModule(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="create-lesson-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              Salvar aula
            </button>
          </>
        }
      >
        <form id="create-lesson-form" onSubmit={createVideo}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Esta aula entra automaticamente no módulo selecionado na playlist.
          </p>
          <div className="field">
            <label htmlFor="new-lesson-title">Título da aula</label>
            <input
              id="new-lesson-title"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-lesson-desc">Descrição</label>
            <textarea
              id="new-lesson-desc"
              rows={3}
              value={videoDesc}
              onChange={(e) => setVideoDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-lesson-file">Vídeo (mp4/webm/mov)</label>
            <input
              id="new-lesson-file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="hint">Opcional agora — até 1 GB. Dá para enviar depois.</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={createMaterialTarget !== null}
        title={
          createMaterialTarget
            ? `Material em “${createMaterialTarget.video.title}”`
            : 'Material da aula'
        }
        onClose={() => setCreateMaterialTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateMaterialTarget(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="create-material-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              Adicionar
            </button>
          </>
        }
      >
        <form id="create-material-form" onSubmit={addMaterial}>
          <div className="field">
            <label htmlFor="new-mat-kind">Tipo</label>
            <select
              id="new-mat-kind"
              value={materialKind}
              onChange={(e) => setMaterialKind(e.target.value as MaterialFormKind)}
            >
              {MATERIAL_FORM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <p className="small muted" style={{ margin: '0.35rem 0 0' }}>
              {MATERIAL_FORM_KINDS.find((k) => k.value === materialKind)?.hint}
            </p>
          </div>
          {materialKind === 'QUIZ' ? (
            <>
              <div className="field">
                <label htmlFor="new-mat-title">Título</label>
                <input
                  id="new-mat-title"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="new-mat-ref">ID do questionário</label>
                <input
                  id="new-mat-ref"
                  value={materialRefId}
                  onChange={(e) => setMaterialRefId(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="new-mat-url">
                  {materialKind === 'LINK' ? 'URL do link' : 'URL do arquivo'}
                </label>
                <input
                  id="new-mat-url"
                  type="url"
                  value={materialUrl}
                  onChange={(e) => setMaterialUrl(e.target.value)}
                  required
                  placeholder="https://"
                />
              </div>
              <div className="field">
                <label htmlFor="new-mat-title">
                  Título{' '}
                  {materialKind === 'LINK' ? <span className="muted">(opcional)</span> : null}
                </label>
                <input
                  id="new-mat-title"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                  required={materialKind !== 'LINK'}
                  placeholder={
                    materialKind === 'LINK' ? 'Ex.: Material de apoio' : 'Ex.: Slides da aula (PDF)'
                  }
                />
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal
        open={editModule !== null}
        title="Editar módulo"
        onClose={() => setEditModule(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditModule(null)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="module-edit-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="module-edit-form" onSubmit={saveModuleEdit}>
          <div className="field">
            <label htmlFor="mod-edit-title">Título</label>
            <input
              id="mod-edit-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="mod-edit-desc">Descrição</label>
            <textarea
              id="mod-edit-desc"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={editLesson !== null}
        title="Editar aula"
        onClose={() => setEditLesson(null)}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditLesson(null)}>
              Cancelar
            </button>
            <button
              type="submit"
              form="lesson-edit-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="lesson-edit-form" onSubmit={saveLessonEdit}>
          <div className="field">
            <label htmlFor="lesson-edit-title">Título</label>
            <input
              id="lesson-edit-title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-edit-desc">Descrição</label>
            <textarea
              id="lesson-edit-desc"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="lesson-edit-file">
              {editLesson?.video.mediaAsset
                ? 'Substituir vídeo (mp4/webm/mov)'
                : 'Enviar vídeo (mp4/webm/mov)'}
            </label>
            <input
              id="lesson-edit-file"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
            />
            <p className="hint">Até 1 GB por vídeo. O arquivo atual é substituído ao salvar.</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={editMaterial !== null}
        title="Editar material da aula"
        onClose={() => setEditMaterial(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditMaterial(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="lesson-material-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              Salvar
            </button>
          </>
        }
      >
        <form id="lesson-material-form" onSubmit={saveMaterialEdit}>
          <div className="field">
            <label htmlFor="lmat-kind">Tipo</label>
            <select
              id="lmat-kind"
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
                <label htmlFor="lmat-title">Título</label>
                <input
                  id="lmat-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="lmat-ref">ID do questionário</label>
                <input
                  id="lmat-ref"
                  value={formRefId}
                  onChange={(e) => setFormRefId(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="lmat-url">
                  {formKind === 'LINK' ? 'URL do link' : 'URL do arquivo'}
                </label>
                <input
                  id="lmat-url"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  required
                  placeholder="https://"
                />
              </div>
              <div className="field">
                <label htmlFor="lmat-title">
                  Título {formKind === 'LINK' ? <span className="muted">(opcional)</span> : null}
                </label>
                <input
                  id="lmat-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required={formKind !== 'LINK'}
                />
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}

function AssessmentsStep(props: {
  courseId: string;
  modules: ModuleRow[];
  activities: ActivityRow[];
  quizzes: QuizRow[];
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (v: string | null) => void;
  onNotice: (v: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const [actTitle, setActTitle] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actDue, setActDue] = useState('');
  const [actLate, setActLate] = useState(true);
  const [actModuleId, setActModuleId] = useState(props.modules[0]?.id ?? '');

  const [quizTitle, setQuizTitle] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [quizModuleId, setQuizModuleId] = useState(props.modules[0]?.id ?? '');
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([EMPTY_QUESTION()]);

  useEffect(() => {
    if (!actModuleId && props.modules[0]) setActModuleId(props.modules[0].id);
    if (!quizModuleId && props.modules[0]) setQuizModuleId(props.modules[0].id);
  }, [props.modules, actModuleId, quizModuleId]);

  async function createActivity(e: FormEvent) {
    e.preventDefault();
    if (!actModuleId) {
      props.onError('Selecione o módulo da atividade.');
      return;
    }
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          title: actTitle,
          description: actDesc || undefined,
          moduleId: actModuleId,
          dueDate: actDue ? new Date(actDue).toISOString() : undefined,
          allowLate: actLate,
          rubric: [
            { key: 'clareza', label: 'Clareza', weight: 0.5 },
            { key: 'completude', label: 'Completude', weight: 0.5 },
          ],
        }),
      });
      setActTitle('');
      setActDesc('');
      setActDue('');
      props.onNotice('Atividade criada no módulo selecionado.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao criar atividade'));
    } finally {
      props.onBusy(false);
    }
  }

  async function createQuiz(e: FormEvent) {
    e.preventDefault();
    if (!quizModuleId) {
      props.onError('Selecione o módulo do questionário.');
      return;
    }
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/quizzes`, {
        method: 'POST',
        body: JSON.stringify({
          title: quizTitle,
          description: quizDesc || undefined,
          moduleId: quizModuleId,
          graded: true,
          maxAttempts: 3,
          questions: questions.map((q) => ({
            type: q.type,
            text: q.text,
            points: q.points,
            options:
              q.type === 'MCQ' || q.type === 'TF'
                ? q.options.filter((o) => o.text.trim())
                : undefined,
          })),
        }),
      });
      setQuizTitle('');
      setQuizDesc('');
      setQuestions([EMPTY_QUESTION()]);
      props.onNotice('Questionário criado no módulo selecionado.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao criar questionário'));
    } finally {
      props.onBusy(false);
    }
  }

  async function deleteActivity(id: string, title: string) {
    if (!window.confirm(`Excluir a atividade "${title}"?`)) return;
    props.onBusy(true);
    try {
      await apiFetch(`/activities/${id}`, { method: 'DELETE' });
      props.onNotice('Atividade excluída.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao excluir atividade'));
    } finally {
      props.onBusy(false);
    }
  }

  const [editingActivity, setEditingActivity] = useState<ActivityRow | null>(null);
  const [editActTitle, setEditActTitle] = useState('');
  const [editActDesc, setEditActDesc] = useState('');
  const [editActDue, setEditActDue] = useState('');
  const [editActLate, setEditActLate] = useState(true);
  const [editActModuleId, setEditActModuleId] = useState('');

  const [editingQuiz, setEditingQuiz] = useState<QuizRow | null>(null);
  const [editQuizTitle, setEditQuizTitle] = useState('');
  const [editQuizDesc, setEditQuizDesc] = useState('');
  const [editQuizModuleId, setEditQuizModuleId] = useState('');
  const [editQuizQuestions, setEditQuizQuestions] = useState<QuizQuestionDraft[]>([
    EMPTY_QUESTION(),
  ]);
  const [quizLoading, setQuizLoading] = useState(false);

  function openActivityEdit(activity: ActivityRow) {
    setEditingActivity(activity);
    setEditActTitle(activity.title);
    setEditActDesc(activity.description ?? '');
    setEditActDue(toDatetimeLocal(activity.dueDate));
    setEditActLate(activity.allowLate);
    setEditActModuleId(activity.moduleId ?? props.modules[0]?.id ?? '');
  }

  async function saveActivity(e: FormEvent) {
    e.preventDefault();
    if (!editingActivity) return;
    if (!editActModuleId) {
      props.onError('Selecione o módulo da atividade.');
      return;
    }
    props.onBusy(true);
    try {
      await apiFetch(`/activities/${editingActivity.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editActTitle,
          description: editActDesc || null,
          moduleId: editActModuleId,
          dueDate: editActDue ? new Date(editActDue).toISOString() : null,
          allowLate: editActLate,
        }),
      });
      setEditingActivity(null);
      props.onNotice('Atividade atualizada.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao salvar atividade'));
    } finally {
      props.onBusy(false);
    }
  }

  async function openQuizEdit(quiz: QuizRow) {
    setEditingQuiz(quiz);
    setEditQuizTitle(quiz.title);
    setEditQuizDesc(quiz.description ?? '');
    setEditQuizModuleId(quiz.moduleId ?? props.modules[0]?.id ?? '');
    setEditQuizQuestions([EMPTY_QUESTION()]);
    setQuizLoading(true);
    try {
      const detail = await apiFetch<{
        title: string;
        description: string | null;
        moduleId?: string | null;
        questions: Array<{
          id: string;
          type: QuizQuestionDraft['type'];
          text: string;
          points: number;
          options: Array<{ id: string; text: string; isCorrect?: boolean }>;
        }>;
      }>(`/quizzes/${quiz.id}`);
      setEditQuizTitle(detail.title);
      setEditQuizDesc(detail.description ?? '');
      setEditQuizModuleId(detail.moduleId ?? quiz.moduleId ?? props.modules[0]?.id ?? '');
      const loaded = (detail.questions ?? []).map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        points: q.points ?? 1,
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: Boolean(o.isCorrect),
        })),
      }));
      setEditQuizQuestions(loaded.length ? loaded : [EMPTY_QUESTION()]);
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao carregar o questionário'));
      setEditingQuiz(null);
    } finally {
      setQuizLoading(false);
    }
  }

  async function saveQuiz(e: FormEvent) {
    e.preventDefault();
    if (!editingQuiz) return;
    if (!editQuizModuleId) {
      props.onError('Selecione o módulo do questionário.');
      return;
    }
    props.onBusy(true);
    try {
      await apiFetch(`/quizzes/${editingQuiz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editQuizTitle,
          description: editQuizDesc || null,
          moduleId: editQuizModuleId,
          questions: serializeQuizQuestions(editQuizQuestions),
        }),
      });
      setEditingQuiz(null);
      props.onNotice('Questionário atualizado.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao salvar questionário'));
    } finally {
      props.onBusy(false);
    }
  }

  async function deleteQuiz(id: string, title: string) {
    if (!window.confirm(`Excluir o questionário "${title}"?`)) return;
    props.onBusy(true);
    try {
      await apiFetch(`/quizzes/${id}`, { method: 'DELETE' });
      props.onNotice('Questionário excluído.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao excluir questionário'));
    } finally {
      props.onBusy(false);
    }
  }

  return (
    <>
      <div className="grid-2 assessments-columns">
        <div className="stack">
          <form className="panel" onSubmit={createActivity}>
            <div className="panel-head">
              <h2>Nova atividade</h2>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Módulo</label>
                <select
                  value={actModuleId}
                  onChange={(e) => setActModuleId(e.target.value)}
                  required
                >
                  <option value="">Selecione o módulo…</option>
                  {props.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <p className="hint">A atividade aparece dentro deste módulo na visão do curso.</p>
              </div>
              <div className="field">
                <label>Título</label>
                <input value={actTitle} onChange={(e) => setActTitle(e.target.value)} required />
              </div>
              <div className="field">
                <label>Descrição / enunciado</label>
                <textarea rows={3} value={actDesc} onChange={(e) => setActDesc(e.target.value)} />
              </div>
              <div className="field">
                <label>Prazo</label>
                <input
                  type="datetime-local"
                  value={actDue}
                  onChange={(e) => setActDue(e.target.value)}
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={actLate}
                  onChange={(e) => setActLate(e.target.checked)}
                />
                Permitir entrega atrasada
              </label>
              <button className="btn btn-secondary btn-sm" type="submit" disabled={props.busy}>
                Criar atividade
              </button>
            </div>
          </form>

          <div className="panel">
            <div className="panel-head">
              <h2>Atividades</h2>
            </div>
            {props.activities.map((a) => {
              const mod = props.modules.find((m) => m.id === a.moduleId);
              return (
                <div key={a.id} className="editor-item">
                  <div className="editor-item-main">
                    <h3>{a.title}</h3>
                    <p className="small muted" style={{ margin: 0 }}>
                      {mod ? `Módulo: ${mod.title}` : 'Sem módulo vinculado'}
                    </p>
                    {a.description ? (
                      <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                        {a.description}
                      </p>
                    ) : null}
                    {a.dueDate ? (
                      <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                        Prazo: {formatDate(a.dueDate)}
                      </p>
                    ) : null}
                  </div>
                  <span className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={props.busy}
                      onClick={() => openActivityEdit(a)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger-text"
                      disabled={props.busy}
                      onClick={() => void deleteActivity(a.id, a.title)}
                    >
                      Excluir
                    </button>
                  </span>
                </div>
              );
            })}
            {!props.activities.length ? (
              <div className="empty-state">Nenhuma atividade.</div>
            ) : null}
          </div>
        </div>

        <div className="stack">
          <form className="panel" onSubmit={createQuiz}>
            <div className="panel-head">
              <h2>Novo questionário</h2>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Módulo</label>
                <select
                  value={quizModuleId}
                  onChange={(e) => setQuizModuleId(e.target.value)}
                  required
                >
                  <option value="">Selecione o módulo…</option>
                  {props.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <p className="hint">
                  O questionário aparece dentro deste módulo na visão do curso.
                </p>
              </div>
              <div className="field">
                <label>Título</label>
                <input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} required />
              </div>
              <div className="field">
                <label>Descrição</label>
                <textarea rows={2} value={quizDesc} onChange={(e) => setQuizDesc(e.target.value)} />
              </div>

              {questions.map((q, qi) => (
                <div key={qi} className="question-card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>Questão {qi + 1}</strong>
                    {questions.length > 1 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                  <div className="field">
                    <label>Enunciado</label>
                    <input
                      value={q.text}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === qi ? { ...item, text: e.target.value } : item,
                          ),
                        )
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Tipo</label>
                    <select
                      value={q.type}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === qi
                              ? {
                                  ...item,
                                  type: e.target.value as QuizQuestionDraft['type'],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="MCQ">Múltipla escolha</option>
                      <option value="TF">Verdadeiro / Falso</option>
                      <option value="ESSAY">Dissertativa</option>
                    </select>
                  </div>
                  {(q.type === 'MCQ' || q.type === 'TF') &&
                    q.options.map((opt, oi) => (
                      <div key={oi} className="option-row">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          checked={opt.isCorrect}
                          onChange={() =>
                            setQuestions((prev) =>
                              prev.map((item, i) =>
                                i === qi
                                  ? {
                                      ...item,
                                      options: item.options.map((o, j) => ({
                                        ...o,
                                        isCorrect: j === oi,
                                      })),
                                    }
                                  : item,
                              ),
                            )
                          }
                          aria-label="Resposta correta"
                        />
                        <input
                          type="text"
                          value={opt.text}
                          placeholder={`Opção ${oi + 1}`}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((item, i) =>
                                i === qi
                                  ? {
                                      ...item,
                                      options: item.options.map((o, j) =>
                                        j === oi ? { ...o, text: e.target.value } : o,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          required
                        />
                      </div>
                    ))}
                  {(q.type === 'MCQ' || q.type === 'TF') && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.map((item, i) =>
                            i === qi
                              ? {
                                  ...item,
                                  options: [...item.options, { text: '', isCorrect: false }],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      + Opção
                    </button>
                  )}
                </div>
              ))}

              <div className="row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setQuestions((prev) => [...prev, EMPTY_QUESTION()])}
                >
                  + Questão
                </button>
                <button className="btn btn-primary btn-sm" type="submit" disabled={props.busy}>
                  Criar questionário
                </button>
              </div>
            </div>
          </form>

          <div className="panel">
            <div className="panel-head">
              <h2>Questionários</h2>
            </div>
            {props.quizzes.map((q) => (
              <div key={q.id} className="editor-item">
                <div className="editor-item-main">
                  <h3>{q.title}</h3>
                  <p className="small muted" style={{ margin: 0 }}>
                    {q._count?.questions ?? 0} questão(ões)
                    {q.maxAttempts ? ` · até ${q.maxAttempts} tentativas` : ''}
                  </p>
                </div>
                <span className="cell-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={props.busy}
                    onClick={() => void openQuizEdit(q)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-danger-text"
                    disabled={props.busy}
                    onClick={() => void deleteQuiz(q.id, q.title)}
                  >
                    Excluir
                  </button>
                </span>
              </div>
            ))}
            {!props.quizzes.length ? <div className="empty-state">Nenhum questionário.</div> : null}
          </div>
        </div>
      </div>

      <Modal
        open={editingActivity !== null}
        title={editingActivity ? `Editar ${editingActivity.title}` : 'Editar atividade'}
        onClose={() => setEditingActivity(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditingActivity(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="edit-activity-form"
              className="btn btn-primary"
              disabled={props.busy}
            >
              {props.busy ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="edit-activity-form" onSubmit={saveActivity}>
          <div className="field">
            <label htmlFor="edit-act-module">Módulo</label>
            <select
              id="edit-act-module"
              value={editActModuleId}
              onChange={(e) => setEditActModuleId(e.target.value)}
              required
            >
              <option value="">Selecione o módulo…</option>
              {props.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-act-title">Título</label>
            <input
              id="edit-act-title"
              value={editActTitle}
              onChange={(e) => setEditActTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="edit-act-desc">Descrição / enunciado</label>
            <textarea
              id="edit-act-desc"
              rows={3}
              value={editActDesc}
              onChange={(e) => setEditActDesc(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-act-due">Prazo</label>
            <input
              id="edit-act-due"
              type="datetime-local"
              value={editActDue}
              onChange={(e) => setEditActDue(e.target.value)}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={editActLate}
              onChange={(e) => setEditActLate(e.target.checked)}
            />
            Permitir entrega atrasada
          </label>
        </form>
      </Modal>

      <Modal
        open={editingQuiz !== null}
        title={editingQuiz ? `Editar ${editingQuiz.title}` : 'Editar questionário'}
        onClose={() => setEditingQuiz(null)}
        wide
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditingQuiz(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="edit-quiz-form"
              className="btn btn-primary"
              disabled={props.busy || quizLoading}
            >
              {props.busy ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="edit-quiz-form" onSubmit={saveQuiz}>
          <div className="field">
            <label htmlFor="edit-quiz-module">Módulo</label>
            <select
              id="edit-quiz-module"
              value={editQuizModuleId}
              onChange={(e) => setEditQuizModuleId(e.target.value)}
              required
            >
              <option value="">Selecione o módulo…</option>
              {props.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-quiz-title">Título</label>
            <input
              id="edit-quiz-title"
              value={editQuizTitle}
              onChange={(e) => setEditQuizTitle(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="edit-quiz-desc">Descrição</label>
            <textarea
              id="edit-quiz-desc"
              rows={2}
              value={editQuizDesc}
              onChange={(e) => setEditQuizDesc(e.target.value)}
            />
          </div>
          {quizLoading ? (
            <p className="muted small">Carregando perguntas…</p>
          ) : (
            <QuizQuestionsEditor
              questions={editQuizQuestions}
              onChange={setEditQuizQuestions}
              disabled={props.busy}
            />
          )}
        </form>
      </Modal>
    </>
  );
}

function OfferStep(props: {
  courseId: string;
  teachers: CourseTeacher[];
  enrollments: CourseEnrollment[];
  links: CourseInstitutionLink[];
  institutions: Institution[];
  teacherOptions: UserOption[];
  studentOptions: UserOption[];
  busy: boolean;
  onBusy: (v: boolean) => void;
  onError: (v: string | null) => void;
  onNotice: (v: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [institutionId, setInstitutionId] = useState('');

  const availableTeachers = props.teacherOptions.filter(
    (t) => !props.teachers.some((x) => x.user.id === t.id),
  );
  const availableStudents = props.studentOptions.filter(
    (s) => !props.enrollments.some((e) => e.user.id === s.id),
  );
  const activeLinkIds = props.links.filter((l) => l.active).map((l) => l.institution.id);
  const availableInstitutions = props.institutions.filter((i) => !activeLinkIds.includes(i.id));

  async function assignTeacher(e: FormEvent) {
    e.preventDefault();
    if (!teacherId) return;
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/teachers`, {
        method: 'POST',
        body: JSON.stringify({ teacherUserId: teacherId }),
      });
      setTeacherId('');
      props.onNotice('Professor atribuído.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao atribuir professor'));
    } finally {
      props.onBusy(false);
    }
  }

  async function linkInstitution(e: FormEvent) {
    e.preventDefault();
    if (!institutionId) return;
    props.onBusy(true);
    try {
      const result = await apiFetch<{ studentCount: number }>(
        `/institutions/${institutionId}/courses`,
        {
          method: 'POST',
          body: JSON.stringify({ courseIds: [props.courseId] }),
        },
      );
      setInstitutionId('');
      props.onNotice(`Instituição vinculada — ${result.studentCount} aluno(s) matriculado(s).`);
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao vincular instituição'));
    } finally {
      props.onBusy(false);
    }
  }

  async function enrollStudent(e: FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    props.onBusy(true);
    try {
      await apiFetch(`/courses/${props.courseId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ studentUserId: studentId }),
      });
      setStudentId('');
      props.onNotice('Aluno matriculado.');
      await props.onReload();
    } catch (err) {
      props.onError(errorMessage(err, 'Falha ao matricular'));
    } finally {
      props.onBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Professores</h2>
          </div>
          <form onSubmit={assignTeacher} className="toolbar">
            <SearchableSelect
              options={availableTeachers.map((t) => ({
                id: t.id,
                label: t.name,
                secondary: t.email || t.username,
              }))}
              value={teacherId}
              onChange={setTeacherId}
              placeholder="Buscar professor…"
              disabled={props.busy}
              emptyMessage="Nenhum professor encontrado"
            />
            <button
              className="btn btn-secondary btn-sm"
              type="submit"
              disabled={props.busy || !teacherId}
            >
              Atribuir
            </button>
          </form>
          {props.teachers.map((t) => (
            <div key={t.id} className="editor-item">
              <div className="editor-item-main">
                <strong>{t.user.name}</strong>
                <div className="small muted">{t.user.email}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger-text"
                disabled={props.busy}
                onClick={() =>
                  void (async () => {
                    props.onBusy(true);
                    try {
                      await apiFetch(`/courses/${props.courseId}/teachers/${t.user.id}`, {
                        method: 'DELETE',
                      });
                      props.onNotice('Professor removido.');
                      await props.onReload();
                    } catch (err) {
                      props.onError(errorMessage(err, 'Falha ao remover'));
                    } finally {
                      props.onBusy(false);
                    }
                  })()
                }
              >
                Remover
              </button>
            </div>
          ))}
          {!props.teachers.length ? (
            <div className="empty-state">Nenhum professor atribuído.</div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Instituições</h2>
          </div>
          <form onSubmit={linkInstitution} className="toolbar">
            <SearchableSelect
              options={availableInstitutions.map((i) => ({
                id: i.id,
                label: i.name,
                secondary: i.slug,
              }))}
              value={institutionId}
              onChange={setInstitutionId}
              placeholder="Buscar instituição…"
              disabled={props.busy}
              emptyMessage="Nenhuma instituição encontrada"
            />
            <button
              className="btn btn-secondary btn-sm"
              type="submit"
              disabled={props.busy || !institutionId}
            >
              Vincular
            </button>
          </form>
          {props.links.map((l) => (
            <div key={l.id} className="editor-item">
              <div className="editor-item-main">
                <strong>{l.institution.name}</strong>
                <div className="small muted">
                  {l.active ? 'Ativo' : 'Inativo'} · {formatDate(l.linkedAt)}
                </div>
              </div>
              {l.active ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger-text"
                  disabled={props.busy}
                  onClick={() =>
                    void (async () => {
                      props.onBusy(true);
                      try {
                        await apiFetch(
                          `/institutions/${l.institution.id}/courses/${props.courseId}`,
                          { method: 'DELETE' },
                        );
                        props.onNotice('Instituição desvinculada.');
                        await props.onReload();
                      } catch (err) {
                        props.onError(errorMessage(err, 'Falha ao desvincular'));
                      } finally {
                        props.onBusy(false);
                      }
                    })()
                  }
                >
                  Desvincular
                </button>
              ) : null}
            </div>
          ))}
          {!props.links.length ? (
            <div className="empty-state">Nenhuma instituição vinculada.</div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Turma</h2>
          <span className="badge">{props.enrollments.length}</span>
        </div>
        <form onSubmit={enrollStudent} className="toolbar">
          <SearchableSelect
            options={availableStudents.map((s) => ({
              id: s.id,
              label: s.name,
              secondary: s.email || s.username,
            }))}
            value={studentId}
            onChange={setStudentId}
            placeholder="Buscar aluno…"
            disabled={props.busy}
            emptyMessage="Nenhum aluno encontrado"
          />
          <button
            className="btn btn-secondary btn-sm"
            type="submit"
            disabled={props.busy || !studentId}
          >
            Matricular
          </button>
        </form>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Instituição</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {props.enrollments.map((en) => (
                <tr key={en.id}>
                  <td>
                    <strong>{en.user.name}</strong>
                    <div className="small muted">{en.user.email}</div>
                  </td>
                  <td className="small">{en.institution.name}</td>
                  <td>
                    <span className={en.status === 'ACTIVE' ? 'badge badge-ok' : 'badge'}>
                      {en.status === 'ACTIVE'
                        ? 'Ativo'
                        : en.status === 'INACTIVE'
                          ? 'Inativo'
                          : en.status === 'COMPLETED'
                            ? 'Concluído'
                            : en.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger-text"
                      disabled={props.busy}
                      onClick={() =>
                        void (async () => {
                          props.onBusy(true);
                          try {
                            await apiFetch(`/courses/${props.courseId}/enrollments/${en.user.id}`, {
                              method: 'DELETE',
                            });
                            props.onNotice('Matrícula removida.');
                            await props.onReload();
                          } catch (err) {
                            props.onError(errorMessage(err, 'Falha ao remover'));
                          } finally {
                            props.onBusy(false);
                          }
                        })()
                      }
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!props.enrollments.length ? (
          <div className="empty-state">
            Nenhum aluno matriculado. Vincule uma instituição ou matricule individualmente.
          </div>
        ) : null}
      </div>
    </div>
  );
}
