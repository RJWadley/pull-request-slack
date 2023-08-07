import dotenv from "dotenv";

dotenv.config();

export const env = {
  SLACK_SIGNING_SECRET:
    process.env.SLACK_SIGNING_SECRET ?? "missing environment variable",
  SLACK_BOT_TOKEN:
    process.env.SLACK_BOT_TOKEN ?? "missing environment variable",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "missing environment variable",
  DEV_CHANNEL_ID: process.env.DEV_CHANNEL_ID ?? "missing environment variable",
  COMPACT_CHANNEL_ID:
    process.env.COMPACT_CHANNEL_ID ?? "missing environment variable",
};
