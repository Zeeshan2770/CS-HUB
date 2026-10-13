// @vitest-environment node
// Tkinter, mysql.connector and matplotlib stand-ins, exercised through the real worker and real Pyodide.
import { describe, it, expect, beforeAll } from 'vitest';
import { startPyWorker, haveEngine } from './helpers/pyWorker.js';
import { ev, validateTree } from '../src/lib/tkTree.js';

const d = haveEngine ? describe : describe.skip;
const find = (n, pred) => (pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean));
const all = (n, out = []) => { out.push(n); n.children.forEach((c) => all(c, out)); return out; };
const byText = (tree, t) => find(tree, (n) => n.props?.text === t);

d('tkinter stand-in (real Pyodide)', () => {
  let w;
  beforeAll(async () => { w = await startPyWorker(); }, 120000);

  const COUNTER = `
import tkinter as tk
from tkinter import messagebox

root = tk.Tk()
root.title("Greeter")
root.geometry("320x200")

tk.Label(root, text="Enter your name:", font=("Arial", 12)).pack(pady=5)
entry = tk.Entry(root, width=20)
entry.pack()
result = tk.Label(root, text="")
result.pack()

def greet():
    name = entry.get().strip()
    if not name:
        messagebox.showerror("Error", "Please type a name")
        return
    result.config(text="Hello, " + name + "!")
    messagebox.showinfo("Greeting", "Hello " + name)

tk.Button(root, text="Greet", command=greet).pack(pady=5)
root.mainloop()
`;

  it('draws the textbook-style window as a well-formed tree', async () => {
    const m = await w.run(COUNTER);
    expect(m.at(-1).type).toBe('done');
    const s = w.lastTk(m);
    expect(validateTree(s.tree)).toEqual([]);
    expect(s.tree.kind).toBe('tk');
    expect(s.tree.props).toEqual({ title: 'Greeter', geometry: '320x200' });
    expect(s.mainloop).toBe(true);
    const kinds = s.tree.children.map((c) => c.kind);
    expect(kinds).toEqual(['label', 'entry', 'label', 'button']);
    expect(s.tree.children[0].geo).toEqual({ m: 'pack', o: { pady: 5 } });
    expect(s.tree.children[0].style.font).toEqual(['Arial', 12]);
  }, 150000);

  it('Button click runs the command, which reads the Entry and updates the Label (full event loop)', async () => {
    const m0 = await w.run(COUNTER);
    const t0 = w.lastTk(m0).tree;
    const entry = find(t0, (n) => n.kind === 'entry'), button = byText(t0, 'Greet');
    await w.event(ev.input(entry.id, 'Ayesha'));
    const m = await w.event(ev.click(button.id));
    const s = w.lastTk(m);
    const result = s.tree.children[2];
    expect(result.props.text).toBe('Hello, Ayesha!');
    expect(s.alerts).toEqual([{ kind: 'info', title: 'Greeting', message: 'Hello Ayesha', note: '' }]);
  }, 150000);

  it('shows an error dialog when the Entry is empty (messagebox.showerror)', async () => {
    const t0 = w.lastTk(await w.run(COUNTER)).tree;
    const s = w.lastTk(await w.event(ev.click(byText(t0, 'Greet').id)));
    expect(s.alerts[0]).toMatchObject({ kind: 'error', title: 'Error', message: 'Please type a name' });
    expect(s.tree.children[2].props.text).toBe('');
  }, 150000);

  it('runs a callback error as a Python traceback in the console, and stays alive', async () => {
    const t0 = w.lastTk(await w.run('import tkinter as tk\nroot = tk.Tk()\ndef boom():\n    print(1/0)\ntk.Button(root, text="Go", command=boom).pack()\nroot.mainloop()\n')).tree;
    const before = w.posted.length;
    await w.event(ev.click(find(t0, (n) => n.kind === 'button').id));
    const out = w.text(w.posted.slice(before));
    expect(out).toMatch(/ZeroDivisionError/);
    const s2 = w.lastTk(await w.event(ev.click(find(t0, (n) => n.kind === 'button').id)));
    expect(s2.tree).not.toBeNull();
  }, 150000);

  it('supports grid layout, StringVar, Checkbutton, Radiobutton, Scale and Listbox', async () => {
    const code = `
from tkinter import *
root = Tk()
v = StringVar(value="start")
Label(root, textvariable=v).grid(row=0, column=0, columnspan=2, sticky="w")
agree = IntVar()
Checkbutton(root, text="I agree", variable=agree, command=lambda: v.set("agree=" + str(agree.get()))).grid(row=1, column=0)
choice = StringVar(value="a")
Radiobutton(root, text="A", variable=choice, value="a", command=lambda: v.set("pick " + choice.get())).grid(row=2, column=0)
Radiobutton(root, text="B", variable=choice, value="b", command=lambda: v.set("pick " + choice.get())).grid(row=2, column=1)
s = Scale(root, from_=0, to=10, orient=HORIZONTAL, command=lambda x: v.set("scale " + x))
s.grid(row=3, column=0, columnspan=2)
lb = Listbox(root)
for name in ["Ali", "Sara", "Omar"]: lb.insert(END, name)
lb.grid(row=4, column=0)
Button(root, text="Show", command=lambda: v.set(lb.get(lb.curselection()[0]))).grid(row=4, column=1)
root.columnconfigure(0, weight=1)
root.mainloop()
`;
    const s0 = w.lastTk(await w.run(code));
    expect(validateTree(s0.tree)).toEqual([]);
    const lab = s0.tree.children[0];
    expect(lab.props.text).toBe('start');
    expect(lab.geo).toEqual({ m: 'grid', o: { row: 0, column: 0, columnspan: 2, sticky: 'w' } });
    expect(s0.tree.cols).toEqual({ '0': 1 });
    const chk = find(s0.tree, (n) => n.kind === 'checkbutton'), radios = all(s0.tree).filter((n) => n.kind === 'radiobutton');
    expect(radios.map((r) => r.props.checked)).toEqual([true, false]);
    expect(radios[0].props.group).toBe(radios[1].props.group);
    let s = w.lastTk(await w.event(ev.change(chk.id, true)));
    expect(s.tree.children[0].props.text).toBe('agree=1');
    expect(find(s.tree, (n) => n.kind === 'checkbutton').props.checked).toBe(true);
    s = w.lastTk(await w.event(ev.change(radios[1].id, true)));
    expect(s.tree.children[0].props.text).toBe('pick b');
    expect(all(s.tree).filter((n) => n.kind === 'radiobutton').map((r) => r.props.checked)).toEqual([false, true]);
    const sc = find(s.tree, (n) => n.kind === 'scale');
    expect(sc.props).toMatchObject({ min: 0, max: 10, orient: 'horizontal' });
    s = w.lastTk(await w.event(ev.change(sc.id, 7)));
    expect(s.tree.children[0].props.text).toBe('scale 7');
    const lb = find(s.tree, (n) => n.kind === 'listbox');
    expect(lb.props.items).toEqual(['Ali', 'Sara', 'Omar']);
    await w.event(ev.change(lb.id, [1]));
    s = w.lastTk(await w.event(ev.click(byText(s.tree, 'Show').id)));
    expect(s.tree.children[0].props.text).toBe('Sara');
  }, 150000);

  it('Entry methods behave like Tk: insert, delete(0, END), get, show, textvariable', async () => {
    const code = `
import tkinter as tk
root = tk.Tk()
e = tk.Entry(root, show="*")
e.insert(0, "secret")
e.insert(tk.END, "123")
e.delete(0, 2)
sv = tk.StringVar()
e2 = tk.Entry(root, textvariable=sv)
sv.set("typed")
print(e.get(), "|", e2.get())
e2.delete(0, tk.END)
print(repr(sv.get()))
t = tk.Text(root)
t.insert("1.0", "line one\\nline two")
print(repr(t.get("1.0", tk.END)), repr(t.get("1.0", "end-1c")))
t.delete("1.0", tk.END)
print(repr(t.get("1.0", "end-1c")))
root.mainloop()
`;
    const m = await w.run(code);
    expect(w.text(m)).toBe("cret123 | typed\n''\n'line one\\nline two\\n' 'line one\\nline two'\n''\n");
    expect(find(w.lastTk(m).tree, (n) => n.kind === 'entry').props.show).toBe('*');
  }, 150000);

  it('place, Frame nesting, LabelFrame, Toplevel and unknown options are accepted', async () => {
    const code = `
import tkinter as tk
from tkinter import ttk
root = tk.Tk()
f = tk.Frame(root, bg="lightblue", width=200, height=100, bd=2, relief=tk.SUNKEN)
f.pack(fill=tk.BOTH, expand=True, padx=(5, 10))
tk.Label(f, text="inside", bg="yellow", fg="red").place(x=10, y=20)
lf = tk.LabelFrame(root, text="Group")
lf.pack(side=tk.LEFT)
ttk.Button(lf, text="Styled", cursor="hand2", takefocus=0).pack()
cb = ttk.Combobox(root, values=["x", "y"])
cb.pack()
cb.current(1)
top = tk.Toplevel(root)
top.title("Second")
tk.Label(top, text="child window").pack()
root.mainloop()
`;
    const s = w.lastTk(await w.run(code));
    expect(validateTree(s.tree)).toEqual([]);
    const frame = s.tree.children[0];
    expect(frame.geo.o).toMatchObject({ fill: 'both', expand: true, padx: [5, 10] });
    expect(frame.children[0].geo).toEqual({ m: 'place', o: { x: 10, y: 20 } });
    expect(frame.style).toMatchObject({ bg: 'lightblue', relief: 'sunken', bd: 2 });
    expect(find(s.tree, (n) => n.kind === 'combobox').props).toEqual({ values: ['x', 'y'], value: 'y' });
    const top = s.tree.children.find((c) => c.kind === 'toplevel');
    expect(top.props.title).toBe('Second');
    expect(top.children[0].props.text).toBe('child window');
  }, 150000);

  it('after() produces a timer that fires the callback (animation / clock loops)', async () => {
    const code = `
import tkinter as tk
root = tk.Tk()
count = tk.IntVar(value=0)
lbl = tk.Label(root, textvariable=count)
lbl.pack()
def tick():
    count.set(count.get() + 1)
    if count.get() < 3:
        root.after(10, tick)
root.after(10, tick)
root.mainloop()
`;
    const m = await w.run(code);
    expect(w.lastTk(m).tree.children[0].props.text).toBe('0');
    await new Promise((r) => setTimeout(r, 400));
    const last = w.lastTk(w.posted);
    expect(last.tree.children[0].props.text).toBe('3');
  }, 150000);

  it('key and mouse bindings reach the Python handlers (bind)', async () => {
    const code = `
import tkinter as tk
root = tk.Tk()
msg = tk.Label(root, text="-")
msg.pack()
c = tk.Canvas(root, width=100, height=100)
c.pack()
c.create_rectangle(10, 10, 50, 50, fill="red")
c.create_text(30, 70, text="hi")
def on_key(e): msg.config(text="key:" + e.keysym)
def on_click(e): msg.config(text="click:%d,%d" % (e.x, e.y))
root.bind("<Return>", on_key)
c.bind("<Button-1>", on_click)
root.mainloop()
`;
    const s0 = w.lastTk(await w.run(code));
    const canvas = find(s0.tree, (n) => n.kind === 'canvas');
    expect(canvas.binds).toEqual(['<Button-1>']);
    expect(canvas.props.items.map((i) => i.type)).toEqual(['rect', 'text']);
    expect(s0.tree.binds).toEqual(['<Return>']);
    let s = w.lastTk(await w.event(ev.mouse(canvas.id, 33, 44)));
    expect(s.tree.children[0].props.text).toBe('click:33,44');
    s = w.lastTk(await w.event(ev.key(canvas.id, 'Return', '\r'))); // bubbles from canvas up to the window
    expect(s.tree.children[0].props.text).toBe('key:Return');
  }, 150000);

  it('closing the window destroys it, honouring WM_DELETE_WINDOW', async () => {
    const t0 = w.lastTk(await w.run('import tkinter as tk\nroot = tk.Tk()\ntk.Label(root, text="x").pack()\nroot.mainloop()\n')).tree;
    const s = w.lastTk(await w.event(ev.close(t0.id)));
    expect(s.closed).toBe(true);
    expect(s.tree).toBeNull();
  }, 150000);

  it('unsupported blocking dialogs answer automatically and say so', async () => {
    const m = await w.run('import tkinter as tk\nfrom tkinter import messagebox\nroot = tk.Tk()\nprint(messagebox.askyesno("Quit", "Sure?"))\nroot.mainloop()\n');
    expect(w.text(m)).toBe('True\n');
    expect(w.lastTk(m).alerts[0].note).toMatch(/answered automatically/);
  }, 150000);

  it('import tkinter.messagebox and from tkinter import ttk both work', async () => {
    const m = await w.run('import tkinter\nimport tkinter.messagebox as mb\nfrom tkinter import ttk\nprint(mb.showinfo("a", "b"), ttk.Button.__name__)\n');
    expect(m.at(-1).type).toBe('done');
    expect(w.text(m)).toBe('ok Button\n');
  }, 150000);
});

d('mysql.connector stand-in (real Pyodide, runs on SQLite)', () => {
  let w;
  beforeAll(async () => { w = await startPyWorker(); }, 120000);
  it('typical classroom CRUD program works', async () => {
    const code = `
import mysql.connector
from mysql.connector import Error

db = mysql.connector.connect(host="localhost", user="root", password="pw", database="school")
cur = db.cursor()
cur.execute("CREATE TABLE IF NOT EXISTS students (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, age INT)")
cur.execute("INSERT INTO students (name, age) VALUES (%s, %s)", ("Ayesha", 17))
cur.executemany("INSERT INTO students (name, age) VALUES (%s, %s)", [("Bilal", 18), ("Hina", 17)])
db.commit()
print("last id:", cur.lastrowid)
cur.execute("SELECT * FROM students WHERE age = %s ORDER BY id", (17,))
print(cur.fetchall())
cur.execute("UPDATE students SET age = %s WHERE name = %s", (19, "Bilal"))
print("updated:", cur.rowcount)
cur.execute("DELETE FROM students WHERE id = %s", (1,))
cur2 = db.cursor(dictionary=True)
cur2.execute("SELECT name, age FROM students")
for row in cur2: print(row)
cur.execute("SHOW TABLES"); print(cur.fetchall())
try:
    cur.execute("SELECT * FROM ghosts")
except Error as e:
    print("Error:", e)
db.close()
print(db.is_connected())
`;
    const m = await w.run(code);
    expect(m.at(-1).type).toBe('done');
    expect(w.text(m)).toBe([
      'last id: 1',
      "[(1, 'Ayesha', 17), (3, 'Hina', 17)]",
      'updated: 1',
      "{'name': 'Bilal', 'age': 19}",
      "{'name': 'Hina', 'age': 17}",
      "[('students',)]",
      "Error: 1146 (42S02): Table 'ghosts' doesn't exist",
      'False', '',
    ].join('\n'));
  }, 150000);
  it('duplicate keys and bad SQL raise MySQL-style errors', async () => {
    const m = await w.run(`
import mysql.connector
db = mysql.connector.connect(database="t")
c = db.cursor()
c.execute("CREATE TABLE a (id INT PRIMARY KEY)")
c.execute("INSERT INTO a VALUES (1)")
try: c.execute("INSERT INTO a VALUES (1)")
except mysql.connector.IntegrityError as e: print("dup", e.errno)
try: c.execute("SELEC 1")
except mysql.connector.ProgrammingError as e: print("syntax", e.errno)
try: c.execute("INSERT INTO a VALUES (2) ON DUPLICATE KEY UPDATE id = 3")
except mysql.connector.NotSupportedError as e: print("unsupported")
`);
    expect(w.text(m)).toBe('dup 1062\nsyntax 1064\nunsupported\n');
  }, 150000);
  it('states clearly that it is not a MySQL server', async () => {
    const m = await w.run('import mysql.connector\nprint(mysql.connector.__version__)\n');
    expect(w.text(m)).toBe('browser-standin\n');
  }, 150000);
});

d('matplotlib charts (real Pyodide)', () => {
  let w;
  beforeAll(async () => { w = await startPyWorker(); }, 120000);
  it('plt.show() sends a real PNG image to the page', async () => {
    const m = await w.run('import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [2, 4, 9])\nplt.title("Marks")\nplt.show()\nprint("shown")\n');
    expect(m.at(-1).type).toBe('done');
    const f = m.find((x) => x.type === 'figures');
    expect(f.images).toHaveLength(1);
    expect(f.images[0]).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(Buffer.from(f.images[0].split(',')[1], 'base64').length).toBeGreaterThan(3000);
    expect(w.text(m)).toBe('shown\n');
  }, 250000);
  it('figures left open at the end are still shown; several figures are all captured', async () => {
    const m = await w.run('import matplotlib.pyplot as plt\nplt.figure(); plt.bar(["a","b"], [3, 5])\nplt.figure(); plt.hist([1,2,2,3,3,3])\n');
    expect(m.find((x) => x.type === 'figures').images).toHaveLength(2);
  }, 250000);
  it('works together with pandas/numpy (Chapter 6 style)', async () => {
    const m = await w.run('import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\ndf = pd.DataFrame({"x": np.arange(5), "y": np.arange(5) ** 2})\ndf.plot(x="x", y="y")\nplt.show()\n');
    expect(m.at(-1).type).toBe('done');
    expect(m.find((x) => x.type === 'figures').images).toHaveLength(1);
  }, 300000);
});
