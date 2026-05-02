import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luhux Token Control",
  description: "Discord token ve ses yonetimi icin kontrol paneli."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
