import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import { Browser } from 'puppeteer-core'
import { fetchPostDetailsFromBrowser } from "./fetch_post_details_from_browser.ts"
import { parseDynamicItem } from './post_parser.ts'
import { db } from './db.ts'
import { Config } from './config.ts'

if (import.meta.main) {
    const storage = await Deno.openKv('posts.kv')
    await db.connect()
    
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
            '--no-sandbox',
        ],
    })
    
    const page = await browser.newPage()
    await page.goto('https://www.bilibili.com')
    await page.exposeFunction('denoAlert', (text: string) => {
        alert(text)
    })
    await page.exposeFunction('denoLog', (...args: any[]) => {
        console.log.apply(null, args)
    })
    
    const postIter = db.posts.find({}, { noCursorTimeout: true })
    const idList: Array<string> = []
    for await (const post of postIter) {
        const parsedPost = parseDynamicItem(post.data)
        if (parsedPost.type === 'forward' && parsedPost.originalPostId) {
            const origId = parsedPost.originalPostId
            const res = await db.getPostById(origId)
            if (!res) {
                idList.push(origId)
                await storage.set(['postId', origId], '')
            }
        }
    }
    
    await fetchPostDetailsFromBrowser(page, storage, db, idList.map(id => ({ id, from: 'OriginalPoster' })))
    
    await browser.close()
    await storage.close()
    await db.close()
}
