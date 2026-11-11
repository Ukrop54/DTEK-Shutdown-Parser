async function sendMessage(message) {
   try {
      const response = await fetch("/.netlify/functions/telegram", {
         method: "POST",

         headers: {
            "Content-Type": "application/json",
         },

         body: JSON.stringify({
            message: message,
         }),
      });

      const result = await response.json();

      if (!response.ok) {
         throw new Error(result.error || "Request failed");
      }

      return result;
   } catch (error) {
      console.error("Telegram error:", error);

      return {
         success: false,
         error: error.message,
      };
   }
}

window.sendMessage = sendMessage;
