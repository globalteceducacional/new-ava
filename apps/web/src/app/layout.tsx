import type { Metadata } from 'next';
import { IBM_Plex_Sans, Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'AVA Globaltec',
  description: 'Ambiente Virtual de Aprendizagem',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${sora.variable} ${ibmPlex.variable} bg-mesh`}>{children}</body>
    </html>
  );
}
