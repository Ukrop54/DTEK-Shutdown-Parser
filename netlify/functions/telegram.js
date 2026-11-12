// const cId_var = "1352317933";

// exports.handler = async (event) => {
//    const BOT_TOKEN = process.env.BOT_TOKEN;

//    if (!BOT_TOKEN) {
//       return {
//          statusCode: 500,
//          body: JSON.stringify({
//             error: "BOT_TOKEN is not configured",
//          }),
//       };
//    }
//    if (event.httpMethod !== "POST") {
//       return {
//          statusCode: 405,
//          body: JSON.stringify({
//             error: "Method not allowed",
//          }),
//       };
//    }

//    try {
//       const body = JSON.parse(event.body);

//       const message = body.message;

//       if (!message) {
//          return {
//             statusCode: 400,
//             body: JSON.stringify({
//                error: "Message is required",
//             }),
//          };
//       }

//       const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
//          method: "POST",

//          headers: {
//             "Content-Type": "application/json",
//          },

//          body: JSON.stringify({
//             chat_id: cId_var,
//             text: message,
//          }),
//       });

//       const result = await response.json();

//       return {
//          statusCode: response.ok ? 200 : 502,
//          body: JSON.stringify(result),
//       };
//    } catch (error) {
//       return {
//          statusCode: 500,
//          body: JSON.stringify({
//             error: error.message,
//          }),
//       };
//    }
// };

async function telegramRequest(BOT_TOKEN, method, data) {
   const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
   });
   console.log(data);

   const result = await response.json();

   if (!response.ok || !result.ok) {
      throw new Error(result.description || `Telegram API error: ${response.status}`);
   }

   return result;
}

async function sendMenu(BOT_TOKEN, chatId) {
   return telegramRequest(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: "Информация: ",
      reply_markup: {
         keyboard: [
            [
               {
                  text: "Статус отключений",
               },
               {
                  text: "Полный график",
               },
            ],
         ],

         resize_keyboard: true,
         is_persistent: true,
      },
   });
}

exports.handler = async (event) => {
   const BOT_TOKEN = process.env.BOT_TOKEN;
   const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

   if (!BOT_TOKEN) {
      return {
         statusCode: 500,
         body: "BOT_TOKEN is not configured",
      };
   }

   if (event.httpMethod !== "POST") {
      return {
         statusCode: 405,
         body: "Method not allowed",
      };
   }

   if (WEBHOOK_SECRET && event.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
      return {
         statusCode: 401,
         body: "Unauthorized",
      };
   }

   try {
      const update = JSON.parse(event.body || "{}");

      if (update.message) {
         const message = update.message;
         const chatId = message.chat.id;
         const text = message.text || "";

         if (text.startsWith("/start")) {
            await sendMenu(BOT_TOKEN, chatId);
         } else if (text === "Статус отключений") {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: chatId,
               text: "status",
            });
         } else if (text === "Полный график") {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: chatId,
               text: "grafic",
            });
         } else if (text.startsWith("Тане: ")) {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: "6351924630",
               text: text.slice(6),
            });
         } else if (text.startsWith("Мне: ")) {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: "1352317933",
               text: text.slice(5),
            });
         }
      }

      if (update.callback_query) {
         const callback = update.callback_query;
         const chatId = callback.message.chat.id;
         const callbackId = callback.id;

         await telegramRequest(BOT_TOKEN, "answerCallbackQuery", {
            callback_query_id: callbackId,
         });

         if (callback.data === "today") {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: chatId,
               text: "отключения сегодня",
            });
         }

         if (callback.data === "full") {
            await telegramRequest(BOT_TOKEN, "sendMessage", {
               chat_id: chatId,
               text: "полное расписание",
            });
         }
      }

      return {
         statusCode: 200,
         body: "OK",
      };
   } catch (error) {
      console.error("Telegram webhook error:", error);

      return {
         statusCode: 500,
         body: "Internal Server Error",
      };
   }
};
