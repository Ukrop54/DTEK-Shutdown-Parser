const cId_var = "1352317933";

exports.handler = async (event) => {
   const BOT_TOKEN = process.env.BOT_TOKEN;

   if (!BOT_TOKEN) {
      return {
         statusCode: 500,
         body: JSON.stringify({
            error: "BOT_TOKEN is not configured",
         }),
      };
   }
   if (event.httpMethod !== "POST") {
      return {
         statusCode: 405,
         body: JSON.stringify({
            error: "Method not allowed",
         }),
      };
   }

   try {
      const body = JSON.parse(event.body);

      const message = body.message;

      if (!message) {
         return {
            statusCode: 400,
            body: JSON.stringify({
               error: "Message is required",
            }),
         };
      }

      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
         method: "POST",

         headers: {
            "Content-Type": "application/json",
         },

         body: JSON.stringify({
            chat_id: cId_var,
            text: message,
         }),
      });

      const result = await response.json();

      return {
         statusCode: response.ok ? 200 : 502,
         body: JSON.stringify(result),
      };
   } catch (error) {
      return {
         statusCode: 500,
         body: JSON.stringify({
            error: error.message,
         }),
      };
   }
};
