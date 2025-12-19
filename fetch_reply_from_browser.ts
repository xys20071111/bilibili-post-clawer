/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import puppeteer from "puppeteer-extra"
import Stealth from "puppeteer-extra-plugin-stealth"
import { sleep } from "./utils.ts"
import { parseDynamicItem } from "./post_parser.ts"
import { Page } from "puppeteer-core"

async function fetchPostReplies() {
  const { oid, type, pageNum } = JSON.parse('{{missionInfo}}')
  const url = `https://api.bilibili.com/x/v2/reply?oid=${oid}&type=${type}&pn=${pageNum}`
  const req = await fetch(url, {
    credentials: "include",
  })
  if (!req.ok) {
    await denoAlert(
      `request failed! Is your ip banned? current oid: ${oid} Code: ${req.status}`,
    )
    return null
  }
  const res = await req.json()
  if (res.code !== 0) {
    if (res.code === 12002 && res.code === -400) {
      return res
    }
    await denoLog(
      `https://api.bilibili.com/x/v2/reply?oid=${oid}&type=${type}&pn=${pageNum}`,
    )
    await denoAlert(
      `request failed! Maybe need pass a CAPTCHA? current oid: ${oid} Code: ${res.code}`,
    )
    return null
  }
  const data = res.data
  return data
}

async function fetchPostRepliesFromBrowser(
  page: Page,
  oid: string,
  type: number,
  storage: Deno.Kv,
) {
  console.log(`Fetching post ${oid}...`)
  let pageNum = 1
  let hasMore = true
  while (hasMore) {
    for (let i = 0; i < 5; i++) {
      try {
        const functionBody = `
(async () => {
${fetchPostReplies.toString().replace("{{missionInfo}}", JSON.stringify({ oid, type, pageNum }))}
return await fetchPostReplies()
})()
        `
        const result: any = await page.evaluate(functionBody)
        if (!result) {
          throw new Error(result)
        }
        if (result.code) {
          if (result.code === 12002) {
            console.log(`Post ${oid} doesn't have a comment area.`)
            hasMore = false
            break
          }
          if (result.code === -400) {
            console.log(`Can't fetch more replies from post ${oid}, result may incomplete.`)
            hasMore = false
            break
          }
          throw new Error(result.code)
        }
        hasMore = result.replies !== null
        if (!hasMore) {
          console.log(`Post ${oid} fetched`)
          if (pageNum === 1) {
            console.log(`Post ${oid} does not have any reply, add to exclude list.`)
            await storage.set(['empty', oid], oid)
          }
          break
        }
        for (const item of result.replies) {
          await storage.set(["reply", item.rpid], item)
        }
        break
      } catch (e) {
        console.error(`Retry fetching replies from ${oid} time(s): ${i}`)
        console.error(e)
        continue
      }
    }
    await sleep(1.5)
    pageNum++
  }
}

async function genExcludeList(db: Deno.Kv) {
  const oidSet: Set<string> = new Set()

  for await (const item of db.list<any>({ prefix: ["reply"] })) {
    oidSet.add(item!.value!.oid_str)
  }

  const oidList: string[] = []

  oidSet.forEach((v) => oidList.push(v))
  return oidList
}

if (import.meta.main) {
  const storage = await Deno.openKv("posts.kv")
  const repliesStorage = await Deno.openKv("replies.kv")
  puppeteer.default.use(Stealth())
  const browser = await puppeteer.default.launch({
    headless: false,
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
  const postList = storage.list({
    prefix: ["post"],
  })
  const page = await browser.newPage()
  const excludeList: string[] = []
  // 生成排除清单
  if (Deno.env.get("USE_EXCLUDE")) {
    console.log("Generating exclude list...");
    (await genExcludeList(repliesStorage)).forEach((v) => excludeList.push(v))
    for await (const item of repliesStorage.list({ prefix: ['empty'] })) {
      excludeList.push(item.key[1] as string)
    }
  }
  const postIds: Array<{
    oid: string
    type: number
  }> = []
  // 生成任务清单
  for await (const post of postList) {
    const parsedPost = parseDynamicItem(post.value as any)
    if (excludeList.includes(parsedPost.commentArea.commentId)) {
      console.log(
        `Post ${parsedPost.commentArea.commentId} already fetched, skipped...`,
      )
      continue
    }
    postIds.push({
      oid: parsedPost.commentArea.commentId,
      type: parsedPost.commentArea.commentType,
    })
  }
  const totalTaskCount = postIds.length
  console.log(`Total task(s): ${totalTaskCount}`)
  // 打开B站
  await page.goto("https://www.bilibili.com")
  // 获取出错时，在deno中报错
  await page.exposeFunction("denoAlert", (text: string) => {
    alert(text)
  })
  await page.exposeFunction("denoLog", (...args: any[]) => {
    console.log.apply(null, args)
  })
  // 开始爬取
  for (let i = 0; i < totalTaskCount; i++) {
    console.log(
      `Progress: ${i + 1}/${totalTaskCount} ${((i + 1) / totalTaskCount).toFixed(4)}%`,
    )
    const { oid, type } = postIds[i]
    await fetchPostRepliesFromBrowser(page, oid, type, repliesStorage)
  }
  storage.close()
  await browser.close()
}
