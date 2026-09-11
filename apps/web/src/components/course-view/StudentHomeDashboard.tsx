'use client';

import Link from 'next/link';
import { avatarUrlFor } from '@/lib/auth/session';
import { initials } from '@/lib/auth/nav';
import { CourseCover } from '@/components/course-view/CourseCover';
import { studentLessonHref } from '@/lib/course-view/student-courses';
import type {
  StudentHomeBucket,
  StudentHomePayload,
  StudentHomeRanking,
} from '@/lib/course-view/student-home';
import type { StudentCourseCard } from '@/lib/course-view/student-courses';
import { getStoredUser } from '@/lib/auth/session';

const RING = {
  essentials: { color: '#065f58', label: 'Essenciais para você' },
  recommended: { color: '#0a7c72', label: 'Recomendados pela equipe' },
  explore: { color: '#9fd5cf', label: 'Para explorar' },
} as const;

function MiniCourseCard({ item }: { item: StudentCourseCard }) {
  const tag = item.course.categories[0]?.category.name ?? 'Curso';
  return (
    <Link className="home-course-card" href={studentLessonHref(item)}>
      <CourseCover courseId={item.course.id} className="home-course-thumb">
        <span className="home-course-tag">{tag}</span>
      </CourseCover>
      <strong className="home-course-title">{item.course.title}</strong>
    </Link>
  );
}

function ContinueBlock(props: {
  tone: keyof typeof RING;
  title: string;
  subtitle: string;
  bucket: StudentHomeBucket;
  moreHref: string;
  emptyLabel: string;
}) {
  const preview = props.bucket.items.slice(0, 6);
  const extra = Math.max(0, props.bucket.total - preview.length);
  return (
    <section className="home-continue-block">
      <header className="home-continue-head">
        <span className="home-dot" style={{ background: RING[props.tone].color }} />
        <div>
          <h3>{props.title}</h3>
          <p>{props.subtitle}</p>
        </div>
      </header>
      <p className="home-continue-meta">
        <strong>{props.bucket.percent}%</strong>{' '}
        {props.bucket.completed} finalizados de {props.bucket.total} disponíveis
      </p>
      {preview.length ? (
        <div className="home-course-row">
          {preview.map((item) => (
            <MiniCourseCard key={item.course.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {props.emptyLabel}
        </p>
      )}
      {extra > 0 ? (
        <Link className="home-more" href={props.moreHref}>
          Acessar +{extra} conteúdos →
        </Link>
      ) : null}
    </section>
  );
}

function LearningRings(props: {
  essentials: StudentHomeBucket;
  recommended: StudentHomeBucket;
  explore: StudentHomeBucket;
  hasSchool: boolean;
}) {
  const user = getStoredUser();
  const cx = 140;
  const cy = 140;
  const rings = props.hasSchool
    ? [
        { key: 'explore' as const, r: 112, pct: props.explore.percent },
        { key: 'recommended' as const, r: 86, pct: props.recommended.percent },
        { key: 'essentials' as const, r: 60, pct: props.essentials.percent },
      ]
    : [
        { key: 'explore' as const, r: 112, pct: props.explore.percent },
        { key: 'recommended' as const, r: 86, pct: props.recommended.percent },
      ];

  return (
    <section className="home-learn">
      <h2 className="home-col-title">Meu aprendizado</h2>
      <div className="home-rings">
        <svg viewBox="0 0 280 280" className="home-rings-svg" aria-hidden>
          {rings.map((ring) => {
            const c = 2 * Math.PI * ring.r;
            const pct = Math.min(100, Math.max(0, ring.pct));
            const dash = (pct / 100) * c;
            return (
              <g key={ring.key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={ring.r}
                  fill="none"
                  stroke="#e6eef4"
                  strokeWidth="14"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={ring.r}
                  fill="none"
                  stroke={RING[ring.key].color}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${c}`}
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              </g>
            );
          })}
          {rings.map((ring) => {
            const pct = Math.min(100, Math.max(0, ring.pct));
            const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
            const x = cx + ring.r * Math.cos(angle);
            const y = cy + ring.r * Math.sin(angle);
            return (
              <g key={`${ring.key}-badge`}>
                <circle cx={x} cy={y} r="16" fill="#d8f3ef" stroke="#fff" strokeWidth="2" />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0c1a2a"
                  fontSize="9"
                  fontWeight="700"
                >
                  {pct}%
                </text>
              </g>
            );
          })}
        </svg>
        <div className="home-rings-avatar">
          {user?.hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrlFor(user.id)} alt="" />
          ) : (
            <span>{initials(user?.name ?? 'A')}</span>
          )}
        </div>
      </div>
      <ul className="home-rings-legend">
        {(props.hasSchool
          ? (['essentials', 'recommended', 'explore'] as const)
          : (['recommended', 'explore'] as const)
        ).map((key) => {
          const bucket = props[key];
          return (
            <li key={key}>
              <span className="home-dot" style={{ background: RING[key].color }} />
              <span>{RING[key].label}</span>
              <strong>{bucket.percent}%</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Ranking(props: { rows: StudentHomeRanking[] }) {
  return (
    <section className="home-rank">
      <h2 className="home-col-title">Ranking</h2>
      {!props.rows.length ? (
        <p className="muted small">Conclua cursos da escola para aparecer no ranking.</p>
      ) : (
        <ol className="home-rank-list">
          {props.rows.map((row) => (
            <li
              key={row.id}
              className={`home-rank-item${row.rank === 1 ? ' is-first' : ''}${row.isMe ? ' is-me' : ''}`}
            >
              <span className="home-rank-n">{row.rank}</span>
              <div className="avatar avatar-sm">
                {row.hasAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrlFor(row.id)} alt="" className="avatar-img" />
                ) : (
                  initials(row.name)
                )}
              </div>
              <span className="home-rank-name">{row.name}</span>
              <span className="home-rank-pts">
                {row.points} curso{row.points === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Dashboard inicial do aluno (anéis + continue + ranking). */
export function StudentHomeDashboard({ data }: { data: StudentHomePayload }) {
  const hasSchool = Boolean(data.hasSchool);
  return (
    <div className="student-home">
      <LearningRings
        hasSchool={hasSchool}
        essentials={data.essentials}
        recommended={data.recommended}
        explore={data.explore}
      />
      <div className="home-continue">
        <h2 className="home-col-title">Continue aprendendo</h2>
        {hasSchool ? (
          <ContinueBlock
            tone="essentials"
            title="Essenciais para você"
            subtitle="Cursos obrigatórios da sua instituição."
            bucket={data.essentials}
            moreHref="/aluno/grade"
            emptyLabel="Nenhum curso obrigatório na sua grade ainda."
          />
        ) : null}
        <ContinueBlock
          tone="recommended"
          title="Recomendados pela equipe"
          subtitle="Cursos com categorias parecidas com o que você já assiste."
          bucket={data.recommended}
          moreHref="/aluno/cursos"
          emptyLabel="Assista a uma aula: aqui entram outros cursos da mesma categoria, que você ainda não começou."
        />
        <ContinueBlock
          tone="explore"
          title="Para explorar"
          subtitle="Todo o catálogo disponível para você."
          bucket={data.explore}
          moreHref="/aluno/cursos"
          emptyLabel="Nenhum curso publicado no catálogo no momento."
        />
      </div>
      {hasSchool ? <Ranking rows={data.ranking} /> : null}
    </div>
  );
}
