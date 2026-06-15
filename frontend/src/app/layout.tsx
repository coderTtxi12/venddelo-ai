import type { Metadata } from "next";
import { Karla, Playfair_Display } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";

const karla = Karla({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Vendelo AI",
  description: "Menú digital con IA para restaurantes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${karla.variable} ${playfair.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
