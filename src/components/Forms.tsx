import { FormEvent, useMemo, useState } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import type { IssueInput, PriceDetailInput, PriceHeader, PriceHeaderInput, Purchase, PurchaseInput, StockStatus } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseForm({ initial, onSubmit, onCancel }: { initial?: Purchase; onSubmit: (value: PurchaseInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PurchaseInput>(() => ({
    id: initial?.id, purchaseNo: initial?.purchaseNo, photoPath: initial?.photoPath ?? null, photoFile: null,
    name: initial?.name ?? '', category: initial?.category ?? '', brand: initial?.brand ?? '', purchaseDate: initial?.purchaseDate ?? today(),
    expiryDate: initial?.expiryDate ?? null, quantity: initial?.quantity ?? 1, unit: initial?.unit ?? '件', currency: initial?.currency ?? 'TWD',
    unitPrice: initial?.unitPrice ?? 0, purchasePlace: initial?.purchasePlace ?? '', location: initial?.location ?? '', notes: initial?.notes ?? '',
    stockStatus: initial?.stockStatus ?? 'in_stock',
  }));
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => form.photoFile ? URL.createObjectURL(form.photoFile) : initial?.photoUrl ?? null, [form.photoFile, initial?.photoUrl]);
  const set = <K extends keyof PurchaseInput>(key: K, value: PurchaseInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } }

  return <form className="form-grid" onSubmit={submit}>
    <label className="photo-input span-2">
      {preview ? <img src={preview} alt="物品預覽" /> : <ImagePlus size={28} />}
      <span>{preview ? '更換照片' : '上傳物品照片'}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(event) => set('photoFile', event.target.files?.[0] ?? null)} />
    </label>
    <Field label="物品名稱" required><input value={form.name} onChange={(event) => set('name', event.target.value)} required /></Field>
    <Field label="分類"><input value={form.category} onChange={(event) => set('category', event.target.value)} placeholder="例如：食品" /></Field>
    <Field label="品牌"><input value={form.brand} onChange={(event) => set('brand', event.target.value)} /></Field>
    <Field label="購買日期" required><input type="date" value={form.purchaseDate} onChange={(event) => set('purchaseDate', event.target.value)} required /></Field>
    <Field label="有效期限"><input type="date" value={form.expiryDate ?? ''} onChange={(event) => set('expiryDate', event.target.value || null)} /></Field>
    <Field label="庫存狀態"><select value={form.stockStatus} onChange={(event) => set('stockStatus', event.target.value as StockStatus)}><option value="in_stock">庫存充足</option><option value="low_stock">數量不足</option><option value="out_of_stock">已用完</option><option value="archived">已封存</option></select></Field>
    <Field label="數量" required><input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => set('quantity', Number(event.target.value))} required /></Field>
    <Field label="單位"><input value={form.unit} onChange={(event) => set('unit', event.target.value)} /></Field>
    <Field label="幣別"><input value={form.currency} onChange={(event) => set('currency', event.target.value)} /></Field>
    <Field label="單價"><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => set('unitPrice', Number(event.target.value))} /></Field>
    <Field label="總金額"><input value={(form.quantity * form.unitPrice).toFixed(2)} readOnly /></Field>
    <Field label="購買來源"><input value={form.purchasePlace} onChange={(event) => set('purchasePlace', event.target.value)} /></Field>
    <Field label="存放位置"><input value={form.location} onChange={(event) => set('location', event.target.value)} /></Field>
    <Field label="備註" className="span-2"><textarea rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
    <FormActions busy={busy} onCancel={onCancel} />
  </form>;
}

export function IssueForm({ purchase, onSubmit, onCancel }: { purchase: Purchase; onSubmit: (value: IssueInput) => Promise<void>; onCancel: () => void }) {
  const remaining = purchase.quantity - purchase.issuedQuantity;
  const [form, setForm] = useState<IssueInput>({ purchaseId: purchase.id, issueDate: today(), quantity: 1, notes: '' });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } }
  return <form className="form-grid" onSubmit={submit}>
    <div className="readonly span-2"><strong>{purchase.name}</strong><span>批號 {purchase.purchaseNo} · 可領用 {remaining} {purchase.unit}</span></div>
    <Field label="領用日期" required><input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} required /></Field>
    <Field label="領用數量" required><input type="number" min="0.001" max={remaining} step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} required /></Field>
    <Field label="備註" className="span-2"><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
    <FormActions busy={busy} onCancel={onCancel} />
  </form>;
}

export function CompareForm({ onSubmit, onCancel }: { onSubmit: (value: PriceHeaderInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PriceHeaderInput>({ name: '', compareDate: today(), photoFile: null, photoPath: null });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } }
  return <form className="form-grid" onSubmit={submit}>
    <label className="photo-input span-2"><ImagePlus size={28} /><span>上傳要比價的照片</span><input type="file" accept="image/*" capture="environment" onChange={(event) => setForm({ ...form, photoFile: event.target.files?.[0] ?? null })} /></label>
    <Field label="物品名稱" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
    <Field label="比價日期" required><input type="date" value={form.compareDate} onChange={(event) => setForm({ ...form, compareDate: event.target.value })} required /></Field>
    <FormActions busy={busy} onCancel={onCancel} />
  </form>;
}

export function PriceDetailForm({ header, onSubmit, onCancel }: { header: PriceHeader; onSubmit: (value: PriceDetailInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PriceDetailInput>({ priceHeaderId: header.id, merchant: '', detailDate: today(), currency: 'TWD', unitPrice: 0, notes: '' });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } }
  return <form className="form-grid" onSubmit={submit}>
    <div className="readonly span-2"><strong>{header.name}</strong><span>比價單號 {header.compareNo}</span></div>
    <Field label="商家" required><input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} required /></Field>
    <Field label="日期" required><input type="date" value={form.detailDate} onChange={(event) => setForm({ ...form, detailDate: event.target.value })} required /></Field>
    <Field label="幣別"><input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></Field>
    <Field label="單價" required><input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: Number(event.target.value) })} required /></Field>
    <Field label="備註" className="span-2"><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
    <FormActions busy={busy} onCancel={onCancel} />
  </form>;
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`field ${className}`}><span>{label}{required ? <b> *</b> : null}</span>{children}</label>;
}

function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return <div className="form-actions span-2"><button type="button" className="button secondary" onClick={onCancel}>取消</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}儲存</button></div>;
}
