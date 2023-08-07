import { KnownBlock } from "@slack/bolt";
import { MappedPull } from "./getPullData";

import slackEmojis from "./data/slackEmojis.json";

type User = keyof typeof slackEmojis;

const isUser = (user: string): user is User => {
  return user in slackEmojis;
};

export const makeDevBlocks = (pulls: MappedPull[]) => {
  const blocks: KnownBlock[] = [];
  const currentPulls = pulls.filter(
    (pull) =>
      pull.author !== "dependabot[bot]" &&
      pull.title !== "Combined Package Updates" &&
      pull.state === "open"
  );
  const dependabotPulls = pulls.filter(
    (pull) =>
      (pull.author === "dependabot[bot]" ||
        pull.title !== "Combined Package Updates") &&
      pull.state === "open"
  );

  const repoNames = currentPulls
    .map((pull) => pull.repository)
    .filter((v, i, a) => a.indexOf(v) === i);

  for (const repo of repoNames) {
    const openUserPulls = currentPulls.filter(
      (pull) => pull.repository === repo
    );

    if (openUserPulls.length > 0) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: repo,
        },
      });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${openUserPulls.length}\tUser Pulls \n ${dependabotPulls.length}\tDependabot Pulls`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "View All",
            emoji: true,
          },
          url: `https://github.com/${repo}/pulls`,
        },
      });
      blocks.push({
        type: "divider",
      });

      openUserPulls.forEach((pull) => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${
              isUser(pull.author) ? slackEmojis[pull.author] : pull.author
            } ${
              pull.draft
                ? ":pull_wip:"
                : pull.checkState === "passing"
                ? ":pull_success:"
                : pull.checkState === "failing"
                ? ":pull_fail:"
                : ":pull_wait:"
            } ${pull.draft ? "*[  DRAFT  ]*\t" : ""}*${pull.number}*\t${
              pull.title
            }`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: pull.draft ? "View" : pull.approved ? "Approved" : "Review",
              emoji: true,
            },
            style: pull.approved || pull.draft ? undefined : "primary",
            url: pull.link,
          },
        });

        pull.reviews.forEach((review) => {
          let message = "";

          switch (review.state) {
            case "APPROVED":
              message = "approved this pull.";
              break;
            case "CHANGES_REQUESTED":
              message = "requested changes.";
              break;
            case "COMMENTED":
              if (review.user === pull.author)
                message = "(pull owner) commented.";
              else message = "commented.";
              break;
            case "PENDING":
              if (review.user === pull.author)
                message = "(pull owner) commented.";
              else message = "is reviewing.";
              break;
            default:
              message = "is now " + review.state + ".";
          }

          blocks.push({
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `${
                  isUser(review.user) ? slackEmojis[review.user] : pull.author
                } *${review.user}* ${message}`,
              },
            ],
          });
        });
      });
    }
  }

  return blocks;
};
