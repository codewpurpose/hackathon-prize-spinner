import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/chewy/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "../style.css";

export const metadata: Metadata = {
  title: "CWP Hackathon · Spin with Koda & Build for Access",
  description: "Spin with Koda, then explore the CodeWithPurpose Build for Access track at Dublin Hacx.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><link rel="describedby" href="/llms.txt" /></head><body>{children}</body></html>;
}
