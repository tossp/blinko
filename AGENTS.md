# Blinko TS fork

- 自维护仓库：`tossp/blinko`；上游：`blinkospace/blinko`。
- 默认开发分支严格使用小写 `ts`。所有自有代码、配置和文档改动只落在 `ts`，或从 `ts` 派生并最终合入 `ts` 的工作分支。
- `main` 仅跟踪上游 `main`，不提交或合入自有改动，不改写历史。同步上游后，再将更新合入 `ts`。
- 本地 `origin` 指向 fork，`upstream` 指向上游；修改前确认当前分支和工作区，不覆盖已有改动。
- 安全修复优先最小改动，避免同时升级无关业务依赖；保留上游锁文件，除非修复本身需要调整。
- 运行已有安全回归：`cd server && bun run test:security`。这些测试使用 Bun，不能替代实际 Node 运行时与最终 Docker 镜像验证。
- Docker Hub 镜像优先使用 `dp.tossp.com`；官方镜像保留 `library/`，例如 `dp.tossp.com/library/node`。
- 自有容器发布入口：`.github/workflows/docker-build.yml`，发布至 `ghcr.io/tossp/blinko`；`:ts` 跟随通过验证的 `ts` 提交，`:sha-<完整 commit>` 定位源码，正式部署可固定 digest。流程和使用方式见 `docs/ts-container-release.md`。
- 构建与测试不自动授权推送代码、发布镜像或修改现有部署；测试不得接入生产数据库或使用生产凭据。
