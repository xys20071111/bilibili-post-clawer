/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import puppeteer from "puppeteer-extra"
import Stealth from "puppeteer-extra-plugin-stealth"
import { sleep } from "./utils.ts"
import { parseDynamicItem } from "./post_parser.ts"
import { Page } from "puppeteer-core"
import { Config } from './config.ts'
import { db } from './db.ts'

async function fetchPostReplies() {
  const { oid, type, pageNum } = JSON.parse('{{missionInfo}}')
  const url = `https://api.bilibili.com/x/v2/reply?oid=${oid}&type=${type}&pn=${pageNum}`
  const req = await fetch(url, {
    credentials: "include",
  })
  if (req.status === 412) {
    await denoAlert(
      `Request failed, your ip was banned.`,
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

async function fetchPostRepliesFromBrowser(
  page: Page,
  oid: string,
  type: number,
  storage: Deno.Kv,
) {
  if (!oid) {
    console.error('oid 未定义，原因未知。')
    return
  }
  
  const pageRecord = await storage.get<{ pageNum: number, lastFetchedAt?: number }>(['reply_page', oid])
  const record = pageRecord.value
  
  if (record?.lastFetchedAt && Config.skipRecentlyFetchedDays && Config.skipRecentlyFetchedDays > 0) {
    const cooldownMs = Config.skipRecentlyFetchedDays * 24 * 60 * 60 * 1000
    const elapsedMs = Date.now() - record.lastFetchedAt
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
    if (elapsedMs < cooldownMs) {
      console.log(`动态 ${oid} 在冷却期内（${elapsedDays}天前获取过），跳过`)
      return
    }
  }
  
  let pageNum = record?.pageNum ?? 1
  let hasMore = true
  
  console.log(`正在获取动态 ${oid} 的评论，从第 ${pageNum} 页开始...`)
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
          if (result.code === 12002 || result.code === 12061) {
            console.log(`动态 ${oid} 没有评论区。`)
            hasMore = false
            break
          }
          if (result.code === -404) {
            console.log(`动态 ${oid} 没有评论，返回码为 -404`)
            hasMore = false
            break
          }
          if (result.code === -400) {
            console.log(`无法获取动态 ${oid} 的更多评论，结果可能不完整。`)
            hasMore = false
            break
          }
          throw new Error(result.code)
        }
        hasMore = result.replies !== null
        if (!hasMore) {
          console.log(`动态 ${oid} 评论获取完成`)
          if (pageNum === 1) {
            console.log(`动态 ${oid} 没有评论。`)
          }
          await storage.set(['reply_page', oid], { pageNum, lastFetchedAt: Date.now() })
          break
        }
        for (const item of result.replies) {
          try {
            await db.saveReply({
              rpid: item.rpid_str,
              oid: item.oid_str,
              oidType: item.type,
              ctime: item.ctime,
              uid: item.mid_str,
              parent: item.parent_str,
              nickname: item.member.uname,
              content: item.content.message,
              like: item.like,
              replyControl: item.reply_control
            })
          } catch (e) {
            if (e.code === 11000) {
              continue
            }
            throw e
          }
        }
        await storage.set(['reply_page', oid], { pageNum })
        break
      } catch (e) {
        console.error(`重试获取动态 ${oid} 的评论，第 ${i} 次`)
        console.error(e)
        continue
      }
    }
    await sleep(1.5)
    pageNum++
  }
}

if (import.meta.main) {
  const storage = await Deno.openKv(Config.dbName)
  puppeteer.default.use(Stealth())
  const browser = await puppeteer.default.launch({
    headless: Config.headless,
    executablePath: Config.chromePath ?? "/usr/bin/google-chrome",
    userDataDir: Config.browserDataPath ?? "./browser-data",
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
  await db.connect()
  const postList = db.posts.find({}, { noCursorTimeout: true })
  const page = await browser.newPage()
  const postIds: Array<{
    oid: string
    type: number
  }> = []
  for await (const post of postList) {
    const parsedPost = parseDynamicItem(post.data as any)
    if (parsedPost.commentArea.commentId) {
      postIds.push({
        oid: parsedPost.commentArea.commentId,
        type: parsedPost.commentArea.commentType!,
      })
    }
  }
  const totalTaskCount = postIds.length
  console.log(`总任务数：${totalTaskCount}`)
  await page.goto("https://www.bilibili.com")
  await page.exposeFunction("denoAlert", (text: string) => {
    alert(text)
  })
  await page.exposeFunction("denoLog", (...args: any[]) => {
    console.log.apply(null, args)
  })
  for (let i = 0; i < totalTaskCount; i++) {
    console.log(
      `进度：${i + 1}/${totalTaskCount} ${(((i + 1) / totalTaskCount) * 100).toFixed(4)}%`,
    )
    const { oid, type } = postIds[i]
    await fetchPostRepliesFromBrowser(page, oid, type, storage)
  }
  await storage.close()
  await browser.close()
  await db.close()
}
