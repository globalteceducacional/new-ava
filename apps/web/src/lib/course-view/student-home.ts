import type { StudentCourseCard } from '@/lib/course-view/student-courses';

export type StudentHomeBucket = {
  items: StudentCourseCard[];
  total: number;
  completed: number;
  percent: number;
};

export type StudentHomeRanking = {
  rank: number;
  id: string;
  name: string;
  hasAvatar: boolean;
  points: number;
  isMe: boolean;
};

export type StudentHomePayload = {
  /** Aluno com escola real (não só catálogo livre). */
  hasSchool?: boolean;
  essentials: StudentHomeBucket;
  recommended: StudentHomeBucket;
  explore: StudentHomeBucket;
  ranking: StudentHomeRanking[];
};
