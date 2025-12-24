/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import puppeteer from "puppeteer-extra"
import Stealth from "puppeteer-extra-plugin-stealth"
import { Browser, type Page } from "puppeteer-core"
import { sleep } from "./utils.ts"
import { parseDynamicItem } from "./post_parser.ts"

async function fetchPostIds() {
  const { mid, offset } = JSON.parse('{{missionInfo}}')
  const req = await fetch(
    `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?offset=${offset}&host_mid=${mid}&timezone_offset=-480`,
    {
      credentials: "include",
    },
  )
  if (!req.ok) {
    await denoAlert(
      `request failed! Is your ip banned? currentOffset: ${offset} Code: ${req.status}`,
    )
    return null
  }
  const res = await req.json()
  if (res.code !== 0) {
    return res
  }
  const data = res.data
  return data
}

export async function fetchPostIdsFromBrowser(
  page: Page,
  mid: string,
  stopAt: number,
  baseOffset: string,
  storage: Deno.Kv,
) {
  let hasMore = true
  let currentOffset = baseOffset
  while (hasMore) {
    for (let i = 0; i < 5; i++) {
      try {
        const result: any = await page.evaluate(`
          (async () => {
            ${fetchPostIds.toString().replace('{{missionInfo}}', JSON.stringify({ mid, offset: currentOffset }))};
            return await fetchPostIds()
          })()`)
        if (result.code) {
          alert(`Error code: ${result.code}! Maybe need pass a CAPTCHA?`)
          throw new Error(result.code)
        }
        hasMore = result.has_more
        currentOffset = result.offset
        for (const item of result.items) {
          const parsedPost = parseDynamicItem(item)
          const id = parsedPost.id
          const publishTime = parsedPost.publishTime
          if (publishTime < stopAt) {
            console.log(`Post ${id} older than ${stopAt}, stop fetching!`)
            return
          }
          await storage.set(["postId", id], item.type)
        }
        break
      } catch (e) {
        console.error(`Retry fetching offset ${currentOffset} time(s): ${i}`)
        console.error(e)
        continue
      }
    }
    await sleep(1.5)
  }
}

if (import.meta.main) {
  const MID = Deno.env.get("MID") ?? "88271743"
  const OFFSET = Deno.env.get("OFFSET") ?? ""
  const STOP_AT = Deno.env.get("STOP_AT") ?? "0"
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
  let stopAt = parseInt(STOP_AT)
  if (isNaN(stopAt)) {
    stopAt = 0
  }
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
  await fetchPostIdsFromBrowser(page, MID, stopAt, OFFSET, storage)
  storage.close()
  await browser.close()
}
