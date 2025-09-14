import { fetchPostDetailsFromBrowser } from "./fetch_post_details_from_browser.ts"
import { parseDynamicItem } from './post_parser.ts'

if (import.meta.main) {
    const storage = await Deno.openKv('posts.kv')
    const postIter = storage.list({
        prefix: ['post']
    })
    const idList: Array<string> = []
    for await (const post of postIter) {
        const parsedPost = parseDynamicItem((post.value as any))
        if (parsedPost.type === 'forward' && parsedPost.originalPostId) {
            const origId = parsedPost.originalPostId
            const res = await storage.get(['postId', origId])
            if (!res.value) {
                idList.push(origId)
                await storage.set(['postId', origId], '')
            }
        }
    }
    await fetchPostDetailsFromBrowser(storage, idList)
    storage.close()
}