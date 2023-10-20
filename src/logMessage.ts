const padNumber = (n: number) => {
  return n.toString().padStart(2, "0");
};

/**
 * returns the time as HH:MM:SS
 */
const getTime = () => {
  const now = new Date();
  return `${padNumber(now.getHours())}:${padNumber(
    now.getMinutes()
  )}:${padNumber(now.getSeconds())}`;
};

export const logMessage = (message: string) => {
  console.log(`[${getTime()}] ${message}`);
};
