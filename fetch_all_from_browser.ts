import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { Browser } from 'puppeteer-core'
import { fetchPostDetailsFromBrowser } from './fetch_post_details_from_browser.ts'
import { fetchPostIdsFromBrowser } from './fetch_post_ids_from_browser.ts'
import { parseDynamicItem } from './post_parser.ts'
import { Config } from './config.ts'
import { sleep } from './utils.ts'
import { db } from './db.ts'

const MODE = Deno.env.get("MODE")

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
await page.goto('https://www.bilibili.com')
await page.exposeFunction('denoAlert', (text: string) => {
  alert(text)
})
await page.exposeFunction('denoLog', (...args: any[]) => {
  console.log.apply(null, args)
})

if (sourceList.length === 0) {
  console.error('未配置来源。')
  Deno.exit(1)
}

for (const source of sourceList) {
  console.log(`当前目标：${source.name || source.id}`)
  const lastFetchDate = await storage.get<number>(['lastFetchDate', source.id])
  if (
    Config.doNotFetchIfFetchedInThreeDays && lastFetchDate.value &&
    Math.round(Date.now() / 1000) - lastFetchDate.value < 3 * 24 * 60 * 60
  ) {
    console.log('过去 3 天内已获取，跳过。')
  } else {
    await fetchPostIdsFromBrowser(
      page,
      source,
      lastFetchDate.value ? lastFetchDate.value : 0,
      '',
      storage,
      MODE
    )
    // For debug
    if (MODE === 'DEBUG') {
      break
    }
    console.log('获取成功，等待 5 秒...')
    await sleep(5)
  }
}

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
await db.connect()
await fetchPostDetailsFromBrowser(page, storage, db, idList)

const postIter = db.posts.find({}, { noCursorTimeout: true, batchSize: 50 })
const origIdList: Array<PostItem> = []
for await (const post of postIter) {
  const parsedPost = parseDynamicItem(post.data)
  if (parsedPost.type === 'forward' && parsedPost.originalPostId) {
    const origId = parsedPost.originalPostId
    const res = await db.getPostById(origId)
    if (!res) {
      origIdList.push({
        id: origId,
        from: 'OriginalPoster'
      })
      await storage.set(['postId', origId], '')
    }
  }
}
await fetchPostDetailsFromBrowser(page, storage, db, origIdList)

await browser.close()
await storage.close()
await db.close()
