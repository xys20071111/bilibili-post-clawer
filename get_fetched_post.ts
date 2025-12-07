import { parseDynamicItem } from "./post_parser.ts";

if (import.meta.main) {
  const encoder = new TextEncoder();
  const storage = await Deno.openKv("posts.kv");
  const output = await Deno.open("./result.jsonl", {
    create: true,
    write: true,
  });
  const postList = storage.list({
    prefix: ["post"],
  });
  for await (const post of postList) {
    const parsedPost = parseDynamicItem(post.value as any);
    await output.write(encoder.encode(`${JSON.stringify(parsedPost)}\n`));
  }
  storage.close();
  output.close();
}
