import { useEffect, useRef } from "react";

// The first page of a visit keeps the browser's own focus, scroll and
// restoration (a reload or a restored tab included). Every page mounted after
// it comes from a navigation inside the app. This is not read from the router
// location key, because history.state survives a reload.
let isFirstPage = true;

/**
 * Names the page for the tab and for screen readers, and returns the ref for
 * its `<h1 tabIndex={-1}>`. On client-side navigation focus moves to that
 * heading so the new page is announced.
 */
export function usePageHeading(title: string) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusOnMount = useRef(!isFirstPage);

  useEffect(() => {
    document.title = `${title} · FilaSaúde`;
  }, [title]);

  useEffect(() => {
    isFirstPage = false;
    if (focusOnMount.current) headingRef.current?.focus();
  }, []);

  return headingRef;
}
