const CryptoJS = require('crypto-js'),
  elliptic = require('elliptic'),
  _ = require('lodash'),
  utils = require('./utils');

const ec = new elliptic.ec('secp256k1');

const COINBASE_AMOUNT = 50;

class TxOut {
  constructor(address, amount) {
    this.address = address;
    this.amount = amount;
  }
}

class TxIn {
  // txOutId
  // txOutIndex
  // Signature
}

class Transaction {
  // ID
  // txIns[]
  // txOuts[]
}

class UTxOut {
  constructor(txOutId, txOutIndex, address, amount) {
    this.txOutId = txOutId;
    this.txOutIndex = txOutIndex;
    this.address = address;
    this.amount = amount;
  }
}

const getTxId = tx => {
  const txInsContent = tx.txIns
    .map(txIn => txIn.txOutId + txIn.txOutIndex)
    .reduce((a, b) => a + b, '');

  const txOutsContent = tx.txOuts
    .map(txOut => txOut.address + txOut.amount)
    .reduce((a, b) => a + b, '');

  return CryptoJS.SHA256(txInsContent + txOutsContent).toString();
};

const findUTxOut = (txOutId, txOutIndex, uTxOutList) => {
  return uTxOutList.find(
    uTxO => uTxO.txOutId === txOutId && uTxO.txOutIndex === txOutIndex
  );
};

const signTxIn = (tx, txInIndex, privateKey, uTxOutList) => {
  const txIn = tx.txIns[txInIndex];
  const dataToSign = tx.id;
  const referencedUTxOut = findUTxOut(
    txIn.txOutId,
    txIn.txOutIndex,
    uTxOutList
  );
  if (referencedUTxOut === null) {
    return;
  }
  const referencedAddress = referencedUTxOut.address;
  if (getPublicKey(privateKey) !== referencedAddress) {
    return false;
  }
  const key = ec.keyFromPrivate(privateKey, 'hex');
  const signature = utils.toHexString(key.sign(dataToSign).toDER());
  return signature;
};

const getPublicKey = privateKey => {
  return ec
    .keyFromPrivate(privateKey, 'hex')
    .getPublic()
    .encode('hex');
};

/**
 * UTXO 리스트 업데이트
 * @param {*} newTxs 트랜잭션
 * @param {*} uTxOutList 업데이트할 UTXO 리스트
 */
const updateUTxOuts = (newTxs, uTxOutList) => {
  const newUTxOuts = newTxs
    .map(tx =>
      tx.txOuts.map(
        (txOut, index) => new UTxOut(tx.id, index, txOut.address, txOut.amount)
      )
    )
    .reduce((a, b) => a.concat(b), []);

  const spentTxOuts = newTxs
    .map(tx => tx.txIns)
    .reduce((a, b) => a.concat(b), [])
    .map(txIn => new UTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

  // 현재 UTXO 리스트에서 사용된 트랜잭션을 지우고, 새로운 트랜잭션을 추가
  const resultingUTxOuts = uTxOutList
    .filter(uTxO => !findUTxOut(uTxO.txOutId, uTxO.txOutIndex, spentTxOuts))
    .concat(newUTxOuts);

  return resultingUTxOuts;
};

const isTxInStructureValid = txIn => {
  if (txIn === null) {
    console.log('The txIn appears to be null');
    return false;
  } else if (typeof txIn.signature !== 'string') {
    console.log("The txIn doesn't have a valid signature");
    return false;
  } else if (typeof txIn.txOutId !== 'string') {
    console.log("The txIn doesn't have a valid txOutId");
    return false;
  } else if (typeof txIn.txOutIndex !== 'number') {
    console.log("The txIn doesn't have a valid txOutIndex");
    return false;
  } else {
    return true;
  }
};

const isAddressValid = address => {
  if (address.length !== 130) {
    console.log('The address length is not the expected one');
    return false;
  } else if (address.match('^[a-fA-F0-9]+$') === null) {
    console.log("The address doesn't match the hex patter");
    return false;
  } else if (!address.startsWith('04')) {
    console.log("The address doesn't start with 04");
    return false;
  } else {
    return true;
  }
};

const isTxOutStructureValid = txOut => {
  if (txOut === null) {
    console.log('The txOut appears to be null');
    return false;
  } else if (typeof txOut.address !== 'string') {
    console.log("The txOut doesn't have a valid string as address");
    return false;
  } else if (!isAddressValid(txOut.address)) {
    console.log("The txOut doesn't have a valid address");
    return false;
  } else if (typeof txOut.amount !== 'number') {
    console.log("The txOut doesn't have a valid amount");
    return false;
  } else {
    return true;
  }
};

const isTxStructureValid = tx => {
  if (typeof tx.id !== 'string') {
    console.log('Tx ID is not valid');
    return false;
  } else if (!(tx.txIns instanceof Array)) {
    console.log('The txIns are not an array');
    return false;
  } else if (
    !tx.txIns.map(isTxInStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log('The structure of one of the txIn is not valid');
    return false;
  } else if (!(tx.txOuts instanceof Array)) {
    console.log('The txOuts are not an array');
    return false;
  } else if (
    !tx.txOuts.map(isTxOutStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log('The structure of one of the txOut is not valid');
    return false;
  } else {
    return true;
  }
};

const validateTxIn = (txIn, tx, uTxOutList) => {
  const wantedTxOut = uTxOutList.find(
    uTxO => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
  );
  console.log(wantedTxOut);
  if (wantedTxOut === null) {
    return false;
  } else {
    const address = wantedTxOut.address;
    const key = ec.keyFromPublic(address, 'hex');
    return key.verify(tx.id, txIn.signature);
  }
};

const getAmountInTxIn = (txIn, uTxOutList) =>
  findUTxOut(txIn.txOutId, txIn.txOutIndex, uTxOutList).amount;

/**
 * 트랜잭션 검증
 * @param {*} tx
 * @param {*} uTxOutList
 */
const validateTx = (tx, uTxOutList) => {
  if (!isTxStructureValid(tx)) {
    return false;
  }

  if (getTxId(tx) !== tx.id) {
    return false;
  }

  const hasValidTxIns = tx.txIns
    .map(txIn => validateTxIn(txIn, tx, uTxOutList))
    .reduce((a, b) => a && b);

  if (!hasValidTxIns) {
    console.log(`The tx: ${tx} doesn't have valid txIns`);
    return false;
  }

  const amountInTxIns = tx.txIns
    .map(txIn => getAmountInTxIn(txIn, uTxOutList))
    .reduce((a, b) => a + b, 0);

  const amountInTxOuts = tx.txOuts
    .map(txOut => txOut.amount)
    .reduce((a, b) => a + b, 0);

  if (amountInTxIns !== amountInTxOuts) {
    console.log(
      `The tx: ${tx} doesn't have the same amount in the txOut as in the txIns`
    );
    return false;
  } else {
    return true;
  }
};

const validateCoinbaseTx = (tx, blockIndex) => {
  if (getTxId(tx) !== tx.id) {
    console.log('Invalid Coinbase Tx ID');
    return false;
  } else if (tx.txIns.length !== 1) {
    console.log('Coinbase Tx sholud only have one input');
    return false;
  } else if (tx.txIns[0].txOutIndex !== blockIndex) {
    console.log(
      'The txOutIndex of the Coinbase Tx sholud be same as the Block Index'
    );
    return false;
  } else if (tx.txOuts.length !== 1) {
    console.log('Coinbase Tx sholud only have one output');
    return false;
  } else if (tx.txOuts[0].amount !== COINBASE_AMOUNT) {
    console.log(
      `coinbase Tx should have an amount of only ${COINBASE_AMOUNT} and it has ${
        tx.txOuts[0].amount
      }`
    );
    return false;
  } else {
    return true;
  }
};

const createCoinbaseTx = (address, blockIndex) => {
  const tx = new Transaction();
  const txIn = new TxIn();
  txIn.signature = '';
  txIn.txOutId = '';
  txIn.txOutIndex = blockIndex;
  tx.txIns = [txIn]; // 트랜잭션은 input이 하나만 있음
  tx.txOuts = [new TxOut(address, COINBASE_AMOUNT)]; // output은 블록을 찾은 주소를 향하고 있음
  tx.id = getTxId(tx);
  return tx;
};

const hasDuplicates = txIns => {
  const groups = _.countBy(txIns, txIn => txIn.txOutId + txIn.txOutIndex);

  return _(groups)
    .map(value => {
      if (value > 1) {
        console.log('Found a duplicated txIn');
        return true;
      } else {
        return false;
      }
    })
    .includes(true);
};

/**
 * 블록의 모든 트랜잭션 검증
 * @param {*} txs
 * @param {*} uTxOutList
 * @param {*} blockIndex
 */
const validateBlockTxs = (txs, uTxOutList, blockIndex) => {
  // 코인베이스 트랜잭션 검증
  const coinbaseTx = txs[0];
  if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
    console.log('Coinbase Tx is invalid');
    return false;
  }

  const txIns = _(txs)
    .map(tx => tx.txIns)
    .flatten()
    .value();

  if (hasDuplicates(txIns)) {
    console.log('Found duplicated txIns');
    return false;
  }

  const nonCoinbaseTx = txs.slice(1);

  return nonCoinbaseTx
    .map(tx => validateTx(tx, uTxOutList))
    .reduce((a, b) => a && b, true);
};

const processTxs = (txs, uTxOutList, blockIndex) => {
  if (!validateBlockTxs(txs, uTxOutList, blockIndex)) {
    return null;
  }
  return updateUTxOuts(txs, uTxOutList);
};

module.exports = {
  getPublicKey,
  getTxId,
  signTxIn,
  TxIn,
  Transaction,
  TxOut,
  createCoinbaseTx,
  processTxs,
  validateTx
};
