import type { Metadata } from "next";
import { Caveat, Fraunces, Manrope } from "next/font/google";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable} ${caveat.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
