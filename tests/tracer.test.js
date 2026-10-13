// @vitest-environment node
// Runs the REAL tracer under the REAL Python (Pyodide, the same engine the browser uses).
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import TRACER from '../src/workers/tracerSource.js';

let py, trace;
beforeAll(async () => {
  const { loadPyodide } = createRequire(import.meta.url)('pyodide');
  py = await loadPyodide();
  py.runPython(TRACER);
  const fn = py.globals.get('run_trace');
  trace = (code, watches = [], max = 400) => JSON.parse(fn(code, JSON.stringify(watches), max));
}, 120000);

describe('python step tracer', () => {
  it('records each executed line and the variables before it runs', () => {
    const r = trace('total = 0\nfor i in range(3):\n    total = total + i\nprint(total)\n');
    expect(r.error).toBeNull();
    expect(r.output).toBe('3\n');
    expect(r.steps[0]).toMatchObject({ line: 1, fn: '<module>', event: 'line' });
    expect(r.steps[0].vars).toEqual({});
    const last = r.steps[r.steps.length - 1];
    expect(last.line).toBe(4);
    expect(last.vars.total).toBe('3');
    expect(r.steps.map((s) => s.line)).toEqual([1, 2, 3, 2, 3, 2, 3, 2, 4]);
  });
  it('follows function calls with depth, locals, globals and return values', () => {
    const r = trace('def area(r):\n    a = 3 * r * r\n    return a\nradius = 2\nprint(area(radius))\n');
    const inside = r.steps.filter((s) => s.fn === 'area');
    expect(inside.map((s) => s.event)).toEqual(['line', 'line', 'return']);
    expect(inside[0].depth).toBe(2);
    expect(inside[0].vars).toEqual({ r: '2' });
    expect(inside[1].vars).toEqual({ r: '2', a: '12' });
    expect(inside[1].globals.radius).toBe('2');
    expect(inside[2].ret).toBe('12');
    expect(r.output).toBe('12\n');
  });
  it('evaluates watch expressions at every step, and survives bad ones', () => {
    const r = trace('x = 2\ny = x * 5\n', ['x + y', 'nope']);
    expect(r.steps[1].watch['nope']).toBe('<NameError>');
    expect(r.steps[1].watch['x + y']).toBe('<NameError>'); // y not defined yet before line 2 runs
    const last = trace('x = 2\ny = x * 5\nz = 0\n', ['x + y']).steps[2];
    expect(last.watch['x + y']).toBe('12');
  });
  it('reports a runtime error with its line and keeps the steps recorded so far', () => {
    const r = trace('a = 10\nb = 0\nprint(a / b)\n');
    expect(r.error).toEqual({ line: 3, message: 'ZeroDivisionError: division by zero' });
    expect(r.steps.map((s) => s.line)).toEqual([1, 2, 3]);
  });
  it('reports syntax errors', () => {
    const r = trace('print("hi"\n');
    expect(r.steps).toEqual([]);
    expect(r.error.message).toMatch(/^SyntaxError/);
  });
  it('stops an endless loop at the step limit, even if the code catches Exception', () => {
    const t0 = Date.now();
    const r = trace('n = 0\nwhile True:\n    try:\n        n = n + 1\n    except Exception:\n        pass\n', [], 50);
    expect(r.truncated).toBe(true);
    expect(r.steps.length).toBe(50);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it('leaves Python in a clean state (tracing switched off) and captures print output in order', () => {
    trace('print("a")\nprint("b")\n');
    expect(py.runPython('import sys; sys.gettrace() is None')).toBe(true);
    const r = trace('print("one")\nprint("two")\n');
    expect(r.steps[1].out).toBe('one\n');
    expect(r.output).toBe('one\ntwo\n');
  });
  it('shows objects and hides functions, classes and modules', () => {
    const r = trace('import math\nclass P:\n    pass\ndef f():\n    pass\nv = [1, 2]\nz = 0\n');
    expect(Object.keys(r.steps[r.steps.length - 1].vars)).toEqual(['v']);
  });
  it('the chapter 5 circle example runs step by step', () => {
    const r = trace('def calculate_area(radius):\n    return 3.14 * radius * radius\nradius = 5\nprint("Area of circle:", calculate_area(radius))\n');
    expect(r.output).toBe('Area of circle: 78.5\n');
    expect(r.steps.some((s) => s.event === 'return' && s.ret === '78.5')).toBe(true);
  });
});
