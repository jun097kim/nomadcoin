const _ = require('lodash'),
  Transactions = require('./transactions');

const { validateTx } = Transactions;

// Mempool: 아직 블록체인에 포함되지 않은 트랜잭션
let mempool = [];

/**
 * pool 안에 있는 트랜잭션을 가져옴
 * @param {*} mempool
 */
const getTxInsInPool = mempool => {
  return _(mempool)
    .map(tx => tx.txIns)
    .flatten()
    .value();
};

const isTxValidForPool = (tx, mempool) => {
  const txInsInPool = getTxInsInPool(mempool);

  /**
   * 트랜잭션 input이 이미 pool에 있는지 더블 스펜딩 체크
   * @param {*} txIns pool의 트랜잭션 input 리스트
   * @param {*} txIn 새로운 트랜잭션 input
   */
  const isTxInAlreadyInPool = (txIns, txIn) => {
    return _.find(txIns, txInInPool => {
      return (
        txIn.txOutIndex === txInInPool.txOutIndex &&
        txIn.txOutId === txInInPool.txOutId
      );
    });
  };

  for (const txIn of tx.txIns) {
    if (isTxInAlreadyInPool(txInsInPool, txIn)) {
      return false;
    }
  }
  return true;
};

/**
 * 검증된 트랜잭션을 Mempool에 포함시킴
 * @param {*} tx
 * @param {*} uTxOutList
 */
const addToMempool = (tx, uTxOutList) => {
  // 트랜잭션이 유효하지 않으면, pool에 추가하지 않음
  if (!validateTx(tx, uTxOutList)) {
    throw Error('This tx is invalid. Will not add it to pool');
    // 트랜잭션 input이 이미 pool에 있으면, pool에 추가하지 않음
  } else if (!isTxValidForPool(tx, mempool)) {
    throw Error('This tx is not valid for the pool. Will not add it.');
  }
  mempool.push(tx);
};

module.exports = {
  addToMempool
};
