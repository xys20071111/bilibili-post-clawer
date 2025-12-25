/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { type Page } from 'puppeteer-core'
import { sleep } from './utils.ts'
import { Browser } from 'puppeteer-core'
import { Config } from './config.ts'
import { parseDynamicItem } from './post_parser.ts'

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
  const data = res.data.item
  return data
}

export async function fetchPostDetailsFromBrowser(
  page: Page,
  storage: Deno.Kv,
  idList: Array<string>,
) {
  for (const id of idList) {
    if ((await storage.get(['post', id])).value) {
      console.log(`${id} already fetched, pass...`)
      await storage.delete(['postId', id])
      continue
    }
    for (let i = 0; i < 5; i++) {
      try {
        console.log(`fetching ${id}`)
        const result: any = page.evaluate(
          `(async () => {${
            fetchPostDetails.toString().replace('{{id}}', id)
          };return await fetchPostDetails();})()`,
        )
        if (result.data) {
          await storage.set(['post', id], parseDynamicItem(result.data))
        }
        if ([0, -1024, 4101152].includes(result.code)) {
          await storage.delete(['postId', id])
        }
        break
      } catch (e) {
        console.log(e)
        console.error(`Retry fetching ${id} time(s): ${i}`)
      }
    }
    // break
    await sleep(1.5)
  }
}

if (import.meta.main) {
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
    ],
  })
  const storage = await Deno.openKv('posts.kv')
  const idIter = storage.list({
    prefix: ['postId'],
  })
  const idList: Array<string> = []
  for await (const id of idIter) {
    idList.push(id.key[1] as string)
  }
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
  await fetchPostDetailsFromBrowser(page, storage, idList)
  storage.close()
  await browser.close()
}
