import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { Browser } from 'puppeteer-core'
import { fetchPostDetailsFromBrowser } from './fetch_post_details_from_browser.ts'
import { fetchPostIdsFromBrowser } from './fetch_post_ids_from_browser.ts'
import { ParsedDynamicItem } from './post_parser.ts'
import { Config } from './config.ts'

const stopAt = Config.stopAt
console.log(`Will stop when post older than ${stopAt}`)

const sourceList: Array<{
  name: string,
  id: string
}> = JSON.parse(Deno.readTextFileSync(Deno.args[1]))

const storage = await Deno.openKv('posts.kv')
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
    '--no-sandbox'
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

for (const source of sourceList) {
  console.log(`Current target: ${source.name}`)
  await fetchPostIdsFromBrowser(page, source.id, stopAt, '', storage)
}

const idIter = storage.list({
  prefix: ['postId'],
})
const idList: Array<string> = []
for await (const id of idIter) {
  idList.push(id.key[1] as string)
}
await fetchPostDetailsFromBrowser(page, storage, idList)

const postIter = storage.list<ParsedDynamicItem>({
  prefix: ['post'],
})
const origIdList: Array<string> = []
for await (const post of postIter) {
  const parsedPost = post.value
  if (parsedPost.type === 'forward' && parsedPost.originalPostId) {
    const origId = parsedPost.originalPostId
    const res = await storage.get(['postId', origId])
    if (!res.value) {
      origIdList.push(origId)
      await storage.set(['postId', origId], '')
    }
  }
}
await fetchPostDetailsFromBrowser(page, storage, origIdList)
await browser.close()
await storage.close()
