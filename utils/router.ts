import { PathFinder, Network } from "@routerprotocol/asset-transfer-sdk-ts";
import axios from "axios";
// import { evmSignerFromPrivateKeyAndRpc } from "@routerprotocol/asset-transfer-sdk-ts";

async function main() {
      const PATH_FINDER_API_URL = "https://api.pf.testnet.routerprotocol.com/api"
    const getQuote = async (params) => {
        const endpoint = "v2/quote";
        const quoteUrl = `${PATH_FINDER_API_URL}/${endpoint}`;
        try {
            const res = await axios.get(quoteUrl, { params });
            return res.data;
        } catch (e) {
            console.error(`Fetching quote data from pathfinder: ${e}`);
        }
    };

    const quoteParams = {
        fromTokenAddress: '0x5620cDb94BaAaD10c20483bd8705DA711b2Bc0a3',
        toTokenAddress: '0x87C51CD469A0E1E2aF0e0e597fD88D9Ae4BaA967',
        amount: 1,
        fromTokenChainId: "17000",
        toTokenChainId: "85432", // Fuji

        widgetId: 0,
    };

    const quoteData = await getQuote(quoteParams);
    console.log("Quote Data:", quoteData);
}

main().catch(console.error);