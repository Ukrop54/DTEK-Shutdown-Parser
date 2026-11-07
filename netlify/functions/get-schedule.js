const PAGE_URL = "https://www.dtek-oem.com.ua/ua/shutdowns";
const AJAX_URL = "https://www.dtek-oem.com.ua/ua/ajax";

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

function getMeta(html, name) {
   const tags = html.match(/<meta\b[^>]*>/gi) || [];

   for (const tag of tags) {
      const nameMatch = tag.match(/\bname=["']([^"']+)["']/i);

      if (nameMatch?.[1] !== name) continue;

      const contentMatch = tag.match(/\bcontent=["']([^"']*)["']/i);

      return contentMatch?.[1] || null;
   }

   return null;
}

function jsonResponse(statusCode, data) {
   return {
      statusCode,
      headers: {
         "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(data, null, 2),
   };
}

exports.handler = async function (event) {
   try {
      if (event.httpMethod !== "POST") {
         return jsonResponse(405, {
            success: false,
            error: "Используй POST-запрос",
         });
      }

      const body = JSON.parse(event.body || "{}");

      const city = String(body.city || "").trim();
      const street = String(body.street || "").trim();
      const house = String(body.house || "").trim();

      if (!city || !street || !house) {
         return jsonResponse(400, {
            success: false,
            error: "Необходимо указать city, street и house",
         });
      }

      const pageResponse = await fetch(PAGE_URL, {
         headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "uk-UA,uk;q=0.9",
         },
      });

      if (!pageResponse.ok) {
         throw new Error(`ДТЭК вернул HTTP ${pageResponse.status}`);
      }

      const html = await pageResponse.text();

      const streets = extractObject(html, "streets");
      const preset = extractObject(html, "preset");
      const fact = extractObject(html, "fact");

      if (!streets[city]) {
         return jsonResponse(404, {
            success: false,
            error: "Населённый пункт не найден",
            city,
         });
      }

      if (!streets[city].includes(street)) {
         return jsonResponse(404, {
            success: false,
            error: "Улица не найдена в выбранном населённом пункте",
            city,
            street,
            availableStreets: streets[city],
         });
      }

      const csrfToken = getMeta(html, "csrf-token");
      const csrfParam = getMeta(html, "csrf-param");

      if (!csrfToken || !csrfParam) {
         throw new Error("Не удалось получить CSRF-токен ДТЭК");
      }

      let setCookies = [];

      if (typeof pageResponse.headers.getSetCookie === "function") {
         setCookies = pageResponse.headers.getSetCookie();
      } else {
         const cookieHeader = pageResponse.headers.get("set-cookie");

         if (cookieHeader) {
            setCookies = [cookieHeader];
         }
      }

      const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");

      const params = new URLSearchParams();

      params.set("method", "getHomeNum");

      const fields = [
         ["city", city],
         ["street", street],
         ["house_num", house],
         ["updateFact", fact.update],
      ];

      fields.forEach(([name, value], index) => {
         params.set(`data[${index}][name]`, name);
         params.set(`data[${index}][value]`, value);
      });

      params.set(csrfParam, csrfToken);

      const ajaxResponse = await fetch(AJAX_URL, {
         method: "POST",
         headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": csrfToken,
            Referer: PAGE_URL,
            Origin: "https://www.dtek-oem.com.ua",
            Cookie: cookie,
         },
         body: params.toString(),
      });

      const raw = await ajaxResponse.text();

      let result;

      try {
         result = JSON.parse(raw);
      } catch {
         throw new Error(`Ответ ДТЭК не является JSON. HTTP ${ajaxResponse.status}: ${raw.slice(0, 300)}`);
      }

      if (!ajaxResponse.ok || !result.result) {
         throw new Error("ДТЭК не смог определить очередь для этого адреса");
      }

      const houseData = result.data?.[house];

      if (!houseData) {
         return jsonResponse(404, {
            success: false,
            error: "Номер дома не найден",
            city,
            street,
            house,
         });
      }

      const reasons = Array.isArray(houseData.sub_type_reason) ? houseData.sub_type_reason : [houseData.sub_type_reason];

      const queue = reasons.find((value) => typeof value === "string" && /^GPV\d+\.\d+$/.test(value));

      if (!queue) {
         return jsonResponse(404, {
            success: false,
            error: "Для этого дома не удалось определить очередь",
            address: { city, street, house },
            houseData,
         });
      }

      const factDate = String(fact.today);
      const factSchedule = fact.data?.[factDate]?.[queue] || null;
      const presetSchedule = preset.data?.[queue] || null;

      if (!presetSchedule && !factSchedule) {
         throw new Error(`Расписание очереди ${queue} не найдено`);
      }

      return jsonResponse(200, {
         success: true,

         address: {
            city,
            street,
            house,
         },

         queue: {
            code: queue,
            name: preset.sch_names?.[queue] || queue,
         },

         updates: {
            fact: fact.update,
            preset: preset.updateFact,
         },

         fact: {
            date: fact.today,
            schedule: factSchedule,
         },

         preset: {
            days: preset.days,
            schedule: presetSchedule,
         },

         timeZone: preset.time_zone,
         timeType: preset.time_type,
      });
   } catch (error) {
      return jsonResponse(500, {
         success: false,
         error: error.message,
      });
   }
};
