(function(){"use strict";var w=String.raw`
import sys, json, io, types, contextlib

class _Stop(BaseException):
    pass

def _snap(d):
    out = {}
    for k, v in list(d.items()):
        if k.startswith('__'):
            continue
        if isinstance(v, (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType, type)):
            continue
        try:
            t = repr(v)
        except Exception:
            t = '<unprintable>'
        out[k] = t if len(t) <= 80 else t[:77] + '...'
    return out

def run_trace(src, watches_json, max_steps=400):
    watches = json.loads(watches_json)
    steps = []
    out = io.StringIO()
    g = {'__name__': '__main__'}
    state = {'truncated': False}

    def record(frame, event, arg):
        if len(steps) >= max_steps:
            state['truncated'] = True
            raise _Stop()
        in_func = frame.f_code.co_name != '<module>'
        local_vars = _snap(frame.f_locals) if in_func else _snap(frame.f_globals)
        global_vars = _snap(frame.f_globals) if in_func else {}
        w = {}
        for expr in watches:
            try:
                w[expr] = repr(eval(expr, frame.f_globals, frame.f_locals))[:80]
            except Exception as e:
                w[expr] = '<' + type(e).__name__ + '>'
        depth = 0
        f = frame
        while f is not None:
            if f.f_code.co_filename == '<student>':
                depth += 1
            f = f.f_back
        steps.append({
            'line': frame.f_lineno, 'fn': frame.f_code.co_name, 'event': event, 'depth': depth,
            'vars': local_vars, 'globals': global_vars, 'watch': w,
            'out': out.getvalue()[-3000:],
            'ret': repr(arg)[:80] if event == 'return' else None,
        })

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<student>':
            return None
        if event == 'line':
            record(frame, 'line', arg)
        elif event == 'return' and frame.f_code.co_name != '<module>':
            record(frame, 'return', arg)
        return tracer

    err = None
    try:
        code = compile(src, '<student>', 'exec')
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            sys.settrace(tracer)
            try:
                exec(code, g)
            finally:
                sys.settrace(None)
    except _Stop:
        pass
    except SyntaxError as e:
        err = {'line': e.lineno, 'message': 'SyntaxError: ' + str(e.msg)}
    except BaseException as e:
        tb = e.__traceback__
        ln = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<student>':
                ln = tb.tb_lineno
            tb = tb.tb_next
        err = {'line': ln, 'message': type(e).__name__ + ': ' + str(e)}
    return json.dumps({'steps': steps, 'truncated': state['truncated'], 'error': err, 'output': out.getvalue()[-6000:]})
`,v=String.raw`
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

`,y=String.raw`
import sys, types
def _install_tkinter(src):
    m = types.ModuleType('tkinter')
    m.__path__ = []
    exec(compile(src, '<tkinter>', 'exec'), m.__dict__)
    sys.modules['tkinter'] = m
    for name in ('messagebox', 'simpledialog', 'ttk', 'font'):
        sub = types.ModuleType('tkinter.' + name)
        obj = getattr(m, name)
        sub.__dict__.update({k: getattr(obj, k) for k in dir(obj) if not k.startswith('__')})
        setattr(m, name, sub)
        sys.modules['tkinter.' + name] = sub
    sys.modules['tkinter.constants'] = m
`,N=String.raw`
import sqlite3, re, sys, types

class Error(Exception):
    def __init__(self, msg='', errno=None, sqlstate=None):
        super().__init__(msg)
        self.msg = msg; self.errno = errno; self.sqlstate = sqlstate
    def __str__(self):
        return (str(self.errno) + ' (' + (self.sqlstate or 'HY000') + '): ' + self.msg) if self.errno else self.msg
class InterfaceError(Error): pass
class DatabaseError(Error): pass
class DataError(DatabaseError): pass
class OperationalError(DatabaseError): pass
class IntegrityError(DatabaseError): pass
class InternalError(DatabaseError): pass
class ProgrammingError(DatabaseError): pass
class NotSupportedError(DatabaseError): pass

_db = sqlite3.connect(':memory:', check_same_thread=False, isolation_level=None)
_databases = {'information_schema', 'mysql', 'performance_schema', 'sys'}

def _translate(sql):
    s = sql.strip().rstrip(';')
    s = re.sub(r'ENGINE\s*=\s*\w+', '', s, flags=re.I)
    s = re.sub(r'(DEFAULT\s+)?CHARSET\s*=\s*\w+', '', s, flags=re.I)
    s = re.sub(r'COLLATE\s*=?\s*\w+', '', s, flags=re.I)
    s = re.sub(r'\bINT(?:EGER)?\s*(?:\(\d+\))?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', s, flags=re.I)
    s = re.sub(r'\bINT(?:EGER)?\s*(?:\(\d+\))?\s+(?:NOT\s+NULL\s+)?PRIMARY\s+KEY\s+AUTO_INCREMENT', 'INTEGER PRIMARY KEY AUTOINCREMENT', s, flags=re.I)
    s = re.sub(r'\bAUTO_INCREMENT\b', '', s, flags=re.I)
    s = re.sub(r'\bNOW\s*\(\s*\)', 'CURRENT_TIMESTAMP', s, flags=re.I)
    s = s.replace(chr(96), '"')
    s = re.sub(r'%\((\w+)\)s', r':\1', s)
    s = s.replace('%s', '?')
    return s

def _map_error(e, sql):
    m = str(e)
    if isinstance(e, sqlite3.IntegrityError):
        if 'UNIQUE' in m or 'PRIMARY KEY' in m:
            return IntegrityError("Duplicate entry for key (" + m + ")", 1062, '23000')
        return IntegrityError(m, 1048, '23000')
    if 'no such table' in m:
        t = m.split(':')[-1].strip()
        return ProgrammingError("Table '" + t + "' doesn't exist", 1146, '42S02')
    if 'no such column' in m or 'has no column' in m:
        return ProgrammingError("Unknown column (" + m + ")", 1054, '42S22')
    if 'already exists' in m:
        return ProgrammingError(m.replace('table', 'Table'), 1050, '42S01')
    if 'syntax error' in m:
        return ProgrammingError("You have an error in your SQL syntax; check the manual (" + m + ")", 1064, '42000')
    if isinstance(e, sqlite3.ProgrammingError):
        return ProgrammingError(m, 1064, '42000')
    return DatabaseError(m, 1105, 'HY000')

class MySQLCursor:
    def __init__(self, conn, dictionary=False, buffered=False):
        self._conn = conn; self._dict = dictionary
        self._rows = []; self._pos = 0
        self.rowcount = -1; self.lastrowid = None; self.description = None
        self.column_names = ()
    def _set(self, cur, names=None, rows=None):
        self.description = None
        if cur is not None and cur.description:
            self.description = tuple((d[0], None, None, None, None, None, None) for d in cur.description)
        self.column_names = tuple(names) if names else tuple(d[0] for d in (cur.description or [])) if cur is not None else ()
        data = rows if rows is not None else (cur.fetchall() if cur is not None and cur.description else [])
        if self._dict:
            self._rows = [dict(zip(self.column_names, r)) for r in data]
        else:
            self._rows = [tuple(r) for r in data]
        self._pos = 0
        if cur is not None:
            self.rowcount = len(self._rows) if cur.description else cur.rowcount
            self.lastrowid = cur.lastrowid
    def execute(self, operation, params=None, multi=False):
        global _databases
        if self._conn._closed: raise InterfaceError('Cursor is not connected', 2055)
        raw = operation.strip().rstrip(';')
        up = raw.upper()
        m = re.match(r'CREATE\s+DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)', raw, re.I)
        if m:
            name = m.group(2)
            if name in _databases and not m.group(1): raise DatabaseError("Can't create database '" + name + "'; database exists", 1007, 'HY000')
            _databases.add(name); self._set(None, rows=[]); self.rowcount = 1; return
        m = re.match(r'DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?(\w+)', raw, re.I)
        if m:
            _databases.discard(m.group(2)); self._set(None, rows=[]); return
        m = re.match(r'USE\s+(\w+)', raw, re.I)
        if m:
            if m.group(1) not in _databases: raise ProgrammingError("Unknown database '" + m.group(1) + "'", 1049, '42000')
            self._conn.database = m.group(1); self._set(None, rows=[]); return
        if up == 'SHOW DATABASES':
            self._set(None, names=['Database'], rows=[(d,) for d in sorted(_databases)]); return
        if up == 'SHOW TABLES':
            r = _db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
            self._set(None, names=['Tables_in_' + (self._conn.database or 'db')], rows=r); return
        m = re.match(r'(?:DESCRIBE|DESC|SHOW\s+COLUMNS\s+FROM)\s+(\w+)', raw, re.I)
        if m:
            try:
                r = _db.execute('PRAGMA table_info(' + m.group(1) + ')').fetchall()
            except sqlite3.Error as e:
                raise _map_error(e, raw)
            if not r: raise ProgrammingError("Table '" + m.group(1) + "' doesn't exist", 1146, '42S02')
            self._set(None, names=['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
                      rows=[(c[1], c[2].lower() or 'text', 'NO' if c[3] else 'YES', 'PRI' if c[5] else '', c[4], '') for c in r]); return
        if re.search(r'ON\s+DUPLICATE\s+KEY', raw, re.I):
            raise NotSupportedError('ON DUPLICATE KEY UPDATE is not supported by the in-browser stand-in. Use INSERT OR REPLACE-style logic in Python instead.', 1235)
        sql = _translate(operation)
        if params is not None and not isinstance(params, (tuple, list, dict)):
            params = (params,)
        try:
            cur = _db.execute(sql, params if params is not None else ())
        except sqlite3.Error as e:
            raise _map_error(e, raw)
        self._set(cur)
    def executemany(self, operation, seq_params):
        sql = _translate(operation); n = 0
        try:
            for p in seq_params:
                cur = _db.execute(sql, p); n += cur.rowcount
        except sqlite3.Error as e:
            raise _map_error(e, operation)
        self._rows = []; self.rowcount = n
    def fetchone(self):
        if self._pos >= len(self._rows): return None
        r = self._rows[self._pos]; self._pos += 1; return r
    def fetchmany(self, size=1):
        out = self._rows[self._pos:self._pos + size]; self._pos += len(out); return out
    def fetchall(self):
        out = self._rows[self._pos:]; self._pos = len(self._rows); return out
    def close(self): return True
    def __iter__(self):
        while True:
            r = self.fetchone()
            if r is None: return
            yield r
    def __enter__(self): return self
    def __exit__(self, *a): self.close()

class MySQLConnection:
    def __init__(self, **kw):
        global _databases
        self._closed = False
        self.database = kw.get('database')
        if self.database: _databases.add(self.database)   # lenient: a missing database is created
        self.autocommit = kw.get('autocommit', False)
        self.user = kw.get('user'); self.server_host = kw.get('host', 'localhost')
    def cursor(self, buffered=False, dictionary=False, **kw):
        if self._closed: raise InterfaceError('MySQL Connection not available.', 2055)
        return MySQLCursor(self, dictionary=dictionary)
    def commit(self): 
        if self._closed: raise InterfaceError('MySQL Connection not available.', 2055)
    def rollback(self): pass
    def close(self): self._closed = True
    def disconnect(self): self._closed = True
    def is_connected(self): return not self._closed
    def ping(self, *a, **k): return not self._closed
    def reconnect(self, *a, **k): self._closed = False
    def __enter__(self): return self
    def __exit__(self, *a): self.close()

def connect(*args, **kwargs):
    return MySQLConnection(**kwargs)

def _install():
    pkg = types.ModuleType('mysql'); pkg.__path__ = []
    con = types.ModuleType('mysql.connector')
    for name in ['Error','InterfaceError','DatabaseError','DataError','OperationalError','IntegrityError','InternalError','ProgrammingError','NotSupportedError','MySQLConnection','MySQLCursor','connect']:
        setattr(con, name, globals()[name])
    con.__version__ = 'browser-standin'
    con.Connect = connect
    errs = types.ModuleType('mysql.connector.errors')
    for name in ['Error','InterfaceError','DatabaseError','DataError','OperationalError','IntegrityError','InternalError','ProgrammingError','NotSupportedError']:
        setattr(errs, name, globals()[name])
    con.errors = errs
    pkg.connector = con
    sys.modules['mysql'] = pkg; sys.modules['mysql.connector'] = con; sys.modules['mysql.connector.errors'] = errs
_install()
`,E=String.raw`
import io, base64, json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _plt
_cs_figs = []
def _cs_collect():
    for n in list(_plt.get_fignums()):
        if len(_cs_figs) >= 8:
            break
        f = _plt.figure(n)
        b = io.BytesIO()
        f.savefig(b, format='png', dpi=90, bbox_inches='tight')
        data = b.getvalue()
        if len(data) < 1500000:
            _cs_figs.append('data:image/png;base64,' + base64.b64encode(data).decode())
    _plt.close('all')
_plt.show = lambda *a, **k: _cs_collect()
def _cs_take():
    _cs_collect()
    out = json.dumps(_cs_figs)
    _cs_figs.clear()
    return out
`;let s=null,p=!1,i=!1,f=!1;const c=2e4;let o=0;const l=e=>self.postMessage(e),d=e=>{o>c||(o+=e.length,l({type:"out",text:o>c?e.slice(0,Math.max(0,e.length-(o-c)))+`
[output truncated]
`:e}))};async function u(){s||(l({type:"status",text:"Loading Python (first run downloads about 10 MB)…"}),self.importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"),s=await self.loadPyodide(),s.runPython(`
import builtins
def _no_input(prompt=''):
    raise RuntimeError("input() is not available in the browser lab. Store test values in variables instead.")
builtins.input = _no_input
`))}async function m(e){/\b(import|from)\s+(numpy|pandas|sqlite3|scipy|matplotlib|statistics|sklearn)\b/.test(e)&&(l({type:"status",text:"Loading packages…"}),await s.loadPackagesFromImports(e)),/\bmysql\b/.test(e)&&await s.loadPackage("sqlite3")}async function g(){const e=s.pyimport("tkinter");let r;try{r=JSON.parse(e._flush())}finally{e.destroy()}(r.timers||[]).forEach(({token:t,ms:_})=>setTimeout(()=>b({type:"after",token:t}),_)),l({type:"tk",...r,timers:void 0})}function b(e){if(!i||!s)return;const r=s.pyimport("tkinter");try{r._dispatch(JSON.stringify(e))}catch(t){d(String((t==null?void 0:t.message)||t)+`
`)}finally{r.destroy()}g()}function x(e){i=!1,/\btkinter\b|\bTkinter\b/.test(e)&&(s.runPython(y),s.globals.get("_install_tkinter")(v),i=!0),/\bmysql\b/.test(e)&&s.runPython(N),f=/\bmatplotlib\b/.test(e)}async function h(e,r){await u(),await m(e),p||(s.runPython(w),p=!0),l({type:"status",text:"Running…"});const t=s.globals.get("run_trace");try{l({type:"trace",result:JSON.parse(t(e,JSON.stringify(r||[]),400))})}finally{t.destroy()}}self.onmessage=async e=>{const{type:r,code:t,watches:_}=e.data;if(r==="tk-event"){b(e.data.event);return}if(r==="trace"){try{await h(t,_)}catch(n){l({type:"error",text:String((n==null?void 0:n.message)||n)})}return}if(r==="run"){o=0;try{await u(),await m(t),x(t),f&&s.runPython(E),s.setStdout({batched:a=>d(a+`
`)}),s.setStderr({batched:a=>d(a+`
`)});const n=s.globals.get("dict")();try{if(l({type:"status",text:"Running…"}),await s.runPythonAsync(t,{globals:n}),f){const a=JSON.parse(s.runPython("_cs_take()"));a.length&&l({type:"figures",images:a})}i&&await g(),l({type:"done"})}finally{n.destroy()}}catch(n){let a=String((n==null?void 0:n.message)||n);const k=a.indexOf('File "<exec>"');k>-1&&(a=`Traceback (most recent call last):
  `+a.slice(k)),l({type:"error",text:a})}}}})();
