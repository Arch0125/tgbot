import axios from 'axios';
import { ethers } from 'ethers';

const PATH_FINDER_API_URL = 'https://k8-testnet-pf.routerchain.dev/api';

const getQuote = async (from: string, to: string, amount: string) => {

    const params = {
        fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // USDT on src chain
        toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // USDT on dest chain
        amount: ethers.parseEther(amount), // source amount
        fromTokenChainId: 11155111, // Eth sepolia
        toTokenChainId: 421614, // Amoy
        slippageTolerance: 1, // optional
        partnerId: 267
    };

    const endpoint = 'v2/quote';
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
    const endpoint = 'v2/transaction';
    const txDataUrl = `${PATH_FINDER_API_URL}/${endpoint}`;

    const res = await axios.post(txDataUrl, {
        ...quoteData,
        senderAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
        receiverAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
        refundAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
    });

    // console.log(`curl -X POST ${txDataUrl} -H "Content-Type: application/json" -d '${JSON.stringify({
    //     ...quoteData,
    //     senderAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
    //     receiverAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
    //     refundAddress: '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',
    // })}'`);

    return res.data
};

export const routerBridge = async (pvtKey: string, from: string, to: string, amount: string) => {
    // setting up a signer
    const provider = new ethers.JsonRpcProvider(
        'https://sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89'
    );
    // use provider.getSigner() method to get a signer if you're using this for a UI
    const wallet = new ethers.Wallet(pvtKey, provider);

    // 1. get quote
    const quoteData = await getQuote(from, to, amount);
    console.log(quoteData);

    //   const allowanceTo = quoteData.allowanceTo;

    // 3. get transaction data
    const txResponse = await getTransaction(quoteData);

    // //   console.log(txResponse);

    //   // sending the transaction using the data given by the pathfinder
    const tx = await wallet.sendTransaction(txResponse.txn);
    await tx.wait();

    const tx2 = await wallet.sendTransaction({
        to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        value: ethers.parseEther('0.0000001'),
    });
    await tx2.wait();
    return tx2.hash;
};
