import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type TabKey = 'inventory' | 'purchase' | 'issue';
type ModalMode = 'purchase' | 'issue' | 'photoCompare' | 'priceDetail' | 'priceQuery' | null;

type InventorySummary = {
  name: string;
  photoUri: string | null;
  quantity: number;
  unit: string;
  location: string;
  purchaseDate: string;
  expiryDate: string;
  notes: string;
  firstPurchaseNo: string;
};

type PurchaseRow = {
  id: number;
  purchaseNo: string;
  photoUri: string | null;
  name: string;
  purchaseDate: string;
  expiryDate: string;
  quantity: number;
  unit: string;
  currency: string;
  unitPrice: number;
  amount: number;
  purchasePlace: string;
  location: string;
  notes: string;
  issueQuantity: number;
  completed: 'Y' | 'N';
};

type IssueRow = {
  id: number;
  purchaseNo: string;
  itemName: string;
  issueDate: string;
  quantity: number;
  notes: string;
};

type PriceHeaderRow = {
  id: number;
  compareNo: string;
  name: string;
  photoUri: string | null;
  compareDate: string;
  createdAt: string;
};

type PriceDetailRow = {
  id: number;
  compareNo: string;
  merchant: string;
  detailDate: string;
  currency: string;
  unitPrice: number;
  purchased: 'Y' | 'N';
  notes: string;
};

type PurchaseForm = {
  id?: number;
  purchaseNo?: string;
  photoUri: string;
  name: string;
  purchaseDate: string;
  expiryDate: string;
  quantity: string;
  unit: string;
  currency: string;
  unitPrice: string;
  purchasePlace: string;
  location: string;
  notes: string;
};

type IssueForm = {
  purchaseNo: string;
  itemName: string;
  issueDate: string;
  quantity: string;
  notes: string;
  remainingQuantity: number;
};

type PriceDetailForm = {
  compareNo: string;
  detailDate: string;
  merchant: string;
  currency: string;
  unitPrice: string;
  purchased: string;
  notes: string;
};

const db = SQLite.openDatabaseSync('home_inventory.db');
const photoDir = `${FileSystem.documentDirectory ?? ''}item-photos/`;

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = () => new Date().toISOString().slice(2, 10);
const nowText = () => new Date().toISOString();
const trimText = (value: string) => value.trim();
const canUseImageUri = (uri: string | null | undefined): uri is string => !!uri && !uri.startsWith('ph://');
const money = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const qtyText = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: 3 });

const emptyPurchaseForm = (): PurchaseForm => ({
  photoUri: '',
  name: '',
  purchaseDate: shortDate(),
  expiryDate: '',
  quantity: '1',
  unit: '',
  currency: 'TWD',
  unitPrice: '',
  purchasePlace: '',
  location: '',
  notes: '',
});

const emptyIssueForm = (row: PurchaseRow): IssueForm => ({
  purchaseNo: row.purchaseNo,
  itemName: row.name,
  issueDate: shortDate(),
  quantity: '1',
  notes: '',
  remainingQuantity: Math.max(0, row.quantity - row.issueQuantity),
});

const emptyPriceDetailForm = (compareNo: string): PriceDetailForm => ({
  compareNo,
  detailDate: shortDate(),
  merchant: '',
  currency: 'TWD',
  unitPrice: '',
  purchased: 'N',
  notes: '',
});

const parsePositiveNumber = (value: string, label: string) => {
  const number = Number(value.replace(',', '.').trim());
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}必須大於 0`);
  return number;
};

const parseNonNegativeNumber = (value: string, label: string) => {
  const number = Number(value.replace(',', '.').trim());
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}不可小於 0`);
  return number;
};

const ymPrefix = (dateText?: string) => {
  const text = (dateText || shortDate()).trim();
  const match = text.match(/^(\d{2}|\d{4})-(\d{2})-/);
  if (!match) return new Date().toISOString().slice(0, 7).replace('-', '');
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return `${year}${match[2]}`;
};

const tableExists = (name: string) =>
  !!db.getFirstSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name);

const tableHasColumn = (table: string, column: string) =>
  db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).some((item) => item.name === column);

const ensureColumn = (table: string, column: string, sql: string) => {
  if (!tableHasColumn(table, column)) db.execSync(`ALTER TABLE ${table} ADD COLUMN ${sql};`);
};

const nextSerial = (table: 'purchases' | 'price_headers', column: 'purchase_no' | 'compare_no', dateText?: string) => {
  const prefix = ymPrefix(dateText);
  const row = db.getFirstSync<{ max_no: string | null }>(
    `SELECT MAX(${column}) AS max_no FROM ${table} WHERE ${column} LIKE ?`,
    `${prefix}%`
  );
  const next = row?.max_no ? Number(row.max_no.slice(6)) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
};

async function copyPhotoForAppDisplay(sourceUri: string) {
  if (!FileSystem.documentDirectory) return sourceUri;
  await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
  const extMatch = sourceUri.match(/\.(jpg|jpeg|png|heic|webp)(?:\?|$)/i);
  const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
  const destUri = `${photoDir}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

async function savePhotoToCameraRoll(sourceUri: string) {
  const appDisplayUri = await copyPhotoForAppDisplay(sourceUri);
  try {
    const available = await MediaLibrary.isAvailableAsync();
    if (!available) return appDisplayUri;

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('相簿權限未開啟', '照片已存入 App 可讀取的位置，但沒有寫入 DCIM/Camera。');
      return appDisplayUri;
    }

    const asset = await MediaLibrary.createAssetAsync(sourceUri);
    const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
    const mediaUri = assetInfo.localUri || asset.uri;
    if (Platform.OS === 'android' && mediaUri?.startsWith('file://')) return mediaUri;
  } catch (error) {
    console.warn('MediaLibrary save failed', error);
  }

  // iOS may expose saved photos as ph:// assets, which React Native Image cannot render.
  // Keep returning the app-local file:// copy so Android and iPhone both update the UI.
  return appDisplayUri;
}

const isManagedPhoto = (uri: string | null | undefined): uri is string =>
  !!uri && !!FileSystem.documentDirectory && uri.startsWith(photoDir);

const isPhotoReferenced = (uri: string) => {
  const purchase = db.getFirstSync<{ id: number }>('SELECT id FROM purchases WHERE photo_uri = ? LIMIT 1', uri);
  if (purchase) return true;
  const priceHeader = db.getFirstSync<{ id: number }>('SELECT id FROM price_headers WHERE photo_uri = ? LIMIT 1', uri);
  return !!priceHeader;
};

const uniqueManagedPhotos = (rows: Array<{ photo_uri?: string | null }>) => {
  const photos = new Set<string>();
  rows.forEach((row) => {
    if (isManagedPhoto(row.photo_uri)) photos.add(row.photo_uri);
  });
  return [...photos];
};

async function deletePhotoIfUnused(uri: string | null | undefined) {
  if (!isManagedPhoto(uri)) return false;
  const photoUri = uri;
  if (isPhotoReferenced(photoUri)) return false;
  try {
    const info = await FileSystem.getInfoAsync(photoUri);
    if (info.exists) {
      await FileSystem.deleteAsync(photoUri, { idempotent: true });
      return true;
    }
  } catch (error) {
    console.warn('Delete photo failed', error);
  }
  return false;
}

function insertRows(table: string, rows: any[]) {
  rows.forEach((row) => {
    const columns = Object.keys(row);
    if (columns.length === 0) return;
    const placeholders = columns.map(() => '?').join(', ');
    db.runSync(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      ...columns.map((column) => row[column])
    );
  });
}

const mapPurchase = (row: any): PurchaseRow => ({
  id: row.id,
  purchaseNo: row.purchase_no,
  photoUri: row.photo_uri,
  name: row.name,
  purchaseDate: row.purchase_date,
  expiryDate: row.expiry_date ?? '',
  quantity: Number(row.quantity),
  unit: row.unit ?? '',
  currency: row.currency ?? 'TWD',
  unitPrice: Number(row.unit_price ?? 0),
  amount: Number(row.amount ?? 0),
  purchasePlace: row.purchase_place ?? '',
  location: row.location ?? '',
  notes: row.notes ?? '',
  issueQuantity: Number(row.issue_quantity ?? 0),
  completed: row.completed === 'Y' ? 'Y' : 'N',
});

const mapIssue = (row: any): IssueRow => ({
  id: row.id,
  purchaseNo: row.purchase_no,
  itemName: row.item_name,
  issueDate: row.issue_date,
  quantity: Number(row.quantity),
  notes: row.notes ?? '',
});

const mapPriceHeader = (row: any): PriceHeaderRow => ({
  id: row.id,
  compareNo: row.compare_no,
  name: row.name,
  photoUri: row.photo_uri,
  compareDate: row.compare_date ?? '',
  createdAt: row.created_at,
});

const mapPriceDetail = (row: any): PriceDetailRow => ({
  id: row.id,
  compareNo: row.compare_no,
  merchant: row.merchant,
  detailDate: row.detail_date ?? '',
  currency: row.currency ?? 'TWD',
  unitPrice: Number(row.unit_price),
  purchased: row.purchased === 'Y' ? 'Y' : 'N',
  notes: row.notes ?? '',
});

function buildInventorySummary(purchaseRows: PurchaseRow[], keyword = '') {
  const lowerKeyword = keyword.trim().toLowerCase();
  const grouped = new Map<string, InventorySummary>();
  purchaseRows
    .filter((row) => row.completed === 'N')
    .filter((row) => !lowerKeyword || [row.name, row.location, row.notes].some((value) => value.toLowerCase().includes(lowerKeyword)))
    .forEach((row) => {
      const remaining = Number((row.quantity - row.issueQuantity).toFixed(6));
      if (remaining <= 0) return;
      const current = grouped.get(row.name);
      if (!current) {
        grouped.set(row.name, {
          name: row.name,
          photoUri: row.photoUri,
          quantity: remaining,
          unit: row.unit,
          location: row.location,
          purchaseDate: row.purchaseDate,
          expiryDate: row.expiryDate,
          notes: row.notes,
          firstPurchaseNo: row.purchaseNo,
        });
        return;
      }
      current.quantity = Number((current.quantity + remaining).toFixed(6));
      current.unit = mergeText(current.unit, row.unit);
      current.location = mergeText(current.location, row.location);
      current.notes = mergeText(current.notes, row.notes);
      current.photoUri = current.photoUri || row.photoUri;
      if (row.purchaseNo < current.firstPurchaseNo) current.firstPurchaseNo = row.purchaseNo;
      if (row.purchaseDate > current.purchaseDate) current.purchaseDate = row.purchaseDate;
      if (row.expiryDate && (!current.expiryDate || row.expiryDate < current.expiryDate)) current.expiryDate = row.expiryDate;
    });
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || a.firstPurchaseNo.localeCompare(b.firstPurchaseNo));
}

function createCurrentTables() {
  db.execSync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT NOT NULL UNIQUE,
      photo_uri TEXT,
      name TEXT NOT NULL COLLATE NOCASE,
      purchase_date TEXT NOT NULL,
      expiry_date TEXT,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit TEXT,
      currency TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      purchase_place TEXT,
      location TEXT,
      notes TEXT,
      issue_quantity REAL NOT NULL DEFAULT 0 CHECK (issue_quantity >= 0 AND issue_quantity <= quantity),
      completed TEXT NOT NULL DEFAULT 'N' CHECK (completed IN ('Y','N')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT NOT NULL,
      item_name TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (purchase_no) REFERENCES purchases(purchase_no) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS price_headers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compare_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL COLLATE NOCASE,
      photo_uri TEXT,
      compare_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compare_no TEXT NOT NULL,
      merchant TEXT NOT NULL,
      detail_date TEXT,
      currency TEXT,
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      purchased TEXT NOT NULL DEFAULT 'N' CHECK (purchased IN ('Y','N')),
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (compare_no) REFERENCES price_headers(compare_no) ON DELETE CASCADE
    );
  `);
  ensureColumn('price_headers', 'compare_date', 'compare_date TEXT');
  ensureColumn('price_details', 'detail_date', 'detail_date TEXT');
  ensureColumn('price_details', 'currency', 'currency TEXT');
  ensureColumn('price_details', 'purchased', "purchased TEXT NOT NULL DEFAULT 'N' CHECK (purchased IN ('Y','N'))");
}

function migrateLegacyTables() {
  db.execSync('PRAGMA foreign_keys = OFF;');

  const legacyPurchases = tableExists('purchases') && !tableHasColumn('purchases', 'purchase_no')
    ? db.getAllSync<any>('SELECT * FROM purchases ORDER BY purchase_date, id')
    : null;

  if (legacyPurchases) {
    db.execSync('DROP TABLE IF EXISTS purchases;');
  }

  if (tableExists('issues') && !tableHasColumn('issues', 'purchase_no')) {
    db.execSync('DROP TABLE IF EXISTS issues;');
  }

  db.execSync(`
    DROP TABLE IF EXISTS counts;
    DROP TABLE IF EXISTS inventory_items;
  `);
  createCurrentTables();

  if (legacyPurchases) {
    legacyPurchases.forEach((row) => {
      const quantity = Number(row.quantity ?? 0);
      if (!row.name || !Number.isFinite(quantity) || quantity <= 0) return;
      const purchaseDate = row.purchase_date || shortDate();
      const unitPrice = Number(row.unit_price ?? 0);
      const purchaseNo = nextSerial('purchases', 'purchase_no', purchaseDate);
      const stamp = row.created_at || nowText();
      db.runSync(
        `INSERT INTO purchases
         (purchase_no, photo_uri, name, purchase_date, expiry_date, quantity, unit, currency, unit_price, amount, purchase_place, location, notes, issue_quantity, completed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'N', ?, ?)`,
        purchaseNo,
        row.photo_uri || null,
        row.name,
        purchaseDate,
        row.expiry_date ?? '',
        quantity,
        row.unit ?? '',
        'TWD',
        unitPrice,
        Number(row.amount ?? quantity * unitPrice),
        row.purchase_place ?? '',
        row.location ?? '',
        row.notes ?? '',
        stamp,
        stamp
      );
    });
  }

  db.execSync('PRAGMA foreign_keys = ON;');
}

function initDb() {
  migrateLegacyTables();
  createCurrentTables();
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('inventory');
  const [items, setItems] = useState<InventorySummary[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [priceHeaders, setPriceHeaders] = useState<PriceHeaderRow[]>([]);
  const [priceDetails, setPriceDetails] = useState<PriceDetailRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(emptyPurchaseForm());
  const [issueForm, setIssueForm] = useState<IssueForm | null>(null);
  const [comparePhotoUri, setComparePhotoUri] = useState('');
  const [compareName, setCompareName] = useState('');
  const [priceDetailForm, setPriceDetailForm] = useState<PriceDetailForm | null>(null);
  const [queryCompareNo, setQueryCompareNo] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const loadData = useCallback(() => {
    const purchaseRows = db.getAllSync('SELECT * FROM purchases ORDER BY completed, name COLLATE NOCASE, purchase_no, purchase_date DESC, id DESC').map(mapPurchase);
    setPurchases(purchaseRows);
    setIssues(db.getAllSync('SELECT * FROM issues ORDER BY issue_date DESC, id DESC').map(mapIssue));
    setPriceHeaders(db.getAllSync('SELECT * FROM price_headers ORDER BY compare_date DESC, created_at DESC, id DESC').map(mapPriceHeader));
    setPriceDetails(db.getAllSync('SELECT * FROM price_details ORDER BY detail_date DESC, unit_price, id').map(mapPriceDetail));
    setItems(buildInventorySummary(purchaseRows));
  }, []);

  useEffect(() => {
    initDb();
    loadData();
    setReady(true);
  }, [loadData]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const filteredItems = useMemo(() => {
    return buildInventorySummary(purchases, search);
  }, [purchases, search]);

  const closeModal = () => {
    setModalMode(null);
    setPurchaseForm(emptyPurchaseForm());
    setIssueForm(null);
    setComparePhotoUri('');
    setCompareName('');
    setPriceDetailForm(null);
    setQueryCompareNo('');
  };

  const showError = (error: unknown) => {
    Alert.alert('資料檢核失敗', error instanceof Error ? error.message : String(error));
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 1800);
  };

  const handleExitApp = () => {
    BackHandler.exitApp();
  };

  const compareByImage = async (photoUri: string | null | undefined) => {
    if (!canUseImageUri(photoUri)) {
      Alert.alert('尚未有可分享圖片', '請先拍照，或確認此筆資料有可讀取的圖片路徑。');
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('分享功能不可用', '此裝置目前無法開啟圖片分享。');
      return;
    }
    await Sharing.shareAsync(photoUri, {
      dialogTitle: '選擇 Google / Google Lens 進行圖片比價',
      mimeType: 'image/jpeg',
    });
  };

  const takePhoto = async (target: 'purchase' | 'compare') => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相機權限', '請允許相機權限後再拍照。');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const uri = await savePhotoToCameraRoll(result.assets[0].uri);
      if (!canUseImageUri(uri)) {
        Alert.alert('照片路徑無法顯示', '手機回傳的照片路徑無法直接顯示，請再拍一次。');
        return;
      }
      if (target === 'purchase') setPurchaseForm((prev) => ({ ...prev, photoUri: uri }));
      if (target === 'compare') setComparePhotoUri(uri);
    } catch (error) {
      Alert.alert('拍照失敗', error instanceof Error ? error.message : String(error));
    }
  };

  const loadComparePhotoFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相簿權限', '請允許相簿權限後再載入圖片。');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const uri = await copyPhotoForAppDisplay(result.assets[0].uri);
      if (!canUseImageUri(uri)) {
        Alert.alert('圖片路徑無法顯示', '手機回傳的圖片路徑無法直接顯示，請改用拍照。');
        return;
      }
      setComparePhotoUri(uri);
    } catch (error) {
      Alert.alert('載入圖片失敗', error instanceof Error ? error.message : String(error));
    }
  };

  const openPurchase = (item?: InventorySummary) => {
    setPurchaseForm({
      ...emptyPurchaseForm(),
      photoUri: item?.photoUri ?? '',
      name: item?.name ?? '',
      unit: item?.unit ?? '',
      location: item?.location ?? '',
      notes: item?.notes ?? '',
    });
    setModalMode('purchase');
  };

  const openEditPurchase = (row: PurchaseRow) => {
    setPurchaseForm({
      id: row.id,
      purchaseNo: row.purchaseNo,
      photoUri: row.photoUri ?? '',
      name: row.name,
      purchaseDate: row.purchaseDate,
      expiryDate: row.expiryDate,
      quantity: String(row.quantity),
      unit: row.unit,
      currency: row.currency,
      unitPrice: String(row.unitPrice),
      purchasePlace: row.purchasePlace,
      location: row.location,
      notes: row.notes,
    });
    setModalMode('purchase');
  };

  const openIssue = (row: PurchaseRow) => {
    setIssueForm(emptyIssueForm(row));
    setModalMode('issue');
  };

  const queryPurchasesByItem = (itemName: string) => {
    setSelectedItemName(itemName);
    setActiveTab('purchase');
  };

  const savePurchase = () => {
    try {
      const name = trimText(purchaseForm.name);
      if (!name) throw new Error('物品名稱一定要輸入');
      const quantity = parsePositiveNumber(purchaseForm.quantity, '購買數量');
      const unitPrice = purchaseForm.unitPrice.trim() ? parseNonNegativeNumber(purchaseForm.unitPrice, '購買單價') : 0;
      const amount = quantity * unitPrice;
      const stamp = nowText();
      const completed: 'Y' | 'N' = 'N';

      if (purchaseForm.id) {
        const current = db.getFirstSync<any>('SELECT issue_quantity FROM purchases WHERE id = ?', purchaseForm.id);
        const issueQuantity = Number(current?.issue_quantity ?? 0);
        if (issueQuantity > quantity) throw new Error('購買數量不可小於已領出數量');
        db.runSync(
          `UPDATE purchases
           SET photo_uri = ?, name = ?, purchase_date = ?, expiry_date = ?, quantity = ?, unit = ?, currency = ?,
               unit_price = ?, amount = ?, purchase_place = ?, location = ?, notes = ?,
               completed = ?, updated_at = ?
           WHERE id = ?`,
          purchaseForm.photoUri || null,
          name,
          purchaseForm.purchaseDate || shortDate(),
          purchaseForm.expiryDate,
          quantity,
          purchaseForm.unit,
          purchaseForm.currency || 'TWD',
          unitPrice,
          amount,
          purchaseForm.purchasePlace,
          purchaseForm.location,
          purchaseForm.notes,
          issueQuantity === quantity ? 'Y' : completed,
          stamp,
          purchaseForm.id
        );
      } else {
        const purchaseNo = nextSerial('purchases', 'purchase_no', purchaseForm.purchaseDate);
        db.runSync(
          `INSERT INTO purchases
           (purchase_no, photo_uri, name, purchase_date, expiry_date, quantity, unit, currency, unit_price, amount,
            purchase_place, location, notes, issue_quantity, completed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'N', ?, ?)`,
          purchaseNo,
          purchaseForm.photoUri || null,
          name,
          purchaseForm.purchaseDate || shortDate(),
          purchaseForm.expiryDate,
          quantity,
          purchaseForm.unit,
          purchaseForm.currency || 'TWD',
          unitPrice,
          amount,
          purchaseForm.purchasePlace,
          purchaseForm.location,
          purchaseForm.notes,
          stamp,
          stamp
        );
      }

      closeModal();
      loadData();
    } catch (error) {
      showError(error);
    }
  };

  const saveIssue = () => {
    if (!issueForm) return;
    try {
      const quantity = parsePositiveNumber(issueForm.quantity, '領出數量');
      const stamp = nowText();
      db.withTransactionSync(() => {
        const purchase = db.getFirstSync<any>('SELECT * FROM purchases WHERE purchase_no = ?', issueForm.purchaseNo);
        if (!purchase) throw new Error('找不到此購買單號');
        const nextIssueQuantity = Number((Number(purchase.issue_quantity ?? 0) + quantity).toFixed(6));
        if (nextIssueQuantity > Number(purchase.quantity)) throw new Error('領出數量不可大於剩餘數量');
        db.runSync(
          `INSERT INTO issues (purchase_no, item_name, issue_date, quantity, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          issueForm.purchaseNo,
          purchase.name,
          issueForm.issueDate || shortDate(),
          quantity,
          issueForm.notes,
          stamp
        );
        db.runSync(
          `UPDATE purchases SET issue_quantity = ?, completed = ?, updated_at = ? WHERE purchase_no = ?`,
          nextIssueQuantity,
          nextIssueQuantity === Number(purchase.quantity) ? 'Y' : 'N',
          stamp,
          issueForm.purchaseNo
        );
      });
      closeModal();
      loadData();
    } catch (error) {
      showError(error);
    }
  };

  const deletePurchase = (row: PurchaseRow) => {
    Alert.alert('刪除購買資料', `確定刪除 ${row.name}？相關領用記錄也會刪除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const photoUri = row.photoUri;
          db.runSync('DELETE FROM purchases WHERE purchase_no = ?', row.purchaseNo);
          await deletePhotoIfUnused(photoUri);
          loadData();
        },
      },
    ]);
  };

  const deleteIssue = (row: IssueRow) => {
    Alert.alert('刪除領用記錄', `確定刪除 ${row.itemName} 領用 ${qtyText(row.quantity)}？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: () => {
          try {
            db.withTransactionSync(() => {
              const purchase = db.getFirstSync<any>('SELECT * FROM purchases WHERE purchase_no = ?', row.purchaseNo);
              db.runSync('DELETE FROM issues WHERE id = ?', row.id);
              if (purchase) {
                const nextIssueQuantity = Math.max(0, Number((Number(purchase.issue_quantity ?? 0) - row.quantity).toFixed(6)));
                db.runSync(
                  `UPDATE purchases SET issue_quantity = ?, completed = ?, updated_at = ? WHERE purchase_no = ?`,
                  nextIssueQuantity,
                  nextIssueQuantity === Number(purchase.quantity) ? 'Y' : 'N',
                  nowText(),
                  row.purchaseNo
                );
              }
            });
            loadData();
          } catch (error) {
            showError(error);
          }
        },
      },
    ]);
  };

  const deleteInventoryItem = (item: InventorySummary) => {
    Alert.alert('刪除此商品', `確定刪除 ${item.name} 的所有購買與領用記錄？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const photoUris = db
            .getAllSync<{ photo_uri: string | null }>('SELECT photo_uri FROM purchases WHERE name = ? COLLATE NOCASE', item.name)
            .map((row) => row.photo_uri);
          db.runSync('DELETE FROM purchases WHERE name = ? COLLATE NOCASE', item.name);
          for (const uri of photoUris) {
            await deletePhotoIfUnused(uri);
          }
          loadData();
        },
      },
    ]);
  };

  const saveCompareHeader = () => {
    try {
      const name = trimText(compareName);
      if (!name) throw new Error('比價物品名稱一定要輸入');
      const stamp = nowText();
      const compareDate = shortDate();
      const compareNo = nextSerial('price_headers', 'compare_no');
      db.runSync(
        `INSERT INTO price_headers (compare_no, name, photo_uri, compare_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        compareNo,
        name,
        comparePhotoUri || null,
        compareDate,
        stamp,
        stamp
      );
      setCompareName('');
      setComparePhotoUri('');
      loadData();
      showToast('已存檔');
    } catch (error) {
      showError(error);
    }
  };

  const openPriceDetail = (compareNo: string) => {
    setPriceDetailForm(emptyPriceDetailForm(compareNo));
    setModalMode('priceDetail');
  };

  const openPriceQuery = (compareNo: string) => {
    setQueryCompareNo(compareNo);
    setModalMode('priceQuery');
  };

  const savePriceDetail = () => {
    if (!priceDetailForm) return;
    try {
      const merchant = trimText(priceDetailForm.merchant);
      if (!merchant) throw new Error('商家一定要輸入');
      const unitPrice = parseNonNegativeNumber(priceDetailForm.unitPrice, '單價');
      const purchased = 'N';
      db.runSync(
        `INSERT INTO price_details (compare_no, merchant, detail_date, currency, unit_price, purchased, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        priceDetailForm.compareNo,
        merchant,
        priceDetailForm.detailDate || shortDate(),
        priceDetailForm.currency || 'TWD',
        unitPrice,
        purchased,
        priceDetailForm.notes,
        nowText()
      );
      setModalMode('photoCompare');
      setPriceDetailForm(null);
      loadData();
    } catch (error) {
      showError(error);
    }
  };

  const deletePriceHeader = (row: PriceHeaderRow) => {
    Alert.alert('刪除比價單', `確定刪除 ${row.name} / ${row.compareNo}？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const photoUri = row.photoUri;
          db.withTransactionSync(() => {
            db.runSync('DELETE FROM price_details WHERE compare_no = ?', row.compareNo);
            db.runSync('DELETE FROM price_headers WHERE compare_no = ?', row.compareNo);
          });
          await deletePhotoIfUnused(photoUri);
          loadData();
        },
      },
    ]);
  };

  const createPurchaseFromPriceDetail = (row: PriceDetailRow) => {
    const header = priceHeaders.find((item) => item.compareNo === row.compareNo);
    if (!header) {
      Alert.alert('購買失敗', '找不到比價主檔。');
      return;
    }
    try {
      const purchaseDate = row.detailDate || shortDate();
      const stamp = nowText();
      const purchaseNo = nextSerial('purchases', 'purchase_no', purchaseDate);
      db.withTransactionSync(() => {
        db.runSync(
          `INSERT INTO purchases
           (purchase_no, photo_uri, name, purchase_date, expiry_date, quantity, unit, currency, unit_price, amount,
            purchase_place, location, notes, issue_quantity, completed, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', 1, '', ?, ?, ?, ?, '', ?, 0, 'N', ?, ?)`,
          purchaseNo,
          header.photoUri || null,
          header.name,
          purchaseDate,
          row.currency || 'TWD',
          row.unitPrice,
          row.unitPrice,
          row.merchant,
          row.notes,
          stamp,
          stamp
        );
        db.runSync('UPDATE price_details SET purchased = ? WHERE id = ?', 'Y', row.id);
      });
      loadData();
      showToast('已新增至購買');
    } catch (error) {
      showError(error);
    }
  };

  const clearUnusedPhotos = async (silent = false) => {
    try {
      if (!FileSystem.documentDirectory) return;
      const dirInfo = await FileSystem.getInfoAsync(photoDir);
      if (!dirInfo.exists) {
        if (!silent) Alert.alert('清除完成', '目前沒有照片暫存資料。');
        return;
      }
      const files = await FileSystem.readDirectoryAsync(photoDir);
      let deleted = 0;
      for (const file of files) {
        const uri = `${photoDir}${file}`;
        if (!isPhotoReferenced(uri)) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
          deleted += 1;
        }
      }
      if (!silent) Alert.alert('清除完成', `已清除 ${deleted} 個未使用照片。`);
    } catch (error) {
      if (!silent) Alert.alert('清除失敗', error instanceof Error ? error.message : String(error));
    }
  };

  const backupData = async () => {
    try {
      if (!FileSystem.documentDirectory) throw new Error('找不到 App 文件資料夾');
      if (!(await Sharing.isAvailableAsync())) throw new Error('此裝置目前無法分享備份檔');

      const purchaseRows = db.getAllSync<any>('SELECT * FROM purchases ORDER BY id');
      const issueRows = db.getAllSync<any>('SELECT * FROM issues ORDER BY id');
      const priceHeaderRows = db.getAllSync<any>('SELECT * FROM price_headers ORDER BY id');
      const priceDetailRows = db.getAllSync<any>('SELECT * FROM price_details ORDER BY id');
      const photoUris = uniqueManagedPhotos([...purchaseRows, ...priceHeaderRows]);
      const photos: Record<string, string> = {};

      for (const uri of photoUris) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          photos[uri] = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        }
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupUri = `${FileSystem.documentDirectory}home-inventory-backup-${stamp}.json`;
      await FileSystem.writeAsStringAsync(
        backupUri,
        JSON.stringify(
          {
            app: 'home-inventory',
            version: 1,
            createdAt: nowText(),
            tables: {
              purchases: purchaseRows,
              issues: issueRows,
              price_headers: priceHeaderRows,
              price_details: priceDetailRows,
            },
            photos,
          },
          null,
          2
        )
      );

      await Sharing.shareAsync(backupUri, {
        dialogTitle: '分享家用庫存備份檔',
        mimeType: 'application/json',
      });
    } catch (error) {
      Alert.alert('備份失敗', error instanceof Error ? error.message : String(error));
    }
  };

  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const backup = JSON.parse(raw);
      if (backup?.app !== 'home-inventory' || backup?.version !== 1 || !backup?.tables) {
        throw new Error('這不是有效的家用庫存備份檔');
      }

      Alert.alert('匯入備份', '匯入會覆蓋目前手機內的購買、領用、比價資料與照片。確定要匯入嗎？', [
        { text: '取消', style: 'cancel' },
        {
          text: '匯入',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
              const photoMap: Record<string, string> = {};
              const photos = backup.photos && typeof backup.photos === 'object' ? backup.photos : {};
              let photoIndex = 0;

              for (const [oldUri, base64] of Object.entries(photos)) {
                if (typeof base64 !== 'string') continue;
                const extMatch = oldUri.match(/\.(jpg|jpeg|png|heic|webp)(?:\?|$)/i);
                const ext = extMatch?.[1]?.toLowerCase() ?? 'jpg';
                const newUri = `${photoDir}import-${Date.now()}-${photoIndex}.${ext}`;
                photoIndex += 1;
                await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
                photoMap[oldUri] = newUri;
              }

              const mapPhoto = (row: any) => ({
                ...row,
                photo_uri: row.photo_uri && photoMap[row.photo_uri] ? photoMap[row.photo_uri] : row.photo_uri,
              });

              db.withTransactionSync(() => {
                db.runSync('DELETE FROM price_details');
                db.runSync('DELETE FROM price_headers');
                db.runSync('DELETE FROM issues');
                db.runSync('DELETE FROM purchases');
                insertRows('purchases', (backup.tables.purchases ?? []).map(mapPhoto));
                insertRows('issues', backup.tables.issues ?? []);
                insertRows('price_headers', (backup.tables.price_headers ?? []).map(mapPhoto));
                insertRows('price_details', backup.tables.price_details ?? []);
              });

              await clearUnusedPhotos(true);
              loadData();
              Alert.alert('匯入完成', '備份資料已匯入。');
            } catch (error) {
              Alert.alert('匯入失敗', error instanceof Error ? error.message : String(error));
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('匯入失敗', error instanceof Error ? error.message : String(error));
    }
  };

  const visiblePurchases = selectedItemName
    ? purchases.filter((row) => row.name === selectedItemName)
    : search.trim()
    ? purchases.filter((row) => [row.name, row.location, row.notes].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())))
    : purchases;
  const visibleIssues = selectedItemName ? issues.filter((row) => row.itemName === selectedItemName) : issues;

  const queryDetails = priceDetails.filter((row) => row.compareNo === queryCompareNo);
  const queryPriceHeader = priceHeaders.find((row) => row.compareNo === queryCompareNo);
  const priceDetailHeader = priceHeaders.find((row) => row.compareNo === priceDetailForm?.compareNo);
  const detailCount = (compareNo: string) => priceDetails.filter((row) => row.compareNo === compareNo).length;

  if (!ready) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>資料載入中...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerLine}>
          <Text style={styles.title}>家用庫存管理</Text>
          {Platform.OS === 'android' && (
            <Pressable style={styles.exitButton} onPress={handleExitApp}>
              <Text style={styles.exitButtonText}>離開</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.headerLine}>
          <Text style={styles.subtitle}>庫存 {items.length} 項</Text>
          <Pressable style={styles.compareTopButton} onPress={() => setModalMode('photoCompare')}>
            <Text style={styles.compareTopButtonText}>拍照比價</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        <View style={styles.mainTabRow}>
          <Pressable style={styles.tabButton} onPress={() => openPurchase()}>
            <Text style={styles.tabText}>新增</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, activeTab === 'purchase' && styles.tabButtonActive]} onPress={() => {
            setSelectedItemName('');
            setActiveTab('purchase');
          }}>
            <Text style={[styles.tabText, activeTab === 'purchase' && styles.tabTextActive]}>購買</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, activeTab === 'issue' && styles.tabButtonActive]} onPress={() => {
            setSelectedItemName('');
            setActiveTab('issue');
          }}>
            <Text style={[styles.tabText, activeTab === 'issue' && styles.tabTextActive]}>領用</Text>
          </Pressable>
          <Pressable style={[styles.tabButton, activeTab === 'inventory' && styles.tabButtonActive]} onPress={() => {
            setSelectedItemName('');
            setActiveTab('inventory');
          }}>
            <Text style={[styles.tabText, activeTab === 'inventory' && styles.tabTextActive]}>庫存</Text>
          </Pressable>
        </View>
        <View style={styles.utilityRow}>
          <Pressable style={styles.utilityButtonWide} onPress={() => clearUnusedPhotos()}>
            <Text style={styles.cleanPhotoButtonText}>清除未用照片</Text>
          </Pressable>
          <Pressable style={styles.utilityButtonSmall} onPress={backupData}>
            <Text style={styles.cleanPhotoButtonText}>備份</Text>
          </Pressable>
          <Pressable style={styles.utilityButtonSmall} onPress={importBackup}>
            <Text style={styles.cleanPhotoButtonText}>匯入</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={(value) => {
            setSelectedItemName('');
            setSearch(value);
          }}
          placeholder="搜尋物品名稱 / 位置 / 備註"
          placeholderTextColor="#7b8794"
          style={styles.searchInput}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'inventory' &&
          (filteredItems.length === 0 ? (
            <EmptyState text="目前沒有可用庫存，請先新增購買資料。" />
          ) : (
            filteredItems.map((item, index) => (
              <View key={item.name} style={[styles.itemCard, index % 2 === 1 && styles.altCard]}>
                <View style={styles.itemTop}>
                  <Photo uri={item.photoUri} size="full" onDoublePress={() => compareByImage(item.photoUri)} />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.quantity}>
                    {qtyText(item.quantity)} {item.unit}
                  </Text>
                </View>
                {!!item.location && <Text style={styles.meta}>位置：{item.location}</Text>}
                {!!item.notes && <Text style={styles.notes}>備註：{item.notes}</Text>}
                <Text style={styles.lastChangeLine}>購買日期：{item.purchaseDate || '未填'}</Text>
                {!!item.expiryDate && <Text style={styles.lastChangeLine}>保存期限：{item.expiryDate}</Text>}
                <View style={styles.actionRow}>
                  <ActionButton label="新增" tone="primary" onPress={() => openPurchase(item)} />
                  <ActionButton label="刪除" tone="danger" onPress={() => deleteInventoryItem(item)} />
                  <ActionButton label="查詢" tone="neutral" onPress={() => queryPurchasesByItem(item.name)} />
                </View>
              </View>
            ))
          ))}

        {activeTab === 'purchase' &&
          (visiblePurchases.length === 0 ? (
            <EmptyState text="目前沒有購買記錄。" />
          ) : (
            visiblePurchases.map((row, index) => (
              <RecordCard
                key={row.id}
                title={row.name}
                alt={index % 2 === 1}
                lines={[
                  `購買日期：${row.purchaseDate}`,
                  row.expiryDate ? `保存期限：${row.expiryDate}` : '',
                  `數量：${qtyText(row.quantity)} ${row.unit} / 已領：${qtyText(row.issueQuantity)}`,
                  `幣別：${row.currency || 'TWD'} / 單價：${money(row.unitPrice)} / 金額：${money(row.amount)}`,
                  row.purchasePlace ? `購買地點：${row.purchasePlace}` : '',
                  row.location ? `位置：${row.location}` : '',
                  row.notes ? `備註：${row.notes}` : '',
                ]}
                actions={
                  <>
                    {row.completed !== 'Y' && <ActionButton label="領用" tone="warning" onPress={() => openIssue(row)} />}
                    <ActionButton label="修改" tone="neutral" onPress={() => openEditPurchase(row)} />
                    {row.issueQuantity <= 0 && <ActionButton label="刪除" tone="danger" onPress={() => deletePurchase(row)} />}
                  </>
                }
              />
            ))
          ))}

        {activeTab === 'issue' &&
          (visibleIssues.length === 0 ? (
            <EmptyState text="目前沒有領用記錄。" />
          ) : (
            visibleIssues.map((row, index) => (
              <RecordCard
                key={row.id}
                title={row.itemName}
                alt={index % 2 === 1}
                lines={[`領用日期：${row.issueDate}`, `領用數量：${qtyText(row.quantity)}`, row.notes ? `備註：${row.notes}` : '']}
                actions={<ActionButton label="刪除" tone="danger" onPress={() => deleteIssue(row)} />}
              />
            ))
          ))}
      </ScrollView>

      {!!toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <Modal
        visible={modalMode !== null}
        animationType="slide"
        onRequestClose={closeModal}
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === 'purchase'
                  ? purchaseForm.id
                    ? '修改'
                    : '新增'
                  : modalMode === 'issue'
                    ? '領用'
                    : modalMode === 'priceDetail'
                      ? '新增比價'
                      : modalMode === 'priceQuery'
                        ? '比價查詢'
                        : '拍照比價'}
              </Text>
              <View style={styles.modalHeaderActions}>
                {modalMode === 'purchase' && <HeaderSaveButton label="存檔" onPress={savePurchase} />}
                {modalMode === 'issue' && <HeaderSaveButton label="存檔" onPress={saveIssue} />}
                {modalMode === 'photoCompare' && <HeaderSaveButton label="存檔" onPress={saveCompareHeader} />}
                {modalMode === 'priceDetail' && <HeaderSaveButton label="存檔" onPress={savePriceDetail} />}
                <Pressable onPress={modalMode === 'priceDetail' || modalMode === 'priceQuery' ? () => setModalMode('photoCompare') : closeModal} style={styles.closeButton}>
                  <Text style={styles.closeText}>關閉</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardDismissMode="none" keyboardShouldPersistTaps="always" nestedScrollEnabled>
              {modalMode === 'purchase' && (
                <>
                  <PhotoPicker uri={purchaseForm.photoUri} label="開啟相機拍照" onPress={() => takePhoto('purchase')} />
                  <Field label="物品名稱" size="small" value={purchaseForm.name} onChangeText={(name) => setPurchaseForm((prev) => ({ ...prev, name }))} />
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Field label="購買日期" size="small" value={purchaseForm.purchaseDate} onChangeText={(purchaseDate) => setPurchaseForm((prev) => ({ ...prev, purchaseDate }))} />
                    </View>
                    <View style={styles.formColumn}>
                      <Field label="有效日期" size="small" value={purchaseForm.expiryDate} onChangeText={(expiryDate) => setPurchaseForm((prev) => ({ ...prev, expiryDate }))} />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Field label="購買數量" size="small" keyboardType="decimal-pad" value={purchaseForm.quantity} onChangeText={(quantity) => setPurchaseForm((prev) => ({ ...prev, quantity }))} />
                    </View>
                    <View style={styles.formColumn}>
                      <Field label="單位" size="small" value={purchaseForm.unit} onChangeText={(unit) => setPurchaseForm((prev) => ({ ...prev, unit }))} />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Field label="幣別" size="small" value={purchaseForm.currency} onChangeText={(currency) => setPurchaseForm((prev) => ({ ...prev, currency }))} />
                    </View>
                    <View style={styles.formColumn}>
                      <Field label="單價" size="small" keyboardType="decimal-pad" value={purchaseForm.unitPrice} onChangeText={(unitPrice) => setPurchaseForm((prev) => ({ ...prev, unitPrice }))} />
                    </View>
                  </View>
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <ReadonlyAmount value={money((Number(purchaseForm.quantity) || 0) * (Number(purchaseForm.unitPrice) || 0))} label="小計" />
                    </View>
                    <View style={styles.formColumn}>
                      <Field label="購買地點" size="small" value={purchaseForm.purchasePlace} onChangeText={(purchasePlace) => setPurchaseForm((prev) => ({ ...prev, purchasePlace }))} />
                    </View>
                  </View>
                  <Field label="存放位置" size="small" value={purchaseForm.location} onChangeText={(location) => setPurchaseForm((prev) => ({ ...prev, location }))} />
                  <Field label="備註" size="small" multiline value={purchaseForm.notes} onChangeText={(notes) => setPurchaseForm((prev) => ({ ...prev, notes }))} />
                </>
              )}

              {modalMode === 'issue' && issueForm && (
                <>
                  <ReadonlyLine label="物品名稱" value={issueForm.itemName} />
                  <ReadonlyLine label="可領用數量" value={qtyText(issueForm.remainingQuantity)} />
                  <Field label="領用日期" value={issueForm.issueDate} onChangeText={(issueDate) => setIssueForm((prev) => (prev ? { ...prev, issueDate } : prev))} />
                  <Field label="領用數量" keyboardType="decimal-pad" value={issueForm.quantity} onChangeText={(quantity) => setIssueForm((prev) => (prev ? { ...prev, quantity } : prev))} />
                  <Field label="備註" multiline value={issueForm.notes} onChangeText={(notes) => setIssueForm((prev) => (prev ? { ...prev, notes } : prev))} />
                </>
              )}

              {modalMode === 'photoCompare' && (
                <>
                  <PhotoPicker uri={comparePhotoUri} label="開啟相機拍照" onPress={() => takePhoto('compare')} />
                  <Field
                    label="物品名稱"
                    value={compareName}
                    onChangeText={setCompareName}
                    labelAction={
                      <Pressable style={styles.loadImageButton} onPress={loadComparePhotoFromLibrary}>
                        <Text style={styles.loadImageButtonText}>載入圖片</Text>
                      </Pressable>
                    }
                  />
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>比價主檔</Text>
                  </View>
                  {priceHeaders.length === 0 ? (
                    <EmptyState text="目前沒有比價資料。" />
                  ) : (
                    priceHeaders.map((row, index) => (
                      <RecordCard
                        key={row.id}
                        title={row.name}
                        titleRight={String(detailCount(row.compareNo))}
                        alt={index % 2 === 1}
                        photoUri={row.photoUri}
                        fullPhoto
                        lines={[row.compareDate ? `日期：${row.compareDate}` : '']}
                        actions={
                          <>
                            <ActionButton label="新增" tone="primary" onPress={() => openPriceDetail(row.compareNo)} />
                            <ActionButton label="刪除" tone="danger" onPress={() => deletePriceHeader(row)} />
                            <ActionButton label="查詢" tone="neutral" onPress={() => openPriceQuery(row.compareNo)} />
                            <ActionButton label="分享" tone="warning" onPress={() => compareByImage(row.photoUri)} />
                          </>
                        }
                      />
                    ))
                  )}
                </>
              )}

              {modalMode === 'priceDetail' && priceDetailForm && (
                <>
                  <ReadonlyLine label="物品名稱" value={priceDetailHeader?.name ?? ''} />
                  <Field label="日期" value={priceDetailForm.detailDate} onChangeText={(detailDate) => setPriceDetailForm((prev) => (prev ? { ...prev, detailDate } : prev))} />
                  <Field label="商家" value={priceDetailForm.merchant} onChangeText={(merchant) => setPriceDetailForm((prev) => (prev ? { ...prev, merchant } : prev))} />
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Field label="幣別" value={priceDetailForm.currency} onChangeText={(currency) => setPriceDetailForm((prev) => (prev ? { ...prev, currency } : prev))} />
                    </View>
                    <View style={styles.formColumn}>
                      <Field label="單價" keyboardType="decimal-pad" value={priceDetailForm.unitPrice} onChangeText={(unitPrice) => setPriceDetailForm((prev) => (prev ? { ...prev, unitPrice } : prev))} />
                    </View>
                  </View>
                  <Field label="備註" multiline value={priceDetailForm.notes} onChangeText={(notes) => setPriceDetailForm((prev) => (prev ? { ...prev, notes } : prev))} />
                </>
              )}

              {modalMode === 'priceQuery' && (
                <>
                  <ReadonlyLine label="物品名稱" value={queryPriceHeader?.name ?? ''} />
                  {queryDetails.length === 0 ? (
                    <EmptyState text="目前沒有比價明細。" />
                  ) : (
                    queryDetails.map((row, index) => (
                      <RecordCard
                        key={row.id}
                        title={row.merchant}
                        alt={index % 2 === 1}
                        lines={[
                          row.detailDate ? `日期：${row.detailDate}` : '',
                          `幣別：${row.currency || 'TWD'} / 單價：${money(row.unitPrice)}`,
                          row.notes ? `備註：${row.notes}` : '',
                        ]}
                        highlightLine={row.purchased === 'Y' ? '購買否：Y' : ''}
                        actions={
                          <>
                            <ActionButton label="刪除" tone="danger" onPress={() => {
                              db.runSync('DELETE FROM price_details WHERE id = ?', row.id);
                              loadData();
                            }} />
                            <ActionButton label="購買" tone="primary" onPress={() => createPurchaseFromPriceDetail(row)} />
                          </>
                        }
                      />
                    ))
                  )}
                </>
              )}
              <View style={{ height: keyboardHeight ? keyboardHeight + 24 : 0 }} />
            </ScrollView>
          </KeyboardAvoidingView>
          {!!toastMessage && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function mergeText(current: string, next: string) {
  const values = new Set(
    [current, next]
      .flatMap((value) => (value || '').split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return [...values].join(',');
}

function Photo({ uri, onDoublePress, size = 'normal' }: { uri: string | null; onDoublePress?: () => void; size?: 'normal' | 'full' }) {
  const [lastPressAt, setLastPressAt] = useState(0);
  const handlePress = () => {
    const now = Date.now();
    if (now - lastPressAt < 350) {
      onDoublePress?.();
      setLastPressAt(0);
      return;
    }
    setLastPressAt(now);
  };

  const usableUri = canUseImageUri(uri) ? uri : null;
  const content = usableUri ? (
    <Image source={{ uri: usableUri }} style={[styles.photo, size === 'full' && styles.photoFull]} />
  ) : (
    <View style={[styles.photoPlaceholder, size === 'full' && styles.photoFull]}>
      <Text style={styles.photoText}>照片</Text>
    </View>
  );

  if (!onDoublePress || !usableUri) return content;
  return (
    <Pressable style={size === 'full' && styles.photoPressableFull} onPress={handlePress}>
      {content}
    </Pressable>
  );
}

function PhotoPicker({ uri, label, onPress }: { uri: string; label: string; onPress: () => void }) {
  const usableUri = canUseImageUri(uri) ? uri : '';
  return (
    <Pressable style={styles.photoPicker} onPress={onPress}>
      {usableUri ? <Image source={{ uri: usableUri }} style={styles.photoPickerImage} /> : <Text style={styles.photoPickerText}>{label}</Text>}
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  multiline,
  size,
  labelAction,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
  multiline?: boolean;
  size?: 'small' | 'normal';
  labelAction?: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {labelAction}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        style={[styles.input, size === 'small' && styles.inputSmall, multiline && styles.textarea]}
        placeholderTextColor="#8792a2"
      />
    </View>
  );
}

function ReadonlyLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonly}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.readonlyText}>{value}</Text>
    </View>
  );
}

function ReadonlyAmount({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.amountReadonly}>
        <Text style={styles.amountReadonlyText}>{value}</Text>
      </View>
    </View>
  );
}

function HeaderSaveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.headerSaveButton} onPress={onPress}>
      <Text style={styles.headerSaveButtonText}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, tone, onPress }: { label: string; tone: 'neutral' | 'warning' | 'primary' | 'danger'; onPress: () => void }) {
  return (
    <Pressable style={[styles.actionButton, styles[`action_${tone}`]]} onPress={onPress}>
      <Text style={[styles.actionText, tone === 'neutral' && styles.actionTextNeutral]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function RecordCard({
  title,
  titleRight,
  lines,
  highlightLine,
  actions,
  photoUri,
  alt,
  fullPhoto,
}: {
  title: string;
  titleRight?: string;
  lines: string[];
  highlightLine?: string;
  actions: React.ReactNode;
  photoUri?: string | null;
  alt?: boolean;
  fullPhoto?: boolean;
}) {
  return (
    <View style={[styles.recordCard, alt && styles.altCard]}>
      <View style={[styles.recordTop, fullPhoto && styles.recordTopFull]}>
        {photoUri !== undefined && <Photo uri={photoUri} size={fullPhoto ? 'full' : 'normal'} />}
        <View style={styles.recordBody}>
          <View style={styles.recordTitleRow}>
            <Text style={styles.recordTitle}>{title}</Text>
            {!!titleRight && <Text style={styles.recordTitleRight}>{titleRight}</Text>}
          </View>
          {lines.filter(Boolean).map((line) => (
            <Text key={line} style={styles.recordLine}>
              {line}
            </Text>
          ))}
          {!!highlightLine && <Text style={styles.recordHighlightLine}>{highlightLine}</Text>}
        </View>
      </View>
      <View style={styles.actionRow}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f6f8',
    paddingTop: 38,
    paddingBottom: 38,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#354052',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
    gap: 8,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#17202a',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    flex: 1,
    color: '#657285',
    fontSize: 13,
    fontWeight: '800',
  },
  exitButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  exitButtonText: {
    color: '#354052',
    fontWeight: '900',
  },
  compareTopButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#0c7a43',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  compareTopButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  tabs: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  mainTabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  tabButtonActive: {
    backgroundColor: '#17202a',
    borderColor: '#17202a',
  },
  tabText: {
    color: '#354052',
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  utilityButtonWide: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d7de',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7df',
  },
  utilityButtonSmall: {
    width: 72,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d7de',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7df',
  },
  cleanPhotoButtonText: {
    color: '#354052',
    fontWeight: '900',
  },
  searchWrap: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  searchInput: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#fbfcfe',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#17202a',
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 10,
  },
  itemCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7dfea',
    backgroundColor: '#ffffff',
    padding: 12,
    paddingTop: 0,
    gap: 8,
    overflow: 'hidden',
  },
  altCard: {
    backgroundColor: '#e7f3ff',
  },
  itemTop: {
    alignSelf: 'stretch',
    marginHorizontal: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemName: {
    flex: 1,
    color: '#17202a',
    fontSize: 17,
    fontWeight: '900',
  },
  quantity: {
    color: '#0c7a43',
    fontSize: 16,
    fontWeight: '900',
  },
  meta: {
    color: '#657285',
    fontSize: 12,
    lineHeight: 18,
  },
  notes: {
    color: '#354052',
    fontSize: 13,
    lineHeight: 19,
  },
  lastChangeLine: {
    color: '#657285',
    fontSize: 12,
    lineHeight: 18,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
  },
  photoFull: {
    width: '100%',
    height: 300,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  photoPressableFull: {
    width: '100%',
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoText: {
    color: '#657285',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 4,
  },
  actionButton: {
    minHeight: 32,
    minWidth: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  action_neutral: {
    backgroundColor: '#eef1f5',
  },
  action_warning: {
    backgroundColor: '#a85b00',
  },
  action_primary: {
    backgroundColor: '#1f6feb',
  },
  action_danger: {
    backgroundColor: '#b42318',
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  actionTextNeutral: {
    color: '#354052',
  },
  recordCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7dfea',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 8,
  },
  recordTop: {
    flexDirection: 'row',
    gap: 10,
  },
  recordTopFull: {
    flexDirection: 'column',
    width: '100%',
    alignItems: 'center',
  },
  recordBody: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    gap: 4,
  },
  recordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recordTitle: {
    flex: 1,
    color: '#17202a',
    fontSize: 16,
    fontWeight: '900',
  },
  recordTitleRight: {
    minWidth: 28,
    color: '#0c7a43',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  recordLine: {
    color: '#4d596b',
    fontSize: 13,
    lineHeight: 19,
  },
  recordHighlightLine: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  empty: {
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  emptyText: {
    color: '#657285',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 38,
    paddingBottom: 38,
  },
  modalWrap: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#d9dee7',
  },
  modalTitle: {
    flex: 1,
    color: '#17202a',
    fontSize: 22,
    fontWeight: '900',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSaveButton: {
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f6feb',
    paddingHorizontal: 12,
  },
  headerSaveButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: '#1f6feb',
    fontWeight: '800',
  },
  form: {
    paddingHorizontal: 18,
    paddingTop: 0,
    gap: 12,
    paddingBottom: 40,
  },
  field: {
    gap: 6,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formColumn: {
    flex: 1,
    minWidth: 0,
  },
  loadImageButton: {
    minHeight: 26,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
    borderWidth: 1,
    borderColor: '#d0d7de',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  loadImageButtonText: {
    color: '#354052',
    fontWeight: '900',
    fontSize: 13,
  },
  fieldLabelRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    color: '#354052',
    fontWeight: '800',
    fontSize: 13,
  },
  input: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfd6e2',
    backgroundColor: '#fbfcfe',
    color: '#17202a',
    paddingHorizontal: 12,
    fontSize: 16,
  },
  inputSmall: {
    fontSize: 15,
  },
  textarea: {
    height: 76,
    paddingTop: 8,
    paddingBottom: 8,
    lineHeight: 20,
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  readonly: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#f4f6f8',
    padding: 12,
    gap: 4,
  },
  readonlyText: {
    color: '#17202a',
    fontSize: 16,
    fontWeight: '700',
  },
  amountReadonly: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9dee7',
    backgroundColor: '#f4f6f8',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  amountReadonlyText: {
    color: '#17202a',
    fontSize: 16,
    fontWeight: '900',
  },
  photoPicker: {
    minHeight: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfd6e2',
    borderStyle: 'dashed',
    backgroundColor: '#fbfcfe',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPickerImage: {
    width: '100%',
    height: 180,
  },
  photoPickerText: {
    color: '#1f6feb',
    fontWeight: '900',
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#0c7a43',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  sectionHeader: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#d9dee7',
  },
  sectionTitle: {
    color: '#17202a',
    fontSize: 16,
    fontWeight: '900',
  },
  toast: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 58,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: 'rgba(23, 32, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  toastText: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
