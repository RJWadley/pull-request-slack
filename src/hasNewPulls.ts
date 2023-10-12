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
        hasNewPull = true;
        trackedPulls.push(pull.link);
      }
    } else {
      // remove the link from the tracked pulls if its in there
      const index = trackedPulls.indexOf(pull.link);
      if (index !== -1) {
        trackedPulls.splice(index, 1);
      }
    }
  }
  saveLocalValue(
    trackedPulls
      //filter out links that are no longer in the pulls array
      .filter((link) => currentPulls.some((pull) => pull.link === link))
  );

  return hasNewPull;
};
