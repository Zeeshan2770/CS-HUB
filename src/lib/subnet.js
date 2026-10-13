// IPv4 / CIDR calculator (Chapter 1 networking).
export function parseIPv4(s) {
  const p = String(s).trim().split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) throw new Error('Enter a valid IPv4 address, e.g. 192.168.1.10');
  return p.reduce((a, x) => (a * 256 + Number(x)) >>> 0, 0);
}
export const toDotted = (n) => [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join('.');

export function subnet(ip, prefix) {
  const pfx = Number(prefix);
  if (!Number.isInteger(pfx) || pfx < 0 || pfx > 32) throw new Error('Prefix length must be between 0 and 32');
  const addr = parseIPv4(ip);
  const mask = pfx === 0 ? 0 : (0xffffffff << (32 - pfx)) >>> 0;
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - pfx);
  const usable = pfx >= 31 ? (pfx === 32 ? 1 : 2) : total - 2;
  const first = pfx >= 31 ? network : network + 1;
  const last = pfx >= 31 ? broadcast : broadcast - 1;
  const first8 = (addr >>> 24) & 255;
  const cls = first8 < 128 ? 'A' : first8 < 192 ? 'B' : first8 < 224 ? 'C' : first8 < 240 ? 'D (multicast)' : 'E (reserved)';
  const priv = (addr >>> 24 === 10) || ((addr >>> 20) === 0xac1) || ((addr >>> 16) === 0xc0a8);
  return {
    mask: toDotted(mask), network: toDotted(network), broadcast: toDotted(broadcast),
    first: toDotted(first), last: toDotted(last), total, usable, class: cls, private: priv,
    binary: [24, 16, 8, 0].map((sh) => ((addr >>> sh) & 255).toString(2).padStart(8, '0')).join('.'),
  };
}
