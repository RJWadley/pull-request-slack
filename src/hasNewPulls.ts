import { MappedPull, getPullData } from "./getPullData";
import { getLocalValue, saveLocalValue } from "./localStorage";

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
        console.log(`New pull: ${pull.link}`);
        hasNewPull = true;
        trackedPulls.push(pull.link);
      }
    }
  }

  saveLocalValue(trackedPulls);

  return hasNewPull;
};
