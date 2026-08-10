import Banner from "../../components/Banner.jsx";

/* Legal, at tender stage.

   A placeholder until somebody says what belongs here. It says so
   rather than rendering nothing: an empty tab leaves the person who
   clicked it unable to tell whether the screen is broken or the project
   simply has no legal work on it. */
export default function LegalTab() {
  return (
    <div>
      <div className="tab-head">
        <div>
          <h3>Legal</h3>
        </div>
      </div>
      <Banner kind="muted">In development.</Banner>
    </div>
  );
}
