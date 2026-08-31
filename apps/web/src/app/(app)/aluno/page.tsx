import { redirect } from 'next/navigation';

/** Inscrição opcional removida — o aluno só assiste. */
export default function AlunoHomePage() {
  redirect('/aluno/cursos');
}
