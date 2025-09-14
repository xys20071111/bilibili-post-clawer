// Type definition for the parsed dynamic item
export interface AuthorInfo {
    mid: number
    name: string
    face: string
}

export interface VideoInfo {
    title: string
    description: string
    cover: string
    jumpUrl: string
    duration: string
    avId: string
    bvId: string
    stats: any
}

export interface ReserveInfo {
    title: string
    publishTimeText: string
    total: number
    jumpUrl: string
}

export interface ParsedDynamicItem {
    id: string
    author: AuthorInfo
    publishTime: number
    publishTimeText: string
    type: 'forward' | 'video' | 'image' | 'text' | 'other'

    // Optional fields based on type
    originalPostId?: string    // For forwards
    videoInfo?: VideoInfo        // For videos
    imageUrls?: string[]       // For image posts
    content?: string           // For text-only posts
    reserveInfo?: ReserveInfo    // For posts with a reservation
}

/**
 * Parses a single dynamic item from the Bilibili API into a simplified, structured object.
 * This version is robust enough to handle inconsistencies in the API structure,
 * such as `modules` being either an array or an object.
 *
 * @param item A single dynamic item from the API.
 * @returns A structured object containing the key information of the dynamic post.
 */
export function parseDynamicItem(item: any): ParsedDynamicItem {
    const result: Partial<ParsedDynamicItem> = { id: item.id_str }

    // --- Unified Module Access ---
    // The API is inconsistent: `modules` can be an object or an array.
    let authorModule: any
    let dynamicModule: any
    let descModule: any
    const isNewVersion = Array.isArray(item.modules)
    if (isNewVersion) {
        // Array-based structure (seen in forward posts)
        authorModule = item.modules.find((m: any) => m.module_type === 'MODULE_TYPE_AUTHOR')?.module_author
        dynamicModule = item.modules.find((m: any) => m.module_type === 'MODULE_TYPE_DYNAMIC')?.module_dynamic
        descModule = item.modules.find((m: any) => m.module_type === 'MODULE_TYPE_DESC')?.module_desc
    } else if (item.modules) {
        // Object-based structure (seen in video/draw posts)
        authorModule = item.modules.module_author
        dynamicModule = item.modules.module_dynamic
        descModule = dynamicModule?.desc
    }

    // --- Author and Publish Time ---
    if (authorModule) {
        const user = authorModule.user || authorModule
        result.author = {
            mid: user.mid,
            name: user.name,
            face: user.face
        }
        result.publishTime = authorModule.pub_ts
        result.publishTimeText = authorModule.pub_time ?? authorModule.pub_text
    }

    // --- Main Content Type ---
    if (isNewVersion) {
        if (item.type === 'DYNAMIC_TYPE_FORWARD') {
            result.type = 'forward'
            result.content = descModule?.text ?? ''
            result.originalPostId = dynamicModule?.dyn_forward?.item?.id_str
        } else if (item.type === 'DYNAMIC_TYPE_AV') {
            result.type = 'video'
            if (dynamicModule?.dyn_archive) {
                result.videoInfo = {
                    title: dynamicModule.dyn_archive.title,
                    description: dynamicModule.dyn_archive.desc,
                    cover: dynamicModule.dyn_archive.cover,
                    jumpUrl: dynamicModule.dyn_archive.jump_url,
                    duration: dynamicModule.dyn_archive.duration_text,
                    avId: dynamicModule.dyn_archive.aid,
                    bvId: dynamicModule.dyn_archive.bvid,
                    stats: dynamicModule.dyn_archive.stat
                }
            }
            if (descModule?.text) {
                result.content = descModule?.text
            }
        } else if (item.type === 'DYNAMIC_TYPE_DRAW') {
            result.type = 'image'
            result.content = descModule?.text ?? dynamicModule?.major?.opus?.summary?.text ?? ''
            if (Array.isArray(dynamicModule?.dyn_draw?.items)) {
                result.imageUrls = dynamicModule?.dyn_draw?.items.map((i: any) => i.src)
            } else {
                result.type = 'text'
                result.imageUrls = undefined
            }
        }
        /* else if (item.type === 'DYNAMIC_TYPE_OPUS') {
            const hasImages = dynamicModule?.major?.opus?.pics?.length > 0
            if (hasImages) {
                result.type = 'image'
                result.content = dynamicModule?.major?.opus?.summary?.text ?? ''
                result.imageUrls = dynamicModule.major.opus.pics.map((p: any) => p.src)
            } else {
                result.type = 'text'
                result.content = dynamicModule?.major?.opus?.summary?.text ?? ''
            }
        } */
        else if (item.type === 'DYNAMIC_TYPE_WORD') {
            result.type = 'text'
            result.content = descModule?.text ?? ''
        } else {
            result.type = 'other'
        }
    } else {
        // Old version
        if (item.type === 'DYNAMIC_TYPE_FORWARD') {
            result.type = 'forward'
            result.content = descModule?.text ?? ''
            if (item.orig) {
                result.originalPostId = item.orig.id_str
            } else if (dynamicModule?.dyn_forward) {
                result.originalPostId = dynamicModule?.dyn_forward?.item?.id_str
            }
        } else if (item.type === 'DYNAMIC_TYPE_AV') {
            result.type = 'video'
            if (dynamicModule?.desc?.text) {
                result.content = dynamicModule?.desc?.text
            }
            if (dynamicModule?.major?.archive) {
                result.videoInfo = {
                    title: dynamicModule?.major?.archive?.title,
                    description: dynamicModule?.major?.archive?.desc,
                    cover: dynamicModule?.major?.archive?.cover,
                    jumpUrl: dynamicModule?.major?.archive?.jump_url,
                    duration: dynamicModule?.major?.archive?.duration_text,
                    avId: dynamicModule?.major?.archive?.aid,
                    bvId: dynamicModule?.major?.archive?.bvid,
                    stats: dynamicModule?.major?.archive?.stat
                }
            }
        } else if (item.type === 'DYNAMIC_TYPE_DRAW') {
            result.type = 'image'
            result.content = descModule?.text ?? dynamicModule?.major?.opus?.summary?.text ?? ''
            if (dynamicModule?.major?.draw?.items) {
                result.imageUrls = dynamicModule.major.draw.items.map((i: any) => i.src)
            } else if (dynamicModule?.major?.opus?.pics?.length > 0) {
                result.imageUrls = dynamicModule?.major?.opus?.pics.map((i: any) => i.url)
            } else if (Array.isArray(dynamicModule?.dyn_draw?.items)) {
                result.imageUrls = dynamicModule?.dyn_draw?.items.map((i: any) => i.src)
            } else {
                result.type = 'text'
                result.imageUrls = undefined
            }
        } else if (item.type === 'DYNAMIC_TYPE_OPUS') {
            const hasImages = dynamicModule?.major?.opus?.pics?.length > 0
            if (hasImages) {
                result.type = 'image'
                result.content = dynamicModule?.major?.opus?.summary?.text ?? ''
                result.imageUrls = dynamicModule.major.opus.pics.map((p: any) => p.src)
            } else {
                result.type = 'text'
                result.content = dynamicModule?.major?.opus?.summary?.text ?? ''
            }
        } else if (item.type === 'DYNAMIC_TYPE_WORD') {
            result.type = 'text'
            result.content = descModule?.text ?? ''
        } else {
            result.type = 'other'
        }
    }

    // --- Check for Additional Components (like Reservations) ---
    if (dynamicModule?.additional?.type === 'ADDITIONAL_TYPE_RESERVE') {
        const reserve = dynamicModule.additional.reserve
        result.reserveInfo = {
            title: reserve.title,
            publishTimeText: reserve.desc1.text,
            total: reserve.reserve_total,
            jumpUrl: reserve.jump_url
        }
    }

    return result as ParsedDynamicItem
}