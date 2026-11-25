function esc(text) {
   return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const DTEK_CONFIG = {
   city: "с-ще Мигаєве",
   street: "вул. Молодіжна",
   house: "2",
   updateInterval: 5 * 60 * 1000,
};

const statusNames = {
   yes: "Есть",
   no: "Нет",
   first: "Нет первые 30 минут",
   second: "Нет вторые 30 минут",
   maybe: "Возможно отключение",
   mfirst: "Возможно отключение первые 30 минут",
   msecond: "Возможно отключение вторые 30 минут",
};

async function updateDtekSchedule() {
   const response = await fetch("https://dtek-tgparser.netlify.app/.netlify/functions/get-schedule", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify({
         city: DTEK_CONFIG.city,
         street: DTEK_CONFIG.street,
         house: DTEK_CONFIG.house,
      }),
   });

   const data = await response.json();

   if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}`);
   }

   const date = new Date(data.fact.date * 1000);

   const formattedDate = new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
   }).format(date);

   const weekday = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Kyiv",
      weekday: "long",
   }).format(date);

   const now = new Date();

   const curr = {
      hour: Number(
         new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Kyiv",
            hour: "2-digit",
            hourCycle: "h23",
         }).format(now)
      ),

      minute: Number(
         new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Kyiv",
            minute: "2-digit",
         }).format(now)
      ),
   };

   const currentMinutes = curr.hour * 60 + curr.minute;

   const currstatusraw = data.fact.schedule?.[String(curr.hour + 1)];

   let currstatus = "";

   function timeToMinutes(time) {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
   }

   function minutesToTime(minutes) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
   }

   const rows = [];
   const outageIntervals = [];

   for (let hour = 1; hour <= 24; hour++) {
      const key = String(hour);

      const status = data.fact.schedule?.[key];
      const time = data.timeZone?.[key];

      if (!time) continue;

      const start = timeToMinutes(time[1]);
      const end = start + 60;

      if (status === "no") {
         outageIntervals.push({ start, end });
      } else if (status === "first") {
         outageIntervals.push({
            start,
            end: start + 30,
         });
      } else if (status === "second") {
         outageIntervals.push({
            start: start + 30,
            end,
         });
      }

      rows.push({
         time: `${time[1]}–${time[2]}`,
         status: statusNames[status] || status || "Нет данных",
      });
   }

   const outagePeriods = [];

   for (const interval of outageIntervals) {
      const lastPeriod = outagePeriods[outagePeriods.length - 1];

      if (lastPeriod && lastPeriod.end === interval.start) {
         lastPeriod.end = interval.end;
      } else {
         outagePeriods.push({
            start: interval.start,
            end: interval.end,
         });
      }
   }

   let totalMinutes = 0;

   for (const period of outagePeriods) {
      totalMinutes += period.end - period.start;
   }

   const hours = Math.floor(totalMinutes / 60);
   const minutes = totalMinutes % 60;

   function hmformatting(a) {
      const h = Math.floor(a / 60);
      const m = a % 60;
      return { h, m };
   }

   function hmTextFormat(h, m) {
      const parts = [];

      if (h) parts.push(`${h} ч.`);
      if (m) parts.push(`${m} мин.`);

      return parts.join(" ") || "меньше минуты";
   }

   const nextsdPeriod = outagePeriods.find((period) => period.start > currentMinutes);

   let nextorcurrent = "Следующего отключения не ожидается";
   const currperiod = outagePeriods.find((period) => currentMinutes >= period.start && currentMinutes < period.end);

   if (currperiod) {
      const currSDduration = currentMinutes - currperiod.start;
      const { h, m } = hmformatting(currSDduration);
      nextorcurrent = `Света нет на протяжении: <b>${hmTextFormat(h, m)}</b>`;
   } else if (nextsdPeriod) {
      const waitm = nextsdPeriod.start - currentMinutes;
      const { h, m } = hmformatting(waitm);

      nextorcurrent = `Следующее отключение через: <b>${hmTextFormat(h, m)}</b>`;
   }

   let periodsText = "";

   if (outagePeriods.length === 0) {
      periodsText = "Отключений не запланировано.";
   } else {
      periodsText = outagePeriods
         .map((period) => {
            const duration = period.end - period.start;
            const { h, m } = hmformatting(duration);

            let periodText = `${minutesToTime(period.start)}–${minutesToTime(period.end)} | ${hmTextFormat(h, m)}`;

            if (currentMinutes < period.start) {
               const waitm = period.start - currentMinutes;
               const { h: wh, m: wm } = hmformatting(waitm);

               periodText += ` (через ${hmTextFormat(wh, wm)})`;
            }

            if (currentMinutes >= period.start && currentMinutes < period.end) {
               return `<b>${periodText}</b>`;
            } else if (currentMinutes >= period.end) {
               return `<s>${periodText}</s>`;
            }

            return periodText;
         })
         .join("\n");
   }

   if (currstatusraw === "first") {
      currstatus = curr.minute < 30 ? "нет" : "есть";
   } else if (currstatusraw === "second") {
      currstatus = curr.minute < 30 ? "есть" : "нет";
   } else {
      currstatus = statusNames[currstatusraw].toLowerCase();
   }

   const cacheWarning = data._cache?.stale ? `\n\nПоследнее обновление кэша: ${Math.round(data._cache.ageMs / 60000)} мин. назад` : "";

   const statusText =
      `Статус отключений на ${weekday}, ${formattedDate}\n\n` +
      `Сейчас свет <b>${currstatus}</b>\n` +
      nextorcurrent +
      `\nВсего без света: <b>${hours} ч. ${minutes} мин.</b>\n\n` +
      `Отключения:\n${periodsText}\n\n` +
      `Последнее обновление: ${esc(data.updates.fact)}` +
      cacheWarning;

   const scheduleText =
      `График на ${weekday}, ${formattedDate}\n` +
      `Адрес: ${esc(data.address.city)}, ${esc(data.address.street)}, ${esc(data.address.house)}\n` +
      `(${esc(data.queue.name)})\n\n` +
      // rows.map((row) => `${row.time} — ${row.status}`).join("\n") +
      rows
         .map((row) => {
            const [start, end] = row.time.split("–").map((t) => t.trim());

            // const toMinutes = (time) => {
            //    const [h, m] = time.split(":").map(Number);
            //    return h * 60 + m;
            // };

            const startMinutes = timeToMinutes(start);
            const endMinutes = end === "00:00" ? 1440 : timeToMinutes(end);

            let formattedTime = row.time;

            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
               formattedTime = `<b>${row.time}</b>`;
            } else if (currentMinutes >= endMinutes) {
               formattedTime = `<s>${row.time}</s>`;
            }

            return `${formattedTime} — ${row.status}`;
         })
         .join("\n") +
      `\n\nПоследнее обновление: ${esc(data.updates.fact)}` +
      cacheWarning;

   return {
      statusText,
      scheduleText,
   };
}

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
      console.error("Telegram API error:", result.description);

      if (result.description?.includes("can't parse entities")) {
         const text = data.text || "";

         console.error("Message length:", text.length);

         console.error("HTML tags found:", text.match(/<\/?[a-z][^>]*>/gi));
      }

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
         } else if (text === "Статус отключений" || text === "Полный график") {
            try {
               const schedule = await updateDtekSchedule();

               const replyText = text === "Статус отключений" ? schedule.statusText : schedule.scheduleText;

               await telegramRequest(BOT_TOKEN, "sendMessage", {
                  chat_id: chatId,
                  text: replyText,
                  parse_mode: "HTML",
               });
            } catch (error) {
               console.error("Ошибка получения расписания:", error);

               await telegramRequest(BOT_TOKEN, "sendMessage", {
                  chat_id: chatId,
                  text: `Ошибка. Беда с дтеком чи с данными. Повторись позже`,
               });
            }
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
