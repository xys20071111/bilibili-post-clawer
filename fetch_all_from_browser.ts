import puppeteer from "puppeteer-extra"
import Stealth from "puppeteer-extra-plugin-stealth"
import { Browser } from "puppeteer-core"
import { fetchPostDetailsFromBrowser } from "./fetch_post_details_from_browser.ts"
import { fetchPostIdsFromBrowser } from "./fetch_post_ids_from_browser.ts"
import { parseDynamicItem } from "./post_parser.ts"

const STOP_AT = Deno.env.get("STOP_AT") ?? "0"
let stopAt = parseInt(STOP_AT)
if (isNaN(stopAt)) {
  stopAt = 0
}
console.log(`Will stop when post older than ${stopAt}`)

const midList = Deno.env.get("MID_LIST")?.split(",") ?? []

const storage = await Deno.openKv("posts.kv")
puppeteer.default.use(Stealth())
const browser: Browser = await puppeteer.default.launch({
  headless: Deno.env.get("HEADLESS") ? true : false,
  executablePath: Deno.env.get("CHROME_PATH") ?? "/usr/bin/google-chrome",
  userDataDir: "./browser-data",
  devtools: false,
  defaultViewport: null,
  pipe: true,
  protocolTimeout: 30 * 60 * 60 * 1000,
  args: [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-device-discovery-notifications",
  ],
})

const page = await browser.newPage()
// 打开B站
await page.goto("https://www.bilibili.com")
// 获取出错时，在deno中报错
await page.exposeFunction("denoAlert", (text: string) => {
  alert(text)
})
await page.exposeFunction("denoLog", (...args: any[]) => {
  console.log.apply(null, args)
})

if (midList.length === 0) {
  console.error("Need mid list.")
  Deno.exit(1)
}

for (const mid of midList) {
  console.log(`Current mid: ${mid}`)
  await fetchPostIdsFromBrowser(page, mid, stopAt, "", storage)
}

const idIter = storage.list({
  prefix: ["postId"],
})
const idList: Array<string> = []
for await (const id of idIter) {
  idList.push(id.key[1] as string)
}
await fetchPostDetailsFromBrowser(page, storage, idList)

const postIter = storage.list({
  prefix: ["post"],
})
const origIdList: Array<string> = []
for await (const post of postIter) {
  const parsedPost = parseDynamicItem(post.value as any)
  if (parsedPost.type === "forward" && parsedPost.originalPostId) {
    const origId = parsedPost.originalPostId
    const res = await storage.get(["postId", origId])
    if (!res.value) {
      origIdList.push(origId)
      await storage.set(["postId", origId], "")
    }
  }
}
await fetchPostDetailsFromBrowser(page, storage, origIdList)
await browser.close()
