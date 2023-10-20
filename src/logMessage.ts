/**
 * returns the time as HH:MM:SS
 */
const getTime = () => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
};

export const logMessage = (message: string) => {
  console.log(`[${getTime()}] ${message}`);
};
