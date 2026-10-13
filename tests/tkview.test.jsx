import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TkView from '../src/components/TkView.jsx';
import { validateTree, ev, fontCss, parseGeometry } from '../src/lib/tkTree.js';

let id = 0;
const n = (kind, props = {}, o = {}) => ({ id: ++id, kind, props, style: {}, geo: null, binds: [], cols: {}, rows: {}, children: [], ...o });
const pack = (node, opts = {}) => ({ ...node, geo: { m: 'pack', o: opts } });
const grid = (node, opts) => ({ ...node, geo: { m: 'grid', o: opts } });
const win = (children, props = {}) => n('tk', { title: 'My App', geometry: '', ...props }, { children });

beforeEach(() => { cleanup(); id = 0; });

describe('TkView', () => {
  it('draws a window with title, label, entry and button, and sends the right events', () => {
    const entry = pack(n('entry', { value: '', show: '', enabled: true }));
    const btn = pack(n('button', { text: 'Greet', enabled: true }));
    const tree = win([pack(n('label', { text: 'Name:' })), entry, btn], { title: 'Greeter', geometry: '320x200' });
    expect(validateTree(tree)).toEqual([]);
    const send = vi.fn();
    render(<TkView state={{ tree, closed: false, alerts: [] }} send={send} />);
    expect(screen.getByText('Greeter')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Greeter' }).querySelector('.tk-body').style.width).toBe('320px');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ayesha' } });
    expect(send).toHaveBeenLastCalledWith(ev.input(entry.id, 'Ayesha'));
    expect(screen.getByRole('textbox')).toHaveValue('Ayesha'); // typing is not lost while Python catches up
    fireEvent.click(screen.getByRole('button', { name: 'Greet' }));
    expect(send).toHaveBeenLastCalledWith(ev.click(btn.id));
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
    expect(send).toHaveBeenLastCalledWith(ev.close(tree.id));
  });
  it('Python can change the Entry text and the page follows', () => {
    const e = pack(n('entry', { value: 'old', show: '', enabled: true }));
    const { rerender } = render(<TkView state={{ tree: win([e]), closed: false, alerts: [] }} send={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('old');
    rerender(<TkView state={{ tree: win([{ ...e, props: { ...e.props, value: '' } }]), closed: false, alerts: [] }} send={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('password entries hide the text; disabled buttons cannot be clicked', () => {
    const send = vi.fn();
    const tree = win([pack(n('entry', { value: 'x', show: '*', enabled: true })), pack(n('button', { text: 'Off', enabled: false }))]);
    const { container } = render(<TkView state={{ tree, closed: false, alerts: [] }} send={send} />);
    expect(container.querySelector('input[type=password]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });
  it('grid layout uses CSS grid positions, spans and sticky', () => {
    const tree = win([
      grid(n('label', { text: 'A' }), { row: 0, column: 0, columnspan: 2, sticky: 'w' }),
      grid(n('label', { text: 'B' }), { row: 1, column: 1, sticky: 'ew' }),
    ], {});
    tree.cols = { 1: 1 };
    const { container } = render(<TkView state={{ tree, closed: false, alerts: [] }} send={() => {}} />);
    const g = container.querySelector('.tk-grid');
    expect(g.style.gridTemplateColumns).toBe('auto minmax(0,1fr)');
    const [a, b] = g.children;
    expect(a.style.gridColumn).toBe('1 / span 2'); expect(a.style.justifySelf).toBe('start');
    expect(b.style.gridRow).toBe('2 / span 1'); expect(b.style.justifySelf).toBe('stretch');
  });
  it('place layout positions by x/y and relative values', () => {
    const tree = win([{ ...n('label', { text: 'P' }), geo: { m: 'place', o: { x: 10, y: 20 } } }, { ...n('label', { text: 'Q' }), geo: { m: 'place', o: { relx: 0.5, rely: 0.5, anchor: 'center' } } }]);
    const { container } = render(<TkView state={{ tree, closed: false, alerts: [] }} send={() => {}} />);
    const [p, q] = container.querySelector('.tk-place').children;
    expect(p.style.left).toBe('10px'); expect(p.style.top).toBe('20px');
    expect(q.style.left).toBe('50%'); expect(q.style.transform).toBe('translate(-50%,-50%)');
  });
  it('pack side=left puts buttons in one row', () => {
    const tree = win([pack(n('button', { text: 'One', enabled: true }), { side: 'left' }), pack(n('button', { text: 'Two', enabled: true }), { side: 'left' }), pack(n('label', { text: 'Below' }))]);
    const { container } = render(<TkView state={{ tree, closed: false, alerts: [] }} send={() => {}} />);
    const row = screen.getByRole('button', { name: 'One' }).closest('div[style*="display: flex"][style*="width: 100%"]');
    expect(row).toContainElement(screen.getByRole('button', { name: 'Two' }));
    expect(row).not.toContainElement(screen.getByText('Below'));
  });
  it('checkbutton, radiobutton, scale, listbox, combobox send change events', () => {
    const send = vi.fn();
    const chk = pack(n('checkbutton', { text: 'Agree', checked: false, enabled: true }));
    const rad = pack(n('radiobutton', { text: 'A', checked: true, group: 'g', enabled: true }));
    const sc = pack(n('scale', { min: 0, max: 10, step: 1, value: 3, orient: 'horizontal' }));
    const lb = pack(n('listbox', { items: ['Ali', 'Sara'], selected: [0], mode: 'browse' }));
    const cb = pack(n('combobox', { values: ['x', 'y'], value: 'x' }));
    render(<TkView state={{ tree: win([chk, rad, sc, lb, cb]), closed: false, alerts: [] }} send={send} />);
    fireEvent.click(screen.getByLabelText('Agree')); expect(send).toHaveBeenLastCalledWith(ev.change(chk.id, true));
    fireEvent.change(screen.getByLabelText('Scale'), { target: { value: '7' } }); expect(send).toHaveBeenLastCalledWith(ev.change(sc.id, 7));
    fireEvent.click(screen.getByRole('option', { name: 'Sara' })); expect(send).toHaveBeenLastCalledWith(ev.change(lb.id, [1]));
    expect(screen.getByRole('option', { name: 'Ali' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Choose'), { target: { value: 'y' } }); expect(send).toHaveBeenLastCalledWith(ev.change(cb.id, 'y'));
  });
  it('canvas draws shapes and reports clicks with coordinates; bound labels report clicks', () => {
    const send = vi.fn();
    const cv = pack(n('canvas', { items: [
      { id: 1, type: 'rect', coords: [10, 10, 50, 50], opts: { fill: 'red' } },
      { id: 2, type: 'oval', coords: [0, 0, 20, 20], opts: {} },
      { id: 3, type: 'text', coords: [30, 70], opts: { text: 'hi' } },
      { id: 4, type: 'line', coords: [0, 0, 10, 10, 20, 0], opts: { fill: 'blue' } }] }, { style: {} }), {});
    const lab = { ...pack(n('label', { text: 'Click me' })), binds: ['<Button-1>'] };
    const { container } = render(<TkView state={{ tree: win([cv, lab]), closed: false, alerts: [] }} send={send} />);
    expect(container.querySelector('svg rect').getAttribute('fill')).toBe('red');
    expect(container.querySelector('svg ellipse')).not.toBeNull();
    expect(container.querySelector('svg text').textContent).toBe('hi');
    expect(container.querySelector('svg polyline').getAttribute('points')).toBe('0,0 10,10 20,0');
    fireEvent.click(container.querySelector('svg'), { clientX: 5, clientY: 6 });
    expect(send.mock.calls.at(-1)[0]).toMatchObject({ type: 'mouse', id: cv.id });
    fireEvent.click(screen.getByText('Click me'));
    expect(send.mock.calls.at(-1)[0]).toMatchObject({ type: 'mouse', id: lab.id });
  });
  it('toplevel windows are drawn separately, and messagebox alerts appear until dismissed', () => {
    const top = n('toplevel', { title: 'Second', geometry: '' }, { children: [pack(n('label', { text: 'child window' }))] });
    const tree = win([pack(n('label', { text: 'main' })), top]);
    render(<TkView state={{ tree, closed: false, alerts: [{ kind: 'info', title: 'Done', message: 'Saved!', note: '' }, { kind: 'question', title: 'Sure?', message: 'Quit?', note: 'answered automatically' }] }} send={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Second' })).toHaveTextContent('child window');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Saved!');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Quit?');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('answered automatically');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('a closed window says so', () => {
    render(<TkView state={{ tree: null, closed: true, alerts: [] }} send={() => {}} />);
    expect(screen.getByText('The window was closed.')).toBeInTheDocument();
  });
  it('colours, fonts and sizes from Tk options become CSS', () => {
    const lab = pack({ ...n('label', { text: 'Styled' }), style: { bg: 'yellow', fg: 'red', font: ['Arial', 12, 'bold'], width: 10, padx: 4, pady: 2 } });
    render(<TkView state={{ tree: win([lab]), closed: false, alerts: [] }} send={() => {}} />);
    const el = screen.getByText('Styled');
    expect(el.style.background).toBe('yellow'); expect(el.style.color).toBe('red');
    expect(el.style.fontWeight).toBe('700'); expect(el.style.fontSize).toBe('16px'); expect(el.style.width).toBe('calc(10ch + 16px)');
  });
});

describe('tk helpers', () => {
  it('fonts, geometry strings and tree validation', () => {
    expect(fontCss(['Courier', 10, 'bold italic'])).toMatchObject({ fontWeight: 700, fontStyle: 'italic', fontSize: '13px' });
    expect(fontCss('Helvetica 14')).toMatchObject({ fontSize: '19px' });
    expect(fontCss(null)).toEqual({});
    expect(parseGeometry('400x300+10+20')).toEqual({ w: 400, h: 300 });
    expect(parseGeometry('')).toBeNull();
    expect(validateTree({ id: 1, kind: 'weird', props: {}, binds: [], children: [] }).length).toBe(1);
    expect(validateTree({ id: 'x', kind: 'label', props: {}, geo: { m: 'oops', o: {} }, binds: [], children: [] }).length).toBe(2);
  });
});
