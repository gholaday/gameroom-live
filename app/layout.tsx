import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { NavRoot } from "@/lib/nav/react";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Gameroom Live",
  description: "Play retro games with friends, right in the browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-[15px] font-semibold text-text">
        <NavRoot />
        {children}
      </body>
    </html>
  );
}
