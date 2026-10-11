# Windows 三客户端与定位

核心业务和 SKILL.md 共用，宿主只负责读取 skill、运行 PowerShell/Bun，并把结果呈现给用户。品牌 MCP 只存在于适配层，门店发现经过 OCP manifest/query/resolve；菜单与订单沿用 OCP。不要将三个宿主安装目录与三个独立业务后端混淆。

## 安装

在独立仓库根目录 `bun install --frozen-lockfile`，再运行：

```powershell
& .\scripts\Install-Skill.ps1 -Client codex
& .\scripts\Install-Skill.ps1 -Client claude
& .\scripts\Install-Skill.ps1 -Client workbuddy
& .\scripts\Build-SkillZip.ps1
```

Codex 文件目录为用户 .codex/skills；Claude Code 为 .claude/skills。WorkBuddy 本机文件目录可放到 .workbuddy/skills，但是否被当前版本识别必须实际核对；官方界面支持导入本地技能包，优先导入 dist/team-meal-manager.zip。不要声称复制成功就代表客户端调用成功。

ZIP 是 Skill 文件与执行资产，不是桌面软件，且不含 node_modules、凭证或数据库。导入后的独立包需安装 Bun 依赖；同一 Windows 用户才可复用本机加密凭证。本机 Install-Skill.ps1 生成不上传的 project.json，将安装版指向共用独立运行目录。移动独立目录后重新安装。

Claude Code 使用 `/team-meal-manager`；Codex 使用 `$team-meal-manager`；WorkBuddy 在技能列表启用后用自然语言指定团餐管家。读取宿主实际工具能力后选择后台执行方式，不臆造客户端 API。

## 定位配置与使用

```powershell
& .\assets\runtime\Save-MapCredential.ps1
& .\scripts\run.ps1 doctor
& .\scripts\run.ps1 pick-store -Task '<UUID>'
```

高德 Key 必须为 Web 服务类型，交互输入后以 DPAPI 加密。也支持当前进程环境变量 AMAP_WEB_KEY。Key 只由服务端读取，网页不接收它。

pick-store 启动临时127.0.0.1页面并打开默认浏览器，不依赖客户端内嵌浏览器。命令先在 stderr 输出 location_url，随后等待最终选择 JSON；没有浏览器打开能力时用 -NoOpen，并让用户打开该链接。定位会话10分钟有效，选店或取消后关闭。此命令没有下单动作。

浏览器授权返回 WGS84、精度和时间；精度超过1000米或没有精度时暂停自动查店，提供常用地点、地图链接或地址。高德官方接口把 WGS84 转成 GCJ-02，并逆地理编码为城市与地点。

瑞幸适配层使用 GCJ-02 查询口径（与已验证高德门店链接口径一致，瑞幸官方坐标系尚无明确说明）；麦当劳当前工具仅支持城市＋关键词，不支持经纬度。距离仅在具备查询口径下可用门店坐标时计算直线估算，未知时保留上游顺序并标注，不能保证这种情况下“最近5家”。不把直线距离称为步行距离。

页面默认展示5家，可展开更多、搜索指定店名。保存命名位置必须点击确认保存；删除也需明确点击确认。常用地点保存在本机任务数据库 group_places 表，不上传。当前位置不会自动写入常用地点表；选择门店后任务保存查店位置以供后续品牌操作。

未配置Key时：高德含坐标链接可供瑞幸查店；麦当劳可手动输入城市＋地点；地址自动解析和浏览器自动查店暂停。地图短链接不会自动访问，要求用户提供展开后的链接。

## 验收边界

分别记录：宿主发现 skill、调用 doctor、fixture报价、打开定位页、选店回传、真实地图解析和真实查店。模拟定位或接口测试不能证明设备实际定位精度。未安装Claude Code或无法操作WorkBuddy界面时保留明确未验证项；不自动安装新的客户端。

官方参考：[Claude Code Skills](https://code.claude.com/docs/en/skills)、[WorkBuddy Skills](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)、[高德逆地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo)、[高德坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)、[W3C Geolocation](https://www.w3.org/TR/geolocation/)。
