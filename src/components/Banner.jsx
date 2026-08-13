/* A message across the top of a screen.

   ── Dismissable where it can be ──

   An error stays until something changes it, which is right for one
   that has just happened and wrong for one that has been read: a banner
   nobody can clear sits over the work for the rest of the session, and
   the only way to shift it was to cause another one.

   So a banner given an onClose carries a cross. Four screens were
   already passing one on the assumption it did something — it did not,
   and they had been quietly ignoring it.

   Without an onClose there is no cross, because a message nobody can
   dismiss should not offer a control that does nothing. */
export default function Banner({ kind = "muted", children, onClose }) {
  return (
    <div className={`banner ${kind}`}>
      <span className="banner-text">{children}</span>
      {onClose && (
        <button type="button" className="banner-x" onClick={onClose}
          aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
}
