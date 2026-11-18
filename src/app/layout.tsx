import PWARegister from "@/components/PWARegister";
import GlobalLoading from "@/components/GlobalLoading";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest?v=kidy-neon-20261118",
  icons: {
    icon: [
      { url: "/icon-kidy-sales-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-kidy-sales-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-kidy-sales-180.png", sizes: "180x180", type: "image/png" }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KIDY Sales",
  },
  title: "KIDY Sales Intelligence",
  description: "Plataforma de inteligencia comercial Kidy",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalLoading />{children}<PWARegister /></body>
    </html>
  );
}

