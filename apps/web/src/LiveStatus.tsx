import { useEffect, useState } from "react";

/**
 * Screen reader announcement for results that change while the user types.
 * The message is held back until typing pauses, so each keystroke does not
 * interrupt the reader. The visible count is rendered separately and updates
 * immediately.
 */
export function LiveStatus({
  message,
  delay = 600,
}: {
  message: string;
  delay?: number;
}) {
  const [announced, setAnnounced] = useState(message);

  useEffect(() => {
    const timeout = setTimeout(() => setAnnounced(message), delay);
    return () => clearTimeout(timeout);
  }, [message, delay]);

  return (
    <p role="status" className="sr-only">
      {announced}
    </p>
  );
}
