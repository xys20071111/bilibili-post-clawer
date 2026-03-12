import { Config } from './config.ts';
import { parseDynamicItem } from './post_parser.ts'

if (import.meta.main) {
  const encoder = new TextEncoder();
  const storage = await Deno.openKv(`${Config.dbName}.sqlite3`);
  const output = await Deno.open("./result.jsonl", {
    create: true,
    write: true,
  });
  const postList = storage.list({
    prefix: ["post"],
  });
  for await (const post of postList) {
    await output.write(encoder.encode(`${JSON.stringify(parseDynamicItem(post.value))}\n`));
  }
  storage.close();
  output.close();
}
