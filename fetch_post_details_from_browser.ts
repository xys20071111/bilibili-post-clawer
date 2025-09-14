/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import { launch, Page } from "puppeteer-core"
import { sleep } from "./utils.ts"

async function fetchPostDetails(page: Page, id: string, storage: Deno.Kv) {
    const data = await page.evaluate(async () => {
        const id = await getId()
        console.log(`fetching ${id}`)
        const req = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/detail?id=${id}&features=itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion`, {
            credentials: 'include'
        })
        if (!req.ok) {
            await denoAlert(`request failed! Is your ip banned? currentId: ${id} Code: ${req.status}`)
            throw new Error()
        }
        const res = await req.json()
        if (res.code !== 0) {
            if (res.code === -1024 || res.code === 4101152) {
                denoLog(`${id} is an artical or not exists, skipped...`).then()
                return null
            }
            await denoAlert(`request failed! Maybe need pass a CAPTCHA? currentId: ${id} Code: ${res.code}`)
            throw new Error()
        }
        const data = res.data.item
        return data
    })
    if (data) {
        await storage.set(['post', id], data)
    }
}

export async function fetchPostDetailsFromBrowser(storage: Deno.Kv, idList: Array<string>) {
    const browser = await launch({
        headless: false,
        executablePath: "/usr/bin/google-chrome",
        userDataDir: "./browser-data",
        devtools: false,
        defaultViewport: null
    })
    const page = await browser.newPage()
    await page.goto('https://www.bilibili.com')
    // 获取出错时，在deno中报错
    await page.exposeFunction('denoAlert', (text: string) => {
        alert(text)
    })
    await page.exposeFunction('denoLog', (...args: any[]) => {
        console.log.apply(null, args)
    })
    await page.waitForSelector('.logo-img')
    //向页面提供当前的id
    let currentId = ''
    page.exposeFunction('getId', () => {
        return currentId
    })
    for (const id of idList) {
        const key = id
        if ((await storage.get(['post', key])).value) {
            console.log(`${key} already fetched, pass...`)
            continue
        }
        for (let i = 0; i < 5; i++) {
            try {
                currentId = key
                console.log(`fetching ${key}`)
                await fetchPostDetails(page, key, storage)
                break
            } catch {
                console.error(`Retry fetching ${key} time(s): ${i}`)
                continue
            }
        }
        // break
        await sleep(5)
    }
    await page.close()
    await browser.close()
}

if (import.meta.main) {
    const storage = await Deno.openKv('posts.kv')
    const idIter = storage.list({
        prefix: ['postId']
    })
    const idList: Array<string> = []
    for await (const id of idIter) {
        idList.push(id.key[1] as string)
    }
    await fetchPostDetailsFromBrowser(storage, idList)
    storage.close()
}
