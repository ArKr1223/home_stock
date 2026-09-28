export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'archived';

export type Purchase = {
  id: string;
  purchaseNo: string;
  photoPath: string | null;
  photoUrl: string | null;
  name: string;
  category: string;
  brand: string;
  purchaseDate: string;
  expiryDate: string | null;
  quantity: number;
  unit: string;
  currency: string;
  unitPrice: number;
  amount: number;
  purchasePlace: string;
  location: string;
  notes: string;
  issuedQuantity: number;
  completed: boolean;
  stockStatus: StockStatus;
};

export type Issue = {
  id: string;
  purchaseId: string;
  purchaseNo: string;
  itemName: string;
  issueDate: string;
  quantity: number;
  notes: string;
};

export type PriceHeader = {
  id: string;
  compareNo: string;
  name: string;
  photoPath: string | null;
  photoUrl: string | null;
  compareDate: string;
  createdAt: string;
};

export type PriceDetail = {
  id: string;
  priceHeaderId: string;
  compareNo: string;
  merchant: string;
  detailDate: string;
  currency: string;
  unitPrice: number;
  purchased: boolean;
  notes: string;
};

export type InventoryItem = {
  name: string;
  category: string;
  brand: string;
  photoUrl: string | null;
  quantity: number;
  unit: string;
  location: string;
  purchaseDate: string;
  expiryDate: string | null;
  notes: string;
  status: StockStatus | 'expired';
  firstPurchaseId: string;
};

export type InventoryData = {
  purchases: Purchase[];
  issues: Issue[];
  priceHeaders: PriceHeader[];
  priceDetails: PriceDetail[];
};

export type PurchaseInput = Omit<Purchase, 'id' | 'purchaseNo' | 'photoUrl' | 'amount' | 'issuedQuantity' | 'completed'> & {
  id?: string;
  purchaseNo?: string;
  photoFile?: File | null;
};

export type IssueInput = Pick<Issue, 'purchaseId' | 'issueDate' | 'quantity' | 'notes'>;

export type PriceHeaderInput = Pick<PriceHeader, 'name' | 'compareDate'> & {
  photoFile?: File | null;
  photoPath?: string | null;
};

export type PriceDetailInput = Pick<PriceDetail, 'priceHeaderId' | 'merchant' | 'detailDate' | 'currency' | 'unitPrice' | 'notes'>;

export const EMPTY_DATA: InventoryData = {
  purchases: [],
  issues: [],
  priceHeaders: [],
  priceDetails: [],
};
