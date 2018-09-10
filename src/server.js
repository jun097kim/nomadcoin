const express = require('express'),
  bodyParser = require('body-parser'),
  morgan = require('morgan'),
  Blockchain = require('./blockchain'),
  P2P = require('./p2p'),
  Mempool = require('./mempool'),
  Wallet = require('./wallet');

const { getBlockChain, createNewBlock, getAccountBalance, sendTx } = Blockchain;
const { startP2PServer, connectToPeers } = P2P;
const { initWallet, getPublicFromWallet } = Wallet;
const { getMempool } = Mempool;

const PORT = process.env.HTTP_PORT || 3000;

const app = express();
app.use(bodyParser.json());
app.use(morgan('combined'));

app
  .route('/blocks')
  .get((req, res) => {
    res.send(getBlockChain());
  })
  .post((req, res) => {
    const newBlock = createNewBlock();
    res.send(newBlock);
  });

app.post('/peers', (req, res) => {
  connectToPeers(peer);
  res.send();
});

app.get('/me/balance', (req, res) => {
  const balance = getAccountBalance();
  res.send({ balance });
});

app.get('/me/address', (req, res) => {
  res.send(getPublicFromWallet());
});

app
  .route('/transactions')
  .get((req, res) => {
    res.send(getMempool());
  })
  .post((req, res) => {
    try {
      const {
        body: { address, amount }
      } = req;
      if (address === undefined || amount === undefined) {
        throw Error('Please specify an address and an amount');
      } else {
        const resPonse = sendTx(address, amount);
        res.send(resPonse);
      }
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

const server = app.listen(PORT, () =>
  console.log(`Nomadcoin Server HTTP Server running on port ${PORT} ✅`)
);

initWallet();
startP2PServer(server);
