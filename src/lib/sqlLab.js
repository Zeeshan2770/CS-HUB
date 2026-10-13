// SQL lab content (aligned with Chapter 4: sqlite3, the students table, CREATE / INSERT / SELECT / UPDATE / DELETE, primary key)
export const SETUP_SQL = `CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, grade TEXT);
INSERT INTO students (id, name, age, grade) VALUES
  (1, 'Ayesha', 17, 'A'),
  (2, 'Bilal', 18, 'B'),
  (3, 'Hina', 17, 'A'),
  (4, 'Usman', 19, 'C'),
  (5, 'Sara', 18, 'B'),
  (6, 'Omar', 17, 'B');`;

export const SCHEMA_TEXT = 'students (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, grade TEXT)';

export const EXERCISES = [
  { id: 'read-all', title: 'Read: all records', prompt: 'Show every column of every student.', starter: '-- Write your query here\n', solution: 'SELECT * FROM students;' },
  { id: 'where-text', title: 'Read: filter with WHERE', prompt: 'Show only the name column for students whose grade is A.', starter: '', solution: "SELECT name FROM students WHERE grade = 'A';" },
  { id: 'where-num', title: 'Read: compare numbers', prompt: 'Show the name and age of students who are older than 17.', starter: '', solution: 'SELECT name, age FROM students WHERE age > 17;' },
  { id: 'create', title: 'Create: add a record', prompt: "Insert a new student: id 7, name 'Zain', age 18, grade 'A'.", starter: '', solution: "INSERT INTO students (id, name, age, grade) VALUES (7, 'Zain', 18, 'A');", verify: 'SELECT * FROM students;', note: 'The checker looks at the whole table afterwards.' },
  { id: 'update', title: 'Update: change a record', prompt: "Change Bilal's grade to 'A' (only Bilal's row).", starter: '', solution: "UPDATE students SET grade = 'A' WHERE id = 2;", verify: 'SELECT * FROM students;' },
  { id: 'delete', title: 'Delete: remove a record', prompt: 'Delete the student with id 4. Do not delete anyone else.', starter: '', solution: 'DELETE FROM students WHERE id = 4;', verify: 'SELECT * FROM students;' },
  { id: 'create-table', title: 'Create a table', prompt: "Create a table courses with columns id (INTEGER PRIMARY KEY) and title (TEXT), then insert one row: 1, 'Computer Science'.", starter: '', solution: "CREATE TABLE courses (id INTEGER PRIMARY KEY, title TEXT);\nINSERT INTO courses (id, title) VALUES (1, 'Computer Science');", verify: 'SELECT * FROM courses;' },
  { id: 'primary-key', title: 'Primary key rule', prompt: 'Try to insert a second student with id 1. The database should refuse. Your task passes when the statement fails because of the primary key.', starter: '', expectError: /UNIQUE|PRIMARY KEY/i, solution: "INSERT INTO students (id, name, age, grade) VALUES (1, 'Copy', 17, 'A');" },
];

// Convert the outcome of a script into the result set the checker compares (the LAST result set).
export function lastResult(outcome) {
  if (!outcome || outcome.error) return null;
  const r = outcome.results;
  return r && r.length ? r[r.length - 1] : null;
}

const norm = (v) => (typeof v === 'string' ? v : v === null ? null : Number(v));
const key = (row) => JSON.stringify(row.map(norm));

export function sameResult(a, b, ordered = false) {
  if (!a || !b) return false;
  if (a.columns.length !== b.columns.length) return false;
  if (a.columns.some((c, i) => c.toLowerCase() !== b.columns[i].toLowerCase())) return false;
  const ra = a.values.map(key), rb = b.values.map(key);
  if (ra.length !== rb.length) return false;
  if (!ordered) { ra.sort(); rb.sort(); }
  return ra.every((x, i) => x === rb[i]);
}

// student / expected = { error?, results? } outcomes of running the student's and the reference script on a fresh sample database.
export function judge(ex, student, expected) {
  if (ex.expectError) {
    if (!student.error) return { ok: false, message: 'That statement ran without an error. Look at the primary key rule: every id must be unique.' };
    return ex.expectError.test(student.error)
      ? { ok: true, message: `Correct. The database refused it: ${student.error}` }
      : { ok: false, message: `It failed, but not because of the primary key: ${student.error}` };
  }
  if (student.error) return { ok: false, message: `Your SQL has an error: ${student.error}` };
  const a = lastResult(student), b = lastResult(expected);
  if (!a) return { ok: false, message: ex.verify ? 'Your script did not leave a result to check. Make sure it runs without stopping early.' : 'Your script did not return any rows. Finish with a SELECT query.' };
  if (sameResult(a, b, ex.ordered)) return { ok: true, message: 'Correct. Your result matches the expected result.' };
  const colsOk = a.columns.length === b.columns.length && a.columns.every((c, i) => c.toLowerCase() === b.columns[i].toLowerCase());
  if (!colsOk) return { ok: false, message: `The columns are different. You returned (${a.columns.join(', ')}); the task expects (${b.columns.join(', ')}).` };
  if (a.values.length !== b.values.length) return { ok: false, message: `You returned ${a.values.length} row(s); the task expects ${b.values.length}.` };
  return { ok: false, message: 'The right number of rows, but some values are different. Re-read the task and check your WHERE condition or values.' };
}
