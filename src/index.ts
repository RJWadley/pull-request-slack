import { App } from "@slack/bolt";
import dotenv from "dotenv";
import fs from "fs";
import { checkPulls } from "./checkPulls";

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

export const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
});

let repos: string[] = JSON.parse(fs.readFileSync("repos.json", "utf8"));

//verify that repo is an array
if (!Array.isArray(repos)) {
  console.error("repos.json is not an array");
  process.exit(1);
}

//verify that each repo is a string
if (!repos.every((item) => typeof item === "string")) {
  console.error("repos.json is not an array of strings");
  process.exit(1);
}

const deleteAllMessages = async () => {
  //get all messages sent by the bot
  const messages = await app.client.conversations.history({
    token: SLACK_BOT_TOKEN,
    channel: SLACK_CHANNEL_ID,
    oldest: "0",
    //only get messages older than 10 minutes
    latest: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    inclusive: true,
  });
  if (messages && messages.messages)
    messages.messages.forEach((message) => {
      if (message.bot_id && message.bot_id === "B03K1Q5GA91" && message.ts) {
        app.client.chat.delete({
          token: SLACK_BOT_TOKEN,
          channel: SLACK_CHANNEL_ID,
          ts: message.ts,
        });
      }
    });
};

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  setInterval(() => checkPulls(repos), 1000 * 30);
  checkPulls(repos);
  deleteAllMessages();
})();
