/**
 * Text confirmation that a write succeeded (UIX-002).
 *
 * Requirement 5.1 asks for success *and* failure to be reported as text rather
 * than colour alone; failures already use `role="alert"`, so successes use the
 * politer `role="status"` and never take focus away from the user's work.
 */
export function StatusBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="status-banner" role="status" data-testid="status-banner">
      {message}
    </p>
  );
}
