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
| 生产静态资源路径 | 实际镜像未安装 esbuild，主动拦截其加载后，首页及真实 JS 资源均返回 200，esbuild 加载次数为 0；数据库故意不可用，不代表正常业务启动验收 |

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

## esbuild 引用的复核结论

初次检查扫描了打包产物中的全部外置 `require` 字符串，发现 `esbuild` 无法解析。**该检查没有区分惰性开发路径与实际生产路径，不能据此判定产品缺少必需运行依赖。**

- 引用来源为打包进后端的 Vite 模块；`server/esbuild.config.ts` 将 `esbuild` 标为外置。
- `server/index.ts` 在生产模式明确配置 `ViteExpress.config({ mode: 'production', inlineViteConfig: ... })`。
- 锁定的 `vite-express@0.20.0` 中，`resolveConfig()` 优先返回内联配置；`bind()` 的生产分支只提供已构建的静态资源。加载 Vite 的分支用于开发服务器、构建或未提供内联配置时的配置解析。
- 在最终镜像中确认 `require.resolve('esbuild')` 返回 `MODULE_NOT_FOUND`，随后通过 Node 模块加载钩子主动拒绝任何 esbuild 加载，再加载真实应用并请求首页及首页引用的真实 JavaScript 资源：两者均为 200，加载钩子记录为 0。容器使用 `--rm --network none`，无主机挂载、端口映射或生产凭据。
- 数据库故意设为容器内不可用地址，实际触发应用降级监听路径；该实验仅验收生产静态资源路径，不代表完整数据库业务或正常启动验收。正常/降级启动最终都调用同一生产 `ViteExpress.bind()` 配置。

结论：未发现当前 Docker 生产路径需要补装 esbuild 的证据，不增加运行依赖，也不为清除静态扫描告警而改动打包架构。开发/构建阶段继续使用既有锁定依赖。

## 尚未完成与其他边界

- 未进行恶意压缩流攻击复现、ARM64 实机运行、真实数据库登录/附件/AI/MCP 全业务验收；安全套件、原生依赖及静态资源验证不能替代这些检查。
- 运行依赖安装还报告了其他审计告警，本轮未做全依赖安全扫描或修复；本漏洞修复不代表应用已消除全部已知漏洞。
- 本地构建首次因 GitHub TLS 连接重置失败，改用 `--network host` 后通过；未修改 Docker daemon 全局配置。host 网络仅用于本轮本地构建，不要求生产容器使用 host 网络。
- 上线前仍需独立的发布/部署授权，以及 1.8.9 的客户端、MCP stdio 允许清单和附件缓存检查，参见 [上游升级与回退要求](security-upgrade.md)。
