import { ethers } from "ethers";

export async function getBalance(pvtKey: string) {
    const holeskyProvider = new ethers.JsonRpcProvider('https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');
    const sepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');
    const baseSepoliaProvider = new ethers.JsonRpcProvider('https://base-sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');

    const wallet = new ethers.Wallet(pvtKey)

    const holeskyBalance = await holeskyProvider.getBalance(wallet.address)
    const sepoliaBalance = await sepoliaProvider.getBalance(wallet.address)
    const baseSepoliaBalance = await baseSepoliaProvider.getBalance(wallet.address)

    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';
    const options = {
        method: 'GET',
        headers: { accept: 'application/json', 'x-cg-demo-api-key': 'CG-J1f95Y52uQzg4q2NAxPmTno3' }
    };

    const ethPriceResponse = await fetch(url, options);
    const ethPriceData = await ethPriceResponse.json();
    const ethPriceInUsd = ethPriceData.ethereum.usd;

    const totalBalanceInEth = ethers.formatEther(sepoliaBalance)+ethers.formatEther(baseSepoliaBalance)+ethers.formatEther(holeskyBalance);
    const totalBalanceInUsd = parseFloat(totalBalanceInEth) * ethPriceInUsd;

    return totalBalanceInUsd;
}