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

## 獨立協定接收器可攜診斷包

Windows x64診斷包包含未修改的官方 **Node.js v24.22.1 win-x64 `node.exe`**；固定來源為 https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip ，官方checksum及簽章為同版本的 `SHASUMS256.txt`／`SHASUMS256.txt.sig`。以官方release-keys固定commit `481637f813e912c4aa3622d7964ab426c97b8e8d` 的完整fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`驗簽後核對archive及executable；完整pin見 `frontend/e2e/receiver/node-runtime-pin.json`。

- archive SHA-256：`d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5`。
- `node.exe` SHA-256：`d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`。
- 完整archive `LICENSE` SHA-256：`ed34dd8e3f0a78dbaf00d0444ce8e285b015b765379c2e17880455f70370f8e9`，隨包逐byte保存為 `LICENSE.Node.txt`，含Node.js contributors的MIT條款及所有內含第三方授權；不可只以本文件或單一MIT段落取代。官方對應來源：https://github.com/nodejs/node/tree/v24.22.1 。

接收器bundle使用既有鎖定的TweetNaCl 1.0.3（Unlicense）、protobufjs 8.8.0（BSD-3-Clause，包含light／minimal runtime）及其既有間接相依Long 5.3.2（Apache-2.0，來源 https://github.com/dcodeIO/long.js/tree/5.3.2 ）。未新增套件，未修改這些套件；Vite只在建置時產生單一bundle，不隨包散布完整node_modules或CLI。TweetNaCl及protobuf.js原授權保留於下方；Long完整Apache-2.0條款及版權保留於文末。公開 `vp8.webm`仍採下列固定WPT來源及BSD-3-Clause條款，不是桌面擷取。

本工具及RustDesk生成schema沿用AGPL來源與本專案 `LICENSE`，不因bundle化而變更授權。此包僅供本輪診斷準備，不作公開發布；再散布時須同時滿足AGPL完整對應原始碼及其他授權義務，不以未提交workspace或Node官方簽章宣稱自製bundle已有公開版本或官方背書。

## .NET 獨立監督程式的發布資源

Windows x64獨立監督程式的self-contained發布資源固定為官方NuGet套件 **Microsoft.NETCore.App.Runtime.win-x64 10.0.14** 與 **Microsoft.NETCore.App.Host.win-x64 10.0.14**，不是應用程式直接引用的PackageReference。固定官方metadata／下載URL、原nupkg SHA-512及內含授權原文SHA-256見 `frontend/e2e/receiver/native-supervisor/dotnet-runtime-pin.json`；取得來源不等於已完成publish、Windows部署或原生驗收。

- 兩套件nuspec均聲明MIT，repository實際為 https://github.com/dotnet/dotnet ，固定commit `0427b9abbead3fa64c6655eb4290c537397131fa`；包內 `Microsoft.NETCore.App.versions.txt`亦記相同commit及10.0.14。不以推測的其他repository tag代替實際來源revision。
- 兩套件完整 `LICENSE.TXT`相同，SHA-256為 `d7a68596ab69b06f51ca278a6545148e4269a9381c26d597c13df5d88e08cf5b`；完整 `THIRD-PARTY-NOTICES.TXT`亦相同，SHA-256為 `6d15e10a101c6bfff2ab4429ed061bf76c456fc4b23ad6b03e0d0f8377148a21`。發行包必須逐byte保留兩份原文；不得只以MIT metadata、本文件摘要或部分notice取代內含第三方條款與版權聲明。
- 自製監督程式與原PS／fixture仍沿本專案AGPL-3.0-or-later，後續散布須同時提供其完整對應來源與可重建方式，並保留.NET及Node各自完整授權義務，不將官方runtime來源pin當自製程式的簽章、發布背書或授權變更。

獨立函數診斷包將原.NET多檔輸出、固定PS／公開Node fixture及未修改的官方Node組合交付，與上節receiver bundle不同；不包含receiver.mjs、TweetNaCl／protobuf.js／Long、RustDesk生成schema或影像素材。該包另附自製程式／建置工具的確切對應來源ZIP與發布locks，保留完整AGPL、Node及.NET原文授權；根文件其他產品聲明不代表那些成員被加進診斷包。重建流程與未驗邊界見`frontend/e2e/receiver/native-supervisor/README.md`，不以官方來源pin或簽章替自製發行包背書。

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

### Long 5.3.2 原始 LICENSE

版權：Copyright 2009 The Closure Library Authors；Copyright 2020 Daniel Wirtz / The long.js Authors。來源為已鎖定的 `long` 5.3.2 套件之 `LICENSE`；套件未附獨立NOTICE。以下保留完整原文。

```text

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```
