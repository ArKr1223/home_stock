# 舊版資料搬移

網站版可直接讀取舊 Expo App 的 JSON 備份，不需手動修改內容。

## 搬移步驟

1. 在舊 App 點選「備份」，取得 `home-inventory` JSON 檔。
2. 完成 Supabase schema 與網站環境變數設定，登入網站。
3. 點選頂端「匯入」，選擇舊備份。
4. 網站會將四組資料映射至 `purchases`、`issues`、`price_headers`、`price_details`，照片 base64 會上傳到私有 `item-photos` bucket。
5. 匯入後核對庫存總量、採購批次、領用紀錄與比價明細，再另外下載一份新版備份。

## 相容規則

- 同時接受 snake_case 與 camelCase 欄位。
- 舊版 `completed: "Y"/"N"` 與 `purchased: "Y"/"N"` 會轉為 boolean。
- 舊版沒有的 `category`、`brand`、`stock_status` 分別使用空字串、空字串與 `in_stock`。
- `photo_uri` 會以備份內的 base64 內容重新上傳，不沿用裝置檔案路徑。
- 相同 `purchase_no` 或 `compare_no` 會更新主資料；其對應的領用/價格明細會以此次匯入內容取代，避免重複匯入造成重複紀錄。

匯入不是刪除整個帳號資料的動作；不在備份中的其他單號會保留。建議匯入前仍先下載目前網站備份。
