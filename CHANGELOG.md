# Noctilucent — Development Changelog

This file preserves the original development history and preview/hotfix notes from the README through v0.1.9. Entries are retained in their original order, including duplicate notes and earlier limitations; consult the current [README](README.md) for the v0.1.9 overview. Features mentioned in older entries may have changed in subsequent versions. These are development notes, not proof of completed in-app testing.


> **閱讀順序：** 以下依版本由舊至新排列（v0.1.1 → v0.1.9）。同版本的 Hotfix 保留原有記錄順序，原始內容與重複條目維持不變。

## 0.1.1 修正版
- 逐文字節點取得選取矩形，合併相鄰同列片段，使用實際批註圖層的座標基準。
- 批註卡片錨定末端圖示，嘗試避開 Vittra 和工具列；手動拖曳後固定。
- 末端圖示移至右上方、縮小；懸停 350ms 顯示已有文字批註的預覽。
- 批註卡片內可修改既有高亮顏色。
- 舊 data.json 格式保留。舊高亮不自動重算；如有偏移，重新選取原文再高亮，或備份後刪除重建。部分重疊的不同選取仍可能是獨立批註。
- 更新前備份 data.json，只覆蓋 main.js、styles.css、manifest.json、README.md，勿刪除原插件資料夾。
- 未在 Obsidian 實機驗證；先用測試 PDF。仍限單頁可選取文字，無 Markdown 同步或 PDF 匯出。


---

## 0.1.2（Undo 版，基於 0.1.1）
- 保留 0.1.1 的高亮座標、渲染、重疊效果與 Vittra 共存設計；不採用先前的 SVG 0.1.2。
- 在 PDF 閱讀區按 Ctrl+Z（macOS Cmd+Z）撤回目前 PDF 本次啟用插件後最近一次高亮新增或重新標記造成的顏色／座標變更。可連續撤回；不撤回既有的手動刪除、卡片色票操作或筆記編輯。
- 文字輸入區不攔截 Ctrl+Z；已附有筆記的新高亮撤回前會確認。撤回後自動儲存並更新各視窗；歷史僅記憶在本次插件工作階段，重啟或停用後清除。
- 更新須保留 data.json。若曾安裝舊 SVG 0.1.2，先備份；本版不主動遷移舊座標。
- 尚未在 Obsidian 實機測試。

## 0.1.2 補充更新：Redo
- Ctrl+Y（macOS Cmd+Y）恢復目前 PDF 最近撤回的高亮或重新標記操作，可連續重做；保留原始 ID、位置、顏色和已儲存的文字批註。
- 新增高亮、重新標記變更、手動刪除或卡片改色會清除該 PDF 的重做歷史。文字編輯區不攔截快捷鍵。
- 撤回及重做歷史均只存在本次插件啟用期間。版本號保持 0.1.2；不改動渲染或 Vittra。


---

# Noctilucent 0.1.3 Preview — Annotation Sidebar
未經 Obsidian 實機驗證的實驗性試用版。請先使用測試 Vault。
安裝：將 noctilucent 資料夾複製到 Vault/.obsidian/plugins/，重啟 Obsidian，於社群插件啟用。無需 Node.js。
操作：選取同頁 PDF 文字，按浮動工具列 ▰ 高亮，或 ＋註 開啟批註。選色後可切換連續模式；點 + 或 ▣ 開啟卡片，可刪除標記。拖曳 ⠿ 移動工具列。文字批註自動儲存。
資料：插件目錄 data.json，原始 PDF 不改寫。請在停用插件後手動備份 data.json；沒有 Markdown 同步、自動備份或匯出功能。勿刪除插件資料夾。依路徑關聯，外部移動/替換 PDF 不保證保留正確位置。
限制：只支援可選取文字、單頁選取、一般方向 PDF；旋轉與縮放須測試。尚未支援正式規格的其他工具、停駐、富文字、跨裝置等。Vittra 未修改；保留原生文字選取，僅註記按鈕接收指標事件。翻譯避讓僅開卡當下嘗試，未保證相容。連續模式可能同時觸發 Vittra 翻譯。
測試：先開啟 PDF 確認 Vittra 翻譯；啟用 Noctilucent，選取文字、翻譯、高亮、開卡、重新開啟 PDF、縮放、停用 Noctilucent 後確認 Vittra。若有問題，停用試用版並保留 data.json。

## 0.1.3 — 批註側邊欄
- 以 0.1.2 Undo/Redo 為基礎，保留既有矩形渲染、座標及資料格式。
- 浮動工具列 ☰、左側 ribbon 螢光筆圖示或命令 Open PDF annotations 可開啟 Obsidian 原生右側欄。預設不開啟。
- 跟隨最近聚焦且仍開啟的 PDF（操作側欄或其他筆記時保留該 PDF）；可鎖定文件，切換 PDF 不改變鎖定目標。鎖定狀態為本次側欄工作階段。
- 全部/有批註/純高亮、八色篩選、搜尋原文及批註、頁碼分組或最新建立排序、緊湊/詳細切換、筆數統計。
- 點原文或 ↗ 跳轉至標記；找不到頁面或標記時會提示。編輯自動儲存、改色、確認後刪除、複製單筆或整份 PDF 所有批註（不受篩選影響）。
- PDF 與側欄共用 data.json；新增、刪除、改色、Undo/Redo 後刷新。側欄文字編輯時避免重建輸入框，失焦後刷新。
- Undo/Redo 仍限原版高亮新增/重新標記；手動刪除、改色、文字編輯未納入復原歷史。
- 尚未在 Obsidian 實機測試，精確跳轉須驗證 PDF 頁面載入、縮放及旋轉。勿覆蓋 data.json。

## 0.1.3 Hotfix
- 工具列在 PDF 容器變更或縮放時自動復掛並限制在可見範圍；命令 Reset floating toolbar 可重設位置。
- 快捷鍵允許目前 PDF 分頁的標頭焦點；不改變文字編輯器的快捷鍵。撤回歷史仍只保留在當次啟用期間。
- 保留 stars 圖示及原始資料格式。尚未實機驗證。

## 0.1.3 快捷鍵修正
- 在 window capture 階段處理 PDF Ctrl+Z/Y，保留文字編輯器。
- 工具列增加 ↶ / ↷，命令面板增加 Undo PDF highlight / Redo PDF highlight。
- 歷史仍限當次工作階段，不會復原重啟前的操作。

## 0.1.3 補充：側欄切換
- 浮動工具列 ☰ 可開啟／收起批註側欄；原生右側欄可用時保留分頁及狀態，其他位置則關閉該分頁。Ribbon 與原開啟指令不變。

## 0.1.3 — Performance Hotfix
- 基於 Sidebar Toggle，保留工具列、Stars、側欄、Undo/Redo、Vittra 共存及既有高亮座標。
- 批註兩種編輯器共用延遲儲存：預設 500ms、持續輸入約 5 秒提交；IME 組字完成才更新正文。手動儲存、Ctrl+S、失焦、關閉卡片或切換 PDF 會提交待寫入資料。自動儲存關閉只停用輸入計時器，其他資料操作及離開編輯器仍提交，以免遺失。
- 設定頁可調整延遲、顯示儲存按鈕及狀態。選項儲存於 data.json 可選的 savePreferences 欄位；items/color/pos 與批註結構不變。
- 寫入序列化且合併待寫入版本；失敗保留記憶體內資料並提示重試。停用時盡力提交，突然關機、強制退出或 I/O 失敗仍可能遺失最近未寫入資料；非交易式磁碟備份。
- 輸入不再觸發全 PDF 掃描；局部同步文字及圖示，閒置後更新搜尋/統計，避免重建有焦點的側欄編輯器。原有 350ms 掃描保留以追蹤 PDF 頁面生命週期，利用版本快取跳過未變更的高亮及側欄計算。
- 更新前備份 data.json；覆蓋 main.js/styles.css/manifest.json/README.md，勿覆蓋資料。未經 Obsidian 實機驗證。

## 0.1.3 — Input Latency Hotfix
- 編輯批註且輸入框有焦點時暫停 350ms 例行 PDF 掃描；離開編輯器後補做刷新。明確執行高亮等操作仍可掃描。
- 輸入時即時更新記憶體資料，其他編輯器、側欄摘要及標記畫面延後至離開編輯器同步。儲存延遲、手動儲存、Ctrl+S、定期儲存不變。
- 儲存狀態優先只更新目前編輯器，清理側欄重建時已移除的編輯器參照。
- 未經 Obsidian 實機效能驗證。若仍延遲，分別測試英文／中文、浮動卡片／側欄、暫停 Vittra 作為診斷；不必永久停用 Vittra。

## 0.1.3 — Overlay Isolation Hotfix
- 以 Input Latency Hotfix 為基礎。浮動批註及懸停預覽掛載於 PDF 外部的固定圖層，沿用 PDF 相對座標及拖曳邊界；視窗大小、PDF 容器尺寸、分頁切換時同步圖層。
- 加入 CSS layout/paint/style containment；編輯器輸入及鍵盤事件不再向外冒泡（捕獲階段監聽器仍可收到）。保留原生文字撤銷、Ctrl+S、IME、500ms 自動儲存、側欄切換及高亮引擎。
- 未改動資料結構、Vittra 或既有批註。先停用插件、備份 data.json，再覆蓋 main.js、styles.css、README.md。
- 語法與封裝檢查不等同 Obsidian 實機測試；需確認輸入延遲、卡片定位、拖曳、切換分頁、預覽、主題及多視窗。CSS containment 不保證消除全域樣式重新計算。


---

# Noctilucent v0.1.4 — Free-position Annotation

以 v0.1.3 Overlay Isolation Hotfix 為基礎。
- Compact UI Hotfix：自由批註圖示改為便利貼；工具列原有八色色票改成兩欄四列。插件側欄與 Ribbon 的 Stars 品牌圖示保留。
- 工具列便利貼（Sticky Note）按鈕開啟單次放置模式；點擊任意已載入 PDF 頁面新增自由批註，Esc 或再次點擊取消。連續高亮會自動關閉。
- 點便利貼開啟原有獨立浮動編輯器；拖曳便利貼可在同一頁內移動，懸停預覽，八色色票改色。
- PDF 無文字選取時右鍵可新增自由批註；Shift+右鍵或選取文字後右鍵使用原生選單。
- 側邊欄新增自由批註篩選與統計，支援搜尋、排序、跳轉、編輯、改色、複製、刪除。
- 自由批註新增、移動、改色及刪除可使用當次工作階段 Undo/Redo；文字編輯仍使用原生文字復原。
- data.json 沿用原有 items 陣列；新項目 type=sticky-note，anchor 為頁面比例座標。舊高亮不遷移。降版前需備份並移除新類型項目，舊版不認識該類型。
- 本版尚未經 Obsidian 實機驗證；請先備份 data.json，尤其測試縮放、旋轉、右鍵選單、拖曳與 Vittra。

### Save & Close Hotfix (v0.1.4)
- Clicking 儲存 in a floating annotation card closes only that card after a successful write (or if already saved). Background autosave, Ctrl+S and sidebar editing keep their existing behavior. Failed writes or changes during the pending save leave the card open. Existing data and UI layout are unchanged.


---

## v0.1.5 — Area Highlight Annotation

- Click the scan tool, drag a rectangle on one PDF page, release to create an area and open the existing floating editor. Esc cancels. The tool exits after one rectangle.
- Default: 15% fill with colored border. Card controls offer fill, border, both, 5–60% opacity, image copy and geometry editing. All eight colors remain available.
- Right-click the area sticky-note marker for edit, move/resize, copy image and delete. In geometry editing mode use the center move handle or eight edge/corner handles; Esc exits. Shift-right-click preserves the native menu.
- Area records use type `area`, normalized `rects` (one rectangle), `rotation`, `areaStyle`, `opacity`. Existing highlight and sticky-note records are not migrated. Do not downgrade with new area records without a backup.
- Image copy crops the currently rendered PDF canvas as PNG without annotation overlays. Requires a rendered canvas and supported ClipboardItem API; resolution follows current canvas, not original vector quality. Rotated/alternate PDF renderers need live verification; no OCR.
- Area history reuses the existing create/update/delete machinery; note text editing retains native textarea undo. The existing portal, save-on-click close and compact toolbar are retained.
- Desktop runtime testing in Obsidian is required, particularly iframe input, rotation and canvas clipboard support, overlapping regions and coexistence with Vittra. Backup data.json before installation.

## v0.1.5 — Area interaction hotfix
- 移除浮動工具列＋註按鈕；文字高亮後仍可從標記開啟批註，命令面板保留 Highlight and comment。連續高亮開關與文字高亮分組。
- 區域調整時，點擊 PDF 其他位置退出，保留已完成的調整；不攔截一般頁面點擊。
- 側邊欄單筆區域批註與浮動卡片的「複製圖片＋批註」採 HTML 內嵌 PNG 及純文字備援。需要富文字貼上支援；Obsidian 等接收端可能僅貼文字，圖片單獨複製仍可使用。未渲染頁面會嘗試跳轉並等待畫布。複製全部仍為文字。
- 未進行 Obsidian 實機驗證。

### Compact toolbar order hotfix
- 文字高亮分組內，連續模式開關移至螢光筆上方；功能與資料格式不變。

## Quote wrap hotfix
PDF 原文卡片、搜尋與複製使用去除 PDF 視覺換行的顯示文字；中文相鄰漢字接合，英文保留單字間空格。原始 text 欄位、PDF 定位及使用者批註換行保持不變。連字號不自動刪除。


## Smart Text Extraction Hotfix (v0.1.5)
- Based on Quote Wrap Hotfix. New text highlights only: store original `text` plus `normalizedText`, `normalizationVersion`, and `normalizationStatus`. No old-item migration or backfill.
- Normalizes visual line breaks and whitespace; infers U+0001 spacing at limited word boundaries. Inference is not font verification. Ambiguous controls are rendered as visible Unicode code markers; mathematical operators are not guessed.
- Sidebar search/display and copy use the cached new quote; old quotes retain their previous behavior. New unresolved quotes show a warning. Setting applies prospectively only.
- No new PDF scan, font parser, OCR, timers or changes to overlay/geometry. Font-level recovery is not implemented because the selection does not carry a verified glyph mapping.

## v0.1.5 — Font-aware Recovery & Smart Geometry Preview (experimental)

此版本是獨立測試 ZIP，沿用 Smart Text Extraction Hotfix 的插件 ID 與版本號，不是可與穩定版同時啟用的第二套插件。建議在測試 Vault 使用，或備份原版 main.js、README.md 及 data.json 後測試。CSS / manifest 與前版相同。

- 設定 → PDF 文字擷取：新增「實驗：字型感知符號還原」及「實驗：智慧高亮缺口接合」，預設開啟，均只作用於新高亮。可獨立關閉。符號還原還需要「新高亮文字容錯」開啟。
- 驗證優先路徑：對兩份已分析的 Economos 2007 PDF（英文及雙語）使用原始檔 SHA-256、頁碼、選取文字的短上下文 SHA-256，以及經字型 Encoding Differences / 原始畫面核對的映射。索引內不含全文、檔名、個人路徑或 PDF 本體；只有雜湊與符號。不同版本的 PDF 即使檔名相同也不會套用這個資料表。既有上下文可能不唯一或選取太短，仍會保留警告。
- 通用路徑：從 Obsidian 私有 PDFViewerChild.getPage 取得 PDF.js page proxy，僅在異常新高亮且沒有驗證樣本命中時嘗試。要求該頁文字唯一匹配、字型識別碼與 operator list 原始字元代碼、字形名稱證據及控制字元次數一致；不以字型名稱或控制碼單獨猜測。Obsidian / PDF.js 未暴露相關資料時安全退回原版正規化與警告，不保證其他 PDF 能還原。參考 PDF++ 公開 typings (https://github.com/RyotaUshio/obsidian-pdf-plus/blob/master/src/typings.d.ts) 與 PDF.js issue 15651 / 21968；未引入這些專案的程式庫。
- 保留 original text；新還原結果寫入 normalizedText、normalizationVersion、normalizationStatus、symbolRecoveryMethod / Count。無批次移轉、不修改 PDF、不改寫舊批註。原版 U+0001 間距推定保持原樣。
- 智慧接合使用原本矩形引擎，只在連續選取節點含控制字元且鄰接正常矩形位於同一行、間距與垂直位置合格時接合；保留大欄距。最多 2 個連續控制字元節點，間距上限為行高的 1.4 倍且不超過 28 CSS px。此保守門檻可能仍留下部分缺口，極窄欄距仍需實機檢查，不保證任意 PDF 排版。舊矩形不會自動重繪或修復。
- 無新定時器、OCR、AI、網路請求、第三方函式庫。快取最多 8 個文件雜湊；同時最多 2 次辨識；大於 16,000 字元或 64 個異常字元的選取保留警告、不作進階辨識。已開始的 PDF.js 工作可能在編輯開始後完成；編輯期間不提交辨識結果，退出編輯後透過既有流程提交。未量測 Obsidian 實機耗時。
- 在命令面板執行 `Noctilucent: Symbol recovery preview diagnostics`，在開發者工具 Console 查看最近一次辨識摘要（method, recovered, geometryBridges, verifiedSample, nativePage, uniqueText, namedGlyphs, unknownGlyphs；無原文或路徑）。`verified-sample` 是樣本映射成功；`native-glyph` 是通用介面取得字形證據；`none` 是未成功。若同一段已存在舊高亮，請選取未標記的新範圍，或在測試 Vault 使用 PDF 副本。
- 測試：Economos 英文及雙語 PDF p.1 的 n = 1178、7.6 ± 1.0、−0.1005 (p = 0.001)；p.5 的 α、χ 與小於；p.8 的 β；正常 Salvo 英文。亦需測試原有 Vittra、輸入、區域高亮與側欄。驗證版完成 24 組 Node 檢查（包含實際 PDF 雜湊與字型索引、合成矩形、舊 283 筆資料不變），不是 Obsidian 實機驗收。

## v0.1.5 — Diagnostic Logging Hotfix
- 不改動符號映射與高亮接合判斷，新增成功接合的像素距離、原始字元、還原值、未辨識字元及整理後文字。
- verified-sample 索引不含字型名稱，診斷以 null 明示，不推測字型。native-glyph 路徑可記錄實際 fontId。
- 原有 Symbol recovery preview diagnostics 命令輸出最近一次完成的辨識；Copy symbol recovery diagnostics 可複製本次工作階段最近 20 筆完成的診斷 JSON。包含選取原文，分享前請檢查。
- 不寫入診斷檔、不掃描舊批註、不新增背景計時器。重新載入會清空診斷歷史。

## v0.1.5 — Mixed-script Normalization Hotfix
- 以 Diagnostic Logging Hotfix 為基礎；僅處理新高亮的文字正規化，不改動原有數學符號映射、幾何接合、UI、CSS 或 manifest。
- Economos 2007 雙語 PDF 的 Source Han Serif TW 空白字形已從內嵌字型及字元座標核對（glyph ID 1、無輪廓且有正常空格字寬）。新增該 PDF 的 SHA-256、頁碼和不含原文的上下文雜湊索引；同一上下文出現非空白字形則不收錄。只有原先未辨識的控制字元且有此樣本證據時，才轉為正常空格；既有符號映射優先，原有間距規則保留。其他 PDF、無法匹配的選取或未知控制字元仍可能顯示警告。此為有限樣本修正，非通用空白字形辨識。
- 診斷新增 verifiedSpaces 計數，otherControls 可標示 spacing-verified；未辨識列表與最終正規化結果使用同一套分類。數學符號 recovered 計數不包含空格。
- 保留原始 text 與既有批註，不新增掃描或計時器。索引按需解析並快取。不做上標或英文斷字修復，不額外插入原始文字沒有的中英文間距。
- 已用使用者提供的三組中文及三組英文 rawText 進行 Node 離線回歸測試：χ 前方、α 後方的異常控制字元轉為空格，χ2 保留原樣；未知 PDF 或頁碼不套用索引。尚未實機量測或驗收。



---

## v0.1.6 — Office Persistent Comment Markers Hotfix

- DOCX / PPTX：每一筆能安全重新定位的文字高亮，皆顯示與 PDF 類似的小型方框「+」批註入口；有筆記時顯示「▣」。不再只顯示最新一筆。
- 切換投影片、文件重開、卷動或視窗重新排版時，標記會依文字錨點重算；無法安全定位不顯示標記，但保留資料。
- 標記與批註仍存於原有 data.json。Office 文件位元不修改。
- 未更動 Homepage 排除、Markdown 閱讀模式限制、PDF 功能或 Vittra。
- 效能：共用一個 Office 滾動定位監聽，不對每個標記增加 timer/observer。大量批註效能仍需實機驗證。
- 安裝前備份原插件資料夾與 data.json。僅覆蓋 main.js、styles.css、manifest.json、README.md。
- 本版已檢查 JavaScript 語法與靜態測試，尚待 Obsidian 實機驗證。

## v0.1.6 — Markdown Reading View Text-only Preview
- 只在 Obsidian Markdown **閱讀模式**啟用文字高亮與文字批註；編輯模式不呈現 Noctilucent 的 Markdown 工具列、標記或卡片。PDF 功能維持不變。
- 在閱讀模式中選取同一段落內的文字，再按上方「▰」（純文字高亮）或「註」（文字高亮＋批註），或用命令面板的 Markdown Reading View 指令。八種色票與批註側邊欄可用。**不支援 Markdown 區域高亮與自由批註**。
- 使用瀏覽器 CSS Custom Highlight API 將選取區段著色，不修改 Markdown 原始檔或閱讀模式的文字 DOM。標記與批註儲存在插件自己的 `data.json`，請備份原有 `data.json`；重新進入閱讀模式時嘗試重新匹配。
- 錨點結合原文、段落索引、位移及前後文；純粹在其他段落增加文字，或在原文之前修改且保留相關前後文時，通常可以重新定位。若被標記的原文已修改、重複匹配或上下文不足以安全判別，會暫時不顯示高亮，仍保留批註資料，**不自動移到其他位置**。
- 第一版只支援同一段落的純文字；不支援跨段落、程式碼、LaTeX 數學渲染區塊或複雜嵌入。Obsidian 1.15.1 的實機行為、文件改動後重新定位與高亮瀏覽器支援仍需驗證。
- 不新增來源 Markdown 寫入，不重新處理舊 PDF 批註，不改動 Vittra；保留原有 PDF 的所有功能。


## v0.1.6 Markdown 浮動工具列與連續高亮更新

- Markdown 閱讀模式的工具列改為浮動式，可用 ⠿ 拖曳；位置獨立儲存於 `mdToolbarPos`（不影響 PDF 工具列位置）。
- 「連續：開」時，在閱讀模式以滑鼠選取單一段落中的文字即自動建立高亮；再次點擊或按 Esc 停用。
- 「連續：關」時，先選取文字，再按 ▰ 手動高亮或「註」新增文字批註。
- 保留 8 色、撤回／重做與側邊欄。沒有自由批註和區域高亮工具。
- 切換至編輯模式將移除 Markdown 工具列與高亮視覺；批註保存在插件資料中，閱讀模式重新以原文與上下文安全定位。
- 命令「Reset floating toolbar」同時重設 PDF 與 Markdown 各自的工具列位置。

## v0.1.6 Compatibility Preview — Homepage / Markdown / Office Viewer

基於 `Noctilucent-0.1.6-floating-toolbar-continuous-hotfix`，保留既有 PDF 功能及全部批註資料。

- **Homepage**：任何 basename 為 `Homepage.md`（不分大小寫）的 Markdown 檔案，在閱讀模式也不啟用 Noctilucent 工具列或文字高亮；不修改或刪除既有資料。
- **Markdown**：沿用可拖曳浮動工具列、連續高亮開關、八色、復原／重做與側邊欄；移除工具列「註」按鈕。可點選已有高亮打開批註卡片，另保留命令面板的「Highlight and comment in Markdown Reading View」。不提供自由與區域批註，編輯模式不啟用插件。
- **Office Viewer（相容性預覽）**：只在專用 `.docx` / `.pptx` 檢視分頁有實際可選取的 DOM 文字區塊、支援 CSS Highlights 並通過安全檢查時掛載浮動工具列；標記、批註存在 Noctilucent `data.json`，不修改 Office 文件。使用原文、段落序號與前後文嘗試定位，無法唯一重新定位時不繪製標記。
- **限制**：Office Viewer 使用不同的渲染引擎；DOCX 大型文件的分段載入、PPTX 投影片換頁及非 DOM 文字可能無法掛載或無法重新定位。這是相容性**技術預覽**，未經 Office Viewer 實機測試，不應視為全面支援。若無法掛載，請提供畫面與 Office Viewer 版本，勿在重要文件上首先測試。
- **資料**：`data.json` 不在安裝 ZIP 內。升級前先備份原本 `data.json`。即使移除原始檔，也不會自動刪掉批註。


## v0.1.6 — Homepage emoji / Office Viewer PPTX follow-up
- 修正 Homepage 排除條件：`Homepage.md`、`🏠 Homepage.md` 等 Emoji 前綴檔名、分頁標題，以及 `type: homepage` 或 `cssclasses: pc-homepage` 均不顯示 Markdown 閱讀工具列或高亮；不刪除任何舊批註。
- Office Viewer PPTX 使用官方 `.pptx-viewer__slide` 目前投影片容器，不再誤用 DOCX 的一般段落判定。只在 Office Viewer 主檢視分頁啟用；不支援 PPTX 內嵌至 Markdown 的情境。
- 針對 PPTX 的 DOM 文字與 SVG 文字提供保守的單一文字區塊擷取。高亮附加投影片可見文字的指紋，切換頁面時若無法確定同一張投影片就不繪製，防止標錯頁面。若投影片中文字是純圖片或 Canvas 圖像則無法進行文字高亮；不採 OCR、不改動 Office 原檔。
- Office Viewer 檢視內容改變後更新定位，保留 DOCX、Markdown、PDF 既有邏輯。此為技術測試版，仍需使用者 Obsidian 實機驗證 PPTX 選取與跨頁重新定位。


### 2026-11-23 Office add-comment action hotfix
- DOCX and PPTX: a small `＋` action is displayed beside the most recently created text highlight, opening the existing annotation card. Existing highlights can still be clicked to edit their notes.
- PPTX highlights created in this build are now saved as `office-highlight` instead of `markdown-highlight`; legacy PPTX data remains readable.
- Office Viewer text that is rasterized or not exposed as selectable text still cannot be safely highlighted; slide DOM variations may limit selection to a text block.
- No change to Homepage suppression, PDF annotation features, Vittra, or `data.json` schema.


### v0.1.6 Office Card Parity Hotfix
- DOCX/PPTX comment cards have the same eight-colour in-card highlight palette as PDF. Colour changes update persistent Office markers and highlights without modifying the Office file.
- Show the shared autosave status and Save button; clicking Save closes the card **only after** the save has been confirmed. Autosave and Ctrl+S still do not close it.
- Add Copy quote + note and Delete highlight controls, mirroring PDF while preserving existing persistent comment markers.
- Homepage exclusion, Markdown reading-only behavior, Office viewer compatibility, PDF and Vittra behavior remain unchanged.

### v0.1.6 Office card save-status and drag hotfix
- DOCX/PPTX comment cards continue to use the PDF shared saved/pending/writing/error status and Save & Close controls.
- Hold left **or right** mouse button on the card heading to move the card; right-click context menu is suppressed only on the heading.
- Dragging is constrained to the Office reading pane; it never writes to DOCX/PPTX or annotation data.
- Existing PDF, Markdown highlighter, Homepage exclusion, and annotations remain unchanged.

## v0.1.6 Reading & Office Card Parity Preview — 2026-11-23

PDF remains the canonical interface and is not changed in this release. For Markdown Reading View and Office Viewer DOCX/PPTX:

- Persistent 12px annotation markers for every safely located text highlight; `+` on an empty note and `▣` when a note exists. Markdown edit mode and excluded Homepage remain untouched.
- Hover or keyboard-focus a marker to preview its **existing note** without opening an editor; avoid hover popups on the highlighted words to reduce conflicts with dictionary/translation plugins.
- Each document pane can open multiple independent annotation cards. Clicking a marker for an already-open note raises and focuses that card instead of creating a duplicate.
- Both Markdown and Office card headers support left/right-button drag. The entire card supports CSS corner-resizing (minimum 260px by 190px); content edits and note saving stay as before.
- Remove duplicate selected-source quotation from the edit card, while preserving it in the data store and sidebar.
- Existing autosave, Ctrl+S, Save-and-Close, eight colors, copy, and delete interactions remain in place. Neither Markdown source files nor Office source files are modified.

**Preview caveats:** This build passes offline JavaScript/structural checks only. Test on a copied Vault first. PDF rendering/positioning is unchanged. Native Office Viewer PPTX text may not be selectable in all text boxes. Cards/markers are reconstructed on leaving and reentering a reading pane. Hover previews are text-only and do not include the original selected quote.

- Office Viewer 與 Markdown 閱讀模式的批註卡片現在沿用 PDF 版本的四段式儲存狀態文案：等待儲存、儲存中…、已儲存、儲存失敗 · 請重試。

### v0.1.6 Office／Markdown 閱讀模式快捷鍵
- `Ctrl+Z`：撤回目前 Word／PowerPoint／Markdown 閱讀畫面的最近一次文字高亮新增或顏色變更。
- `Ctrl+Y`：重做相同操作。Mac 可使用 `Cmd+Z`／`Cmd+Y`。
- 批註輸入框、編輯模式、其他插件的輸入元件繼續使用自己的原生編輯復原，不攔截文字鍵入。
- 撤回帶有文字批註的高亮前仍會詢問確認。僅保存本次 Obsidian 工作階段的撤回歷史；`data.json` 既有紀錄不變。

### v0.1.6 Sidebar Management Preview — 2026-11-23

This update builds on `Noctilucent-0.1.6-office-md-undo-redo-hotfix.zip` and preserves the PDF-first interface, Office Viewer, Markdown Reading View, and the original data structure.

- **Search scope:** the existing sidebar search supports `原文＋批註`, `僅原文`, and `僅批註`. All searches apply only to the selected document; existing color and type filters still apply.
- **Pin annotations:** the small pin on each sidebar row pins that annotation above unpinned rows, to a maximum of three **per source document**. Pure highlights and notes can both be pinned. Pin state is stored as the optional `pinnedAt` field on the annotation; no data migration is needed.
- **Bulk-open / close cards:** only annotations with nonempty note text are eligible. A second click closes only cards opened by that bulk action, preserving already-open manually created cards. More than twelve notes requires confirmation. Only safely resolved/loaded locations are opened; offscreen, unloaded, or ambiguous PDF/Office/Markdown anchors are skipped rather than opening cards at incorrect locations.
- **Delete current document:** a confirmation names the file and count. It first flushes pending saves and writes a **full** independent `data.json` snapshot to `.obsidian/plugins/noctilucent/backups/before-delete-*.json` (actual config directory when customized). If backup creation fails, nothing is deleted. The bulk operation is added to session undo/redo history. The source PDF/DOCX/PPTX/Markdown file is not changed.
- **Undo:** Ctrl+Z or the existing undo button restores the entire deleted set in the same Obsidian session. Ctrl+Y redoes the deletion. The backup remains available even after restart. Other document records are untouched.

**Testing note:** Obsidian UI behavior and large documents must still be tested in the actual vault. This is a preview build, not a production-certified migration or a substitute for the user's own backup.


---

## v0.1.7 Eraser & Markdown Smart Re-anchoring Preview

- PDF / DOCX / PPTX / Markdown Reading View floating toolbars: eraser (⌫) removes the entire selected text-highlight record and its note, with confirmation for nonempty notes; Ctrl+Z / Ctrl+Y undo or redo the erasure in the current session. Free-position and area annotations are excluded. Escape exits eraser mode. Eraser and continuous highlighter are mutually exclusive.
- Markdown reading-view re-anchoring: match unchanged selected quote anywhere in rendered blocks, tolerate changes to adjacent context and shifts from inserted or reordered paragraphs, score repeated quotes with prefix/suffix agreement and original location. Ambiguous matches stay unbound. No fuzzy rewriting or silent movement to modified text.
- Existing data.json records and Markdown original bytes are not modified or migrated. No background OCR, AI, or new periodic scans.

## v0.1.7 Eraser & navigation hotfix
- Eraser: click or left-drag through existing highlights in PDF / Office / Markdown reading mode; deleting a highlight also removes its note, with undo/redo. Markdown editing remains untouched.
- Sidebar arrows now jump to the text only, without opening the annotation editor.
- PPTX captures slide numbers in new annotation anchors, and legacy anchors can be located through bounded slide navigation via Office Viewer's own controls. Original slide fingerprints remain mandatory.

### v0.1.7 PDF eraser cursor and special-annotation hotfix

- Eraser pointer now uses a local SVG cursor (with hotspot) across PDF, Office Viewer and Markdown Reading View, including PDF iframe pages. Cursor reverts when eraser is turned off.
- PDF toolbar: Eraser now appears immediately after Area Highlight.
- PDF eraser supports text highlights, free-position notes (click marker), and area highlights (click/drag inside the region or click marker). Existing note confirmation and undo/redo are retained. Text highlights take precedence over area highlights where they overlap.



---

## v0.1.8 — 匯出高亮與批註（Markdown）

在 Noctilucent 側邊欄，點擊「匯出高亮與批註…」。此操作會匯出**目前文件所有標記**（包括文字高亮、含批註的高亮、PDF 自由批註與區域高亮），不受搜尋、顏色篩選或釘選影響。

- 輸出格式：`.md`，預設位置 `Noctilucent Exports/<文件名> - Highlights.md`。
- 每筆記錄列出高亮原文、批註文字、HEX 色碼、釘選狀態、文件位置及 Noctilucent ID。
- PDF 使用可靠頁碼連結（Obsidian `#page=N`）；其他格式以文件連結為準，**不保證**一鍵精確跳到 Office／Markdown 的原文位置。
- 新版 PPT 批註有投影片編號時顯示 `Slide N`；舊版資料缺少頁碼時標示「投影片編號未確認」，不假設是第零頁。
- PDF 區域高亮目前只匯出描述與文字批註，不附截圖。
- 執行前先確認待寫入資料已成功儲存；使用完整資料快照產生獨立筆記，不修改既有 `data.json` 或來源文件。
- 若存在同名匯出文件，使用 `(2)`、`(3)` 等後綴建立新版本；不覆蓋既有匯出筆記。
- 這是一次性的匯出快照，後續編輯匯出筆記不會與原始批註同步。



---

## v0.1.9 · 介面國際化 (Traditional Chinese / English)

- 在 Noctilucent 設定新增 Auto、English、繁體中文。Auto 在所有中文 Obsidian 語系顯示繁體中文，其他語系顯示英文。
- PDF、Office、Markdown 閱讀模式共用翻譯字典，包含側邊欄、批註卡片、儲存狀態、匯出視窗與系統提示。
- 翻譯只改變使用者介面；原始文件、文字錨點與既有 `data.json` 批註原文保持不變。
- 開發文件繼續維持繁體中文，更多說明見 `README.zh-TW.md`。
