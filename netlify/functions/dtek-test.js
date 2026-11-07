function extractObject(html, variableName) {
   const marker = `DisconSchedule.${variableName}`;
   const markerPosition = html.indexOf(marker);

   if (markerPosition === -1) {
      throw new Error(`Не найден объект ${marker}`);
   }

   const equalPosition = html.indexOf("=", markerPosition);
   const startPosition = html.indexOf("{", equalPosition);

   if (equalPosition === -1 || startPosition === -1) {
      throw new Error(`Некорректное присваивание ${marker}`);
   }

   let depth = 0;
   let inString = false;
   let escaped = false;

   for (let i = startPosition; i < html.length; i++) {
      const char = html[i];

      if (inString) {
         if (escaped) {
            escaped = false;
         } else if (char === "\\") {
            escaped = true;
         } else if (char === '"') {
            inString = false;
         }

         continue;
      }

      if (char === '"') {
         inString = true;
      } else if (char === "{") {
         depth++;
      } else if (char === "}") {
         depth--;

         if (depth === 0) {
            return JSON.parse(html.slice(startPosition, i + 1));
         }
      }
   }

   throw new Error(`Не удалось извлечь ${marker}`);
}

exports.handler = async function () {
   try {
      const response = await fetch("https://www.dtek-oem.com.ua/ua/shutdowns", {
         headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "uk-UA,uk;q=0.9",
         },
      });

      if (!response.ok) {
         throw new Error(`ДТЭК вернул HTTP ${response.status}`);
      }

      const html = await response.text();

      const streets = extractObject(html, "streets");
      const preset = extractObject(html, "preset");
      const fact = extractObject(html, "fact");

      return {
         statusCode: 200,
         headers: {
            "Content-Type": "application/json; charset=utf-8",
         },
         body: JSON.stringify(
            {
               success: true,

               streets: {
                  citiesCount: Object.keys(streets).length,
                  hasMihayeve: !!streets["с-ще Мигаєве"],
                  streets: streets["с-ще Мигаєве"] || [],
               },

               preset: {
                  days: preset.days,
                  queueNames: Object.keys(preset.sch_names),
                  hasGPV51: !!preset.data["GPV5.1"],
                  mondayGPV51: preset.data["GPV5.1"]?.["1"],
               },

               fact: {
                  update: fact.update,
                  date: fact.today,
                  queues: Object.keys(fact.data[String(fact.today)] || {}),
                  GPV51: fact.data[String(fact.today)]?.["GPV5.1"],
               },
            },
            null,
            2
         ),
      };
   } catch (error) {
      return {
         statusCode: 500,
         headers: {
            "Content-Type": "application/json; charset=utf-8",
         },
         body: JSON.stringify({
            success: false,
            error: error.message,
         }),
      };
   }
};
