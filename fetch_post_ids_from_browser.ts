/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import { Browser, launch, Page } from "puppeteer-core"
import { sleep } from "./utils.ts"
import { parseDynamicItem } from "./post_parser.ts"

async function fetchPostIds(page: Page) {
    const result = await page.evaluate(async () => {
        let mid = await getMid()
        let offset = await getOffset()
        const req = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?offset=${offset}&host_mid=${mid}&timezone_offset=-480`, {
            credentials: 'include'
        })
        if (!req.ok) {
            await denoAlert(`request failed! Is your ip banned? currentOffset: ${offset} Code: ${req.status}`)
            return null
        }
        const res = await req.json()
        if (res.code !== 0) {
            await denoAlert(`request failed! Maybe need pass a CAPTCHA? currentOffset: ${offset} Code: ${res.code}`)
            return null
        }
        const data = res.data
        return data
    })
    return result
}

export async function fetchPostIdsFromBrowser(browser: Browser, stopAt: number, mid: string, baseOffset: string, storage: Deno.Kv) {
    const page = await browser.newPage()
    await page.goto('https://www.bilibili.com')
    // 获取出错时，在deno中报错
    await page.exposeFunction('denoAlert', (text: string) => {
        alert(text)
    })
    await page.exposeFunction('denoLog', (...args: any[]) => {
        console.log.apply(null, args)
    })
    // await page.waitForSelector('.logo-img')
    //向页面提供当前的id
    page.exposeFunction('getMid', () => {
        return mid
    })
    let hasMore = true
    let currentOffset = baseOffset
    page.exposeFunction('getOffset', () => {
        console.log(`Current offset: ${currentOffset}`)
        return currentOffset
    })
    while (hasMore) {
        for (let i = 0; i < 5; i++) {
            try {
                const result = await fetchPostIds(page)
                if (!result) {
                    throw new Error()
                }
                hasMore = result.has_more
                currentOffset = result.offset
                for (const item of result.items) {
                    const parsedPost = parseDynamicItem(item)
                    const id = parsedPost.id
                    const publishTime = parsedPost.publishTime
                    if (publishTime < stopAt) {
                        console.log(`Post ${id} older than ${stopAt}, stop fetching!`)
                        await page.close()
                        return
                    }
                    await storage.set(['postId', id], item.type)
                }
                break
            } catch {
                console.error(`Retry fetching offset ${currentOffset} time(s): ${i}`)
                continue
            }
        }
        await sleep(15)
    }
    await page.close()
}

if (import.meta.main) {
    const MID = Deno.env.get('MID') ?? '88271743'
    const OFFSET = Deno.env.get('OFFSET') ?? ''
    const STOP_AT = Deno.env.get('STOP_AT') ?? '0'
    const storage = await Deno.openKv('posts.kv')
    const browser = await launch({
        headless: false,
        executablePath: "/usr/bin/google-chrome",
        userDataDir: "./browser-data",
        devtools: false,
        defaultViewport: null
    })
    let stopAt = parseInt(STOP_AT)
    if (isNaN(stopAt)) {
        stopAt = 0
    }
    await fetchPostIdsFromBrowser(browser, stopAt, MID, OFFSET, storage)
    storage.close()
    await browser.close()
}