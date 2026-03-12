interface Configuration {
  chromePath?: string
  browserDataPath: string
  headless: boolean
  doNotFetchIfFetchedInThreeDays: boolean
  excludeFetched: boolean
  dbName: string
  sources: Array<{
    name: string
    id: string
  }>
}

export const Config: Configuration = JSON.parse(
  await Deno.readTextFile(Deno.args[0]),
)
