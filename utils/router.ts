import axios from 'axios';
import { ethers } from 'ethers';

const PATH_FINDER_API_URL = 'https://k8-testnet-pf.routerchain.dev/api';

const getQuote = async () => {
  const params = {
    fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // USDT on src chain
    toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // USDT on dest chain
    amount: '10000000', // source amount
    fromTokenChainId: '11155111', // Eth sepolia
    toTokenChainId: '17000', // Amoy
    slippageTolerance: 1, // optional
    additionalGasLimit: '100000', // (optional) Additional gas limit to execute instruction on dest chain. Not required in case of asset transfer/swap.
    partnerId: 0, // (Optional) - For any partnership, get your unique partner id - https://app.routernitro.com/partnerId
  };

  const endpoint = 'v2/sequencer-quote';
  const quoteUrl = `${PATH_FINDER_API_URL}/${endpoint}`;

  try {
    const { data } = await axios.get(quoteUrl, { params });
    return data;
  } catch (e) {
    console.error(`Fetching quote data from pathfinder: ${e}`);
  }
};

/**
 * senderAddress: The address of the sender of the transaction.
 * receiverAddress: The receiver here should be the contract address that should receive the funds 
   along with the instructions.
 * contractMessage: Message to be passed to the destination chain contract.
 * refundAddress: The address which will receive funds in case no forwarder picks up the transaction
   and the user needs to withdraw the funds after some interval of time. Do fill this address very
   carefully otherwise you may lose your funds.
 */
const getTransaction = async (quoteData) => {
  const endpoint = 'v2/sequencer-transaction';
  const txDataUrl = `${PATH_FINDER_API_URL}/${endpoint}`;

  try {
    const res = await axios.post(txDataUrl, {
      ...quoteData,
      senderAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
      receiverAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
      refundAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
    });
    return res.data;
  } catch (e) {
    console.error(`Fetching tx data from pathfinder: ${e}`);
  }
};

const main = async () => {
  // setting up a signer
  const provider = new ethers.JsonRpcProvider(
    'https://sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89'
  );
  // use provider.getSigner() method to get a signer if you're using this for a UI
  const wallet = new ethers.Wallet('', provider);

  // 1. get quote
  const quoteData = await getQuote();
  console.log(quoteData);

  // 3. get transaction data
  const txResponse = await getTransaction(quoteData);

//   console.log(txResponse);

  // sending the transaction using the data given by the pathfinder
  const tx = await wallet.sendTransaction(txResponse.txn);
  try {
    await tx.wait();
    console.log(`Transaction mined successfully: ${tx.hash}`);
  } catch (error) {
    console.log(`Transaction failed with error: ${error}`);
  }
};

main();