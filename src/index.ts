import { exec } from "node:child_process";
import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";
import { promisify } from "node:util";
import { getLocalValue, saveLocalValue } from "./localStorage";
import { hasNewPulls } from "./hasNewPulls";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const execPromise = promisify(exec);

const loop = async () => {
  try {
    const pulls = await getPullData();

    const hasNew = hasNewPulls(pulls);

    const devBlocks = makeDevBlocks(pulls);
    await sendMessage(
      env.DEV_CHANNEL_ID,
      devBlocks,
      hasNew ? "notify" : "update"
    );

    const legworkPulls = pulls.filter((p) => p.repository === "legwork");
    const nonLegworkPulls = pulls.filter((p) => p.repository !== "legwork");

    const legwork = await makeCompactBlocks(legworkPulls);
    await sendMessage(
      env.LEGWORK_CHANNEL_ID,
      legwork,
      hasNew ? "update" : "silent"
    );

    const compactBlocks = await makeCompactBlocks(nonLegworkPulls);
    await sendMessage(
      env.COMPACT_CHANNEL_ID,
      compactBlocks,
      hasNew ? "update" : "silent"
    );
  } catch (e) {
    console.error(e);
    console.log("Current time is", new Date().toLocaleString());
  }

  await sleep(1000 * 60);

  await execPromise("git fetch && git pull");

  loop();
};

const init = async () => {
  loop();
};

init();
