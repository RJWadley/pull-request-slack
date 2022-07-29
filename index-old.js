const { App } = require("@slack/bolt");
const { exec } = require("child_process");
const { Octokit } = require("@octokit/rest");
const dotenv = require("dotenv");
const fs = require("fs");
dotenv.config();

// Initializes your app with your bot token and signing secret
export const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

let previousMessageId;
let trackedPulls = [];

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  setInterval(checkPulls, 1000 * 30);
  checkPulls();
})();

// Post a message to a channel your app is in using ID and message text
async function publishMessage(blocks) {
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.postMessage({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.SLACK_CHANNEL_ID,
      blocks,
      text: "New Pull Request Ready for Review",
    });

    return result;
  } catch (error) {
    console.error(error);
  }
}

async function updateMessage(blocks) {
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.update({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN,
      channel: process.env.SLACK_CHANNEL_ID,
      ts: previousMessageId,
      blocks,
      text: "Pull Request Updated",
    });

    return result;
  } catch (error) {
    console.error(error);
  }
}

async function checkPulls() {
  console.log("checking");
  let mappedData = [];
  let newPulls = false;
  let isError = false;

  // load repos from file
  let rawData = fs.readFileSync("repos.json");
  let allRepos = JSON.parse(rawData);

  for (let i = 0; i < allRepos.length; i++) {
    let newData = await octokit
      .request("GET /repos/{org}/{repo}/pulls", {
        org: allRepos[i].split("/")[0],
        repo: allRepos[i].split("/")[1],
      })
      .catch((err) => {
        console.log(err);
        isError = true;
      });

    if (isError) return;

    //make sure is array
    if (Array.isArray(newData.data)) {
      let pulls = newData.data;
      for (let i = 0; i < pulls.length; i++) {
        let reviews = await octokit
          .request("GET /repos/{org}/{repo}/pulls/{pull_number}/reviews", {
            org: pulls[i].base.repo.owner.login,
            repo: pulls[i].base.repo.name,
            pull_number: pulls[i].number,
          })
          .catch((err) => {
            console.log(err);
            isError = true;
          });

        if (isError) return;

        mappedData.push({
          id: pulls[i].id,
          organization: pulls[i].base.repo.owner.login,
          repository: pulls[i].base.repo.name,
          state: pulls[i].state,
          title: pulls[i].title,
          draft: pulls[i].draft,
          author: pulls[i].user.login,
          number: pulls[i].number,
          link: pulls[i].html_url,
          //true if at least two reviews are in the approved state
          approved:
            reviews.data.filter((review) => review.state === "APPROVED")
              .length >= 2,
          reviews: reviews.data.map((review) => {
            return {
              user: review.user.login,
              state: review.state,
              photo: review.user.avatar_url,
            };
          }),
        });
      }
    }
  }

  let blocks = [];

  allRepos.forEach((repo) => {
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
          style: pull.approved | pull.draft ? undefined : "primary",
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

  if (newPulls) {
    if (previousMessageId) {
      await app.client.chat
        .delete({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.SLACK_CHANNEL_ID,
          ts: previousMessageId,
        })
        .catch((err) => {
          console.log(err);
        });
    }

    publishMessage(blocks).then((data) => {
      previousMessageId = data?.ts;
      app.client.pins.add({
        token: process.env.SLACK_BOT_TOKEN,
        channel: process.env.SLACK_CHANNEL_ID,
        timestamp: previousMessageId,
      });
      console.log("SUCCESSFULLY CHECKED");
      exec("git fetch && git pull");
    });
  } else {
    updateMessage(blocks).then((data) => {
      console.log("SUCCESSFULLY CHECKED (NO NEW PULLS)");
      exec("git fetch && git pull");
    });
  }
}
