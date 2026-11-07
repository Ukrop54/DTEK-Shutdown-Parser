const DTEK_CONFIG = {
   city: "с-ще Мигаєве",
   street: "вул. Молодіжна",
   house: "2",
   updateInterval: 5 * 60 * 1000,
};

if (window.dtekScheduleInterval) {
   clearInterval(window.dtekScheduleInterval);
}

const statusNames = {
   yes: "🟢 Свет есть",
   no: "🔴 Света нет",
   first: "🟠 Отключение первые 30 минут",
   second: "🟠 Отключение вторые 30 минут",
   maybe: "🟡 Возможно отключение",
   mfirst: "🟡 Возможно отключение первые 30 минут",
   msecond: "🟡 Возможно отключение вторые 30 минут",
};

async function updateDtekSchedule() {
   console.log("Получаю актуальные данные ДТЭК...");

   try {
      const response = await fetch("/.netlify/functions/get-schedule", {
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

      const weekday = new Intl.DateTimeFormat("uk-UA", {
         timeZone: "Europe/Kyiv",
         weekday: "long",
      }).format(date);

      console.clear();

      console.group("⚡ АКТУАЛЬНОЕ РАСПИСАНИЕ ДТЭК");

      console.log("Адрес:", `${data.address.city}, ${data.address.street}, ${data.address.house}`);

      console.log("Очередь:", data.queue.name);
      console.log("Дата:", formattedDate);
      console.log("День недели:", weekday);
      console.log("Обновление ДТЭК:", data.updates.fact);

      const rows = [];

      for (let hour = 1; hour <= 24; hour++) {
         const key = String(hour);
         const status = data.fact.schedule?.[key];

         rows.push({
            Час: data.timeZone?.[key]?.[0] || key,
            Время: data.timeZone?.[key] ? `${data.timeZone[key][1]}–${data.timeZone[key][2]}` : "",
            Статус: statusNames[status] || status || "Нет данных",
         });
      }

      console.group("📅 Фактическое расписание на сегодня");
      console.table(rows);
      console.groupEnd();

      console.log("Следующее обновление через 5 минут.");
      console.groupEnd();
   } catch (error) {
      console.error("Ошибка получения расписания:", error);
   }
}

updateDtekSchedule();

window.dtekScheduleInterval = setInterval(updateDtekSchedule, DTEK_CONFIG.updateInterval);
