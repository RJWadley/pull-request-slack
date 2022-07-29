import fs from "fs";
import { Octokit } from "@octokit/rest";
import { KnownBlock } from "@slack/types";
import { sendBlocks } from "./slack";
import dotenv from "dotenv";
import { getWorstUser, trackPulls } from "./trackPeople";
import * as child from "child_process";

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

export const checkPulls = async (repos: string[]) => {
  console.log("CHECKING FOR NEW PULLS");

  let mappedData: MappedPull[] = [];
  let newPulls = false;

  for (let i = 0; i < repos.length; i++) {
    let newData = await octokit.request(pullsQuery, {
      owner: repos[i].split("/")[0],
      repo: repos[i].split("/")[1],
    });

    //check if error
    if (newData.status !== 200) {
      console.error(`Error getting pull requests for ${repos[i]}`);
      return;
    }

    //make sure is array
    let pulls = newData.data;
    for (let i = 0; i < pulls.length; i++) {
      let reviews = await octokit.request(reviewsQuery, {
        owner: pulls[i].base.repo.owner.login,
        repo: pulls[i].base.repo.name,
        pull_number: pulls[i].number,
      });

      if (reviews.status !== 200) {
        console.error(`Error getting reviews for ${repos[i]}`);
        return;
      }

      mappedData.push({
        id: pulls[i].id,
        owner: pulls[i].base.repo.owner.login,
        repository: pulls[i].base.repo.name,
        state: pulls[i].state,
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
          };
        }),
      });
    }
  }

  let blocks: KnownBlock[] = [];

  repos.forEach((repo) => {
    let repoName = repo.split("/")[1];

    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: repoName,
      },
    });

    let pulls = mappedData.filter((pull) => pull.repository === repoName);
    let dependabotPulls = pulls.filter(
      (pull) => pull.author === "dependabot[bot]"
    );
    let userPulls = pulls.filter((pull) => pull.author !== "dependabot[bot]");
    for (let pull of userPulls) {
      trackPulls(pull);
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${userPulls.length}\tUser Pulls \n ${dependabotPulls.length}\tDependabot Pulls`,
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

    userPulls.forEach((pull) => {
      if (!trackedPulls.includes(pull.id) && !pull.draft) {
        newPulls = true;
        trackedPulls.push(pull.id);
      }

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
            message = "commented.";
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
  });

  let worstInfo = getWorstUser();
  let belowAverageBy = worstInfo.average - worstInfo.count;
  let worstUserId = peopleMap[worstInfo.user];
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Hey <@${worstUserId}> (${worstInfo.user} on github), you've done ${belowAverageBy} fewer reviews than average. Wanna give this one a go?`,
    },
  });

  sendBlocks(blocks, newPulls);
  child.exec("git fetch && git pull");
  console.log("CHECK COMPLETE :D");
};
