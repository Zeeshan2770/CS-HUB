// @vitest-environment node
// Runs every exercise against real SQLite (sql.js), the same engine the lab uses in the browser.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { EXERCISES, SETUP_SQL, judge, sameResult, lastResult } from '../src/lib/sqlLab.js';

let SQL;
beforeAll(async () => { SQL = await createRequire(import.meta.url)('sql.js')(); });

function fresh(sql) {
  const db = new SQL.Database();
  try {
    db.exec(SETUP_SQL);
    const raw = db.exec(sql);
    return { results: raw.map((r) => ({ columns: r.columns, values: r.values })) };
  } catch (e) { return { error: String(e.message) }; } finally { db.close(); }
}
const attempt = (ex, student) => judge(ex, fresh(student + '\n;\n' + (ex.verify || '')), ex.expectError ? null : fresh(ex.solution + '\n;\n' + (ex.verify || '')));
const ex = (id) => EXERCISES.find((e) => e.id === id);

describe('SQL lab exercises (real SQLite)', () => {
  it('sample database loads: 6 students', () => {
    expect(fresh('SELECT count(*) FROM students;').results[0].values[0][0]).toBe(6);
  });
  it.each(EXERCISES.map((e) => [e.id]))('reference solution passes: %s', (id) => {
    const e = ex(id);
    const r = attempt(e, e.solution);
    expect(r.message).toMatch(/Correct/);
    expect(r.ok).toBe(true);
  });
  it('accepts different but equivalent queries', () => {
    expect(attempt(ex('read-all'), 'select id, name, age, grade from students').ok).toBe(true); // listing the same columns is fine
    expect(attempt(ex('read-all'), 'SELECT * FROM students ORDER BY name DESC;').ok).toBe(true);
    expect(attempt(ex('where-text'), "SELECT name FROM students WHERE grade='A' ORDER BY name").ok).toBe(true);
    expect(attempt(ex('update'), "UPDATE students SET grade='A' WHERE name='Bilal';").ok).toBe(true);
    expect(attempt(ex('create'), "INSERT INTO students VALUES (7,'Zain',18,'A');").ok).toBe(true);
  });
  it('rejects wrong answers with helpful messages', () => {
    expect(attempt(ex('where-text'), 'SELECT * FROM students;').message).toMatch(/columns are different/);
    expect(attempt(ex('where-num'), 'SELECT name, age FROM students WHERE age >= 17;').message).toMatch(/expects 3/);
    expect(attempt(ex('where-text'), "SELECT name FROM students WHERE grade = 'B';").message).toMatch(/values are different|row/);
    expect(attempt(ex('update'), "UPDATE students SET grade='A';").ok).toBe(false);          // forgot WHERE: changes everyone
    expect(attempt(ex('delete'), 'DELETE FROM students;').ok).toBe(false);                   // deletes everyone
    expect(attempt(ex('read-all'), 'SELEC * FROM students;').message).toMatch(/error/);
    expect(attempt(ex('read-all'), '-- nothing').message).toMatch(/did not return any rows/);
    expect(attempt(ex('create-table'), 'CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO courses VALUES (1,\'Computer Science\');').message).toMatch(/columns are different/);
  });
  it('primary key exercise: passes only on a primary-key failure', () => {
    const e = ex('primary-key');
    expect(attempt(e, "INSERT INTO students (id, name, age, grade) VALUES (99, 'New', 17, 'A');").ok).toBe(false);
    expect(attempt(e, 'INSERT INTO nope VALUES (1);').message).toMatch(/not because of the primary key/);
    expect(attempt(e, "INSERT INTO students VALUES (1, 'Dup', 17, 'A');").ok).toBe(true);
  });
  it('each check starts from a fresh database (earlier changes do not leak)', () => {
    fresh("DELETE FROM students;");
    expect(fresh('SELECT count(*) FROM students;').results[0].values[0][0]).toBe(6);
  });
  it('result comparison ignores row order unless required, and compares numbers sensibly', () => {
    const a = { columns: ['n'], values: [[1], [2]] }, b = { columns: ['N'], values: [[2], [1]] };
    expect(sameResult(a, b)).toBe(true);
    expect(sameResult(a, b, true)).toBe(false);
    expect(lastResult({ results: [] })).toBeNull();
  });
});
