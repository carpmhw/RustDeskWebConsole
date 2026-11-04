# RustDesk 協定來源

授權：AGPL-3.0；原作者 RustDesk contributors。

RustDesk client `1.4.2` 的 `libs/hbb_common` gitlink 為
`334641686c731631fc51524bb2aa2ec2773069ee`。

| 檔案 | SHA-256 |
| --- | --- |
| rendezvous.proto | 98c7c047761bbd7151b72d249f9e58479cc345827335589a1f5285c27ab1a469 |
| message.proto | 963cb7b27752edf7c200f563607fdbef76e1792951cbb4bb21d72508435f08eb |

來源：`https://github.com/rustdesk/hbb_common/tree/334641686c731631fc51524bb2aa2ec2773069ee/protos`。
`Upstream.targets` 在首次 build 下載完整未修改檔案到 `obj/upstream-protos`，
每次 build 驗證 SHA-256，由 Grpc.Tools 生成 C#；需允許連線至 raw.githubusercontent.com。
離線環境可預先放入上述路徑，仍需通過相同雜湊。
不使用 master；2026-10-08 master 已移除 message.proto，不能作為此 client 的規格。
此選擇代表生成基準，不代表真實連線相容性已驗收。
