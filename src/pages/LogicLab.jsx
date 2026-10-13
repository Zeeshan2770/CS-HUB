import { useMemo, useState } from 'react';
import { equivalent, truthTable, truthTableSteps } from '../lib/truth.js';
import { evaluateQuantifiers, quantifierSteps } from '../lib/quantifiers.js';
import { Crumbs, PageHead } from '../components/ui.jsx';

const PRESETS = ['p AND q', 'p OR q', 'NOT p', 'p XOR q', 'p -> q', 'p <-> q', '!(p & q)', '(p -> q) & (q -> p)'];
const KIND = { tautology: 'Tautology: true for every input.', contradiction: 'Contradiction: false for every input.', contingency: 'Contingency: true for some inputs and false for others (so it is satisfiable).' };
const tf = (b) => (b ? 'T' : 'F');

function TruthTab() {
  const [expr, setExpr] = useState('p -> q');
  const [steps, setSteps] = useState(false);
  const [err, setErr] = useState('');
  const [made, setMade] = useState('p -> q');
  const table = useMemo(() => { try { setErr(''); return steps ? truthTableSteps(made) : truthTable(made); } catch (e) { setErr(e.message); return null; } }, [made, steps]); // eslint-disable-line react-hooks/exhaustive-deps
  const build = (t) => { const text = t ?? expr; setExpr(text); setMade(text); };
  return (
    <section className="card">
      <form onSubmit={(e) => { e.preventDefault(); build(); }}>
        <label className="field"><span>Logic statement</span><input value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} /></label>
        <div className="row"><button className="btn btn-primary">Build truth table</button>
          <label className="opt inline"><input type="checkbox" checked={steps} onChange={(e) => setSteps(e.target.checked)} /><span>Show every step (one column per part)</span></label></div>
        <div className="row">{PRESETS.map((p) => <button type="button" key={p} className="btn btn-sm" onClick={() => build(p)}>{p}</button>)}</div>
      </form>
      {err && <p className="fielderr" role="alert">{err}</p>}
      {table && !err && (<>
        <div className="tablewrap"><table className="lt tt">
          {steps ? (<>
            <thead><tr>{table.vars.map((v) => <th key={v}>{v}</th>)}{table.labels.map((l, i) => <th key={l} className={i === table.labels.length - 1 ? 'final' : ''}>{l}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{table.vars.map((v) => <td key={v}>{tf(r.env[v])}</td>)}{r.cells.map((c, k) => <td key={k} className={c ? 'tt-t' : 'tt-f'}>{tf(c)}</td>)}</tr>)}</tbody></>) : (<>
            <thead><tr>{table.vars.map((v) => <th key={v}>{v}</th>)}<th>{made}</th></tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{table.vars.map((v) => <td key={v}>{tf(r.env[v])}</td>)}<td className={r.result ? 'tt-t' : 'tt-f'}>{tf(r.result)}</td></tr>)}</tbody></>)}
        </table></div>
        <p><strong>{KIND[table.kind]}</strong></p></>)}
    </section>
  );
}

function EquivTab() {
  const [a, setA] = useState('!(p & q)');
  const [b, setB] = useState('!p | !q');
  const [eq, setEq] = useState(null);
  const [err, setErr] = useState('');
  const compare = () => { try { setEq(equivalent(a, b)); setErr(''); } catch (x) { setEq(null); setErr(x.message); } };
  return (
    <section className="card">
      <h2>Are two statements equivalent?</h2>
      <div className="grid two">
        <label className="field"><span>Statement A</span><input value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} /></label>
        <label className="field"><span>Statement B</span><input value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} /></label>
      </div>
      <button className="btn btn-primary" onClick={compare}>Compare</button>
      {err && <p className="fielderr" role="alert">{err}</p>}
      {eq && (eq.equal ? <p className="feedback ok">Equivalent: they give the same result for every input.</p>
        : <p className="feedback no">Not equivalent. Example: {Object.entries(eq.counterexample).map(([k, v]) => `${k}=${tf(v)}`).join(', ')} gives different results.</p>)}
    </section>
  );
}

const QPRESETS = [['x > 0', '1..5'], ['x > 0', '-2..2'], ['x % 2 == 0', '1..9'], ['prime(x)', '2..10'], ['x * x == 49', '1..10']];

function QuantTab() {
  const [pred, setPred] = useState('x > 0');
  const [dom, setDom] = useState('-2..2');
  const [which, setWhich] = useState('forAll');
  const [k, setK] = useState(0);
  const [err, setErr] = useState('');
  const calc = useMemo(() => {
    try {
      setErr('');
      return { full: evaluateQuantifiers(pred, dom), steps: quantifierSteps(pred, dom, which) };
    } catch (e) { setErr(e.message); return null; }
  }, [pred, dom, which]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = calc ? calc.steps[Math.min(k, calc.steps.length - 1)] : null;
  const set = (p, d) => { setPred(p); setDom(d); setK(0); };
  return (
    <section className="card">
      <h2>For all (∀) and there exists (∃)</h2>
      <p className="muted">Write a statement P(x) about a number x and a domain. Walk through how the quantified statements are decided.</p>
      <div className="grid two">
        <label className="field"><span>P(x), for example x &gt; 0 or even(x) or prime(x)</span><input value={pred} onChange={(e) => { setPred(e.target.value); setK(0); }} spellCheck={false} /></label>
        <label className="field"><span>Domain: a range like 1..10, or a list like 2, 4, 6</span><input value={dom} onChange={(e) => { setDom(e.target.value); setK(0); }} spellCheck={false} /></label>
      </div>
      <div className="row">{QPRESETS.map(([p, d]) => <button key={p + d} className="btn btn-sm" onClick={() => set(p, d)}>{p} over {d}</button>)}</div>
      {err && <p className="fielderr" role="alert">{err}</p>}
      {calc && !err && (<>
        <div className="tablewrap"><table className="lt tt"><thead><tr><th>x</th>{calc.full.rows.map((r) => <th key={r.x}>{r.x}</th>)}</tr></thead>
          <tbody><tr><th scope="row">P(x)</th>{calc.full.rows.map((r, i) => <td key={r.x} className={i < (step?.upto ?? 0) ? (r.value ? 'tt-t' : 'tt-f') : 'unseen'}>{i < (step?.upto ?? 0) ? tf(r.value) : '?'}</td>)}</tr></tbody></table></div>
        <fieldset className="field"><legend>Quantifier to walk through</legend>
          <label className="opt inline"><input type="radio" name="qq" checked={which === 'forAll'} onChange={() => { setWhich('forAll'); setK(0); }} /><span>∀x P(x), for all</span></label>
          <label className="opt inline"><input type="radio" name="qq" checked={which === 'exists'} onChange={() => { setWhich('exists'); setK(0); }} /><span>∃x P(x), there exists</span></label></fieldset>
        <p className="stepnote" role="status" aria-live="polite">{step.text}</p>
        <div className="row"><button className="btn btn-sm" disabled={k === 0} onClick={() => setK(k - 1)}>Back</button>
          <button className="btn btn-sm btn-primary" disabled={k >= calc.steps.length - 1} onClick={() => setK(k + 1)}>Next step</button>
          <button className="btn btn-sm" onClick={() => setK(0)}>Restart</button>
          <button className="btn btn-sm" onClick={() => setK(calc.steps.length - 1)}>Show answer</button></div>
        <div className="grid two">
          <div className="card"><h3>Full result</h3>
            <p>∀x P(x) is <b>{calc.full.forAll.value ? 'true' : 'false'}</b>{!calc.full.forAll.value && <> (counterexample: x = {calc.full.forAll.counterexample})</>}</p>
            <p>∃x P(x) is <b>{calc.full.exists.value ? 'true' : 'false'}</b>{calc.full.exists.value && <> (witness: x = {calc.full.exists.witness})</>}</p></div>
          <div className="card"><h3>Negation rules, checked on this domain</h3>
            <p>¬∀x P(x) is {tf(calc.full.negation.notForAll)}, and ∃x ¬P(x) is {tf(calc.full.negation.existsNot)}: {calc.full.negation.notForAll === calc.full.negation.existsNot ? 'they match.' : 'they differ.'}</p>
            <p>¬∃x P(x) is {tf(calc.full.negation.notExists)}, and ∀x ¬P(x) is {tf(calc.full.negation.forAllNot)}: {calc.full.negation.notExists === calc.full.negation.forAllNot ? 'they match.' : 'they differ.'}</p></div>
        </div></>)}
      <p className="muted small">The domain here is a finite list of numbers, so this shows how quantifiers work. For an infinite domain, a table cannot prove "for all"; you would need a proof.</p>
    </section>
  );
}

export default function LogicLab() {
  const [tab, setTab] = useState('truth');
  const tabs = [['truth', 'Truth tables'], ['equiv', 'Equivalence'], ['quant', 'Quantifiers (∀ and ∃)']];
  return (
    <div className="page">
      <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'Logic lab' }]} />
      <PageHead title="Truth table builder" sub="Use letters for statements. Operators: NOT (! ~), AND (&), OR (|), XOR (^), implies (->), if and only if (<->). Up to 6 variables." />
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'truth' ? <TruthTab /> : tab === 'equiv' ? <EquivTab /> : <QuantTab />}
    </div>
  );
}
