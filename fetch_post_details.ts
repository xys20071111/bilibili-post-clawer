import { sleep } from "./utils.ts"

export async function fetchPostDetails(id: string, cookie: string, storage: Deno.Kv) {
    const req = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/desktop/v1/detail?id=${id}&features=itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion`, {
        headers: {
            Cookie: cookie,
            'User-Agent': 'PostFetchBot/1.0',
            Origin: 'https://space.bilibili.com'
        }
    })
    if (!req.ok) {
        alert(`request failed! Is your ip banned? currentId: ${id} Code: ${req.status}`)
        throw new Error()
    }
    const res = await req.json()
    if (res.code !== 0) {
        alert(`request failed! Maybe need pass a CAPTCHA? currentId: ${id} Code: ${res.code}`)
        throw new Error()
    }
    const data = res.data
    await storage.set(['post', id], data)
}

if (import.meta.main) {
    const COOKIE = Deno.env.get('COOKIE')
    if (!COOKIE) {
        console.error('Error: Need COOKIE')
        Deno.exit(1)
    }
    const storage = await Deno.openKv('posts.kv')
    const idList = storage.list({
        prefix: ['postId']
    })
    for await (const id of idList) {
        for (let i = 0; i < 5; i++) {
            try {
                await fetchPostDetails(id.key[1] as string, COOKIE as string, storage)
                break
            } catch {
                console.error(`Retry fetching ${id.key[1] as string} time(s): ${i}`)
                continue
            }
        }
        await sleep(5)
    }
    storage.close()
}