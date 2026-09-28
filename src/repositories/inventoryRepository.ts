import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { nextSerial } from '../lib/inventory';
import { supabase } from '../lib/supabase';
import type {
  InventoryData,
  Issue,
  IssueInput,
  PriceDetail,
  PriceDetailInput,
  PriceHeader,
  PriceHeaderInput,
  Purchase,
  PurchaseInput,
} from '../types';

const BUCKET = 'item-photos';

type Row = Record<string, unknown>;

function client() {
  if (!supabase) throw new Error('尚未設定 Supabase 環境變數。');
  return supabase;
}

function message(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function purchaseFromRow(row: Row, photoUrl: string | null = null): Purchase {
  return {
    id: String(row.id), purchaseNo: String(row.purchase_no), photoPath: row.photo_path ? String(row.photo_path) : null, photoUrl,
    name: String(row.name), category: String(row.category ?? ''), brand: String(row.brand ?? ''), purchaseDate: String(row.purchase_date),
    expiryDate: row.expiry_date ? String(row.expiry_date) : null, quantity: Number(row.quantity), unit: String(row.unit ?? ''),
    currency: String(row.currency ?? 'TWD'), unitPrice: Number(row.unit_price), amount: Number(row.amount),
    purchasePlace: String(row.purchase_place ?? ''), location: String(row.location ?? ''), notes: String(row.notes ?? ''),
    issuedQuantity: Number(row.issued_quantity), completed: Boolean(row.completed), stockStatus: row.stock_status as Purchase['stockStatus'],
  };
}

function issueFromRow(row: Row): Issue {
  return {
    id: String(row.id), purchaseId: String(row.purchase_id), purchaseNo: String(row.purchase_no), itemName: String(row.item_name),
    issueDate: String(row.issue_date), quantity: Number(row.quantity), notes: String(row.notes ?? ''),
  };
}

function headerFromRow(row: Row, photoUrl: string | null = null): PriceHeader {
  return {
    id: String(row.id), compareNo: String(row.compare_no), name: String(row.name), photoPath: row.photo_path ? String(row.photo_path) : null,
    photoUrl, compareDate: String(row.compare_date), createdAt: String(row.created_at),
  };
}

function detailFromRow(row: Row): PriceDetail {
  return {
    id: String(row.id), priceHeaderId: String(row.price_header_id), compareNo: String(row.compare_no), merchant: String(row.merchant),
    detailDate: String(row.detail_date), currency: String(row.currency), unitPrice: Number(row.unit_price), purchased: Boolean(row.purchased),
    notes: String(row.notes ?? ''),
  };
}

async function signedUrls(paths: Array<string | null>) {
  const unique = [...new Set(paths.filter((value): value is string => Boolean(value)))];
  const pairs = await Promise.all(unique.map(async (path) => {
    const { data } = await client().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return [path, data?.signedUrl ?? null] as const;
  }));
  return new Map(pairs);
}

async function currentUserId() {
  const { data, error } = await client().auth.getUser();
  message(error);
  if (!data.user) throw new Error('登入狀態已失效，請重新登入。');
  return data.user.id;
}

async function uploadPhoto(file: File) {
  const userId = await currentUserId();
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
  message(error);
  return path;
}

async function removePhotoIfUnused(path: string | null) {
  if (!path) return;
  const [purchases, headers] = await Promise.all([
    client().from('purchases').select('id', { count: 'exact', head: true }).eq('photo_path', path),
    client().from('price_headers').select('id', { count: 'exact', head: true }).eq('photo_path', path),
  ]);
  if (!purchases.count && !headers.count) await client().storage.from(BUCKET).remove([path]);
}

export const inventoryRepository = {
  async getSession() {
    return (await client().auth.getSession()).data.session;
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return client().auth.onAuthStateChange(callback).data.subscription;
  },

  async signIn(email: string, password: string) {
    const { error } = await client().auth.signInWithPassword({ email, password });
    message(error);
  },

  async signUp(email: string, password: string) {
    const { error } = await client().auth.signUp({ email, password });
    message(error);
  },

  async signOut() {
    const { error } = await client().auth.signOut();
    message(error);
  },

  async loadAll(): Promise<InventoryData> {
    const db = client();
    const [purchasesResult, issuesResult, headersResult, detailsResult] = await Promise.all([
      db.from('purchases').select('*').order('purchase_date', { ascending: false }),
      db.from('issues').select('*').order('issue_date', { ascending: false }),
      db.from('price_headers').select('*').order('compare_date', { ascending: false }),
      db.from('price_details').select('*').order('detail_date', { ascending: false }),
    ]);
    message(purchasesResult.error); message(issuesResult.error); message(headersResult.error); message(detailsResult.error);
    const photoMap = await signedUrls([
      ...(purchasesResult.data ?? []).map((row) => row.photo_path),
      ...(headersResult.data ?? []).map((row) => row.photo_path),
    ]);
    return {
      purchases: (purchasesResult.data ?? []).map((row) => purchaseFromRow(row, photoMap.get(row.photo_path) ?? null)),
      issues: (issuesResult.data ?? []).map(issueFromRow),
      priceHeaders: (headersResult.data ?? []).map((row) => headerFromRow(row, photoMap.get(row.photo_path) ?? null)),
      priceDetails: (detailsResult.data ?? []).map(detailFromRow),
    };
  },

  async savePurchase(input: PurchaseInput, existing: Purchase[]) {
    const userId = await currentUserId();
    const previousPhotoPath = input.photoPath;
    const photoPath = input.photoFile ? await uploadPhoto(input.photoFile) : input.photoPath;
    const values = {
      user_id: userId, purchase_no: input.purchaseNo || nextSerial(existing.map((item) => item.purchaseNo), input.purchaseDate),
      photo_path: photoPath, name: input.name.trim(), category: input.category.trim(), brand: input.brand.trim(),
      purchase_date: input.purchaseDate, expiry_date: input.expiryDate || null, quantity: input.quantity, unit: input.unit.trim(),
      currency: input.currency.trim() || 'TWD', unit_price: input.unitPrice, purchase_place: input.purchasePlace.trim(),
      location: input.location.trim(), notes: input.notes.trim(), stock_status: input.stockStatus,
    };
    const query = input.id ? client().from('purchases').update(values).eq('id', input.id) : client().from('purchases').insert(values);
    const { error } = await query;
    message(error);
    if (input.photoFile) await removePhotoIfUnused(previousPhotoPath);
  },

  async deletePurchase(item: Purchase) {
    const { error } = await client().from('purchases').delete().eq('id', item.id);
    message(error);
    await removePhotoIfUnused(item.photoPath);
  },

  async deleteInventoryItem(name: string) {
    const { data, error } = await client().from('purchases').select('id, name, photo_path');
    message(error);
    const matches = (data ?? []).filter((row) => row.name.localeCompare(name, 'zh-Hant', { sensitivity: 'base' }) === 0);
    if (!matches.length) return;
    const { error: deleteError } = await client().from('purchases').delete().in('id', matches.map((row) => row.id));
    message(deleteError);
    await Promise.all(matches.map((row) => removePhotoIfUnused(row.photo_path)));
  },

  async recordIssue(input: IssueInput) {
    const { error } = await client().rpc('record_issue', {
      p_purchase_id: input.purchaseId, p_issue_date: input.issueDate, p_quantity: input.quantity, p_notes: input.notes.trim(),
    });
    message(error);
  },

  async deleteIssue(id: string) {
    const { error } = await client().rpc('delete_issue', { p_issue_id: id });
    message(error);
  },

  async savePriceHeader(input: PriceHeaderInput, existing: PriceHeader[]) {
    const userId = await currentUserId();
    const photoPath = input.photoFile ? await uploadPhoto(input.photoFile) : input.photoPath;
    const compareNo = nextSerial(existing.map((item) => item.compareNo), input.compareDate, 'C');
    const { error } = await client().from('price_headers').insert({
      user_id: userId, compare_no: compareNo, name: input.name.trim(), photo_path: photoPath, compare_date: input.compareDate,
    });
    message(error);
  },

  async deletePriceHeader(item: PriceHeader) {
    const { error } = await client().from('price_headers').delete().eq('id', item.id);
    message(error);
    await removePhotoIfUnused(item.photoPath);
  },

  async clearUnusedPhotos(data: InventoryData) {
    const userId = await currentUserId();
    const used = new Set([...data.purchases, ...data.priceHeaders].map((row) => row.photoPath).filter((path): path is string => Boolean(path)));
    const { data: files, error } = await client().storage.from(BUCKET).list(userId, { limit: 1000 });
    message(error);
    const unused = (files ?? []).map((file) => `${userId}/${file.name}`).filter((path) => !used.has(path));
    if (unused.length) { const { error: removeError } = await client().storage.from(BUCKET).remove(unused); message(removeError); }
    return unused.length;
  },

  async savePriceDetail(input: PriceDetailInput) {
    const userId = await currentUserId();
    const { data: header, error: headerError } = await client().from('price_headers').select('compare_no').eq('id', input.priceHeaderId).single();
    message(headerError);
    if (!header) throw new Error('找不到比價項目。');
    const { error } = await client().from('price_details').insert({
      user_id: userId, price_header_id: input.priceHeaderId, compare_no: header.compare_no, merchant: input.merchant.trim(),
      detail_date: input.detailDate, currency: input.currency.trim() || 'TWD', unit_price: input.unitPrice, notes: input.notes.trim(),
    });
    message(error);
  },

  async deletePriceDetail(id: string) {
    const { error } = await client().from('price_details').delete().eq('id', id);
    message(error);
  },

  async purchaseFromPrice(detailId: string, location: string, existing: Purchase[]) {
    const purchaseNo = nextSerial(existing.map((item) => item.purchaseNo), new Date().toISOString().slice(0, 10));
    const { error } = await client().rpc('purchase_from_price_detail', { p_detail_id: detailId, p_purchase_no: purchaseNo, p_location: location });
    message(error);
  },

  async exportBackup(data: InventoryData) {
    const paths = [...new Set([...data.purchases, ...data.priceHeaders].map((row) => row.photoPath).filter((path): path is string => Boolean(path)))];
    const photos: Record<string, string> = {};
    await Promise.all(paths.map(async (path) => {
      const { data: blob } = await client().storage.from(BUCKET).download(path);
      if (blob) photos[path] = await blobToDataUrl(blob);
    }));
    return { app: 'home-inventory', version: 2, createdAt: new Date().toISOString(), tables: data, photos };
  },

  async importLegacyBackup(raw: unknown) {
    const backup = raw as LegacyBackup;
    if (backup?.app !== 'home-inventory' || !backup.tables) throw new Error('這不是有效的家用庫存備份。');
    const userId = await currentUserId();
    const photoPaths = new Map<string, string>();
    for (const [oldPath, encoded] of Object.entries(backup.photos ?? {})) {
      const blob = await (await fetch(encoded)).blob();
      const extension = blob.type.split('/')[1] || 'jpg';
      const path = `${userId}/import-${crypto.randomUUID()}.${extension}`;
      const { error } = await client().storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
      message(error);
      photoPaths.set(oldPath, path);
    }
    const purchases = (backup.tables.purchases ?? []).map((row) => ({
      user_id: userId, purchase_no: String(row.purchase_no ?? row.purchaseNo), photo_path: photoPaths.get(String(row.photo_uri ?? row.photoPath)) ?? null,
      name: String(row.name), category: String(row.category ?? ''), brand: String(row.brand ?? ''), purchase_date: String(row.purchase_date ?? row.purchaseDate),
      expiry_date: row.expiry_date ?? row.expiryDate ?? null, quantity: Number(row.quantity), unit: String(row.unit ?? ''), currency: String(row.currency ?? 'TWD'),
      unit_price: Number(row.unit_price ?? row.unitPrice ?? 0), purchase_place: String(row.purchase_place ?? row.purchasePlace ?? ''),
      location: String(row.location ?? ''), notes: String(row.notes ?? ''), issued_quantity: Number(row.issue_quantity ?? row.issuedQuantity ?? 0),
      completed: (row.completed === 'Y' || row.completed === true), stock_status: String(row.stock_status ?? row.stockStatus ?? 'in_stock'),
    }));
    if (purchases.length) { const { error } = await client().from('purchases').upsert(purchases, { onConflict: 'user_id,purchase_no' }); message(error); }
    const { data: savedPurchases } = await client().from('purchases').select('id,purchase_no');
    const purchaseIds = new Map((savedPurchases ?? []).map((row) => [row.purchase_no, row.id]));
    const issues = (backup.tables.issues ?? []).map((row) => ({
      user_id: userId, purchase_id: purchaseIds.get(String(row.purchase_no ?? row.purchaseNo)), purchase_no: String(row.purchase_no ?? row.purchaseNo),
      item_name: String(row.item_name ?? row.itemName), issue_date: String(row.issue_date ?? row.issueDate), quantity: Number(row.quantity), notes: String(row.notes ?? ''),
    })).filter((row) => row.purchase_id);
    const importedPurchaseNos = [...new Set(issues.map((row) => row.purchase_no))];
    if (importedPurchaseNos.length) { const { error } = await client().from('issues').delete().in('purchase_no', importedPurchaseNos); message(error); }
    if (issues.length) { const { error } = await client().from('issues').insert(issues); message(error); }
    const headers = (backup.tables.price_headers ?? backup.tables.priceHeaders ?? []).map((row) => ({
      user_id: userId, compare_no: String(row.compare_no ?? row.compareNo), name: String(row.name),
      photo_path: photoPaths.get(String(row.photo_uri ?? row.photoPath)) ?? null, compare_date: String(row.compare_date ?? row.compareDate),
    }));
    if (headers.length) { const { error } = await client().from('price_headers').upsert(headers, { onConflict: 'user_id,compare_no' }); message(error); }
    const { data: savedHeaders } = await client().from('price_headers').select('id,compare_no');
    const headerIds = new Map((savedHeaders ?? []).map((row) => [row.compare_no, row.id]));
    const details = (backup.tables.price_details ?? backup.tables.priceDetails ?? []).map((row) => ({
      user_id: userId, price_header_id: headerIds.get(String(row.compare_no ?? row.compareNo)), compare_no: String(row.compare_no ?? row.compareNo),
      merchant: String(row.merchant), detail_date: String(row.detail_date ?? row.detailDate), currency: String(row.currency ?? 'TWD'),
      unit_price: Number(row.unit_price ?? row.unitPrice), purchased: row.purchased === 'Y' || row.purchased === true, notes: String(row.notes ?? ''),
    })).filter((row) => row.price_header_id);
    const importedCompareNos = [...new Set(details.map((row) => row.compare_no))];
    if (importedCompareNos.length) { const { error } = await client().from('price_details').delete().in('compare_no', importedCompareNos); message(error); }
    if (details.length) { const { error } = await client().from('price_details').insert(details); message(error); }
  },
};

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type LegacyRow = Record<string, unknown>;
type LegacyBackup = {
  app: string;
  tables: { purchases?: LegacyRow[]; issues?: LegacyRow[]; price_headers?: LegacyRow[]; priceHeaders?: LegacyRow[]; price_details?: LegacyRow[]; priceDetails?: LegacyRow[] };
  photos?: Record<string, string>;
};
