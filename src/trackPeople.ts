import { LocalStorage } from "node-localstorage";
import fs from "fs";
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
let rawData = localStorage.getItem("people");

/**
 * key: github username
 * value: slack person id
 */
let peopleMap: {
  [key: string]: string;
} = JSON.parse(fs.readFileSync("people.json", "utf8"));

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
  pull.reviews.forEach((review) => {
    peopleData[review.user] = peopleData[review.user] || [];
    if (
      review.state === "APPROVED" &&
      !peopleData[review.user].includes(pull.id)
    ) {
      peopleData[review.user].push(pull.id);
      savePeopleData();
    }
  });
};

export const getLeaderBoard = () => {
  //return the user with the fewest reviews
  let worstUser = [""];
  let worstUserCount = Infinity;
  let bestUser = [""];
  let bestUserCount = 0;

  for (let key in peopleData) {
    if (peopleData[key].length < worstUserCount) {
      worstUser = [key];
      worstUserCount = peopleData[key].length;
    }
    if (peopleData[key].length > bestUserCount) {
      bestUser = [key];
      bestUserCount = peopleData[key].length;
    }
    if (peopleData[key].length === worstUserCount && !worstUser.includes(key)) {
      worstUser.push(key);
    }
    if (peopleData[key].length === bestUserCount && !bestUser.includes(key)) {
      bestUser.push(key);
    }
  }

  let averageNumberOfReviews = 0;
  for (let user in peopleData) {
    averageNumberOfReviews += peopleData[user].length;
  }
  averageNumberOfReviews /= Object.keys(peopleData).length;

  return {
    worstUsers: worstUser,
    worstUsersReviewCount: worstUserCount,
    bestUsers: bestUser,
    bestUsersReviewCount: bestUserCount,
    average: averageNumberOfReviews,
  };
};
