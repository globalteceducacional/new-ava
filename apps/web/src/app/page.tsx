import { redirect } from 'next/navigation';

/** Raiz: manda para login (sessão client-side resolve o painel após auth). */
export default function HomePage() {
  redirect('/login');
}
