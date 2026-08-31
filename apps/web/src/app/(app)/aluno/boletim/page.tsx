import { redirect } from 'next/navigation';

/** Boletim temporariamente fora do menu do aluno. */
export default function BoletimPage() {
  redirect('/aluno');
}
