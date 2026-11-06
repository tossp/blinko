# TS fork：容器发布与使用

## 发布地址与标签

自维护源码为 `tossp/blinko` 的小写 `ts` 分支；镜像发布至 **`ghcr.io/tossp/blinko`**，不覆盖上游镜像。

| 引用 | 用途 |
| --- | --- |
| `ghcr.io/tossp/blinko:ts` | 最近一次通过完整发布流程的 `ts` 构建；可变标签 |
| `ghcr.io/tossp/blinko:sha-<完整 commit>` | 对应具体源码提交的多架构构建；重跑同一提交可能因上游依赖变化产生新 digest |
| `ghcr.io/tossp/blinko@sha256:<digest>` | 固定镜像内容，适合正式部署与回退 |
| `sha-<完整 commit>-amd64` / `sha-<完整 commit>-arm64` | 流程使用的单架构镜像；不是完整发布成功标志 |

应用版本继续沿用上游 `package.json`，fork 构建身份由提交标签、OCI revision 标签及 digest 区分。当前不维护 `latest`、`stable` 或独立桌面客户端发行。

## 发布流程

入口为 `.github/workflows/docker-build.yml`：

1. 推送到 `tossp/blinko` 的 `ts` 分支，或选择该分支手动触发。仅修改 Markdown 不触发自动发布；可手动重新构建。
2. 复用 `security-checks.yml`，运行锁定依赖安装、安全回归、定向类型检查和前后端构建。检查失败不构建发布镜像。
3. 分别使用原生 amd64、arm64 GitHub Runner 构建最终镜像。CI 通过 `NODE_IMAGE=docker.io/library/node:24.22.2-alpine` 直连官方源；本地默认仍为 `dp.tossp.com/library/node:24.22.2-alpine`。首次远端构建确认代理在基础镜像层下载时返回 525，因此仅按构建环境切换来源，不更改 Node 版本。
4. 在各自架构上以 `--network none` 执行 `.github/scripts/container-smoke.mjs`，验证 Node/Brotli、sharp、sqlite3、tree-sitter、Prisma 客户端构造和静态首页存在。不连接数据库、不启动业务、不挂载生产数据。
5. 单架构检查通过后，使用 `GITHUB_TOKEN` 推送相应架构镜像，并传递其 digest。
6. 两个架构均成功后合并 manifest，生成完整提交标签和 `:ts` 标签。运行摘要提供发布地址与 digest；镜像附带源码 repository、revision 标签。

Node 24 要求原生模块以 C++20 编译；`tree-sitter@0.22.4` 的 arm64/glibc 预构建在 Alpine/musl 下不可用，源码构建又硬编码 C++17。Dockerfile 仅对引入它的运行时安装命令设置 `CXXFLAGS="-std=c++20"`，不升级依赖、不改锁文件；两个架构的最终镜像均检查该模块实际加载。

发布工作流仅镜像构建与合并 job 授予 `packages: write`，不需要 Docker Hub 密钥，不修改 Git 分支或现有部署。上游 `build-publish-release.yml` 与 `mark-stable.yml` 的容器发布入口仅允许在 `blinkospace/blinko` 运行，在本 fork 跳过。

首次发布的 GHCR 包可能是 private。需要在包设置核对 repository 关联、Actions 写权限和 public 可见性；**公开源码仓库不等于镜像自动公开**。未验证匿名拉取前，不宣称无需认证即可使用。无权限时由账号操作者处理，不扩展现有令牌权限。

手动触发与查看结果：

```sh
gh workflow run docker-build.yml --repo tossp/blinko --ref ts
gh run list --repo tossp/blinko --workflow docker-build.yml --branch ts
```

以上命令会实际触发发布，需要发布授权；发布过程不自动执行部署。

## 使用自有镜像

仓库中的 `docker-compose.prod.yml`、`install.sh`、`update.sh` 默认使用 `ghcr.io/tossp/blinko:ts`，支持 `BLINKO_IMAGE` 覆盖。Helm 默认 repository 为 `ghcr.io/tossp/blinko`、tag 为 `ts`，使用 `Always` 拉取策略；固定提交时可覆盖 `image.tag`。

只读检查镜像并拉取，不启动服务：

```sh
docker buildx imagetools inspect ghcr.io/tossp/blinko:ts
docker pull ghcr.io/tossp/blinko:ts
```

正式部署建议使用已核验的 digest。在完成数据库与附件备份、核对现有环境变量、挂载和 [上游升级要求](security-upgrade.md)，并取得部署授权后，才执行以下服务更新：

```sh
export BLINKO_IMAGE='ghcr.io/tossp/blinko@sha256:<已核验的digest>'
docker compose -f docker-compose.prod.yml pull blinko-website
docker compose -f docker-compose.prod.yml up -d --no-deps blinko-website
```

这份 Compose 是配置示例，不是已核对的生产配置；原有数据库地址与示例口令必须按目标环境配置。旧安装/更新脚本同样沿用示例数据库参数，不能未经检查直接用于现有生产服务。更新脚本先拉取镜像，失败时不停止现有容器；不再强制删除旧镜像。仅拉取 `:ts` 不会自动重建现有容器，Helm 的 `Always` 也不会自动触发 Pod 重启。

## 验收与回退边界

- 发布成功：检查对应 commit 的 Actions 全部成功，manifest 同时包含 `linux/amd64`、`linux/arm64`，并核对完整提交标签、`:ts` 的 digest。
- 可分发：用未配置登录凭据的 Docker 配置拉取镜像，确认公开读取；必要时核对镜像的 `org.opencontainers.image.revision`。
- 部署成功：另行检查目标环境的镜像 digest、健康状态以及登录、附件等业务行为。发布成功不能替代真实数据库下的业务验收。
- 回退：记录当前部署 digest 和备份，恢复原 digest 后重新创建服务；涉及数据库/客户端兼容性时按上游回退要求处理。
- Node/Brotli 修复依据和本地验证边界见 [运行时修复记录](ts-runtime-security.md)。本流程的运行时检查不是全依赖安全审计或恶意流攻击复现。

## 官方依据

- [GHCR 认证、可见性与按 digest 拉取](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker 多架构分布式构建](https://docs.docker.com/build/ci/github-actions/multi-platform/#distribute-build-across-multiple-runners)
