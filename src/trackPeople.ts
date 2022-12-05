import { LocalStorage } from "node-localstorage";
import dotenv from "dotenv";
import { MappedPull } from "./checkPulls";

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

let localStorage = new LocalStorage("./scratch");
let rawData = null; //localStorage.getItem("people");

/**
 * key: github username
 * value: slack person id
 */
import peopleMap from "./people.json";

/**
 * key: github username
 * value: array of pull request ids
 */
let peopleData: {
  [key: string]: number[];
} = rawData ? JSON.parse(rawData) : {};

for (let key in peopleMap) {
  if (!peopleData[key]) {
    peopleData[key] = [];
  }
}

const savePeopleData = () => {
  localStorage.setItem("people", JSON.stringify(peopleData));
};

export const trackPulls = (pull: MappedPull) => {
  // give a point to the author of the pull request
  if (Object.keys(peopleMap).includes(pull.author)) {
    peopleData[pull.author] = peopleData[pull.author] || [];
    if (!peopleData[pull.author].includes(pull.id))
      peopleData[pull.author].push(pull.id);
  }

  pull.reviews.forEach((review) => {
    if (Object.keys(peopleMap).includes(review.user)) {
      peopleData[review.user] = peopleData[review.user] || [];
      if (
        !peopleData[review.user].includes(pull.id) &&
        Object.keys(peopleMap).includes(review.user)
      ) {
        peopleData[review.user].push(pull.id);
        savePeopleData();

        // expires 30 days after review
        const dateOfReview = review.submittedAt
          ? new Date(review.submittedAt)
          : new Date();
        const reviewExpiration = new Date(
          dateOfReview.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        const msUntilExpiration = reviewExpiration.getTime() - Date.now();

        // 30 days from the time the review was submitted, remove the review from the list
        let interval = setInterval(() => {
          if (Date.now() > reviewExpiration.getTime()) {
            peopleData[review.user] = peopleData[review.user].filter(
              (id) => id !== pull.id
            );
            savePeopleData();
            clearInterval(interval);
          }
        }, msUntilExpiration / 30 + 1000);
      }
    }
  });
};

export const getLeaderBoard = (availablePulls: Record<string, number>) => {
  let averageNumberOfReviews = 0;
  for (let user in peopleData) {
    averageNumberOfReviews += peopleData[user].length;
  }
  averageNumberOfReviews /= Object.keys(peopleData).length;

  let sortedPeople = Object.keys(peopleData).sort((a, b) => {
    return peopleData[b].length - peopleData[a].length;
  });
  let leaderBoard = [];
  for (let i = 0; i < sortedPeople.length; i++) {
    let user = sortedPeople[i];
    leaderBoard.push({
      name: user,
      count: peopleData[user].length,
    });
  }

  const worstUser = leaderBoard[leaderBoard.length - 1];
  const worstUserReviewCount = worstUser.count;
  const allWorstUsers = leaderBoard.filter(
    (user) => user.count === worstUserReviewCount
  );
  const bestUser = leaderBoard[0];
  const bestUserReviewCount = bestUser.count;
  const allBestUsers = leaderBoard.filter(
    (user) => user.count === bestUserReviewCount
  );

  return {
    worstUsers: allWorstUsers.map((x) => x.name),
    worstUsersReviewCount: worstUserReviewCount,
    bestUsers: allBestUsers.map((x) => x.name),
    bestUsersReviewCount: bestUserReviewCount,
    average: averageNumberOfReviews,
    ranking: leaderBoard,
  };
};
