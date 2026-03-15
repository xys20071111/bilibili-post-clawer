/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import { type Page } from "puppeteer-core"
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
  source: {
    name: string
    id: string
  },
  stopAt: number,
  baseOffset: string,
  storage: Deno.Kv,
) {
  let hasMore = true
  let currentOffset = baseOffset
  while (hasMore) {
    console.log(`[${source.name ? source.name : source.id}] 当前偏移：${currentOffset}`)
    for (let i = 0; i < 5; i++) {
      try {
        const result: any = await page.evaluate(`
          (async () => {
            ${fetchPostIds.toString().replace('{{missionInfo}}', JSON.stringify({ mid: source.id, offset: currentOffset }))};
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
            console.log(`动态 ${id} 发布时间早于 ${stopAt}，停止获取！`)
            return
          }
          await storage.set(["postId", id], source.name ? source.name : source.id)
        }
        break
      } catch (e) {
        console.error(`重试获取迭代 ${currentOffset}，第 ${i} 次`)
        console.error(e)
        continue
      }
    }
    // For debug.
    // break
    await sleep(3)
  }
  await storage.set(['lastFetchDate', source.id], Math.round(Date.now() / 1000))
}
