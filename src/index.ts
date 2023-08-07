import { exec } from "node:child_process";
import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loop = async () => {
  console.log("getting updated data");
  const pulls = await getPullData();

  const devBlocks = makeDevBlocks(pulls);
  await sendMessage(env.DEV_CHANNEL_ID, devBlocks, false);

  const compactBlocks = await makeCompactBlocks(pulls);
  await sendMessage(env.COMPACT_CHANNEL_ID, compactBlocks, false);

  await sleep(1000 * 60);

  exec("git fetch && git pull");

  loop();
};

loop();
