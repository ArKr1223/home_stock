import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Archive, Boxes, Camera, CircleDollarSign, Download, Edit3, ExternalLink, ImageMinus, LogOut, Menu, PackageOpen, Plus, Search,
  Share2, ShoppingCart, Trash2, Upload, UserRound, X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { CompareForm, IssueForm, PriceDetailForm, PurchaseForm } from './components/Forms';
import { Modal } from './components/Modal';
import { MultiFilter } from './components/MultiFilter';
import { buildInventorySummary, matchesSearch, statusLabel } from './lib/inventory';
import { demoData } from './lib/demoData';
import { isSupabaseConfigured } from './lib/supabase';
import { inventoryRepository } from './repositories/inventoryRepository';
import { EMPTY_DATA, type InventoryData, type PriceHeader, type Purchase } from './types';

type Tab = 'inventory' | 'purchases' | 'issues' | 'compare';
type ModalState =
  | { kind: 'purchase'; purchase?: Purchase }
  | { kind: 'issue'; purchase: Purchase }
  | { kind: 'compare' }
  | { kind: 'price'; header: PriceHeader }
  | null;

const tabs: Array<{ id: Tab; label: string; icon: typeof Boxes }> = [
  { id: 'inventory', label: '庫存', icon: Boxes },
  { id: 'purchases', label: '購買紀錄', icon: ShoppingCart },
  { id: 'issues', label: '領用紀錄', icon: PackageOpen },
  { id: 'compare', label: '拍照比價', icon: Camera },
];

export default function App() {
  const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<InventoryData>(demoMode ? demoData : EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('inventory');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState(new Set<string>());
  const [locationFilter, setLocationFilter] = useState(new Set<string>());
  const [statusFilter, setStatusFilter] = useState(new Set<string>());
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demoMode) { setAuthReady(true); return; }
    if (!isSupabaseConfigured) { setAuthReady(true); return; }
    void inventoryRepository.getSession().then((value) => { setSession(value); setAuthReady(true); });
    const subscription = inventoryRepository.onAuthStateChange((_event, value) => { setSession(value); setAuthReady(true); });
    return () => subscription.unsubscribe();
  }, [demoMode]);

  const reload = useCallback(async () => {
    if (demoMode) return;
    if (!session) return;
    setLoading(true);
    try { setData(await inventoryRepository.loadAll()); }
    catch (error) { setNotice(error instanceof Error ? error.message : '資料載入失敗'); }
    finally { setLoading(false); }
  }, [demoMode, session]);

  useEffect(() => { void reload(); }, [reload]);

  const inventory = useMemo(() => buildInventorySummary(data.purchases), [data.purchases]);
  const categories = useMemo(() => unique(inventory.map((item) => item.category)), [inventory]);
  const locations = useMemo(() => unique(inventory.flatMap((item) => item.location.split('、'))), [inventory]);
  const statuses = useMemo(() => unique(inventory.map((item) => item.status)), [inventory]);
  const filteredInventory = useMemo(() => inventory.filter((item) =>
    matchesSearch(item, deferredSearch)
    && (!categoryFilter.size || categoryFilter.has(item.category))
    && (!locationFilter.size || item.location.split('、').some((value) => locationFilter.has(value)))
    && (!statusFilter.size || statusFilter.has(item.status)),
  ), [inventory, deferredSearch, categoryFilter, locationFilter, statusFilter]);

  async function mutate(action: () => Promise<void>, success: string) {
    try { await action(); setModal(null); if (success) setNotice(success); await reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '操作失敗'); }
  }

  async function exportBackup() {
    try {
      const backup = await inventoryRepository.exportBackup(data);
      const href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = href; anchor.download = `home-inventory-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(href);
      setNotice('備份已下載');
    } catch (error) { setNotice(error instanceof Error ? error.message : '備份失敗'); }
  }

  async function importBackup(file?: File) {
    if (!file || !window.confirm('匯入會合併相同單號，確定繼續？')) return;
    try { await inventoryRepository.importLegacyBackup(JSON.parse(await file.text())); setNotice('舊資料匯入完成'); await reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '匯入失敗'); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }

  if (!authReady) return <div className="center-state">正在確認登入狀態…</div>;
  if (!demoMode && !isSupabaseConfigured) return <SetupScreen />;
  if (!demoMode && !session) return <AuthScreen />;

  return <div className="app-shell">
    <header className="topbar">
      <button className="icon-button mobile-only" onClick={() => setNavOpen(true)} aria-label="開啟選單"><Menu /></button>
      <div className="brand-mark"><Boxes size={24} /><strong>家用庫存管理</strong></div>
      <div className="top-actions">
        <button className="toolbar-button" onClick={exportBackup}><Download size={17} /><span>備份</span></button>
        <button className="toolbar-button" onClick={() => importRef.current?.click()}><Upload size={17} /><span>匯入</span></button>
        <button className="toolbar-button" onClick={() => void mutate(async () => {
          const count = await inventoryRepository.clearUnusedPhotos(data); setNotice(count ? `已清除 ${count} 張未使用照片` : '沒有未使用照片');
        }, '')}><ImageMinus size={17} /><span>清理照片</span></button>
        <input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => void importBackup(event.target.files?.[0])} />
        <span className="user-email"><UserRound size={17} />{session?.user.email ?? '本機預覽'}</span>
        {!demoMode ? <button className="icon-button" onClick={() => void inventoryRepository.signOut()} aria-label="登出" title="登出"><LogOut size={18} /></button> : null}
      </div>
    </header>

    <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
      <div className="mobile-nav-head"><strong>功能</strong><button className="icon-button" onClick={() => setNavOpen(false)} aria-label="關閉選單"><X /></button></div>
      <nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setNavOpen(false); }}><Icon size={19} />{label}</button>)}</nav>
    </aside>
    {navOpen ? <button className="nav-scrim" onClick={() => setNavOpen(false)} aria-label="關閉選單" /> : null}

    <main className="workspace">
      <div className="page-heading">
        <div><h1>{tabs.find((item) => item.id === tab)?.label}</h1><p>{subtitle(tab, filteredInventory.length, data)}</p></div>
        <button className="button primary" onClick={() => setModal(tab === 'compare' ? { kind: 'compare' } : { kind: 'purchase' })}><Plus size={18} />{tab === 'compare' ? '新增比價' : '新增物品'}</button>
      </div>

      {notice ? <div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="關閉通知"><X size={16} /></button></div> : null}

      {tab === 'inventory' ? <>
        <div className="filters">
          <label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋名稱、分類、位置、品牌、備註或狀態" /></label>
          <MultiFilter label="分類" values={categories} selected={categoryFilter} onChange={setCategoryFilter} />
          <MultiFilter label="位置" values={locations} selected={locationFilter} onChange={setLocationFilter} />
          <MultiFilter label="狀態" values={statuses} selected={statusFilter} onChange={setStatusFilter} />
        </div>
        <SummaryBar inventory={inventory} />
        <InventoryTable items={filteredInventory} loading={loading} onAdd={(name) => setModal({ kind: 'purchase', purchase: seedPurchase(name) })} onDelete={(name) => {
          if (window.confirm(`確定刪除「${name}」的所有採購與領用紀錄？`)) void mutate(() => inventoryRepository.deleteInventoryItem(name), '物品已刪除');
        }} />
      </> : null}

      {tab === 'purchases' ? <PurchasesTable purchases={data.purchases} loading={loading} onEdit={(purchase) => setModal({ kind: 'purchase', purchase })} onIssue={(purchase) => setModal({ kind: 'issue', purchase })} onDelete={(purchase) => {
        if (purchase.issuedQuantity > 0) { setNotice('已有領用紀錄的採購不能直接刪除'); return; }
        if (window.confirm(`確定刪除採購 ${purchase.purchaseNo}？`)) void mutate(() => inventoryRepository.deletePurchase(purchase), '採購紀錄已刪除');
      }} /> : null}

      {tab === 'issues' ? <IssuesTable data={data} loading={loading} onDelete={(id) => {
        if (window.confirm('刪除後會回補庫存，確定繼續？')) void mutate(() => inventoryRepository.deleteIssue(id), '領用紀錄已刪除，庫存已回補');
      }} /> : null}

      {tab === 'compare' ? <CompareTable data={data} loading={loading} onAdd={(header) => setModal({ kind: 'price', header })} onDelete={(header) => {
        if (window.confirm(`確定刪除「${header.name}」的比價紀錄？`)) void mutate(() => inventoryRepository.deletePriceHeader(header), '比價紀錄已刪除');
      }} onDeleteDetail={(id) => void mutate(() => inventoryRepository.deletePriceDetail(id), '價格明細已刪除')} onPurchase={(id) => void mutate(() => inventoryRepository.purchaseFromPrice(id, '', data.purchases), '已從比價明細建立採購')} /> : null}
    </main>

    {modal?.kind === 'purchase' ? <Modal title={modal.purchase?.id ? '編輯採購' : '新增物品'} onClose={() => setModal(null)}><PurchaseForm initial={modal.purchase} onCancel={() => setModal(null)} onSubmit={(value) => mutate(() => inventoryRepository.savePurchase({ ...value, name: value.name || modal.purchase?.name || '' }, data.purchases), '採購資料已儲存')} /></Modal> : null}
    {modal?.kind === 'issue' ? <Modal title="新增領用" onClose={() => setModal(null)}><IssueForm purchase={modal.purchase} onCancel={() => setModal(null)} onSubmit={(value) => mutate(() => inventoryRepository.recordIssue(value), '領用完成，庫存已更新')} /></Modal> : null}
    {modal?.kind === 'compare' ? <Modal title="新增拍照比價" onClose={() => setModal(null)}><CompareForm onCancel={() => setModal(null)} onSubmit={(value) => mutate(() => inventoryRepository.savePriceHeader(value, data.priceHeaders), '比價項目已新增')} /></Modal> : null}
    {modal?.kind === 'price' ? <Modal title="新增價格明細" onClose={() => setModal(null)}><PriceDetailForm header={modal.header} onCancel={() => setModal(null)} onSubmit={(value) => mutate(() => inventoryRepository.savePriceDetail(value), '價格明細已新增')} /></Modal> : null}
  </div>;
}

function SetupScreen() {
  return <main className="auth-shell"><section className="auth-panel setup"><div className="brand-mark"><Boxes size={26} /><span>家用庫存管理</span></div><h1>需要連接 Supabase</h1><p>網站程式已可執行。請先建立 <code>.env.local</code> 並填入以下兩個公開設定，再重新啟動開發伺服器。</p><pre>VITE_SUPABASE_URL=…{`\n`}VITE_SUPABASE_PUBLISHABLE_KEY=…</pre><p>資料表與 RLS SQL 位於 <code>supabase/schema.sql</code>。</p></section></main>;
}

function SummaryBar({ inventory }: { inventory: ReturnType<typeof buildInventorySummary> }) {
  const total = inventory.length;
  const low = inventory.filter((item) => item.status === 'low_stock').length;
  const expiring = inventory.filter((item) => item.expiryDate && daysUntil(item.expiryDate) >= 0 && daysUntil(item.expiryDate) <= 30).length;
  const expired = inventory.filter((item) => item.status === 'expired').length;
  return <div className="summary-bar"><div><Boxes /><span>全部物品<strong>{total}</strong></span></div><div><Archive /><span>數量不足<strong>{low}</strong></span></div><div><CircleDollarSign /><span>30 天內到期<strong>{expiring}</strong></span></div><div className="danger"><PackageOpen /><span>已過期<strong>{expired}</strong></span></div></div>;
}

function InventoryTable({ items, loading, onAdd, onDelete }: { items: ReturnType<typeof buildInventorySummary>; loading: boolean; onAdd: (name: string) => void; onDelete: (name: string) => void }) {
  return <TableFrame loading={loading} empty={!items.length} emptyText="找不到符合條件的庫存">
    <table><thead><tr><th>物品</th><th>分類 / 品牌</th><th>庫存</th><th>位置</th><th>最近效期</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.name}>
      <td data-label="物品"><div className="item-cell"><Photo src={item.photoUrl} /><div><strong>{item.name}</strong><small>{item.notes || '無備註'}</small></div></div></td>
      <td data-label="分類 / 品牌">{[item.category, item.brand].filter(Boolean).join(' / ') || '—'}</td><td data-label="庫存"><strong>{formatNumber(item.quantity)}</strong> {item.unit}</td>
      <td data-label="位置">{item.location || '—'}</td><td data-label="最近效期">{item.expiryDate || '—'}</td><td data-label="狀態"><Status value={item.status} /></td>
      <td className="row-actions"><button className="icon-button" title="新增同名採購" onClick={() => onAdd(item.name)}><Plus size={17} /></button><button className="icon-button danger" title="刪除物品" onClick={() => onDelete(item.name)}><Trash2 size={17} /></button></td>
    </tr>)}</tbody></table>
  </TableFrame>;
}

function PurchasesTable({ purchases, loading, onEdit, onIssue, onDelete }: { purchases: Purchase[]; loading: boolean; onEdit: (item: Purchase) => void; onIssue: (item: Purchase) => void; onDelete: (item: Purchase) => void }) {
  return <TableFrame loading={loading} empty={!purchases.length} emptyText="尚無購買紀錄"><table><thead><tr><th>物品 / 單號</th><th>日期</th><th>數量 / 已領用</th><th>價格</th><th>來源 / 位置</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{purchases.map((item) => <tr key={item.id}>
    <td data-label="物品 / 單號"><div className="item-cell"><Photo src={item.photoUrl} /><div><strong>{item.name}</strong><small>{item.purchaseNo}</small></div></div></td><td data-label="日期">{item.purchaseDate}<small className="block">效期 {item.expiryDate || '—'}</small></td>
    <td data-label="數量 / 已領用">{formatNumber(item.quantity)} {item.unit}<small className="block">已領用 {formatNumber(item.issuedQuantity)}</small></td><td data-label="價格">{item.currency} {item.unitPrice.toFixed(2)}<small className="block">合計 {item.amount.toFixed(2)}</small></td>
    <td data-label="來源 / 位置">{item.purchasePlace || '—'}<small className="block">{item.location || '未設定位置'}</small></td><td data-label="狀態"><Status value={item.stockStatus} /></td><td className="row-actions"><button className="icon-button" title="領用" disabled={item.completed} onClick={() => onIssue(item)}><PackageOpen size={17} /></button><button className="icon-button" title="編輯" onClick={() => onEdit(item)}><Edit3 size={17} /></button><button className="icon-button danger" title="刪除" onClick={() => onDelete(item)}><Trash2 size={17} /></button></td>
  </tr>)}</tbody></table></TableFrame>;
}

function IssuesTable({ data, loading, onDelete }: { data: InventoryData; loading: boolean; onDelete: (id: string) => void }) {
  return <TableFrame loading={loading} empty={!data.issues.length} emptyText="尚無領用紀錄"><table><thead><tr><th>物品</th><th>採購單號</th><th>領用日期</th><th>數量</th><th>備註</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{data.issues.map((item) => <tr key={item.id}><td data-label="物品"><strong>{item.itemName}</strong></td><td data-label="採購單號">{item.purchaseNo}</td><td data-label="領用日期">{item.issueDate}</td><td data-label="數量">{formatNumber(item.quantity)}</td><td data-label="備註">{item.notes || '—'}</td><td className="row-actions"><button className="icon-button danger" title="刪除並回補庫存" onClick={() => onDelete(item.id)}><Trash2 size={17} /></button></td></tr>)}</tbody></table></TableFrame>;
}

function CompareTable({ data, loading, onAdd, onDelete, onDeleteDetail, onPurchase }: { data: InventoryData; loading: boolean; onAdd: (item: PriceHeader) => void; onDelete: (item: PriceHeader) => void; onDeleteDetail: (id: string) => void; onPurchase: (id: string) => void }) {
  return <div className="compare-list">{loading ? <div className="center-state">載入中…</div> : !data.priceHeaders.length ? <Empty text="尚無拍照比價紀錄" /> : data.priceHeaders.map((header) => {
    const details = data.priceDetails.filter((detail) => detail.priceHeaderId === header.id);
    return <section className="compare-row" key={header.id}><div className="compare-head"><Photo src={header.photoUrl} large /><div><h2>{header.name}</h2><p>{header.compareNo} · {header.compareDate}</p></div><div className="row-actions"><button className="button secondary small" onClick={() => onAdd(header)}><Plus size={16} />新增價格</button>{header.photoUrl ? <><a className="icon-button" href="https://lens.google.com/" target="_blank" rel="noreferrer" title="開啟圖片搜尋"><ExternalLink size={17} /></a><button className="icon-button" title="分享照片" onClick={() => void sharePhoto(header)}><Share2 size={17} /></button></> : null}<button className="icon-button danger" title="刪除比價" onClick={() => onDelete(header)}><Trash2 size={17} /></button></div></div>
      <div className="price-lines">{details.length ? details.map((detail) => <div key={detail.id}><span><strong>{detail.merchant}</strong><small>{detail.detailDate} · {detail.notes || '無備註'}</small></span><strong>{detail.currency} {detail.unitPrice.toFixed(2)}</strong><span className="row-actions">{detail.purchased ? <span className="purchased">已購買</span> : <button className="button secondary small" onClick={() => onPurchase(detail.id)}><ShoppingCart size={15} />購買</button>}<button className="icon-button danger" onClick={() => onDeleteDetail(detail.id)} title="刪除價格"><Trash2 size={16} /></button></span></div>) : <p className="muted">尚未加入商家價格</p>}</div>
    </section>;
  })}</div>;
}

function TableFrame({ loading, empty, emptyText, children }: { loading: boolean; empty: boolean; emptyText: string; children: React.ReactNode }) {
  if (loading) return <div className="center-state">載入資料中…</div>;
  if (empty) return <Empty text={emptyText} />;
  return <div className="table-frame">{children}</div>;
}

function Empty({ text }: { text: string }) { return <div className="empty-state"><PackageOpen size={30} /><strong>{text}</strong><span>新增資料後會顯示在這裡。</span></div>; }
function Photo({ src, large = false }: { src: string | null; large?: boolean }) { return src ? <img className={`photo ${large ? 'large' : ''}`} src={src} alt="" /> : <div className={`photo placeholder ${large ? 'large' : ''}`}><Boxes size={large ? 26 : 20} /></div>; }
function Status({ value }: { value: Parameters<typeof statusLabel>[0] }) { return <span className={`status ${value}`}>{statusLabel(value)}</span>; }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')); }
function daysUntil(date: string) { return Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86400000); }
function formatNumber(value: number) { return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 3 }).format(value); }
function seedPurchase(name: string): Purchase { return { id: '', purchaseNo: '', photoPath: null, photoUrl: null, name, category: '', brand: '', purchaseDate: new Date().toISOString().slice(0, 10), expiryDate: null, quantity: 1, unit: '件', currency: 'TWD', unitPrice: 0, amount: 0, purchasePlace: '', location: '', notes: '', issuedQuantity: 0, completed: false, stockStatus: 'in_stock' }; }
function subtitle(tab: Tab, visible: number, data: InventoryData) { if (tab === 'inventory') return `${visible} 種物品，可依常用欄位快速搜尋與篩選`; if (tab === 'purchases') return `${data.purchases.length} 筆採購批次與剩餘數量`; if (tab === 'issues') return `${data.issues.length} 筆領用流水紀錄`; return `${data.priceHeaders.length} 個比價項目與商家價格`; }
async function sharePhoto(header: PriceHeader) { try { if (!header.photoUrl) return; if (navigator.share) await navigator.share({ title: header.name, url: header.photoUrl }); else window.open(header.photoUrl, '_blank', 'noopener,noreferrer'); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) throw error; } }
