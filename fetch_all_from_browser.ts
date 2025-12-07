import { launch } from "puppeteer-core";
import { fetchPostDetailsFromBrowser } from "./fetch_post_details_from_browser.ts";
import { fetchPostIdsFromBrowser } from "./fetch_post_ids_from_browser.ts";
import { parseDynamicItem } from "./post_parser.ts";

const STOP_AT = Deno.env.get("STOP_AT") ?? "0";
let stopAt = parseInt(STOP_AT);
if (isNaN(stopAt)) {
  stopAt = 0;
}
console.log(`Will stop when post older than ${stopAt}`);

const midList = Deno.env.get("MID_LIST")?.split(",") ?? [];

const storage = await Deno.openKv("posts.kv");
const browser = await launch({
  headless: false,
  executablePath: "/usr/bin/google-chrome",
  userDataDir: "./browser-data",
  devtools: false,
  defaultViewport: null,
  pipe: true,
});

if (midList.length === 0) {
  console.error("Need mid list.");
  Deno.exit(1);
}

for (const mid of midList) {
  console.log(`Current mid: ${mid}`);
  await fetchPostIdsFromBrowser(browser, stopAt, mid, "", storage);
}

const idIter = storage.list({
  prefix: ["postId"],
});
const idList: Array<string> = [];
for await (const id of idIter) {
  idList.push(id.key[1] as string);
}
await fetchPostDetailsFromBrowser(browser, storage, idList);

const postIter = storage.list({
  prefix: ["post"],
});
const origIdList: Array<string> = [];
for await (const post of postIter) {
  const parsedPost = parseDynamicItem(post.value as any);
  if (parsedPost.type === "forward" && parsedPost.originalPostId) {
    const origId = parsedPost.originalPostId;
    const res = await storage.get(["postId", origId]);
    if (!res.value) {
      origIdList.push(origId);
      await storage.set(["postId", origId], "");
    }
  }
}
await fetchPostDetailsFromBrowser(browser, storage, origIdList);
await browser.close();
