import TelegramBot from "node-telegram-bot-api";
import Configuration, { OpenAI } from "openai";
require("dotenv").config();
import { getTopMemecoins } from "./utils/api";
import { ethers } from "ethers";

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI
const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN as string, { polling: true });

// Memory for storing user data
const userMemory = new Map<string, { 
  conversation: Array<{ role: string; content: string }>,
  wallet?: { address: string; privateKey: string },
  requests?: Array<{ from: string; amount: string; token: string }>,
}>();

// Helper function to find a user by their username
const findUserIdByUsername = async (handle: string): Promise<string | undefined> => {
  for (const [userId, _] of userMemory) {
    const chat = await bot.getChat(userId);
    if (chat.username === handle) {
      return userId;
    }
  }
  return undefined;
};

// Handle incoming messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  // Initialize user data if not present
  if (!userMemory.has(chatId)) {
    userMemory.set(chatId, { conversation: [], requests: [] });
  }

  const userData = userMemory.get(chatId);

  // /start Command
  if (text === "/start") {
    bot.sendMessage(chatId, "Hello! I am your DeFi assistant. Use /wallet to create a wallet or ask me about memecoins.");
    userData.conversation = [];
    userData.requests = [];
    return;
  }

  // /wallet Command
  if (text === "/wallet") {
    if (userData.wallet) {
      bot.sendMessage(chatId, 
🪙 *Your Existing Wallet*:
- Public Key: \${userData.wallet.address}\
- Private Key: \${userData.wallet.privateKey}\

*Keep your private key safe!*
      , { parse_mode: "Markdown" });
      return;
    }

    // Generate a new wallet
    const wallet = ethers.Wallet.createRandom();
    userData.wallet = { address: wallet.address, privateKey: wallet.privateKey };
    bot.sendMessage(chatId, 
🪙 *Your New Wallet*:
- Public Key: \${wallet.address}\
- Private Key: \${wallet.privateKey}\

*Keep your private key safe!*
    , { parse_mode: "Markdown" });
    return;
  }

  // /request Command
  if (text.startsWith("/request")) {
    const parts = text.split(" ");
    if (parts.length !== 4) {
      bot.sendMessage(chatId, "Invalid format! Use /request <amount> <token> <@username>");
      return;
    }

    const amount = parts[1];
    const token = parts[2];
    const handle = parts[3].replace("@", "");

    if (!userData.wallet) {
      bot.sendMessage(chatId, "You need to create a wallet first using /wallet.");
      return;
    }

    const targetUserId = await findUserIdByUsername(handle);

    if (!targetUserId || targetUserId === chatId) {
      bot.sendMessage(chatId, "The specified user is invalid or you cannot request funds from yourself.");
      return;
    }

    const targetUserData = userMemory.get(targetUserId);
    if (!targetUserData.wallet) {
      bot.sendMessage(chatId, "The target user does not have a wallet.");
      return;
    }

    targetUserData.requests.push({
      from: chatId,
      amount,
      token,
    });

    bot.sendMessage(
      targetUserId,
      @${msg.from.username} has requested ${amount} ${token} from you. Do you approve?,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Approve", callback_data: approve_${chatId}_${amount}_${token} },
              { text: "Decline", callback_data: decline_${chatId}_${amount}_${token} },
            ],
          ],
        },
      }
    );

    bot.sendMessage(chatId, Request sent to @${handle}.);
    return;
  }

  // Process messages via OpenAI
  const messages = [
    {
      role: "system",
      content: You are an assistant that only responds with JSON objects. Extract DeFi-related details and respond in structured formats.,
    },
    ...userData.conversation,
    { role: "user", content: text },
  ];

  try {
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    });

    const reply = response.choices[0].message.content;
    const parsedResponse = JSON.parse(reply);

    if (parsedResponse.category === "memecoins") {
      const topMemecoins = await getTopMemecoins();
      const list = topMemecoins.map((coin, index) => ${index + 1}. ${coin.name} - $${coin.current_price}).join("\n");
      bot.sendMessage(chatId, list);
    } else if (parsedResponse.task === "send") {
      const provider = new ethers.JsonRpcProvider("https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89");
      const wallet = new ethers.Wallet(userData.wallet.privateKey, provider);
      const tx = await wallet.sendTransaction({
        to: parsedResponse.to_address,
        value: ethers.parseEther(parsedResponse.amount),
      });
      await tx.wait();
      bot.sendMessage(chatId, "Transaction sent successfully!");
    } else {
      bot.sendMessage(chatId, reply || "I didn't understand your request.");
    }
  } catch (error) {
    console.error("Error:", error);
    bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
  }
});

// Handle callback queries
bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const targetChatId = callbackQuery.message.chat.id.toString();

  if (data.startsWith("approve")) {
    const [, fromChatId, amount, token] = data.split("_");
    const requesterData = userMemory.get(fromChatId);
    const approverData = userMemory.get(targetChatId);

    if (!approverData.wallet || !requesterData.wallet) {
      bot.sendMessage(targetChatId, "Transaction failed. Both users must have wallets.");
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider("https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89");
      const wallet = new ethers.Wallet(approverData.wallet.privateKey, provider);
      const tx = await wallet.sendTransaction({
        to: requesterData.wallet.address,
        value: ethers.parseEther(amount),
      });
      await tx.wait();
      bot.sendMessage(targetChatId, Transaction approved! Sent ${amount} ${token}.);
      bot.sendMessage(fromChatId, @${callbackQuery.from.username} approved your request and sent ${amount} ${token}.);
    } catch (error) {
      console.error("Transaction Error:", error);
      bot.sendMessage(targetChatId, "Transaction failed. Please try again.");
    }
  } else if (data.startsWith("decline")) {
    const [, fromChatId, amount, token] = data.split("_");
    bot.sendMessage(targetChatId, "You declined the request.");
    bot.sendMessage(fromChatId, @${callbackQuery.from.username} declined your request for ${amount} ${token}.);
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

console.log("Bot is running...");