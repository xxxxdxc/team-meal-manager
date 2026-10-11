# 团餐管家 / team-meal-manager

独立 Agent Skill，可用于 Windows 上的 Codex、WorkBuddy、Claude Code：组织者提供微信聊天文字或截图，授权浏览器定位并选择真实附近门店，整理多人需求，通过 OCP 查询瑞幸或麦当劳，生成同店配餐和真实整单报价，处理售罄后的局部重配，并在付款人确认后创建订单。三端安装支持与实际验收状态分别记录，不把安装文件等同于宿主调用通过。

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
├─ scripts/Build-SkillZip.ps1
├─ assets/runtime/
│  ├─ src/group-*.ts
│  ├─ src/group.test.ts
│  ├─ Save-GroupCredential.ps1
│  ├─ Save-MapCredential.ps1
│  └─ public/location.html
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
& .\scripts\Install-Skill.ps1 -Client claude
& .\scripts\Install-Skill.ps1 -Client workbuddy
& .\scripts\Build-SkillZip.ps1
& .\scripts\run.ps1 doctor
& .\scripts\run.ps1 demo -Brand luckin
& .\scripts\run.ps1 demo -Brand mcd
```

安装脚本更新 Codex skill 的指令文件，并用本机 `project.json` 指向本仓库。运行依赖仅安装在本仓库，不复制 node_modules、凭证或数据库。移动仓库后重新执行安装脚本；也可向 runner 传 `-ProjectRoot`。已有同名 skill 的个人修改需自行备份。

配置真实凭证：

```powershell
& .\assets\runtime\Save-GroupCredential.ps1 -Brand luckin
& .\assets\runtime\Save-GroupCredential.ps1 -Brand mcd
& .\assets\runtime\Save-MapCredential.ps1 # 高德Web服务Key，用于自动定位后的坐标转换和地址解析
& .\scripts\run.ps1 doctor -Connect
```

令牌交互输入不回显，保存为当前 Windows 用户加密的 DPAPI 文件。默认任务数据库为 `assets/runtime/data/team-meals.sqlite`；所有 data、凭证和 project.json 被 Git 忽略。

## 使用流程

```powershell
& .\scripts\run.ps1 pick-store -Task '<已有任务UUID>'
```

Skill 发起任务后临时打开默认浏览器，用户点击授权定位并选择门店；页面默认5家、可展开和搜索。命名位置仅在点击确认保存后落库。拒绝、超时、精度不足或Key缺失时，提供常用地点、地图链接、地址输入；不使用IP粗定位。详见 [三客户端与定位](references/clients.md)。

```text
Skill / 临时定位选店页
  → 任务服务
  → OCP manifest / query / resolve
  → 品牌适配器
  → 瑞幸 MCP / 麦当劳 MCP
```

新增品牌只扩展适配器及 OCP 映射；页面不直接调用品牌 MCP。高德仅提供坐标转换和地址解析，不用它的商家搜索代替品牌真实门店数据。

微信需求 → 集中确认名单及缺项 → 查店 → OCP menu/detail → 按实际规格配餐 → 整篮报价 → 预算核对 → 付款人确认 → 创建订单 → 用户付款 → 查询状态。

售罄时只替换 affected 成员，保留其他人的商品、数量和规格，重新报价并撤销旧审批。逐人金额只是整单金额分摊，不是官方单杯成交价。超时不能当作售罄；创建结果未知时禁止自动重试。

`demo` 全部模拟，包括模拟提交。真实任务默认 live；仅查询时停在 quote，不调用 approve 或 submit。详细文件职责和状态流程见 [workflow](references/workflow.md)，命令见 [commands](references/commands.md)。

代码沿用原 OCP-Catalog 示例开发成果，以 MIT 许可发布；协议 SDK 和 MCP SDK 的许可见各依赖。

验收结果与尚未验证的客户端边界见 [VALIDATION.md](VALIDATION.md)。
