// Python source: an in-browser stand-in for tkinter. It builds a description of the window (a widget tree) and
// handles events sent back from the page. It is NOT real Tk: layout is approximated and some features are missing.
export default String.raw`
import sys, types, json, itertools, traceback

_ids = itertools.count(1)
_S = {'root': None, 'alerts': [], 'timers': [], 'afters': {}, 'tokens': itertools.count(1), 'closed': False, 'registry': {}}

class TclError(Exception):
    pass

N='n'; S='s'; E='e'; W='w'; NW='nw'; NE='ne'; SW='sw'; SE='se'; NS='ns'; EW='ew'; NSEW='nsew'; CENTER='center'
LEFT='left'; RIGHT='right'; TOP='top'; BOTTOM='bottom'; BOTH='both'; X='x'; Y='y'; NONE='none'
END='end'; INSERT='insert'; DISABLED='disabled'; NORMAL='normal'; ACTIVE='active'; HORIZONTAL='horizontal'; VERTICAL='vertical'
WORD='word'; CHAR='char'; RAISED='raised'; SUNKEN='sunken'; FLAT='flat'; GROOVE='groove'; RIDGE='ridge'; SOLID='solid'
SINGLE='single'; BROWSE='browse'; MULTIPLE='multiple'; EXTENDED='extended'; ANCHOR='anchor'; SEL='sel'
YES = True; NO = False; TRUE = True; FALSE = False

_ALIASES = {'background': 'bg', 'foreground': 'fg', 'borderwidth': 'bd', 'textvar': 'textvariable', 'cursor': '_cursor'}

def _touch():
    pass

def _norm(opts):
    out = {}
    for k, v in opts.items():
        out[_ALIASES.get(k, k)] = v
    return out

# ---------------- variables ----------------
class Variable:
    _default = ''
    def __init__(self, master=None, value=None, name=None):
        self._v = self._coerce(self._default if value is None else value)
        self._traces = []
    def _coerce(self, v):
        return v
    def get(self):
        return self._v
    def set(self, v):
        self._v = self._coerce(v)
        for cb in list(self._traces):
            try: cb('PY_VAR', '', 'write')
            except TypeError: cb()
    def trace_add(self, mode, cb):
        self._traces.append(cb); return 'trace' + str(len(self._traces))
    trace = trace_variable = trace_add
    def trace_remove(self, mode, name): pass
class StringVar(Variable):
    _default = ''
    def _coerce(self, v): return str(v)
class IntVar(Variable):
    _default = 0
    def _coerce(self, v):
        try: return int(v)
        except (TypeError, ValueError):
            try: return int(float(v))
            except (TypeError, ValueError): raise TclError('expected integer but got "' + str(v) + '"')
class DoubleVar(Variable):
    _default = 0.0
    def _coerce(self, v):
        try: return float(v)
        except (TypeError, ValueError): raise TclError('expected floating-point number but got "' + str(v) + '"')
class BooleanVar(Variable):
    _default = False
    def _coerce(self, v): return bool(v)

# ---------------- events ----------------
class Event:
    def __init__(self, widget=None, **kw):
        self.widget = widget; self.x = 0; self.y = 0; self.char = ''; self.keysym = ''; self.num = 0; self.keycode = 0
        self.__dict__.update(kw)

def _default_root():
    if _S['root'] is None:
        Tk()
    return _S['root']

def _pad(v):
    if isinstance(v, (tuple, list)): return [int(x) for x in v][:2]
    return [int(v), int(v)] if v is not None else [0, 0]

# ---------------- widgets ----------------
class Misc:
    _kind = 'frame'
    _geom_container = True
    def __init__(self, master=None, cnf=None, **kw):
        self._id = next(_ids)
        self._opts = {}
        self._children = []
        self._geo = None
        self._binds = {}
        self._destroyed = False
        self._rowconf = {}; self._colconf = {}
        o = dict(cnf or {}); o.update(kw)
        self._opts.update(_norm(o))
        self.master = master if master is not None else (_default_root() if self._kind not in ('tk',) else None)
        if self.master is not None:
            self.master._children.append(self)
        _S['registry'][self._id] = self
        self._setup()
    def _setup(self): pass
    # ---- options ----
    def configure(self, cnf=None, **kw):
        if cnf is None and not kw:
            return dict(self._opts)
        o = dict(cnf or {}); o.update(kw)
        for k, v in _norm(o).items():
            self._set_opt(k, v)
    config = configure
    def _set_opt(self, k, v):
        self._opts[k] = v
    def cget(self, k): return self._opts.get(_ALIASES.get(k, k))
    def __getitem__(self, k): return self.cget(k)
    def __setitem__(self, k, v): self.configure(**{k: v})
    def keys(self): return list(self._opts)
    # ---- geometry managers ----
    def _set_geo(self, mgr, kw):
        if self._kind in ('tk', 'toplevel'):
            raise TclError("can't pack/grid/place a top-level window")
        o = _norm(kw)
        if mgr == 'grid' and 'row' not in o: o['row'] = 0
        if mgr == 'grid' and 'column' not in o: o['column'] = 0
        self._geo = {'m': mgr, 'o': {k: v for k, v in o.items() if isinstance(v, (int, float, str, bool, tuple, list, type(None)))}}
    def pack(self, cnf=None, **kw): self._set_geo('pack', dict(cnf or {}, **kw))
    pack_configure = pack
    def grid(self, cnf=None, **kw): self._set_geo('grid', dict(cnf or {}, **kw))
    grid_configure = grid
    def place(self, cnf=None, **kw): self._set_geo('place', dict(cnf or {}, **kw))
    place_configure = place
    def pack_forget(self): self._geo = None
    grid_forget = grid_remove = place_forget = pack_forget
    def pack_propagate(self, flag=True): pass
    grid_propagate = pack_propagate
    def columnconfigure(self, i, weight=None, **kw):
        if weight is not None: self._colconf[int(i)] = weight
    def rowconfigure(self, i, weight=None, **kw):
        if weight is not None: self._rowconf[int(i)] = weight
    grid_columnconfigure = columnconfigure; grid_rowconfigure = rowconfigure
    # ---- binding ----
    def bind(self, sequence=None, func=None, add=None):
        if func is None: return self._binds.get(sequence)
        if add in ('+', True): self._binds.setdefault(sequence, []).append(func)
        else: self._binds[sequence] = [func]
        return 'bind' + str(len(self._binds))
    def unbind(self, sequence, funcid=None): self._binds.pop(sequence, None)
    def bind_all(self, sequence=None, func=None, add=None):
        r = _S['root']
        if r is not None: r.bind(sequence, func, add)
    def focus_set(self): _S['focus'] = self._id
    focus = focus_force = focus_set
    def focus_get(self): return _S['registry'].get(_S.get('focus'))
    def grab_set(self): pass
    def grab_release(self): pass
    def update(self): pass
    def update_idletasks(self): pass
    def lift(self, *a): pass
    tkraise = lift
    def lower(self, *a): pass
    def option_add(self, *a, **k): pass
    def event_generate(self, *a, **k): pass
    def winfo_exists(self): return int(not self._destroyed)
    def winfo_children(self): return [c for c in self._children if not c._destroyed]
    def winfo_width(self): return int(self._opts.get('width', 200)) if isinstance(self._opts.get('width', 200), int) else 200
    def winfo_height(self): return int(self._opts.get('height', 100)) if isinstance(self._opts.get('height', 100), int) else 100
    winfo_reqwidth = winfo_width; winfo_reqheight = winfo_height
    def winfo_screenwidth(self): return 1280
    def winfo_screenheight(self): return 720
    def winfo_toplevel(self):
        w = self
        while w.master is not None and w._kind not in ('tk', 'toplevel'): w = w.master
        return w
    def after(self, ms, func=None, *args):
        if func is None: return None
        token = 't' + str(next(_S['tokens']))
        _S['afters'][token] = (lambda: func(*args))
        _S['timers'].append({'token': token, 'ms': max(1, int(ms))})
        return token
    def after_idle(self, func, *args): return self.after(1, func, *args)
    def after_cancel(self, token): _S['afters'].pop(token, None)
    def destroy(self):
        self._destroyed = True
        for c in list(self._children): c.destroy()
        if self.master is not None and self in self.master._children: self.master._children.remove(self)
        _S['registry'].pop(self._id, None)
        if self._kind == 'tk': _S['closed'] = True
    # ---- serialising ----
    def _props(self):
        return {}
    def _style(self):
        o = self._opts; st = {}
        for k in ('bg', 'fg', 'font', 'relief', 'bd', 'padx', 'pady', 'anchor', 'justify', 'wraplength', 'width', 'height',
                  'highlightbackground', 'activebackground', 'activeforeground', 'cursor', 'borderwidth'):
            if k in o and isinstance(o[k], (int, float, str, tuple, list, bool)): st[k] = o[k]
        if 'state' in o: st['state'] = str(o['state'])
        return st

def _var_or(w, key, fallback):
    v = w._opts.get('textvariable')
    return v.get() if isinstance(v, Variable) else fallback

class Widget(Misc): pass

class BaseWidget(Misc): pass

class Frame(Misc):
    _kind = 'frame'
class LabelFrame(Misc):
    _kind = 'labelframe'
    def _props(self): return {'text': str(self._opts.get('text', ''))}
Labelframe = LabelFrame

class Label(Misc):
    _kind = 'label'
    def _props(self):
        return {'text': str(_var_or(self, 'textvariable', self._opts.get('text', '')))}
class Message(Label): pass

class Button(Misc):
    _kind = 'button'
    def _props(self):
        return {'text': str(_var_or(self, 'textvariable', self._opts.get('text', ''))), 'enabled': str(self._opts.get('state', 'normal')) != 'disabled'}
    def invoke(self):
        cmd = self._opts.get('command')
        return cmd() if callable(cmd) else None
    def flash(self): pass

class Checkbutton(Misc):
    _kind = 'checkbutton'
    def _setup(self):
        if 'variable' not in self._opts: self._opts['variable'] = IntVar(value=0)
    def _on(self): return self._opts.get('onvalue', 1)
    def _off(self): return self._opts.get('offvalue', 0)
    def _props(self):
        v = self._opts['variable'].get()
        return {'text': str(self._opts.get('text', '')), 'checked': v == self._on(), 'enabled': str(self._opts.get('state', 'normal')) != 'disabled'}
    def select(self): self._opts['variable'].set(self._on())
    def deselect(self): self._opts['variable'].set(self._off())
    def toggle(self): (self.deselect() if self._opts['variable'].get() == self._on() else self.select())
    def invoke(self):
        self.toggle(); c = self._opts.get('command')
        if callable(c): c()

class Radiobutton(Misc):
    _kind = 'radiobutton'
    def _setup(self):
        if 'variable' not in self._opts: self._opts['variable'] = IntVar(value=0)
    def _props(self):
        return {'text': str(self._opts.get('text', '')), 'checked': self._opts['variable'].get() == self._opts.get('value', 1),
                'group': 'v' + str(id(self._opts['variable'])), 'enabled': str(self._opts.get('state', 'normal')) != 'disabled'}
    def select(self): self._opts['variable'].set(self._opts.get('value', 1))
    def invoke(self):
        self.select(); c = self._opts.get('command')
        if callable(c): c()

class Entry(Misc):
    _kind = 'entry'
    def _setup(self): self._text = ''
    def _value(self):
        v = self._opts.get('textvariable')
        return str(v.get()) if isinstance(v, Variable) else self._text
    def _store(self, s):
        v = self._opts.get('textvariable')
        if isinstance(v, Variable): v.set(s)
        else: self._text = s
    def _props(self):
        return {'value': self._value(), 'show': str(self._opts.get('show', '')), 'enabled': str(self._opts.get('state', 'normal')) != 'disabled'}
    def get(self): return self._value()
    def _idx(self, i):
        s = self._value()
        if i in ('end', END): return len(s)
        if i in ('insert', INSERT): return len(s)
        return max(0, min(len(s), int(i)))
    def insert(self, index, string):
        s = self._value(); i = self._idx(index); self._store(s[:i] + str(string) + s[i:])
    def delete(self, first, last=None):
        s = self._value(); a = self._idx(first)
        b = a + 1 if last is None else self._idx(last)
        self._store(s[:a] + s[b:])
    def icursor(self, i): pass
    def selection_range(self, a, b): pass
    def select_range(self, a, b): pass

class Spinbox(Entry):
    _kind = 'entry'

class Text(Misc):
    _kind = 'text'
    def _setup(self): self._text = ''
    def _props(self): return {'value': self._text, 'enabled': str(self._opts.get('state', 'normal')) != 'disabled'}
    def _off(self, index):
        t = self._text
        if index in ('end', END): return len(t)
        if index in ('insert', INSERT): return len(t)
        if isinstance(index, str) and index.startswith('end-'): return max(0, len(t) - max(0, int(index[4:].rstrip('c') or 0) - 1))   # the stored text has no implicit final newline
        if isinstance(index, str) and '.' in index:
            line, col = index.split('.', 1)
            lines = t.split('\n'); line = max(1, int(line))
            if line > len(lines): return len(t)
            base = sum(len(l) + 1 for l in lines[:line - 1])
            return min(len(t), base + (len(lines[line - 1]) if col == 'end' else int(col)))
        return len(t)
    def insert(self, index, chars, *tags):
        if str(self._opts.get('state')) == 'disabled': return
        i = self._off(index); self._text = self._text[:i] + str(chars) + self._text[i:]
    def delete(self, first, last=None):
        if str(self._opts.get('state')) == 'disabled': return
        a = self._off(first); b = a + 1 if last is None else self._off(last)
        self._text = self._text[:a] + self._text[b:]
    def get(self, first='1.0', last=None):
        a = self._off(first)
        if last is None: return self._text[a:a + 1]
        b = self._off(last)
        r = self._text[a:b]
        return r + '\n' if last in ('end', END) else r   # real Tk includes the implicit final newline
    def see(self, i): pass
    def mark_set(self, *a): pass
    def tag_configure(self, *a, **k): pass
    def tag_add(self, *a): pass

class Listbox(Misc):
    _kind = 'listbox'
    def _setup(self): self._items = []; self._sel = []
    def _props(self): return {'items': [str(x) for x in self._items], 'selected': list(self._sel), 'mode': str(self._opts.get('selectmode', 'browse'))}
    def insert(self, index, *items):
        i = len(self._items) if index in ('end', END) else int(index)
        self._items[i:i] = list(items)
    def delete(self, first, last=None):
        a = len(self._items) if first in ('end', END) else int(first)
        b = a if last is None else (len(self._items) - 1 if last in ('end', END) else int(last))
        del self._items[a:b + 1]; self._sel = [i for i in self._sel if i < len(self._items)]
    def get(self, first, last=None):
        if last is None: return self._items[int(first)] if first not in ('end', END) else self._items[-1]
        b = len(self._items) - 1 if last in ('end', END) else int(last)
        return tuple(self._items[int(first):b + 1])
    def size(self): return len(self._items)
    def curselection(self): return tuple(self._sel)
    def selection_set(self, a, b=None):
        a = int(a); b = a if b is None else (len(self._items) - 1 if b in ('end', END) else int(b))
        self._sel = sorted(set(self._sel) | set(range(a, b + 1)))
    def selection_clear(self, a=None, b=None): self._sel = []
    def see(self, i): pass
    def activate(self, i): pass

class Scale(Misc):
    _kind = 'scale'
    def _setup(self): self._val = self._opts.get('from_', 0)
    def _props(self):
        v = self._opts.get('variable'); val = v.get() if isinstance(v, Variable) else self._val
        return {'min': self._opts.get('from_', 0), 'max': self._opts.get('to', 100), 'step': self._opts.get('resolution', 1),
                'value': val, 'orient': str(self._opts.get('orient', 'vertical'))}
    def get(self): return self._props()['value']
    def set(self, v):
        var = self._opts.get('variable')
        if isinstance(var, Variable): var.set(v)
        else: self._val = v

class Scrollbar(Misc):
    _kind = 'frame'
    def set(self, *a): pass
class Menu(Misc):
    _kind = 'hidden'
    def add_command(self, **k): pass
    def add_cascade(self, **k): pass
    def add_separator(self, **k): pass
    def add_checkbutton(self, **k): pass
    def add_radiobutton(self, **k): pass
class PhotoImage:
    def __init__(self, *a, **k): pass
    def width(self): return 0
    def height(self): return 0
class Separator(Misc):
    _kind = 'separator'
    def _props(self): return {'orient': str(self._opts.get('orient', 'horizontal'))}
class Progressbar(Misc):
    _kind = 'progress'
    def _props(self): return {'value': self._opts.get('value', 0), 'max': self._opts.get('maximum', 100)}
    def step(self, a=1): self._opts['value'] = self._opts.get('value', 0) + a
    def start(self, *a): pass
    def stop(self): pass

class Combobox(Misc):
    _kind = 'combobox'
    def _setup(self): self._text = ''
    def _cur(self):
        v = self._opts.get('textvariable')
        return str(v.get()) if isinstance(v, Variable) else self._text
    def _props(self): return {'values': [str(x) for x in (self._opts.get('values') or [])], 'value': self._cur()}
    def get(self): return self._cur()
    def set(self, s):
        v = self._opts.get('textvariable')
        if isinstance(v, Variable): v.set(s)
        else: self._text = str(s)
    def current(self, i=None):
        vals = list(self._opts.get('values') or [])
        if i is None: return vals.index(self._cur()) if self._cur() in vals else -1
        self.set(vals[i])

class Canvas(Misc):
    _kind = 'canvas'
    def _setup(self): self._items = []; self._next = 1
    def _props(self): return {'items': [dict(i) for i in self._items]}
    def _add(self, t, coords, kw):
        if len(coords) == 1 and isinstance(coords[0], (list, tuple)): coords = tuple(coords[0])
        it = {'id': self._next, 'type': t, 'coords': [float(c) for c in coords], 'opts': {k: v for k, v in _norm(kw).items() if isinstance(v, (int, float, str, tuple, list, bool))}}
        self._next += 1; self._items.append(it); return it['id']
    def create_line(self, *c, **k): return self._add('line', c, k)
    def create_rectangle(self, *c, **k): return self._add('rect', c, k)
    def create_oval(self, *c, **k): return self._add('oval', c, k)
    def create_polygon(self, *c, **k): return self._add('polygon', c, k)
    def create_text(self, *c, **k): return self._add('text', c, k)
    def create_arc(self, *c, **k): return self._add('arc', c, k)
    def create_image(self, *c, **k): return self._add('image', c, {})
    def _sel(self, spec):
        if spec in ('all', ALL): return list(self._items)
        return [i for i in self._items if i['id'] == spec or i['opts'].get('tags') == spec]
    def delete(self, *specs):
        for s in specs:
            for i in self._sel(s): self._items.remove(i)
    def coords(self, spec, *c):
        for i in self._sel(spec):
            if not c: return i['coords']
            i['coords'] = [float(x) for x in (c[0] if len(c) == 1 and isinstance(c[0], (list, tuple)) else c)]
    def move(self, spec, dx, dy):
        for i in self._sel(spec):
            i['coords'] = [v + (dx if n % 2 == 0 else dy) for n, v in enumerate(i['coords'])]
    def itemconfig(self, spec, **k):
        for i in self._sel(spec): i['opts'].update(_norm(k))
    itemconfigure = itemconfig
    def find_all(self): return tuple(i['id'] for i in self._items)
ALL = 'all'

class _Window(Misc):
    _geom_container = True
    def _setup(self):
        self._title = 'tk'; self._geometry = ''; self._protocols = {}
    def title(self, s=None):
        if s is None: return self._title
        self._title = str(s)
    wm_title = title
    def geometry(self, s=None):
        if s is None: return self._geometry or '200x200+0+0'
        self._geometry = str(s)
    wm_geometry = geometry
    def resizable(self, *a, **k): pass
    def minsize(self, *a): pass
    def maxsize(self, *a): pass
    def attributes(self, *a, **k): pass
    def iconbitmap(self, *a, **k): pass
    def iconphoto(self, *a, **k): pass
    def overrideredirect(self, *a): pass
    def transient(self, *a): pass
    def withdraw(self): pass
    def deiconify(self): pass
    def state(self, *a): return 'normal'
    def protocol(self, name, func=None):
        if func is not None: self._protocols[name] = func
    def _props(self): return {'title': self._title, 'geometry': self._geometry}
    def wait_window(self, *a): pass

class Tk(_Window):
    _kind = 'tk'
    def _setup(self):
        _Window._setup(self)
        _S['root'] = self; _S['closed'] = False
        _S['mainloop'] = False
    def mainloop(self, n=0):
        _S['mainloop'] = True
    def quit(self): _S['closed'] = True
    def report_callback_exception(self, *a): pass
    def tk_setPalette(self, *a, **k): pass

class Toplevel(_Window):
    _kind = 'toplevel'
    def _setup(self):
        _Window._setup(self); self._title = 'Toplevel'

# ---------------- dialogs ----------------
def _alert(kind, title, message, note=''):
    _S['alerts'].append({'kind': kind, 'title': str(title or ''), 'message': str(message if message is not None else ''), 'note': note})
def showinfo(title=None, message=None, **k): _alert('info', title, message); return 'ok'
def showwarning(title=None, message=None, **k): _alert('warning', title, message); return 'ok'
def showerror(title=None, message=None, **k): _alert('error', title, message); return 'ok'
_NOTE = 'The emulator cannot wait for a click here, so it answered automatically.'
def askyesno(title=None, message=None, **k): _alert('question', title, message, _NOTE + ' Answer: Yes.'); return True
def askokcancel(title=None, message=None, **k): _alert('question', title, message, _NOTE + ' Answer: OK.'); return True
def askretrycancel(title=None, message=None, **k): _alert('question', title, message, _NOTE + ' Answer: Retry.'); return True
def askquestion(title=None, message=None, **k): _alert('question', title, message, _NOTE + ' Answer: yes.'); return 'yes'
def askyesnocancel(title=None, message=None, **k): _alert('question', title, message, _NOTE + ' Answer: Yes.'); return True
def askstring(title=None, prompt=None, **k): _alert('question', title, prompt, _NOTE + ' Answer: (nothing).'); return None
def askinteger(title=None, prompt=None, **k): _alert('question', title, prompt, _NOTE + ' Answer: (nothing).'); return None
def askfloat(title=None, prompt=None, **k): _alert('question', title, prompt, _NOTE + ' Answer: (nothing).'); return None

# ---------------- run loop glue ----------------
def mainloop(n=0): _S['mainloop'] = True

def _find(i): return _S['registry'].get(i)

def _ser(w):
    return {'id': w._id, 'kind': w._kind, 'props': w._props(), 'style': w._style(), 'geo': w._geo,
            'binds': sorted(k for k, v in w._binds.items() if v),
            'cols': {str(k): v for k, v in w._colconf.items()}, 'rows': {str(k): v for k, v in w._rowconf.items()},
            'children': [_ser(c) for c in w._children if not c._destroyed and c._kind != 'hidden']}

def _flush():
    root = _S['root']
    out = {'tree': _ser(root) if root is not None and not _S['closed'] else None, 'closed': _S['closed'] and root is not None,
           'alerts': list(_S['alerts']), 'timers': list(_S['timers']), 'mainloop': bool(_S.get('mainloop')), 'focus': _S.get('focus')}
    _S['alerts'].clear(); _S['timers'].clear()
    return json.dumps(out)

_KEYS = {'Return': '<Return>', 'Escape': '<Escape>', 'space': '<space>', 'BackSpace': '<BackSpace>', 'Tab': '<Tab>',
         'Up': '<Up>', 'Down': '<Down>', 'Left': '<Left>', 'Right': '<Right>'}

def _fire(w, seqs, ev):
    node = w
    while node is not None:
        for s in seqs:
            for f in list(node._binds.get(s, [])):
                try:
                    r = f(ev)
                except Exception:
                    traceback.print_exc(); r = None
                if r == 'break': return
        node = node.master

def _call(fn, *a):
    try: return fn(*a)
    except Exception: traceback.print_exc()

def _dispatch(raw):
    ev = json.loads(raw) if isinstance(raw, str) else raw
    t = ev.get('type')
    if t == 'after':
        cb = _S['afters'].pop(ev.get('token'), None)
        if cb and not _S['closed']: _call(cb)
        return
    if t == 'close':
        root = _S['root']; target = _find(ev.get('id')) or root
        h = getattr(target, '_protocols', {}).get('WM_DELETE_WINDOW')
        if h: _call(h)
        else: target.destroy()
        return
    w = _find(ev.get('id'))
    if w is None or w._destroyed: return
    if t == 'click':
        if str(w._opts.get('state', 'normal')) == 'disabled': return
        cmd = w._opts.get('command')
        if callable(cmd): _call(cmd)
    elif t == 'input':
        val = ev.get('value', '')
        if isinstance(w, Entry): w._store(val)
        elif isinstance(w, Text): w._text = val
        elif isinstance(w, Combobox): w.set(val)
    elif t == 'change':
        val = ev.get('value')
        if isinstance(w, Checkbutton):
            w._opts['variable'].set(w._on() if val else w._off())
        elif isinstance(w, Radiobutton):
            w._opts['variable'].set(w._opts.get('value', 1))
        elif isinstance(w, Scale):
            w.set(float(val) if isinstance(val, (int, float)) and not float(val).is_integer() else int(float(val)))
        elif isinstance(w, Listbox):
            w._sel = [int(i) for i in (val or [])]
        elif isinstance(w, Combobox):
            w.set(val)
        cmd = w._opts.get('command')
        if callable(cmd):
            if isinstance(w, Scale): _call(cmd, str(w.get()))
            else: _call(cmd)
        if isinstance(w, (Listbox, Combobox)):
            _fire(w, ['<<ListboxSelect>>', '<<ComboboxSelected>>'], Event(widget=w))
    elif t == 'mouse':
        e = Event(widget=w, x=int(ev.get('x', 0)), y=int(ev.get('y', 0)), num=int(ev.get('num', 1)))
        _fire(w, ['<Button-1>', '<ButtonPress-1>', '<1>'] if ev.get('count', 1) == 1 else ['<Double-Button-1>', '<Double-1>'], e)
    elif t == 'key':
        ks = ev.get('keysym', ''); ch = ev.get('char', '')
        e = Event(widget=w, keysym=ks, char=ch)
        seqs = ['<Key>', '<KeyPress>', '<KeyPress-' + ks + '>', '<' + ks + '>'] + ([_KEYS[ks]] if ks in _KEYS else [])
        _fire(w, seqs, e)

# ---------------- submodules ----------------
messagebox = types.SimpleNamespace(showinfo=showinfo, showwarning=showwarning, showerror=showerror, askyesno=askyesno,
    askokcancel=askokcancel, askretrycancel=askretrycancel, askquestion=askquestion, askyesnocancel=askyesnocancel)
simpledialog = types.SimpleNamespace(askstring=askstring, askinteger=askinteger, askfloat=askfloat)
class _Style:
    def __init__(self, *a): pass
    def configure(self, *a, **k): pass
    def theme_use(self, *a): return 'default'
    def map(self, *a, **k): pass
ttk = types.SimpleNamespace(Button=Button, Label=Label, Entry=Entry, Frame=Frame, Checkbutton=Checkbutton, Radiobutton=Radiobutton,
    Combobox=Combobox, Separator=Separator, Progressbar=Progressbar, LabelFrame=LabelFrame, Labelframe=LabelFrame, Scale=Scale,
    Scrollbar=Scrollbar, Style=_Style, Spinbox=Spinbox)
font = types.SimpleNamespace(Font=lambda *a, **k: None, families=lambda *a: ('Arial', 'Courier', 'Times'), nametofont=lambda *a: None)

`;
