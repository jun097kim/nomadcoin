const CryptoJS = require('crypto-js'),
  _ = require('lodash'),
  Wallet = require('./wallet'),
  Mempool = require('./mempool');
(Transactions = require('./transactions')),
(hexToBinary = require('hex-to-binary'));

const {
  getBalance,
  getPublicFromWallet,
  createTx,
  getPrivateFromWallet
} = Wallet;

const { createCoinbaseTx, processTxs } = Transactions;

const { addToMempool, getMempool, updateMempool } = Mempool;

const BLOCK_GENERATION_INTERVAL = 10;
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;

class Block {
  constructor(index, hash, previousHash, timestamp, data, difficulty, nonce) {
    this.index = index;
    this.hash = hash;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.data = data;
    this.difficulty = difficulty;
    this.nonce = nonce;
  }
}

const genesisTx = {
  txIns: [{ Signature: '', txOutId: '', txOutIndex: 0 }],
  txOuts: [
    {
      address:
        '04713677381ed0b78b2b08c02cdf83af435f3fb3f9db2bd215a588add9555d196f08c642102ff677c8cda5625092aaafdbafc0d4bea38a7076e25eca8c9bc79fdb',
      amount: 50
    }
  ],
  id: 'c059a925c2125d41fd6273ab2d87add47aaa6881de87320f3e85d1286477f652'
};

const genesisBlock = new Block(
  0,
  '106e212b5a2e3ea2b359461dbb92dcceb9f8a04782d4738b1c67bface7d3ed5f',
  null,
  1530971508,
  [genesisTx], // 제네시스 블록은 제네시스 트랜잭션이 있음
  0,
  0
);

let blockchain = [genesisBlock];

let uTxOuts = processTxs(blockchain[0].data, [], 0);

const getNewestBlock = () => blockchain[blockchain.length - 1];

const getTimestamp = () => Math.round(new Date().getTime() / 1000);

const getBlockChain = () => blockchain;

const createHash = (index, previousHash, timestamp, data, difficulty, nonce) =>
  CryptoJS.SHA256(
    index + previousHash + timestamp + JSON.stringify(data) + difficulty + nonce
  ).toString();

const createNewBlock = () => {
  // 코인베이스 트랜잭션 생성
  const coinbaseTx = createCoinbaseTx(
    getPublicFromWallet(),
    getNewestBlock().index + 1 // 새로운 블록의 인덱스
  );
  // Mempool에 추가된 트랜잭션도 다음 채굴을 할 때 컨펌되도록 함
  const blockData = [coinbaseTx].concat(getMempool());
  return createNewRawBlock(blockData);
};

const createNewRawBlock = data => {
  const previousBlock = getNewestBlock();
  const newBlockIndex = previousBlock.index + 1;
  const newTimestamp = getTimestamp();
  const difficulty = findDifficulty();
  const newBlock = findBlock(
    newBlockIndex,
    previousBlock.hash,
    newTimestamp,
    data,
    difficulty
  );
  addBlockToChain(newBlock);
  require('./p2p').broadcastNewBlock();
  return newBlock;
};

const findDifficulty = () => {
  const newestBlock = getNewestBlock();
  if (
    newestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 &&
    newestBlock.index !== 0
  ) {
    return calculateNewDifficulty(newestBlock, getBlockChain());
  } else {
    return newestBlock.difficulty;
  }
};

const calculateNewDifficulty = (newestBlock, blockchain) => {
  const lastCalculatedBlock =
    blockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
  const timeExpected =
    BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
  const timeTaken = newestBlock.timestamp - lastCalculatedBlock.timestamp;
  if (timeTaken < timeExpected / 2) {
    return lastCalculatedBlock.difficulty + 1;
  } else if (timeTaken > timeExpected * 2) {
    return lastCalculatedBlock.difficulty - 1;
  } else {
    return lastCalculatedBlock.difficulty;
  }
};

const findBlock = (index, previousHash, timestamp, data, difficulty) => {
  let nonce = 0;
  while (true) {
    console.log('Current nonce', nonce);
    const hash = createHash(
      index,
      previousHash,
      timestamp,
      data,
      difficulty,
      nonce
    );
    if (hashMatchesDifficulty(hash, difficulty)) {
      return new Block(
        index,
        hash,
        previousHash,
        timestamp,
        data,
        difficulty,
        nonce
      );
    } else {
      nonce++;
    }
  }
};

const hashMatchesDifficulty = (hash, difficulty) => {
  const hashInBinary = hexToBinary(hash);
  const requiredZeros = '0'.repeat(difficulty);
  console.log('Trying difficulty:', difficulty, 'with hash', hashInBinary);
  return hashInBinary.startsWith(requiredZeros);
};

const getBlocksHash = block =>
  createHash(
    block.index,
    block.previousHash,
    block.timestamp,
    block.data,
    block.difficulty,
    block.nonce
  );

const isTimestampValid = (newBlock, oldBlock) => {
  return (
    oldBlock.timestamp - 60 < newBlock.timestamp &&
    newBlock.timestamp - 60 < getTimestamp()
  );
};

const isBlockValid = (candidateBlock, latestBlock) => {
  if (!isBlockStructureValid(candidateBlock)) {
    console.log('The candidate block structure is not valid');
    return false;
  } else if (latestBlock.index + 1 !== candidateBlock.index) {
    console.log('The candidate block doesnt have a valid index');
    return false;
  } else if (latestBlock.hash !== candidateBlock.previousHash) {
    console.log(
      'The previousHash of the candidate block is not the hash of latest block'
    );
    return false;
  } else if (getBlocksHash(candidateBlock) !== candidateBlock.hash) {
    console.log('The hash of this block is invalid');
    return false;
  } else if (!isTimestampValid(candidateBlock, latestBlock)) {
    console.log('The timestamp of this block is dodgy');
    return false;
  }
  return true;
};

const isBlockStructureValid = block => {
  return (
    typeof block.index === 'number' &&
    typeof block.hash === 'string' &&
    typeof block.previousHash === 'string' &&
    typeof block.timestamp === 'number' &&
    typeof block.data === 'object'
  );
};

const isChainValid = candidateChain => {
  const isGenesisValid = block => {
    return JSON.stringify(block) == JSON.stringify(genesisBlock);
  };
  if (!isGenesisValid(candidateChain[0])) {
    console.log(
      "The candidateChain's genesisBlock is not the same as our genesisBlock"
    );
    return false;
  }
  for (let i = 1; i < candidateChain.length; i++) {
    if (!isBlockValid(candidateChain[i], candidateChain[i - 1])) {
      return false;
    }
  }
  return true;
};

const sumDifficulty = anyBlockchain =>
  anyBlockchain
    .map(block => block.difficulty)
    .map(difficulty => Math.pow(2, difficulty))
    .reduce((a, b) => a + b);

const replaceChain = candidateChain => {
  if (
    isChainValid(candidateChain) &&
    sumDifficulty(candidateChain) > sumDifficulty(blockchain)
  ) {
    blockchain = candidateChain;
    return true;
  } else {
    return false;
  }
};

const addBlockToChain = candidateBlock => {
  if (isBlockValid(candidateBlock, getNewestBlock())) {
    const processedTxs = processTxs(
      candidateBlock.data,
      uTxOuts,
      candidateBlock.index
    );
    if (processedTxs === null) {
      console.log('Couldnt process Tx');
      return false;
    } else {
      getBlockChain().push(candidateBlock);
      uTxOuts = processedTxs;
      updateMempool(uTxOuts); // 컨펌된 트랜잭션을 Mempool에서 지움
      return true;
    }
  } else {
    return false;
  }
};

/**
 * UTXO 리스트의 복사본을 반환하는 함수
 * lodash를 이용하여 UTXO 리스트를 깊은 복사한다.
 */
const getUTxOutList = () => _.cloneDeep(uTxOuts);

const getAccountBalance = () => getBalance(getPublicFromWallet(), uTxOuts);

const sendTx = (address, amount) => {
  const tx = createTx(
    address,
    amount,
    getPrivateFromWallet(),
    getUTxOutList(),
    getMempool()
  );
  addToMempool(tx, getUTxOutList());
  return tx;
};

module.exports = {
  getNewestBlock,
  getBlockChain,
  createNewBlock,
  isBlockStructureValid,
  addBlockToChain,
  replaceChain,
  getAccountBalance,
  sendTx
};
