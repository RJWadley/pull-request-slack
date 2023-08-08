import { exec } from "node:child_process";
import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loop = async () => {
  // send a new message in the middle of the night when everybody has notifications off
  const withinOneMinuteOfMidnight =
    new Date().getHours() === 23 && new Date().getMinutes() >= 58;

  try {
    console.log("getting updated data");
    const pulls = await getPullData();

    const devBlocks = makeDevBlocks(pulls);
    await sendMessage(env.DEV_CHANNEL_ID, devBlocks, withinOneMinuteOfMidnight);

    const compactBlocks = await makeCompactBlocks(pulls);
    await sendMessage(
      env.COMPACT_CHANNEL_ID,
      compactBlocks,
      withinOneMinuteOfMidnight
    );
  } catch (e) {
    console.error(e);
  }

  await sleep(1000 * 60);

  exec("git fetch && git pull");

  loop();
};

loop();
