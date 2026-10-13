import { Link } from 'react-router-dom';
import { PageHead } from '../components/ui.jsx';

const LABS = [
  ['/labs/python', 'Python lab', 'Write, run and save Python programs. 10-second limit, runs in a separate worker. Chapters 3, 5 and 6. The sqlite3 module works; numpy and pandas load on demand.'],
  ['/labs/debugger', 'Step-through debugger', 'Run a program one line at a time. Watch variables change, set breakpoints and add watch expressions. Chapter 5.'],
  ['/labs/logic', 'Logic lab', 'Truth tables with every step shown, equivalence checks, and a step-by-step evaluator for the quantifiers for all and there exists. Chapter 2.'],
  ['/labs/sql', 'SQL lab', 'Practise CREATE, INSERT, SELECT, UPDATE and DELETE on a real SQLite database, with guided exercises that check your answer. Chapter 4.'],
  ['/labs/subnet', 'Subnet calculator', 'Enter an IPv4 address and prefix length to see the mask, network, broadcast and usable hosts. Chapter 1.'],
];

export default function Labs() {
  return (
    <div className="page">
      <PageHead title="Interactive labs" sub="Each lab matches a topic in the syllabus. Everything runs in your browser." />
      <div className="grid three">
        {LABS.map(([to, t, d]) => <Link key={to} className="card" to={to}><h2>{t}</h2><p className="muted">{d}</p></Link>)}
      </div>
      <div className="card note-card">
        <h2>What is not available</h2>
        <p>Tkinter windows (Chapter 4) and programs that need a MySQL server or <code>input()</code> cannot run in a browser. Those lessons show the code so you can copy it and run it on your own computer. The textbook's <code>sqlite3</code> examples do run in the Python lab.</p>
      </div>
    </div>
  );
}
