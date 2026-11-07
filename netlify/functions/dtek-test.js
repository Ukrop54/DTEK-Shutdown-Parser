exports.handler = async function () {
   const pageUrl = "https://www.dtek-oem.com.ua/ua/shutdowns";

   try {
      const response = await fetch(pageUrl, {
         headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "uk-UA,uk;q=0.9",
         },
      });

      const html = await response.text();

      // Извлекаем содержимое всех script-тегов
      const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match, index) => ({
         index,
         content: match[1],
      }));

      // Ищем скрипты с данными ДТЭК
      const targets = ["DisconSchedule.fact", "DisconSchedule.preset", "DisconSchedule.streets"];

      const results = {};

      for (const target of targets) {
         const found = [];

         for (const script of scripts) {
            const position = script.content.indexOf(target);

            if (position !== -1) {
               found.push({
                  scriptIndex: script.index,
                  scriptLength: script.content.length,
                  position,
                  before: script.content.slice(Math.max(0, position - 500), position),
                  after: script.content.slice(position, position + 5000),
               });
            }
         }

         results[target] = found;
      }

      return {
         statusCode: 200,
         headers: {
            "Content-Type": "application/json; charset=utf-8",
         },
         body: JSON.stringify(
            {
               success: response.ok,
               htmlLength: html.length,
               scriptCount: scripts.length,
               results,
            },
            null,
            2
         ),
      };
   } catch (error) {
      return {
         statusCode: 500,
         body: JSON.stringify({
            success: false,
            error: error.message,
         }),
      };
   }
};
