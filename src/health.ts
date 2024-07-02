import { logMessage } from "./logMessage"

let lastHeartbeat = Date.now()

/**
 * this heartbeat function should be called at least once every 5 minutes
 * if it's not, something has hung and we should exit
 */
export const heartbeat = () => {
	lastHeartbeat = Date.now()
}

setInterval(
	() => {
		if (Date.now() - lastHeartbeat > 1000 * 60 * 5) {
			logMessage("Heartbeat failed, exiting")
			process.exit(1)
		}
	},
	1000 * 60 * 5,
)
