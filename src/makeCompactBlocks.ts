import { KnownBlock } from "@slack/bolt";
import { MappedPull } from "./getPullData";

import slackEmojis from "./data/slackEmojis.json";
type User = keyof typeof slackEmojis;
const isUser = (user: string): user is User => {
  return user in slackEmojis;
};

import repoSlackEmojis from "./data/repoSlackEmojis.json";
import { getBuildStatus } from "./getBuildStatus";
type RepoName = keyof typeof repoSlackEmojis;
const isRepoName = (repo: string): repo is RepoName => {
  return repo in repoSlackEmojis;
};

const isRecent = (dateString: string | null): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  // is within last week
  return now.getTime() - date.getTime() < 1000 * 60 * 60 * 24 * 7;
};

const irrelevantRepositories = ["library", "reform-gatsby-starter"];

export const makeCompactBlocks = async (pullsIn: MappedPull[]) => {
  const pulls = pullsIn
    // only include repos the design team cares about
    .filter((pull) => !irrelevantRepositories.includes(pull.repository))
    // only include pulls into the main or demo (legwork) branch
    .filter(
      (pull) =>
        pull.baseBranch === "main" ||
        pull.baseBranch === "demo" ||
        pull.baseBranch.startsWith("upcoming")
    )
    // only include pull that aren't on hold
    .filter((pull) => !pull.onHold);

  const blocks: KnownBlock[] = [];

  const repoNames = pulls
    .map((pull) => pull.repository)
    .filter((v, i, a) => a.indexOf(v) === i);

  /**
   * the most recent pull request for each repo
   */
  const mostRecentPulls = repoNames.map((repo) => {
    const pullsForRepo = pulls.filter((pull) => pull.repository === repo);
    const mostRecentPull = pullsForRepo.reduce((prev, current) => {
      if (!prev) return current;
      if (!current.mergedAt) return prev;
      if (!prev.mergedAt) return current;
      if (new Date(current.mergedAt) > new Date(prev.mergedAt)) return current;
      return prev;
    }, pullsForRepo[0]);
    return mostRecentPull;
  });

  /**
   * pulls closed within the last 12 hours
   */
  const recentlyMergedPulls = pulls
    .filter(
      (pull) =>
        pull.author !== "dependabot[bot]" &&
        pull.title !== "Combined Package Updates" &&
        pull.mergedAt &&
        isRecent(pull.mergedAt)
    )
    // most recent first
    .sort((a, b) => {
      if (!a.mergedAt) return 1;
      if (!b.mergedAt) return -1;
      if (new Date(a.mergedAt) > new Date(b.mergedAt)) return -1;
      if (new Date(a.mergedAt) < new Date(b.mergedAt)) return 1;
      return 0;
    });

  /**
   *
   * Upcoming Pull Requests
   *
   */

  const currentPulls = pulls.filter(
    (pull) =>
      pull.author !== "dependabot[bot]" &&
      pull.title !== "Combined Package Updates" &&
      pull.state === "open"
  );

  if (currentPulls.length > 0)
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "Upcoming Changes",
        emoji: true,
      },
    });
  else
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "No Upcoming Changes",
        emoji: true,
      },
    });

  for (const pull of currentPulls) {
    const ready =
      pull.checkState === "passing" && !pull.draft
        ? ":pull_success:"
        : ":pull_wip:";

    const userEmoji = isUser(pull.author)
      ? slackEmojis[pull.author]
      : pull.author;

    const repoEmoji = isRepoName(pull.repository)
      ? repoSlackEmojis[pull.repository]
      : `:${pull.repository.replaceAll(/[^a-zA-Z0-9]/g, "")}_icon:`;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${repoEmoji} ${userEmoji} ${ready}\t*${pull.number}*\t${pull.title}`,
      },
    });
  }

  /**
   *
   * Merged Pull Requests
   *
   */

  if (recentlyMergedPulls.length > 0)
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "Recently Merged",
        emoji: true,
      },
    });

  for (const pull of recentlyMergedPulls) {
    const userEmoji = isUser(pull.author)
      ? slackEmojis[pull.author]
      : pull.author;

    const repoEmoji = isRepoName(pull.repository)
      ? repoSlackEmojis[pull.repository]
      : `:${pull.repository.replaceAll(/[^a-zA-Z0-9]/g, "")}_icon:`;

    const isMostRecent = mostRecentPulls.some(
      (mostRecentPull) =>
        mostRecentPull.number === pull.number &&
        pull.repository === mostRecentPull.repository
    );

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${repoEmoji} ${userEmoji}\t*${pull.number}*\t${pull.title}`,
      },
    });

    if (isMostRecent) {
      const buildStatus = await getBuildStatus(
        pull.organization,
        pull.repository
      );
      if (buildStatus === "pending")
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "└\t:pull_wait: Build Processing",
          },
        });
      else if (buildStatus === "unavailable")
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "└\tBuild Status Unavailable",
          },
        });
    }
  }

  return blocks;
};
