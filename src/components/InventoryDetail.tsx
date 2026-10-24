import { useEffect, useRef, useState } from 'react';
import { Boxes, Expand, X } from 'lucide-react';
import type { InventoryItem, Purchase } from '../types';
import { statusLabel } from '../lib/inventory';

export function InventoryDetail({ item, purchases, onClose }: { item: InventoryItem; purchases: Purchase[]; onClose: () => void }) {
  const detailRef = useRef<HTMLDialogElement>(null);
  const photoRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const photoTriggerRef = useRef<HTMLElement | null>(null);
  const [photo, setPhoto] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    const dialog = detailRef.current;
    const returnFocus = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => returnFocus?.focus());
    };
  }, []);

  useEffect(() => {
    const dialog = photoRef.current;
    if (photo) dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => photoTriggerRef.current?.focus());
    };
  }, [photo]);

  const batches = purchases.filter((purchase) => purchase.name.trim().toLocaleLowerCase('zh-Hant') === item.name.trim().toLocaleLowerCase('zh-Hant'));
  const viewPhoto = (url: string, label: string) => {
    photoTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPhoto({ url, label });
  };

  return <>
    <dialog ref={detailRef} className="inventory-detail" aria-labelledby="inventory-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="detail-surface">
        <header className="detail-header"><h2 id="inventory-detail-title">{item.name}</h2><button type="button" className="icon-button" aria-label="關閉商品詳情" onClick={onClose}><X size={22} /></button></header>
        <div className="detail-content">
          <div className="detail-overview">
            {item.photoUrl ? <button type="button" className="detail-photo" aria-label={`全螢幕檢視 ${item.name} 的照片`} onClick={() => viewPhoto(item.photoUrl!, item.name)}><img src={item.photoUrl} alt={item.name} /><Expand size={20} className="photo-expand-icon" /></button> : <div className="detail-photo no-photo"><Boxes size={42} /><span>尚無照片</span></div>}
            <dl className="detail-fields">
              <DetailField label="目前庫存" value={`${item.quantity} ${item.unit}`} />
              <DetailField label="狀態" value={statusLabel(item.status)} />
              <DetailField label="分類" value={item.category} />
              <DetailField label="品牌" value={item.brand} />
              <DetailField label="存放位置" value={item.location} />
              <DetailField label="最近購買日期" value={item.purchaseDate} />
              <DetailField label="最近效期" value={item.expiryDate ?? ''} />
              <DetailField label="備註" value={item.notes} />
            </dl>
          </div>
          <section className="detail-batches" aria-labelledby="detail-batches-title">
            <h3 id="detail-batches-title">採購批次 <span>{batches.length}</span></h3>
            {batches.map((batch) => <article className="detail-batch" key={batch.id}>
              <div className="detail-batch-heading"><strong>{batch.purchaseNo}</strong>{batch.photoUrl ? <button type="button" className="batch-photo-button" aria-label={`全螢幕檢視批次 ${batch.purchaseNo} 的照片`} onClick={() => viewPhoto(batch.photoUrl!, `${item.name} · ${batch.purchaseNo}`)}><img src={batch.photoUrl} alt={`${item.name} 批次照片`} /><Expand size={16} /></button> : null}</div>
              <dl className="detail-fields batch-fields">
                <DetailField label="購買日期" value={batch.purchaseDate} />
                <DetailField label="有效期限" value={batch.expiryDate ?? ''} />
                <DetailField label="購入數量" value={`${batch.quantity} ${batch.unit}`} />
                <DetailField label="已領用" value={`${batch.issuedQuantity} ${batch.unit}`} />
                <DetailField label="剩餘數量" value={`${Math.max(0, batch.quantity - batch.issuedQuantity)} ${batch.unit}`} />
                <DetailField label="單價" value={`${batch.currency} ${batch.unitPrice.toFixed(2)}`} />
                <DetailField label="總金額" value={`${batch.currency} ${batch.amount.toFixed(2)}`} />
                <DetailField label="購買來源" value={batch.purchasePlace} />
                <DetailField label="存放位置" value={batch.location} />
                <DetailField label="庫存狀態" value={statusLabel(batch.stockStatus)} />
                <DetailField label="備註" value={batch.notes} />
              </dl>
            </article>)}
          </section>
        </div>
      </div>
    </dialog>
    {photo ? <dialog ref={photoRef} className="photo-lightbox" aria-label={`${photo.label} 全螢幕照片`} onCancel={(event) => { event.preventDefault(); setPhoto(null); }} onClick={(event) => { if (event.target === event.currentTarget) setPhoto(null); }}>
      <header><span>{photo.label}</span><button type="button" className="icon-button" aria-label="關閉全螢幕照片" onClick={() => setPhoto(null)}><X size={26} /></button></header>
      <img src={photo.url} alt={photo.label} />
    </dialog> : null}
  </>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value || '未設定'}</dd></div>;
}
