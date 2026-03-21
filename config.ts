interface MongoDBConfig {
  uri: string
  database: string
  collections: {
    posts: string
    replies: string
    fetchedPosts: string
  }
}

interface Configuration {
  chromePath?: string
  browserDataPath: string
  headless: boolean
  skipRecentlyFetchedDays: number | null
  excludeFetched: boolean
  dbName: string
  mongodb?: MongoDBConfig
  sources: Array<{
    name: string
    id: string
  }>
}

export const Config: Configuration = JSON.parse(
  await Deno.readTextFile(Deno.args[0]),
)
