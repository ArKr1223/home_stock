# 家用庫存管理

這個 repository 保留原本 Expo/SQLite App 的 `App.tsx`，並加入 React + Vite 網站入口。網站版以 Supabase Auth、Postgres 與 Storage 取代裝置內 SQLite 和照片目錄。

## 功能

- 電子郵件登入，單一使用者資料隔離
- 依採購批次管理名稱、分類、品牌、日期、效期、數量、單位、價格、來源、位置、備註與狀態
- 庫存彙總、全文搜尋、分類/位置/狀態多選篩選
- 採購新增、編輯、刪除；領用與自動扣庫存；刪除領用時自動回補
- 拍照比價、商家價格明細、從比價紀錄建立採購
- 私有照片儲存、短效簽名 URL、未使用照片清理
- JSON 備份下載，以及舊版 Expo JSON 備份匯入

## 本機啟動

需求：Node.js 20.19 以上。

1. 在 Supabase SQL Editor 執行 `supabase/schema.sql`。
2. 將 `.env.example` 複製為 `.env.local`，填入專案 URL 與 publishable key。
3. 執行 `npm install`。
4. 執行 `npm run dev`，開啟 `http://127.0.0.1:5173`。

不連接 Supabase 的 UI 預覽可使用 `http://127.0.0.1:5173/?demo=1`。預覽資料只存在程式碼中，不會寫入瀏覽器或資料庫。

## 環境變數

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

前端只能使用 publishable key。請勿把 secret 或 `service_role` key 放進任何 `VITE_` 變數。

## 檢查與建置

```bash
npm run lint
npm test
npm run build
npm run preview
```

## 部署

可將 `npm run build` 產生的 `dist/` 部署到 Netlify、Vercel、Cloudflare Pages 或任何靜態網站主機。建置命令為 `npm run build`，輸出目錄為 `dist`。在部署平台設定相同的兩個環境變數，並在 Supabase **Authentication > URL Configuration** 加入正式網址與 redirect URL。

## 專案結構

- `src/App.tsx`：網站工作區與流程協調
- `src/components/`：登入、表單、modal 與篩選元件
- `src/repositories/inventoryRepository.ts`：唯一的 Supabase 資料存取入口
- `src/lib/inventory.ts`：庫存彙總、搜尋、狀態與單號邏輯
- `supabase/schema.sql`：資料表、索引、RLS、Storage policy 與交易函式
- `MIGRATION.md`：舊資料搬移說明
- 根目錄 `App.tsx`：原 Expo/SQLite 實作，保留供資料格式與手機版維護參照
