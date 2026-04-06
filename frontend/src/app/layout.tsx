import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Manrope } from "next/font/google";
import Script from "next/script";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-hand",
});

export const metadata: Metadata = {
  title: "Plotimg",
  description: "Turn portraits into plotter-friendly SVG wave art with a familiar consumer crafting workflow.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable} ${caveat.variable} antialiased`}>
        <Script
          src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.2.0/dist/embed.global.js"
          strategy="afterInteractive"
          data-plotimg-polar-embed="true"
        />
        {children}
      </body>
    </html>
  );
}
