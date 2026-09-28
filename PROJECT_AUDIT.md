# 既有 App 盤點與改造對照

## 原始流程與頁面

- 庫存：由未完成採購依物品名稱彙總，顯示照片、數量、單位、位置、採購日、最近效期與備註。
- 購買：新增/修改/刪除採購批次，記錄單號、照片、名稱、日期、效期、數量、單位、幣別、單價、金額、來源、位置與備註。
- 領用：由採購批次建立領用，扣除可用量；刪除領用時回補。
- 拍照比價：建立比價主檔與商家價格明細，可從價格明細轉成採購。
- 工具：未使用照片清理、JSON 備份、JSON 匯入、照片分享/圖片搜尋。

## 原始元件

原 App 集中在根目錄 `App.tsx`，含 `Photo`、`PhotoPicker`、`Field`、`ReadonlyLine`、`ReadonlyAmount`、`HeaderSaveButton`、`ActionButton`、`EmptyState`、`RecordCard` 與五種 modal 狀態。

## 網站對照

- 原 `purchases`、`issues`、`price_headers`、`price_details` 四表保留語意與單號。
- `photo_uri` 改為 Supabase Storage 的 `photo_path`，畫面使用短效 signed URL。
- `issue_quantity` 改名 `issued_quantity`；`completed`、`purchased` 改為 boolean。
- 新增 `user_id`、`category`、`brand`、`stock_status`，支援登入隔離及常用搜尋/篩選。
- 原 SQLite 交易改為 Postgres `record_issue`、`delete_issue`、`purchase_from_price_detail` 原子函式。
- UI 由 React Native 元件換成語意化 HTML；桌面使用側欄與資料表，窄版改為抽屜導覽與資料卡。
