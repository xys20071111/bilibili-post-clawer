/// <reference lib="dom" />
/// <reference lib="deno.unstable" />

import puppeteer from "puppeteer-extra";
import Stealth from "puppeteer-extra-plugin-stealth";
import { sleep } from "./utils.ts";
import { parseDynamicItem } from "./post_parser.ts";
import { Page } from "puppeteer-core";

async function fetchPostReplies(page: Page) {
  const result = await page.evaluate(async () => {
    const missionInfo = await getReplyArea();
    const pageNum = await getPageNum();
    const url = `https://api.bilibili.com/x/v2/reply?oid=${missionInfo.oid}&type=${missionInfo.type}&pn=${pageNum}`;
    console.log(url);
    const req = await fetch(url, {
      credentials: "include",
    });
    if (!req.ok) {
      await denoAlert(
        `request failed! Is your ip banned? currentOffset: ${JSON.stringify(missionInfo)} Code: ${req.status}`,
      );
      return null;
    }
    const res = await req.json();
    if (res.code !== 0) {
      if (res.code === 12002) {
        return res;
      }
      await denoLog(
        `https://api.bilibili.com/x/v2/reply?oid=${missionInfo.oid}&type=${missionInfo.type}&pn=${pageNum}`,
      );
      await denoAlert(
        `request failed! Maybe need pass a CAPTCHA? currentOffset: ${JSON.stringify(missionInfo)} Code: ${res.code}`,
      );
      return null;
    }
    const data = res.data;
    return data;
  });
  return result;
}

export async function fetchPostRepliesFromBrowser(
  page: Page,
  oid: string,
  type: number,
  storage: Deno.Kv,
) {
  await page.goto("https://www.bilibili.com");
  // 获取出错时，在deno中报错
  await page.exposeFunction("denoAlert", (text: string) => {
    alert(text);
  });
  await page.exposeFunction("denoLog", (...args: any[]) => {
    console.log.apply(null, args);
  });
  //向页面提供当前的id
  page.exposeFunction("getReplyArea", () => {
    return {
      oid,
      type,
    };
  });
  let pageNum = 1;
  page.exposeFunction("getPageNum", () => {
    return pageNum;
  });
  let hasMore = true;
  while (hasMore) {
    for (let i = 0; i < 5; i++) {
      try {
        const result = await fetchPostReplies(page);
        if (!result) {
          throw new Error(result);
        }
        if (result.code) {
          if (result.code === 12002) {
            console.log(`Post ${oid} doesn't have a comment area.`);
            hasMore = false;
            break;
          }
          throw new Error(result.code);
        }
        hasMore = result.replies !== null;
        if (!hasMore) {
          console.log(`Post ${oid} fetched`);
          break;
        }
        for (const item of result.replies) {
          await storage.set(["reply", item.rpid], item);
        }
        break;
      } catch (e) {
        console.error(`Retry fetching replies from ${oid} time(s): ${i}`);
        console.error(e);
        continue;
      }
    }
    await sleep(1.5);
    pageNum++;
  }
  await page.removeExposedFunction("denoAlert");
  await page.removeExposedFunction("denoLog");
  await page.removeExposedFunction("getReplyArea");
  await page.removeExposedFunction("getPageNum");
  await page.reload();
}

async function genExcludeList(db: Deno.Kv) {
  const oidSet: Set<string> = new Set();

  for await (const item of db.list<any>({ prefix: ["reply"] })) {
    oidSet.add(item!.value!.oid_str);
  }

  const oidList: string[] = [];

  oidSet.forEach((v) => oidList.push(v));
  return oidList;
}

if (import.meta.main) {
  const storage = await Deno.openKv("posts.kv");
  const repliesStorage = await Deno.openKv("replies.kv");
  puppeteer.default.use(Stealth());
  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath: Deno.env.get("CHROME_PATH") ?? "/usr/bin/google-chrome",
    userDataDir: "./browser-data",
    devtools: false,
    defaultViewport: null,
    pipe: true,
    protocolTimeout: 30 * 60 * 60 * 1000,
    args: [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-device-discovery-notifications",
    ],
  });
  const postList = storage.list({
    prefix: ["post"],
  });
  const page = await browser.newPage();
  const excludeList: string[] = [];
  if (Deno.env.get("USE_EXCLUDE")) {
    console.log("Generating exclude list...");
    (await genExcludeList(repliesStorage)).forEach((v) => excludeList.push(v));
  }
  for await (const post of postList) {
    const parsedPost = parseDynamicItem(post.value as any);
    if (excludeList.includes(parsedPost.commentArea.commentId)) {
      continue;
    }
    await fetchPostRepliesFromBrowser(
      page,
      parsedPost.commentArea.commentId,
      parsedPost.commentArea.commentType,
      repliesStorage,
    );
  }
  storage.close();
  await browser.close();
}
