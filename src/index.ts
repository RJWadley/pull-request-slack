import { env } from "./env";
import { getPullData } from "./getPullData";
import { makeCompactBlocks } from "./makeCompactBlocks";
import { makeDevBlocks } from "./makeDevBlocks";
import { sendMessage } from "./sendMessage";
import { hasNewPulls } from "./hasNewPulls";
import { logMessage } from "./logMessage";

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import { heartbeat } from "./health";

const exec = promisify(_exec);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const loop = async () => {
  heartbeat();

  logMessage("Checking for updates...");
  const pulls = await getPullData();
  logMessage(`Checked for updates. ${pulls.length} pulls found.`);

  const legworkPulls = pulls.filter((p) => p.repository.startsWith("legwork"));
  const nonLegworkPulls = pulls.filter((p) => !legworkPulls.includes(p));

  const hasNewLegwork = hasNewPulls(legworkPulls);
  const hasNewNonLegwork = hasNewPulls(nonLegworkPulls);
  const hasNew = hasNewLegwork || hasNewNonLegwork;

  const { blocks: devBlocks, forcePing } = makeDevBlocks(pulls);
  await sendMessage(
    env.DEV_CHANNEL_ID,
    devBlocks,
    forcePing ? "notify" : hasNew ? "notify" : "update",
    "You have a pull request to review!"
  );

  const legwork = await makeCompactBlocks(legworkPulls);
  await sendMessage(
    env.LEGWORK_CHANNEL_ID,
    legwork,
    hasNewLegwork ? "update" : "silent",
    hasNewLegwork ? "New Pull Requests" : "Updated Pull Requests"
  );

  const compactBlocks = await makeCompactBlocks(nonLegworkPulls);
  await sendMessage(
    env.COMPACT_CHANNEL_ID,
    compactBlocks,
    hasNewNonLegwork ? "update" : "silent",
    hasNewNonLegwork ? "New Pull Requests" : "Updated Pull Requests"
  );

  await sleep(1000 * 60);

  const out = await exec("git fetch && git pull");
  logMessage(`Updated myself! ${out.stdout}${out.stderr}`);

  loop();
};

const init = async () => {
  logMessage("Starting up...");

  const pulls = await getPullData();
  hasNewPulls(pulls);

  logMessage("System is primed!");
  loop();
};

init();
