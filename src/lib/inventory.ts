import type { InventoryItem, Purchase, StockStatus } from '../types';

const normalize = (value: string) => value.trim().toLocaleLowerCase('zh-Hant');

export function deriveStatus(purchase: Purchase, today = new Date().toISOString().slice(0, 10)): InventoryItem['status'] {
  if (purchase.expiryDate && purchase.expiryDate < today && !purchase.completed) return 'expired';
  if (purchase.completed || purchase.quantity - purchase.issuedQuantity <= 0) return 'out_of_stock';
  return purchase.stockStatus;
}

export function buildInventorySummary(purchases: Purchase[]): InventoryItem[] {
  const grouped = new Map<string, InventoryItem>();
  for (const purchase of purchases) {
    if (purchase.stockStatus === 'archived') continue;
    const remaining = Math.max(0, purchase.quantity - purchase.issuedQuantity);
    if (remaining <= 0) continue;
    const key = normalize(purchase.name);
    const current = grouped.get(key);
    const status = deriveStatus(purchase);
    if (!current) {
      grouped.set(key, {
        name: purchase.name,
        category: purchase.category,
        brand: purchase.brand,
        photoUrl: purchase.photoUrl,
        quantity: remaining,
        unit: purchase.unit,
        location: purchase.location,
        purchaseDate: purchase.purchaseDate,
        expiryDate: purchase.expiryDate,
        notes: purchase.notes,
        status,
        firstPurchaseId: purchase.id,
      });
      continue;
    }
    current.quantity += remaining;
    current.category ||= purchase.category;
    current.brand ||= purchase.brand;
    current.photoUrl ||= purchase.photoUrl;
    current.location = mergeText(current.location, purchase.location);
    current.notes = mergeText(current.notes, purchase.notes);
    if (purchase.purchaseDate > current.purchaseDate) current.purchaseDate = purchase.purchaseDate;
    if (purchase.expiryDate && (!current.expiryDate || purchase.expiryDate < current.expiryDate)) current.expiryDate = purchase.expiryDate;
    current.status = combineStatus(current.status, status);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

function mergeText(left: string, right: string) {
  return [...new Set([left, right].filter(Boolean))].join('、');
}

function combineStatus(left: InventoryItem['status'], right: InventoryItem['status']) {
  const priority: InventoryItem['status'][] = ['expired', 'low_stock', 'in_stock', 'out_of_stock', 'archived'];
  return priority.indexOf(left) <= priority.indexOf(right) ? left : right;
}

export function matchesSearch(item: InventoryItem, search: string) {
  const keyword = normalize(search);
  if (!keyword) return true;
  return [item.name, item.category, item.brand, item.location, item.notes, statusLabel(item.status)]
    .some((value) => normalize(value).includes(keyword));
}

export function statusLabel(status: InventoryItem['status'] | StockStatus) {
  return ({
    in_stock: '庫存充足',
    low_stock: '數量不足',
    out_of_stock: '已用完',
    archived: '已封存',
    expired: '已過期',
  } as const)[status];
}

export function nextSerial(existing: string[], dateText: string, prefix = '') {
  const month = dateText.replaceAll('-', '').slice(0, 6);
  const base = `${prefix}${month}`;
  const next = existing
    .filter((value) => value.startsWith(base))
    .map((value) => Number(value.slice(base.length)))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `${base}${String(next).padStart(3, '0')}`;
}
