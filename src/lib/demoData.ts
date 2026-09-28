import type { InventoryData, Purchase } from '../types';

const purchase = (value: Partial<Purchase> & Pick<Purchase, 'id' | 'purchaseNo' | 'name'>): Purchase => ({
  photoPath: null, photoUrl: null, category: '生活用品', brand: '', purchaseDate: '2026-09-20', expiryDate: null,
  quantity: 1, unit: '件', currency: 'TWD', unitPrice: 0, amount: 0, purchasePlace: '家樂福', location: '儲物間', notes: '',
  issuedQuantity: 0, completed: false, stockStatus: 'in_stock', ...value,
});

export const demoData: InventoryData = {
  purchases: [
    purchase({ id: '1', purchaseNo: '202609001', name: '洗衣精補充包', category: '清潔用品', brand: '白蘭', quantity: 4, unit: '包', unitPrice: 119, amount: 476, location: '陽台櫃', notes: '低泡配方' }),
    purchase({ id: '2', purchaseNo: '202609002', name: '廚房紙巾', category: '生活用品', brand: '舒潔', quantity: 6, unit: '捲', unitPrice: 32, amount: 192, location: '廚房櫃', stockStatus: 'low_stock' }),
    purchase({ id: '3', purchaseNo: '202608003', name: '義大利麵', category: '食品', brand: 'Barilla', quantity: 5, unit: '包', unitPrice: 68, amount: 340, location: '食品櫃', expiryDate: '2026-10-18' }),
    purchase({ id: '4', purchaseNo: '202607006', name: '橄欖油', category: '食品', brand: 'Bertolli', quantity: 2, unit: '瓶', unitPrice: 399, amount: 798, location: '廚房櫃', expiryDate: '2026-09-21' }),
    purchase({ id: '5', purchaseNo: '202609008', name: '洗髮精', category: '個人護理', brand: '思波綺', quantity: 3, unit: '瓶', unitPrice: 269, amount: 807, location: '浴室櫃' }),
  ],
  issues: [{ id: 'i1', purchaseId: '2', purchaseNo: '202609002', itemName: '廚房紙巾', issueDate: '2026-09-25', quantity: 1, notes: '廚房使用' }],
  priceHeaders: [{ id: 'h1', compareNo: 'C202609001', name: '洗衣精補充包', photoPath: null, photoUrl: null, compareDate: '2026-09-26', createdAt: '2026-09-26T08:00:00Z' }],
  priceDetails: [
    { id: 'd1', priceHeaderId: 'h1', compareNo: 'C202609001', merchant: '家樂福', detailDate: '2026-09-26', currency: 'TWD', unitPrice: 119, purchased: true, notes: '會員價' },
    { id: 'd2', priceHeaderId: 'h1', compareNo: 'C202609001', merchant: '全聯', detailDate: '2026-09-26', currency: 'TWD', unitPrice: 125, purchased: false, notes: '' },
  ],
};
