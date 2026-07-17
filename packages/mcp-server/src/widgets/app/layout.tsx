import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BruteForce Widgets',
  description: 'NitroStack widgets for the BruteForce MCP server',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
