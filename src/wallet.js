const elliptic = require('elliptic'),
  path = require('path'),
  fs = require('fs'),
  _ = require('lodash'),
  Transactions = require('./transactions');

const {
  getPublicKey,
  getTxId,
  signTxIn,
  TxIn,
  Transaction,
  TxOut
} = Transactions;

const ec = new elliptic.ec('secp256k1');

const privateKeyLocation = path.join(__dirname, 'privateKey');

/**
 * private 키 생성
 */
const generatePrivateKey = () => {
  const keyPair = ec.genKeyPair();
  const privateKey = keyPair.getPrivate();
  return privateKey.toString(16);
};

/**
 * 지갑에서 private 키 가져오기
 */
const getPrivateFromWallet = () => {
  const buffer = fs.readFileSync(privateKeyLocation, 'utf8');
  return buffer.toString();
};

/**
 * 지갑에서 public 키 가져오기
 */
const getPublicFromWallet = () => {
  const privateKey = getPrivateFromWallet();
  const key = ec.keyFromPrivate(privateKey, 'hex');
  return key.getPublic().encode('hex');
};

/**
 * 해당 계정의 잔액 구하기
 * @param {*} address 계정 주소
 * @param {*} uTxOuts
 */
const getBalance = (address, uTxOuts) => {
  return _(uTxOuts)
    .filter(uTxO => uTxO.address === address)
    .map(uTxO => uTxO.amount)
    .sum();
};

/**
 * 지갑 파일 생성
 */
const initWallet = () => {
  if (fs.existsSync(privateKeyLocation)) {
    return;
  }
  const newPrivateKey = generatePrivateKey();

  fs.writeFileSync(privateKeyLocation, newPrivateKey);
};

/**
 * 내 UTXO 리스트에서 필요한 잔액 만큼의 UTXO 찾기
 * @param {*} amountNeeded 필요한 잔액
 * @param {*} myUTxOuts 내 UTXO 리스트
 */
const findAmountInUTxOuts = (amountNeeded, myUTxOuts) => {
  let currentAmount = 0;
  const includedUTxOuts = [];
  for (const myUTxOut of myUTxOuts) {
    includedUTxOuts.push(myUTxOut);
    currentAmount = currentAmount + myUTxOut.amount;
    // 필요한 잔액보다 현재 잔액이 큰 경우
    if (currentAmount >= amountNeeded) {
      // 남은 잔액
      const leftOverAmount = currentAmount - amountNeeded;
      return { includedUTxOuts, leftOverAmount };
    }
  }
  throw Error('Not enough funds');
  return false;
};

/**
 * 트랜잭션 output 생성
 * @param {*} receiverAddress 수취인 주소
 * @param {*} myAddress 송금인 주소
 * @param {*} amount 잔액
 * @param {*} leftOverAmount 남은 잔액
 */
const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
  const receiverTxOut = new TxOut(receiverAddress, amount);
  if (leftOverAmount === 0) {
    return [receiverTxOut];
  } else {
    //  나에게 남은 잔액이 돌아옴
    const leftOverTxOut = new TxOut(myAddress, leftOverAmount);
    return [receiverTxOut, leftOverTxOut];
  }
};

/**
 * uTxOutList에서 이미 Mempool에 있는 트랜잭션 input 필터
 * @param {*} uTxOutList 우리가 갖고 있는 돈
 * @param {*} mempool 이미 사용한 돈
 */
const filterUTxOutsFromMempool = (uTxOutList, mempool) => {
  // Mempool 안의 모든 트랜잭션 input을 가져옴
  const txIns = _(mempool)
    .map(tx => tx.txIns)
    .flatten()
    .value();

  const removables = []; // 필터할 트랜잭션들

  for (const uTxOut of uTxOutList) {
    // uTxOutList에서 이미 Mempool 안에 있는 트랜잭션 찾음
    const txIn = _.find(
      txIns,
      txIn =>
        txIn.txOutIndex === uTxOut.txOutIndex && txIn.txOutId === uTxOut.txOutId
    );

    // 찾으면 필터 대상
    if (txIn !== undefined) {
      removables.push(uTxOut);
    }
  }

  // uTxOutList에서 removables 요소를 제외하고 리턴
  return _.without(uTxOutList, ...removables);
};

const createTx = (receiverAddress, amount, privateKey, uTxOutList, mempool) => {
  const myAddress = getPublicKey(privateKey);
  const myUTxOuts = uTxOutList.filter(uTxO => uTxO.address === myAddress);

  const filteredUTxOuts = filterUTxOutsFromMempool(myUTxOuts, mempool);

  const { includedUTxOuts, leftOverAmount } = findAmountInUTxOuts(
    amount,
    filteredUTxOuts
  );

  // UTXO를 트랜잭션 input으로 바꿈
  const toUnsignedTxIn = uTxOut => {
    const txIn = new TxIn();
    txIn.txOutId = uTxOut.txOutId;
    txIn.txOutIndex = uTxOut.txOutIndex;
    return txIn;
  };

  const unsignedTxIns = includedUTxOuts.map(toUnsignedTxIn);

  const tx = new Transaction();

  tx.txIns = unsignedTxIns;
  tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);

  tx.id = getTxId(tx);

  tx.txIns = tx.txIns.map((txIn, index) => {
    txIn.signature = signTxIn(tx, index, privateKey, uTxOutList);
    return txIn;
  });
  return tx;
};

module.exports = {
  initWallet,
  getBalance,
  getPublicFromWallet,
  createTx,
  getPrivateFromWallet
};
