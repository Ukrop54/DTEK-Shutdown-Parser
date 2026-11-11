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
   yes: "Есть",
   no: "Нет",
   first: "Нет первые 30 минут",
   second: "Нет вторые 30 минут",
   maybe: "Возможно отключение",
   mfirst: "Возможно отключение первые 30 минут",
   msecond: "Возможно отключение вторые 30 минут",
};

async function updateDtekSchedule() {
   // console.log("Получаю актуальные данные ДТЭК...");

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
      // console.log(data);

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

      // console.clear();

      // console.log("Адрес:", `${data.address.city}, ${data.address.street}, ${data.address.house}`);

      // console.log("Очередь:", data.queue.name);
      // console.log("Дата:", formattedDate);
      // console.log("День недели:", weekday);
      // console.log("Обновление ДТЭК:", data.updates.fact);

      const rows = [];
      const outageIntervals = [];

      let contno = 0;

      function timeToMinutes(time) {
         const [hours, minutes] = time.split(":").map(Number);
         return hours * 60 + minutes;
      }

      function minutesToTime(minutes) {
         const hours = Math.floor(minutes / 60);
         const mins = minutes % 60;

         return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      }

      for (let hour = 1; hour <= 24; hour++) {
         const key = String(hour);
         const status = data.fact.schedule?.[key];

         const time = data.timeZone?.[key];

         const start = timeToMinutes(time[1]);
         const end = start + 60;

         if (status === "no") {
            outageIntervals.push({
               start,
               end,
            });
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
            Время: `${time[1]}–${time[2]}`,
            Статус: statusNames[status] || status || "Нет данных",
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

      for (const period of outagePeriods) {
         contno += (period.end - period.start) / 60;
      }

      // console.log("Расписание на сегодня:");
      // console.table(rows);

      console.group(`Статус отключений на ${weekday}, ${formattedDate}`);
      console.log(`Всего без света: ${Math.floor(contno)} ч. ${Math.round((contno % 1) * 60)} мин.`);
      console.log("Периоды отключений:");

      for (const period of outagePeriods) {
         const duration = period.end - period.start;

         const hours = Math.floor(duration / 60);
         const minutes = duration % 60;

         console.log(
            `${minutesToTime(period.start)}–${minutesToTime(period.end)} | ` + `${hours ? hours + " ч. " : ""}${minutes ? minutes + " мин." : ""}`
         );
      }

      console.groupEnd();

      console.group(
         `График на ${weekday}, ${formattedDate} по адресу ${data.address.city}, ${data.address.street}, ${data.address.house} (${data.queue.name})`
      );
      console.table(rows);
      console.log(`Последнее обновление: ${data.updates.fact}`);
      console.groupEnd();
   } catch (error) {
      console.error("Ошибка получения расписания:", error);
   }
}

updateDtekSchedule();

window.dtekScheduleInterval = setInterval(updateDtekSchedule, DTEK_CONFIG.updateInterval);
