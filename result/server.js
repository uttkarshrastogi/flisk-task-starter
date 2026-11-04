var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    async = require('async'),
    { Pool } = require('pg'),
    cookieParser = require('cookie-parser'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server);

var port = process.env.PORT || 4000;

io.on('connection', function (socket) {

  socket.emit('message', { text : 'Welcome!' });

  socket.on('subscribe', function (data) {
    socket.join(data.channel);
  });
});

var pool = new Pool({
  connectionString: 'postgres://postgres:postgres@db/postgres'
});

async.retry(
  {times: 1000, interval: 1000},
  function(callback) {
    pool.connect(function(err, client, done) {
      if (err) {
        console.error("Waiting for db");
      }
      callback(err, client);
    });
  },
  function(err, client) {
    if (err) {
      return console.error("Giving up");
    }
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], function(err, result) {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      var votes = collectVotesFromResult(result);
      io.sockets.emit("scores", JSON.stringify(votes));
    }

    setTimeout(function() {getVotes(client) }, 1000);
  });
}

function collectVotesFromResult(result) {
  var votes = {a: 0, b: 0};

  result.rows.forEach(function (row) {
    votes[row.vote] = parseInt(row.count);
  });

  return votes;
}

app.use(cookieParser());
app.use(express.urlencoded());
// Behind a path-prefix proxy (Flisk/Traefik serves this app at /api/result) the proxy
// strips the prefix and sends it as X-Forwarded-Prefix. A <base> tag built from it makes
// the page's relative asset links resolve with or without a trailing slash.
// Without the header (plain docker compose) it stays "/".
var indexHtml = fs.readFileSync(path.resolve(__dirname + '/views/index.html'), 'utf8');

app.get('/', function (req, res) {
  var prefix = req.get('X-Forwarded-Prefix') || '';
  if (!/^(\/[A-Za-z0-9._-]+)*$/.test(prefix)) prefix = '';
  res.type('html').send(indexHtml.replace('<head>', '<head>\n    <base href="' + prefix + '/">'));
});

app.use(express.static(__dirname + '/views', { index: false }));

server.listen(port, function () {
  var port = server.address().port;
  console.log('App running on port ' + port);
});
