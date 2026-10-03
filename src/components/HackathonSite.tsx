"use client";

import { useEffect, useRef } from "react";
import { siteMarkup } from "../site-markup";
import { initialiseSpinner } from "../spinner-runtime";

export function HackathonSite() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root.current) return;
    return initialiseSpinner(root.current);
  }, []);

  // This is trusted, deterministic markup from local modules, never user HTML.
  // Render it on the server too, so the full page is present before hydration.
  return <div ref={root} dangerouslySetInnerHTML={{ __html: siteMarkup }} />;
}
