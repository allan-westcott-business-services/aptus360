import { useEffect, useRef } from "react";
import { HR_CSS } from "./hrStyles.js";
import { mount, showPage, unmount } from "./hrPortal.js";

/* The HR screens are typeset in Inter, with Plus Jakarta Sans for
   headings. Bundled rather than fetched from Google, for the reason
   given in index.html — and imported here rather than in main.jsx so
   they download with this screen instead of on every visit. */
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";

/* Host for the Human Resources screens.

   The screens themselves are not React — see hrPortal.js for why. This
   component's whole job is to give them a pane to draw into, keep that
   pane in step with the sidebar, and tear things down on the way out.

   The two ids matter: hrPortal.js writes pages into #hr-page-content and
   modals into #hr-modal-root, and looks them up by id rather than being
   handed them. They are namespaced because the standalone app called
   them "page-content" and "modal-root", which is exactly the kind of
   name a second feature picks by accident. */
export default function HumanResourcesPage({ page, onNavigate }) {
  /* The callback goes through a ref so that mount() is not re-run every
     time App re-renders and hands us a new function identity. Remounting
     would refetch the page and throw away scroll position and any open
     modal for no reason. */
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;

  useEffect(() => {
    mount(page, (id) => navigate.current?.(id));
    return unmount;
    /* Mount once. The page prop is followed by the effect below, which
       redraws in place rather than tearing the pane down. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Sidebar moved. showPage ignores a page we are already on, which is
     what makes this safe to pair with the mount above and with the
     portal's own internal navigation. */
  useEffect(() => {
    showPage(page);
  }, [page]);

  return (
    <>
      <style>{HR_CSS}</style>
      <div id="hr-root" className="hr-root">
        <div className="hr-page">
          <div id="hr-page-content">
            <div className="hr-boot">Loading&hellip;</div>
          </div>
        </div>
        {/* Outside the scrolling column: modals are fixed to the viewport
            and should not be able to scroll the page behind them. */}
        <div id="hr-modal-root" />
      </div>
    </>
  );
}
