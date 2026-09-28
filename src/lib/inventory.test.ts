import { describe, expect, it } from 'vitest';
import { buildInventorySummary, matchesSearch, nextSerial } from './inventory';
import type { Purchase } from '../types';

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: '1', purchaseNo: '202609001', photoPath: null, photoUrl: null, name: '洗衣精', category: '清潔用品', brand: '測試牌',
  purchaseDate: '2026-09-01', expiryDate: null, quantity: 3, unit: '瓶', currency: 'TWD', unitPrice: 100, amount: 300,
  purchasePlace: '超市', location: '陽台', notes: '補充包', issuedQuantity: 1, completed: false, stockStatus: 'in_stock', ...overrides,
});

describe('inventory summary', () => {
  it('groups active purchases and sums remaining stock', () => {
    const result = buildInventorySummary([purchase(), purchase({ id: '2', purchaseNo: '202609002', quantity: 2, issuedQuantity: 0 })]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(4);
  });

  it('searches category, brand, location, notes and status', () => {
    const item = buildInventorySummary([purchase({ stockStatus: 'low_stock' })])[0];
    for (const keyword of ['洗衣', '清潔', '測試牌', '陽台', '補充包', '數量不足']) expect(matchesSearch(item, keyword)).toBe(true);
  });

  it('keeps the legacy monthly serial format', () => {
    expect(nextSerial(['202609001', '202609003'], '2026-09-28')).toBe('202609004');
  });
});
