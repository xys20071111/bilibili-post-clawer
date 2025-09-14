import { sleep } from "./utils.ts"

export async function fetchPostIds(override: boolean, mid: string, cookie: string, offset: string, storage: Deno.Kv) {
    const req = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?offset=${offset}&host_mid=${mid}&timezone_offset=-480`, {
        headers: {
            Cookie: cookie,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
            Origin: 'https://space.bilibili.com',
            Referer: `https://space.bilibili.com/${mid}/dynamic`
        }
    })
    if (!req.ok) {
        alert(`request failed! Is your ip banned? currentOffset: ${offset} Code: ${req.status}`)
        throw new Error()
    }
    const res = await req.json()
    if (res.code !== 0) {
        alert(`request failed! Maybe need pass a CAPTCHA? currentOffset: ${offset} Code: ${res.code}`)
        throw new Error()
    }
    const data = res.data
    for (const item of data.items) {
        if ((await storage.get(['postId', item.id_str])).value && !override) {
            console.log('Found a collected post, fetch end!')
            return {
                hasMore: false,
                offset: data.offset
            }
        }
        await storage.set(['postId', item.id_str], item.type)
        // await storage.set(['post', item.id_str], item)
    }
    return {
        hasMore: data.has_more,
        offset: data.offset
    }
}

if (import.meta.main) {
    const COOKIE = Deno.env.get('COOKIE')
    const MID = Deno.env.get('MID') ?? '88271743'
    const OFFSET = Deno.env.get('OFFSET') ?? ''
    const FORCE = Deno.env.get('FORCE') ? true : false
    if (!COOKIE) {
        console.error('Error: Need COOKIE')
        Deno.exit(1)
    }
    const storage = await Deno.openKv('posts.kv')
    let result = await fetchPostIds(FORCE, MID, COOKIE, OFFSET, storage)
    while (result.hasMore) {
        for (let i = 0; i < 5; i++) {
            try {
                result = await fetchPostIds(FORCE, MID, COOKIE, result?.offset ?? '', storage)
                break
            } catch {
                console.error(`Retry fetching offset ${result?.offset} time(s): ${i}`)
                continue
            }
        }
        await sleep(15)
    }
    storage.close()
}