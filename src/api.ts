import express from "express";

const app = express();

let numberPings = 0;

//on handle slack
app.post("/", (req, res) => {
  numberPings += 1;
  console.log("req", numberPings, req);

  //200 ok
  res.sendStatus(200);
});

app.listen(80, () => console.log("Node.js server started on port 80."));

export const getWebhooks = () => {
  return "ok";
};
