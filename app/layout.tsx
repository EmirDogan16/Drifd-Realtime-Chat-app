import type { Metadata } from 'next';
import { AuthSessionGuard } from '@/components/auth/auth-session-guard';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drifd',
  description: 'High-performance Discord clone for Web and Windows',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          <AuthSessionGuard />
          {children}
        </Providers>
      </body>
    </html>
  );
}
