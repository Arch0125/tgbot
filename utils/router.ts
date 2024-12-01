import { PathFinder, Network } from "@routerprotocol/asset-transfer-sdk-ts";
import axios from "axios";
// import { evmSignerFromPrivateKeyAndRpc } from "@routerprotocol/asset-transfer-sdk-ts";

async function main() {
      const PATH_FINDER_API_URL = "https://k8-testnet-pf.routerchain.dev/"
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
        fromTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        toTokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        amount: 1,
        fromTokenChainId: "17000",
        toTokenChainId: "11155111",

        widgetId: 267,
    };

    const quoteData = await getQuote(quoteParams);
    console.log("Quote Data:", quoteData);
}

main().catch(console.error);