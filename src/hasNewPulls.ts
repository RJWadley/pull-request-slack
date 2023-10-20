import { MappedPull } from "./getPullData";
import { getLocalValue, saveLocalValue } from "./localStorage";

/**
 * returns the time as HH:MM:SS
 */
const getTime = () => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
};

export const hasNewPulls = (currentPulls: MappedPull[]) => {
  const trackedPulls = getLocalValue();
  let hasNewPull = false;
  for (const pull of currentPulls) {
    if (
      // ready for review
      (!pull.draft && pull.checkState === "passing" && !pull.onHold) ||
      // already approved
      pull.approved
    ) {
      if (!trackedPulls.includes(pull.link)) {
        console.log(`[${getTime()}] New pull: ${pull.link}`);
        hasNewPull = true;
        trackedPulls.push(pull.link);
      }
    }
  }

  saveLocalValue(trackedPulls);

  return hasNewPull;
};
