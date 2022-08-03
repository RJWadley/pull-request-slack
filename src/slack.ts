import { KnownBlock } from "@slack/bolt";
import { app } from "./index";
import dotenv from "dotenv";

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

let previousMessageId: string = "";

/**
 * update the blocks in the message
 * @param blocks the new blocks to update with
 * @param newPulls true if should send new message, false if should update old message
 */
export const sendBlocks = (blocks: KnownBlock[], newPulls: boolean) => {
  console.log(blocks);
  return;
  if (newPulls) return publishMessage(blocks);
  else return updateMessage(blocks);
};

// Post a message to a channel your app is in using ID and message text
const publishMessage = async (blocks: KnownBlock[]) => {
  await deleteAllMessages();
  // Call the chat.postMessage method using the built-in WebClient
  const result = await app.client.chat.postMessage({
    // The token you used to initialize your app
    token: SLACK_BOT_TOKEN,
    channel: SLACK_CHANNEL_ID,
    blocks,
    text: "New Pull Request Ready for Review",
  });

  previousMessageId = result?.ts ?? "";
  app.client.pins.add({
    token: SLACK_BOT_TOKEN,
    channel: SLACK_CHANNEL_ID,
    timestamp: previousMessageId,
  });

  return result;
};

async function updateMessage(blocks: KnownBlock[]) {
  // Call the chat.postMessage method using the built-in WebClient
  const result = await app.client.chat.update({
    // The token you used to initialize your app
    token: SLACK_BOT_TOKEN,
    channel: SLACK_CHANNEL_ID,
    ts: previousMessageId,
    blocks,
    text: "Pull Request Updated",
  });

  return result;
}

const deleteAllMessages = async () => {
  //get all messages sent by the bot
  const messages = await app.client.conversations.history({
    token: SLACK_BOT_TOKEN,
    channel: SLACK_CHANNEL_ID,
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
