import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Painto - Web Canvas & Drawing App',
  description: 'A feature-rich web canvas and drawing application built with Next.js, Konva, and Supabase.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}

