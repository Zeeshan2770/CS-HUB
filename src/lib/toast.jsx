import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(() => {});
const ConfirmCtx = createContext(() => Promise.resolve(false));
export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const id = useRef(0);

  const toast = useCallback((message, kind = 'info') => {
    const n = ++id.current;
    setToasts((t) => [...t, { id: n, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n)), kind === 'error' ? 7000 : 4000);
  }, []);

  const confirm = useCallback(
    (message, { confirmLabel = 'Confirm', danger = false } = {}) =>
      new Promise((resolve) => setDlg({ message, confirmLabel, danger, resolve })),
    []
  );
  const close = (v) => { dlg?.resolve(v); setDlg(null); };

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
          ))}
        </div>
        {dlg && (
          <div className="modal-back" onKeyDown={(e) => e.key === 'Escape' && close(false)}>
            <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-msg">
              <p id="dlg-msg">{dlg.message}</p>
              <div className="row end">
                <button className="btn" onClick={() => close(false)}>Cancel</button>
                <button className={`btn ${dlg.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => close(true)}>{dlg.confirmLabel}</button>
              </div>
            </div>
          </div>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
