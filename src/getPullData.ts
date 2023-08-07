import repositories from "./data/repositories.json";

import { Octokit } from "@octokit/rest";
import { env } from "./env";

const REQUIRED_APPROVAL_COUNT = 1;
const PULL_QUERY = "GET /repos/{owner}/{repo}/pulls";
const REVIEW_QUERY = "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews";

interface MappedReview {
  /**
   * The user who submitted the review
   */
  user: string;
  /**
   * The state of their review
   */
  state: string;
  /**
   * When the review was submitted
   */
  submittedAt: string;
}

export interface MappedPull {
  /**
   * The number of the pull request
   */
  number: number;
  /**
   * Who opened the pull request
   */
  author: string;
  /**
   * the org the pull request is in
   */
  organization: string;
  /**
   * The repository the pull request is in
   */
  repository: string;
  /**
   * The state of the pull request
   */
  state: string;
  /**
   * The title of the pull request
   */
  title: string;
  /**
   * Is this pull request a draft?
   */
  draft: boolean;
  /**
   * A link to this pull request
   */
  link: string;
  /**
   * True if the pull request has been approved by at least one person
   */
  approved: boolean;
  /**
   * When the pull request was opened
   */
  openedAt: string;
  /**
   * When the pull request was opened
   */
  mergedAt: string | null;
  /**
   * Is this pull request passing checks?
   */
  checkState: "pending" | "passing" | "failing";
  /**
   * All the reviews on this pull request
   */
  reviews: MappedReview[];
  /**
   * Is this pull request on hold?
   */
  onHold: boolean;
}

const octokit = new Octokit({
  auth: env.GITHUB_TOKEN,
});

/**
 * octokits types are a royal fucking pain so idc
 */
const reviewsCache: Record<string, any> = {};

export const getPullData = async (): Promise<MappedPull[]> => {
  const mappedData: MappedPull[] = [];

  for (const repo of repositories) {
    /**
     * get all the recent pull requests for this repo
     */
    let newData = await octokit.request(PULL_QUERY, {
      owner: repo.split("/")[0],
      repo: repo.split("/")[1],
      state: "all",
      per_page: 100,
    });

    let pulls = newData.data;
    for (const pull of pulls) {
      const pullIdentifier = pull.number + repo;

      // Skip if pull request is older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const pullCreatedAt = new Date(pull.created_at);
      if (pullCreatedAt < thirtyDaysAgo && pull.state !== "open") {
        continue;
      }

      /**
       * get all the reviews for this pull
       */
      const reviews =
        // (reviewsCache[
        //   pullIdentifier
        // ] as /* see type warning above */ undefined) ??
        // (await octokit.request(REVIEW_QUERY, {
        //   owner: pull.base.repo.owner.login,
        //   repo: pull.base.repo.name,
        //   pull_number: pull.number,
        // }));
        pull.state === "open"
          ? await octokit.request(REVIEW_QUERY, {
              owner: pull.base.repo.owner.login,
              repo: pull.base.repo.name,
              pull_number: pull.number,
            })
          : undefined;

      // cache the reviews if the pull is closed
      if (pull.state === "closed") reviewsCache[pullIdentifier] ||= reviews;

      /**
       * determine if this pull is passing checks
       */
      let checkState: "pending" | "passing" | "failing" =
        pull.state !== "open"
          ? "pending"
          : await octokit.checks
              .listForRef({
                owner: pull.base.repo.owner.login,
                repo: pull.base.repo.name,
                ref: pull.head.ref,
              })
              .then((res) => {
                if (
                  res.data.check_runs.every(
                    (check) => check.conclusion === "success"
                  )
                )
                  return "passing";
                else if (
                  res.data.check_runs.some(
                    (check) => check.conclusion === "failure"
                  )
                )
                  return "failing";
                else return "pending";
              })
              .catch((e) => {
                console.error(
                  `Error getting checks for ${repo + pull.number}: ${e}`
                );
                return "failing";
              });

      /**
       * determine if this pull is on hold
       */
      let onHold = pull.labels.some(
        (label) => label.name.toLowerCase() === "on hold"
      );

      mappedData.push({
        author: pull.user?.login ?? "unknown",
        repository: pull.base.repo.name,
        state: pull.state,
        openedAt: pull.created_at,
        title: pull.title,
        draft: pull.draft ?? false,
        number: pull.number ?? Infinity,
        link: pull.html_url,
        mergedAt: pull.merged_at,
        checkState,
        organization: pull.base.repo.owner.login,
        onHold: onHold,
        approved: reviews
          ? reviews.data.filter((review) => review.state === "APPROVED")
              .length >= REQUIRED_APPROVAL_COUNT
          : false,
        reviews: reviews
          ? reviews.data.map((review) => {
              return {
                user: review.user?.login ?? "unknown",
                state: review.state,
                submittedAt: review.submitted_at ?? pull.created_at,
              };
            })
          : [],
      });
    }
  }

  return mappedData;
};
