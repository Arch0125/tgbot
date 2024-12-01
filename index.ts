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
  apiKey: process.env["OPENAI_API_KEY"],
});

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN as string, { polling: true });

// Initialize memory for storing conversation history and wallet details
const userMemory = new Map<string, { 
  conversation: Array<{ role: string; content: string }>,
  wallet?: { address: string; privateKey: string },
}>();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  // Initialize user memory if not present
  if (!userMemory.has(chatId)) {
    userMemory.set(chatId, { conversation: [] });
  }

  if (text === "/start") {
    bot.sendMessage(chatId, "Hello! I am a ChatGPT bot with memory. Ask me anything.");
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
      bot.sendMessage(chatId, existingWalletResponse, { parse_mode: "Markdown" });
      return;
    }

    // Generate a new wallet
    // const wallet = new ethers.Wallet('0x8cacbef93a986ae978f0fdd24070fc2fe3edd088c8bf822e9b2ab6d91b704687');
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
      userData.conversation.push({ role: "assistant", content: `${reply}\n\n${list}` });
      bot.sendMessage(chatId, list);
    }else if(parsedResponse.task === "send"){
      const provider = new ethers.JsonRpcProvider("https://holesky.infura.io/v3/7edf2bfe316044cebd40fe102701cb89");
      const wallet = new ethers.Wallet(userData.wallet.privateKey, provider);
      const tokenAddress = parsedResponse.token;
      const toAddress = parsedResponse.to_address;
      const amount = ethers.parseEther((parsedResponse.amount).toString());


      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amount,
      });
      await tx.wait();
      userData.conversation.push({ role: "assistant", content: reply });
      bot.sendMessage(chatId, `Transaction sent successfully!`);
    } 
    else {
      // Add the assistant's reply to the conversation
      userData.conversation.push({ role: "assistant", content: reply });
      bot.sendMessage(chatId, reply || "");
    }
  } catch (error) {
    console.error("Error:", error);
    bot.sendMessage(chatId, "Sorry, there was an error processing your request.");
  }
});

console.log("Bot is running...");
