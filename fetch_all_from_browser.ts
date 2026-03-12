import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { Browser } from 'puppeteer-core'
import { fetchPostDetailsFromBrowser } from './fetch_post_details_from_browser.ts'
import { fetchPostIdsFromBrowser } from './fetch_post_ids_from_browser.ts'
import { ParsedDynamicItem, parseDynamicItem } from './post_parser.ts'
import { Config } from './config.ts'
import { sleep } from './utils.ts'

interface PostItem {
  id: string
  from: string
}

const sourceList = Config.sources

const storage = await Deno.openKv(`${Config.dbName}.sqlite3`)
puppeteer.default.use(Stealth())
const browser: Browser = await puppeteer.default.launch({
  headless: Config.headless,
  executablePath: Config.chromePath ?? '/usr/bin/google-chrome',
  userDataDir: Config.browserDataPath ?? './browser-data',
  devtools: false,
  defaultViewport: null,
  pipe: true,
  protocolTimeout: 30 * 60 * 60 * 1000,
  args: [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-device-discovery-notifications',
    '--no-sandbox',
  ],
})

const page = await browser.newPage()
// 打开B站
await page.goto('https://www.bilibili.com')
// 获取出错时，在deno中报错
await page.exposeFunction('denoAlert', (text: string) => {
  alert(text)
})
await page.exposeFunction('denoLog', (...args: any[]) => {
  console.log.apply(null, args)
})

if (sourceList.length === 0) {
  console.error('Need source.')
  Deno.exit(1)
}

// 获取动态列表
for (const source of sourceList) {
  console.log(`Current target: ${source.name || source.id}`)
  const lastFetchDate = await storage.get<number>(['lastFetchDate', source.id])
  if (
    Config.doNotFetchIfFetchedInThreeDays && lastFetchDate.value &&
    Math.round(Date.now() / 1000) - lastFetchDate.value < 3 * 24 * 60 * 60
  ) {
    console.log('Already fetched in last 3 days, skipped.')
  } else {
    await fetchPostIdsFromBrowser(
      page,
      source,
      lastFetchDate.value ? lastFetchDate.value : 0,
      '',
      storage,
    )
    console.log('Fetch success, sleep 5 seconds...')
    await sleep(5)
  }
}

// 获取动态详情
const idIter = storage.list<string>({
  prefix: ['postId'],
})
const idList: Array<PostItem> = []
for await (const id of idIter) {
  idList.push({
    id: id.key[1] as string,
    from: id.value
  })
}
await fetchPostDetailsFromBrowser(page, storage, idList)

// 检查一下是不是转发的，是的话获取原始动态
const postIter = storage.list<any>({
  prefix: ['post'],
})
const origIdList: Array<PostItem> = []
for await (const post of postIter) {
  const parsedPost = parseDynamicItem(post.value)
  if (parsedPost.type === 'forward' && parsedPost.originalPostId) {
    const origId = parsedPost.originalPostId
    const res = await storage.get(['postId', origId])
    if (!res.value) {
      origIdList.push({
        id: origId,
        from: 'OriginalPoster'
      })
      await storage.set(['postId', origId], '')
    }
  }
}
await fetchPostDetailsFromBrowser(page, storage, origIdList)

// 清理，退出，之后就可以去跑获取评论的脚本了
await browser.close()
await storage.close()
