import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headerInsert: vi.fn(), detailInsert: vi.fn(), deleteHeader: vi.fn(),
  upload: vi.fn(), remove: vi.fn(), count: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  from: (table: string) => ({
    insert: table === 'price_headers' ? mocks.headerInsert : mocks.detailInsert,
    delete: () => ({ eq: mocks.deleteHeader }),
    select: () => ({ eq: mocks.count }),
  }),
} }));
import { inventoryRepository } from './inventoryRepository';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headerInsert.mockResolvedValue({ error: null });
  mocks.detailInsert.mockResolvedValue({ error: null });
  mocks.deleteHeader.mockResolvedValue({ error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.count.mockResolvedValue({ count: 0, error: null });
  mocks.remove.mockResolvedValue({ error: null });
});

const input = { name: '洗衣精', compareDate: '2026-10-24', photoPath: 'user-1/photo.jpg', firstPrice: { merchant: '全聯', currency: 'TWD', unitPrice: 129.5, notes: '' } };

describe('savePriceHeader', () => {
  it('links the first price to the newly created photo item', async () => {
    await inventoryRepository.savePriceHeader(input, []);
    const header = mocks.headerInsert.mock.calls[0][0];
    expect(mocks.detailInsert).toHaveBeenCalledWith(expect.objectContaining({ price_header_id: header.id, compare_no: header.compare_no, merchant: '全聯', unit_price: 129.5 }));
  });
  it('removes only the newly created header if the first price fails', async () => {
    mocks.detailInsert.mockResolvedValue({ error: { message: 'permission denied' } });
    await expect(inventoryRepository.savePriceHeader(input, [])).rejects.toThrow('比價金額儲存失敗');
    expect(mocks.deleteHeader).toHaveBeenCalledWith('id', mocks.headerInsert.mock.calls[0][0].id);
  });
  it('does not create an item if photo upload fails', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    await expect(inventoryRepository.savePriceHeader({ ...input, photoFile: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }) }, [])).rejects.toThrow('照片上傳失敗');
    expect(mocks.headerInsert).not.toHaveBeenCalled();
  });
});
