import { Config } from './config.ts';
import { parseDynamicItem } from './post_parser.ts'
import { db } from './db.ts'

if (import.meta.main) {
  const encoder = new TextEncoder();
  await db.connect()
  const output = await Deno.open("./result.jsonl", {
    create: true,
    write: true,
  });
  const postList = db.posts.find()
  for await (const post of postList) {
    await output.write(encoder.encode(`${JSON.stringify(parseDynamicItem(post.data))}\n`));
  }
  await db.close()
  output.close();
}
