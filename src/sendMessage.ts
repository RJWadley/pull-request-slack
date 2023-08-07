import { App, KnownBlock } from "@slack/bolt";
import { env } from "./env";

export const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
});
let started = false;

let recentMessages: { [key: string]: string | undefined } = {};

/**
 *
 * @param channelID the channel to send the message to
 * @param blocks the blocks to send
 * @param notify true if should send new message, false if should update old message
 * @returns the id of the message sent
 */
export const sendMessage = async (
  channelID: string,
  blocks: KnownBlock[],
  notify: boolean
) => {
  if (!started) await app.start(3000);
  started = true;
  if (notify)
    recentMessages[channelID] = await publishMessage(channelID, blocks);
  else
    recentMessages[channelID] = await updateMessage(
      channelID,
      blocks,
      recentMessages[channelID]
    );
};

const publishMessage = async (channelId: string, blocks: KnownBlock[]) => {
  await deleteAllMessages(channelId);
  // Call the chat.postMessage method using the built-in WebClient
  const result = await app.client.chat.postMessage({
    // The token you used to initialize your app
    token: env.SLACK_BOT_TOKEN,
    channel: channelId,
    blocks,
    text: "Pull Request Summary",
  });

  const previousMessageId = result?.ts ?? "";
  app.client.pins.add({
    token: env.SLACK_BOT_TOKEN,
    channel: channelId,
    timestamp: previousMessageId,
  });

  return previousMessageId;
};

const updateMessage = async (
  channelId: string,
  blocks: KnownBlock[],
  previousId: string | undefined
) => {
  if (!previousId) {
    return publishMessage(channelId, blocks);
  }

  const result = await app.client.chat.update({
    token: env.SLACK_BOT_TOKEN,
    channel: channelId,
    ts: previousId,
    blocks,
    text: "Pull Request Updated",
  });

  return previousId;
};

const deleteAllMessages = async (channelId: string) => {
  //get all messages sent by the bot
  const messages = await app.client.conversations.history({
    token: env.SLACK_BOT_TOKEN,
    channel: channelId,
  });
  if (messages && messages.messages)
    messages.messages.forEach((message) => {
      if (message.bot_id && message.bot_id === "B03K1Q5GA91" && message.ts) {
        app.client.chat.delete({
          token: env.SLACK_BOT_TOKEN,
          channel: channelId,
          ts: message.ts,
        });
      }
    });
};
