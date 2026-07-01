import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Starlight Agent Canvas',
  description: 'Local-first MCP-native research and workflow canvas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
