# 团餐管家 / team-meal-manager

独立 Codex skill：组织者提供微信聊天文字或截图，整理多人需求，通过 OCP 查询瑞幸或麦当劳，生成同店配餐和真实整单报价，处理售罄后的局部重配，并在付款人确认后创建订单。

本仓库不需要放进 OCP-Catalog，也不依赖其本地工作区。公开 OCP SDK 通过 npm 安装。第一版支持一个品牌、一家门店、一个付款人、即刻到店自取。

## 文件结构

```text
team-meal-manager/
├─ SKILL.md
├─ agents/openai.yaml
├─ references/commands.md
├─ references/workflow.md
├─ scripts/run.ps1
├─ scripts/Install-Skill.ps1
├─ assets/runtime/
│  ├─ src/group-*.ts
│  ├─ src/group.test.ts
│  └─ Save-GroupCredential.ps1
├─ package.json
└─ bun.lock
```

`SKILL.md` 负责语言理解、决策和购买授权；`scripts` 启动确定性工具；`assets/runtime` 是必要的执行资产；`references` 给出详细输入和流程。网页属于原示例应用，不是此 skill 的运行依赖，因此没有复制。

## 安装运行（Windows、Bun）

```powershell
git clone https://github.com/xxxxdxc/team-meal-manager.git
cd team-meal-manager
bun install --frozen-lockfile
bun run typecheck
bun run test
& .\scripts\Install-Skill.ps1
& .\scripts\run.ps1 doctor
& .\scripts\run.ps1 demo -Brand luckin
& .\scripts\run.ps1 demo -Brand mcd
```

安装脚本更新 Codex skill 的指令文件，并用本机 `project.json` 指向本仓库。运行依赖仅安装在本仓库，不复制 node_modules、凭证或数据库。移动仓库后重新执行安装脚本；也可向 runner 传 `-ProjectRoot`。已有同名 skill 的个人修改需自行备份。

配置真实凭证：

```powershell
& .\assets\runtime\Save-GroupCredential.ps1 -Brand luckin
& .\assets\runtime\Save-GroupCredential.ps1 -Brand mcd
& .\scripts\run.ps1 doctor -Connect
```

令牌交互输入不回显，保存为当前 Windows 用户加密的 DPAPI 文件。默认任务数据库为 `assets/runtime/data/team-meals.sqlite`；所有 data、凭证和 project.json 被 Git 忽略。

## 使用流程

微信需求 → 集中确认名单及缺项 → 查店 → OCP menu/detail → 按实际规格配餐 → 整篮报价 → 预算核对 → 付款人确认 → 创建订单 → 用户付款 → 查询状态。

售罄时只替换 affected 成员，保留其他人的商品、数量和规格，重新报价并撤销旧审批。逐人金额只是整单金额分摊，不是官方单杯成交价。超时不能当作售罄；创建结果未知时禁止自动重试。

`demo` 全部模拟，包括模拟提交。真实任务默认 live；仅查询时停在 quote，不调用 approve 或 submit。详细文件职责和状态流程见 [workflow](references/workflow.md)，命令见 [commands](references/commands.md)。

代码沿用原 OCP-Catalog 示例开发成果，以 MIT 许可发布；协议 SDK 和 MCP SDK 的许可见各依赖。
