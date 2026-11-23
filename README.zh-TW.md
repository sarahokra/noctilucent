# Noctilucent 使用說明（繁體中文）

此為 v0.1.9 的繁體中文語言補充說明。主要功能與安裝方式請參閱既有 [README.md](README.md)。

更新歷程請參閱：[繁體中文 CHANGELOG](CHANGELOG.zh-TW.md)｜[英文 CHANGELOG](CHANGELOG.md)｜[完整原始開發紀錄](docs/CHANGELOG.original.md)。

## 介面語言

在 Obsidian 設定 → 社群插件 → Noctilucent → **介面語言**，選擇：

- **自動 — 跟隨 Obsidian（預設）**：Obsidian 為中文語系（含簡體中文）時顯示**繁體中文**；其他語言顯示英文。
- **English**：強制英文介面。
- **繁體中文**：強制繁體中文介面。

語言設定只影響介面、通知及匯出筆記的系統標題；不翻譯使用者原文及批註，也不修改原始檔案、錨點或既有高亮資料。

## 驗收重點

1. `zh-CN` 的自動模式必須顯示繁體中文，不得顯示簡體中文。
2. 在英文 Obsidian 中可強制切換繁體中文。
3. PDF、Office、Markdown 的批註卡片、側邊欄與儲存狀態用語一致。
4. 語言切換後既有 `data.json` 原文及註解仍完全不變。
