import { App, type KnownBlock } from "@slack/bolt"
import { env } from "./env"
import { logMessage } from "./logMessage"

export const app = new App({
	token: env.SLACK_BOT_TOKEN,
	signingSecret: env.SLACK_SIGNING_SECRET,
})
let started = false

const recentMessages: { [key: string]: string | undefined } = {}

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
	notifyStrategy: "notify" | "update" | "silent",
	fallbackText: string,
) => {
	if (!started) await app.start(4000)
	started = true

	// if silent, never send a new message
	if (notifyStrategy === "silent") {
		await updateMessage(channelID, blocks, fallbackText)
	}

	// if notify, always send a new message
	else if (notifyStrategy === "notify") {
		recentMessages[channelID] = await publishMessage(
			channelID,
			blocks,
			fallbackText,
		)
	}

	// only send a new message if the message to update isn't a recent message
	else {
		const previousId = await getMessageTS(channelID)
		const mostRecentMessages = await app.client.conversations.history({
			token: env.SLACK_BOT_TOKEN,
			channel: channelID,
			limit: 10,
		})
		const isWithinMostRecent = mostRecentMessages.messages?.some(
			(message) => message.ts === previousId,
		)
		if (isWithinMostRecent) {
			await updateMessage(channelID, blocks, fallbackText)
		} else {
			recentMessages[channelID] = await publishMessage(
				channelID,
				blocks,
				fallbackText,
			)
			return
		}
	}
}

const publishMessage = async (
	channelId: string,
	blocks: KnownBlock[],
	fallback: string,
) => {
	await deleteAllMessages(channelId)

	// Call the chat.postMessage method using the built-in WebClient
	const result = await app.client.chat.postMessage({
		// The token you used to initialize your app
		token: env.SLACK_BOT_TOKEN,
		channel: channelId,
		blocks,
		text: fallback,
	})

	const previousMessageId = result?.ts ?? ""
	app.client.pins.add({
		token: env.SLACK_BOT_TOKEN,
		channel: channelId,
		timestamp: previousMessageId,
	})

	logMessage("Published a new message")
	return previousMessageId
}

const updateMessage = async (
	channelId: string,
	blocks: KnownBlock[],
	fallback: string,
) => {
	const previousId = await getMessageTS(channelId)
	if (!previousId) return publishMessage(channelId, blocks, fallback)

	await app.client.chat.update({
		token: env.SLACK_BOT_TOKEN,
		channel: channelId,
		ts: previousId,
		blocks,
		text: fallback,
	})

	logMessage("Updated a message")
	return previousId
}

const deleteAllMessages = async (channelId: string) => {
	//get all messages sent by the bot
	const messages = await app.client.conversations.history({
		token: env.SLACK_BOT_TOKEN,
		channel: channelId,
	})
	if (messages?.messages)
		messages.messages.forEach((message) => {
			if (message.bot_id && message.bot_id === "B03K1Q5GA91" && message.ts) {
				app.client.chat.delete({
					token: env.SLACK_BOT_TOKEN,
					channel: channelId,
					ts: message.ts,
				})
			}
		})
}

const getMessageTS = async (channelId: string) => {
	let previousId = recentMessages[channelId]

	if (!previousId) {
		//get all messages sent by the bot
		const messages = await app.client.conversations.history({
			token: env.SLACK_BOT_TOKEN,
			channel: channelId,
		})

		// save the ts of the most recent message
		const previousMessage = messages.messages?.find(
			(message) =>
				message.bot_id && message.bot_id === "B03K1Q5GA91" && message.ts,
		)
		previousId = previousMessage?.ts
	}

	return previousId
}
