# TS fork：Node/Brotli 运行时修复

## 范围与改动

- 目标：修复 Blinko Docker 运行时中的 `CVE-2026-111497`，不修改业务功能、数据库结构或依赖锁文件。
- 代码基线：上游 `a1c71e67f653f88aabee93c6e5dc433ef5780d18`（包含 1.8.9 安全修复）。
- 自有改动仅在小写 `ts` 分支；`main` 仅跟踪上游。
- 根目录 `dockerfile` 的 `init-downloader`、`runner` 两处均由 Node 20 升为 `dp.tossp.com/library/node:24.22.2-alpine`。
- 保留 Bun 构建阶段与既有业务依赖，避免在运行时修复中引入额外升级。
- 本轮只构建本地测试镜像，未推送代码、发布镜像或变更现有部署。

## 修复依据与版本判断

截至 2026-11-06，Node 官方 24 系列最新稳定补丁为 `24.22.2`（2026-10-27 发布）；本漏洞在 `24.22.1` 安全发行版中已修复。

Node 通过提交 `49dff6f57aa72cbbe13e480cd41ff4e46837c8fc` 回补 Brotli 解码修复：非法 block switch 必须成为永久格式错误，而非继续等待输入。对应运行时导出 `BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH === -17`。

**已修复的 Node 仍可能报告 Brotli `1.2.0`。** 不应只按 Brotli 版本字符串判断漏洞状态；需结合官方发行版与回补来源、实际镜像运行时和功能验证。错误常量存在是辅助证据，不等同攻击复现。

一手依据：

- [Node 2026-10-21 安全公告](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [官方发行索引](https://nodejs.org/dist/index.json)
- [Node 的 Brotli 回补提交](https://github.com/nodejs/node/commit/49dff6f57aa72cbbe13e480cd41ff4e46837c8fc)

## 本轮验证（2026-11-06）

| 检查 | 结果 |
| --- | --- |
| 锁定依赖安装 | `bun install --frozen-lockfile` 通过，`bun.lock` 未变 |
| 上游安全回归 | `cd server && bun run test:security`：16 套件，184 通过，0 失败；执行器为 Bun |
| 完整 Docker 构建 | `linux/amd64` 通过，包含前后端、seed 构建及运行依赖安装 |
| 最终镜像运行时 | Node `v24.22.2`，Brotli `1.2.0`，ABI `137`，错误常量 `-17` |
| Brotli 正常功能 | 3 组真实压缩/解压往返通过 |
| 原生依赖 | sharp 实际图像处理、sqlite3 内存查询、Prisma 客户端构造通过 |
| 外置业务依赖 | 实际使用的 LangChain 文件加载子路径、libSQL musl 子路径及主要运行依赖加载通过 |
| 静态独立审阅 | 修复命中实际 Node 消费路径；`main` 保持上游基线 |

本地测试镜像为 `blinko-ts:cve-2026-111497`，镜像 ID：

```text
sha256:0bdf65edc9b54eebf702eaf5a2453aea88ceb0026471ae3b037438046f32902f
```

复现构建及最小运行时检查（不启动应用）：

```sh
docker build --network host --progress=plain -t blinko-ts:cve-2026-111497 .
docker run --rm --network none --entrypoint node blinko-ts:cve-2026-111497 -e '
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
assert.equal(process.version, "v24.22.2");
assert.equal(zlib.constants.BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH, -17);
const input = Buffer.from("Blinko runtime verification");
assert.deepEqual(zlib.brotliDecompressSync(zlib.brotliCompressSync(input)), input);
console.log({node: process.version, brotli: process.versions.brotli});
'
```

## 尚未完成与既有问题

- 未进行恶意压缩流攻击复现、ARM64 实机运行、真实数据库登录/附件/AI/MCP 全业务验收；安全套件与原生依赖 smoke 不能替代这些检查。
- 最终镜像没有安装 `esbuild`，但打包产物的 Vite 代码仍引用它。基线已将其标为外置，运行时安装列表未包含该包；尚无证据表明这是 Node 升级造成的差异。本轮不顺手修改此既有打包问题。
- 隔离、无网络的应用加载探针未因缺少 `esbuild` 立即失败，但数据库不可用触发应用的降级监听路径，因此不能以出现监听日志作为正常业务启动通过。
- 运行依赖安装还报告了其他审计告警，本轮未做全依赖安全扫描或修复；本漏洞修复不代表应用已消除全部已知漏洞。
- 本地构建首次因 GitHub TLS 连接重置失败，改用 `--network host` 后通过；未修改 Docker daemon 全局配置。host 网络仅用于本轮本地构建，不要求生产容器使用 host 网络。
- 上线前仍需独立的发布/部署授权，以及 1.8.9 的客户端、MCP stdio 允许清单和附件缓存检查，参见 [上游升级与回退要求](security-upgrade.md)。
