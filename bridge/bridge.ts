import type { Wallet } from "ethers";
import { ethers } from "ethers";
require("dotenv").config();

export async function bridgeToBase(amount: string, pvtKey: string) {
    const bridgeAddressSepolia = '0xA6C27c825401a577D9d67477712796c72270316e'
    const bridgeAddressHolesky = '0x4E4FCf5c385c0b33229C2E8eAf045ae7a610724e'

    const holeskyProvider = new ethers.JsonRpcProvider('https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');
    const sepoliaProvider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');
    const baseSepoliaProvider = new ethers.JsonRpcProvider('https://base-sepolia.infura.io/v3/7edf2bfe316044cebd40fe102701cb89');

    const abi = [
        {
            "inputs": [],
            "name": "deposit",
            "outputs": [],
            "stateMutability": "payable",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "user",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
            "name": "Deposit",
            "type": "event"
        },
        {
            "inputs": [
                {
                    "internalType": "address",
                    "name": "",
                    "type": "address"
                }
            ],
            "name": "balances",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "getContractBalance",
            "outputs": [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        }
    ]

    const walletHolesky = new ethers.Wallet(pvtKey, holeskyProvider);
    const walletSepolia = new ethers.Wallet(pvtKey, sepoliaProvider);

    const sepoliaBridge = new ethers.Contract(bridgeAddressSepolia, abi, walletSepolia);
    const holeskyBridge = new ethers.Contract(bridgeAddressHolesky, abi, walletHolesky);


    const sepoliaBalance = await sepoliaProvider.getBalance(walletSepolia.address);
    const holeskyBalance = await holeskyProvider.getBalance(walletHolesky.address);

    console.log(`Sepolia Balance: ${ethers.formatEther(sepoliaBalance)}`);
    console.log(`Holesky Balance: ${ethers.formatEther(holeskyBalance)}`);

    const amountWei = ethers.parseEther(amount);

    if (sepoliaBalance >= amountWei) {
        // Use Sepolia only if it has enough balance
        const sepoliaDeposit = await sepoliaBridge.deposit({ value: amountWei });
        await sepoliaDeposit.wait();
        console.log('Deposited to Sepolia');
    } else if (holeskyBalance >= amountWei) {
        // Use Holesky only if it has enough balance
        const holeskyDeposit = await holeskyBridge.deposit({ value: amountWei });
        await holeskyDeposit.wait();
        console.log('Deposited to Holesky');
    } else {
        // Split the amount based on the balances
        const totalBalance = sepoliaBalance + holeskyBalance;
        const sepoliaShare = amountWei * sepoliaBalance / totalBalance;
        const holeskyShare = amountWei - sepoliaShare;

        if (sepoliaShare > 0) {
            const sepoliaDeposit = await sepoliaBridge.deposit({ value: sepoliaShare });
            await sepoliaDeposit.wait();
            console.log(`Deposited ${ethers.formatEther(sepoliaShare)} to Sepolia`);
        }

        if (holeskyShare > 0) {
            const holeskyDeposit = await holeskyBridge.deposit({ value: holeskyShare });
            await holeskyDeposit.wait();
            console.log(`Deposited ${ethers.formatEther(holeskyShare)} to Holesky`);
        }
    }

    const RELAYER_PVT_KEY = process.env.RELAYER_PVT_KEY;
    const relayerWallet = new ethers.Wallet(RELAYER_PVT_KEY, baseSepoliaProvider);
    await relayerWallet.sendTransaction({
        to: walletSepolia.address,
        value: amountWei,
    });

    return 1;
}