import { useState } from 'react';
import { subnet } from '../lib/subnet.js';
import { Crumbs, PageHead } from '../components/ui.jsx';

export default function SubnetLab() {
  const [ip, setIp] = useState('192.168.1.10');
  const [pfx, setPfx] = useState('24');
  let r = null, err = '';
  try { r = subnet(ip, pfx); } catch (e) { err = e.message; }
  const rows = r && [
    ['Address (binary)', r.binary], ['Subnet mask', r.mask], ['Network address', r.network], ['Broadcast address', r.broadcast],
    ['First usable host', r.first], ['Last usable host', r.last], ['Usable hosts', r.usable.toLocaleString()], ['Addresses in block', r.total.toLocaleString()],
    ['Address class', r.class], ['Private range (RFC 1918)', r.private ? 'Yes' : 'No'],
  ];
  return (
    <div className="page narrow">
      <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'Subnet calculator' }]} />
      <PageHead title="Subnet calculator" sub="IPv4 only. Enter an address and a prefix length such as 24 (for /24)." />
      <div className="card">
        <div className="grid two">
          <label className="field"><span>IPv4 address</span><input value={ip} onChange={(e) => setIp(e.target.value)} inputMode="decimal" /></label>
          <label className="field"><span>Prefix length (0 to 32)</span><input type="number" min="0" max="32" value={pfx} onChange={(e) => setPfx(e.target.value)} /></label>
        </div>
        {err && <p className="fielderr" role="alert">{err}</p>}
        {rows && <div className="tablewrap"><table className="lt"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="mono">{v}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  );
}
