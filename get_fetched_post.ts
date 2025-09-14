import { parseDynamicItem } from './post_parser.ts'

if (import.meta.main) {
    const storage = await Deno.openKv('posts.kv')
    const postList = storage.list({
        prefix: ['post']
    })
    for await (const post of postList) {
        const parsedPost = parseDynamicItem((post.value as any))
        // if (parsedPost.type === 'image' && parsedPost.content === '') {
        //     console.log(parsedPost.id)
        // }
        // if (parsedPost.id === '983310570380853268') {
        console.log(JSON.stringify(parsedPost))
        //     console.error(JSON.stringify(post.value, null, 4))
        // }
    }
    storage.close()
}