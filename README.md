# 哔哩哔哩动态爬虫

### 注意：仅在 `Debian GNU/Linux 13.1 (trixie) aarch64` 和 `Debian GNU/Linux forky/sid (forky) x86_64` 环境下进行过测试

### 注意：`post_parser.ts` 由 Google Gemini 生成

## 使用说明

### 登陆 B 站

安装好 `Chrome` 或 `Chromium`  
在终端输入 `google-chrome --user-data-dir=<你想把浏览器数据存到哪>`（根据你安装的浏览器决定命令）  
在打开的浏览器中登陆 B 站

### 安装 MongoDB

本项目的动态详情、评论等数据存储在 MongoDB 中。请确保已安装并运行 MongoDB 服务。

### 写配置

`cp config.example.json config.json`  
编辑 `config.json`

|配置项|类型|内容|
|-|-|-|
|chromePath|`string` (可选)|Chrome 可执行文件的路径|
|browserDataPath|`string`|浏览器数据目录路径|
|headless|`boolean`|是否启用无头模式|
|skipRecentlyFetchedDays|`number \| null`|跳过最近爬取过的天数（0 或负数表示不启用，null 表示不检查）|
|excludeFetched|`boolean`|是否排除已爬取过的评论（已废弃，现默认爬取所有）|
|dbName|`string`|Deno KV 数据库名称（用于存储待获取列表和最后爬取时间）|
|sources|`array`|数据源列表，包含 `name`(昵称) 和 `id`(目标 uid)|
|mongodb|`object`|MongoDB 配置（见下表）|

#### MongoDB 配置项

|配置项|类型|内容|
|-|-|-|
|uri|`string`|MongoDB 连接 URI，如 `mongodb://localhost:27017`|
|database|`string`|数据库名称|
|collections.posts|`string`|存储动态详情的集合名|
|collections.replies|`string`|存储评论的集合名|

### 运行

`deno run --allow-read=./,<Chrome 可执行文件的路径> --allow-write=./ --allow-run --allow-sys --allow-net --unstable-kv <功能模块> config.json`

可用模块

|模块名|作用|
|-|-|
|`fetch_all_from_browser.ts`|爬取动态列表和详情|
|`fetch_reply_from_browser.ts`|爬取已爬取动态的评论区|
|`fetch_original_post_from_browser.ts`|获取转发动态的原始动态详情|
|`get_fetched_post.ts`|导出已爬取的动态为 JSONL 格式|

### 数据存储说明

- **Deno KV (SQLite)**:
  - `postId`: 待获取的动态 ID 列表
  - `lastFetchDate`: 各目标的最后爬取时间
  - `reply_page`: 各动态评论区的爬取进度（`pageNum` 为最后爬取的页码，`lastFetchedAt` 为完全爬取时的时间戳）
- **MongoDB**:
  - `posts` 集合：动态详情数据
  - `replies` 集合：评论数据（使用 `rpid` 作为唯一键，重复评论会自动更新）
