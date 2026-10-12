# 公開 Zstandard 剪貼簿測試素材

公開文字定義於 `tools/prepare-clipboard-fixtures.py`，本專案自行產生，採專案 AGPL-3.0-or-later 授權。沒有讀取任何遠端剪貼簿或 OS 私有內容。

2026-10-10 使用宿主既有 **libzstd 1.5.5、level 3** 產生單一無 checksum frame，並以同一 native library 解壓確認原始 bytes；browser fzstd 不是產生 oracle 的工具。JSON 為純測試資料，正式 app 不匯入。

| 素材    | UTF-8 bytes | Compressed SHA-256                                                 |
| ------- | ----------: | ------------------------------------------------------------------ |
| ascii   |         992 | `dab3a6820a859663080ac73f37d716480981a8ca3748f8979487739fcc427ac0` |
| unicode |        2176 | `62522c7c7ed54c8a146a73e12b64818807a0c2827072afe2e77a14586e3458cc` |

`clipboard-samples.json` SHA-256：`07cd7d865080bedc37d117759447ced3564ba72eef382b833fd6f61750bc409c`。

產生：`python3 tools/prepare-clipboard-fixtures.py frontend/src/rdweb/__fixtures__/clipboard-samples.json`。
完整性驗證：`node tools/test-clipboard-fixture-integrity.mjs`（含改 byte／錯誤長度負案）。

CI 讀固定 fixture，不假設不同 native 版本重生 bitstream 相同。重生差異必須審閱並更新來源紀錄，不自動覆寫 expected hashes。fzstd 實際 MIT 條款保留於根目錄 `THIRD_PARTY_NOTICES.md`。

## 固定版本修補的獨立 corpus

`fzstd-bounds.json` 由 `tools/prepare-fzstd-bounds-fixtures.py` 使用既有 libzstd 1.5.5 產生並逐案 native 驗證：**12 正案／13 native 拒絕反例，共 25 案**。正案包含 ASCII／中文／32KiB／empty／無 FCS／raw／RLE／跨 block 歷史，以及刻意供應用 32KiB cap 拒絕的 32769-byte 有效 frame；反例包含兩種 native frame 的 FCS 256／257／512／原長±1，以及 raw／RLE／compressed-literal overflow。

JSON 不包含任何遠端資料，只存固定 public bytes／SHA／native 判定及安全數字，SHA-256：`84762c728e512209c7a9528ab2f9e723117d7f69549da967d9abdb9e0c26bef3`。

```sh
python3 tools/prepare-fzstd-bounds-fixtures.py frontend/src/rdweb/__fixtures__/fzstd-bounds.json
node tools/test-clipboard-fixture-integrity.mjs
node tools/test-fzstd-patch.mjs
corepack pnpm --dir frontend exec vitest run src/rdweb/fzstd-bounds.test.ts src/rdweb/clipboard-codec.test.ts
```

Node 工具分別驗真 ESM／CJS 的 one-shot／stream（完整及 1／7-byte chunks）／不足 caller buffer；Vitest 驗 browser ESM 與 wrapper，避免把 Node 型別加入 production TypeScript。被修改的原套件 ESM／CJS 來自 fzstd 0.1.1（MIT）；pnpm patch 固定 SHA 見 notices／lock。此 corpus 是必要回歸證據，不宣稱代替全部 RFC entropy／checksum 驗證。
