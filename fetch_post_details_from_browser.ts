/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import { type Page } from 'puppeteer-core'
import { sleep } from './utils.ts'
import { parseDynamicItem } from './post_parser.ts'
import { MongoDB } from './db.ts'
import { MongoServerError } from 'mongodb'

async function fetchPostDetails() {
  const id = await '{{id}}'
  const req = await fetch(
    `https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/detail?id=${id}&features=itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion`,
    {
      credentials: 'include',
    },
  )
  if (req.status === 412) {
    await denoAlert(
      `request failed! Is your ip banned? currentId: ${id} Code: ${req.status}`,
    )
    return { code: 114514 }
  }
  const res = await req.json()
  if (res.code !== 0) {
    if (res.code === -1024 || res.code === 4101152) {
      denoLog(`${id} is an artical or not exists, skipped...`).then()
      return res
    }
    await denoAlert(
      `request failed! Maybe need pass a CAPTCHA? currentId: ${id} Code: ${res.code}`,
    )
    return res
  }
  return res
}

export async function fetchPostDetailsFromBrowser(
  page: Page,
  storage: Deno.Kv,
  db: MongoDB,
  postInfo: Array<{
    id: string
    from: string
  }>,
) {
  for (const post of postInfo) {
    for (let i = 0; i < 5; i++) {
      try {
        console.log(`正在获取 ${post.from} 发布的动态 ${post.id}`)
        const result: any = await page.evaluate(
          `(async () => {${
            fetchPostDetails.toString().replace('{{id}}', post.id)
          };return await fetchPostDetails();})()`,
        )
        if (result.data) {
          const paresdData = parseDynamicItem(result.data.item)
          await db.savePost(post.id, post.from, result.data.item)
          console.log(`已获取 ${paresdData.author.name} 发布的动态 ${post.id}`)
          await storage.delete(['postId', post.id])
        } else if ([0, -1024, 4101152].includes(result.code)) {
          await storage.delete(['postId', post.id])
        } else {
          console.log("请检查代码！")
        }
        break
      } catch (e) {
        if (e instanceof MongoServerError && e.message === 'Duplicate key violation on the requested collection: Index \'id_1\'') {
          console.log(`去重功能疑似失效，出现了重复的爬取: ${post.id}`)
          break
        }
        console.log(e)
        console.error(`重试获取 ${post.id}，第 ${i} 次`)
      }
    }
    await sleep(3)
  }
}
