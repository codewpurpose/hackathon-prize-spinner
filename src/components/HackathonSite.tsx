"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { AccountGate } from "./AccountGate";
import { siteMarkup } from "../site-markup";
import { initialiseSpinner } from "../spinner-runtime";

export function HackathonSite({ clerkConfigured }: { clerkConfigured: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [gateTarget, setGateTarget] = useState<Element | null>(null);

  useEffect(() => {
    if (!root.current) return;
    const cleanup = initialiseSpinner(root.current);
    setGateTarget(root.current.querySelector(".account-gate-slot"));
    return cleanup;
  }, []);

  // This is trusted, deterministic markup from local modules, never user HTML.
  // Render it on the server too, so the full page is present before hydration.
  const site = <div ref={root} dangerouslySetInnerHTML={{ __html: siteMarkup }} />;
  if (!clerkConfigured) return site;

  return (
    <ClerkProvider
      appearance={{ variables: { colorPrimary: "#254733", colorBackground: "#fffdf5" } }}
    >
      {site}
      {gateTarget ? createPortal(<AccountGate configured />, gateTarget) : null}
    </ClerkProvider>
  );
}
