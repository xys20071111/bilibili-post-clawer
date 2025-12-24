# 哔哩哔哩动态爬虫

### 注意：仅在`Debian GNU/Linux 13.1 (trixie) aarch64`和`Debian GNU/Linux forky/sid (forky) x86_64`环境下进行过测试

### 注意：`post_paser.ts`由Google Gemini生成

## 使用说明

### 登陆B站

安装好`Chrome`或`Chromium`  
在终端输入 `google-chrome --user-data-dir=<你想把浏览器数据存到哪>` （根据你安装的浏览器决定命令）  
在打开的浏览器中登陆B站

### 写配置

`cp config.example.json config.json`  
编辑`config.json`

|配置项|类型|内容|
|-|-|-|
|midList|`string[]`|要爬取目标的uid|
|chromePath|`string`|Chrome可执行文件的路径|
|browserDataPath|`string`|`<你想把浏览器数据存到哪>`|
|stop|`number`|截止时间戳，以秒为单位，遇到发布早于此时间的动态会停止爬取|
|headless|`boolean`|是否启用无头模式|
|excludeFetched|`boolean`|是否排除已爬取过的评论（只用于爬取评论区的脚本）|

### 运行
`deno run --allow-read=./,<Chrome可执行文件的路径> --allow-write=./ --allow-run --allow-sys --allow-net --unstable-kv <功能模块>`  
可用模块
|模块名|作用|
|-|-|
|`fetch_all_from_browser.ts`|爬取动态|
|`fetch_reply_from_browser.ts`|爬取已爬取动态的评论区|