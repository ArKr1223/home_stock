import { FormEvent, useState } from 'react';
import { Boxes, LoaderCircle } from 'lucide-react';
import { inventoryRepository } from '../repositories/inventoryRepository';

export function AuthScreen() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice('');
    try {
      if (mode === 'signIn') await inventoryRepository.signIn(email, password);
      else {
        await inventoryRepository.signUp(email, password);
        setNotice('帳號已建立。若專案啟用信箱驗證，請先至信箱完成驗證。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '登入失敗');
    } finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="brand-mark"><Boxes size={26} /><span>家用庫存管理</span></div>
      <h1 id="auth-title">{mode === 'signIn' ? '登入你的庫存' : '建立管理帳號'}</h1>
      <p>採購、領用、保存期限與比價紀錄都集中在同一處。</p>
      <form onSubmit={submit}>
        <label>電子郵件<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>密碼<input type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {notice ? <div className="form-notice" role="status">{notice}</div> : null}
        <button className="button primary wide" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'signIn' ? '登入' : '註冊'}</button>
      </form>
      <button className="text-button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setNotice(''); }}>
        {mode === 'signIn' ? '第一次使用？建立帳號' : '已有帳號？返回登入'}
      </button>
    </section>
  </main>;
}
