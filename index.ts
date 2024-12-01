import TelegramBot from "node-telegram-bot-api";
import Configuration, { OpenAI } from "openai";
require("dotenv").config();
import { getTopMemecoins } from "./utils/api";
import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid"; // For generating unique IDs
import { bridgeToBase } from "./bridge/bridge";
import { buyMemeCoin } from "./bridge/erc20";
import { getBalance } from "./utils/balance";

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI
const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN as string, { polling: true });

// Initialize memory for storing conversation history and wallet details
const userMemory = new Map<
  string,
  {
    conversation: Array<{ role: string; content: string }>;
    wallet?: { address: string; privateKey: string };
  }
>();

// Map to store username to chatId
const usernameToChatId = new Map<string, string>();

// Map to store pending requests with unique IDs
const pendingRequests = new Map<
  string,
  {
    fromUsername: string;
    fromChatId: string;
    toUsername: string;
    toChatId: string;
    amount: string;
    token: string;
  }
>();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  // Store the user's username and chatId
  if (msg.from.username) {
    usernameToChatId.set(msg.from.username, chatId);
  }

  // Initialize user memory if not present
  if (!userMemory.has(chatId)) {
    userMemory.set(chatId, { conversation: [] });
  }

  if (text === "/start") {
    bot.sendMessage(
      chatId,
      "Hello! I am a ChatGPT bot with memory. Ask me anything."
    );
    // Clear memory on /start
    userMemory.set(chatId, { conversation: [] });
    return;
  } else if (text === "/wallet") {
    // Check if the user already has a wallet
    const userData = userMemory.get(chatId);
    if (userData.wallet) {
      const existingWalletResponse = `
🪙 *Your Existing Wallet Details*:
- Public Key (Address): \`${userData.wallet.address}\`
- Private Key: \`${userData.wallet.privateKey}\`

*Keep your private key safe! Anyone with access to it can control your funds.*
      `;
      bot.sendMessage(chatId, existingWalletResponse, {
        parse_mode: "Markdown",
      });
      return;
    }

    // Generate a new wallet
    const wallet = ethers.Wallet.createRandom();
    userData.wallet = { address: wallet.address, privateKey: wallet.privateKey };

    const response = `
🪙 *Your New Wallet Details*:
- Public Key (Address): \`${wallet.address}\`
- Private Key: \`${wallet.privateKey}\`

*Keep your private key safe! Anyone with access to it can control your funds.*
    `;

    bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
    return;
  }else if(text?.startsWith("/balance")){
    const userData = userMemory.get(chatId);
    if (!userData.wallet) {
      bot.sendMessage(
        chatId,
        "You need to create a wallet first using /wallet."
      );
      return;
    }
    const bal = await getBalance(userData?.wallet.privateKey)
    bot.sendMessage(chatId, `Your balance is ${bal} USD`);
    return;
  }
   else if (text.startsWith("/request")) {
    const parts = text.split(" ");
    if (parts.length < 4) {
      bot.sendMessage(chatId, "Usage: /request @username amount token");
      return;
    }
    const targetUsername = parts[1].replace("@", "");
    const amount = parts[2];
    const token = parts[3];

    // Check if the target user is known
    if (!usernameToChatId.has(targetUsername)) {
      bot.sendMessage(
        chatId,
        "User not found or hasn't interacted with the bot."
      );
      return;
    }

    const targetChatId = usernameToChatId.get(targetUsername);

    // Generate a unique request ID
    const requestId = uuidv4();

    // Store the pending request in the pendingRequests map
    pendingRequests.set(requestId, {
      fromUsername: msg.from.username,
      fromChatId: chatId,
      toUsername: targetUsername,
      toChatId: targetChatId,
      amount,
      token,
    });

    // Send a message with inline buttons to the target user
    await bot.sendMessage(
      targetChatId,
      `@${msg.from.username} is requesting ${amount} ${token} from you.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Accept",
                callback_data: `accept_${requestId}`,
              },
              {
                text: "Decline",
                callback_data: `decline_${requestId}`,
              },
            ],
          ],
        },
      }
    );

    bot.sendMessage(
      chatId,
      `Your request has been sent to @${targetUsername}.`
    );
    return;
  }

  // Get user data (conversation and wallet details)
  const userData = userMemory.get(chatId);

  // Add the user message to the conversation
  userData.conversation.push({ role: "user", content: text });

  // System instructions
  const systemInstructions = {
    role: "system",
    content: `You are an assistant that only responds with JSON objects. Extract DeFi-related details from user prompts and format them as follows:
If the user wants to send tokens to an address then :
{
"task": "send",
"amount": <amount>,
"token": "<token>",
"to_address": "<to_address>"
}.

If the user wants to know the top 10 memecoins then :
{
"top": 10,
"category": "memecoins"
}.

If the user wants to buy a coin then :
{
"task":"buy",
"token":"<token>",
"amount":"<amount>"
}
If any part of the required information is missing, respond with a JSON object indicating the missing field(s) in this format:
{
"error": "Missing field(s): <missing_field_1>, <missing_field_2>"
}.`,
  };

  // Insert system instructions at the start of the conversation
  const messages = [systemInstructions, ...userData.conversation];

  // Process the message with OpenAI
  try {
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    });

    const reply = response.choices[0].message.content;

    console.log(reply);

    let parsedResponse = JSON.parse(reply);

    if (parsedResponse.category === "memecoins") {
      const topMemecoins = await getTopMemecoins();
      // Create a list in the form of a string
      let list = "";
      topMemecoins.forEach((coin, index) => {
        list += `${index + 1}. ${coin.name} - $${coin.current_price}\n`;
      });
      userData.conversation.push({
        role: "assistant",
        content: `${reply}\n\n${list}`,
      });
      bot.sendMessage(chatId, list);
    } else if (parsedResponse.task === "send") {
      if (!userData.wallet) {
        bot.sendMessage(
          chatId,
          "You need to create a wallet first using /wallet."
        );
        return;
      }
      const provider = new ethers.JsonRpcProvider(
        "https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89"
      );
      const wallet = new ethers.Wallet(userData.wallet.privateKey, provider);
      const tokenAddress = parsedResponse.token;
      const toAddress = parsedResponse.to_address;
      const amount = ethers.parseEther(parsedResponse.amount.toString());

      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amount,
      });
      
      await tx.wait();
      userData.conversation.push({ role: "assistant", content: reply });
      bot.sendMessage(chatId, `Transaction sent successfully!`);
    } else if(parsedResponse.task === "buy"){

      const topMemecoins = await getTopMemecoins();

      const res = await bridgeToBase((topMemecoins[0].current_price * parsedResponse.amount).toString(), userData.wallet.privateKey);

      bot.sendMessage(chatId, `Tokens bridge to base chain successfully!`);
      bot.sendMessage(chatId, `Buying ${parsedResponse.token} with ${parsedResponse.amount} ...`);

      const res1 = await buyMemeCoin(parsedResponse.amount, userData.wallet.privateKey);

      bot.sendMessage(chatId, `Transaction sent successfully!`);
    } else {
      // Add the assistant's reply to the conversation
      userData.conversation.push({ role: "assistant", content: reply });
      bot.sendMessage(chatId, reply || "");
    }
  } catch (error) {
    console.error("Error:", error);
    bot.sendMessage(
      chatId,
      "Sorry, there was an error processing your request."
    );
  }
});

// Handle callback queries for the inline buttons
bot.on("callback_query", async (callbackQuery) => {
  const data = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id.toString();

  // Extract action and requestId from callback_data
  const [action, requestId] = data.split("_");

  if (!pendingRequests.has(requestId)) {
    bot.sendMessage(chatId, "This request is no longer valid.");
    return;
  }

  const request = pendingRequests.get(requestId);

  if (action === "accept") {
    if (!userMemory.has(chatId)) {
      bot.sendMessage(chatId, "You need to create a wallet first using /wallet.");
      return;
    }
    const userData = userMemory.get(chatId);

    if (!userData.wallet) {
      bot.sendMessage(
        chatId,
        "You need to create a wallet first using /wallet."
      );
      return;
    }

    const requesterData = userMemory.get(request.fromChatId);
    if (!requesterData || !requesterData.wallet) {
      bot.sendMessage(chatId, "The requester doesn't have a wallet.");
      return;
    }

    const provider = new ethers.JsonRpcProvider(
      "https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89"
    );
    const wallet = new ethers.Wallet(userData.wallet.privateKey, provider);
    const toAddress = requesterData.wallet.address;
    const amountWei = ethers.parseEther(request.amount);

    try {
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei,
      });
      await tx.wait();

      // Notify both users
      bot.sendMessage(
        chatId,
        `You have sent ${request.amount} ${request.token} to @${request.fromUsername}.`
      );
      bot.sendMessage(
        request.fromChatId,
        `@${callbackQuery.from.username} has accepted your request and sent you ${request.amount} ${request.token}.`
      );

      // Edit the original request message to indicate completion
      bot.editMessageText(
        `You have accepted the request and sent ${request.amount} ${request.token} to @${request.fromUsername}.`,
        {
          chat_id: chatId,
          message_id: msg.message_id,
        }
      );
    } catch (error) {
      console.error("Transaction error:", error);
      bot.sendMessage(chatId, "Transaction failed.");
    }

    // Remove the pending request
    pendingRequests.delete(requestId);
  } else if (action === "decline") {
    // Notify both users
    bot.sendMessage(
      chatId,
      `You have declined the request from @${request.fromUsername}.`
    );
    bot.sendMessage(
      request.fromChatId,
      `@${callbackQuery.from.username} has declined your request.`
    );

    // Edit the original request message to indicate declination
    bot.editMessageText(
      `You have declined the request from @${request.fromUsername}.`,
      {
        chat_id: chatId,
        message_id: msg.message_id,
      }
    );

    // Remove the pending request
    pendingRequests.delete(requestId);
  }

  // Answer callback query to remove loading state
  bot.answerCallbackQuery(callbackQuery.id);
});

console.log("Bot is running...");
