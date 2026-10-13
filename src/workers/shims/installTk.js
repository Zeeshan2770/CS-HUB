// Python glue that turns the exec'd tkinter source into importable modules (tkinter, tkinter.messagebox, tkinter.ttk, ...).
export default String.raw`
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
`;
