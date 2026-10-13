import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { BRAND } from '../lib/config.js';
import { Empty, ErrorBox, ProgressBar, Spinner } from '../components/ui.jsx';
import { SearchBox } from '../components/Layout.jsx';

const SAMPLE = `class Student:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return "Hello, " + self.name

print(Student("Ayesha").greet())`;

export default function Home() {
  const { profile } = useAuth();
  const { chapters, byChapter, sectionMap, loading, error, reload } = useCatalog();
  const progress = useProgress();
  const resume = profile?.last_section_id && sectionMap[profile.last_section_id] ? profile.last_section_id : null;
  const firstSection = chapters.length ? byChapter[chapters[0].id]?.[0]?.id : null;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <h1>Learn Class 12 Computer Science by running the code, not just reading it.</h1>
          <p className="lead">{BRAND.name} turns your nine chapters into short lessons with a Python lab, logic and network tools, timed practice tests and a revision queue built from your own mistakes.</p>
          <div className="row">
            <Link className="btn btn-primary btn-lg" to={firstSection ? `/lesson/${firstSection}` : '/syllabus'}>Start learning</Link>
            {resume && <Link className="btn btn-lg" to={`/lesson/${resume}`}>Continue where you stopped</Link>}
          </div>
          <SearchBox className="hero-search" />
        </div>
        <figure className="hero-code" aria-label="Example Python program">
          <figcaption>Chapter 3: Object-Oriented Programming</figcaption>
          <pre className="code"><code>{SAMPLE}</code></pre>
          <div className="hero-out"><span>Output</span> Hello, Ayesha</div>
          <Link className="btn btn-sm" to="/labs/python" state={{ code: SAMPLE, title: 'Student class' }}>Run it in the lab</Link>
        </figure>
      </section>

      <section aria-labelledby="syl">
        <div className="pagehead"><h2 id="syl">The nine chapters</h2><Link to="/syllabus">Full syllabus</Link></div>
        {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : chapters.length === 0 ? (
          <Empty title="No chapters are published yet">An administrator needs to publish content first.</Empty>
        ) : (
          <div className="grid chapters">
            {chapters.map((c) => {
              const secs = byChapter[c.id] || [];
              const done = progress.doneCount(secs.map((s) => s.id));
              return (
                <Link key={c.id} to={`/chapter/${c.id}`} className="card chcard">
                  <span className="chnum">{c.number}</span>
                  <h3>{c.title}</h3>
                  <p className="muted">{secs.length} {secs.length === 1 ? 'topic' : 'topics'}</p>
                  <ProgressBar value={done} max={secs.length} label={`${c.title} progress`} />
                  <small className="muted">{done} of {secs.length} completed</small>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="labs">
        <div className="pagehead"><h2 id="labs">Interactive labs</h2><Link to="/labs">All labs</Link></div>
        <div className="grid three">
          <Link className="card" to="/labs/python"><h3>Python lab</h3><p className="muted">Write and run Python in your browser. Good for Chapters 3, 5 and 6.</p></Link>
          <Link className="card" to="/labs/debugger"><h3>Step-through debugger</h3><p className="muted">Run a program one line at a time and watch the variables change (Chapter 5).</p></Link>
          <Link className="card" to="/labs/logic"><h3>Logic lab</h3><p className="muted">Truth tables, equivalence and the quantifiers for all and there exists (Chapter 2).</p></Link>
          <Link className="card" to="/labs/sql"><h3>SQL lab</h3><p className="muted">Practise CRUD on a real SQLite database with checked exercises (Chapter 4).</p></Link>
          <Link className="card" to="/labs/subnet"><h3>Subnet calculator</h3><p className="muted">Work out network, broadcast and host ranges for an IPv4 address (Chapter 1).</p></Link>
        </div>
      </section>

      <section aria-labelledby="rev">
        <h2 id="rev">Practice and revise</h2>
        <div className="grid two">
          <Link className="card" to="/practice"><h3>Practice tests</h3><p className="muted">Untimed practice or a timed test drawn from the chapters you pick. Answers and explanations appear after you submit.</p></Link>
          <Link className="card" to="/revision"><h3>Revision center</h3><p className="muted">Questions you got wrong, ones you marked as difficult, and flashcards from the definitions in your lessons.</p></Link>
        </div>
      </section>
    </div>
  );
}
