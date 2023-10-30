import { MappedPull } from "./getPullData";
import { getLocalValue, saveLocalValue } from "./localStorage";
import { logMessage } from "./logMessage";

export const hasNewPulls = (currentPulls: MappedPull[]) => {
  const trackedPulls = getLocalValue();
  let hasNewPull = false;
  for (const pull of currentPulls) {
    if (
      // ready for review
      (!pull.draft && !pull.onHold) ||
      // already approved
      pull.approved
    ) {
      if (!trackedPulls.includes(pull.link)) {
        logMessage(`New pull: ${pull.link}`);
        hasNewPull = true;
        trackedPulls.push(pull.link);
      }
    }
  }

  saveLocalValue(trackedPulls);

  return hasNewPull;
};
