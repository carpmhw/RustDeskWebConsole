# 第三方來源與授權

本專案以 AGPL-3.0-or-later 發布，授權條款：https://www.gnu.org/licenses/agpl-3.0.html 。
完整條款見根目錄 `LICENSE`（GNU 原文，從 RustDesk 1.4.2 的未修改授權副本取得）。
RustDesk／hbb_common／RustDesk Server 由原作者 RustDesk contributors／Purslane Ltd. 保有版權，授權為 AGPL-3.0。

- 上游 proto 完整下載、未修改，使用 RustDesk 1.4.2 的 hbb_common commit `334641686c731631fc51524bb2aa2ec2773069ee`；來源及雜湊見 `src/RdWeb.Api/RustDesk/Protos/UPSTREAM.md`。
- 官方 server 與桌面 client 只作為測試環境，使用固定版本／digest；Dockerfile 保留上游來源 URL。
- 2026-10-11 使用者核准測試 Client 改為官方 RustDesk 1.5.0（兩平台）；Linux x86_64 deb SHA-256 `4e2b9701d25a7ef373f3d09bda584a37d6902f97a6ab15f2e86d4a5783e2a0ec`，二進位未修改。生成 proto 仍採上列 1.4.2 固定來源，不把受控端驗收版本當成 schema／控制側能力升級；未複製 1.5.0 上游實作，授權仍保留於測試映像。
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

## M3-B1 前端協定套件

TweetNaCl 1.0.3（Unlicense）為總計畫內瀏覽器加密套件。使用者另核准 protobufjs 8.8.0 minimal runtime 與 protobufjs-cli 2.7.0 建置工具（BSD-3-Clause），依鎖檔追蹤間接相依；CLI／reflection compiler 不加入browser runtime。靜態生成輸入來自上列pinned RustDesk／hbb_common，生成結果的來源標頭與AGPL授權保留。

## M3-B2 公開影像測試素材

WebCodecs 測試使用 web-platform-tests/wpt commit `521d168d63dbd206ea7fbe0b74ddd5760e6e668e` 的 `webcodecs/vp8.webm`、`vp9.mp4`、`av1.mp4`、`h264.annexb` 公開素材，依固定 SHA256／offset 切出 key／delta。只使用素材及 schema／offset 事實，不複製上游測試程式。完整來源、hash 與生成方式見 `frontend/src/rdweb/__fixtures__/CODEC_FIXTURES.md`；正式 app 不匯入素材或測試 harness。未新增 npm／NuGet／WASM 相依。

## M3-B3 Zstandard 解壓套件與公開素材

2026-10-13 使用者單獨核准新增開發用 `@types/node` **24.19.2**（MIT，DefinitelyTyped／types/node），對齊 Node.js 24 並補 E2E 的正式 Node 宣告；間接 `undici-types` 版本／registry integrity依pnpm鎖檔固定，授權MIT。兩者只有型別宣告，不加入瀏覽器runtime，不使用自製shim或降低strict。來源為npm registry metadata及實際安裝套件的package.json／LICENSE；本輪pnpm audit未發現已知漏洞，完整授權仍由現有metadata工具追蹤。

fzstd 0.1.1（MIT）為已核准的純 JS runtime 相依，沒有 runtime 間接套件；ESM 在本機 bundle，不使用 CDN／WASM。公開剪貼簿素材由宿主既有 libzstd 1.5.5 獨立壓縮／解壓驗證，來源、hash 及重生規則見 `frontend/src/rdweb/__fixtures__/CLIPBOARD_FIXTURES.md`。素材不包含遠端內容，不匯入正式 app。

2026-10-10 使用者核准固定版本修補：`frontend/patches/fzstd@0.1.1.patch` 修改原套件 ESM／CJS 的輸出 bounds／frame count／有效歷史驗證，未替換熵碼演算法。MIT 原文保持；lockfile 同時固定 registry integrity 與 patch SHA-256 `9c9d50d618500248fc39e879549bab302bed146bfb5cc043415c33f3a7ec4899`。此修補僅適用應用實際使用的 ESM／CJS entry points，未使用或發布 UMD／CDN 入口；checksum／dictionary／concat 仍由應用 admission 拒絕。

以下保留實際 fzstd 0.1.1 套件 `LICENSE` 原文：

```text
MIT License

Copyright (c) 2020 Arjun Barrett

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

## M3-B2 公開影像素材原始 LICENSE

來源：https://github.com/web-platform-tests/wpt/blob/521d168d63dbd206ea7fbe0b74ddd5760e6e668e/LICENSE.md 。以下保留原始條款。

```text
The 3-Clause BSD License

Copyright © web-platform-tests contributors

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### TweetNaCl 原始 LICENSE

```text
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org>
```

### protobuf.js 原始 LICENSE（CLI 共用同一版權與條款）

```text
This license applies to all parts of protobuf.js except those files
either explicitly including or referencing a different license or
located in a directory containing a different LICENSE file.

---

Copyright (c) 2016, Daniel Wirtz  All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

* Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright
  notice, this list of conditions and the following disclaimer in the
  documentation and/or other materials provided with the distribution.
* Neither the name of its author, nor the names of its contributors
  may be used to endorse or promote products derived from this software
  without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

Code generated by the command line utilities is owned by the owner
of the input file used when generating it. This code is not
standalone and requires a support library to be linked with it. This
support library is itself covered by the above license.
```
