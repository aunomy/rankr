"use strict";

require('dotenv').config();

const PORT        = process.env.PORT || 8080;
const ENV         = process.env.ENV || "development";
const express     = require("express");
const bodyParser  = require("body-parser");
const sass        = require("node-sass-middleware");
const app         = express();

const knexConfig  = require("./knexfile");
const knex        = require("knex")(knexConfig[ENV]);
const morgan      = require('morgan');
const knexLogger  = require('knex-logger');

// Seperated Routes for each Resource
// const usersRoutes = require("./routes/users");

const pollRoutes = require("./routes/polls")

// Load the logger first so all (static) HTTP requests are logged to STDOUT
// 'dev' = Concise output colored by response status for development use.
//         The :status token will be colored red for server error codes, yellow for client error codes, cyan for redirection codes, and uncolored for all other codes.
app.use(morgan('dev'));

// Log knex SQL queries to STDOUT as well
app.use(knexLogger(knex));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/styles", sass({
  src: __dirname + "/styles",
  dest: __dirname + "/public/styles",
  debug: true,
  outputStyle: 'expanded'
}));
app.use(express.static("public"));

// Mount all resource routes

// app.use("/api/users", usersRoutes(knex));

app.use("/api/polls", pollRoutes(knex));

// Home page
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/poll-created", (req, res) => {
  res.render("poll-created");
});

// Poll page
app.get("/polls/:poll_id/", (req, res) => {
  knex
 .select('poll.question_string','poll.id as poll_id','option.option_name','option.id as option_id')
   .from("poll")
   .join('option', 'poll.id', 'option.poll_id')
   .where('poll.id', req.params.poll_id)
   .then((results) => {
     res.render("poll", {results: results})
  });
});
//Poll admin
app.get("/admin/:poll_id", (req, res) => {
  res.render("admin");
});

app.listen(PORT, () => {
  console.log("Example app listening on port " + PORT);
});
