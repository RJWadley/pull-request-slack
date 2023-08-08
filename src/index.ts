import { exec } from "node:child_process";
import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let dateOfMostRecentPull = new Date();

const loop = async () => {
  try {
    const pulls = await getPullData();

    let hasNewPull = false;
    for (const pull of pulls) {
      const pullCreatedAt = new Date(pull.openedAt);
      if (pullCreatedAt > dateOfMostRecentPull) {
        hasNewPull = true;
        dateOfMostRecentPull = pullCreatedAt;
      }
    }

    const devBlocks = makeDevBlocks(pulls);
    await sendMessage(env.DEV_CHANNEL_ID, devBlocks, hasNewPull);

    const compactBlocks = await makeCompactBlocks(pulls);
    await sendMessage(env.COMPACT_CHANNEL_ID, compactBlocks, hasNewPull);
  } catch (e) {
    console.error(e);
  }

  await sleep(1000 * 60);

  exec("git fetch && git pull");

  loop();
};

loop();
