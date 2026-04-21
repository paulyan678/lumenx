import "./globals.css";
import EnvConfigChecker from "@/components/EnvConfigChecker";
import { Providers } from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="dark">
      <head>
        <title>LumenX Studio</title>
        <meta name="description" content="AI-Native Motion Comic Creation Platform" />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <Providers>
          <EnvConfigChecker />
          {children}
        </Providers>
      </body>
    </html>
  );
}
