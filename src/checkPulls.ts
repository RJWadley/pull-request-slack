import fs from "fs";
import { Octokit } from "@octokit/rest";
import { KnownBlock } from "@slack/types";
import { sendBlocks } from "./slack";
import dotenv from "dotenv";
import { getLeaderBoard, trackPulls } from "./trackPeople";
import * as child from "child_process";
import { MrkdwnElement } from "@slack/bolt";

dotenv.config();
let SLACK_SIGNING_SECRET: string = process.env.SLACK_SIGNING_SECRET as string;
let SLACK_BOT_TOKEN: string = process.env.SLACK_BOT_TOKEN as string;
let GITHUB_TOKEN: string = process.env.GITHUB_TOKEN as string;
let SLACK_CHANNEL_ID: string = process.env.SLACK_CHANNEL_ID as string;
if (
  !SLACK_SIGNING_SECRET ||
  !SLACK_BOT_TOKEN ||
  !GITHUB_TOKEN ||
  !SLACK_CHANNEL_ID
) {
  console.error("Missing environment variables");
  process.exit(1);
}

interface MappedReview {
  user: string;
  state: string;
  photo: string;
  submittedAt?: string;
}

export interface MappedPull {
  id: number;
  owner: string;
  repository: string;
  state: string;
  title: string;
  draft?: boolean;
  author: string;
  number: number;
  link: string;
  approved: boolean;
  openedDate: string;
  reviews: MappedReview[];
}

let trackedPulls: number[] = [];

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

/**
 * key: github username
 * value: slack person id
 */
let peopleMap: {
  [key: string]: string;
} = JSON.parse(fs.readFileSync("people.json", "utf8"));

const pullsQuery = "GET /repos/{owner}/{repo}/pulls";
const reviewsQuery = "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews";

let firstRuns: string[] = [];
let firstBlockSend = true;

export const checkPulls = async (repos: string[], number: number) => {
  if (
    firstRuns.length < repos.length &&
    firstRuns.length !== 0 &&
    number === 1
  ) {
    console.log("first run, skipping checkPulls");
    return;
  }
  console.log("CHECKING FOR NEW PULLS", JSON.stringify(repos), number);

  let mappedData: MappedPull[] = [];
  let newPulls = false;
  let isError = false;

  for (const repo of repos) {
    let newData = await octokit
      .request(pullsQuery, {
        owner: repo.split("/")[0],
        repo: repo.split("/")[1],
        state: firstRuns.includes(repo) ? "open" : "all",
        per_page: 100,
        page: number,
      })
      .catch((e) => {
        if (repo) {
          isError = true;
          console.error(`Error getting pull requests for ${repo}: ${e}`);
        }
      });

    if (isError || !newData?.data) return;

    if (!firstRuns.includes(repo)) {
      if (newData.headers.link?.includes("next") && number <= 4) {
        setTimeout(() => {
          checkPulls([repo], number + 1);
        });
      } else {
        firstRuns.push(repo);
      }
    }

    //make sure is array
    let pulls = newData.data;
    for (let i = 0; i < pulls.length; i++) {
      if (trackedPulls.includes(pulls[i].id) && pulls[i].state !== "open")
        return;
      let reviews = await octokit
        .request(reviewsQuery, {
          owner: pulls[i].base.repo.owner.login,
          repo: pulls[i].base.repo.name,
          pull_number: pulls[i].number,
        })
        .catch(() => {
          isError = true;
          console.error(`Error getting pull requests for ${repos[i]}`);
          return;
        });

      if (isError || !reviews?.data) return;

      mappedData.push({
        id: pulls[i].id,
        owner: pulls[i].base.repo.owner.login,
        repository: pulls[i].base.repo.name,
        state: pulls[i].state,
        openedDate: pulls[i].created_at,
        title: pulls[i].title,
        draft: pulls[i].draft,
        author: pulls[i].user?.login ?? "unknown",
        number: pulls[i].number ?? Infinity,
        link: pulls[i].html_url,
        //true if at least two reviews are in the approved state
        approved:
          reviews.data.filter((review) => review.state === "APPROVED").length >=
          2,
        reviews: reviews.data.map((review) => {
          return {
            user: review.user?.login ?? "unknown",
            state: review.state,
            photo: review.user?.avatar_url ?? "",
            submittedAt: review.submitted_at ?? pulls[i].created_at,
          };
        }),
      });
    }
  }

  let blocks: KnownBlock[] = [];
  let allPullsApproved = true;

  let availablePulls: Record<string, number> = {};

  repos.forEach((repo) => {
    let repoName = repo.split("/")[1];

    let pulls = mappedData.filter((pull) => pull.repository === repoName);
    let dependabotPulls = pulls.filter(
      (pull) => pull.author === "dependabot[bot]" && pull.state === "open"
    );
    let openUserPulls = pulls.filter(
      (pull) => pull.author !== "dependabot[bot]" && pull.state === "open"
    );
    let recentUserPulls = pulls.filter(
      (pull) =>
        pull.author !== "dependabot[bot]" &&
        // opened in the last 30 days
        new Date(pull.openedDate) >
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    for (let pull of recentUserPulls) {
      trackPulls(pull);
    }

    openUserPulls.forEach((pull) => {
      Object.keys(peopleMap).forEach((person) => {
        if (
          pull.author !== person &&
          !pull.reviews.some((review) => review.user === person)
        )
          availablePulls[person] = (availablePulls[person] ?? 0) + 1;
      });
    });

    if (openUserPulls.length > 0) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: repoName,
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
        if (!trackedPulls.includes(pull.id) && !pull.draft) {
          newPulls = true;
          trackedPulls.push(pull.id);
        }
        if (!pull.approved && !pull.draft) allPullsApproved = false;

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${pull.draft ? "*[  DRAFT  ]*\t" : ""}*${pull.number}*\t${
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
                type: "image",
                image_url: review.photo,
                alt_text: review.user,
              },
              {
                type: "mrkdwn",
                text: `*${review.user}* ${message}`,
              },
            ],
          });
        });
      });
    }
  });

  let fields: MrkdwnElement[] = [];
  let userInfo = getLeaderBoard(availablePulls);

  fields.push({
    type: "mrkdwn",
    text: `
      \`\`\`
      ${generateTable(userInfo.ranking)}
      \`\`\`
      `,
  });

  let belowAverageBy = userInfo.average - userInfo.worstUsersReviewCount;
  belowAverageBy = Math.round(belowAverageBy * 1000) / 1000;
  let worstUserIds = userInfo.worstUsers.map(
    (user) => `<@${peopleMap[user]}> (${user})`
  );

  let aboveAverageBy = userInfo.bestUsersReviewCount - userInfo.average;
  aboveAverageBy = Math.round(aboveAverageBy * 1000) / 1000;
  let bestUserIds = userInfo.bestUsers;
  if (!allPullsApproved)
    fields.push({
      type: "mrkdwn",
      text:
        `Hey ${arrayToList(
          worstUserIds
        )}, you've done ${belowAverageBy} fewer reviews than average. Wanna give this one a go?\n\n\n` +
        `Woah, ${arrayToList(
          bestUserIds
        )}, you're too hot! You've done ${aboveAverageBy} more reviews than average. Leave some for the rest of us, ok?`,
    });

  blocks.push({
    type: "section",
    fields,
  });

  if (firstRuns.length === repos.length)
    if (firstBlockSend) firstBlockSend = false;
    else sendBlocks(blocks, newPulls);

  child.exec("git fetch && git pull");
  console.log("CHECK COMPLETE :D", JSON.stringify(repos), number);
};

/**
 * takes an array of items and concatenates them into a list
 * so ['1', '2', '3'] becomes '1, 2, and 3'
 */
const arrayToList = (array: string[]) => {
  if (array.length === 0) return "";
  if (array.length === 1) return array[0];
  if (array.length === 2) return `${array[0]} and ${array[1]}`;
  if (array.length === 3) return `${array[0]}, ${array[1]}, and ${array[2]}`;
  if (array.length > 3) {
    return `${array.slice(0, -1).join(", ")}, and ${array[array.length - 1]}`;
  }
};

/**
 *
 * given a list of names and numbers,
 * generate an ascii leaderboard
 *
 * format the leaderboard like:
 * ╔═══════════════╗
 * ║  Leaderboard  ║
 * ╠═════╤══╤══════╣
 * ║ 1st │  │   16 ║
 * ╟─────┼──┼──────╢
 * ║ 2nd │  │   15 ║
 * ╟─────┼──┼──────╢
 * ║ 3rd │  │   14 ║
 * ╟─────┼──┼──────╢
 * ║ 4th │  │   13 ║
 * ╟─────┼──┼──────╢
 * ║ 5th │  │   12 ║
 * ╚═════╧══╧══════╝
 *
 */
const generateTable = (
  list: {
    name: string;
    count: number;
  }[]
) => {
  const beginningOfLineSpace = "  ";
  let table = "";

  //get the longest name
  let nameSize = list.reduce(
    (longest, item) =>
      item.name.length > longest ? item.name.length : longest,
    0
  );

  //if longest name is odd, add one to make it even
  if (nameSize % 2 === 1) nameSize++;

  let doubleBars = "═".repeat(nameSize);
  let singleBars = "─".repeat(nameSize);
  let spaces = " ".repeat(nameSize / 2);

  //generate the header
  table += `\n${beginningOfLineSpace}╔════════${doubleBars}═══════╗\n${beginningOfLineSpace}`;
  table += `║ ${spaces} leaderBoard ${spaces} ║\n${beginningOfLineSpace}`;
  table += `╠═════╤═${doubleBars}═╤══════╣\n${beginningOfLineSpace}`;

  //generate the body
  list.forEach((item, index) => {
    let name = item.name;
    let count = item.count;
    let namePadding = " ".repeat(nameSize - name.length);
    let countPadding = " ".repeat(4 - count.toString().length);

    table += `║ ${numberToOrdinal(
      index + 1
    )} │ ${name}${namePadding} │ ${countPadding}${count} ║`;

    table +=
      index === list.length - 1
        ? `\n${beginningOfLineSpace}╚═════╧═${doubleBars}═╧══════╝`
        : `\n${beginningOfLineSpace}╟─────┼─${singleBars}─┼──────╢\n${beginningOfLineSpace}`;
  });

  return table;
};

const numberToOrdinal = (number: number) => {
  if (number === 1) return "1st";
  if (number === 2) return "2nd";
  if (number === 3) return "3rd";
  else return `${number}th`;
};
