import TelegramBot from "node-telegram-bot-api";
import Configuration, { OpenAI } from "openai";
require("dotenv").config();
import { getTopMemecoins } from "./utils/api";

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI
const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
});

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN as string, { polling: true });

// Initialize memory for storing conversation history
const userMemory = new Map<string, Array<{ role: string; content: string }>>();

bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  // Initialize user memory if not present
  if (!userMemory.has(chatId)) {
    userMemory.set(chatId, []);
  }

  if (text === "/start") {
    bot.sendMessage(chatId, "Hello! I am a ChatGPT bot with memory. Ask me anything.");
    // Clear memory on /start
    userMemory.set(chatId, []);
    return;
  }

  // Get user conversation history
  let conversation = userMemory.get(chatId);

  // Add the user message to the conversation
  conversation.push({ role: "user", content: text });

  // System instructions
  const systemInstructions = {
    role: "system",
    content: `You are an assistant that only responds with JSON objects. Extract DeFi-related details from user prompts and format them as follows:
If the user wants to send tokens to an address then :
{
"amount": <amount>,
"token": "<token>",
"to_address": "<to_address>"
}.

If the user wants to know the top 10 memecoins then :
{
"top": 10,
"category": "memecoins"
}.

If the user want to buy a coin then 
{
"token":"<token>",
"amount":"<amount>"
}
If any part of the required information is missing, respond with a JSON object indicating the missing field(s) in this format:
{
"error": "Missing field(s): <missing_field_1>, <missing_field_2>"
}.`,
  };

  // Insert system instructions at the start of the conversation
  const messages = [systemInstructions, ...conversation];

  // Process the message with OpenAI
  try {
    const response = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    });

    const reply = response.choices[0].message.content;

    console.log(reply)

    let parsedResponse = JSON.parse(reply)

    if (parsedResponse.category === 'memecoins') {
      const topMemecoins = await getTopMemecoins();
      //create a list in form of string
      let list = ""
      topMemecoins.forEach((coin, index) => {
        list += `${index + 1}. ${coin.name} - $${coin.current_price}\n`;
      });
      conversation.push({ role: "assistant", content: `${reply}\n\n${list}` });
      bot.sendMessage(chatId, list);
    } else {

      // Add the assistant's reply to the conversation
      conversation.push({ role: "assistant", content: reply });
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

console.log("Bot is running...");
