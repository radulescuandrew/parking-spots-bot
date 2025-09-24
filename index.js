// index.js
const postmark = require("postmark");

// ---- CONFIG ----
const URL =
  "https://parcari3.ro:8443/parcari/api/Parking/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=PS3:v_123_cad_loc_parcare_arie&geometryName=geometry&outputFormat=application/json&srsname=EPSG:3844&bbox=590355.5353482877,324499.2637742758,590454.5536491674,324582.69862268283,EPSG:3844";

// Postmark API key & email addresses (from env)
const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN;
const MAIL_FROM = process.env.MAIL_FROM || "andrew.radulescu@wearetribus.com";
const MAIL_TO =
  process.env.MAIL_TO ||
  "andrew.radulescu@wearetribus.com, andreeamaria10p@gmail.com, toni.radulescu@wearetribus.com";

// ---- FLAGS ----
const isHeartbeat = process.argv.includes("--heartbeat");

// ---- HELPERS ----
async function sendMail({ subject, htmlBody, textBody }) {
  const client = new postmark.ServerClient(POSTMARK_TOKEN);
  await client.sendEmail({
    From: MAIL_FROM,
    To: MAIL_TO,
    Subject: subject,
    HtmlBody: htmlBody,
    TextBody: textBody,
    MessageStream: "outbound",
  });
  console.log("📧 Email trimis prin Postmark!");
}

// ---- MAIN ----
(async () => {
  try {
    const res = await fetch(URL, {
      headers: { Accept: "application/json" },
    });
    const text = await res.text();

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      await sendMail({
        subject: "🅿️ EROARE: răspuns invalid de la API-ul de parcări",
        htmlBody: `<p>Nu am putut parsa răspunsul de la API.</p><pre>${text.slice(
          0,
          500
        )}</pre>`,
        textBody: "Nu am putut parsa răspunsul de la API. Vezi logurile.",
      });
      throw err;
    }

    if (!payload?.features) {
      await sendMail({
        subject: "🅿️ EROARE: lipsesc datele din răspunsul API parcări",
        htmlBody: `<p>Răspunsul nu conține câmpul <code>features</code>.</p>`,
        textBody: "Răspunsul nu conține câmpul features.",
      });
      throw new Error("Response does not contain features array");
    }

    const features = payload.features;

    // Filtru cod_parcare === "9020"
    const f9020 = features.filter(
      (f) => f?.properties?.cod_parcare === "9020"
    );

    // Caută locuri libere (ocupat === 0)
    const free = f9020.filter((f) => Number(f?.properties?.ocupat) === 0);

    console.log(
      `Am găsit ${f9020.length} cu cod_parcare=9020, libere: ${free.length}`
    );

    if (free.length > 0 || isHeartbeat) {
      const htmlRows =
        free.length > 0
          ? free
              .map(
                (f) => `
            <tr>
              <td>${f.properties?.id}</td>
              <td>${f.properties?.nr_loc_parcare}</td>
              <td>${f.properties?.ocupat}</td>
            </tr>`
              )
              .join("")
          : "<tr><td colspan='3'>Niciun loc liber</td></tr>";

      const htmlBody = `
        <h2>${
          isHeartbeat
            ? "Raport săptămânal (heartbeat)"
            : "Locuri de parcare libere (cod_parcare=9020)"
        }</h2>
        <p>Verificat la: ${new Date().toLocaleString("ro-RO")}</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead><tr><th>ID</th><th>Nr Loc</th><th>Ocupat</th></tr></thead>
          <tbody>${htmlRows}</tbody>
        </table>
      `;

      const textBody =
        free.length > 0
          ? free
              .map(
                (f) =>
                  `id=${f.properties?.id}, nr_loc=${f.properties?.nr_loc_parcare}, ocupat=${f.properties?.ocupat}`
              )
              .join("\n")
          : "Niciun loc liber la acest moment.";

      const subject = isHeartbeat
        ? "🅿️ Raport săptămânal: scriptul de parcare funcționează"
        : `🅿️ ATENȚIE: LOC DE PARCARE LIBER ÎN VITAN (9020): ${free.length}`;

      await sendMail({ subject, htmlBody, textBody });
    } else {
      console.log("Niciun loc liber → nu trimit email.");
    }
  } catch (err) {
    console.error("EROARE:", err.message || err);

    // Trimite email de eroare
    try {
      await sendMail({
        subject: "🅿️ EROARE: scriptul de parcare a eșuat",
        htmlBody: `<p>A apărut o eroare în timpul execuției scriptului:</p><pre>${err.stack}</pre>`,
        textBody: `A apărut o eroare: ${err.message}`,
      });
    } catch (e) {
      console.error("Nu am putut trimite emailul de eroare:", e.message);
    }

    process.exit(1);
  }
})();
