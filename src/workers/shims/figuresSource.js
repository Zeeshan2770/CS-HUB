// Python source: makes matplotlib draw to PNG images that the page can show (no window needed).
export default String.raw`
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
`;
