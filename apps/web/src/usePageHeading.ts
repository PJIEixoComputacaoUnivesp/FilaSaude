import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Names the page for the tab and for screen readers, and returns the ref for
 * its `<h1 tabIndex={-1}>`. On client-side navigation focus moves to that
 * heading so the new page is announced. The first load (location key
 * "default") and redirects (REPLACE) keep the browser's own focus.
 */
export function usePageHeading(title: string) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const focusOnMount = useRef(key !== "default" && navigationType !== "REPLACE");

  useEffect(() => {
    document.title = `${title} · FilaSaúde`;
  }, [title]);

  useEffect(() => {
    if (focusOnMount.current) headingRef.current?.focus();
  }, []);

  return headingRef;
}
