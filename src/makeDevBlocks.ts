import { KnownBlock } from "@slack/bolt";
import { MappedPull } from "./getPullData";

import slackEmojis from "./data/slackEmojis.json";
import pingIds from "./data/pingIds.json";
import { logMessage } from "./logMessage";

type User = keyof typeof slackEmojis;

const isUser = (user: string): user is User => {
  return user in slackEmojis;
};

type PingUser = keyof typeof pingIds;
const allPingUsers = Object.keys(pingIds) as PingUser[];

let thoseWhoCanReview = new Set<PingUser>();

let lastThoseWhoCanReview: string = "";

export const makeDevBlocks = (pulls: MappedPull[]) => {
  const blocks: KnownBlock[] = [];
  const currentPulls = pulls
    .filter(
      (pull) =>
        pull.author !== "dependabot[bot]" &&
        pull.title !== "Combined Package Updates" &&
        pull.state === "open"
    )
    // only include pull that aren't on hold
    .filter((pull) => !pull.onHold);

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

        // track those who can review
        if (
          !pull.draft &&
          !pull.approved &&
          // only include pulls older than 10 minutes
          new Date(pull.openedAt).getTime() < Date.now() - 10 * 60 * 1000
        ) {
          logMessage(`${pull.title} is waiting for review`);
          allPingUsers
            .filter((user) => user !== pull.author)
            .forEach((user) => {
              thoseWhoCanReview.add(user);
            });
        }

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

  let forcePing = false;

  if (thoseWhoCanReview.size > 0) {
    blocks.push({
      type: "divider",
    });

    const asString = Array.from(thoseWhoCanReview)
      .map((user) => `<@${pingIds[user]}>`)
      .join(" ");

    // say There are pull requests to review: <@user> <@user> <@user>
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `There are pull requests to review: ${asString}`,
      },
    });

    if (asString !== lastThoseWhoCanReview) {
      forcePing = true;
      lastThoseWhoCanReview = asString;
    }
  }

  return { blocks, forcePing };
};
