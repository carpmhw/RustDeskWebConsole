# 專案開發規範

- 依 `docs/rustdesk-web-console-agent-plan-v0.2-dotnet.md` 的 M0 → M5 順序開發，完成验收後再進下一里程碑。
- 所有手寫函數、方法與測試函數添加繁體中文註解；工具生成檔保留原格式。
- 資料庫和 API 時間使用 UTC。頁面預設 Asia/Taipei，允許使用者選擇時區；log 預設 UTC，以 LOG_TIME_ZONE 獨立設定。
- 不記錄金鑰、密碼、票證；不提交 .env、資料庫、測試私鑰。
- 不新增計畫以外的外部依賴或降低資安基線；有需要先詢問使用者。
- 修改後執行相應 build、test、format、lint 和 dependency audit。
- docs 目前依使用者的 .gitignore 保留在本機，不強制加入版本控制。
