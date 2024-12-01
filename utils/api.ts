import axios from "axios"

const url = 'https://api.coingecko.com/api/v3/coins/markets';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    'x-cg-demo-api-key': 'CG-J1f95Y52uQzg4q2NAxPmTno3',
  },
  params: {
    vs_currency: 'eth',
    category: 'meme-token',
    order: 'market_cap_desc',
    per_page: 10,
    page: 1,
  },
};

export async function getTopMemecoins() {
  try {
    const response = await axios(url, options);

    const topMemecoins = response.data.map((coin) => ({
      name: coin.symbol,
      current_price: coin.current_price,
    }));

    return topMemecoins
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}