import { Octokit } from "@octokit/rest"
import { env } from "./env"

import netlifySites from "./data/netlifySites.json"
type NetlifySite = keyof typeof netlifySites

const isNetlifySite = (site: string): site is NetlifySite => {
	return site in netlifySites
}

const octokit = new Octokit({
	auth: env.GITHUB_TOKEN,
})

export async function getBuildStatus(
	owner: string,
	repo: string,
): Promise<"success" | "pending" | "unavailable"> {
	const { data } = await octokit.repos.getCombinedStatusForRef({
		owner,
		repo,
		ref: "main",
	})

	if (data.state === "success") return "success"
	if (isNetlifySite(repo)) return await getNetlifyStatus(repo)
	if (data.statuses.length === 0) return "unavailable"
	return "pending"
}

const getNetlifyStatus = async (name: NetlifySite) => {
	const siteID = netlifySites[name]

	const response = await fetch(
		`https://api.netlify.com/api/v1/badges/${siteID}/deploy-status`,
	).then((res) => res.text())

	if (response.includes("BEF9C6")) return "success"
	return "pending"
}
