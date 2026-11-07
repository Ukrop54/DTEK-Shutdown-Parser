// function extractObject(html, variableName) {
//    const marker = `DisconSchedule.${variableName}`;
//    const markerPosition = html.indexOf(marker);

//    if (markerPosition === -1) {
//       throw new Error(`Не найден объект ${marker}`);
//    }

//    const equalPosition = html.indexOf("=", markerPosition);
//    const startPosition = html.indexOf("{", equalPosition);

//    if (equalPosition === -1 || startPosition === -1) {
//       throw new Error(`Некорректное присваивание ${marker}`);
//    }

//    let depth = 0;
//    let inString = false;
//    let escaped = false;

//    for (let i = startPosition; i < html.length; i++) {
//       const char = html[i];

//       if (inString) {
//          if (escaped) {
//             escaped = false;
//          } else if (char === "\\") {
//             escaped = true;
//          } else if (char === '"') {
//             inString = false;
//          }

//          continue;
//       }

//       if (char === '"') {
//          inString = true;
//       } else if (char === "{") {
//          depth++;
//       } else if (char === "}") {
//          depth--;

//          if (depth === 0) {
//             return JSON.parse(html.slice(startPosition, i + 1));
//          }
//       }
//    }

//    throw new Error(`Не удалось извлечь ${marker}`);
// }

// exports.handler = async function () {
//    try {
//       const response = await fetch("https://www.dtek-oem.com.ua/ua/shutdowns", {
//          headers: {
//             "User-Agent": "Mozilla/5.0",
//             "Accept-Language": "uk-UA,uk;q=0.9",
//          },
//       });

//       if (!response.ok) {
//          throw new Error(`ДТЭК вернул HTTP ${response.status}`);
//       }

//       const html = await response.text();

//       const streets = extractObject(html, "streets");
//       const preset = extractObject(html, "preset");
//       const fact = extractObject(html, "fact");

//       return {
//          statusCode: 200,
//          headers: {
//             "Content-Type": "application/json; charset=utf-8",
//          },
//          body: JSON.stringify(
//             {
//                success: true,

//                streets: {
//                   citiesCount: Object.keys(streets).length,
//                   hasMihayeve: !!streets["с-ще Мигаєве"],
//                   streets: streets["с-ще Мигаєве"] || [],
//                },

//                preset: {
//                   days: preset.days,
//                   queueNames: Object.keys(preset.sch_names),
//                   hasGPV51: !!preset.data["GPV5.1"],
//                   mondayGPV51: preset.data["GPV5.1"]?.["1"],
//                },

//                fact: {
//                   update: fact.update,
//                   date: fact.today,
//                   queues: Object.keys(fact.data[String(fact.today)] || {}),
//                   GPV51: fact.data[String(fact.today)]?.["GPV5.1"],
//                },
//             },
//             null,
//             2
//          ),
//       };
//    } catch (error) {
//       return {
//          statusCode: 500,
//          headers: {
//             "Content-Type": "application/json; charset=utf-8",
//          },
//          body: JSON.stringify({
//             success: false,
//             error: error.message,
//          }),
//       };
//    }
// };

exports.handler = async function () {
   const pageUrl = "https://www.dtek-oem.com.ua/ua/shutdowns";
   const ajaxUrl = "https://www.dtek-oem.com.ua/ua/ajax";

   try {
      // 1. Получаем страницу и сессионные cookies
      const pageResponse = await fetch(pageUrl, {
         headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "uk-UA,uk;q=0.9",
         },
      });

      const html = await pageResponse.text();

      // 2. Извлекаем CSRF-параметры из meta-тегов
      function getMeta(name) {
         const regex = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, "i");

         return html.match(regex)?.[1] || null;
      }

      const csrfToken = getMeta("csrf-token");
      const csrfParam = getMeta("csrf-param");

      // 3. Получаем cookies
      let setCookies = [];

      if (typeof pageResponse.headers.getSetCookie === "function") {
         setCookies = pageResponse.headers.getSetCookie();
      } else {
         const cookieHeader = pageResponse.headers.get("set-cookie");
         if (cookieHeader) setCookies = [cookieHeader];
      }

      const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");

      // 4. Формируем AJAX-запрос
      const params = new URLSearchParams();

      params.set("method", "getHomeNum");

      const fields = [
         ["city", "с-ще Мигаєве"],
         ["street", "вул. Молодіжна"],
         ["house_num", "2"],
         ["updateFact", "07.11.2026 15:39"],
      ];

      fields.forEach(([name, value], index) => {
         params.set(`data[${index}][name]`, name);
         params.set(`data[${index}][value]`, value);
      });

      // Передаём CSRF-токен, если он найден
      if (csrfToken && csrfParam) {
         params.set(csrfParam, csrfToken);
      }

      // 5. Отправляем запрос
      const response = await fetch(ajaxUrl, {
         method: "POST",
         headers: {
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": csrfToken || "",
            Referer: pageUrl,
            Origin: "https://www.dtek-oem.com.ua",
            Cookie: cookie,
         },
         body: params.toString(),
      });

      const raw = await response.text();

      let data = null;

      try {
         data = JSON.parse(raw);
      } catch {}

      return {
         statusCode: 200,
         headers: {
            "Content-Type": "application/json; charset=utf-8",
         },
         body: JSON.stringify(
            {
               pageStatus: pageResponse.status,
               csrf: {
                  found: !!csrfToken,
                  param: csrfParam,
                  tokenLength: csrfToken?.length || 0,
               },
               cookies: setCookies.map((c) => c.split(";")[0].split("=")[0]),
               ajaxStatus: response.status,
               responseIsJson: data !== null,
               data,
               rawPreview: data === null ? raw.slice(0, 2000) : undefined,
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
