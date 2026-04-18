import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chief of Staff",
  description: "Your personal thinking system.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Chief of Staff",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F1E8" },
    { media: "(prefers-color-scheme: dark)",  color: "#141210" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", () => {
                  navigator.serviceWorker.register("/sw.js").catch(console.error);
                });
              }
              // Respect system theme on first load
              (function() {
                var m = window.matchMedia("(prefers-color-scheme: dark)");
                if (m.matches) document.documentElement.classList.add("dark");
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
