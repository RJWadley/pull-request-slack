import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";
import { hasNewPulls } from "./hasNewPulls";
import { logMessage } from "./logMessage";

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(_exec);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loop = async () => {
  try {
    logMessage("Checking for updates...");
    const pulls = await getPullData();
    logMessage(`Checked for updates. ${pulls.length} pulls found.`);

    const hasNew = hasNewPulls(pulls);

    const { blocks: devBlocks, forcePing } = makeDevBlocks(pulls);
    await sendMessage(
      env.DEV_CHANNEL_ID,
      devBlocks,
      forcePing ? "notify" : hasNew ? "notify" : "update"
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
    logMessage("Error! " + String(e));
  }

  await sleep(1000 * 60);

  // await Promise.race([
  //   (async () => {
  //     sleep(10_000);
  //     logMessage("Update took too long, restarting...");
  //     process.exit(1);
  //   })(),
  //   exec("git fetch && git pull"),
  // ]).catch(() => {
  //   logMessage("Update failed!");
  //   process.exit(1);
  // });
  // logMessage("Updated myself!");

  loop();
};

const init = async () => {
  logMessage("Starting up...");
  loop();
};

init();
