/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import { Browser, launch, Page } from "puppeteer-core"
import { sleep } from "./utils.ts"

async function fetchPostDetails(page: Page) {
    const result = await page.evaluate(async () => {
        const id = await getId()
        console.log(`fetching ${id}`)
        const req = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/detail?id=${id}&features=itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion`, {
            credentials: 'include'
        })
        if (!req.ok) {
            await denoAlert(`request failed! Is your ip banned? currentId: ${id} Code: ${req.status}`)
            return { data: null, code: 114514 }
        }
        const res = await req.json()
        if (res.code !== 0) {
            if (res.code === -1024 || res.code === 4101152) {
                denoLog(`${id} is an artical or not exists, skipped...`).then()
                return { data: null, code: res.code }
            }
            await denoAlert(`request failed! Maybe need pass a CAPTCHA? currentId: ${id} Code: ${res.code}`)
            throw new Error()
        }
        const data = res.data.item
        return { data, code: res.code }
    })
    return result
}

export async function fetchPostDetailsFromBrowser(browser: Browser, storage: Deno.Kv, idList: Array<string>) {

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
    let currentId = ''
    page.exposeFunction('getId', () => {
        return currentId
    })
    for (const id of idList) {
        const key = id
        if ((await storage.get(['post', key])).value) {
            console.log(`${key} already fetched, pass...`)
            await storage.delete(['postId', key])
            continue
        }
        for (let i = 0; i < 5; i++) {
            try {
                currentId = key
                console.log(`fetching ${key}`)
                const result = await fetchPostDetails(page)
                if (result.data) {
                    await storage.set(['post', id], result.data)
                }
                if ([0, -1024, 4101152].includes(result.code)) {
                    await storage.delete(['postId', key])
                }
                break
            } catch (e) {
                console.log(e)
                console.error(`Retry fetching ${key} time(s): ${i}`)
            }
        }
        // break
        await sleep(5)
    }
    await page.close()
}

if (import.meta.main) {
    const browser = await launch({
        headless: false,
        executablePath: "/usr/bin/google-chrome",
        userDataDir: "./browser-data",
        devtools: false,
        defaultViewport: null
    })
    const storage = await Deno.openKv('posts.kv')
    const idIter = storage.list({
        prefix: ['postId']
    })
    const idList: Array<string> = []
    for await (const id of idIter) {
        idList.push(id.key[1] as string)
    }
    await fetchPostDetailsFromBrowser(browser, storage, idList)
    storage.close()
    await browser.close()
}
