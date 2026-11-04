# 公開 WebCodecs 測試資料

固定來源：[web-platform-tests/wpt](https://github.com/web-platform-tests/wpt/tree/521d168d63dbd206ea7fbe0b74ddd5760e6e668e/webcodecs)，commit `521d168d63dbd206ea7fbe0b74ddd5760e6e668e`。

`codec-samples.json` 由 `node frontend/scripts/prepare-codec-fixtures.mjs` 產生。
原始檔快取於忽略的 `frontend/.cache/codec-fixtures`；每次重新驗完整原始 SHA256 與 offset 範圍。
使用 pinned `videoDecoder-codec-specific-setup.js` 中的公開資料事實，不執行或複製其測試程式。
每組 320×240、8-bit，兩筆為 key／delta、pts 0／33 毫秒；來源與原始 SHA256 保留於 JSON。
原影片容器不參與 runtime：VP8／VP9／AV1 使用直接壓縮 frame，H.264 使用包含 SPS／PPS 的 Annex B access unit。
這些是公開測試素材，不是受控端截圖、登入資料或私鑰；正式 app 不匯入本資料。

WPT setup 的 AV1 config 提示為 `av01.0.04M.08`，但本原始 sequence header 的 operating point 0 level bits 確實為 `00000`（level 0）。實作與測試以 bitstream 的 `av01.0.00M.08` 為準，不將 config 提示當 header oracle。

授權來源：上游相同 commit 的 LICENSE.md，保留原文。

## The 3-Clause BSD License

Copyright © web-platform-tests contributors

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
