// Python source of the step tracer. It is sent to the Pyodide worker and run there.
// run_trace(src, watches_json, max_steps) -> JSON string with every executed line and the variables at that moment.
export default String.raw`
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
`;
