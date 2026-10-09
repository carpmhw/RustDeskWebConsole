# 第三方來源與授權

本專案以 AGPL-3.0-or-later 發布，授權條款：https://www.gnu.org/licenses/agpl-3.0.html 。
完整條款見根目錄 `LICENSE`（GNU 原文，從 RustDesk 1.4.2 的未修改授權副本取得）。
RustDesk／hbb_common／RustDesk Server 由原作者 RustDesk contributors／Purslane Ltd. 保有版權，授權為 AGPL-3.0。

- 上游 proto 完整下載、未修改，使用 RustDesk 1.4.2 的 hbb_common commit `334641686c731631fc51524bb2aa2ec2773069ee`；來源及雜湊見 `src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md`。
- 官方 server 與桌面 client 只作為測試環境，使用固定版本／digest；Dockerfile 保留上游來源 URL。
- 本輪未讀取、複製或翻譯 jt-ipam 程式碼，只依本機計畫自行實作骨架與 spike。
- Ed25519 公開測試向量來自 RFC 8032 §7.1；只使用公鑰及簽章，沒有儲存測試私鑰。

## 主要 NuGet 選型

M1-C 前端新增 vue-router 5.4.0、pinia 4.0.3、vue-i18n 11.4.13、qrcode 1.5.4，皆為 MIT，使用計畫內套件。QRCode 在瀏覽器本地產生，沒有外部 QR 服務；未加入其它 UI／OTP／DOM 模擬相依。完整間接授權由 pnpm lockfile 與 metadata 工具追蹤。

M1-B 新增：Microsoft.AspNetCore.Authentication.JwtBearer 10.0.12（MIT，官方 LTS JWT 驗證）與 Otp.NET 1.4.1（MIT，2025-12 穩定版、net10.0、RFC 6238）。JWT 發行使用 JwtBearer 的間接 IdentityModel 相依，沒有另外新增套件。

| 套件                                                     | 版本            | 授權         | 選型依據                                                        |
| -------------------------------------------------------- | --------------- | ------------ | --------------------------------------------------------------- |
| Microsoft.EntityFrameworkCore.Sqlite／Design             | 10.0.12         | MIT          | .NET 10 LTS 對齊、官方 SQLite provider／migration               |
| NSec.Cryptography                                        | 26.4.0          | MIT          | 2026-04 穩定版，libsodium 1.0.22，Linux 發布映像實跑 Ed25519    |
| Konscious.Security.Cryptography.Argon2                   | 1.3.1           | MIT          | 2024-06 最新穩定版、託管 Argon2id；更新較慢，須持續追蹤維護狀態 |
| Google.Protobuf                                          | 3.36.2          | BSD-3-Clause | 上游 protobuf C# runtime                                        |
| Grpc.Tools                                               | 2.84.0          | Apache-2.0   | 建置期 proto 生成，PrivateAssets=all                            |
| Serilog.AspNetCore                                       | 10.0.0          | Apache-2.0   | .NET 10 主機整合及 JSON 結構化日誌                              |
| StackExchange.Redis／RESPite                             | 3.3.0／3.3.0    | MIT          | 計畫內 Redis KV 選配，真實 Redis 契約驗證與 Lua 原子操作        |
| Microsoft.AspNetCore.Mvc.Testing／Microsoft.NET.Test.Sdk | 10.0.12／18.0.0 | MIT          | 官方整合測試主機及測試執行器                                    |
| xunit／xunit.runner.visualstudio                         | 2.9.3／3.1.5    | Apache-2.0   | 成熟測試介面，測試期相依                                        |

NuGet／pnpm 鎖檔固定完整相依樹；以 `dotnet list ... --vulnerable --include-transitive` 及 `pnpm audit` 檢查實際已知漏洞，不將維護狀態等同於安全保證。
`node tools/licenses.mjs` 從還原套件原始授權 metadata 產出 `artifacts/*-licenses.json`；CI 會上傳清單，不新增掃描套件。

M0 測試映像中的 Xvfb、Fluxbox、D-Bus、X11 工具與 Linux 圖形執行期套件已取得使用者同意；套件各自的 copyright／license 隨 Debian 套件安裝保留於映像內的 `/usr/share/doc/`。

## Otp.NET 授權聲明

來源：Otp.NET 1.4.1 套件中的 `LICENSE.txt`；以下保留原始條款。

```text
MIT License

Copyright (c) 2017 Kyle Spearrin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
